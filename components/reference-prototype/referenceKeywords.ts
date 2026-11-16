import type { ReferenceItem, ReferenceVisionFields } from "@/components/reference-prototype/data";
import { isGenericExploreTextLabel } from "@/components/reference-prototype/exploreGrid";
import {
  designSearchTermsOverlap,
  exactDesignSynonyms,
  expandKoreanDesignQuery,
  preferKoreanDesignLabel,
} from "@/lib/google-drive/metadata/koreanLexicon";
import { isFormatMediumKeyword, isVagueCategoryKeyword } from "@/shared/lib/commonKeywords";

const STOCK_STOPWORDS = new Set([
  "person",
  "people",
  "man",
  "men",
  "woman",
  "women",
  "human",
  "adult",
  "child",
  "one",
  "two",
  "indoor",
  "outdoor",
  "inside",
  "outside",
  "horizontal",
  "vertical",
  "background",
  "photo",
  "image",
  "picture",
  "photography",
]);

const DESIGN_PHRASES = [
  "graphic design",
  "art direction",
  "visual identity",
  "editorial design",
  "poster design",
  "packaging design",
  "negative space",
  "color palette",
];

const DESIGN_TERMS = [
  "abstract",
  "minimal",
  "minimalist",
  "editorial",
  "poster",
  "typography",
  "typeface",
  "branding",
  "identity",
  "illustration",
  "collage",
  "pattern",
  "texture",
  "grain",
  "gradient",
  "geometric",
  "grid",
  "layout",
  "composition",
  "curve",
  "curves",
  "organic",
  "symmetry",
  "diagonal",
  "overlay",
  "brutalist",
  "retro",
  "vintage",
  "modern",
  "playful",
  "elegant",
  "dynamic",
  "bold",
  "muted",
  "vibrant",
  "colorful",
  "monochrome",
  "pastel",
  "neon",
  "red",
  "pink",
  "blue",
  "green",
  "yellow",
  "orange",
  "purple",
  "teal",
  "cyan",
  "gold",
  "black",
  "white",
  "beige",
  "graphic",
  "print",
  "packaging",
  "composition",
  "contrast",
  "silhouette",
  "lettering",
  "serif",
  "sans",
  "hierarchy",
  "crop",
  "duotone",
  "halftone",
  "risograph",
  "warm",
  "cool",
  "moody",
  "quiet",
  "energetic",
  "tactile",
  "asymmetric",
  "symmetry",
  "overlay",
  "브루탈리즘",
  "미니멀리즘",
  "타이포그래피",
  "포스터",
  "브랜딩",
  "에디토리얼",
  "레이아웃",
  "일러스트",
  "추상",
  "기하",
  "패턴",
  "질감",
  "구도",
  "색감",
  "무드",
  "레트로",
  "빈티지",
  "따뜻한",
  "차가운",
  "키치",
  "네온",
  "하프톤",
  "글리치",
  "필름",
  "그레인",
  "파스텔",
  "모노톤",
  "고대비",
  "여백",
  "리듬",
  "텍스처",
  "손맛",
  "실험적",
];

// Drive 비전 태그로 카탈로그 태그가 수만 개가 되면서 호출마다 RegExp를 만들면 상세 진입이 수 초 멈춘다.
const TERM_PATTERN_CACHE = new Map<string, RegExp>();

function containsTerm(haystack: string, term: string): boolean {
  let pattern = TERM_PATTERN_CACHE.get(term);
  if (!pattern) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    pattern = new RegExp(`(?:^|[^a-z0-9가-힣])${escaped}(?:$|[^a-z0-9가-힣])`, "i");
    TERM_PATTERN_CACHE.set(term, pattern);
  }
  return pattern.test(haystack);
}

