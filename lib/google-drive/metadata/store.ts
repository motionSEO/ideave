import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DRIVE_METADATA_STORE_VERSION,
  type DriveImageMetadataRecord,
  type DriveImageMetadataStore,
} from "@/lib/google-drive/metadata/types";

export const DRIVE_METADATA_STORE_PATH = path.join(
  process.cwd(),
  "data",
  "google-drive",
  "image-metadata.json",
);

export function emptyMetadataStore(): DriveImageMetadataStore {
  return {
    version: DRIVE_METADATA_STORE_VERSION,
    updatedAt: null,
    images: {},
  };
}

export async function loadDriveMetadataStore(): Promise<DriveImageMetadataStore> {
  try {
    const raw = await readFile(DRIVE_METADATA_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as DriveImageMetadataStore;
    if (!parsed || typeof parsed !== "object" || !parsed.images || typeof parsed.images !== "object") {
      return emptyMetadataStore();
    }
    return {
      version: DRIVE_METADATA_STORE_VERSION,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      images: parsed.images,
    };
  } catch {
    return emptyMetadataStore();
  }
}

export async function saveDriveMetadataStore(store: DriveImageMetadataStore): Promise<void> {
  await mkdir(path.dirname(DRIVE_METADATA_STORE_PATH), { recursive: true });
  const payload: DriveImageMetadataStore = {
    ...store,
    version: DRIVE_METADATA_STORE_VERSION,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(DRIVE_METADATA_STORE_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function getMetadataByFileId(
  store: DriveImageMetadataStore,
  fileId: string,
): DriveImageMetadataRecord | undefined {
  return store.images[fileId];
}
