import type { ReferenceItem } from "@/components/reference-prototype/data";
import type { ExploreTextCategory, ExploreTextEntry } from "@/components/reference-prototype/exploreGrid";
import { isGenericExploreTextLabel } from "@/components/reference-prototype/exploreGrid";
import {
  designSearchTermsOverlap,
  expandKoreanDesignQuery,
  preferKoreanDesignLabel,
} from "@/lib/google-drive/metadata/koreanLexicon";
import {
  getMedium,
  inferMedium,
  mediumMatchScore,
  type MediumGuess,
  type MediumId,
} from "@/shared/lib/visualMedium";
import type { ProjectVisualProfile } from "@/shared/lib/projectVisual";
import type { VisualProfile } from "@/shared/lib/visualProfile";

export type { ProjectVisualProfile, VisualProfile };

/** 프로젝트 무드 프로필을 이미지 프로필 형식으로 맞춰 용어 매칭·텍스트 레퍼런스 생성에 재사용한다. */
export function projectProfileAsVisualProfile(profile: ProjectVisualProfile): VisualProfile {
  return {
    medium: profile.mediums[0] ?? null,
    mediumDetail: "",
    colors: profile.colors,
    palette: profile.palette,
    mood: profile.mood,
    style: profile.style,
    graphicElements: profile.graphicElements,
    keywordsKo: profile.keywordsKo,
    searchQuery: profile.searchQueries[0] ?? "",
  };
}

/** 레퍼런스 항목의 분야 추정 (Drive는 카테고리 폴더, 그 외는 태그·설명) */
export function inferItemMedium(item: ReferenceItem): MediumGuess | null {
  return inferMedium({
    source: item.source,
    category: item.source === "google-drive" ? item.searchQuery : undefined,
    tags: item.tags,
    description: item.description,
    altDescription: item.source === "google-drive" ? undefined : item.altDescription,
    searchQuery: item.searchQuery,
  });
}

/** 선택 이미지의 분야: Gemini 프로필 우선, 없으면 항목 정보로 추정 */
export function resolveSelectedMedium(
  profile: VisualProfile | null,
  selected: ReferenceItem,
): MediumId | null {
  return profile?.medium ?? inferItemMedium(selected)?.id ?? null;
}

/**
 * 상세 화면 추천용 시각 유사도.
 *
 * 1) 픽셀 색상 특징: 브라우저에서 이미지를 32×32로 줄여 색상 분포·평균색(Lab)·채도·명도·대비를 계산
 * 2) 시각 프로필 용어: 선택 이미지의 Gemini 분석(색상·무드·스타일·기법)과 후보의 태그·설명·카테고리 매칭
 */

const HUE_BINS = 12;
/** 12개 색상 bin + 무채색(어두움) + 무채색(밝음) */
const HIST_SIZE = HUE_BINS + 2;
const SAMPLE_EDGE = 32;
const FEATURE_TIMEOUT_MS = 8000;
const FEATURE_CONCURRENCY = 8;

export type ColorFeatures = {
  hist: number[];
  lab: [number, number, number];
  saturation: number;
  lightness: number;
  contrast: number;
};

const featureCache = new Map<string, Promise<ColorFeatures | null>>();

/** 색상 분석은 작은 이미지로 충분하다: Unsplash(imgix)는 w=96, Drive는 썸네일(약 128px). */
function featureSampleUrl(url: string): string {
  if (/^\/api\/drive\/file\/[^/?#]+$/.test(url)) {
    return `${url}?size=thumb`;
  }
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.hostname === "images.unsplash.com" || parsed.hostname === "plus.unsplash.com") {
      parsed.searchParams.set("w", "96");
      parsed.searchParams.set("q", "60");
      return parsed.toString();
    }
  } catch {
    // keep original
  }
  return url;
}

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const x = (lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047;
  const y = lr * 0.2126 + lg * 0.7152 + lb * 0.0722;
  const z = (lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) {
    return [0, 0, l];
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) {
    h = (gn - bn) / d + (gn < bn ? 6 : 0);
  } else if (max === gn) {
    h = (bn - rn) / d + 2;
  } else {
    h = (rn - gn) / d + 4;
  }
  return [h * 60, s, l];
}

