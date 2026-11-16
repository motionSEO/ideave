export const runtime = "nodejs";

import type { ExploreTextEntry } from "@/components/reference-prototype/exploreGrid";
import {
  analyzeProjectExploreTexts,
  isGeminiQuotaExceededError,
  pickFallbackProjectExploreTexts,
  type ProjectExploreTextEntry,
  resolveGeminiApiKey,
} from "@/shared/lib/gemini";

function toExploreTextEntries(entries: ProjectExploreTextEntry[]): ExploreTextEntry[] {
  return entries.map((entry) => ({
    label: entry.label,
    category: entry.category,
  }));
}

function responsePayload(
  exploreTexts: ExploreTextEntry[],
  source: "gemini" | "fallback",
  extra?: Record<string, unknown>,
) {
  return Response.json({
    exploreTexts,
    keywords: exploreTexts.map((entry) => entry.label),
    source,
    ...extra,
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    projectName?: unknown;
    goal?: unknown;
  };

  const projectName = typeof body.projectName === "string" ? body.projectName.trim() : "";
  const goal = typeof body.goal === "string" ? body.goal.trim() : "";

  if (!projectName || !goal) {
    return Response.json(
      { error: "projectName and goal are required." },
      { status: 400 },
    );
  }

  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    const exploreTexts = toExploreTextEntries(
      pickFallbackProjectExploreTexts(projectName, goal),
    );
    return responsePayload(exploreTexts, "fallback", { reason: "missing_api_key" });
  }

  try {
    const entries = await analyzeProjectExploreTexts(projectName, goal, apiKey);
    if (entries.length === 0) {
      const exploreTexts = toExploreTextEntries(
        pickFallbackProjectExploreTexts(projectName, goal),
      );
      return responsePayload(exploreTexts, "fallback", { reason: "empty_model" });
    }

    return responsePayload(toExploreTextEntries(entries), "gemini");
  } catch (error) {
    const exploreTexts = toExploreTextEntries(
      pickFallbackProjectExploreTexts(projectName, goal),
    );

    if (isGeminiQuotaExceededError(error)) {
      return responsePayload(exploreTexts, "fallback", {
        reason: "quota",
        details: error instanceof Error ? error.message : "quota",
      });
    }

    return responsePayload(exploreTexts, "fallback", {
      reason: "error",
      details: error instanceof Error ? error.message : "unknown",
    });
  }
}
