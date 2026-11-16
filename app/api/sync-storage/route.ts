import { adminMethodNotAllowed, requireAdminRequest } from "@/shared/lib/adminAuth";
import { getServerEnv } from "@/shared/lib/serverEnv";

export const runtime = "nodejs";

const IMAGE_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "heic",
  "heif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
]);

type StorageListItem = {
  name: string;
  id: string | null;
};

type ImageUrlRow = { image_url: string };

function getSupabaseAccess() {
  const url = getServerEnv("SUPABASE_URL");
  const serviceRole = getServerEnv("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = getServerEnv("SUPABASE_ANON_KEY");
  const accessKey = serviceRole ?? anonKey;
  const bucket = getServerEnv("SUPABASE_STORAGE_BUCKET") ?? "images";

  if (!url || !accessKey) {
    return null;
  }

  return { url, accessKey, bucket, usingServiceRole: Boolean(serviceRole) };
}

function isImageObjectPath(objectPath: string): boolean {
  const fileName = objectPath.split("/").pop() ?? objectPath;
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return false;
  }
  const ext = fileName.slice(dotIndex + 1).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

function buildPublicImageUrl(supabaseUrl: string, bucket: string, objectPath: string): string {
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`;
}

function extractObjectPathFromImageUrl(imageUrl: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = imageUrl.indexOf(marker);
  if (idx === -1) {
    return null;
  }
  try {
    return decodeURIComponent(imageUrl.slice(idx + marker.length));
  } catch {
    return imageUrl.slice(idx + marker.length);
  }
}

async function listStorageObjects(
  supabaseUrl: string,
  accessKey: string,
  bucket: string,
  prefix = "",
): Promise<string[]> {
  const pageSize = 1000;
  const objectPaths: string[] = [];
  let offset = 0;

  while (true) {
    const response = await fetch(`${supabaseUrl}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessKey}`,
        apikey: accessKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prefix,
        limit: pageSize,
        offset,
        sortBy: { column: "name", order: "asc" },
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Storage list failed (${response.status}): ${details}`);
    }

    const items = (await response.json()) as StorageListItem[];
    if (!Array.isArray(items) || items.length === 0) {
      break;
    }

    for (const item of items) {
      const fullPath = prefix ? `${prefix}${item.name}` : item.name;

      if (item.id === null) {
        const folderPrefix = fullPath.endsWith("/") ? fullPath : `${fullPath}/`;
        const nested = await listStorageObjects(supabaseUrl, accessKey, bucket, folderPrefix);
        objectPaths.push(...nested);
        continue;
      }

      objectPaths.push(fullPath);
    }

    if (items.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return objectPaths;
}

async function fetchRegisteredObjectPaths(
  supabaseUrl: string,
  accessKey: string,
  bucket: string,
): Promise<Set<string>> {
  const pageSize = 500;
  const registered = new Set<string>();
  let offset = 0;

  while (true) {
    const url = new URL(`${supabaseUrl}/rest/v1/images`);
    url.searchParams.set("select", "image_url");
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessKey}`,
        apikey: accessKey,
      },
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Supabase images list failed (${response.status}): ${details}`);
    }

    const rows = (await response.json()) as ImageUrlRow[];
    if (!Array.isArray(rows) || rows.length === 0) {
      break;
    }

    for (const row of rows) {
      const objectPath = extractObjectPathFromImageUrl(row.image_url, bucket);
      if (objectPath) {
        registered.add(objectPath);
      }
    }

    if (rows.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return registered;
}

async function insertImages(
  supabaseUrl: string,
  accessKey: string,
  rows: Array<{ image_url: string; tags: string[] }>,
): Promise<Array<{ id: string; image_url: string }>> {
  const response = await fetch(`${supabaseUrl}/rest/v1/images`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessKey}`,
      apikey: accessKey,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Insert failed (${response.status}): ${details}`);
  }

  return (await response.json()) as Array<{ id: string; image_url: string }>;
}

/**
 * POST /api/sync-storage  (x-backfill-secret 헤더 필수)
 *
 * Supabase Storage `images` 버킷의 객체를 스캔해 `images` 테이블에 없는 항목을 등록합니다.
 *
 * 권장: `.env.local`에 `SUPABASE_SERVICE_ROLE_KEY`(Storage 목록·DB insert).
 */
async function runSyncStorage(request: Request): Promise<Response> {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  const supabase = getSupabaseAccess();
  if (!supabase) {
    return Response.json(
      {
        error:
          "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (권장) 또는 SUPABASE_ANON_KEY 가 필요합니다.",
      },
      { status: 500 },
    );
  }

  try {
    const [storagePaths, registeredPaths] = await Promise.all([
      listStorageObjects(supabase.url, supabase.accessKey, supabase.bucket),
      fetchRegisteredObjectPaths(supabase.url, supabase.accessKey, supabase.bucket),
    ]);

    const imagePaths = storagePaths.filter(isImageObjectPath);
    const missingPaths = imagePaths.filter((objectPath) => !registeredPaths.has(objectPath));

    const inserted: Array<{ id: string; imageUrl: string; objectPath: string }> = [];
    const failures: Array<{ objectPath: string; reason: string }> = [];

    const batchSize = 50;
    for (let i = 0; i < missingPaths.length; i += batchSize) {
      const batch = missingPaths.slice(i, i + batchSize);
      const payload = batch.map((objectPath) => ({
        image_url: buildPublicImageUrl(supabase.url, supabase.bucket, objectPath),
        tags: [] as string[],
      }));

      try {
        const rows = await insertImages(supabase.url, supabase.accessKey, payload);
        for (let j = 0; j < batch.length; j += 1) {
          const row = rows[j];
          inserted.push({
            id: row?.id ?? "",
            imageUrl: row?.image_url ?? payload[j]?.image_url ?? "",
            objectPath: batch[j] ?? "",
          });
        }
      } catch (error) {
        for (const objectPath of batch) {
          failures.push({
            objectPath,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return Response.json({
      bucket: supabase.bucket,
      usingServiceRole: supabase.usingServiceRole,
      storageObjectsScanned: storagePaths.length,
      imageObjectsInStorage: imagePaths.length,
      alreadyRegistered: imagePaths.length - missingPaths.length,
      inserted: inserted.length,
      skippedNonImage: storagePaths.length - imagePaths.length,
      failed: failures.length,
      insertedRows: inserted.slice(0, 50),
      insertedRowsTruncated: inserted.length > 50,
      failures: failures.slice(0, 50),
      failuresTruncated: failures.length > 50,
    });
  } catch (error) {
    return Response.json(
      {
        error: "Storage sync failed.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  return runSyncStorage(request);
}

export async function GET() {
  return adminMethodNotAllowed();
}
