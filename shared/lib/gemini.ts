import {
  BOARD_COMMON_KEYWORD_COUNT,
  type CommonKeywordBoardItem,
  hasMixedTextAndImageBoardItems,
  isVagueCategoryKeyword,
  pickAllItemsOverlapKeywords,
} from "@/shared/lib/commonKeywords";
import { fetchAllowedImage, UnsafeImageUrlError } from "@/shared/lib/safeImageFetch";
import { getServerEnv } from "@/shared/lib/serverEnv";

type GeminiTagResponse = {
  colorTone: string;
  mood: string;
  style: string;
  objectTags: string[];
};

// 이미지 포함 멀티모달·generateContent용. 2.5 Flash보다 저렴한 동급 Flash-Lite 스테이블 모델.
// https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite
const GEMINI_MODELS = ["gemini-2.5-flash-lite"];

function getGeminiApiUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

export function resolveGeminiApiKey(): string | null {
  const candidates = [
    getServerEnv("GOOGLE_API_KEY"),
    getServerEnv("GEMINI_API_KEY"),
    getServerEnv("GOOGLE_GENERATIVE_AI_API_KEY"),
    getServerEnv("NEXT_PUBLIC_GOOGLE_API_KEY"),
  ];

  for (const candidate of candidates) {
    if (candidate && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

function extractJsonBlock(text: string): string {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }
  return text.trim();
}

export function normalizeGeneratedTags(parsed: GeminiTagResponse): string[] {
  const baseTags = [parsed.colorTone, parsed.mood, parsed.style, ...parsed.objectTags]
    .map((tag) => tag?.trim())
    .filter((tag): tag is string => Boolean(tag));

  const deduped = Array.from(new Set(baseTags));
  return deduped.slice(0, 8);
}

export type GeminiAnalysisResult = {
  tags: string[];
  analysis: {
    colorTone: string;
    mood: string;
    style: string;
  };
};

export function buildGeminiQuotaFallback(): GeminiAnalysisResult {
  return {
    tags: [
      "분석 대기 중",
      "API 쿼터 초과",
      "Gemini 미응답",
      "이미지만 저장됨",
      "추후 재분석",
    ],
    analysis: {
      colorTone: "—",
      mood: "Gemini API 할당이 초과되어 자동 분석을 건너뜀",
      style: "쿼터·결제 상태 확인 후 같은 이미지로 재시도하세요",
    },
  };
}

export function isGeminiQuotaExceededError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message;
  return (
    message.includes("quota exceeded") ||
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes('"code": 429')
  );
}

export async function analyzeImageWithGemini(file: File, apiKey: string): Promise<GeminiAnalysisResult> {
  const bytes = await file.arrayBuffer();
  const base64Image = Buffer.from(bytes).toString("base64");
  const requestBody = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "이미지를 분석해서 다음 JSON 스키마로만 응답해 주세요.",
              "응답 언어는 한국어로 해 주세요.",
              "오브젝트 태그는 5~8개로 작성해 주세요.",
              '{ "colorTone": "string", "mood": "string", "style": "string", "objectTags": ["string", "..."] }',
            ].join("\n"),
          },
          {
            inlineData: {
              mimeType: file.type,
              data: base64Image,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.3,
      responseMimeType: "application/json",
    },
  });

  const errors: string[] = [];

  for (const model of GEMINI_MODELS) {
    const geminiResponse = await fetch(`${getGeminiApiUrl(model)}?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: requestBody,
    });

    if (!geminiResponse.ok) {
      const errorBody = await geminiResponse.text();
      if (geminiResponse.status === 429 || errorBody.includes("RESOURCE_EXHAUSTED")) {
        throw new Error(
          "Gemini API quota exceeded. Check billing/usage limits in Google AI Studio and try again."
        );
      }
      errors.push(`${model}: ${errorBody}`);
      continue;
    }

    const raw = (await geminiResponse.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const text = raw.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      errors.push(`${model}: Gemini response did not include text.`);
      continue;
    }

    const parsed = JSON.parse(extractJsonBlock(text)) as GeminiTagResponse;
    if (!Array.isArray(parsed.objectTags)) {
      errors.push(`${model}: objectTags must be an array.`);
      continue;
    }

    const tags = normalizeGeneratedTags(parsed);
    if (tags.length < 5) {
      errors.push(`${model}: Not enough tags generated.`);
      continue;
    }

    return {
      tags,
      analysis: {
        colorTone: parsed.colorTone,
        mood: parsed.mood,
        style: parsed.style,
      },
    };
  }

  throw new Error(`Gemini API request failed for all models. ${errors.join(" | ")}`);
}

type GeminiKeywordJson = {
  keyword?: string;
  keywords?: string[];
};

function clampKeywordCount(count: number): number {
  if (!Number.isFinite(count)) {
    return BOARD_COMMON_KEYWORD_COUNT;
  }

  return Math.min(BOARD_COMMON_KEYWORD_COUNT, Math.max(1, Math.floor(count)));
}

const DESIGN_KEYWORD_RULES = [
  "반드시 구체적인 디자인 용어를 쓰세요. 한 단어 카테고리는 금지입니다.",
  "나쁜 예(절대 사용 금지): 질감, 색감, 구도, 포스터, 패션, 인물, 예술, 텍스처, 이미지.",
  "좋은 예:",
  "- 무드/코어: 드림코어, 요2k, 코케트코어, 고프코어, 아쿠아코어, 다크아카데미아, 에디토리얼",
  "- 질감/기법: 그레인, 하프톤, 글라스모피즘, 뉴모피즘, 노이즈텍스처, 리퀴드글래스, 크롬메탈",
  "- 포스터/형식: 인포그래픽 포스터, 패션 포스터, 타이포 포스터, 정치 포스터, 브루탈리즘 포스터",
  "포스터라면 어떤 포스터인지, 질감이라면 어떤 질감/기법인지까지 붙여 쓰세요.",
].join("\n");

async function requestGeminiKeywordJson(
  apiKey: string,
  promptLines: Array<string | null>,
  n: number,
): Promise<string[] | null> {
  const requestBody = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [
          {
            text: promptLines.filter((line): line is string => line !== null).join("\n"),
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.25,
      responseMimeType: "application/json",
    },
  });

  const errors: string[] = [];

  for (const model of GEMINI_MODELS) {
    const geminiResponse = await fetch(`${getGeminiApiUrl(model)}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
    });

    if (!geminiResponse.ok) {
      const errorBody = await geminiResponse.text();
      if (geminiResponse.status === 429 || errorBody.includes("RESOURCE_EXHAUSTED")) {
        throw new Error(
          "Gemini API quota exceeded. Check billing/usage limits in Google AI Studio and try again.",
        );
      }
      errors.push(`${model}: ${errorBody}`);
      continue;
    }

    const raw = (await geminiResponse.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const text = raw.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      errors.push(`${model}: Gemini response did not include text.`);
      continue;
    }

    try {
      const list = parseKeywordJsonList(text, n);
      if (list.length > 0) {
        return list;
      }

      errors.push(`${model}: keywords missing or empty.`);
    } catch {
      errors.push(`${model}: Failed to parse keywords JSON.`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Gemini keyword request failed for all models. ${errors.join(" | ")}`);
  }

  return null;
}

const MAX_VISION_IMAGES = 6;
const MAX_VISION_BYTES = 4_000_000;

/** 보드 이미지 URL은 클라이언트 입력이므로 safeImageFetch 허용 목록을 통과한 것만 내려받는다. */
async function fetchImageAsGeminiPart(
  url: string,
): Promise<{ inlineData: { mimeType: string; data: string } } | null> {
  try {
    const { bytes, mimeType: fetchedMime } = await fetchAllowedImage(url, {
      maxBytes: MAX_VISION_BYTES,
      timeoutMs: 8000,
    });
    if (bytes.length < 32) {
      return null;
    }
    const mimeType = /^image\//i.test(fetchedMime) ? fetchedMime : "image/jpeg";
    return { inlineData: { mimeType, data: bytes.toString("base64") } };
  } catch (error) {
    if (error instanceof UnsafeImageUrlError) {
      console.warn(`[IDEAVE] Board image skipped: ${error.message}`);
    }
    return null;
  }
}

async function loadBoardImageParts(
  items: CommonKeywordBoardItem[],
): Promise<Array<{ inlineData: { mimeType: string; data: string } }>> {
  const urls = items
    .filter((item) => item.kind === "image")
    .map((item) => item.imageUrl?.trim())
    .filter((url): url is string => Boolean(url))
    .slice(0, MAX_VISION_IMAGES);

  const parts = await Promise.all(urls.map((url) => fetchImageAsGeminiPart(url)));
  return parts.filter((part): part is { inlineData: { mimeType: string; data: string } } => part !== null);
}

function parseKeywordJsonList(text: string, n: number): string[] {
  const parsed = JSON.parse(extractJsonBlock(text)) as GeminiKeywordJson;
  let list: string[] = [];
  if (Array.isArray(parsed.keywords)) {
    list = parsed.keywords.filter((entry): entry is string => typeof entry === "string");
  } else if (typeof parsed.keyword === "string" && parsed.keyword.trim()) {
    list = [parsed.keyword.trim()];
  }
  return [...new Set(list.map((k) => k.trim()).filter(Boolean))]
    .filter((word) => !isVagueCategoryKeyword(word))
    .map((word) => word.slice(0, 24))
    .slice(0, n);
}

function visualCommonKeywordPrompt(
  n: number,
  items: CommonKeywordBoardItem[],
  already: string[] = [],
): string {
  const textItems = items.filter((item) => item.kind === "text");
  const imageCount = items.filter((item) => item.kind === "image" && item.imageUrl).length;
  const lines = [
    "당신은 그래픽·비주얼 디자인 레퍼런스 큐레이터입니다.",
    "첨부한 이미지들을 직접 보고, 모든 이미지에 공통되는 디자인 언어를 한국어 키워드로 추출하세요.",
    "",
    DESIGN_KEYWORD_RULES,
    "",
    `서로 다른 각도(무드/코어, 질감·기법, 형식·장르)로 키워드를 정확히 ${n}개 만드세요.`,
    "한 이미지에만 있는 요소는 제외하세요.",
  ];
  if (already.length > 0) {
    lines.push(
      `이미 확보한 키워드: ${already.join(", ")}`,
      "이와 겹치지 않게 구체 디자인 용어를 더해, 합쳐서 정확히 3개가 되게 하세요.",
    );
  }
  if (textItems.length > 0) {
    lines.push("", "## 함께 선택된 텍스트·키워드 카드", formatMixedBoardTextLines(textItems));
    lines.push("텍스트 카드의 개념과도 맞으면서, 이미지에서 실제로 보이는 공통 디자인 언어를 고르세요.");
  }
  if (imageCount <= 1) {
    lines.push("이미지가 하나면 그 이미지를 가장 잘 설명하는 구체 디자인 용어 3개를 고르세요.");
  }
  lines.push(
    "",
    '반드시 JSON 한 객체만: { "keywords": ["...", "...", "..."] }',
    `keywords 배열 길이는 정확히 ${n}개.`,
    "부가 설명 금지.",
  );
  return lines.join("\n");
}

async function requestVisionKeywordList(
  apiKey: string,
  prompt: string,
  imageParts: Array<{ inlineData: { mimeType: string; data: string } }>,
  n: number,
  temperature: number,
): Promise<string[]> {
  const requestBody = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }, ...imageParts],
      },
    ],
    generationConfig: {
      temperature,
      responseMimeType: "application/json",
    },
  });

  const errors: string[] = [];
  for (const model of GEMINI_MODELS) {
    const geminiResponse = await fetch(`${getGeminiApiUrl(model)}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
    });

    if (!geminiResponse.ok) {
      const errorBody = await geminiResponse.text();
      if (geminiResponse.status === 429 || errorBody.includes("RESOURCE_EXHAUSTED")) {
        throw new Error(
          "Gemini API quota exceeded. Check billing/usage limits in Google AI Studio and try again.",
        );
      }
      errors.push(`${model}: ${errorBody}`);
      continue;
    }

    const raw = (await geminiResponse.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const text = raw.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      errors.push(`${model}: Gemini response did not include text.`);
      continue;
    }
    try {
      const list = parseKeywordJsonList(text, n);
      if (list.length > 0) {
        return list;
      }
      errors.push(`${model}: keywords missing or empty.`);
    } catch {
      errors.push(`${model}: Failed to parse keywords JSON.`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Gemini vision keyword request failed for all models. ${errors.join(" | ")}`);
  }
  return [];
}

async function suggestVisualCommonKeywordsFromBoardItems(
  items: CommonKeywordBoardItem[],
  apiKey: string,
): Promise<string[]> {
  const n = BOARD_COMMON_KEYWORD_COUNT;
  const imageParts = await loadBoardImageParts(items);
  if (imageParts.length === 0) {
    return [];
  }

  let collected = await requestVisionKeywordList(
    apiKey,
    visualCommonKeywordPrompt(n, items),
    imageParts,
    n,
    0.2,
  );

  if (collected.length < n) {
    const extra = await requestVisionKeywordList(
      apiKey,
      visualCommonKeywordPrompt(n, items, collected),
      imageParts,
      n,
      0.4,
    );
    collected = [...new Set([...collected, ...extra].filter((word) => !isVagueCategoryKeyword(word)))];
  }

  return collected.slice(0, n);
}

function formatMixedBoardTextLines(textItems: CommonKeywordBoardItem[]): string {
  return textItems
    .map((item, index) => {
      const label = item.primaryLabel ?? item.signals[0] ?? "";
      const contextSignals = item.signals.filter((signal) => signal !== label);
      const context =
        contextSignals.length > 0 ? ` (맥락: ${contextSignals.join(", ")})` : "";
      return `[${index + 1}] ${label}${context}`;
    })
    .join("\n");
}

function formatMixedBoardImageLines(imageItems: CommonKeywordBoardItem[]): string {
  return imageItems
    .map((item, index) => `[${index + 1}] ${item.signals.join(", ")}`)
    .join("\n");
}

/** 텍스트·키워드 카드 + 이미지 태그를 함께 분석해 진짜 공통 주제 추출 */
async function suggestMixedBoardCommonKeywords(
  items: CommonKeywordBoardItem[],
  apiKey: string,
  count: number,
  options?: { mandatory?: boolean },
): Promise<string[]> {
  const n = clampKeywordCount(count);
  const textItems = items.filter((item) => item.kind === "text");
  const imageItems = items.filter((item) => item.kind === "image");

  if (textItems.length === 0 || imageItems.length === 0) {
    return [];
  }

  const list = await requestGeminiKeywordJson(
    apiKey,
    [
      "당신은 디자인·예술 레퍼런스 보드 큐레이터입니다.",
      "아래 텍스트·키워드 카드와 이미지 레퍼런스 태그를 함께 분석해, 모든 항목을 동시에 아우르는 공통 주제 키워드를 찾으세요.",
      "",
      "중요 규칙:",
      "- 이미지 태그만 복사하거나 이미지 쪽만 반영하지 마세요.",
      "- 각 텍스트·키워드 카드의 핵심 개념이 공통 키워드에 반드시 드러나야 합니다.",
      "- 텍스트와 이미지가 다른 표현을 써도(예: 텍스트 '미니멀리즘', 이미지 '여백·단순') 의미상 공통 주제를 추상화하세요.",
      "- 한쪽 항목에만 해당하는 키워드는 제외하세요.",
      "- 포스터·카드·리플렛·전단지 같은 매체 형식 이름은 쓰지 마세요.",
      DESIGN_KEYWORD_RULES,
      options?.mandatory
        ? "반드시 모든 텍스트 카드와 모든 이미지 카드를 아우르는 키워드만 제시하세요."
        : null,
      "",
      "## 텍스트·키워드 카드",
      formatMixedBoardTextLines(textItems),
      "",
      "## 이미지 레퍼런스 (시각·구성 태그)",
      formatMixedBoardImageLines(imageItems),
      "",
      `위 텍스트·키워드와 이미지를 모두 아우르는 구체 디자인 용어를 정확히 ${n}개 JSON으로 응답하세요.`,
      "대표성이 높은 순, 서로 겹치지 않게.",
      "",
      '반드시 JSON 한 객체만: { "keywords": ["...", "...", "..."] }',
      `keywords 배열 길이는 정확히 ${n}개.`,
      "부가 설명 금지.",
    ],
    n,
  );

  return list ?? [];
}

/** 보드 항목 종류(텍스트/이미지)를 구분해 Gemini로 공통 키워드 추출 */
export async function suggestCommonKeywordsFromBoardItems(
  items: CommonKeywordBoardItem[],
  apiKey: string,
  count: number,
  options?: { mandatory?: boolean; strictCommon?: string[] },
): Promise<string[]> {
  const n = BOARD_COMMON_KEYWORD_COUNT;
  const nonEmpty = items.filter(
    (item) => item.signals.some((t) => t.trim().length > 0) || Boolean(item.imageUrl?.trim()),
  );
  if (nonEmpty.length === 0) {
    return [];
  }

  let collected: string[] = [];
  if (nonEmpty.some((item) => item.kind === "image" && item.imageUrl)) {
    collected = await suggestVisualCommonKeywordsFromBoardItems(nonEmpty, apiKey);
    if (collected.length >= n) {
      return collected.slice(0, n);
    }
  }

  const rest = hasMixedTextAndImageBoardItems(nonEmpty)
    ? await suggestMixedBoardCommonKeywords(nonEmpty, apiKey, n, { ...options, mandatory: true })
    : await suggestCommonKeywordsFromTagGroups(
        nonEmpty.map((item) => item.signals),
        apiKey,
        n,
        { strictCommon: options?.strictCommon ?? [], mandatory: true },
      );

  for (const word of rest) {
    const trimmed = word.trim();
    if (!trimmed || isVagueCategoryKeyword(trimmed) || collected.includes(trimmed)) {
      continue;
    }
    collected.push(trimmed);
    if (collected.length >= n) {
      break;
    }
  }

  return collected.slice(0, n);
}

export async function suggestCommonKeywordsFromTagGroups(
  itemGroups: string[][],
  apiKey: string,
  count: number,
  sharedHints: { strictCommon: string[]; mandatory?: boolean },
): Promise<string[]> {
  const nonEmptyGroups = itemGroups
    .map((group) => [...new Set(group.map((t) => t.trim()).filter(Boolean))])
    .filter((group) => group.length > 0);
  const n = clampKeywordCount(count);
  if (nonEmptyGroups.length === 0) {
    return [];
  }

  const groupedLines = nonEmptyGroups
    .map((group, index) => {
      const kind = group.length <= 2 ? "텍스트·키워드" : "이미지 태그";
      return `[${index + 1}] (${kind}) ${group.join(", ")}`;
    })
    .join("\n");
  const hasTextLikeGroup = nonEmptyGroups.some((group) => group.length <= 2);
  const hintLines: string[] = [];
  if (sharedHints.strictCommon.length > 0) {
    hintLines.push(`모든 항목에 공통으로 등장하는 태그: ${sharedHints.strictCommon.join(", ")}`);
  }
  if (hasTextLikeGroup) {
    hintLines.push(
      "텍스트·키워드 항목이 포함되어 있습니다. 공통 키워드는 이미지 태그뿐 아니라 텍스트·키워드 항목의 핵심 개념과도 맞아야 합니다.",
    );
  }

  const requestBody = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "캔버스에서 선택한 레퍼런스마다 이미지 태그·텍스트 키워드가 있습니다.",
              DESIGN_KEYWORD_RULES,
              "한 항목에만 있는 태그를 그대로 뽑지 마세요.",
              nonEmptyGroups.length === 1
                ? "항목이 하나뿐이면 그 항목을 대표하는 키워드를 고르세요."
                : sharedHints.mandatory
                  ? "태그 문자열이 직접 겹치지 않아도, 모든 항목을 아우르는 추상적 공통 주제를 반드시 키워드로 제시하세요."
                  : "모든 항목에 공통되는 개념만 답하세요. 일부 항목에만 해당하면 제외하세요.",
              "",
              "항목별 태그:",
              groupedLines,
              hintLines.length > 0 ? "" : null,
              ...hintLines,
              "",
              `구체 디자인 용어 키워드를 정확히 ${n}개 JSON으로 응답하세요.`,
              sharedHints.mandatory ? `keywords는 반드시 ${n}개여야 합니다.` : null,
              "대표성이 높은 순, 서로 겹치지 않게.",
              "",
              '반드시 JSON 한 객체만: { "keywords": ["...", "...", "..."] }',
              `keywords 배열 길이는 정확히 ${n}개.`,
              "부가 설명 금지.",
            ]
              .filter((line): line is string => line !== null)
              .join("\n"),
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });

  const flatTags = nonEmptyGroups.flat();
  const errors: string[] = [];

  for (const model of GEMINI_MODELS) {
    const geminiResponse = await fetch(`${getGeminiApiUrl(model)}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
    });

    if (!geminiResponse.ok) {
      const errorBody = await geminiResponse.text();
      if (geminiResponse.status === 429 || errorBody.includes("RESOURCE_EXHAUSTED")) {
        throw new Error(
          "Gemini API quota exceeded. Check billing/usage limits in Google AI Studio and try again.",
        );
      }
      errors.push(`${model}: ${errorBody}`);
      continue;
    }

    const raw = (await geminiResponse.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const text = raw.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      errors.push(`${model}: Gemini response did not include text.`);
      continue;
    }

    try {
      const parsed = JSON.parse(extractJsonBlock(text)) as GeminiKeywordJson;
      let list: string[] = [];

      if (Array.isArray(parsed.keywords)) {
        list = parsed.keywords.filter((entry): entry is string => typeof entry === "string");
      } else if (typeof parsed.keyword === "string" && parsed.keyword.trim()) {
        list = [parsed.keyword.trim()];
      }

      list = [...new Set(list.map((k) => k.trim()).filter(Boolean))]
        .filter((word) => !isVagueCategoryKeyword(word))
        .slice(0, n);
      const fillers = [
        ...sharedHints.strictCommon,
        ...pickFallbackCommonKeywords(flatTags, n, nonEmptyGroups),
      ].filter((word) => !isVagueCategoryKeyword(word));
      for (const w of fillers) {
        if (!list.includes(w) && list.length < n) {
          list.push(w);
        }
      }

      if (list.length > 0) {
        return list.map((w) => w.slice(0, 32)).slice(0, n);
      }

      errors.push(`${model}: keywords missing or empty.`);
    } catch {
      errors.push(`${model}: Failed to parse keywords JSON.`);
    }
  }

  return pickFallbackCommonKeywords(flatTags, n, nonEmptyGroups);
}

