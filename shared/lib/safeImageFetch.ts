import { Readable } from "node:stream";
import { google } from "googleapis";
import { authorizeDriveServer } from "@/lib/google-drive/auth";
import { flattenPersonalDbImages } from "@/lib/google-drive/personalDb";
import { getCachedPersonalDbSnapshot, isAllowedDriveFileId } from "@/lib/google-drive/serverCache";
import { getServerEnv } from "@/shared/lib/serverEnv";

/**
 * 서버가 대신 내려받는 이미지 URL(SSRF 방어).
 *
 * 허용 대상
 * - `/api/drive/file/{id}` : 자체 HTTP 호출 없이 Drive API로 직접 읽는다. 개인 DB 스냅샷에 있는 id만 허용.
 * - `https://images.unsplash.com/...`, `https://plus.unsplash.com/...`
 * - `https://<SUPABASE_URL 호스트>/storage/v1/object/public/...`
 *
 * 그 외 호스트, http, 사용자 정보·포트가 붙은 URL, 리다이렉트는 모두 거부한다.
 */

const UNSPLASH_IMAGE_HOSTS = new Set(["images.unsplash.com", "plus.unsplash.com"]);
const SUPABASE_PUBLIC_STORAGE_PREFIX = "/storage/v1/object/public/";
const DRIVE_FILE_PATH_RE = /^\/api\/drive\/file\/([^/?#]+)$/;

export const DEFAULT_IMAGE_FETCH_TIMEOUT_MS = 8000;

export class UnsafeImageUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeImageUrlError";
  }
}

export type AllowedImageTarget =
  | { kind: "drive"; fileId: string }
  | { kind: "remote"; url: URL };

function supabaseHostname(): string | null {
  const raw = getServerEnv("SUPABASE_URL");
  if (!raw) {
    return null;
  }
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function resolveDrivePath(raw: string): AllowedImageTarget | null {
  const match = DRIVE_FILE_PATH_RE.exec(raw);
  if (!match?.[1]) {
    return null;
  }
  let fileId: string;
  try {
    fileId = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return isAllowedDriveFileId(fileId) ? { kind: "drive", fileId } : null;
}

/** 허용 목록에 맞으면 대상 정보를, 아니면 null 을 반환한다. 네트워크 호출 없음. */
export function resolveAllowedImageTarget(rawUrl: string): AllowedImageTarget | null {
  const raw = rawUrl.trim();
  if (!raw) {
    return null;
  }

  if (raw.startsWith("/")) {
    // "//evil.com" 같은 프로토콜 상대 URL은 DRIVE_FILE_PATH_RE 에 걸리지 않는다.
    return resolveDrivePath(raw);
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  if (UNSPLASH_IMAGE_HOSTS.has(hostname)) {
    return { kind: "remote", url };
  }

  const supabaseHost = supabaseHostname();
  if (
    supabaseHost &&
    hostname === supabaseHost &&
    url.pathname.startsWith(SUPABASE_PUBLIC_STORAGE_PREFIX) &&
    !url.pathname.includes("/../")
  ) {
    return { kind: "remote", url };
  }

  return null;
}

async function readWebStreamWithLimit(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<Buffer> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        throw new UnsafeImageUrlError(`image exceeds ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
    void body.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks);
}

async function readNodeStreamWithLimit(stream: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buffer.length;
    if (total > maxBytes) {
      stream.destroy();
      throw new UnsafeImageUrlError(`image exceeds ${maxBytes} bytes`);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function fetchDriveImage(
  fileId: string,
  maxBytes: number,
): Promise<{ bytes: Buffer; mimeType: string }> {
  const snapshot = await getCachedPersonalDbSnapshot();
  const record = flattenPersonalDbImages(snapshot).find((image) => image.id === fileId);
  if (!record) {
    throw new UnsafeImageUrlError("drive file is not part of the personal DB");
  }

  const auth = await authorizeDriveServer();
  const drive = google.drive({ version: "v3", auth });
  const media = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "stream" },
  );
  const bytes = await readNodeStreamWithLimit(media.data as Readable, maxBytes);
  return { bytes, mimeType: record.mimeType };
}

async function fetchRemoteImage(
  url: URL,
  maxBytes: number,
  timeoutMs: number,
): Promise<{ bytes: Buffer; mimeType: string }> {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download image (${response.status}): ${url.toString()}`);
  }

  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!mimeType.startsWith("image/")) {
    void response.body.cancel().catch(() => undefined);
    throw new UnsafeImageUrlError(`unexpected content-type: ${mimeType || "(none)"}`);
  }

  const declaredLength = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    void response.body.cancel().catch(() => undefined);
    throw new UnsafeImageUrlError(`image exceeds ${maxBytes} bytes`);
  }

  const bytes = await readWebStreamWithLimit(response.body, maxBytes);
  return { bytes, mimeType };
}

/**
 * 허용된 이미지 URL만 내려받는다. 허용되지 않으면 UnsafeImageUrlError.
 */
export async function fetchAllowedImage(
  rawUrl: string,
  options: { maxBytes: number; timeoutMs?: number },
): Promise<{ bytes: Buffer; mimeType: string }> {
  const target = resolveAllowedImageTarget(rawUrl);
  if (!target) {
    throw new UnsafeImageUrlError(`image URL is not allowed: ${rawUrl.slice(0, 200)}`);
  }
  if (target.kind === "drive") {
    return fetchDriveImage(target.fileId, options.maxBytes);
  }
  return fetchRemoteImage(
    target.url,
    options.maxBytes,
    options.timeoutMs ?? DEFAULT_IMAGE_FETCH_TIMEOUT_MS,
  );
}
