export const runtime = "nodejs";

import {
  BOARD_COMMON_KEYWORD_COUNT,
  boardItemsToSignalGroups,
  ensureNonEmptyKeywords,
  hasMixedTextAndImageBoardItems,
  isVagueCategoryKeyword,
  mergeKeywordLists,
  parseCommonKeywordBoardItems,
  pickCommonKeywordCandidates,
} from "@/shared/lib/commonKeywords";
import {
  isGeminiQuotaExceededError,
  pickFallbackCommonKeywords,
  resolveGeminiApiKey,
  suggestCommonKeywordsFromBoardItems,
} from "@/shared/lib/gemini";

function clampCount(_value: unknown): number {
  return BOARD_COMMON_KEYWORD_COUNT;
}

function parseItemGroups(body: { items?: unknown; tags?: unknown }) {
  const boardItems = parseCommonKeywordBoardItems(body.items);
  if (boardItems.length > 0) {
    return boardItems;
  }

  if (Array.isArray(body.tags)) {
    const tags = body.tags.filter((t): t is string => typeof t === "string" && t.trim().length > 0);
    if (tags.length > 0) {
      return [{ kind: "image" as const, signals: tags }];
    }
  }

  return [];
}

async function resolveCommonKeywords(
  boardItems: ReturnType<typeof parseCommonKeywordBoardItems>,
  count: number,
  strictCommon: string[],
  flatLabels: string[],
): Promise<{ keywords: string[]; source: "intersection" | "gemini" | "fallback"; reason?: string }> {
  const n = clampCount(count);
  const itemGroups = boardItemsToSignalGroups(boardItems);
  const mixed = hasMixedTextAndImageBoardItems(boardItems);
  const hasVisual = boardItems.some((item) => item.kind === "image" && Boolean(item.imageUrl));
  const usableStrict = strictCommon.filter((word) => !isVagueCategoryKeyword(word));

  if (!mixed && !hasVisual && itemGroups.length > 1 && usableStrict.length >= n) {
    return { keywords: usableStrict.slice(0, n), source: "intersection" };
  }

  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    return {
      keywords: mergeKeywordLists(
        mixed || hasVisual ? [] : usableStrict,
        pickFallbackCommonKeywords(flatLabels, n, itemGroups),
        n,
      ),
      source: "fallback",
      reason: "missing_api_key",
    };
  }

  try {
    const fromGemini = await suggestCommonKeywordsFromBoardItems(boardItems, apiKey, n, {
      strictCommon: usableStrict,
    });

    const keywords = [...new Set(fromGemini.map((k) => k.trim()).filter(Boolean))]
      .filter((word) => !isVagueCategoryKeyword(word))
      .slice(0, n);

    if (keywords.length >= n) {
      return { keywords: keywords.slice(0, n), source: "gemini" };
    }

    const retry = await suggestCommonKeywordsFromBoardItems(boardItems, apiKey, n, {
      strictCommon: usableStrict,
      mandatory: true,
    });
    const merged = [...new Set([...keywords, ...retry].map((k) => k.trim()).filter(Boolean))]
      .filter((word) => !isVagueCategoryKeyword(word))
      .slice(0, n);
    if (merged.length > 0) {
      return { keywords: merged, source: "gemini" };
    }

    return {
      keywords: mergeKeywordLists(
        mixed || hasVisual ? [] : usableStrict,
        pickFallbackCommonKeywords(flatLabels, n, itemGroups),
        n,
      ),
      source: "fallback",
      reason: "empty_model",
    };
  } catch (error) {
    const keywords = mergeKeywordLists(
      mixed || hasVisual ? [] : usableStrict,
      pickFallbackCommonKeywords(flatLabels, n, itemGroups),
      n,
    );
    if (isGeminiQuotaExceededError(error)) {
      return {
        keywords,
        source: "fallback",
        reason: "quota",
      };
    }
    return {
      keywords,
      source: "fallback",
      reason: "error",
    };
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as { items?: unknown; tags?: unknown; count?: unknown };
  const count = clampCount(body.count);
  const boardItems = parseItemGroups(body);

  if (boardItems.length === 0) {
    return Response.json({
      keywords: [] as string[],
      count,
      source: "none" as const,
    });
  }

  const itemGroups = boardItemsToSignalGroups(boardItems);
  const { groups, strictCommon, itemCount } = pickCommonKeywordCandidates(itemGroups);
  const flatLabels = groups.flatLabels;
  const mixed = hasMixedTextAndImageBoardItems(boardItems);

  // 이미지 URL은 Host 헤더 기반 origin 대신 safeImageFetch 허용 목록으로만 내려받는다(SSRF 방어).
  const resolved = await resolveCommonKeywords(boardItems, count, strictCommon, flatLabels);
  const keywords = ensureNonEmptyKeywords(resolved.keywords, itemGroups, BOARD_COMMON_KEYWORD_COUNT).slice(
    0,
    BOARD_COMMON_KEYWORD_COUNT,
  );

  return Response.json({
    keywords,
    count,
    source: resolved.source,
    ...(resolved.reason ? { reason: resolved.reason } : {}),
    itemCount,
    strictCommon,
    mixed,
  });
}
