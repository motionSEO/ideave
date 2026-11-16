import type { NextRequest } from "next/server";
import { expandProjectDesignContext } from "@/components/reference-prototype/projectDesignQueries";
import { isSafeUnsplashPhoto } from "@/lib/contentSafety";
import { composeEnglishDesignQuery } from "@/lib/google-drive/metadata/koreanLexicon";

export const runtime = "nodejs";

const UNSPLASH_SEARCH_URL = "https://api.unsplash.com/search/photos";
const TARGET_COUNT = 30;
const PROJECT_TARGET_COUNT = 24;
const SEARCH_PER_PAGE = 10;
const HOME_PER_PAGE = 15;
const PROJECT_FEED_PER_PAGE = 20;
const CACHE_TTL_MS = 5 * 60 * 1000;
const PROJECT_CACHE_TTL_MS = 10 * 60 * 1000;
const QUERY_CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 80;
const MIN_PHOTO_EDGE = 320;
const SAFETY_REFILL_PAGES = 1;

const HOME_GRAPHIC_SEEDS = [
  "abstract illustration",
  "geometric graphic design",
  "experimental typography",
  "editorial graphic design",
] as const;

const HOME_IDENTITY_SEEDS = [
  "minimal poster design",
  "visual identity design",
  "modern branding",
  "editorial layout",
  "art direction",
  "creative packaging design",
] as const;

const POSITIVE_DESIGN_TERMS = [
  "graphic",
  "design",
  "poster",
  "typography",
  "typeface",
  "branding",
  "identity",
  "editorial",
  "layout",
  "packaging",
  "illustration",
  "illustrator",
  "abstract",
  "geometric",
  "minimal",
  "pattern",
  "collage",
  "creative",
  "art",
  "print",
] as const;

const NEGATIVE_STOCK_TERMS = [
  "person",
  "people",
  "woman",
  "man",
  "meeting",
  "laptop",
  "desk",
  "businessman",
  "portrait",
] as const;

const PROJECT_STOCK_DOWNRANK = [
  "office",
  "business",
  "desk",
  "laptop",
  "meeting",
  "stationery",
  "mockup",
  "workplace",
  "corporate",
  "lifestyle",
] as const;

const DESIGN_POSITIVE_PHRASES = [
  "graphic design",
  "visual identity",
  "art direction",
  "editorial",
  "typography",
  "poster",
  "illustration",
  "abstract",
  "pattern",
  "layout",
  "branding",
  "creative",
  "design",
  "colorful",
  "color",
  "geometric",
  "experimental",
  "psychedelic",
  "minimal",
  "composition",
  "print",
  "magazine",
  "artwork",
  "graphic",
] as const;

const DESIGN_NEGATIVE_PHRASES = [
  "business meeting",
  "corporate office",
  "generic lifestyle",
  "business person",
  "handshake",
  "coworker",
  "office",
  "meeting",
  "laptop",
  "desk",
  "working",
  "workspace",
  "phone",
  "computer",
] as const;

const HARD_EXCLUDE_LIFESTYLE_TERMS = ["bikini", "swimsuit", "swimwear", "lingerie"] as const;

const PEOPLE_LIFESTYLE_DOWNRANK_TERMS = [
  "bikini",
  "swimsuit",
  "swimwear",
  "lingerie",
  "fashion model",
  "woman posing",
  "man posing",
  "fashion photography",
  "street fashion",
  "influencer",
  "selfie",
  "beachwear",
  "model",
  "portrait",
  "outfit",
  "lifestyle",
  "beauty",
  "sexy",
] as const;

const STRONG_DESIGN_CONTEXT_TERMS = [
  "poster design",
  "graphic design",
  "editorial design",
  "visual identity",
  "print design",
  "album cover",
  "experimental design",
  "poster",
  "editorial",
  "typography",
  "illustration",
  "artwork",
  "branding",
  "magazine",
  "layout",
  "collage",
] as const;

const SOFT_DOWNRANK_PHRASES = ["stationery", "mockup"] as const;

const DESIGN_BUCKETS = [
  "poster-editorial",
  "branding-identity",
  "typography",
  "illustration-abstract",
  "packaging",
  "graphic-geometric",
] as const;

const DIVERSITY_BUCKETS = [...DESIGN_BUCKETS, "other"] as const;