export async function suggestCommonKeywordsFromTags(
  tags: string[],
  apiKey: string,
  count: number,
): Promise<string[]> {
  const unique = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
  return suggestCommonKeywordsFromTagGroups([unique], apiKey, count, { strictCommon: [] });
}

/** @deprecated 하나만 필요하면 `suggestCommonKeywordsFromTags(tags, apiKey, 1)` 후 `[0]` 사용. */
export async function suggestCommonKeywordFromTags(tags: string[], apiKey: string): Promise<string> {
  const list = await suggestCommonKeywordsFromTags(tags, apiKey, 1);
  return list[0] ?? "";
}

function pickFallbackCommonKeywordsByFrequency(tags: string[], count: number): string[] {
  const n = clampKeywordCount(count);
  const counts = new Map<string, number>();

  for (const raw of tags) {
    const t = raw.trim();
    if (!t) {
      continue;
    }
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .map(([word]) => word);

  const out: string[] = [];
  for (const w of ranked) {
    if (isVagueCategoryKeyword(w)) {
      continue;
    }
    if (!out.includes(w)) {
      out.push(w);
    }
    if (out.length >= n) {
      break;
    }
  }

  return out;
}

/** Gemini 없을 때 태그 빈도로 상위 여러 개 (폴백). */
export function pickFallbackCommonKeywords(
  tags: string[],
  count: number,
  itemGroups?: string[][],
): string[] {
  const n = clampKeywordCount(count);
  if (itemGroups && itemGroups.length > 1) {
    return pickAllItemsOverlapKeywords(itemGroups, n);
  }
  if (itemGroups && itemGroups.length === 1) {
    return pickFallbackCommonKeywordsByFrequency(itemGroups[0] ?? [], n);
  }
  return pickFallbackCommonKeywordsByFrequency(tags, n);
}

/** Gemini 없을 때 빈도 1순위 태그 (폴백). */
export function pickFallbackCommonKeyword(tags: string[]): string {
  return pickFallbackCommonKeywords(tags, 1)[0] ?? "";
}

type GeminiSearchSuggestionsJson = {
  suggestions?: string[];
};

/** 프로젝트 맥락 없을 때·API 실패 시 레퍼런스 검색용 추천어 폴백. */
export function pickFallbackProjectSearchQueries(projectName: string, goal: string): string[] {
  const name = projectName.trim();
  const goalLine = goal.trim();
  const combined = `${name} ${goalLine}`.trim();

  const tokens = [...new Set(combined.split(/\s+/).filter((w) => w.length >= 2))];

  const candidates = [
    combined,
    `${name} 무드보드`,
    `${name} 레퍼런스`,
    goalLine,
    tokens.slice(0, 4).join(" "),
    `${name} ${tokens[0] ?? "비주얼"}`,
    `${goalLine} 스타일`,
  ]
    .map((s) => s.trim())
    .filter(Boolean);

  return [...new Set(candidates)].slice(0, 5);
}

/** 프로젝트 이름·목표로 레퍼런스 이미지 검색에 쓸 추천 검색어 5개 생성. */
export async function suggestProjectSearchQueries(
  projectName: string,
  goal: string,
  apiKey: string,
): Promise<string[]> {
  const name = projectName.trim();
  const goalLine = goal.trim();

  if (!name || !goalLine) {
    return [];
  }

  const requestBody = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "사용자가 디자인·크리에이티브 레퍼런스 이미지를 찾고 있습니다.",
              `프로젝트 이름: ${name}`,
              `한 줄 목표: ${goalLine}`,
              "",
              "위 맥락에 맞는 레퍼런스 이미지 검색용 추천 검색어를 정확히 5개 만들어 주세요.",
              "검색어에는 프로젝트 주제·소재(이름에서 드러나는 대상, 장소, 콘텐츠)가 반드시 들어가야 합니다.",
              "스타일·무드만으로 된 검색어는 만들지 마세요. 주제 + 무드/스타일을 함께 섞으세요.",
              "각 검색어는 2~16자 정도의 짧은 한국어 구문이어야 하며, 서로 다른 각도(주제·소재·무드·스타일·용도)를 다루세요.",
              "해시태그(#)는 넣지 마세요.",
              "",
              '반드시 JSON 한 객체만 응답: { "suggestions": ["...", "...", "...", "...", "..."] }',
              "suggestions 배열 길이는 정확히 5.",
              "부가 설명 금지.",
            ].join("\n"),
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      responseMimeType: "application/json",
    },
  });

  const errors: string[] = [];

  for (const model of GEMINI_MODELS) {
    const geminiResponse = await fetch(`${getGeminiApiUrl(model)}?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: requestBody,
    });

    if (!geminiResponse.ok) {
      const errorBody = await geminiResponse.text();
      if (geminiResponse.status === 429 || errorBody.includes("RESOURCE_EXHAUSTED")) {
        throw new Error(
          "Gemini API quota exceeded. Check billing/usage limits in Google AI Studio and try again.",
        );
      }
      errors.push(`${model}: ${errorBody}`);
      continue;
    }

    const raw = (await geminiResponse.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const text = raw.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      errors.push(`${model}: Gemini response did not include text.`);
      continue;
    }

    try {
      const parsed = JSON.parse(extractJsonBlock(text)) as GeminiSearchSuggestionsJson;
      const list = Array.isArray(parsed.suggestions)
        ? parsed.suggestions
            .filter((entry): entry is string => typeof entry === "string")
            .map((s) => s.trim().replace(/^#/, ""))
            .filter(Boolean)
        : [];

      const unique = [...new Set(list)].slice(0, 5);
      const fillers = pickFallbackProjectSearchQueries(name, goalLine);
      for (const word of fillers) {
        if (!unique.includes(word) && unique.length < 5) {
          unique.push(word);
        }
      }

      if (unique.length > 0) {
        return unique.slice(0, 5);
      }

      errors.push(`${model}: suggestions missing or empty.`);
    } catch {
      errors.push(`${model}: Failed to parse suggestions JSON.`);
    }
  }

  throw new Error(`Gemini search-suggestions request failed for all models. ${errors.join(" | ")}`);
}

export type ProjectExploreTextCategory = "keyword" | "movement" | "style" | "artist";

export type ProjectExploreTextEntry = {
  label: string;
  category: ProjectExploreTextCategory;
};

type GeminiProjectExploreTextsJson = {
  subjects?: string[];
  designKeywords?: string[];
  movements?: string[];
  artists?: string[];
  styles?: string[];
};

const FALLBACK_PROJECT_MOVEMENTS = [
  "바우하우스",
  "스위스 스타일",
  "미니멀리즘",
  "팝아트",
  "브루탈리즘",
];

const FALLBACK_PROJECT_STYLES = ["플랫 일러스트", "라인 드로잉", "필름 그레인", "모노톤"];

const FALLBACK_PROJECT_ARTISTS = [
  "디터 람스",
  "마스 림만",
  "폴 랜드",
  "야솔로 굴딘",
  "레너트 체르니",
  "무라카미 다카시",
];

function normalizeExploreLabels(
  value: unknown,
  category: ProjectExploreTextCategory,
  limit: number,
): ProjectExploreTextEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const result: ProjectExploreTextEntry[] = [];

  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }
    const label = entry.trim().replace(/^#/, "");
    const key = label.toLowerCase();
    if (!label || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({ label, category });
    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

function dedupeExploreEntries(entries: ProjectExploreTextEntry[]): ProjectExploreTextEntry[] {
  const seen = new Set<string>();
  const result: ProjectExploreTextEntry[] = [];

  for (const entry of entries) {
    const key = entry.label.trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({ label: entry.label.trim(), category: entry.category });
  }

  return result;
}

function parseProjectExploreTextsJson(
  parsed: GeminiProjectExploreTextsJson,
): ProjectExploreTextEntry[] {
  return dedupeExploreEntries([
    ...normalizeExploreLabels(parsed.subjects, "keyword", 6),
    ...normalizeExploreLabels(parsed.designKeywords, "keyword", 8),
    ...normalizeExploreLabels(parsed.movements, "movement", 5),
    ...normalizeExploreLabels(parsed.artists, "artist", 5),
    ...normalizeExploreLabels(parsed.styles, "style", 4),
  ]);
}

/** 프로젝트 이름·목표 문장에서 레퍼런스 탐색용 키워드 추출. */
export function pickFallbackProjectKeywords(projectName: string, goal: string): string[] {
  const combined = `${projectName} ${goal}`.trim();
  const tokens = [...new Set(combined.split(/\s+/).filter((w) => w.length >= 2))];
  return [...new Set([...tokens, projectName.trim(), goal.trim()].filter(Boolean))].slice(0, 10);
}

/** API 키 없음·오류 시 프로젝트 탐색 텍스트 카드용 폴백 */
export function pickFallbackProjectExploreTexts(
  projectName: string,
  goal: string,
): ProjectExploreTextEntry[] {
  const keywords = pickFallbackProjectKeywords(projectName, goal)
    .filter((label) => {
      const key = label.trim().toLowerCase();
      const name = projectName.trim().toLowerCase();
      const goalLine = goal.trim().toLowerCase();
      return key !== name && key !== goalLine;
    })
    .map((label) => ({
      label,
      category: "keyword" as const,
    }));

  return dedupeExploreEntries([
    ...keywords,
    ...FALLBACK_PROJECT_MOVEMENTS.map((label) => ({ label, category: "movement" as const })),
    ...FALLBACK_PROJECT_STYLES.map((label) => ({ label, category: "style" as const })),
    ...FALLBACK_PROJECT_ARTISTS.map((label) => ({ label, category: "artist" as const })),
  ]);
}

export async function analyzeProjectExploreTexts(
  projectName: string,
  goal: string,
  apiKey: string,
): Promise<ProjectExploreTextEntry[]> {
  const name = projectName.trim();
  const goalLine = goal.trim();

  if (!name || !goalLine) {
    return [];
  }

  const requestBody = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "디자인·비주얼 레퍼런스 수집 프로젝트의 맥락을 분석해 주세요.",
              `프로젝트 이름: ${name}`,
              `한 줄 목표: ${goalLine}`,
              "",
              "탐색 그리드에 넣을 연관 텍스트 카드를 다음 다섯 가지로 나눠 제안하세요.",
              "1. subjects: 프로젝트 주제·소재·대상·장소 키워드 4~6개 (스타일/무드가 아님. 예: 야시장, 한강, 캠페인)",
              "2. designKeywords: 디자인·구성·무드·색감 등 검색에 쓸 키워드 5~8개",
              "3. movements: 관련 예술 사조·디자인 운동 3~5개",
              "4. artists: 참고할 만한 예술가·디자이너 이름 3~5개 (실존 인물, 한국어 표기)",
              "5. styles: 화풍·비주얼 스타일 3~4개",
              "해시태그(#) 없이 짧은 한국어로 작성하세요.",
              "",
              '반드시 JSON 한 객체만: { "subjects": [], "designKeywords": [], "movements": [], "artists": [], "styles": [] }',
              "부가 설명 금지.",
            ].join("\n"),
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.35,
      responseMimeType: "application/json",
    },
  });

  const errors: string[] = [];

  for (const model of GEMINI_MODELS) {
    const geminiResponse = await fetch(`${getGeminiApiUrl(model)}?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: requestBody,
    });

    if (!geminiResponse.ok) {
      const errorBody = await geminiResponse.text();
      if (geminiResponse.status === 429 || errorBody.includes("RESOURCE_EXHAUSTED")) {
        throw new Error(
          "Gemini API quota exceeded. Check billing/usage limits in Google AI Studio and try again.",
        );
      }
      errors.push(`${model}: ${errorBody}`);
      continue;
    }

    const raw = (await geminiResponse.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const text = raw.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      errors.push(`${model}: Gemini response did not include text.`);
      continue;
    }

    try {
      const parsed = JSON.parse(extractJsonBlock(text)) as GeminiProjectExploreTextsJson;
      const list = parseProjectExploreTextsJson(parsed);
      const fillers = pickFallbackProjectExploreTexts(name, goalLine);

      if (list.length > 0) {
        return dedupeExploreEntries([...list, ...fillers]).slice(0, 24);
      }

      errors.push(`${model}: explore texts missing or empty.`);
    } catch {
      errors.push(`${model}: Failed to parse explore texts JSON.`);
    }
  }

  throw new Error(`Gemini project-explore-texts request failed for all models. ${errors.join(" | ")}`);
}

