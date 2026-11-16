import type { ReferenceItem } from "@/components/reference-prototype/data";
import { buildProjectExploreTexts } from "@/components/reference-prototype/projectDesignQueries";
import { designSearchTermsOverlap } from "@/lib/google-drive/metadata/koreanLexicon";

/** "전체" 그리드의 이미지 : 텍스트 노출 비율 = 3 : 1 (이미지 3장마다 텍스트 1장). 홈·상세 공통. */
export const IMAGE_TO_TEXT_RATIO = 3;

export type ExploreTextCategory = "keyword" | "movement" | "style" | "artist";

export type ExploreTextEntry = {
  label: string;
  category: ExploreTextCategory;
};

/** 첫 화면(프로젝트 미등록) 탐색 그리드용 디자인 키워드·예술 사조·화풍 */
export const DEFAULT_EXPLORE_TEXTS: ExploreTextEntry[] = [
  { label: "네거티브 스페이스", category: "keyword" },
  { label: "그리드 시스템", category: "keyword" },
  { label: "타이포그래피", category: "keyword" },
  { label: "컬러 블로킹", category: "keyword" },
  { label: "대칭·균형", category: "keyword" },
  { label: "바우하우스", category: "movement" },
  { label: "스위스 스타일", category: "movement" },
  { label: "미니멀리즘", category: "movement" },
  { label: "브루탈리즘", category: "movement" },
  { label: "인상주의", category: "movement" },
  { label: "초현실주의", category: "movement" },
  { label: "팝아트", category: "movement" },
  { label: "수채 화풍", category: "style" },
  { label: "라인 드로잉", category: "style" },
  { label: "플랫 일러스트", category: "style" },
  { label: "필름 그레인", category: "style" },
  { label: "모노톤", category: "style" },
  { label: "파스텔 톤", category: "style" },
];

const CATEGORY_LABEL: Record<ExploreTextCategory, string> = {
  keyword: "디자인 키워드",
  movement: "예술 사조",
  style: "화풍",
  artist: "예술가",
};

export function getExploreTextCategoryLabel(category: ExploreTextEntry["category"]): string {
  return CATEGORY_LABEL[category];
}

function slugExploreLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 48) || "text";
}

function createTextCard(entry: ExploreTextEntry, index: number): ReferenceItem {
  return {
    id: `explore-txt-${index}-${entry.category}-${slugExploreLabel(entry.label)}`,
    type: "text",
    ratio: "4 / 3",
    textLabel: entry.label,
    textCategory: entry.category,
  };
}

function normalizeExploreLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