type DiversityBucket = (typeof DIVERSITY_BUCKETS)[number];

type UnsplashSearchPayload = {
  total?: number;
  total_pages?: number;
  results?: unknown;
};

type RankedPhoto = {
  id: string;
  photo: unknown;
  score: number;
  bucket: DiversityBucket;
  sourceQuery: string;
};

type CachedSearchBody = {
  query: string;
  feed?: string;
  page: number;
  expandedQueries: string[];
  requestCount: number;
  total: number;
  totalPages: number;
  count: number;
  rawCount?: number;
  uniqueCount?: number;
  hasMore?: boolean;
  results: unknown[];
  debugRanking?: Array<{
    id: string;
    designScore: number;
    subjectScore: number;
    moodScore: number;
    excludedReason: string | null;
  }>;
};

type QueryCacheEntry = {
  expiresAt: number;
  photos: unknown[];
  total: number;
  ok: boolean;
  status: number;
  details?: string;
};

type CacheEntry = {
  expiresAt: number;
  body: CachedSearchBody;
};

const searchCache = new Map<string, CacheEntry>();
const unsplashQueryCache = new Map<string, QueryCacheEntry>();

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickRotated<T>(items: readonly T[], seed: string, count: number): T[] {
  if (items.length === 0 || count <= 0) {
    return [];
  }
  const start = hashString(seed) % items.length;
  const rotated = [...items.slice(start), ...items.slice(0, start)];
  return rotated.slice(0, Math.min(count, items.length));
}