export async function analyzeProjectKeywords(
  projectName: string,
  goal: string,
  apiKey: string,
): Promise<string[]> {
  const entries = await analyzeProjectExploreTexts(projectName, goal, apiKey);
  return entries.map((entry) => entry.label);
}

type GeminiExploreTextDetailJson = {
  definition?: string;
  function?: string;
  antonyms?: string[];
};

const FALLBACK_ANTONYM_POOL = [
  "미래주의",
  "모던",
  "하이테크",
  "미니멀리즘",
  "디지털",
  "클래식",
  "내추럴",
];

const EXPLORE_TEXT_CATEGORY_KO: Record<string, string> = {
  keyword: "디자인 키워드",
  movement: "예술 사조",
  style: "화풍",
  artist: "예술가",
};

export function pickFallbackAntonyms(label: string, count = 3): string[] {
  const normalized = label.trim().toLowerCase();
  return FALLBACK_ANTONYM_POOL.filter((term) => term.toLowerCase() !== normalized).slice(0, count);
}

export function pickFallbackExploreTextDetail(
  label: string,
  category?: string,
): { definition: string; function: string; antonyms: string[] } {
  const trimmed = label.trim();
  const categoryKo = category ? (EXPLORE_TEXT_CATEGORY_KO[category] ?? "디자인 개념") : "디자인 개념";

  return {
    definition: `${trimmed}은(는) ${categoryKo} 영역에서 시각·구성 언어를 설명할 때 쓰이는 개념입니다.`,
    function: `${trimmed}을(를) 기준으로 레퍼런스 무드와 방향을 맞추고, 관련 이미지·키워드를 탐색할 때 활용합니다.`,
    antonyms: pickFallbackAntonyms(trimmed),
  };
}

