import { isGeminiQuotaExceededError, resolveGeminiApiKey } from "@/shared/lib/gemini";
import { detectExplicitMedium, getMedium, mediumPromptList, type MediumId } from "@/shared/lib/visualMedium";
import {
  fallbackProjectVisualProfile,
  parseProjectVisualProfile,
  splitMoodKeywords,
  type ProjectVisualProfile,
} from "@/shared/lib/projectVisual";

export const runtime = "nodejs";
export const maxDuration = 60;

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const CACHE_MAX_ENTRIES = 200;
const profileCache = new Map<string, ProjectVisualProfile>();

function buildPrompt(projectName: string, moodKeywords: string[], format: MediumId | null): string {
  const formatDef = getMedium(format);
  return [
    "You are an art director turning a project's mood keywords into a concrete visual direction for finding reference images.",
    `Project topic: ${projectName}`,
    `Style & mood keywords: ${moodKeywords.join(", ")}`,
    formatDef
      ? `The deliverable FORMAT is explicitly "${formatDef.labelEn}" (id: ${formatDef.id}). ` +
        `References must be ${formatDef.labelEn} works expressing the mood: put "${formatDef.id}" FIRST in mediums, ` +
        `and EVERY searchQuery must start with "${formatDef.labelEn}". Describe colors/styles/techniques as they appear in a ${formatDef.labelEn}.`
      : "The topic does not name a format; choose the mediums that best fit the project.",
    "",
    "Translate the keywords into VISUAL information (color, palette, graphic style, techniques) and pick the visual fields (mediums)",
    "whose references would be most useful for this project. Respond with one JSON object only:",
    "{",
    '  "colors": ["3-6 English color descriptions matching the mood, e.g. \\"warm terracotta\\", \\"faded cream\\""],',
    '  "palette": ["4-6 representative colors as #rrggbb"],',
    '  "mood": ["2-5 English mood adjectives"],',
    '  "style": ["2-5 English graphic style terms, e.g. retro, swiss, brutalist, minimal, psychedelic"],',
    '  "graphicElements": ["2-6 English visual elements/techniques, e.g. grain, halftone, gradient, bold serif typography"],',
    `  "mediums": ["1-3 ids from: ${mediumPromptList()}"],`,
    '  "keywordsKo": ["4-8 specific Korean design terms for this direction, e.g. 레트로 그레인, 파스텔 그라데이션, 스위스 그리드"],',
    '  "searchQueries": ["2-3 English image-search queries of 4-6 general words, each STARTING with a medium (e.g. \\"poster design\\") followed by color + style words. No specific objects or brand names."]',
    "}",
  ].join("\n");
}

async function requestProfile(
  projectName: string,
  moodKeywords: string[],
  format: MediumId | null,
  apiKey: string,
): Promise<ProjectVisualProfile | null> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(projectName, moodKeywords, format) }] }],
        generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
      }),
    },
  );
  if (!response.ok) {
    const body = await response.text();
    if (response.status === 429 || body.includes("RESOURCE_EXHAUSTED")) {
      throw new Error("Gemini API quota exceeded. RESOURCE_EXHAUSTED");
    }
    throw new Error(`Gemini project visual profile failed (${response.status})`);
  }
  const raw = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const json = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  try {
    return parseProjectVisualProfile(JSON.parse(json.trim()) as Record<string, unknown>, moodKeywords, format);
  } catch {
    return null;
  }
}

/**
 * POST /api/project/visual-profile  { projectName, mood }
 *
 * 프로젝트 스타일·무드 키워드(콤마 구분)를 색상 팔레트·그래픽 스타일·분야·검색어로 바꾼다.
 * Gemini를 쓸 수 없으면 키워드 기반 대체 프로필(source: "fallback")을 돌려준다.
 */
export async function POST(request: Request) {
  let body: { projectName?: unknown; mood?: unknown };
  try {
    body = (await request.json()) as { projectName?: unknown; mood?: unknown };
  } catch {
    return Response.json({ error: "JSON body is required." }, { status: 400 });
  }

  const projectName = typeof body.projectName === "string" ? body.projectName.trim().slice(0, 60) : "";
  const mood = typeof body.mood === "string" ? body.mood.trim().slice(0, 120) : "";
  if (!projectName || !mood) {
    return Response.json({ error: "projectName and mood are required." }, { status: 400 });
  }

  const moodKeywords = splitMoodKeywords(mood);
  // 주제에 적힌 작업 형식(포스터·리플렛·명화 …)은 추천의 1순위 조건이다.
  const format = detectExplicitMedium(projectName);
  const cacheKey = `v2\u001f${projectName.toLowerCase()}\u001f${moodKeywords.join(",").toLowerCase()}`;
  const cached = profileCache.get(cacheKey);
  if (cached) {
    return Response.json({ profile: cached, source: "gemini" });
  }

  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    return Response.json({
      profile: fallbackProjectVisualProfile(projectName, mood),
      source: "fallback",
      reason: "missing_api_key",
    });
  }

  try {
    const profile = await requestProfile(projectName, moodKeywords, format, apiKey);
    if (!profile) {
      return Response.json({
        profile: fallbackProjectVisualProfile(projectName, mood),
        source: "fallback",
        reason: "empty_model",
      });
    }
    if (profileCache.size >= CACHE_MAX_ENTRIES) {
      const oldest = profileCache.keys().next().value;
      if (oldest) {
        profileCache.delete(oldest);
      }
    }
    profileCache.set(cacheKey, profile);
    return Response.json({ profile, source: "gemini" });
  } catch (error) {
    return Response.json({
      profile: fallbackProjectVisualProfile(projectName, mood),
      source: "fallback",
      reason: isGeminiQuotaExceededError(error) ? "quota" : "error",
    });
  }
}
