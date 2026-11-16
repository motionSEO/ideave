import type { ReferenceItem } from "@/components/reference-prototype/data";
import { scoreRelatedReference } from "@/components/reference-prototype/referenceKeywords";
import { expandKoreanDesignQuery } from "@/lib/google-drive/metadata/koreanLexicon";

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function isCollectedDriveReference(item: ReferenceItem): boolean {
  return item.source === "google-drive" || item.source === "upload";
}

export function splitCollectedAndRemote(items: ReferenceItem[]): {
  collected: ReferenceItem[];
  remote: ReferenceItem[];
} {
  const collected: ReferenceItem[] = [];
  const remote: ReferenceItem[] = [];
  for (const item of items) {
    if (isCollectedDriveReference(item)) {
      collected.push(item);
    } else {
      remote.push(item);
    }
  }
  return { collected, remote };
}

/** Unsplash fills only when collected Drive/upload images are too few for the home grid. */
export const UNSPLASH_FILL_WHEN_COLLECTED_BELOW = 32;

export function collectedImageCount(items: ReferenceItem[]): number {
  return items.filter((item) => item.type !== "text" && Boolean(item.imageUrl)).length;
}

export function needsUnsplashFill(collectedItems: ReferenceItem[]): boolean {
  return collectedImageCount(collectedItems) < UNSPLASH_FILL_WHEN_COLLECTED_BELOW;
}

/**
 * Collected Drive/upload items occupy the home grid first.
 * Unsplash is appended only when that collected pool is too small.
 */
export function mixDrivePriorityFeed(
  driveItems: ReferenceItem[],
  unsplashItems: ReferenceItem[],
  seedKey: string,
  options?: { shuffle?: boolean },
): ReferenceItem[] {
  const shouldShuffle = options?.shuffle !== false;
  const drive = shouldShuffle
    ? shuffleReferenceItems(driveItems, `${seedKey}:drive`)
    : [...driveItems];
  const unsplash = shouldShuffle
    ? shuffleReferenceItems(unsplashItems, `${seedKey}:unsplash`)
    : [...unsplashItems];

  if (drive.length >= UNSPLASH_FILL_WHEN_COLLECTED_BELOW) {
    return drive;
  }
  if (drive.length === 0) {
    return unsplash;
  }
  if (unsplash.length === 0) {
    return drive;
  }

  return [...drive, ...unsplash];
}

export function shuffleReferenceItems<T>(items: T[], seedKey: string): T[] {
  if (items.length <= 1) {
    return [...items];
  }
  const random = createSeededRandom(hashSeed(seedKey));
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export function composeBrowseRecommendQuery(terms: string[], limit = 8): string {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const term of terms) {
    const next = term.trim().replace(/^#/, "");
    const key = next.toLowerCase();
    if (!next || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(next);
    if (unique.length >= limit) {
      break;
    }
  }
  return unique.join(" ");
}

export function termsFromProjectMood(goal: string): string[] {
  return tokenizeProjectText(goal);
}

function tokenizeProjectText(value: string): string[] {
  const parts = value
    .split(/[\s,/|·•,._\-()[\]【】『』“”"'`]+|하고|이며|위한|대한|에서|으로/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
  const hangul = value.match(/[가-힣]{2,}/g) ?? [];
  return [...parts, ...hangul];
}

/** 프로젝트 이름(주제) + 목표(무드·스타일) + 한영 확장을 모두 검색 키워드로 사용 */
export function termsFromProjectContext(name: string, goal: string): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  const push = (term: string) => {
    const next = term.trim().replace(/^#/, "");
    const key = next.toLowerCase();
    if (next.length < 2 || seen.has(key)) {
      return;
    }
    seen.add(key);
    unique.push(next);
  };

  push(name);
  push(goal);
  for (const part of tokenizeProjectText(name)) {
    push(part);
  }
  for (const part of tokenizeProjectText(goal)) {
    push(part);
  }
  for (const part of expandKoreanDesignQuery(`${name} ${goal}`)) {
    push(part);
  }
  return unique;
}

export function composeProjectDiscoverQuery(name: string, goal: string): string {
  return [name.trim(), goal.trim()].filter(Boolean).join(" ").trim();
}

export function rankReferenceItemsByTerms(
  items: ReferenceItem[],
  terms: string[],
  seedKey: string,
): ReferenceItem[] {
  const keywords = terms.map((term) => term.trim()).filter(Boolean);
  if (keywords.length === 0) {
    return shuffleReferenceItems(items, seedKey);
  }

  const scored = items.map((item, index) => ({
    item,
    index,
    score: item.type === "text" ? 0.15 : scoreRelatedReference(keywords, item),
  }));

  const related = scored.filter((entry) => entry.score > 0);
  const rest = scored.filter((entry) => entry.score <= 0);
  related.sort((left, right) => right.score - left.score || left.index - right.index);

  return [
    ...related.map((entry) => entry.item),
    ...shuffleReferenceItems(
      rest.map((entry) => entry.item),
      `${seedKey}:rest`,
    ),
  ];
}

export function filterMatchedReferenceItems(
  items: ReferenceItem[],
  terms: string[],
  seedKey: string,
): ReferenceItem[] {
  const keywords = terms.map((term) => term.trim()).filter(Boolean);
  if (keywords.length === 0) {
    return [];
  }

  return rankReferenceItemsByTerms(items, keywords, seedKey).filter(
    (item) => item.type === "text" || scoreRelatedReference(keywords, item) > 0,
  );
}
