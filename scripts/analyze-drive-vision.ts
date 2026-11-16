import { google } from "googleapis";
import { authorizeDriveServer } from "../lib/google-drive/auth";
import { flattenPersonalDbImages, loadPersonalDbSnapshot, type DriveImageRecord } from "../lib/google-drive/personalDb";
import { loadDriveMetadataStore, saveDriveMetadataStore } from "../lib/google-drive/metadata/store";
import { syncMetadataStoreWithDrive } from "../lib/google-drive/metadata/syncPipeline";
import { analyzeDriveImageWithVision, VisionQuotaError } from "../lib/google-drive/metadata/visionAnalyzer";

// 사용법: npm run drive:vision -- [--limit 20] [--concurrency 4] [--all]
//   기본: pending/stale 이미지만 분석. --all 이면 ready 이미지도 다시 분석.
const args = process.argv.slice(2);
function readNumberArg(name: string, fallback: number): number {
  const index = args.indexOf(name);
  const value = index >= 0 ? Number(args[index + 1]) : NaN;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
const LIMIT = readNumberArg("--limit", Number.POSITIVE_INFINITY);
const CONCURRENCY = readNumberArg("--concurrency", 4);
const REANALYZE_ALL = args.includes("--all");
const SAVE_EVERY = 10;
// Gemini에는 중간 크기 썸네일이면 충분하다(원본은 수 MB라 느리고 토큰만 늘어남).
const THUMB_SIZE = 768;
const MAX_ORIGINAL_BYTES = 8 * 1024 * 1024;

async function loadImageBytes(
  drive: ReturnType<typeof google.drive>,
  accessToken: string,
  image: DriveImageRecord,
): Promise<{ bytes: Buffer; mimeType: string }> {
  if (image.thumbnailLink) {
    try {
      const url = new URL(image.thumbnailLink.replace(/=s\d+(-[a-z0-9-]+)?$/i, `=s${THUMB_SIZE}`));
      if (url.protocol === "https:" && url.hostname.endsWith(".googleusercontent.com")) {
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(15_000),
        });
        const contentType = response.headers.get("content-type") ?? "";
        if (response.ok && contentType.startsWith("image/")) {
          return { bytes: Buffer.from(await response.arrayBuffer()), mimeType: contentType };
        }
      }
    } catch {
      // 썸네일 링크 만료 등 → 원본으로 대체
    }
  }

  const media = await drive.files.get(
    { fileId: image.id, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" },
  );
  const bytes = Buffer.from(media.data as ArrayBuffer);
  if (bytes.byteLength > MAX_ORIGINAL_BYTES) {
    throw new Error(`original too large (${Math.round(bytes.byteLength / 1024 / 1024)}MB) and no thumbnail`);
  }
  return { bytes, mimeType: image.mimeType };
}

async function main() {
  const auth = await authorizeDriveServer();
  const drive = google.drive({ version: "v3", auth });
  const snapshot = await loadPersonalDbSnapshot(auth);
  const driveImages = flattenPersonalDbImages(snapshot);
  const { store } = syncMetadataStoreWithDrive(await loadDriveMetadataStore(), driveImages);

  const queue = driveImages
    .filter((image) => REANALYZE_ALL || store.images[image.id]?.status !== "ready")
    .slice(0, LIMIT);

  console.log(`Drive images: ${driveImages.length}, to analyze: ${queue.length} (concurrency ${CONCURRENCY})`);

  let done = 0;
  let failed = 0;
  let sinceSave = 0;
  let quotaHit = false;
  let cursor = 0;

  async function worker() {
    while (!quotaHit && cursor < queue.length) {
      const image = queue[cursor++]!;
      try {
        const accessToken = (await auth.getAccessToken()).token ?? "";
        const { bytes, mimeType } = await loadImageBytes(drive, accessToken, image);
        const fields = await analyzeDriveImageWithVision({
          fileId: image.id,
          fileName: image.name,
          category: image.category,
          mimeType,
          imageBytes: bytes,
        });
        store.images[image.id] = {
          ...store.images[image.id]!,
          ...fields,
          analyzedAt: new Date().toISOString(),
          status: "ready",
        };
        done += 1;
        console.log(`[${done + failed}/${queue.length}] ${image.category}/${image.name}: ${[...fields.style, ...fields.designKeywords].slice(0, 4).join(", ")}`);
      } catch (error) {
        if (error instanceof VisionQuotaError) {
          quotaHit = true;
          console.error("Gemini quota exceeded. Stopping; progress so far is saved. Run again later to continue.");
          return;
        }
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[${done + failed}/${queue.length}] FAILED ${image.category}/${image.name}: ${message}`);
      }

      sinceSave += 1;
      if (sinceSave >= SAVE_EVERY) {
        sinceSave = 0;
        await saveDriveMetadataStore(store);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker()));
  await saveDriveMetadataStore(store);

  const ready = Object.values(store.images).filter((record) => record.status === "ready").length;
  console.log("");
  console.log(`analyzed: ${done}, failed: ${failed}, ready total: ${ready}/${driveImages.length}`);
  console.log("Store: data/google-drive/image-metadata.json");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