function normalizeKeyword(value: string): string {
  return value.trim().replace(/^#/, "").replace(/\s+/g, " ");
}

function keywordKey(value: string): string {
  return normalizeKeyword(value).toLowerCase();
}

function pushUnique(target: string[], value: string, limit: number) {
  const normalized = normalizeKeyword(value);
  if (!normalized || target.length >= limit) {
    return;
  }
  const key = keywordKey(normalized);
  if (STOCK_STOPWORDS.has(key)) {
    return;
  }
  if (target.some((entry) => keywordKey(entry) === key)) {
    return;
  }
  target.push(normalized);
}

function collectSourceText(item: ReferenceItem): string {
  return [
    item.altDescription,
    item.description,
    item.searchQuery,
    item.textLabel,
    ...(item.tags ?? []),
  ]
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .join(" ");
}

const DESIGN_TERMS_CACHE = new Map<string, string[]>();
const DESIGN_TERMS_CACHE_LIMIT = 20000;

function extractDesignTermsFromText(text: string, limit: number): string[] {
  if (!text.trim()) {
    return [];
  }

  const cacheKey = `${limit}\u0000${text}`;
  const cached = DESIGN_TERMS_CACHE.get(cacheKey);
  if (cached) {
    return [...cached];
  }
  if (DESIGN_TERMS_CACHE.size >= DESIGN_TERMS_CACHE_LIMIT) {
    DESIGN_TERMS_CACHE.clear();
  }
  const found = scanDesignTerms(text, limit);
  DESIGN_TERMS_CACHE.set(cacheKey, found);
  return [...found];
}

function scanDesignTerms(text: string, limit: number): string[] {
  const found: string[] = [];
  for (const phrase of DESIGN_PHRASES) {
    if (containsTerm(text, phrase)) {
      pushUnique(found, phrase, limit);
    }
  }
  for (const term of DESIGN_TERMS) {
    if (containsTerm(text, term)) {
      pushUnique(found, term, limit);
    }
  }
  return found;
}

export function extractDesignKeywords(
  item: ReferenceItem,
  extraText = "",
  limit = 6,
): string[] {
  const keywords: string[] = [];
  const sourceText = `${collectSourceText(item)} ${extraText}`.trim();

  for (const tag of item.tags ?? []) {
    const normalized = normalizeKeyword(tag);
    if (!normalized || isGenericExploreTextLabel(normalized)) {
      continue;
    }
    if (
      !isFormatMediumKeyword(normalized) &&
      (DESIGN_TERMS.some((term) => keywordKey(term) === keywordKey(normalized)) ||
      DESIGN_PHRASES.some((phrase) => keywordKey(phrase) === keywordKey(normalized)) ||
      extractDesignTermsFromText(normalized, 1).length > 0)
    ) {
      pushUnique(keywords, normalized, limit);
    }
  }

  for (const term of extractDesignTermsFromText(sourceText, limit)) {
    if (!isGenericExploreTextLabel(term) && !isFormatMediumKeyword(term)) {
      pushUnique(keywords, term, limit);
    }
  }

  if (keywords.length === 0 && item.textLabel?.trim() && !isGenericExploreTextLabel(item.textLabel)) {
    pushUnique(keywords, item.textLabel, 1);
  }

  if (keywords.length < Math.min(3, limit)) {
    for (const tag of item.tags ?? []) {
      const normalized = normalizeKeyword(tag);
      if (!normalized || isGenericExploreTextLabel(normalized) || isFormatMediumKeyword(normalized)) {
        continue;
      }
      pushUnique(keywords, normalized, limit);
      if (keywords.length >= 3) {
        break;
      }
    }
  }

  const moodPad = ["질감", "색감", "구도", "대비", "리듬", "여백"];
  for (const pad of moodPad) {
    if (keywords.length >= Math.min(3, limit)) {
      break;
    }
    pushUnique(keywords, pad, limit);
  }

  return keywords.slice(0, Math.max(3, limit));
}

export function extractDesignKeywordsFromText(text: string, limit = 8): string[] {
  return extractDesignTermsFromText(text, limit).filter((term) => !isGenericExploreTextLabel(term));
}

export function composeRelatedSearchQuery(item: ReferenceItem, keywords: string[]): string {
  const grounded = keywords
    .map((keyword) => normalizeKeyword(keyword))
    .filter(Boolean)
    .slice(0, 4);

  if (grounded.length >= 2) {
    return grounded.join(" ");
  }

  const searchQuery = item.searchQuery?.trim() ?? "";
  if (searchQuery) {
    const extra = grounded.filter(
      (keyword) => !searchQuery.toLowerCase().includes(keyword.toLowerCase()),
    );
    return [searchQuery, ...extra].join(" ").trim();
  }

  return grounded[0] ?? "";
}

export function scoreRelatedReference(
  selectedKeywords: string[],
  candidate: ReferenceItem,
): number {
  if (selectedKeywords.length === 0) {
    return 0;
  }

  const queryExpanded = expandKoreanDesignQuery(selectedKeywords.join(" ")).map((keyword) =>
    keywordKey(keyword),
  );
  const candidateKeywords = extractDesignKeywords(candidate).map((keyword) => keywordKey(keyword));
  const haystack = `${collectSourceText(candidate)} ${candidateKeywords.join(" ")}`.toLowerCase();
  const hayExpanded = new Set(
    expandKoreanDesignQuery(haystack).map((keyword) => keywordKey(keyword)),
  );
  let score = 0;
  const seen = new Set<string>();

  for (const key of queryExpanded) {
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    if (candidateKeywords.includes(key) || hayExpanded.has(key)) {
      score += 3;
      continue;
    }
    if (haystack.includes(key)) {
      score += 1;
    }
  }

  return score;
}

type VisualAxis = "color" | "mood" | "style" | "texture" | "graphic";

const VISUAL_AXIS_TERMS: Record<VisualAxis, string[]> = {
  color: [
    "red",
    "pink",
    "blue",
    "green",
    "yellow",
    "orange",
    "purple",
    "teal",
    "cyan",
    "gold",
    "black",
    "white",
    "beige",
    "pastel",
    "neon",
    "monochrome",
    "colorful",
    "muted",
    "vibrant",
    "warm",
    "cool",
    "duotone",
    "파스텔",
    "네온",
    "모노톤",
    "흑백",
    "따뜻한",
    "차가운",
  ],
  mood: [
    "moody",
    "quiet",
    "energetic",
    "playful",
    "calm",
    "dark",
    "bright",
    "dramatic",
    "soft",
    "elegant",
    "dynamic",
    "bold",
    "expressive",
    "dreamy",
    "nostalgic",
    "차분",
    "고요",
    "강렬",
    "장난",
    "유머",
    "에너지",
    "활기",
    "어두운",
    "밝은",
    "실험적",
  ],
  style: [
    "brutalist",
    "minimal",
    "minimalist",
    "retro",
    "vintage",
    "swiss",
    "bauhaus",
    "editorial",
    "geometric",
    "collage",
    "glassmorphism",
    "kitsch",
    "pop",
    "psychedelic",
    "modern",
    "organic",
    "asymmetric",
    "브루탈리즘",
    "미니멀리즘",
    "레트로",
    "빈티지",
    "바우하우스",
    "에디토리얼",
    "키치",
    "팝아트",
    "글라스모피즘",
  ],
  texture: [
    "grain",
    "halftone",
    "risograph",
    "film",
    "paper",
    "noise",
    "tactile",
    "overlay",
    "그레인",
    "하프톤",
    "리소",
    "필름",
    "손맛",
  ],
  graphic: [
    "typography",
    "lettering",
    "typeface",
    "grid",
    "layout",
    "gradient",
    "pattern",
    "abstract",
    "silhouette",
    "contrast",
    "hierarchy",
    "crop",
    "serif",
    "sans",
    "타이포그래피",
    "그리드",
    "레이아웃",
    "그라데이션",
    "패턴",
    "추상",
    "고대비",
    "여백",
    "리듬",
  ],
};

const RELATED_SUBJECT_IGNORE = new Set(
  [
    "person",
    "people",
    "man",
    "woman",
    "human",
    "portrait",
    "face",
    "seoul",
    "korea",
    "cafe",
    "coffee",
    "food",
    "music",
    "festival",
    "concert",
    "website",
    "app",
    "brand",
    "logo",
    "mockup",
    "office",
    "building",
    "city",
    "street",
    "fashion",
    "패션",
    "인물",
    "음식",
    "카페",
    "음악",
    "축제",
  ].map((value) => value.toLowerCase()),
);

function isIgnoredRelatedTerm(value: string): boolean {
  const key = keywordKey(value);
  if (!key || STOCK_STOPWORDS.has(key) || RELATED_SUBJECT_IGNORE.has(key)) {
    return true;
  }
  if (isFormatMediumKeyword(key) || isVagueCategoryKeyword(key)) {
    return true;
  }
  return false;
}

const VISUAL_AXIS_LOOKUP: Map<string, VisualAxis> = (() => {
  const lookup = new Map<string, VisualAxis>();
  for (const [axis, terms] of Object.entries(VISUAL_AXIS_TERMS) as Array<[VisualAxis, string[]]>) {
    for (const axisTerm of terms) {
      lookup.set(keywordKey(axisTerm), axis);
      for (const entry of expandKoreanDesignQuery(axisTerm)) {
        const key = keywordKey(entry);
        if (key && !lookup.has(key)) {
          lookup.set(key, axis);
        }
      }
    }
  }
  return lookup;
})();

const VISUAL_AXIS_CACHE = new Map<string, VisualAxis | null>();

function visualAxisForTerm(term: string): VisualAxis | null {
  const key = keywordKey(term);
  if (!key) {
    return null;
  }
  if (VISUAL_AXIS_CACHE.has(key)) {
    return VISUAL_AXIS_CACHE.get(key) ?? null;
  }
  if (isIgnoredRelatedTerm(term)) {
    VISUAL_AXIS_CACHE.set(key, null);
    return null;
  }
  const direct = VISUAL_AXIS_LOOKUP.get(key);
  if (direct) {
    VISUAL_AXIS_CACHE.set(key, direct);
    return direct;
  }
  for (const entry of expandKoreanDesignQuery(term)) {
    const axis = VISUAL_AXIS_LOOKUP.get(keywordKey(entry));
    if (axis) {
      VISUAL_AXIS_CACHE.set(key, axis);
      return axis;
    }
  }
  VISUAL_AXIS_CACHE.set(key, null);
  return null;
}

const VISUAL_TERM_KEYS_CACHE = new Map<string, Map<VisualAxis, Set<string>>>();
const VISUAL_TERM_KEYS_CACHE_LIMIT = 5000;

/** 같은 카드의 태그 묶음은 상세를 열 때마다 반복 계산되므로 결과를 재사용한다(호출부는 읽기만 함). */
function collectVisualTermKeys(values: string[]): Map<VisualAxis, Set<string>> {
  const cacheKey = values.join("\u0001");
  const cached = VISUAL_TERM_KEYS_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }
  if (VISUAL_TERM_KEYS_CACHE.size >= VISUAL_TERM_KEYS_CACHE_LIMIT) {
    VISUAL_TERM_KEYS_CACHE.clear();
  }
  const axes = computeVisualTermKeys(values);
  VISUAL_TERM_KEYS_CACHE.set(cacheKey, axes);
  return axes;
}

