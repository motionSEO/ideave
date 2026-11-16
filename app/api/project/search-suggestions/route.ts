export const runtime = "nodejs";

import {
  isGeminiQuotaExceededError,
  pickFallbackProjectSearchQueries,
  resolveGeminiApiKey,
  suggestProjectSearchQueries,
} from "@/shared/lib/gemini";

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
    return Response.json({
      suggestions: pickFallbackProjectSearchQueries(projectName, goal),
      source: "fallback" as const,
      reason: "missing_api_key",
    });
  }

  try {
    const suggestions = await suggestProjectSearchQueries(projectName, goal, apiKey);
    if (suggestions.length === 0) {
      return Response.json({
        suggestions: pickFallbackProjectSearchQueries(projectName, goal),
        source: "fallback" as const,
        reason: "empty_model",
      });
    }

    return Response.json({
      suggestions,
      source: "gemini" as const,
    });
  } catch (error) {
    const suggestions = pickFallbackProjectSearchQueries(projectName, goal);
    if (isGeminiQuotaExceededError(error)) {
      return Response.json({
        suggestions,
        source: "fallback" as const,
        reason: "quota",
        details: error instanceof Error ? error.message : "quota",
      });
    }

    return Response.json({
      suggestions,
      source: "fallback" as const,
      reason: "error",
      details: error instanceof Error ? error.message : "unknown",
    });
  }
}
