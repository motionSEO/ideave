import type { ExploreTextDetailContent } from "@/shared/lib/exploreTextDetails";

const MAX_ENTRIES = 300;

function cacheKey(label: string, category?: string): string {
  return `${label.trim().toLowerCase()}::${category ?? "keyword"}`;
}

const runtimeCache = new Map<string, ExploreTextDetailContent>();

export function getRuntimeExploreTextDetailCache(
  label: string,
  category?: string,
): ExploreTextDetailContent | null {
  return runtimeCache.get(cacheKey(label, category)) ?? null;
}

export function setRuntimeExploreTextDetailCache(
  label: string,
  category: string | undefined,
  detail: ExploreTextDetailContent,
): void {
  const key = cacheKey(label, category);
  if (runtimeCache.size >= MAX_ENTRIES && !runtimeCache.has(key)) {
    const oldest = runtimeCache.keys().next().value;
    if (oldest) {
      runtimeCache.delete(oldest);
    }
  }
  runtimeCache.set(key, detail);
}