function computeFeatures(data: Uint8ClampedArray): ColorFeatures | null {
  const hist = new Array<number>(HIST_SIZE).fill(0);
  let count = 0;
  let sumL = 0;
  let sumA = 0;
  let sumB = 0;
  let sumSat = 0;
  let sumLight = 0;
  let sumLightSq = 0;

  for (let index = 0; index < data.length; index += 4) {
    if ((data[index + 3] ?? 0) < 128) {
      continue;
    }
    const r = data[index] ?? 0;
    const g = data[index + 1] ?? 0;
    const b = data[index + 2] ?? 0;
    const [h, s, l] = rgbToHsl(r, g, b);
    const chroma = s * (1 - Math.abs(2 * l - 1));
    if (chroma < 0.12) {
      hist[l < 0.5 ? HUE_BINS : HUE_BINS + 1] += 1;
    } else {
      hist[Math.min(HUE_BINS - 1, Math.floor(h / (360 / HUE_BINS)))] += 1;
    }
    const [labL, labA, labB] = rgbToLab(r, g, b);
    sumL += labL;
    sumA += labA;
    sumB += labB;
    sumSat += s;
    sumLight += l;
    sumLightSq += l * l;
    count += 1;
  }

  if (count === 0) {
    return null;
  }

  const meanLight = sumLight / count;
  return {
    hist: hist.map((value) => value / count),
    lab: [sumL / count, sumA / count, sumB / count],
    saturation: sumSat / count,
    lightness: meanLight,
    contrast: Math.sqrt(Math.max(0, sumLightSq / count - meanLight * meanLight)),
  };
}

/**
 * 프로젝트 무드 팔레트(#hex 목록)를 이미지와 같은 형식의 색상 특징으로 만든다.
 * 각 색을 같은 비율의 픽셀로 보고 계산하므로 이미지 특징과 그대로 비교할 수 있다.
 */
export function featuresFromPalette(palette: string[]): ColorFeatures | null {
  const colors = palette
    .map((hex) => /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1])
    .filter((hex): hex is string => Boolean(hex));
  if (colors.length === 0) {
    return null;
  }
  const pixelsPerColor = 64;
  const data = new Uint8ClampedArray(colors.length * pixelsPerColor * 4);
  colors.forEach((hex, colorIndex) => {
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    for (let pixel = 0; pixel < pixelsPerColor; pixel += 1) {
      const offset = (colorIndex * pixelsPerColor + pixel) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 255;
    }
  });
  return computeFeatures(data);
}

function loadFeatures(url: string): Promise<ColorFeatures | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    const timer = window.setTimeout(() => {
      image.src = "";
      resolve(null);
    }, FEATURE_TIMEOUT_MS);
    image.onload = () => {
      window.clearTimeout(timer);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = SAMPLE_EDGE;
        canvas.height = SAMPLE_EDGE;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(image, 0, 0, SAMPLE_EDGE, SAMPLE_EDGE);
        resolve(computeFeatures(ctx.getImageData(0, 0, SAMPLE_EDGE, SAMPLE_EDGE).data));
      } catch {
        // CORS로 캔버스가 오염되면 색상 특징 없이 용어 매칭만 사용한다.
        resolve(null);
      }
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    image.src = featureSampleUrl(url);
  });
}

export function getColorFeatures(url: string): Promise<ColorFeatures | null> {
  const key = url.trim();
  if (!key) {
    return Promise.resolve(null);
  }
  const cached = featureCache.get(key);
  if (cached) {
    return cached;
  }
  const pending = loadFeatures(key);
  featureCache.set(key, pending);
  return pending;
}