function computeVisualTermKeys(values: string[]): Map<VisualAxis, Set<string>> {
  const axes = new Map<VisualAxis, Set<string>>();
  const pieces: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    pieces.push(trimmed);
    pieces.push(...trimmed.split(/[\s,/|#+,-]+/).filter((token) => token.length > 1));
    pieces.push(...extractDesignTermsFromText(trimmed, 12));
  }

  for (const piece of pieces) {
    const axis = visualAxisForTerm(piece);
    if (!axis) {
      continue;
    }
    const bucket = axes.get(axis) ?? new Set<string>();
    for (const entry of expandKoreanDesignQuery(piece)) {
      const key = keywordKey(entry);
      if (key && !isIgnoredRelatedTerm(key)) {
        bucket.add(key);
      }
    }
    if (bucket.size > 0) {
      axes.set(axis, bucket);
    }
  }
  return axes;
}

export function extractVisualKeywords(item: ReferenceItem, extraText = "", limit = 10): string[] {
  const keywords: string[] = [];
  const source = `${collectSourceText(item)} ${extraText}`;
  for (const tag of item.tags ?? []) {
    if (visualAxisForTerm(tag)) {
      pushUnique(keywords, tag, limit);
    }
  }
  for (const term of extractDesignTermsFromText(source, limit + 6)) {
    if (visualAxisForTerm(term)) {
      pushUnique(keywords, term, limit);
    }
  }
  return keywords.slice(0, limit);
}

export function composeVisualRelatedSearchQuery(item: ReferenceItem, keywords: string[]): string {
  const visual = (keywords.length > 0 ? keywords : extractVisualKeywords(item)).filter(
    (keyword) => visualAxisForTerm(keyword),
  );
  const colorMood = visual.filter((keyword) => {
    const axis = visualAxisForTerm(keyword);
    return axis === "color" || axis === "mood";
  });
  const ordered = [...colorMood, ...visual.filter((keyword) => !colorMood.includes(keyword))];
  if (ordered.length > 0) {
    return ordered.slice(0, 4).join(" ");
  }
  const tags = (item.tags ?? []).map((tag) => tag.trim()).filter(Boolean);
  if (tags.length > 0) {
    return tags.slice(0, 3).join(" ");
  }
  return "graphic design color mood";
}

export function scoreVisualRelatedReference(
  selectedKeywords: string[],
  candidate: ReferenceItem,
  options?: { minAxes?: number },
): number {
  const minAxes = options?.minAxes ?? 1;
  const queryAxes = collectVisualTermKeys(selectedKeywords);
  if (queryAxes.size === 0) {
    return 0;
  }

  const candidateAxes = collectVisualTermKeys([
    ...(candidate.tags ?? []),
    candidate.altDescription ?? "",
    candidate.description ?? "",
    ...extractVisualKeywords(candidate),
  ]);

  let score = 0;
  let axisHits = 0;
  for (const [axis, selectedKeys] of queryAxes) {
    const candidateKeys = candidateAxes.get(axis);
    if (!candidateKeys) {
      continue;
    }
    let overlap = 0;
    for (const key of selectedKeys) {
      if (candidateKeys.has(key)) {
        overlap += 1;
      }
    }
    if (overlap === 0) {
      continue;
    }
    axisHits += 1;
    const weight = axis === "color" || axis === "mood" ? 6 : axis === "style" || axis === "texture" ? 4 : 2;
    score += overlap * weight;
  }

  if (axisHits >= minAxes) {
    return score;
  }
  if (minAxes <= 1 && axisHits >= 1) {
    return score;
  }
  if (axisHits === 1 && score > 0) {
    return score;
  }

  return 0;
}

const COLOR_FAMILIES: string[][] = [
  ["red", "pink", "orange", "yellow", "gold", "beige", "warm", "따뜻한"],
  ["blue", "teal", "cyan", "green", "purple", "cool", "차가운"],
  ["black", "white", "monochrome", "muted", "모노톤", "흑백"],
  ["pastel", "soft", "파스텔"],
  ["neon", "vibrant", "colorful", "네온", "강렬"],
];

const MOOD_FAMILIES: string[][] = [
  ["quiet", "calm", "soft", "dark", "moody", "elegant", "차분", "고요", "어두운"],
  ["energetic", "playful", "bold", "dramatic", "bright", "dynamic", "활기", "장난", "밝은", "에너지"],
  ["retro", "vintage", "nostalgic", "레트로", "빈티지"],
];

function expandedKeysFromValues(values: string[]): Set<string> {
  const keys = new Set<string>();
  for (const value of values) {
    if (!value.trim()) {
      continue;
    }
    for (const entry of expandKoreanDesignQuery(value)) {
      const key = keywordKey(entry);
      if (key) {
        keys.add(key);
      }
    }
    for (const token of value.toLowerCase().split(/[\s,/|#+,-]+/).filter((part) => part.length > 1)) {
      keys.add(token);
    }
  }
  return keys;
}

function familyOverlapScore(families: string[][], left: Set<string>, right: Set<string>, weight: number): number {
  let score = 0;
  for (const family of families) {
    const aliases = new Set(family.map((term) => keywordKey(term)));
    const leftHit = [...left].some((key) => aliases.has(key));
    const rightHit = [...right].some((key) => aliases.has(key));
    if (leftHit && rightHit) {
      score += weight;
    }
  }
  return score;
}

function collectItemSignalValues(item: ReferenceItem): string[] {
  const alt = item.altDescription?.trim().slice(0, 80) ?? "";
  return [...(item.tags ?? []), alt, ...extractVisualKeywords(item)];
}

function keysFromAxes(axes: Map<VisualAxis, Set<string>>): Set<string> {
  const keys = new Set<string>();
  for (const bucket of axes.values()) {
    for (const key of bucket) {
      keys.add(key);
    }
  }
  return keys;
}

export function scoreColorMoodAffinity(selected: ReferenceItem, candidate: ReferenceItem): number {
  const left = expandedKeysFromValues(collectItemSignalValues(selected));
  const right = expandedKeysFromValues(collectItemSignalValues(candidate));
  return scoreColorMoodKeys(left, right);
}

function scoreColorMoodKeys(left: Set<string>, right: Set<string>): number {
  let exact = 0;
  for (const key of left) {
    if (right.has(key) && (visualAxisForTerm(key) === "color" || visualAxisForTerm(key) === "mood")) {
      exact += 1;
    }
  }
  return (
    exact * 7 +
    familyOverlapScore(COLOR_FAMILIES, left, right, 8) +
    familyOverlapScore(MOOD_FAMILIES, left, right, 7)
  );
}

function scoreAxesOverlap(
  selectedAxes: Map<VisualAxis, Set<string>>,
  candidateAxes: Map<VisualAxis, Set<string>>,
): number {
  let score = 0;
  for (const [axis, selectedKeys] of selectedAxes) {
    const candidateKeys = candidateAxes.get(axis);
    if (!candidateKeys) {
      continue;
    }
    let overlap = 0;
    for (const key of selectedKeys) {
      if (candidateKeys.has(key)) {
        overlap += 1;
      }
    }
    if (overlap === 0) {
      continue;
    }
    const weight = axis === "color" || axis === "mood" ? 6 : axis === "style" || axis === "texture" ? 4 : 2;
    score += overlap * weight;
  }
  return score;
}

export type WovenImages = {
  /** 텍스트 카드에 꿰어 보여줄 썸네일 URL(최대 3장) */
  thumbs: string[];
  /** 키워드와 엮인 이미지 전체 수 */
  total: number;
  /** 엮인 이미지 전체(대표성 순). 텍스트 상세의 추천 그리드도 이 순서로 시작한다. */
  items: ReferenceItem[];
};

const WOVEN_THUMB_COUNT = 3;

/** Drive 원본은 수 MB라, 텍스트 카드의 작은 썸네일은 Drive 미리보기(약 128px)로 받는다. */
function wovenThumbnailUrl(url: string): string {
  return url.startsWith("/api/drive/file/") && !url.includes("?") ? `${url}?size=thumb` : url;
}

function splitWovenWords(term: string): string[] {
  return term.trim().split(/[\s·,/]+/).filter(Boolean);
}

/** 키워드 자체 + 정확한 동의어(브루탈리즘 ↔ brutalism). 부분 일치로 번지지 않게 한다. */
function wovenKeysFor(term: string): string[] {
  return [term, ...exactDesignSynonyms(term)].map(keywordKey).filter(Boolean);
}

type WovenField = keyof ReferenceVisionFields | "tags";

/** 비전 필드별 기본 가중치. 사조·디자인어가 겹치면 "그 키워드다운" 이미지일 가능성이 가장 크다. */
const WOVEN_FIELD_WEIGHT: Record<WovenField, number> = {
  style: 2.5,
  designKeywords: 2.2,
  visualElements: 2,
  mood: 1.5,
  color: 1.2,
  subject: 1,
  tags: 1.2,
};
/** 키워드가 색·무드일 때는 해당 필드가 결정적이다(예: "화이트" → 주된 색이 흰색인 이미지). */
const WOVEN_AXIS_FIELD_WEIGHT = 3;
/** 필드 안 순서 가중치: 비전 분석은 대표적인 것부터 적는다(색은 주된 색부터). */
const WOVEN_POSITION_WEIGHT = [1, 0.75, 0.55, 0.4, 0.3, 0.25, 0.2];
/**
 * 이 점수 미만은 엮지 않는다. 색 키워드는 3번째 색까지, 사조·디자인어는 앞쪽 두세 개까지만 통과해
 * "4~5번째 색으로 살짝 걸친" 이미지 같은 약한 연결이 빠진다.
 */
const WOVEN_MIN_SCORE = 1.5;
/** 엄격 기준을 통과한 이미지가 하나도 없을 때(표현이 다른 여러 단어 키워드 등) 쓰는 완화 기준 */
const WOVEN_FALLBACK_MIN_SCORE = 0.3;

type WovenEntry = { field: WovenField; position: number; key: string; words: string[] };

function wovenEntriesFor(item: ReferenceItem): WovenEntry[] {
  const entries: WovenEntry[] = [];
  const push = (field: WovenField, values: string[]) => {
    values.forEach((value, position) => {
      const key = keywordKey(value);
      if (key) {
        entries.push({ field, position, key, words: splitWovenWords(key) });
      }
    });
  };
  if (item.vision) {
    for (const field of Object.keys(item.vision) as (keyof ReferenceVisionFields)[]) {
      push(field, item.vision[field] ?? []);
    }
  } else {
    push("tags", item.tags ?? []);
  }
  return entries;
}

/** 키워드와 태그 한 개가 얼마나 같은 말인지 0~1 */
function wovenMatchStrength(entry: WovenEntry, labelKeys: Set<string>, labelWords: string[][]): number {
  if (labelKeys.has(entry.key)) {
    return 1;
  }
  // "화이트 배경", "미니멀리즘 포스터"처럼 키워드를 통째로 품은 태그
  for (const key of labelKeys) {
    if (key.length >= 2 && entry.key.includes(key)) {
      return 0.7;
    }
  }
  // 낱말 단위: 키워드 낱말마다 같은 말(동의어 포함)이면 1, 그 말로 시작하면 0.5 ("수채" → "수채화")
  let credit = 0;
  for (const aliases of labelWords) {
    if (entry.words.some((word) => aliases.includes(word))) {
      credit += 1;
    } else if (entry.words.some((word) => aliases.some((alias) => alias.length >= 2 && word.startsWith(alias)))) {
      credit += 0.5;
    }
  }
  return labelWords.length > 0 ? 0.45 * (credit / labelWords.length) : 0;
}

function wovenTieBreak(label: string, id: string): number {
  let hash = 2166136261;
  for (const char of `${label}\u0000${id}`) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}

/**
 * 텍스트 레퍼런스 카드의 "구슬 실": 키워드를 가장 잘 대표하는 수집 이미지를 고른다.
 * 점수 = Σ(필드 가중치 × 필드 안 순서 가중치 × 일치 강도). 키워드가 색·무드면 그 필드 가중치를 높이고,
 * 약하게 걸친 이미지(WOVEN_MIN_SCORE 미만)는 빼며, 동점은 키워드마다 다르게 섞어 카드마다 같은 이미지가
 * 반복되지 않게 한다. 이미지별 태그는 한 번만 풀어 두고, 키워드별 결과는 캐시한다.
 */
export function buildWovenImageLookup(items: ReferenceItem[]): (label: string) => WovenImages {
  const catalog = items
    .filter((item) => item.type !== "text" && Boolean(item.imageUrl))
    .map((item) => ({ item, entries: wovenEntriesFor(item), description: (item.description ?? "").toLowerCase() }));

  const cache = new Map<string, WovenImages>();
  return (label: string) => {
    const cached = cache.get(label);
    if (cached) {
      return cached;
    }
    const labelKeys = new Set(wovenKeysFor(label));
    const labelWords = splitWovenWords(keywordKey(label)).map((word) => wovenKeysFor(word));
    const axis = visualAxisForTerm(label);
    const fieldWeight = (field: WovenField) =>
      (axis === "color" && field === "color") || (axis === "mood" && field === "mood")
        ? WOVEN_AXIS_FIELD_WEIGHT
        : WOVEN_FIELD_WEIGHT[field];
    const descriptionKeys = [...labelKeys].filter((key) => key.length >= 2);

    const scored = catalog
      .map(({ item, entries, description }) => {
        // 같은 필드에서 여러 태그가 걸려도 가장 강한 하나만 센다(동의어 중복 가산 방지).
        const bestByField = new Map<WovenField, number>();
        for (const entry of entries) {
          const strength = wovenMatchStrength(entry, labelKeys, labelWords);
          if (strength <= 0) {
            continue;
          }
          const weight = WOVEN_POSITION_WEIGHT[entry.position] ?? WOVEN_POSITION_WEIGHT.at(-1)!;
          const value = fieldWeight(entry.field) * weight * strength;
          if (value > (bestByField.get(entry.field) ?? 0)) {
            bestByField.set(entry.field, value);
          }
        }
        let score = [...bestByField.values()].reduce((sum, value) => sum + value, 0);
        // 설명 문장에 키워드나 동의어가 나오면 가산 ("화이트" ↔ "흰색 침구")
        if (descriptionKeys.some((key) => description.includes(key))) {
          score += 0.4;
        }
        return { item, score };
      })
      .sort(
        (left, right) =>
          right.score - left.score || wovenTieBreak(label, left.item.id) - wovenTieBreak(label, right.item.id),
      );
    const strict = scored.filter((hit) => hit.score >= WOVEN_MIN_SCORE);
    const ranked = strict.length > 0 ? strict : scored.filter((hit) => hit.score >= WOVEN_FALLBACK_MIN_SCORE);

    const result: WovenImages = {
      thumbs: ranked.slice(0, WOVEN_THUMB_COUNT).map((hit) => wovenThumbnailUrl(hit.item.imageUrl!)),
      total: ranked.length,
      items: ranked.map((hit) => hit.item),
    };
    cache.set(label, result);
    return result;
  };
}

export function rankCatalogRelatedImages(
  selected: ReferenceItem,
  catalog: ReferenceItem[],
  limit: number,
  options?: { requireOverlap?: boolean },
): ReferenceItem[] {
  const pool = catalog.filter(
    (item) =>
      item.type !== "text" &&
      item.id !== selected.id &&
      Boolean(item.imageUrl) &&
      item.imageUrl !== selected.imageUrl,
  );
  if (pool.length === 0) {
    return [];
  }

  const selectedTerms = collectItemSignalValues(selected);
  const selectedAxes = collectVisualTermKeys(selectedTerms);
  const selectedKeys = keysFromAxes(selectedAxes);

  const scored = pool.map((item, index) => {
    const candidateTerms = collectItemSignalValues(item);
    const candidateAxes = collectVisualTermKeys(candidateTerms);
    const candidateKeys = keysFromAxes(candidateAxes);
    return {
      item,
      index,
      score: scoreAxesOverlap(selectedAxes, candidateAxes) + scoreColorMoodKeys(selectedKeys, candidateKeys),
    };
  });
  scored.sort((left, right) => right.score - left.score || left.index - right.index);
  // requireOverlap: 시각 태그가 하나도 겹치지 않는(점수 0) 항목은 추천하지 않는다.
  const eligible = options?.requireOverlap ? scored.filter((entry) => entry.score > 0) : scored;
  return eligible.slice(0, Math.min(limit, eligible.length)).map((entry) => entry.item);
}

function isCollectedCatalogItem(item: ReferenceItem): boolean {
  return item.source === "google-drive" || item.source === "upload";
}

/** 수집 DB(Drive/업로드) 레퍼런스에 실제로 붙은 시각 키워드를 빈도순 해시태그로 만든다. */
export function collectCatalogSearchHashtags(
  items: ReferenceItem[],
  options?: { limit?: number; boostTerms?: string[] },
): string[] {
  const limit = options?.limit ?? 8;
  const boostTerms = options?.boostTerms ?? [];
  const counts = new Map<string, { label: string; count: number; boost: number }>();

  for (const item of items) {
    if (item.type === "text" || !isCollectedCatalogItem(item)) {
      continue;
    }
    const terms = [
      ...extractVisualKeywords(item, "", 12),
      ...(item.tags ?? []),
    ];
    const seenInItem = new Set<string>();
    for (const term of terms) {
      const normalized = normalizeKeyword(term);
      if (!normalized || isIgnoredRelatedTerm(normalized) || isGenericExploreTextLabel(normalized)) {
        continue;
      }
      if (!visualAxisForTerm(normalized)) {
        continue;
      }
      const label = preferKoreanDesignLabel(normalized);
      const key = keywordKey(label);
      if (!key || seenInItem.has(key)) {
        continue;
      }
      seenInItem.add(key);
      const current = counts.get(key) ?? { label, count: 0, boost: 0 };
      current.count += 1;
      counts.set(key, current);
    }
  }

  for (const [key, entry] of counts) {
    entry.boost = boostTerms.some((term) => designSearchTermsOverlap(entry.label, term)) ? 8 : 0;
    counts.set(key, entry);
  }

  return [...counts.values()]
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count + right.boost - (left.count + left.boost) || left.label.localeCompare(right.label, "ko"))
    .slice(0, limit)
    .map((entry) => `#${entry.label.replace(/^#/, "")}`);
}
