/** 레퍼런스 카드 뒷면과 동일: 쉼표·하고 분리 */

export type CommonKeywordBoardItem = {
  kind: "text" | "image";
  signals: string[];
  primaryLabel?: string;
  imageUrl?: string;
};

export function parseCommonKeywordBoardItems(raw: unknown): CommonKeywordBoardItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const parsed: CommonKeywordBoardItem[] = [];

  for (const entry of raw) {
    if (Array.isArray(entry)) {
      const signals = entry
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter(Boolean);
      if (signals.length > 0) {
        parsed.push({ kind: "image", signals });
      }
      continue;
    }

    if (!entry || typeof entry !== "object") {
      continue;
    }

    const obj = entry as {
      kind?: unknown;
      signals?: unknown;
      primaryLabel?: unknown;
      imageUrl?: unknown;
    };
    const signals = Array.isArray(obj.signals)
      ? obj.signals
          .filter((t): t is string => typeof t === "string")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];
    const imageUrl =
      typeof obj.imageUrl === "string" && obj.imageUrl.trim() ? obj.imageUrl.trim() : undefined;
    if (signals.length === 0 && !imageUrl) {
      continue;
    }

    const kind: CommonKeywordBoardItem["kind"] = obj.kind === "text" ? "text" : "image";
    const primaryLabel =
      typeof obj.primaryLabel === "string" && obj.primaryLabel.trim()
        ? obj.primaryLabel.trim()
        : undefined;

    parsed.push({
      kind,
      signals,
      ...(primaryLabel ? { primaryLabel } : {}),
      ...(imageUrl ? { imageUrl } : {}),
    });
  }

  return parsed;
}

export function boardItemsToSignalGroups(items: CommonKeywordBoardItem[]): string[][] {
  return items.map((item) => item.signals);
}

export function hasMixedTextAndImageBoardItems(items: CommonKeywordBoardItem[]): boolean {
  let hasText = false;
  let hasImage = false;
  for (const item of items) {
    if (item.kind === "text") {
      hasText = true;
    } else {
      hasImage = true;
    }
  }
  return hasText && hasImage;
}

export function expandKeywordSignalLabel(label: string): string[] {
  const commaIndex = label.search(/[,，]/);
  const primary = (commaIndex === -1 ? label : label.slice(0, commaIndex)).trim();
  if (!primary) {
    return [];
  }
  const parts = primary.split(/\s*하고\s*/).map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [primary];
}

export function normalizeKeywordKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

export const BOARD_COMMON_KEYWORD_COUNT = 3;

const FORMAT_MEDIUM_KEYS = new Set(
  [
    "poster",
    "posters",
    "card",
    "cards",
    "leaflet",
    "flyer",
    "brochure",
    "booklet",
    "magazine",
    "packaging",
    "banner",
    "instagram",
    "포스터",
    "카드",
    "리플렛",
    "전단지",
    "브로슈어",
    "북렛",
    "배너",
  ].map((value) => value.toLowerCase()),
);

export function isFormatMediumKeyword(value: string): boolean {
  return FORMAT_MEDIUM_KEYS.has(normalizeKeywordKey(value));
}

const VAGUE_CATEGORY_KEYS = new Set(
  [
    "질감",
    "색감",
    "구도",
    "이미지",
    "텍스트",
    "전체",
    "레퍼런스",
    "패션",
    "인물",
    "예술",
    "건축",
    "자연",
    "제품",
    "텍스처",
    "아이콘",
    "fashion",
    "human",
    "art",
    "architecture",
    "nature",
    "product",
    "texture",
    "icon",
  ].map((value) => value.toLowerCase()),
);

export function isVagueCategoryKeyword(value: string): boolean {
  const key = normalizeKeywordKey(value);
  if (!key) {
    return true;
  }
  if (VAGUE_CATEGORY_KEYS.has(key) || FORMAT_MEDIUM_KEYS.has(key)) {
    return true;
  }
  return false;
}

export function buildPerItemKeywordGroups(itemSignals: string[][]) {
  const displayByKey = new Map<string, string>();
  const perItemKeys: string[][] = [];
  const flatSet = new Set<string>();

  for (const signals of itemSignals) {
    const keysInItem = new Set<string>();
    for (const raw of signals) {
      const trimmed = raw.trim();
      if (!trimmed) {
        continue;
      }
      flatSet.add(trimmed);
      for (const part of expandKeywordSignalLabel(trimmed)) {
        const key = normalizeKeywordKey(part);
        if (!key) {
          continue;
        }
        keysInItem.add(key);
        if (!displayByKey.has(key)) {
          displayByKey.set(key, part);
        }
      }
    }
    perItemKeys.push([...keysInItem]);
  }

  return {
    perItemKeys,
    displayByKey,
    flatLabels: [...flatSet],
  };
}

export function findSharedKeywordKeys(
  perItemKeys: string[][],
  minItemCount?: number,
): Array<{ key: string; itemCount: number }> {
  if (perItemKeys.length === 0) {
    return [];
  }
  const required = minItemCount ?? Math.max(1, perItemKeys.length);
  const counts = new Map<string, number>();
  for (const keys of perItemKeys) {
    for (const key of keys) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= required)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .map(([key, itemCount]) => ({ key, itemCount }));
}

