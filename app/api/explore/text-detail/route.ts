export const runtime = "nodejs";

import {
  getRuntimeExploreTextDetailCache,
  setRuntimeExploreTextDetailCache,
} from "@/shared/lib/exploreTextDetailCache";
import {
  hasExploreTextDetailContent,
  type ExploreTextDetailContent,
} from "@/shared/lib/exploreTextDetails";
import {
  explainExploreTextTerm,
  isGeminiQuotaExceededError,
  pickFallbackAntonyms,
  resolveGeminiApiKey,
} from "@/shared/lib/gemini";

function withAntonymsFallback(
  detail: ExploreTextDetailContent,
  label: string,
): ExploreTextDetailContent {
  if (detail.antonyms.length > 0) {
    return detail;
  }
  return {
    ...detail,
    antonyms: pickFallbackAntonyms(label),
  };
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    label?: unknown;
    category?: unknown;
  };

  const label = typeof body.label === "string" ? body.label.trim() : "";
  const category = typeof body.category === "string" ? body.category.trim() : undefined;

  if (!label) {
    return Response.json({ error: "label is required." }, { status: 400 });
  }

  const cached = getRuntimeExploreTextDetailCache(label, category);
  if (cached && hasExploreTextDetailContent(cached)) {
    return Response.json({
      ...withAntonymsFallback(cached, label),
      source: "cache" as const,
    });
  }

  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    return Response.json(
      {
        definition: "",
        function: "",
        antonyms: [] as string[],
        source: "none" as const,
        reason: "missing_api_key" as const,
        retryable: false,
      },
      { status: 503 },
    );
  }

  try {
    const result = await explainExploreTextTerm(label, apiKey, category);
    const detail = withAntonymsFallback(result, label);

    if (hasExploreTextDetailContent(detail)) {
      setRuntimeExploreTextDetailCache(label, category, detail);
    }

    return Response.json({
      ...detail,
      source: "gemini" as const,
    });
  } catch (error) {
    const reason = isGeminiQuotaExceededError(error) ? ("quota" as const) : ("error" as const);
    return Response.json(
      {
        definition: "",
        function: "",
        antonyms: [] as string[],
        source: "none" as const,
        reason,
        retryable: true,
        details: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 },
    );
  }
}
