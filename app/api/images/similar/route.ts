import type { NextRequest } from "next/server";
import { getServerEnv } from "@/shared/lib/serverEnv";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export async function GET(request: NextRequest) {
  const supabaseUrl = getServerEnv("SUPABASE_URL");
  const supabaseAnonKey = getServerEnv("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    return Response.json(
      { error: "SUPABASE_URL and SUPABASE_ANON_KEY must be configured." },
      { status: 500 },
    );
  }

  const rawId = request.nextUrl.searchParams.get("imageId")?.trim() ?? "";

  if (!rawId || !UUID_RE.test(rawId)) {
    return Response.json(
      { error: "Query imageId must be a valid UUID." },
      { status: 400 },
    );
  }

  const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/match_images_similar_to_reference`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${supabaseAnonKey}`,
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      reference_id: rawId,
      match_count: 40,
    }),
  });

  if (!rpcResponse.ok) {
    const details = await rpcResponse.text();
    return Response.json(
      {
        error:
          "Similar-images RPC failed. Run supabase/embedding-vector.sql (match_images_similar_to_reference) on your project.",
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

  const images = matched.map((row) => ({
    id: row.id,
    imageUrl: row.image_url,
    tags: normalizeTags(row.tags),
    createdAt: row.created_at ?? null,
    similarity: typeof row.similarity === "number" ? row.similarity : undefined,
  }));

  return Response.json({
    referenceId: rawId,
    images,
  });
}
