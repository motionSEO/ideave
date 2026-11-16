import {
  buildImageEmbeddingDocument,
  createTextEmbedding,
} from "@/shared/lib/openaiEmbedding";
import { adminMethodNotAllowed, requireAdminRequest } from "@/shared/lib/adminAuth";
import { getServerEnv } from "@/shared/lib/serverEnv";

export const runtime = "nodejs";

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

type ImageRow = { id: string; tags: unknown };

async function fetchImagesWithNullEmbedding(
  supabaseUrl: string,
  accessKey: string,
): Promise<ImageRow[]> {
  const pageSize = 200;
  const results: ImageRow[] = [];
  let offset = 0;

  while (true) {
    const url = new URL(`${supabaseUrl}/rest/v1/images`);
    url.searchParams.set("select", "id,tags");
    url.searchParams.set("embedding", "is.null");
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));

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

    if (!Array.isArray(chunk) || chunk.length === 0) {
      break;
    }

    results.push(...chunk);
    if (chunk.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return results;
}

async function updateImageEmbedding(
  supabaseUrl: string,
  accessKey: string,
  id: string,
  embedding: number[],
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
      body: JSON.stringify({ embedding }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PATCH failed (${response.status}): ${text}`);
  }
}

/**
 * POST /api/backfill-embeddings  (x-backfill-secret 헤더 필수)
 *
 * `embedding` 이 null 인 `images` 행을 모두 찾아 태그로 OpenAI 임베딩을 만들고 업데이트합니다.
 *
 * 권장: `.env.local`에 `SUPABASE_SERVICE_ROLE_KEY`(RLS 우회) + `OPENAI_API_KEY`.
 * anon 키만 쓰려면 `images` 에 대해 UPDATE 정책을 추가해야 합니다.
 */
async function runBackfill(request: Request): Promise<Response> {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
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

  if (!getServerEnv("OPENAI_API_KEY")) {
    return Response.json({ error: "OPENAI_API_KEY is not configured." }, { status: 500 });
  }

  let rows: ImageRow[];
  try {
    rows = await fetchImagesWithNullEmbedding(supabaseUrl, accessKey);
  } catch (error) {
    return Response.json(
      {
        error: "Failed to list images with null embedding.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }

  let updated = 0;
  let skippedEmptyTags = 0;
  const failures: Array<{ id: string; reason: string }> = [];

  for (const row of rows) {
    const tags = normalizeTags(row.tags);
    if (tags.length === 0) {
      skippedEmptyTags += 1;
      continue;
    }

    try {
      const document = buildImageEmbeddingDocument(tags);
      const embedding = await createTextEmbedding(document);
      await updateImageEmbedding(supabaseUrl, accessKey, row.id, embedding);
      updated += 1;
    } catch (error) {
      failures.push({
        id: row.id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return Response.json({
    usingServiceRole: Boolean(serviceRole),
    totalNullEmbeddingRows: rows.length,
    updated,
    skippedEmptyTags,
    failed: failures.length,
    failures: failures.slice(0, 50),
    failuresTruncated: failures.length > 50,
  });
}

export async function POST(request: Request) {
  return runBackfill(request);
}

export async function GET() {
  return adminMethodNotAllowed();
}
