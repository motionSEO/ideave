import { composeEnglishDesignQuery } from "@/lib/google-drive/metadata/koreanLexicon";
import { detectExplicitMedium, getMedium, isMediumId, type MediumId } from "@/shared/lib/visualMedium";

/**
 * 프로젝트 "스타일 및 무드" 키워드 → 시각 정보(색상·팔레트·그래픽 스타일·분야·검색어).
 * 서버(Gemini 응답 파싱)와 클라이언트(대체 프로필) 공용. 서버 전용 모듈을 import 하지 말 것.
 */
export type ProjectVisualProfile = {
  /** 사용자가 콤마로 입력한 무드 키워드 */
  moodKeywords: string[];
  /**
   * 프로젝트 주제에 명시된 작업 형식(예: 포스터, 리플렛, 명화). 있으면 추천은 이 형식의 레퍼런스를 우선한다.
   * 주제에 형식이 없으면 null (Gemini가 고른 mediums 는 보조 신호로만 쓴다).
   */
  format: MediumId | null;
  colors: string[];
  /** 무드에 어울리는 대표 색 #rrggbb — 메인 레퍼런스 색상 유사도의 기준 */
  palette: string[];
  mood: string[];
  style: string[];
  graphicElements: string[];
  /** 프로젝트에 맞는 분야(포스터·패키지 등) 1~3개 */
  mediums: MediumId[];
  keywordsKo: string[];
  /** Unsplash 검색어 2~3개 (분야 + 색상 + 스타일) */
  searchQueries: string[];
};

/** "레트로, 따뜻한, 파스텔 톤" → ["레트로", "따뜻한", "파스텔 톤"] */
export function splitMoodKeywords(mood: string): string[] {
  const parts = mood
    .split(/[,，、;/\n]+/)
    .map((part) => part.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  // 콤마 없이 문장으로 쓴 경우에도 동작하도록 한 덩어리로 둔다.
  return [...new Set(parts)].slice(0, 12);
}

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

/** 명시된 형식을 분야 목록 맨 앞에 두고, 모든 검색어가 그 형식으로 시작하게 맞춘다. */
function enforceFormat(profile: ProjectVisualProfile): ProjectVisualProfile {
  const format = profile.format;
  const label = getMedium(format)?.labelEn;
  if (!format || !label) {
    return profile;
  }
  const head = label.split(" ")[0]?.toLowerCase() ?? "";
  return {
    ...profile,
    mediums: [format, ...profile.mediums.filter((id) => id !== format)].slice(0, 3),
    searchQueries: profile.searchQueries.map((query) =>
      head && query.toLowerCase().startsWith(head) ? query : `${label} ${query}`.trim(),
    ),
  };
}

export function parseProjectVisualProfile(
  raw: Record<string, unknown>,
  moodKeywords: string[],
  format: MediumId | null = null,
): ProjectVisualProfile | null {
  const mediums = (Array.isArray(raw.mediums) ? raw.mediums : [])
    .filter((value): value is MediumId => isMediumId(value))
    .slice(0, 3);
  const profile: ProjectVisualProfile = {
    moodKeywords,
    format,
    colors: cleanList(raw.colors, 6),
    palette: cleanList(raw.palette, 6, 7)
      .map((hex) => hex.toLowerCase())
      .filter((hex) => /^#[0-9a-f]{6}$/.test(hex)),
    mood: cleanList(raw.mood, 5),
    style: cleanList(raw.style, 5),
    graphicElements: cleanList(raw.graphicElements, 6),
    mediums: [...new Set(mediums)],
    keywordsKo: cleanList(raw.keywordsKo, 8, 24),
    searchQueries: cleanList(raw.searchQueries, 3, 80),
  };
  if (profile.palette.length === 0 && profile.style.length === 0 && profile.mood.length === 0) {
    return null;
  }
  if (profile.searchQueries.length === 0) {
    profile.searchQueries = fallbackSearchQueries(
      format ? [format, ...profile.mediums] : profile.mediums,
      [...profile.mood, ...profile.style],
    );
  }
  return enforceFormat(profile);
}

function fallbackSearchQueries(mediums: MediumId[], visualWords: string[]): string[] {
  const words = visualWords.slice(0, 4).join(" ").trim();
  const labels = mediums.map((id) => getMedium(id)?.labelEn).filter((label): label is string => Boolean(label));
  if (labels.length === 0) {
    return words ? [`${words} graphic design`] : [];
  }
  return labels.slice(0, 2).map((label) => `${label} ${words}`.trim());
}

/** Gemini를 쓸 수 없을 때: 키워드 자체와 한↔영 사전으로 최소 프로필을 만든다(색상 팔레트 없음). */
export function fallbackProjectVisualProfile(projectName: string, mood: string): ProjectVisualProfile {
  const moodKeywords = splitMoodKeywords(mood);
  const englishMood = composeEnglishDesignQuery(moodKeywords.join(" "));
  const format = detectExplicitMedium(projectName);
  const mediums = format ? [format] : [];
  return {
    moodKeywords,
    format,
    colors: [],
    palette: [],
    mood: englishMood ? englishMood.split(/\s+/).slice(0, 4) : [],
    style: [],
    graphicElements: [],
    mediums,
    keywordsKo: moodKeywords,
    searchQueries: fallbackSearchQueries(mediums, englishMood ? [englishMood] : []),
  };
}
