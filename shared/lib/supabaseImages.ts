import { computeFileSha256Hex } from "@/shared/lib/fileHash";
import { fetchAllowedImage } from "@/shared/lib/safeImageFetch";
import { getServerEnv } from "@/shared/lib/serverEnv";

export type ImageDbRow = {
  id: string;
  image_url: string;
  file_hash?: string | null;
  created_at?: string;
};

export type SupabaseImageAccess = {
  url: string;
  accessKey: string;
  bucket: string;
  usingServiceRole: boolean;
};

export function getSupabaseImageAccess(): SupabaseImageAccess | null {
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

export function extractObjectPathFromImageUrl(imageUrl: string, bucket: string): string | null {
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

export function encodeStorageObjectPath(objectPath: string): string {
  return objectPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function normalizeImageUrlKey(imageUrl: string): string {
  return imageUrl.trim().toLowerCase();
}

export function isDuplicateHashDbError(message: string): boolean {
  return (
    message.includes("images_file_hash_unique") ||
    message.includes("duplicate key") ||
    message.includes("23505")
  );
}

export async function fetchAllImageDbRows(
  supabaseUrl: string,
  accessKey: string,
): Promise<ImageDbRow[]> {
  const pageSize = 1000;
  const rows: ImageDbRow[] = [];
  let offset = 0;

  while (true) {
    const url = new URL(`${supabaseUrl}/rest/v1/images`);
    url.searchParams.set("select", "id,image_url,file_hash,created_at");
    url.searchParams.set("order", "created_at.asc");

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessKey}`,
        apikey: accessKey,
        Range: `${offset}-${offset + pageSize - 1}`,
      },
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Supabase list failed (${response.status}): ${details}`);
    }

    const chunk = (await response.json()) as ImageDbRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return rows;
}

export async function countImagesWithNullFileHash(
  supabaseUrl: string,
  accessKey: string,
): Promise<number> {
  const url = new URL(`${supabaseUrl}/rest/v1/images`);
  url.searchParams.set("select", "id");
  url.searchParams.set("file_hash", "is.null");

  const response = await fetch(url.toString(), {
    method: "HEAD",
    headers: {
      Authorization: `Bearer ${accessKey}`,
      apikey: accessKey,
      Prefer: "count=exact",
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Supabase count failed (${response.status}): ${details}`);
  }

  const range = response.headers.get("content-range");
  if (!range) {
    return 0;
  }

  const match = range.match(/\/(\d+|\*)$/);
  if (!match || match[1] === "*") {
    return 0;
  }

  return Number.parseInt(match[1], 10);
}

export async function fetchImagesWithNullFileHash(
  supabaseUrl: string,
  accessKey: string,
  limit: number,
): Promise<ImageDbRow[]> {
  const url = new URL(`${supabaseUrl}/rest/v1/images`);
  url.searchParams.set("select", "id,image_url,file_hash,created_at");
  url.searchParams.set("file_hash", "is.null");
  url.searchParams.set("order", "created_at.asc");
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessKey}`,
      apikey: accessKey,
    },
  });

  const chunk = (await response.json()) as ImageDbRow[] | { message?: string };

  if (!response.ok) {
    const message =
      typeof chunk === "object" && chunk !== null && "message" in chunk
        ? String(chunk.message)
        : await response.text();
    throw new Error(`Supabase list failed (${response.status}): ${message}`);
  }

  return Array.isArray(chunk) ? chunk : [];
}

export async function findImageIdWithFileHash(
  supabaseUrl: string,
  accessKey: string,
  fileHash: string,
  excludeId: string,
): Promise<string | null> {
  const url = new URL(`${supabaseUrl}/rest/v1/images`);
  url.searchParams.set("select", "id");
  url.searchParams.set("file_hash", `eq.${fileHash}`);
  url.searchParams.set("id", `neq.${excludeId}`);
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessKey}`,
      apikey: accessKey,
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Supabase hash lookup failed (${response.status}): ${details}`);
  }

  const rows = (await response.json()) as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

export async function downloadFromStorage(
  supabaseUrl: string,
  accessKey: string,
  bucket: string,
  objectPath: string,
): Promise<ArrayBuffer> {
  const encodedPath = encodeStorageObjectPath(objectPath);
  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/${bucket}/${encodedPath}`,
    {
      headers: {
        Authorization: `Bearer ${accessKey}`,
        apikey: accessKey,
      },
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Storage download failed (${response.status}): ${details}`);
  }

  return response.arrayBuffer();
}