/** 여러 이미지의 색상 특징을 동시 요청 수를 제한해 계산한다. */
export async function getColorFeaturesForItems(
  items: ReferenceItem[],
  signal?: AbortSignal,
): Promise<Map<string, ColorFeatures>> {
  const result = new Map<string, ColorFeatures>();
  const queue = items.filter((item) => Boolean(item.imageUrl));
  let cursor = 0;

  const worker = async () => {
    while (cursor < queue.length) {
      if (signal?.aborted) {
        return;
      }
      const item = queue[cursor];
      cursor += 1;
      if (!item?.imageUrl) {
        continue;
      }
      const features = await getColorFeatures(item.imageUrl);
      if (features) {
        result.set(item.id, features);
      }
    }
  };

  await Promise.all(Array.from({ length: FEATURE_CONCURRENCY }, () => worker()));
  return result;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** 0~1. 색상 분포 교집합 + 평균색 거리 + 톤(채도·명도·대비) 차이 */
export function colorSimilarity(left: ColorFeatures, right: ColorFeatures): number {
  let intersection = 0;
  for (let index = 0; index < HIST_SIZE; index += 1) {
    intersection += Math.min(left.hist[index] ?? 0, right.hist[index] ?? 0);
  }
  const deltaE = Math.hypot(
    left.lab[0] - right.lab[0],
    left.lab[1] - right.lab[1],
    left.lab[2] - right.lab[2],
  );
  const labSimilarity = Math.exp(-deltaE / 35);
  const toneSimilarity = clamp01(
    1 -
      (Math.abs(left.saturation - right.saturation) +
        Math.abs(left.lightness - right.lightness) +
        Math.abs(left.contrast - right.contrast) * 1.5) /
        1.2,
  );
  return clamp01(intersection * 0.45 + labSimilarity * 0.35 + toneSimilarity * 0.2);
}

function termKey(value: string): string {
  return value.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, " ");
}

/** 프로필 용어(영어·한국어)를 비교용 키 집합으로 확장 */
export function profileTermKeys(profile: VisualProfile): Set<string> {
  const keys = new Set<string>();
  const values = [
    ...profile.colors,
    ...profile.mood,
    ...profile.style,
    ...profile.graphicElements,
    ...profile.keywordsKo,
  ];
  for (const value of values) {
    const key = termKey(value);
    if (!key) {
      continue;
    }
    keys.add(key);
    for (const token of key.split(/[\s,/|+-]+/)) {
      if (token.length > 2) {
        keys.add(token);
      }
    }
    for (const expanded of expandKoreanDesignQuery(value)) {
      const expandedKey = termKey(expanded);
      if (expandedKey.length > 1) {
        keys.add(expandedKey);
      }
    }
  }
  return keys;
}

function candidateHaystack(item: ReferenceItem): string {
  return [item.altDescription, item.description, item.searchQuery, item.textLabel, ...(item.tags ?? [])]
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .join(" ")
    .toLowerCase()
    .replace(/typhography/g, "typography");
}

/** 0~1. 후보의 태그·설명·카테고리가 선택 이미지의 시각 프로필 용어와 얼마나 겹치는지 */
export function profileTermSimilarity(keys: Set<string>, item: ReferenceItem): number {
  if (keys.size === 0) {
    return 0;
  }
  const haystack = candidateHaystack(item);
  if (!haystack) {
    return 0;
  }
  const expandedHay = new Set(expandKoreanDesignQuery(haystack).map(termKey));
  let hits = 0;
  for (const key of keys) {
    if (expandedHay.has(key) || (key.length > 2 && haystack.includes(key))) {
      hits += 1;
    }
  }
  return clamp01(hits / 4);
}

export type VisualRankInput = {
  selected: ReferenceItem;
  candidates: ReferenceItem[];
  selectedFeatures: ColorFeatures | null;
  candidateFeatures: Map<string, ColorFeatures>;
  profileKeys: Set<string>;
  /** 선택 이미지의 분야. 있으면 같은 분야 → 같은 계열 → 기타 순으로 우선한다. */
  selectedMedium?: MediumId | null;
  /** 여러 분야를 목표로 할 때(프로젝트 추천). 가장 잘 맞는 분야 기준으로 점수를 매긴다. */
  targetMediums?: MediumId[];
  /**
   * 분야 점수 비중(0~1, 기본 0.5). 상세 화면은 선택 이미지의 분야를 우선해 0.5,
   * 프로젝트 추천은 사용자가 입력한 색상·스타일 무드가 우선이라 더 낮게 쓴다.
   */
  mediumWeight?: number;
  limit: number;
};