function tokenizeExploreLabel(label: string): string {
  return normalizeExploreLabel(label)
    .split(/[\s/_·,+-]+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

function isNearDuplicateExploreLabel(left: string, right: string): boolean {
  const a = normalizeExploreLabel(left);
  const b = normalizeExploreLabel(right);
  if (!a || !b) {
    return true;
  }
  if (a === b) {
    return true;
  }
  return tokenizeExploreLabel(a) === tokenizeExploreLabel(b);
}

function entryFromLabel(label: string, index: number): ExploreTextEntry {
  const kinds: ExploreTextCategory[] = ["keyword", "movement", "style", "artist"];
  return {
    label,
    category: kinds[index % kinds.length] ?? "keyword",
  };
}

export function exploreTextEntry(label: string, category: ExploreTextCategory): ExploreTextEntry {
  return { label: label.trim(), category };
}

/** 프로젝트 등록 직후 주제·무드에서 만든 탐색 텍스트 */
export function seedProjectExploreTexts(projectName: string, goal: string): ExploreTextEntry[] {
  return buildProjectExploreTexts(projectName, goal);
}

function projectTermKeys(projectName: string, projectGoal: string): string[] {
  const keys = new Set<string>();
  const push = (value: string) => {
    const trimmed = value.trim().toLowerCase();
    if (trimmed.length >= 2) {
      keys.add(trimmed);
    }
  };

  push(projectName);
  push(projectGoal);
  return [...keys];
}

function labelOverlapsProjectTerm(label: string, termKeys: string[]): boolean {
  const normalized = label.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return termKeys.some((term) => normalized === term);
}

const GENERIC_EXPLORE_TEXT_LABELS = new Set([
  "색감",
  "색채",
  "질감",
  "형태",
  "밸런스",
  "공간",
  "무드",
  "그래픽",
  "nature",
  "wallpapers",
  "business work",
  "textures patterns",
  "textures",
  "patterns",
  "photo",
  "image",
  "picture",
  "background",
  "people",
  "person",
]);

function isJunkExploreTextLabel(label: string): boolean {
  const trimmed = label.trim();
  const normalized = trimmed.toLowerCase();
  if (!trimmed) {
    return true;
  }
  if (/^https?:\/\//i.test(trimmed) || /^www\./i.test(trimmed)) {
    return true;
  }
  if (/[a-z0-9.-]+\.(com|net|org|io|dev)\b/i.test(trimmed)) {
    return true;
  }
  if (/\.(jpg|jpeg|png|gif|webp|svg|json|xml)(\?|$)/i.test(normalized)) {
    return true;
  }
  if (/unsplash|googleapis|drive\.google|localhost:\d+|\/api\//i.test(normalized)) {
    return true;
  }
  if (/^(api|http|https|www|null|undefined|true|false)$/i.test(normalized)) {
    return true;
  }
  if (/의 사본$/.test(trimmed)) {
    return true;
  }
  if (trimmed.length > 36) {
    return true;
  }
  if ((trimmed.match(/\s/g) ?? []).length >= 5) {
    return true;
  }
  return false;
}

export function isGenericExploreTextLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  if (!normalized || GENERIC_EXPLORE_TEXT_LABELS.has(normalized) || isJunkExploreTextLabel(label)) {
    return true;
  }
  if (normalized.length <= 2) {
    return true;
  }
  return false;
}

/** 프로젝트 주제·목적과 겹치는 탐색 텍스트 카드 제외 */
export function filterExploreTextsExcludingProject(
  entries: ExploreTextEntry[],
  projectName: string,
  projectGoal: string,
): ExploreTextEntry[] {
  const termKeys = projectTermKeys(projectName, projectGoal);
  return entries.filter(
    (entry) =>
      !isGenericExploreTextLabel(entry.label) &&
      (termKeys.length === 0 || !labelOverlapsProjectTerm(entry.label, termKeys)),
  );
}

export type ExploreGridFilter = "all" | "image" | "text";

export function filterGridItemsByExploreFilter(
  items: ReferenceItem[],
  filter: ExploreGridFilter,
): ReferenceItem[] {
  if (filter === "image") {
    return items.filter((item) => item.type !== "text");
  }
  if (filter === "text") {
    return items.filter((item) => item.type === "text");
  }
  return items;
}

/** 홈·상세 공통: 전체/이미지/텍스트 필터로 Masonry 아이템을 만든다. */
export function buildExploreGridItems(
  images: ReferenceItem[],
  texts: ExploreTextEntry[],
  filter: ExploreGridFilter,
  options?: {
    textEveryNImages?: number;
    appendUnusedTexts?: boolean;
    allowTextOnlyFallback?: boolean;
  },
): ReferenceItem[] {
  const imageItems = images.filter((item) => item.type !== "text");

  if (filter === "text") {
    return buildTextOnlyGridItems(texts);
  }
  if (filter === "image") {
    return imageItems;
  }

  const mixed = interleaveExploreTextCards(
    imageItems,
    texts,
    options?.textEveryNImages,
    options?.appendUnusedTexts ?? false,
  );
  if (mixed.length > 0) {
    return mixed;
  }
  if (options?.allowTextOnlyFallback === false) {
    return imageItems;
  }
  return buildTextOnlyGridItems(texts);
}

/** 탐색 텍스트 엔트리 병합 (라벨 중복 제거, 앞쪽 우선) */
export function mergeExploreTextEntries(
  ...groups: ExploreTextEntry[][]
): ExploreTextEntry[] {
  const seen = new Set<string>();
  const result: ExploreTextEntry[] = [];

  for (const group of groups) {
    for (const entry of group) {
      const label = entry.label.trim();
      const key = label.toLowerCase();
      if (!label || seen.has(key) || isGenericExploreTextLabel(label)) {
        continue;
      }
      if (result.some((existing) => isNearDuplicateExploreLabel(existing.label, label))) {
        continue;
      }
      seen.add(key);
      result.push({ label, category: entry.category });
    }
  }

  return result;
}

/** 이미지 태그 라벨을 키워드 엔트리로 추가 */
export function mergeImageTagExploreTexts(
  base: ExploreTextEntry[],
  tagLabels: string[],
): ExploreTextEntry[] {
  return mergeExploreTextEntries(
    base,
    tagLabels.map((label) => exploreTextEntry(label, "keyword")),
  );
}

function labelMatchesHashtag(label: string, tag: string): boolean {
  const normalizedLabel = label.trim().toLowerCase();
  const normalizedTag = tag.trim().toLowerCase();
  if (!normalizedLabel || !normalizedTag) {
    return false;
  }
  return (
    normalizedLabel === normalizedTag ||
    normalizedLabel.includes(normalizedTag) ||
    normalizedTag.includes(normalizedLabel) ||
    designSearchTermsOverlap(normalizedLabel, normalizedTag)
  );
}

/** 해시태그·검색어 탐색 시 그리드에 넣을 연관 텍스트 카드 풀 */
export function getExploreTextsForHashtag(
  tag: string,
  basePool: ExploreTextEntry[],
  relatedImages: ReferenceItem[],
  limit = 32,
  options?: { includeQueryAsCard?: boolean },
): ExploreTextEntry[] {
  const trimmedTag = tag.trim();
  if (!trimmedTag) {
    return basePool;
  }

  const includeQueryAsCard = options?.includeQueryAsCard ?? true;
  const fromPool = basePool.filter((entry) => labelMatchesHashtag(entry.label, trimmedTag));
  const imageTagLabels = extractTagLabelsFromImages(relatedImages, limit).filter(
    (label) => !isGenericExploreTextLabel(label),
  );

  const groups: ExploreTextEntry[][] = [
    fromPool,
    imageTagLabels.map((label) => exploreTextEntry(label, "keyword")),
  ];
  if (includeQueryAsCard && !isGenericExploreTextLabel(trimmedTag)) {
    groups.unshift([exploreTextEntry(trimmedTag, "keyword")]);
  }

  return mergeExploreTextEntries(...groups).slice(0, limit);
}

/** 검색어와 실제 연관된 텍스트만 모은다. 무관한 개념으로 채우지 않는다. */
export function getExploreTextsForSearchQuery(
  query: string,
  basePool: ExploreTextEntry[],
  relatedImages: ReferenceItem[],
  generatedEntries: ExploreTextEntry[] = [],
  limit = 24,
): ExploreTextEntry[] {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return basePool;
  }

  const imageTagLabels = extractTagLabelsFromImages(relatedImages, limit).filter(
    (label) => !isNearDuplicateExploreLabel(label, trimmedQuery) && !isGenericExploreTextLabel(label),
  );

  const generated = generatedEntries
    .filter(
      (entry) =>
        !isNearDuplicateExploreLabel(entry.label, trimmedQuery) && !isGenericExploreTextLabel(entry.label),
    )
    .slice(0, 10);

  const queryCard = isGenericExploreTextLabel(trimmedQuery)
    ? []
    : [exploreTextEntry(trimmedQuery, "keyword")];

  return mergeExploreTextEntries(
    queryCard,
    generated,
    basePool.filter((entry) => labelMatchesHashtag(entry.label, trimmedQuery)),
    imageTagLabels.map((label) => exploreTextEntry(label, "keyword")),
  ).slice(0, limit);
}