function normalizeAntonyms(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    return pickFallbackAntonyms(label);
  }

  const seen = new Set<string>();
  const items: string[] = [];

  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim().replace(/^#/, "");
    if (!trimmed || trimmed.toLowerCase() === label.trim().toLowerCase()) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push(trimmed);
    if (items.length >= 3) {
      break;
    }
  }

  return items.length > 0 ? items : pickFallbackAntonyms(label);
}

/** 탐색 텍스트 카드용 정의·기능 설명 생성 */
export async function explainExploreTextTerm(
  label: string,
  apiKey: string,
  category?: string,
): Promise<{ definition: string; function: string; antonyms: string[] }> {
  const trimmed = label.trim();
  if (!trimmed) {
    return { definition: "", function: "", antonyms: [] };
  }

  const categoryKo = category ? (EXPLORE_TEXT_CATEGORY_KO[category] ?? category) : "디자인·시각";

  const requestBody = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "당신은 디자인·예술 레퍼런스 큐레이션 도우미입니다.",
              `용어: ${trimmed}`,
              `분류: ${categoryKo}`,
              "",
              "이 용어에 대해 한국어로 다음을 작성하세요.",
              "1. definition: 한두 문장으로 개념을 정의 (정의)",
              "2. function: 한두 문장으로 디자인·레퍼런스 작업에서의 쓰임·역할 (기능)",
              "3. antonyms: 대비·반대 성격의 연관 키워드 3개 (해시태그 기호 없이 단어만)",
              "",
              '반드시 JSON 한 객체만: { "definition": "...", "function": "...", "antonyms": ["...", "...", "..."] }',
              "부가 설명 금지.",
            ].join("\n"),
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.35,
      responseMimeType: "application/json",
    },
  });

  const errors: string[] = [];

  for (const model of GEMINI_MODELS) {
    const geminiResponse = await fetch(`${getGeminiApiUrl(model)}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
    });

    if (!geminiResponse.ok) {
      const errorBody = await geminiResponse.text();
      if (geminiResponse.status === 429 || errorBody.includes("RESOURCE_EXHAUSTED")) {
        throw new Error("Gemini API quota exceeded.");
      }
      errors.push(`${model}: ${errorBody}`);
      continue;
    }

    const raw = (await geminiResponse.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const text = raw.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      errors.push(`${model}: no text`);
      continue;
    }

    try {
      const parsed = JSON.parse(extractJsonBlock(text)) as GeminiExploreTextDetailJson;
      const definition = typeof parsed.definition === "string" ? parsed.definition.trim() : "";
      const fn = typeof parsed.function === "string" ? parsed.function.trim() : "";

      if (definition && fn) {
        return {
          definition,
          function: fn,
          antonyms: normalizeAntonyms(parsed.antonyms, trimmed),
        };
      }
      errors.push(`${model}: empty fields`);
    } catch {
      errors.push(`${model}: parse error`);
    }
  }

  throw new Error(`Gemini text-detail request failed. ${errors.join(" | ")}`);
}