const MAX_DB_IMAGE_BYTES = 25 * 1024 * 1024;

/** `image_url` 은 DB 값(공개 insert 가능)이므로 허용 목록 호스트만 내려받는다. */
export async function downloadFromImageUrl(imageUrl: string): Promise<ArrayBuffer> {
  const { bytes } = await fetchAllowedImage(imageUrl, {
    maxBytes: MAX_DB_IMAGE_BYTES,
    timeoutMs: 20_000,
  });
  return new Uint8Array(bytes).buffer;
}

export async function fetchImageBytes(
  access: SupabaseImageAccess,
  imageUrl: string,
): Promise<ArrayBuffer> {
  const objectPath = extractObjectPathFromImageUrl(imageUrl, access.bucket);
  if (objectPath) {
    try {
      return await downloadFromStorage(access.url, access.accessKey, access.bucket, objectPath);
    } catch (storageError) {
      const reason = storageError instanceof Error ? storageError.message : String(storageError);
      console.warn(`[supabaseImages] Storage download failed, falling back to image_url: ${reason}`);
    }
  }

  return downloadFromImageUrl(imageUrl);
}

export async function computeFileHashFromImageUrl(
  access: SupabaseImageAccess,
  imageUrl: string,
): Promise<string> {
  const buffer = await fetchImageBytes(access, imageUrl);
  return computeFileSha256Hex(buffer);
}

export async function updateImageFileHash(
  supabaseUrl: string,
  accessKey: string,
  id: string,
  fileHash: string,
): Promise<void> {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/images?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessKey}`,
        apikey: accessKey,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ file_hash: fileHash }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PATCH failed (${response.status}): ${text}`);
  }
}

export async function deleteImageDbRow(
  supabaseUrl: string,
  accessKey: string,
  id: string,
): Promise<void> {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/images?id=eq.${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessKey}`,
        apikey: accessKey,
        Prefer: "return=minimal",
      },
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`DELETE failed for ${id} (${response.status}): ${details}`);
  }
}

export async function deleteStorageObject(
  supabaseUrl: string,
  accessKey: string,
  bucket: string,
  objectPath: string,
): Promise<void> {
  const encodedPath = encodeStorageObjectPath(objectPath);
  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/${bucket}/${encodedPath}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessKey}`,
        apikey: accessKey,
      },
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Storage delete failed (${response.status}): ${details}`);
  }
}

/** created_at 오래된 행 유지, 동일 file_hash·동일 URL·동일 바이트(해시) 중복 id 목록 */
export function pickDuplicateImageIds(
  rows: ImageDbRow[],
  contentHashById: Map<string, string>,
): string[] {
  const sorted = [...rows].sort((a, b) =>
    (a.created_at ?? "").localeCompare(b.created_at ?? ""),
  );
  const seenHashes = new Map<string, string>();
  const seenUrls = new Set<string>();
  const duplicateIds: string[] = [];

  for (const row of sorted) {
    const urlKey = normalizeImageUrlKey(row.image_url);
    const hash = row.file_hash?.trim() || contentHashById.get(row.id);
    let markedDuplicate = false;

    if (hash) {
      const keeperId = seenHashes.get(hash);
      if (keeperId) {
        duplicateIds.push(row.id);
        markedDuplicate = true;
      } else {
        seenHashes.set(hash, row.id);
      }
    }

    if (!markedDuplicate) {
      if (seenUrls.has(urlKey)) {
        duplicateIds.push(row.id);
      } else {
        seenUrls.add(urlKey);
      }
    }
  }

  return duplicateIds;
}

export async function buildContentHashById(
  access: SupabaseImageAccess,
  rows: ImageDbRow[],
): Promise<{ hashById: Map<string, string>; failures: Array<{ id: string; reason: string }> }> {
  const hashById = new Map<string, string>();
  const failures: Array<{ id: string; reason: string }> = [];

  for (const row of rows) {
    const existing = row.file_hash?.trim();
    if (existing) {
      hashById.set(row.id, existing);
      continue;
    }

    try {
      const hash = await computeFileHashFromImageUrl(access, row.image_url);
      hashById.set(row.id, hash);
    } catch (error) {
      failures.push({
        id: row.id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { hashById, failures };
}
