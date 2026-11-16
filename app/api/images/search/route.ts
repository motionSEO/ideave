import type { NextRequest } from "next/server";
import { createTextEmbedding } from "@/shared/lib/openaiEmbedding";
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

async function fetchAllImages(
  supabaseUrl: string,
  anonKey: string,
): Promise<
  Array<{ id: string; image_url: string; tags: unknown; created_at?: string }>
> {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/images?select=id,image_url,tags,created_at&order=created_at.desc`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(details);
  }

  return (await response.json()) as Array<{
    id: string;
    image_url: string;
    tags: unknown;
    created_at?: string;
  }>;
}

export async function GET(request: NextRequest) {
  const supabaseUrl = getServerEnv("SUPABASE_URL");
  const supabaseAnonKey = getServerEnv("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    return Response.json(
      { error: "SUPABASE_URL and SUPABASE_ANON_KEY must be configured." },
      { status: 500 },
    );
  }

  const tagFilter = request.nextUrl.searchParams.get("tag");
  const semanticQuery = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (semanticQuery.length > 0) {
    try {
      const vector = await createTextEmbedding(semanticQuery);
      const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/match_images_by_embedding`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseAnonKey}`,
          apikey: supabaseAnonKey,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          query_embedding: vector,
          match_count: 40,
        }),
      });

      if (!rpcResponse.ok) {
        const details = await rpcResponse.text();
        return Response.json(
          {
            error: "Semantic search RPC failed. Run supabase/embedding-vector.sql on your project.",
            details,
          },
          { status: 502 },
        );
      }

      const matched = (await rpcResponse.json()) as Array<{
        id: string;
        image_url: string;
        tags: unknown;
        created_at?: string;
        similarity: number;
      }>;

      let images = matched.map((row) => ({
        id: row.id,
        imageUrl: row.image_url,
        tags: normalizeTags(row.tags),
        createdAt: row.created_at ?? null,
        similarity: typeof row.similarity === "number" ? row.similarity : undefined,
      }));

      if (tagFilter) {
        images = images.filter((image) => image.tags.some((t) => t.includes(tagFilter)));
      }

      return Response.json({
        query: {
          tag: tagFilter,
          q: semanticQuery,
          mode: "semantic" as const,
        },
        images,
      });
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Embedding or semantic search failed.",
        },
        { status: 503 },
      );
    }
  }

  try {
    const rows = await fetchAllImages(supabaseUrl, supabaseAnonKey);

    let normalizedImages = rows.map((row) => ({
      id: row.id,
      imageUrl: row.image_url,
      tags: normalizeTags(row.tags),
      createdAt: row.created_at ?? null,
      similarity: undefined as number | undefined,
    }));

    if (tagFilter) {
      normalizedImages = normalizedImages.filter((image) =>
        image.tags.some((item) => item.includes(tagFilter)),
      );
    }

    return Response.json({
      query: {
        tag: tagFilter,
        q: null,
        mode: "list" as const,
      },
      images: normalizedImages,
    });
  } catch (error) {
    return Response.json(
      {
        error: "Failed to fetch images from Supabase.",
        details: error instanceof Error ? error.message : "unknown error",
      },
      { status: 502 },
    );
  }
}