/** 프로젝트 자동 탐색: 주제·목적 문장 카드 없이 풀·이미지 태그만 병합 */
export function getExploreTextsFromRelatedImages(
  basePool: ExploreTextEntry[],
  relatedImages: ReferenceItem[],
  limit = 32,
): ExploreTextEntry[] {
  const imageTagLabels = extractTagLabelsFromImages(relatedImages, limit).filter(
    (label) => !isGenericExploreTextLabel(label),
  );
  return mergeExploreTextEntries(
    basePool.filter((entry) => !isGenericExploreTextLabel(entry.label)),
    imageTagLabels.map((label) => exploreTextEntry(label, "keyword")),
  ).slice(0, limit);
}

function hashStringToSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 탐색 텍스트 카드 삽입 순서 섞기 (SSR·클라이언트 동일 결과를 위해 시드 사용) */
export function shuffleExploreTextEntries(
  entries: ExploreTextEntry[],
  seedKey = "",
): ExploreTextEntry[] {
  if (entries.length <= 1) {
    return [...entries];
  }

  const seedSource =
    seedKey.trim() || entries.map((entry) => `${entry.category}:${entry.label}`).join("\x1f");
  const random = createSeededRandom(hashStringToSeed(seedSource));
  const copy = [...entries];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }

  return copy;
}

/**
 * 이미지 목록에 텍스트 카드를 N장마다 삽입합니다.
 * appendUnusedTexts는 이미지가 N의 배수가 아니어서 모자란 텍스트만 끝에 채울 뿐,
 * 전체 텍스트 수는 ceil(이미지 수 / N)을 넘지 않아 비율이 깨지지 않습니다(남은 텍스트를 전부 붙이면
 * 상세 하단이 텍스트 카드로만 가득 찼음).
 */