function parsePageParam(value: string | null): number {
  const parsed = Number.parseInt(value ?? "1", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
}

function containsTerm(haystack: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(haystack);
}

function queryLooksDesignFocused(query: string): boolean {
  return POSITIVE_DESIGN_TERMS.some((term) => containsTerm(query, term));
}

function expandSearchQueries(query: string): string[] {
  const englishQuery = composeEnglishDesignQuery(query) || query;
  if (queryLooksDesignFocused(englishQuery)) {
    return [englishQuery];
  }
  return [`${englishQuery} graphic design`];
}

function homeSeedQueries(page: number): string[] {
  const windowId = Math.floor(Date.now() / (6 * 60 * 60 * 1000));
  const seed = `home-${windowId}-${page}`;
  const graphic = pickRotated(HOME_GRAPHIC_SEEDS, seed, 1)[0] ?? "geometric graphic design";
  const identity = pickRotated(HOME_IDENTITY_SEEDS, `${seed}-id`, 1)[0] ?? "modern branding";
  return [graphic, identity];
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function collectTagTitles(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const titles: string[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const title = (entry as { title?: unknown }).title;
    if (typeof title === "string" && title.trim()) {
      titles.push(title.trim());
    }
  }
  return titles;
}

function photoId(row: unknown): string | null {
  if (!row || typeof row !== "object") {
    return null;
  }
  const id = (row as { id?: unknown }).id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function photoSearchText(row: unknown): string {
  if (!row || typeof row !== "object") {
    return "";
  }
  const photo = row as {
    description?: unknown;
    alt_description?: unknown;
    slug?: unknown;
    tags?: unknown;
    tags_preview?: unknown;
  };
  return [
    readString(photo.description),
    readString(photo.alt_description),
    readString(photo.slug).replace(/-/g, " "),
    ...collectTagTitles(photo.tags),
    ...collectTagTitles(photo.tags_preview),
  ]
    .join(" ")
    .toLowerCase();
}

function photoDimensions(row: unknown): { width: number; height: number } {
  if (!row || typeof row !== "object") {
    return { width: 0, height: 0 };
  }
  const photo = row as { width?: unknown; height?: unknown };
  return {
    width: typeof photo.width === "number" ? photo.width : 0,
    height: typeof photo.height === "number" ? photo.height : 0,
  };
}

function photoLikes(row: unknown): number {
  if (!row || typeof row !== "object") {
    return 0;
  }
  const likes = (row as { likes?: unknown }).likes;
  return typeof likes === "number" && Number.isFinite(likes) ? likes : 0;
}

function phraseHitCount(text: string, phrases: readonly string[]): number {
  let hits = 0;
  for (const phrase of phrases) {
    if (text.includes(phrase) || containsTerm(text, phrase)) {
      hits += 1;
    }
  }
  return hits;
}

function clamp01(value: number): number {
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

function isTooSmall(row: unknown): boolean {
  const { width, height } = photoDimensions(row);
  if (width <= 0 || height <= 0) {
    return false;
  }
  return Math.min(width, height) < MIN_PHOTO_EDGE;
}

type ProjectScoreBreakdown = {
  designScore: number;
  subjectScore: number;
  moodScore: number;
  queryMatchScore: number;
  visualQualityScore: number;
  finalScore: number;
  excludedReason: string | null;
};

function hasStrongDesignContext(text: string): boolean {
  const hits = phraseHitCount(text, STRONG_DESIGN_CONTEXT_TERMS);
  return (
    hits >= 2 ||
    text.includes("poster design") ||
    text.includes("graphic design") ||
    text.includes("editorial design") ||
    text.includes("typography") ||
    text.includes("illustration")
  );
}

function firstMatchingTerm(text: string, terms: readonly string[]): string | null {
  for (const term of terms) {
    if (text.includes(term) || containsTerm(text, term)) {
      return term;
    }
  }
  return null;
}

function scoreProjectPhoto(
  row: unknown,
  sourceQuery: string,
  context: ReturnType<typeof expandProjectDesignContext>,
): ProjectScoreBreakdown {
  const text = photoSearchText(row);
  const { width, height } = photoDimensions(row);
  const designContext = hasStrongDesignContext(text);
  const hardTerm = firstMatchingTerm(text, HARD_EXCLUDE_LIFESTYLE_TERMS);
  const lifestyleHits = phraseHitCount(text, PEOPLE_LIFESTYLE_DOWNRANK_TERMS);

  if (hardTerm && !designContext) {
    return {
      designScore: 0,
      subjectScore: 0,
      moodScore: 0,
      queryMatchScore: 0,
      visualQualityScore: 0,
      finalScore: -1,
      excludedReason: `hard_exclude:${hardTerm}`,
    };
  }

  const positiveHits = phraseHitCount(text, DESIGN_POSITIVE_PHRASES);
  let negativeHits = phraseHitCount(text, DESIGN_NEGATIVE_PHRASES);
  const subjectAllowsCoffee = context.subjectTerms.some(
    (term) => term.includes("cafe") || term.includes("coffee"),
  );
  if (!subjectAllowsCoffee && (containsTerm(text, "coffee") || text.includes("coffee"))) {
    negativeHits += 1;
  }

  if (lifestyleHits > 0 && !designContext) {
    negativeHits += lifestyleHits * 2.4;
  }

  const softHits = phraseHitCount(text, SOFT_DOWNRANK_PHRASES);
  let designScore = clamp01((positiveHits * 1.2 - negativeHits * 1.1 - softHits * 0.45) / 8);
  if (lifestyleHits > 0 && !designContext) {
    designScore = clamp01(designScore * 0.18);
  }

  const subjectHits = phraseHitCount(text, context.subjectTerms);
  const subjectScore = clamp01(
    context.subjectTerms.length === 0 ? 0 : subjectHits / Math.min(context.subjectTerms.length, 4),
  );

  let moodScore = clamp01(phraseHitCount(text, [...context.moodTerms, ...context.styleTerms]) / 4);
  if (lifestyleHits > 0 && !designContext) {
    moodScore = clamp01(moodScore * 0.35);
  }

  const queryWords = sourceQuery.split(/\s+/).filter((word) => word.length > 2);
  const queryMatchScore = clamp01(
    queryWords.length === 0 ? 0 : phraseHitCount(text, queryWords) / queryWords.length,
  );

  const hasMeta = text.replace(/\s+/g, "").length >= 8;
  const pixelBoost = width > 0 && height > 0 ? clamp01(Math.log10((width * height) / 80_000) / 2) : 0.4;
  const likeBoost = clamp01(photoLikes(row) / 400);
  const visualQualityScore = clamp01((hasMeta ? 0.55 : 0.18) + pixelBoost * 0.25 + likeBoost * 0.2);

  const finalScore =
    subjectScore * 0.45 +
    designScore * 0.25 +
    moodScore * 0.18 +
    queryMatchScore * 0.12;

  return {
    designScore,
    subjectScore,
    moodScore,
    queryMatchScore,
    visualQualityScore,
    finalScore,
    excludedReason:
      lifestyleHits > 0 && !designContext ? "downranked_people_lifestyle" : null,
  };
}

function sourceQueryBoost(sourceQuery: string): number {
  const text = sourceQuery.toLowerCase();
  if (
    text.includes("illustration") ||
    text.includes("abstract") ||
    text.includes("geometric") ||
    text.includes("typography") ||
    text.includes("poster")
  ) {
    return 6;
  }
  if (text.includes("graphic") || text.includes("editorial") || text.includes("art direction")) {
    return 5;
  }
  if (text.includes("branding") || text.includes("identity") || text.includes("layout")) {
    return 4;
  }
  if (text.includes("packaging")) {
    return 3;
  }
  return 1;
}

function designRelevanceScore(
  row: unknown,
  sourceQuery: string,
  rankTerms: string[] = [],
): number {
  const text = photoSearchText(row);
  let score = sourceQueryBoost(sourceQuery);

  const projectDesignBoost = [
    "poster",
    "typography",
    "editorial",
    "graphic design",
    "illustration",
    "abstract",
    "pattern",
    "layout",
    "visual identity",
    "art direction",
  ] as const;

  for (const term of POSITIVE_DESIGN_TERMS) {
    if (containsTerm(text, term)) {
      score += 2;
    }
  }
  for (const term of NEGATIVE_STOCK_TERMS) {
    if (containsTerm(text, term)) {
      score -= 1;
    }
  }
  if (rankTerms.length > 0) {
    for (const term of projectDesignBoost) {
      if (text.includes(term)) {
        score += 4;
      }
    }
  }
  for (const term of rankTerms) {
    if (term && (containsTerm(text, term) || text.includes(term.toLowerCase()))) {
      score += 3;
    }
  }
  for (const term of PROJECT_STOCK_DOWNRANK) {
    if (rankTerms.length > 0 && containsTerm(text, term)) {
      score -= 2;
    }
  }
  return score;
}

function bucketFromQuery(sourceQuery: string): DiversityBucket {
  const text = sourceQuery.toLowerCase();
  if (text.includes("poster") || text.includes("editorial")) {
    return "poster-editorial";
  }
  if (text.includes("branding") || text.includes("identity")) {
    return "branding-identity";
  }
  if (text.includes("typography") || text.includes("typeface")) {
    return "typography";
  }
  if (text.includes("illustration") || text.includes("abstract") || text.includes("collage")) {
    return "illustration-abstract";
  }
  if (text.includes("packaging")) {
    return "packaging";
  }
  if (text.includes("graphic") || text.includes("geometric") || text.includes("pattern")) {
    return "graphic-geometric";
  }
  return "other";
}

function diversityBucket(row: unknown, sourceQuery: string): DiversityBucket {
  const text = photoSearchText(row);
  if (containsTerm(text, "poster") || containsTerm(text, "editorial")) {
    return "poster-editorial";
  }
  if (containsTerm(text, "branding") || containsTerm(text, "identity")) {
    return "branding-identity";
  }
  if (containsTerm(text, "typography") || containsTerm(text, "typeface")) {
    return "typography";
  }
  if (
    containsTerm(text, "illustration") ||
    containsTerm(text, "abstract") ||
    containsTerm(text, "collage")
  ) {
    return "illustration-abstract";
  }
  if (containsTerm(text, "packaging")) {
    return "packaging";
  }
  if (
    containsTerm(text, "graphic") ||
    containsTerm(text, "geometric") ||
    containsTerm(text, "pattern") ||
    containsTerm(text, "layout")
  ) {
    return "graphic-geometric";
  }
  return bucketFromQuery(sourceQuery);
}

function dedupeRankAndMix(
  photos: Array<{ photo: unknown; sourceQuery: string }>,
  limit: number,
  rankTerms: string[] = [],
  mixBySourceQuery = false,
): unknown[] {
  const seenIds = new Set<string>();
  const ranked: RankedPhoto[] = [];

  for (const entry of photos) {
    const id = photoId(entry.photo);
    if (!id || seenIds.has(id)) {
      continue;
    }
    if (!isSafeUnsplashPhoto(entry.photo)) {
      continue;
    }
    seenIds.add(id);
    ranked.push({
      id,
      photo: entry.photo,
      score: designRelevanceScore(entry.photo, entry.sourceQuery, rankTerms),
      bucket: diversityBucket(entry.photo, entry.sourceQuery),
      sourceQuery: entry.sourceQuery,
    });
  }

  if (mixBySourceQuery) {
    const byQuery = new Map<string, RankedPhoto[]>();
    for (const entry of ranked) {
      const list = byQuery.get(entry.sourceQuery) ?? [];
      list.push(entry);
      byQuery.set(entry.sourceQuery, list);
    }
    for (const list of byQuery.values()) {
      list.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
    }

    const queues = [...byQuery.values()];
    const mixed: unknown[] = [];
    while (mixed.length < limit) {
      let added = false;
      for (const queue of queues) {
        const next = queue.shift();
        if (!next) {
          continue;
        }
        mixed.push(next.photo);
        added = true;
        if (mixed.length >= limit) {
          break;
        }
      }
      if (!added) {
        break;
      }
    }
    return mixed;
  }

  const buckets = new Map<DiversityBucket, RankedPhoto[]>();
  for (const bucket of DIVERSITY_BUCKETS) {
    buckets.set(bucket, []);
  }
  for (const entry of ranked) {
    buckets.get(entry.bucket)?.push(entry);
  }
  for (const entries of buckets.values()) {
    entries.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  }

  const mixed: unknown[] = [];
  while (mixed.length < limit) {
    let added = false;
    for (const bucket of DESIGN_BUCKETS) {
      const next = buckets.get(bucket)?.shift();
      if (!next) {
        continue;
      }
      mixed.push(next.photo);
      added = true;
      if (mixed.length >= limit) {
        break;
      }
    }
    if (!added) {
      break;
    }
  }

  const leftovers = buckets.get("other") ?? [];
  while (mixed.length < limit && leftovers.length > 0) {
    mixed.push(leftovers.shift()!.photo);
  }

  return mixed;
}

function mixProjectPhotos(
  photos: Array<{ photo: unknown; sourceQuery: string }>,
  context: ReturnType<typeof expandProjectDesignContext>,
  limit: number,
): {
  results: unknown[];
  rawCount: number;
  uniqueCount: number;
  debugRanking: NonNullable<CachedSearchBody["debugRanking"]>;
} {
  const seenIds = new Map<
    string,
    { photo: unknown; sourceQuery: string; score: ProjectScoreBreakdown; bucket: DiversityBucket }
  >();
  const rawCount = photos.length;
  const debugRanking: NonNullable<CachedSearchBody["debugRanking"]> = [];
  const debugSeen = new Set<string>();

  const pushDebug = (id: string, score: ProjectScoreBreakdown, excludedReason: string | null) => {
    if (debugSeen.has(id) || debugRanking.length >= 80) {
      return;
    }
    debugSeen.add(id);
    debugRanking.push({
      id,
      designScore: Number(score.designScore.toFixed(3)),
      subjectScore: Number(score.subjectScore.toFixed(3)),
      moodScore: Number(score.moodScore.toFixed(3)),
      excludedReason,
    });
  };

  for (const entry of photos) {
    const id = photoId(entry.photo);
    if (!id) {
      continue;
    }
    if (isTooSmall(entry.photo)) {
      pushDebug(id, {
        designScore: 0,
        subjectScore: 0,
        moodScore: 0,
        queryMatchScore: 0,
        visualQualityScore: 0,
        finalScore: -1,
        excludedReason: "too_small",
      }, "too_small");
      continue;
    }

    const score = scoreProjectPhoto(entry.photo, entry.sourceQuery, context);
    if (score.excludedReason?.startsWith("hard_exclude")) {
      pushDebug(id, score, score.excludedReason);
      continue;
    }
    if (!isSafeUnsplashPhoto(entry.photo)) {
      pushDebug(id, { ...score, excludedReason: "content_safety" }, "content_safety");
      continue;
    }

    const existing = seenIds.get(id);
    if (existing && existing.score.finalScore >= score.finalScore) {
      continue;
    }
    seenIds.set(id, {
      photo: entry.photo,
      sourceQuery: entry.sourceQuery,
      score,
      bucket: diversityBucket(entry.photo, entry.sourceQuery),
    });
  }

  const uniqueAll = [...seenIds.entries()].map(([id, entry]) => ({ id, ...entry }));
  const uniqueFiltered = uniqueAll.filter((entry) => entry.score.finalScore >= 0.12);
  const unique = (uniqueFiltered.length >= 24 ? uniqueFiltered : uniqueAll).sort(
    (left, right) => right.score.finalScore - left.score.finalScore || left.id.localeCompare(right.id),
  );

  const byQuery = new Map<string, typeof unique>();
  for (const entry of unique) {
    const list = byQuery.get(entry.sourceQuery) ?? [];
    list.push(entry);
    byQuery.set(entry.sourceQuery, list);
  }

  const queues = [...byQuery.values()];
  const mixed: unknown[] = [];
  const recentBuckets: DiversityBucket[] = [];
  const includedIds = new Set<string>();

  while (mixed.length < limit) {
    let added = false;
    for (const queue of queues) {
      let pickIndex = 0;
      while (pickIndex < queue.length) {
        const candidate = queue[pickIndex];
        if (!candidate) {
          break;
        }
        const sameBucketStreak =
          recentBuckets.length >= 2 &&
          recentBuckets[recentBuckets.length - 1] === candidate.bucket &&
          recentBuckets[recentBuckets.length - 2] === candidate.bucket;
        if (sameBucketStreak && queue.length > pickIndex + 1) {
          pickIndex += 1;
          continue;
        }
        queue.splice(pickIndex, 1);
        mixed.push(candidate.photo);
        includedIds.add(candidate.id);
        pushDebug(candidate.id, candidate.score, candidate.score.excludedReason);
        recentBuckets.push(candidate.bucket);
        if (recentBuckets.length > 4) {
          recentBuckets.shift();
        }
        added = true;
        break;
      }
      if (mixed.length >= limit) {
        break;
      }
    }
    if (!added) {
      break;
    }
  }

  for (const entry of unique) {
    if (!includedIds.has(entry.id)) {
      pushDebug(entry.id, entry.score, entry.score.excludedReason ?? "not_in_top_mix");
    }
  }

  return { results: mixed, rawCount, uniqueCount: unique.length, debugRanking };
}

function getCached(key: string): CachedSearchBody | null {
  const entry = searchCache.get(key);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    searchCache.delete(key);
    return null;
  }
  return entry.body;
}

function setCached(key: string, body: CachedSearchBody, ttlMs = CACHE_TTL_MS) {
  if (searchCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = searchCache.keys().next().value;
    if (oldest) {
      searchCache.delete(oldest);
    }
  }
  searchCache.set(key, { expiresAt: Date.now() + ttlMs, body });
}

function getQueryCached(key: string): QueryCacheEntry | null {
  const entry = unsplashQueryCache.get(key);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    unsplashQueryCache.delete(key);
    return null;
  }
  return entry;
}

function setQueryCached(key: string, entry: Omit<QueryCacheEntry, "expiresAt">) {
  if (unsplashQueryCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = unsplashQueryCache.keys().next().value;
    if (oldest) {
      unsplashQueryCache.delete(oldest);
    }
  }
  unsplashQueryCache.set(key, { ...entry, expiresAt: Date.now() + QUERY_CACHE_TTL_MS });
}

async function fetchUnsplashPhotos(
  accessKey: string,
  query: string,
  perPage: number,
  page = 1,
): Promise<{ ok: boolean; status: number; payload?: UnsplashSearchPayload; details?: string }> {
  const unsplashUrl = new URL(UNSPLASH_SEARCH_URL);
  unsplashUrl.searchParams.set("query", query);
  unsplashUrl.searchParams.set("per_page", String(perPage));
  unsplashUrl.searchParams.set("page", String(page));

  const unsplashResponse = await fetch(unsplashUrl, {
    method: "GET",
    headers: {
      Authorization: `Client-ID ${accessKey}`,
      "Accept-Version": "v1",
    },
  });

  if (!unsplashResponse.ok) {
    const details = await unsplashResponse.text();
    return { ok: false, status: unsplashResponse.status, details };
  }

  const payload = (await unsplashResponse.json()) as UnsplashSearchPayload;
  return { ok: true, status: unsplashResponse.status, payload };
}

async function fetchUnsplashPhotosCached(
  accessKey: string,
  query: string,
  perPage: number,
  page: number,
): Promise<{ ok: boolean; status: number; payload?: UnsplashSearchPayload; details?: string }> {
  const cacheKey = `uq:${query.toLowerCase()}:${page}:${perPage}`;
  const cached = getQueryCached(cacheKey);
  if (cached) {
    return {
      ok: cached.ok,
      status: cached.status,
      details: cached.details,
      payload: cached.ok ? { results: cached.photos, total: cached.total } : undefined,
    };
  }

  try {
    const result = await fetchUnsplashPhotos(accessKey, query, perPage, page);
    const photos = Array.isArray(result.payload?.results) ? result.payload.results : [];
    setQueryCached(cacheKey, {
      ok: result.ok,
      status: result.status,
      details: result.details,
      photos,
      total: result.payload?.total ?? 0,
    });
    return result;
  } catch (error) {
    const details = error instanceof Error ? error.message : "unknown";
    setQueryCached(cacheKey, {
      ok: false,
      status: 502,
      details,
      photos: [],
      total: 0,
    });
    return { ok: false, status: 502, details };
  }
}

function appendSafeCollectedPhotos(
  collected: Array<{ photo: unknown; sourceQuery: string }>,
  photos: unknown[],
  sourceQuery: string,
  seenIds: Set<string>,
) {
  for (const photo of photos) {
    if (!isSafeUnsplashPhoto(photo)) {
      continue;
    }
    const id = photoId(photo);
    if (!id || seenIds.has(id)) {
      continue;
    }
    seenIds.add(id);
    collected.push({ photo, sourceQuery });
  }
}

function errorResponse(status: number, details?: string) {
  if (status === 401) {
    return Response.json(
      {
        error:
          "Unsplash가 키를 거부했습니다. .env.local의 UNSPLASH_ACCESS_KEY가 Access Key(비밀키 Secret Key가 아님)인지 확인하고, 개발 서버를 재시작해 주세요.",
        details,
      },
      { status: 401 },
    );
  }

  if (status === 403) {
    return Response.json(
      {
        error:
          "Unsplash가 요청을 막았습니다. 키가 맞는지, 오늘 요청 횟수 한도를 넘기지 않았는지 확인해 주세요.",
        details,
      },
      { status: 403 },
    );
  }

  return Response.json(
    {
      error: `Unsplash 검색에 실패했습니다. (상태 코드 ${status})`,
      details,
    },
    { status: 502 },
  );
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const feed = request.nextUrl.searchParams.get("feed")?.trim() ?? "";
  const isHomeFeed = feed === "home";
  const isProjectFeed = feed === "project";
  // 상세 화면 시각 유사도 추천: 이미 분야·색상·무드가 담긴 영어 쿼리이므로
  // 한→영 변환이나 "graphic design" 접미어 없이 그대로 검색한다(예: 유화 → 포스터 결과로 바뀌는 것 방지).
  const isVisualQuery = !feed && request.nextUrl.searchParams.get("visual") === "1";
  const projectName = request.nextUrl.searchParams.get("name")?.trim() ?? "";
  const projectMood = request.nextUrl.searchParams.get("mood")?.trim() ?? "";
  const page = parsePageParam(request.nextUrl.searchParams.get("page"));

  if (!query && !isHomeFeed && !isProjectFeed) {
    return Response.json(
      {
        error:
          "검색어(q)가 없습니다. 주소 끝에 ?q=office 처럼 검색어를 붙여 주세요. 예: /api/unsplash/search?q=office",
      },
      { status: 400 },
    );
  }

  if (isProjectFeed && (!projectName || !projectMood)) {
    return Response.json(
      { error: "프로젝트 추천에는 name과 mood가 필요합니다." },
      { status: 400 },
    );
  }

  const accessKey = process.env.UNSPLASH_ACCESS_KEY?.trim();

  if (!accessKey) {
    return Response.json(
      {
        error:
          "서버에서 UNSPLASH_ACCESS_KEY를 찾지 못했습니다. .env.local 파일에 UNSPLASH_ACCESS_KEY=키값 이 있는지 확인한 뒤, 개발 서버를 종료하고 다시 시작해 주세요. (npm run dev)",
        details: undefined,
      },
      { status: 500 },
    );
  }

  const cacheKey = isHomeFeed
    ? `home-safe-v2:${page}`
    : isProjectFeed
      ? `project-v8-topic:${projectName.toLowerCase()}:${projectMood.toLowerCase()}:${page}`
      : `${isVisualQuery ? "q-visual-v1" : "q-v4-fast"}:${query.toLowerCase()}:${page}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return Response.json(cached);
  }

  try {
    const projectExpansion = isProjectFeed
      ? expandProjectDesignContext(projectName, projectMood)
      : null;
    const expandedQueries = isHomeFeed
      ? homeSeedQueries(page)
      : isProjectFeed && projectExpansion
        ? projectExpansion.queries.slice(0, 3)
        : isVisualQuery
          ? [query.slice(0, 120)]
          : expandSearchQueries(query);
    const perPage = isHomeFeed
      ? HOME_PER_PAGE
      : isProjectFeed
        ? PROJECT_FEED_PER_PAGE
        : expandedQueries.length === 1
          ? 30
          : SEARCH_PER_PAGE;
    const targetCount = isProjectFeed ? PROJECT_TARGET_COUNT : TARGET_COUNT;
    const collected: Array<{ photo: unknown; sourceQuery: string }> = [];
    const seenIds = new Set<string>();
    let total = 0;
    let firstFailure: { status: number; details?: string } | null = null;
    let requestCount = 0;

    const refillPages = isHomeFeed || isProjectFeed ? SAFETY_REFILL_PAGES : 0;
    for (let pageOffset = 0; pageOffset <= refillPages; pageOffset += 1) {
      const fetchPage = page + pageOffset;
      const settled = await Promise.allSettled(
        expandedQueries.map((expandedQuery) =>
          fetchUnsplashPhotosCached(accessKey, expandedQuery, perPage, fetchPage),
        ),
      );
      requestCount += expandedQueries.length;

      let receivedThisRound = 0;
      for (let index = 0; index < expandedQueries.length; index += 1) {
        const expandedQuery = expandedQueries[index] ?? "";
        const settledEntry = settled[index];
        const entry =
          settledEntry?.status === "fulfilled"
            ? settledEntry.value
            : { ok: false as const, status: 502, details: "request failed" };

        if (!entry.ok) {
          if (!firstFailure) {
            firstFailure = { status: entry.status, details: entry.details };
          }
          continue;
        }

        total += entry.payload?.total ?? 0;
        const photos = Array.isArray(entry.payload?.results) ? entry.payload.results : [];
        receivedThisRound += photos.length;
        appendSafeCollectedPhotos(collected, photos, expandedQuery, seenIds);
      }

      if (pageOffset === 0 && collected.length === 0 && firstFailure) {
        const allFailed = settled.every((entry) => {
          if (entry.status !== "fulfilled") {
            return true;
          }
          return !entry.value.ok;
        });
        if (allFailed) {
          return errorResponse(firstFailure.status, firstFailure.details);
        }
      }

      if (seenIds.size >= targetCount || receivedThisRound === 0) {
        break;
      }
    }

    const mixed =
      isProjectFeed && projectExpansion
        ? mixProjectPhotos(collected, projectExpansion, PROJECT_TARGET_COUNT)
        : {
            results: dedupeRankAndMix(collected, TARGET_COUNT, [], false),
            rawCount: collected.length,
            uniqueCount: seenIds.size,
            debugRanking: [],
          };
    const results = mixed.results.filter((photo) => isSafeUnsplashPhoto(photo));
    const body: CachedSearchBody = {
      query: isHomeFeed || isProjectFeed ? expandedQueries.join(" | ") : query,
      ...(isHomeFeed ? { feed: "home" } : {}),
      ...(isProjectFeed ? { feed: "project" } : {}),
      page,
      expandedQueries,
      requestCount,
      total,
      totalPages: isProjectFeed ? 3 : 1,
      count: results.length,
      rawCount: mixed.rawCount,
      uniqueCount: mixed.uniqueCount,
      hasMore: isProjectFeed && mixed.uniqueCount > results.length,
      results,
    };

    if (process.env.NODE_ENV !== "production" && isProjectFeed && mixed.debugRanking.length > 0) {
      body.debugRanking = mixed.debugRanking;
      console.info("[IDEAVE][project-rank]", mixed.debugRanking);
    }

    setCached(cacheKey, body, isProjectFeed ? PROJECT_CACHE_TTL_MS : CACHE_TTL_MS);
    return Response.json(body);
  } catch (error) {
    return Response.json(
      {
        error:
          "Unsplash 서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
        details: error instanceof Error ? error.message : "unknown",
      },
      { status: 502 },
    );
  }
}