export type ScoredCandidate = {
  item: ReferenceItem;
  /** 최종 정렬 점수 (분야 + 시각) */
  score: number;
  /** 시각 유사도(색상·프로필 용어) 0~1 */
  visual: number;
  /** 목표 분야 일치도 (1 / 0.55 / 0.3 / 0). 목표 분야가 없으면 null */
  medium: number | null;
  index: number;
};

/**
 * 분야 일치도 + (색상 특징·프로필 용어) 시각 유사도로 점수를 매겨 높은 순으로 정렬한다.
 * 분야를 알면 점수 = 분야 50% + 시각 50% 이므로 같은 분야 후보가 다른 분야 후보보다 항상 앞선다.
 */
export function scoreVisualCandidates(input: VisualRankInput): ScoredCandidate[] {
  const { selected, candidates, selectedFeatures, candidateFeatures, profileKeys } = input;
  const targetMediums = [
    ...new Set([...(input.selectedMedium ? [input.selectedMedium] : []), ...(input.targetMediums ?? [])]),
  ];
  const seen = new Set<string>();
  const scored: ScoredCandidate[] = [];

  candidates.forEach((item, index) => {
    if (
      item.type === "text" ||
      !item.imageUrl ||
      item.id === selected.id ||
      item.imageUrl === selected.imageUrl ||
      seen.has(item.id)
    ) {
      return;
    }
    seen.add(item.id);
    const features = candidateFeatures.get(item.id);
    const color = selectedFeatures && features ? colorSimilarity(selectedFeatures, features) : null;
    const terms = profileTermSimilarity(profileKeys, item);
    const visual =
      color === null ? terms * 0.6 : profileKeys.size > 0 ? color * 0.65 + terms * 0.35 : color;
    let score = visual;
    let medium: number | null = null;
    if (targetMediums.length > 0) {
      const guess = inferItemMedium(item);
      medium = Math.max(...targetMediums.map((target) => mediumMatchScore(target, guess)));
      const weight = clamp01(input.mediumWeight ?? 0.5);
      score = medium * weight + visual * (1 - weight);
    }
    scored.push({ item, score, visual, medium, index });
  });

  scored.sort((left, right) => right.score - left.score || left.index - right.index);
  return scored;
}

export function rankVisuallySimilar(input: VisualRankInput): ReferenceItem[] {
  return scoreVisualCandidates(input)
    .slice(0, input.limit)
    .map((entry) => entry.item);
}

/** 사용자가 직접 모은 레퍼런스(Google Drive 개인 DB·업로드) — 추천에서 항상 우선 노출 */
export function isCollectedReference(item: ReferenceItem): boolean {
  return item.source === "google-drive" || item.source === "upload";
}

/**
 * 수집 레퍼런스가 "충분히 비슷한지" 판단하는 최소 시각 유사도.
 * 분야가 맞을수록 기준을 낮춰, 같은 분야 Drive 이미지는 최대한 추천에 남긴다.
 */
export const COLLECTED_MIN_VISUAL = {
  sameMedium: 0.2,
  sameFamily: 0.45,
  unknownMedium: 0.5,
  otherMedium: 0.65,
  noTarget: 0.4,
} as const;

export function isRelevantCollected(entry: ScoredCandidate): boolean {
  if (entry.medium === null) {
    return entry.visual >= COLLECTED_MIN_VISUAL.noTarget;
  }
  if (entry.medium >= 1) {
    return entry.visual >= COLLECTED_MIN_VISUAL.sameMedium;
  }
  if (entry.medium >= 0.55) {
    return entry.visual >= COLLECTED_MIN_VISUAL.sameFamily;
  }
  if (entry.medium >= 0.3) {
    return entry.visual >= COLLECTED_MIN_VISUAL.unknownMedium;
  }
  return entry.visual >= COLLECTED_MIN_VISUAL.otherMedium;
}

