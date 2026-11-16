import { computeFileSha256Hex } from "@/shared/lib/fileHash";
import { adminMethodNotAllowed, requireAdminRequest } from "@/shared/lib/adminAuth";
import {
  countImagesWithNullFileHash,
  deleteImageDbRow,
  deleteStorageObject,
  extractObjectPathFromImageUrl,
  fetchImageBytes,
  fetchImagesWithNullFileHash,
  findImageIdWithFileHash,
  getSupabaseImageAccess,
  isDuplicateHashDbError,
  updateImageFileHash,
  type SupabaseImageAccess,
} from "@/shared/lib/supabaseImages";

export const runtime = "nodejs";

const BATCH_SIZE = 50;

async function removeDuplicateRow(
  access: SupabaseImageAccess,
  row: { id: string; image_url: string },
  keeperId: string,
  deleteStorage: boolean,
): Promise<void> {
  await deleteImageDbRow(access.url, access.accessKey, row.id);

  if (!deleteStorage) {
    return;
  }

  const objectPath = extractObjectPathFromImageUrl(row.image_url, access.bucket);
  if (!objectPath) {
    return;
  }

  try {
    await deleteStorageObject(access.url, access.accessKey, access.bucket, objectPath);
  } catch (storageError) {
    console.warn(
      `[backfill-hash] Storage delete skipped for duplicate ${row.id} (keeper ${keeperId}):`,
      storageError,
    );
  }
}

/**
 * POST /api/backfill-hash  (x-backfill-secret 헤더 필수)
 *
 * `file_hash` 가 NULL 인 행에 SHA-256 해시를 채웁니다.
 * 동일 바이트(다른 URL) 중복이면 **나중 행을 DB에서 삭제**해 null 이 영원히 남지 않게 합니다.
 *
 * Query: `deleteStorage=1` — 중복 행 삭제 시 Storage 객체도 제거
 */
async function runBackfillHash(request: Request): Promise<Response> {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  const access = getSupabaseImageAccess();
  if (!access) {
    return Response.json(
      {
        error:
          "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (권장) 또는 SUPABASE_ANON_KEY 가 필요합니다.",
      },
      { status: 500 },
    );
  }

  const deleteStorage = new URL(request.url).searchParams.get("deleteStorage") === "1";

  let totalNullFileHash = 0;
  let rows: Awaited<ReturnType<typeof fetchImagesWithNullFileHash>>;

  try {
    [totalNullFileHash, rows] = await Promise.all([
      countImagesWithNullFileHash(access.url, access.accessKey),
      fetchImagesWithNullFileHash(access.url, access.accessKey, BATCH_SIZE),
    ]);
  } catch (error) {
    return Response.json(
      {
        error: "Failed to list images with null file_hash.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }

  if (rows.length === 0) {
    return Response.json({
      bucket: access.bucket,
      usingServiceRole: access.usingServiceRole,
      batchSize: BATCH_SIZE,
      totalNullFileHash: 0,
      processedThisRun: 0,
      updated: 0,
      deletedDuplicates: 0,
      failed: 0,
      remainingNullFileHash: 0,
      updatedRows: [],
      failures: [],
    });
  }

  let updated = 0;
  let deletedDuplicates = 0;
  const updatedRows: Array<{ id: string; imageUrl: string; fileHash: string }> = [];
  const failures: Array<{ id: string; imageUrl: string; reason: string }> = [];
  const hashesSeenThisBatch = new Map<string, string>();

  for (const row of rows) {
    try {
      const buffer = await fetchImageBytes(access, row.image_url);
      const fileHash = computeFileSha256Hex(buffer);

      const keeperFromDb = await findImageIdWithFileHash(
        access.url,
        access.accessKey,
        fileHash,
        row.id,
      );
      const keeperFromBatch = hashesSeenThisBatch.get(fileHash);
      const keeperId = keeperFromDb ?? keeperFromBatch ?? null;

      if (keeperId) {
        await removeDuplicateRow(access, row, keeperId, deleteStorage);
        deletedDuplicates += 1;
        failures.push({
          id: row.id,
          imageUrl: row.image_url,
          reason: `동일 이미지 중복 행 삭제됨 (유지 id: ${keeperId}).`,
        });
        continue;
      }

      await updateImageFileHash(access.url, access.accessKey, row.id, fileHash);
      updated += 1;
      hashesSeenThisBatch.set(fileHash, row.id);
      updatedRows.push({
        id: row.id,
        imageUrl: row.image_url,
        fileHash,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      if (isDuplicateHashDbError(reason)) {
        try {
          const buffer = await fetchImageBytes(access, row.image_url);
          const fileHash = computeFileSha256Hex(buffer);
          const keeperId =
            (await findImageIdWithFileHash(access.url, access.accessKey, fileHash, row.id)) ??
            hashesSeenThisBatch.get(fileHash) ??
            "unknown";

          await removeDuplicateRow(access, row, keeperId, deleteStorage);
          deletedDuplicates += 1;
          failures.push({
            id: row.id,
            imageUrl: row.image_url,
            reason: `unique 제약 충돌 — 중복 행 삭제 (유지 id: ${keeperId}).`,
          });
        } catch (deleteError) {
          failures.push({
            id: row.id,
            imageUrl: row.image_url,
            reason: deleteError instanceof Error ? deleteError.message : String(deleteError),
          });
        }
        continue;
      }

      failures.push({
        id: row.id,
        imageUrl: row.image_url,
        reason,
      });
    }
  }

  let remainingNullFileHash = 0;
  try {
    remainingNullFileHash = await countImagesWithNullFileHash(access.url, access.accessKey);
  } catch {
    remainingNullFileHash = Math.max(0, totalNullFileHash - updated - deletedDuplicates);
  }

  return Response.json({
    bucket: access.bucket,
    usingServiceRole: access.usingServiceRole,
    batchSize: BATCH_SIZE,
    totalNullFileHash,
    processedThisRun: rows.length,
    updated,
    deletedDuplicates,
    failed: failures.length - deletedDuplicates,
    remainingNullFileHash,
    updatedRows,
    failures: failures.slice(0, 50),
    failuresTruncated: failures.length > 50,
    hint:
      remainingNullFileHash > 0
        ? "file_hash 가 비어 있는 행이 남아 있습니다. 같은 API를 다시 호출하세요. 중복 행은 deletedDuplicates 로 제거됩니다."
        : undefined,
  });
}

export async function POST(request: Request) {
  return runBackfillHash(request);
}

export async function GET() {
  return adminMethodNotAllowed();
}
