import { fetchAllowedImage } from "@/shared/lib/safeImageFetch";
import { getMedium, isMediumId, mediumPromptList, type MediumId } from "@/shared/lib/visualMedium";

/**
 * 선택한 이미지 레퍼런스의 "시각 프로필"(색상·무드·그래픽 스타일·기법)을 Gemini Vision으로 추출한다.
 * 상세 화면 하단 추천(이미지·텍스트)의 기준이 된다. 파일명·카테고리는 보내지 않고 이미지 바이트만 본다.
 */

export type VisualProfile = {
  /** 시각물의 분야(매체). 추천은 같은 분야 안에서의 시각 유사도를 우선한다. */
  medium: MediumId | null;
  /** 분야 세부 설명 (예: "impressionist oil painting", "swiss typographic poster") */
  mediumDetail: string;
  /** 영어 색상 표현 (예: "muted beige", "deep navy") */
  colors: string[];
  /** 대표 색 #rrggbb */
  palette: string[];
  /** 영어 무드 형용사 */
  mood: string[];
  /** 영어 그래픽 스타일 */
  style: string[];
  /** 영어 시각 요소·기법 (grain, halftone, grid ...) */
  graphicElements: string[];
  /** 텍스트 레퍼런스로 쓸 한국어 디자인 용어 */
  keywordsKo: string[];
  /** Unsplash 검색용 짧은 영어 쿼리 */
  searchQuery: string;
};

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const MAX_PROFILE_IMAGE_BYTES = 4_000_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 400;

const profileCache = new Map<string, { at: number; profile: VisualProfile }>();
const inFlight = new Map<string, Promise<VisualProfile>>();

const PROMPT = [
  "You are a senior graphic designer curating visual references.",
  "First decide the MEDIUM / field of the visual (what kind of visual work it is), then analyze ONLY what is visible:",
  "color, tone, mood, style, and techniques — described in the vocabulary of that medium.",
  "Do not describe the literal subject unless it defines the style. Respond with one JSON object only:",
  "{",
  `  "medium": "exactly one id from: ${mediumPromptList()}",`,
  '  "mediumDetail": "2-5 English words naming the specific kind of work, e.g. \\"impressionist oil painting\\", \\"swiss typographic poster\\", \\"film street photography\\"",',
  '  "colors": ["3-5 English color descriptions, e.g. \\"muted beige\\", \\"deep navy\\", \\"neon pink\\""],',
  '  "palette": ["3-5 dominant colors as #rrggbb"],',
  '  "mood": ["2-4 English mood adjectives, e.g. calm, nostalgic, energetic, moody"],',
  '  "style": ["2-4 English graphic style terms, e.g. minimal, swiss, brutalist, retro, psychedelic, editorial"],',
  '  "graphicElements": ["2-5 English visual elements/techniques, e.g. grain, halftone, grid, gradient, bold typography, collage"],',
  '  "keywordsKo": ["4-6 specific Korean terms describing the color/mood/style IN THAT MEDIUM, e.g. painting: 임파스토 붓터치, 인상주의 빛 표현 / poster: 스위스 스타일, 고대비 타이포그래피"],',
  '  "searchQuery": "4-6 general English words that START with the medium (e.g. \\"oil painting\\", \\"poster design\\") followed by color + mood + style. Do NOT include specific objects, brands or subjects (no \\"handbag\\", \\"leaf\\", \\"street\\")."',
  "}",
  "keywordsKo must be concrete vocabulary of that medium, not vague single words like 색감, 질감, 이미지, 포스터.",
].join("\n");

function cleanList(value: unknown, max: number, maxLength = 40): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim().replace(/\s+/g, " ").slice(0, maxLength);
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
    if (result.length >= max) {
      break;
    }
  }
  return result;
}

function parseProfile(text: string): VisualProfile | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fenced.trim()) as Record<string, unknown>;
  } catch {
    return null;
  }
  const medium = isMediumId(raw.medium) ? raw.medium : null;
  const mediumDetail =
    typeof raw.mediumDetail === "string" ? raw.mediumDetail.trim().slice(0, 60) : "";
  const profile: VisualProfile = {
    medium,
    mediumDetail: mediumDetail || (getMedium(medium)?.labelEn ?? ""),
    colors: cleanList(raw.colors, 5),
    palette: cleanList(raw.palette, 5, 7)
      .map((hex) => hex.toLowerCase())
      .filter((hex) => /^#[0-9a-f]{6}$/.test(hex)),
    mood: cleanList(raw.mood, 4),
    style: cleanList(raw.style, 4),
    graphicElements: cleanList(raw.graphicElements, 5),
    keywordsKo: cleanList(raw.keywordsKo, 6, 24),
    searchQuery: typeof raw.searchQuery === "string" ? raw.searchQuery.trim().slice(0, 80) : "",
  };
  const signalCount =
    profile.colors.length + profile.mood.length + profile.style.length + profile.graphicElements.length;
  if (signalCount === 0) {
    return null;
  }
  if (!profile.searchQuery) {
    profile.searchQuery = [...profile.mood.slice(0, 1), ...profile.colors.slice(0, 1), ...profile.style.slice(0, 2)]
      .join(" ")
      .trim();
  }
  // 검색어가 분야로 시작하지 않으면 분야명을 앞에 붙여 다른 분야 결과가 섞이지 않게 한다.
  const mediumLabel = getMedium(profile.medium)?.labelEn;
  if (mediumLabel && !profile.searchQuery.toLowerCase().includes(mediumLabel.split(" ")[0] ?? "")) {
    profile.searchQuery = `${mediumLabel} ${profile.searchQuery}`.trim();
  }
  return profile;
}

async function requestProfile(imageUrl: string, apiKey: string): Promise<VisualProfile> {
  const { bytes, mimeType } = await fetchAllowedImage(imageUrl, {
    maxBytes: MAX_PROFILE_IMAGE_BYTES,
    timeoutMs: 10_000,
  });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: PROMPT },
              { inlineData: { mimeType: mimeType.startsWith("image/") ? mimeType : "image/jpeg", data: bytes.toString("base64") } },
            ],
          },
        ],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 429 || body.includes("RESOURCE_EXHAUSTED")) {
      throw new Error("Gemini API quota exceeded. RESOURCE_EXHAUSTED");
    }
    throw new Error(`Gemini visual profile failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const raw = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = raw.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const profile = parseProfile(text);
  if (!profile) {
    throw new Error("Gemini visual profile response could not be parsed.");
  }
  return profile;
}

function remember(key: string, profile: VisualProfile) {
  if (profileCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = profileCache.keys().next().value;
    if (oldest) {
      profileCache.delete(oldest);
    }
  }
  profileCache.set(key, { at: Date.now(), profile });
}

/** 같은 이미지는 메모리 캐시·진행 중 요청을 재사용해 Gemini 호출을 줄인다. */
export async function getVisualProfile(imageUrl: string, apiKey: string): Promise<VisualProfile> {
  const url = imageUrl.trim();
  // v3: 분야(medium) 필드·일반화된 검색어 — 이전 형식 캐시를 재사용하지 않는다.
  const key = `v3:${url}`;
  const cached = profileCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.profile;
  }

  const pending = inFlight.get(key);
  if (pending) {
    return pending;
  }

  const request = requestProfile(url, apiKey)
    .then((profile) => {
      remember(key, profile);
      return profile;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, request);
  return request;
}