/** 이미 점수를 매긴 수집 레퍼런스 중 충분히 비슷한 것(유사도 순). 이 수가 limit 이상이면 Unsplash를 부르지 않는다. */
export function relevantCollectedItems(scored: ScoredCandidate[], limit: number): ReferenceItem[] {
  return scored
    .filter((entry) => isCollectedReference(entry.item) && isRelevantCollected(entry))
    .slice(0, limit)
    .map((entry) => entry.item);
}

/**
 * Drive 우선 구성: 충분히 비슷한 수집 레퍼런스를 유사도 순으로 먼저 채우고,
 * 모자랄 때만 Unsplash(원격) 결과를 유사도 순으로 맨 뒤에 붙인다.
 */
export function composeCollectedFirst(
  collected: ReferenceItem[],
  remoteScored: ScoredCandidate[],
  limit: number,
): ReferenceItem[] {
  const result = collected.slice(0, limit);
  const seen = new Set(result.map((item) => item.id));
  for (const entry of remoteScored) {
    if (result.length >= limit) {
      break;
    }
    if (seen.has(entry.item.id) || isCollectedReference(entry.item)) {
      continue;
    }
    seen.add(entry.item.id);
    result.push(entry.item);
  }
  return result;
}

function categoryForProfileTerm(label: string, profile: VisualProfile): ExploreTextCategory {
  const key = termKey(label);
  if (profile.style.some((term) => designSearchTermsOverlap(term, label) || termKey(term) === key)) {
    return "style";
  }
  if (/(즘|ism|스타일|style|파|派)$/i.test(label.trim())) {
    return "movement";
  }
  return "keyword";
}

/**
 * 선택 이미지의 시각 프로필에서 텍스트 레퍼런스를 만든다.
 * 프로필의 한국어 디자인 용어 → 영어 무드·스타일·기법의 한국어 라벨 → 기존 텍스트 풀 중 프로필과 겹치는 항목 순.
 */
export function buildProfileTextEntries(
  profile: VisualProfile,
  pool: ExploreTextEntry[],
  limit: number,
): ExploreTextEntry[] {
  const result: ExploreTextEntry[] = [];
  const seen = new Set<string>();
  const push = (label: string, category: ExploreTextCategory) => {
    const trimmed = label.trim();
    const key = termKey(trimmed);
    if (!trimmed || seen.has(key) || isGenericExploreTextLabel(trimmed) || result.length >= limit) {
      return;
    }
    seen.add(key);
    result.push({ label: trimmed, category });
  };

  // 분야 자체(예: 유화, 포스터)를 첫 텍스트 레퍼런스로 둔다.
  const medium = getMedium(profile.medium);
  if (medium) {
    push(medium.labelKo, "movement");
  }
  for (const label of profile.keywordsKo) {
    push(label, categoryForProfileTerm(label, profile));
  }
  for (const term of [...profile.style, ...profile.mood, ...profile.graphicElements]) {
    const korean = preferKoreanDesignLabel(term);
    // 한국어 사전에 없는 영어 원문은 텍스트 카드로 쓰지 않는다(기존 텍스트 레퍼런스는 한국어).
    if (!/[가-힣]/.test(korean)) {
      continue;
    }
    push(korean, profile.style.includes(term) ? "style" : "keyword");
  }

  const profileTerms = [
    ...profile.keywordsKo,
    ...profile.style,
    ...profile.mood,
    ...profile.graphicElements,
    ...profile.colors,
  ];
  for (const entry of pool) {
    if (profileTerms.some((term) => designSearchTermsOverlap(term, entry.label))) {
      push(entry.label, entry.category);
    }
  }

  return result;
}
