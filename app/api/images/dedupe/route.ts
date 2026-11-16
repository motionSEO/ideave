import { adminMethodNotAllowed, requireAdminRequest } from "@/shared/lib/adminAuth";
import {
  buildContentHashById,
  deleteImageDbRow,
  deleteStorageObject,
  extractObjectPathFromImageUrl,
  fetchAllImageDbRows,
  getSupabaseImageAccess,
  pickDuplicateImageIds,
} from "@/shared/lib/supabaseImages";

export const runtime = "nodejs";

/**
 * POST /api/images/dedupe  (x-backfill-secret 헤더 필수)
 *
 * 중복 이미지 행 삭제 (가장 오래된 행 유지).
 * - DB `file_hash` 가 같으면 중복
 * - `image_url` 이 같으면 중복
 * - `file_hash` 가 비어 있어도 **파일 바이트 SHA-256** 으로 동일 이미지(다른 URL) 탐지
 *
 * Query: `dryRun=1` — 삭제 없이 목록만
 * Query: `deleteStorage=1` — 삭제된 행의 Storage 파일도 제거
 * Query: `urlOnly=1` — URL/DB해시만 (바이트 비교 생략, 빠름)
 */
async function runDedupe(request: Request): Promise<Response> {
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

  if (!access.usingServiceRole) {
    return Response.json(
      {
        error:
          "중복 삭제에는 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다. 또는 supabase/dedupe-duplicate-images.sql 을 SQL 에디터에서 실행하세요.",
      },
      { status: 500 },
    );
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const deleteStorage = new URL(request.url).searchParams.get("deleteStorage") === "1";
  const urlOnly = new URL(request.url).searchParams.get("urlOnly") === "1";

  let rows: Awaited<ReturnType<typeof fetchAllImageDbRows>>;
  try {
    rows = await fetchAllImageDbRows(access.url, access.accessKey);
  } catch (error) {
    return Response.json(
      {
        error: "Failed to list images.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }

  const nullHashCount = rows.filter((row) => !row.file_hash?.trim()).length;

  let contentHashById = new Map<string, string>();
  let hashFailures: Array<{ id: string; reason: string }> = [];

  if (!urlOnly) {
    const built = await buildContentHashById(access, rows);
    contentHashById = built.hashById;
    hashFailures = built.failures;
  } else {
    for (const row of rows) {
      const hash = row.file_hash?.trim();
      if (hash) {
        contentHashById.set(row.id, hash);
      }
    }
  }

  const duplicateIds = pickDuplicateImageIds(rows, contentHashById);
  const duplicateRows = rows.filter((row) => duplicateIds.includes(row.id));

  if (dryRun) {
    return Response.json({
      dryRun: true,
      urlOnly,
      totalRows: rows.length,
      rowsWithNullFileHash: nullHashCount,
      contentHashesResolved: contentHashById.size,
      hashComputeFailures: hashFailures.length,
      duplicateCount: duplicateIds.length,
      duplicateIds,
      duplicateRows: duplicateRows.map((row) => ({
        id: row.id,
        imageUrl: row.image_url,
        fileHash: row.file_hash ?? contentHashById.get(row.id) ?? null,
        createdAt: row.created_at,
      })),
      hashFailures: hashFailures.slice(0, 20),
      hint:
        duplicateIds.length === 0 && nullHashCount > 0 && urlOnly
          ? "urlOnly=1 이면 다른 URL의 동일 이미지는 잡히지 않습니다. urlOnly 없이 다시 실행하세요."
          : undefined,
    });
  }

  const storageFailures: Array<{ id: string; reason: string }> = [];
  const deleteFailures: Array<{ id: string; reason: string }> = [];
  let deleted = 0;

  for (const row of duplicateRows) {
    try {
      await deleteImageDbRow(access.url, access.accessKey, row.id);
      deleted += 1;

      if (deleteStorage) {
        const objectPath = extractObjectPathFromImageUrl(row.image_url, access.bucket);
        if (objectPath) {
          try {
            await deleteStorageObject(access.url, access.accessKey, access.bucket, objectPath);
          } catch (storageError) {
            storageFailures.push({
              id: row.id,
              reason:
                storageError instanceof Error ? storageError.message : String(storageError),
            });
          }
        }
      }
    } catch (error) {
      deleteFailures.push({
        id: row.id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return Response.json({
    usingServiceRole: true,
    bucket: access.bucket,
    urlOnly,
    totalRows: rows.length,
    rowsWithNullFileHash: nullHashCount,
    contentHashesResolved: contentHashById.size,
    duplicateCount: duplicateIds.length,
    deleted,
    deleteFailures,
    storageFailures,
    hashFailures: hashFailures.slice(0, 20),
    hint:
      deleteFailures.length > 0
        ? "일부 행 삭제에 실패했습니다."
        : duplicateIds.length === 0 && nullHashCount > 0
          ? "중복이 없거나, 이미지 다운로드 실패로 바이트 비교가 되지 않았을 수 있습니다. hashFailures를 확인하세요."
          : undefined,
  });
}

export async function POST(request: Request) {
  return runDedupe(request);
}

export async function GET() {
  return adminMethodNotAllowed();
}