export function interleaveExploreTextCards(
  images: ReferenceItem[],
  texts: ExploreTextEntry[],
  textEveryNImages: number = IMAGE_TO_TEXT_RATIO,
  appendUnusedTexts = false,
): ReferenceItem[] {
  if (images.length === 0) {
    return [];
  }

  if (texts.length === 0) {
    return images;
  }

  const result: ReferenceItem[] = [];
  let textIndex = 0;
  const interval = Math.max(1, textEveryNImages);

  for (let i = 0; i < images.length; i += 1) {
    result.push(images[i]);
    if ((i + 1) % interval === 0 && textIndex < texts.length) {
      const entry = texts[textIndex];
      result.push(createTextCard(entry, textIndex));
      textIndex += 1;
    }
  }

  if (appendUnusedTexts) {
    const maxTexts = Math.ceil(images.length / interval);
    while (textIndex < texts.length && textIndex < maxTexts) {
      const entry = texts[textIndex];
      result.push(createTextCard(entry, textIndex));
      textIndex += 1;
    }
  }

  return result;
}

export function buildTextOnlyGridItems(texts: ExploreTextEntry[]): ReferenceItem[] {
  return texts.map((entry, index) => createTextCard(entry, index));
}

/** 프로젝트 맥락에서 받은 문자열 라벨을 탐색 텍스트 엔트리로 변환 */
export function projectLabelsToExploreTexts(labels: string[]): ExploreTextEntry[] {
  const unique = [...new Set(labels.map((l) => l.trim()).filter(Boolean))];
  return unique.map((label, index) => entryFromLabel(label, index));
}

function tagsForItem(item: ReferenceItem): string[] {
  return item.tags?.map((t) => t.trim()).filter(Boolean) ?? [];
}

/** 선택 이미지와 태그가 겹치는 레퍼런스 이미지 (업로드 DB 외 목업용) */
export function getRelatedImagesByTags(
  selected: ReferenceItem,
  pool: ReferenceItem[],
  limit = 16,
): ReferenceItem[] {
  const selectedTags = new Set(tagsForItem(selected));
  if (selectedTags.size === 0) {
    return [];
  }

  const scored = pool
    .filter((item) => item.id !== selected.id && item.type !== "text")
    .map((item) => {
      const overlap = tagsForItem(item).filter((tag) => selectedTags.has(tag)).length;
      return { item, overlap };
    })
    .filter((entry) => entry.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap);

  return scored.slice(0, limit).map((entry) => entry.item);
}

/** 텍스트 라벨과 태그·라벨 문자열이 겹치는 이미지 (목업·검색 보조) */
export function getRelatedImagesByLabel(
  label: string,
  pool: ReferenceItem[],
  limit = 16,
): ReferenceItem[] {
  const q = label.trim().toLowerCase();
  if (!q) {
    return [];
  }

  const scored = pool
    .filter((item) => item.type !== "text")
    .map((item) => {
      let score = 0;
      for (const tag of tagsForItem(item)) {
        const t = tag.toLowerCase();
        if (t === q) {
          score += 3;
        } else if (t.includes(q) || q.includes(t)) {
          score += 2;
        } else if (
          [...t.split(/\s+/)].some((part) => part.length > 1 && (q.includes(part) || part.includes(q)))
        ) {
          score += 1;
        }
      }
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((entry) => entry.item);
}

/** 선택 텍스트·관련 이미지 태그·탐색 풀에서 연관 텍스트 엔트리 수집 */
export function getRelatedExploreTextsForLabel(
  label: string,
  relatedImages: ReferenceItem[],
  pool: ExploreTextEntry[],
  limit = 32,
  extraTerms: string[] = [],
): ExploreTextEntry[] {
  const normalized = label.trim().toLowerCase();
  const tagLabels = extractTagLabelsFromImages(relatedImages, limit).filter(
    (tag) => !isGenericExploreTextLabel(tag),
  );

  const candidates = new Set<string>();

  for (const tag of tagLabels) {
    candidates.add(tag);
  }

  const matchTerms = [label, ...extraTerms].map((term) => term.trim()).filter(Boolean);

  for (const entry of pool) {
    const entryLabel = entry.label.trim();
    if (!entryLabel || entryLabel.toLowerCase() === normalized || isGenericExploreTextLabel(entryLabel)) {
      continue;
    }
    if (matchTerms.some((term) => labelMatchesHashtag(entryLabel, term))) {
      candidates.add(entryLabel);
    }
  }

  return projectLabelsToExploreTexts([...candidates])
    .filter((entry) => entry.label.trim().toLowerCase() !== normalized)
    .slice(0, limit);
}

export function extractTagLabelsFromImages(items: ReferenceItem[], limit = 12): string[] {
  const counts = new Map<string, number>();

  for (const item of items) {
    for (const tag of item.tags ?? []) {
      const key = tag.trim();
      if (!key || isGenericExploreTextLabel(key)) {
        continue;
      }
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag)
    .slice(0, limit);
}
