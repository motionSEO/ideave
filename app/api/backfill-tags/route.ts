import {
  analyzeImageWithGemini,
  isGeminiQuotaExceededError,
  resolveGeminiApiKey,
} from "@/shared/lib/gemini";
import { adminMethodNotAllowed, requireAdminRequest } from "@/shared/lib/adminAuth";
import { fetchAllowedImage } from "@/shared/lib/safeImageFetch";
import { getServerEnv } from "@/shared/lib/serverEnv";

export const runtime = "nodejs";

const BATCH_SIZE = 10;
const DELAY_MS = 1000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type ImageRow = {
  id: string;
  image_url: string;
  tags: unknown;
};

function normalizeTags(tags: unknown): string[] {
  if (Array.isArray(tags)) {
    return tags.filter((value): value is string => typeof value === "string");
  }
  if (typeof tags === "string") {
    try {
      const parsed = JSON.parse(tags) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((value): value is string => typeof value === "string");
      }
    } catch {
      return [];
    }
  }
  return [];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function guessMimeType(imageUrl: string): string {
  const pathname = imageUrl.split("?")[0] ?? imageUrl;
  const ext = pathname.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    avif: "image/avif",
    bmp: "image/bmp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    svg: "image/svg+xml",
    webp: "image/webp",
  };
  return (ext && map[ext]) || "image/jpeg";
}

async function countImagesWithEmptyTags(
  supabaseUrl: string,
  accessKey: string,
): Promise<number> {
  const url = new URL(`${supabaseUrl}/rest/v1/images`);
  url.searchParams.set("select", "id");
  url.searchParams.set("tags", "eq.[]");

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

async function fetchImagesWithEmptyTags(
  supabaseUrl: string,
  accessKey: string,
  limit: number,
): Promise<ImageRow[]> {
  const url = new URL(`${supabaseUrl}/rest/v1/images`);
  url.searchParams.set("select", "id,image_url,tags");
  url.searchParams.set("tags", "eq.[]");
  url.searchParams.set("order", "created_at.asc");
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessKey}`,
      apikey: accessKey,
    },
  });

  const chunk = (await response.json()) as ImageRow[] | { message?: string };

  if (!response.ok) {
    const message =
      typeof chunk === "object" && chunk !== null && "message" in chunk
        ? String(chunk.message)
        : await response.text();
    throw new Error(`Supabase list failed (${response.status}): ${message}`);
  }

  if (!Array.isArray(chunk)) {
    return [];
  }

  return chunk.filter((row) => normalizeTags(row.tags).length === 0);
}

async function updateImageTags(
  supabaseUrl: string,
  accessKey: string,
  id: string,
  tags: string[],
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
      body: JSON.stringify({ tags }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PATCH failed (${response.status}): ${text}`);
  }
}

async function fetchImageFile(imageUrl: string): Promise<File> {
  // image_url 은 DB 값이므로 허용 목록(Supabase 공개 Storage·Unsplash)만 내려받는다.
  const { bytes, mimeType: fetchedMime } = await fetchAllowedImage(imageUrl, {
    maxBytes: MAX_IMAGE_BYTES,
    timeoutMs: 20_000,
  });
  const mimeType = fetchedMime.startsWith("image/") ? fetchedMime : guessMimeType(imageUrl);
  const fileName = imageUrl.split("/").pop()?.split("?")[0] || "image.jpg";

  return new File([new Uint8Array(bytes)], fileName, { type: mimeType });
}

/**
 * POST /api/backfill-tags  (x-backfill-secret 헤더 필수)
 *
 * `tags` 가 빈 배열(`[]`)인 `images` 행을 Gemini로 분석해 태그를 채웁니다.
 * 호출당 최대 10장만 처리하며, 각 Gemini 요청 사이에 1초 대기합니다.
 * 남은 항목이 있으면 API를 반복 호출하세요.
 *
 * 권장: `SUPABASE_SERVICE_ROLE_KEY`(UPDATE) + Gemini API 키.
 */
async function runBackfillTags(request: Request): Promise<Response> {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  const geminiApiKey = resolveGeminiApiKey();
  if (!geminiApiKey) {
    return Response.json(
      {
        error:
          "Gemini API key is not configured. Set GOOGLE_API_KEY (or GEMINI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY).",
      },
      { status: 500 },
    );
  }

  const supabaseUrl = getServerEnv("SUPABASE_URL");
  const serviceRole = getServerEnv("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = getServerEnv("SUPABASE_ANON_KEY");
  const accessKey = serviceRole ?? anonKey;

  if (!supabaseUrl || !accessKey) {
    return Response.json(
      {
        error:
          "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (권장) 또는 SUPABASE_ANON_KEY 가 필요합니다.",
      },
      { status: 500 },
    );
  }

  let totalEmptyTags = 0;
  let rows: ImageRow[];

  try {
    [totalEmptyTags, rows] = await Promise.all([
      countImagesWithEmptyTags(supabaseUrl, accessKey),
      fetchImagesWithEmptyTags(supabaseUrl, accessKey, BATCH_SIZE),
    ]);
  } catch (error) {
    return Response.json(
      {
        error: "Failed to list images with empty tags.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }

  if (rows.length === 0) {
    return Response.json({
      usingServiceRole: Boolean(serviceRole),
      batchSize: BATCH_SIZE,
      delayMs: DELAY_MS,
      totalEmptyTags: 0,
      processedThisRun: 0,
      updated: 0,
      failed: 0,
      remainingEmptyTags: 0,
      geminiQuotaExceeded: false,
      updatedRows: [],
      failures: [],
    });
  }

  let updated = 0;
  let geminiQuotaExceeded = false;
  const updatedRows: Array<{ id: string; imageUrl: string; tags: string[] }> = [];
  const failures: Array<{ id: string; imageUrl: string; reason: string }> = [];

  for (let index = 0; index < rows.length; index += 1) {
    if (index > 0) {
      await delay(DELAY_MS);
    }

    const row = rows[index];
    if (!row) {
      continue;
    }

    try {
      const file = await fetchImageFile(row.image_url);
      const analysis = await analyzeImageWithGemini(file, geminiApiKey);
      await updateImageTags(supabaseUrl, accessKey, row.id, analysis.tags);
      updated += 1;
      updatedRows.push({
        id: row.id,
        imageUrl: row.image_url,
        tags: analysis.tags,
      });
    } catch (error) {
      if (isGeminiQuotaExceededError(error)) {
        geminiQuotaExceeded = true;
        failures.push({
          id: row.id,
          imageUrl: row.image_url,
          reason: error instanceof Error ? error.message : String(error),
        });
        break;
      }

      failures.push({
        id: row.id,
        imageUrl: row.image_url,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const remainingEmptyTags = Math.max(0, totalEmptyTags - updated);

  return Response.json({
    usingServiceRole: Boolean(serviceRole),
    batchSize: BATCH_SIZE,
    delayMs: DELAY_MS,
    totalEmptyTags,
    processedThisRun: updated + failures.length,
    updated,
    failed: failures.length,
    remainingEmptyTags,
    geminiQuotaExceeded,
    updatedRows,
    failures: failures.slice(0, 50),
    failuresTruncated: failures.length > 50,
    hint:
      remainingEmptyTags > 0
        ? "남은 이미지가 있습니다. 쿼터가 회복되면 같은 API를 다시 호출하세요."
        : undefined,
  });
}

export async function POST(request: Request) {
  return runBackfillTags(request);
}

export async function GET() {
  return adminMethodNotAllowed();
}