export function sharedKeysToDisplayLabels(
  shared: Array<{ key: string; itemCount: number }>,
  displayByKey: Map<string, string>,
): string[] {
  const labels: string[] = [];
  for (const { key } of shared) {
    const label = displayByKey.get(key);
    if (label && !labels.includes(label)) {
      labels.push(label);
    }
  }
  return labels;
}

export function pickCommonKeywordCandidates(itemSignals: string[][]) {
  const groups = buildPerItemKeywordGroups(itemSignals);
  const itemCount = groups.perItemKeys.length;
  const strictShared = findSharedKeywordKeys(groups.perItemKeys, itemCount);
  const strictCommon = sharedKeysToDisplayLabels(strictShared, groups.displayByKey);
  return { groups, strictCommon, itemCount };
}

function keywordPartsMatch(a: string, b: string): boolean {
  if (a === b) {
    return true;
  }
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  if (shorter.length < 3) {
    return false;
  }
  return longer.includes(shorter);
}

function keywordOverlapsItemSignals(keyword: string, signals: string[]): boolean {
  const kw = normalizeKeywordKey(keyword);
  if (!kw) {
    return false;
  }
  for (const raw of signals) {
    for (const part of expandKeywordSignalLabel(raw)) {
      const key = normalizeKeywordKey(part);
      if (!key) {
        continue;
      }
      if (keywordPartsMatch(kw, key)) {
        return true;
      }
    }
  }
  return false;
}

export function keywordOverlapsEveryItem(keyword: string, itemGroups: string[][]): boolean {
  if (itemGroups.length === 0) {
    return false;
  }
  return itemGroups.every((group) => keywordOverlapsItemSignals(keyword, group));
}

export function filterKeywordsByAllItems(keywords: string[], itemGroups: string[][]): string[] {
  if (itemGroups.length <= 1) {
    return keywords;
  }
  return keywords.filter((kw) => keywordOverlapsEveryItem(kw, itemGroups));
}

export function pickAllItemsOverlapKeywords(itemGroups: string[][], count: number): string[] {
  const n = Math.min(5, Math.max(1, Math.floor(count)));
  const { groups, strictCommon } = pickCommonKeywordCandidates(itemGroups);
  const out = strictCommon.filter((word) => !isVagueCategoryKeyword(word));
  const candidates: string[] = [];

  for (const label of groups.flatLabels) {
    for (const part of expandKeywordSignalLabel(label)) {
      if (part && !candidates.includes(part)) {
        candidates.push(part);
      }
    }
  }

  const fuzzyMatches = candidates
    .filter((part) => !out.includes(part) && !isVagueCategoryKeyword(part) && keywordOverlapsEveryItem(part, itemGroups))
    .sort((a, b) => {
      const freq = (word: string) =>
        groups.flatLabels.filter((label) =>
          expandKeywordSignalLabel(label).some(
            (part) => normalizeKeywordKey(part) === normalizeKeywordKey(word),
          ),
        ).length;
      return freq(b) - freq(a) || a.localeCompare(b, "ko");
    });

  for (const part of fuzzyMatches) {
    out.push(part);
    if (out.length >= n) {
      return out.slice(0, n);
    }
  }

  if (out.length >= n) {
    return out.slice(0, n);
  }

  for (const label of groups.flatLabels) {
    const trimmed = label.trim();
    if (trimmed && !out.includes(trimmed) && !isVagueCategoryKeyword(trimmed)) {
      out.push(trimmed);
    }
    if (out.length >= n) {
      break;
    }
  }

  return out.slice(0, n);
}

export function ensureNonEmptyKeywords(
  keywords: string[],
  itemGroups: string[][],
  count: number,
): string[] {
  const n = Math.min(5, Math.max(1, Math.floor(count)));
  const trimmed = [...new Set(keywords.map((k) => k.trim()).filter(Boolean))].filter(
    (word) => !isVagueCategoryKeyword(word),
  );
  if (trimmed.length > 0) {
    return trimmed.slice(0, n);
  }
  if (itemGroups.length > 1) {
    return pickAllItemsOverlapKeywords(itemGroups, n);
  }
  const single = itemGroups[0] ?? [];
  const unique = [...new Set(single.map((t) => t.trim()).filter(Boolean))];
  return unique.slice(0, n);
}

export function keywordOverlapsSignals(keyword: string, flatLabels: string[]): boolean {
  const kw = normalizeKeywordKey(keyword);
  if (!kw) {
    return false;
  }
  for (const raw of flatLabels) {
    for (const part of expandKeywordSignalLabel(raw)) {
      const key = normalizeKeywordKey(part);
      if (!key) {
        continue;
      }
      if (keywordPartsMatch(kw, key)) {
        return true;
      }
    }
  }
  return false;
}

export function filterKeywordsBySignalOverlap(keywords: string[], flatLabels: string[]): string[] {
  return keywords.filter((kw) => keywordOverlapsSignals(kw, flatLabels));
}

export function mergeKeywordLists(primary: string[], secondary: string[], limit: number): string[] {
  const out: string[] = [];
  for (const word of [...primary, ...secondary]) {
    const trimmed = word.trim();
    if (!trimmed || out.includes(trimmed)) {
      continue;
    }
    out.push(trimmed);
    if (out.length >= limit) {
      break;
    }
  }
  return out;
}
