import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { authorizeDriveServer } from "@/lib/google-drive/auth";
import { loadPersonalDbSnapshot, type PersonalDbSnapshot } from "@/lib/google-drive/personalDb";

const MEMORY_TTL_MS = 10 * 60 * 1000;
const DISK_CACHE_PATH = path.join(process.cwd(), "data", "google-drive", "personal-db-snapshot.json");

type SnapshotCacheEntry = { at: number; snapshot: PersonalDbSnapshot };

let snapshotCache: SnapshotCacheEntry | null = null;
let snapshotInFlight: Promise<PersonalDbSnapshot> | null = null;

async function readDiskSnapshot(): Promise<SnapshotCacheEntry | null> {
  try {
    const raw = await readFile(DISK_CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw) as SnapshotCacheEntry;
    if (!parsed?.snapshot?.categories || !Array.isArray(parsed.snapshot.categories)) {
      return null;
    }
    if (typeof parsed.at !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeDiskSnapshot(entry: SnapshotCacheEntry) {
  try {
    await mkdir(path.dirname(DISK_CACHE_PATH), { recursive: true });
    await writeFile(DISK_CACHE_PATH, JSON.stringify(entry), "utf8");
  } catch (error) {
    console.warn("[IDEAVE] Failed to write Drive snapshot cache", error);
  }
}

async function refreshPersonalDbSnapshot(): Promise<PersonalDbSnapshot> {
  const auth = await authorizeDriveServer();
  const snapshot = await loadPersonalDbSnapshot(auth);
  const entry = { at: Date.now(), snapshot };
  snapshotCache = entry;
  void writeDiskSnapshot(entry);
  return snapshot;
}

function refreshInBackground() {
  if (snapshotInFlight) {
    return;
  }
  snapshotInFlight = refreshPersonalDbSnapshot()
    .catch((error: unknown) => {
      console.warn("[IDEAVE] Background Drive snapshot refresh failed", error);
      return snapshotCache?.snapshot ?? Promise.reject(error);
    })
    .finally(() => {
      snapshotInFlight = null;
    });
}

export async function getCachedPersonalDbSnapshot(): Promise<PersonalDbSnapshot> {
  const now = Date.now();
  if (snapshotCache && now - snapshotCache.at < MEMORY_TTL_MS) {
    return snapshotCache.snapshot;
  }

  if (snapshotCache) {
    refreshInBackground();
    return snapshotCache.snapshot;
  }

  if (snapshotInFlight) {
    return snapshotInFlight;
  }

  const disk = await readDiskSnapshot();
  if (disk) {
    snapshotCache = disk;
    if (now - disk.at >= MEMORY_TTL_MS) {
      refreshInBackground();
    }
    return disk.snapshot;
  }

  snapshotInFlight = refreshPersonalDbSnapshot().finally(() => {
    snapshotInFlight = null;
  });
  return snapshotInFlight;
}

export function invalidatePersonalDbSnapshotCache() {
  snapshotCache = null;
  snapshotInFlight = null;
}

export function driveFilePublicPath(fileId: string): string {
  return `/api/drive/file/${encodeURIComponent(fileId)}`;
}

export function isAllowedDriveFileId(fileId: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(fileId);
}
