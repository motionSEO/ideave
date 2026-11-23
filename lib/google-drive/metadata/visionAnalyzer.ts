import type { DriveImageVisionFields } from "@/lib/google-drive/metadata/types";
import { resolveGeminiApiKey } from "@/shared/lib/gemini";

export type DriveVisionAnalyzeInput = {
  fileId: string;
  fileName: string;
  category: string;
  mimeType: string;
  /** Drive 원본 바이트. 파일명으로 내용을 추측하지 말 것. */
  imageBytes: Buffer;
};

// shared/lib/gemini.ts 와 같은 모델. 이미지 1장 분석이라 Flash-Lite로 충분하다.
const VISION_MODEL = "gemini-2.5-flash-lite";
const VISION_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${VISION_MODEL}:generateContent`;

/**
 * 상세 화면 제목으로 쓰는 설명 문장 규칙. 번역투 대신 디자이너가 메모하듯 명사로 끝나는 짧은 구로 쓴다.
 * 설명 다시 쓰기 스크립트(scripts/rewrite-drive-descriptions.ts)도 같은 규칙을 쓴다.
 */
export const DESCRIPTION_STYLE_RULE = [
  "이 레퍼런스의 시각적 특징과 주제를 담은 한 줄(40자 안팎). 명사로 끝나는 구로 쓰세요(예: '초현실적 공간에 풍경과 오브제를 놓은 회화', '크롬 질감 3D 레터링의 Y2K 포스터').",
  "'~입니다', '~합니다', '~자아냅니다', '~돋보입니다', '~을 특징으로 하는', '~에 의해' 같은 서술형·번역투 표현은 쓰지 마세요. 마침표도 찍지 마세요.",
  "한국어로 옮기면 어색한 디자인 용어(예: halftone, chrome, Y2K, risograph, glitch, bokeh)는 영어 그대로 쓰세요.",
].join(" ");

// 관련 추천(referenceKeywords COLOR_FAMILIES / MOOD_FAMILIES)이 영어 기본어로 매칭하므로 color·mood는 영어로 받는다.
// style·designKeywords·visualElements는 화면에 해시태그로 보이므로 한국어 디자인 용어로 받는다.
const VISION_PROMPT = [
  "당신은 시각 디자인 레퍼런스 아카이브의 큐레이터입니다. 이미지만 보고 분석하세요. 파일명이나 폴더명으로 추측하지 마세요.",
  "다음 JSON 한 객체로만 응답하세요:",
  '{ "color": [], "mood": [], "style": [], "visualElements": [], "designKeywords": [], "subject": [], "description": "" }',
  "",
  "- color: 이미지의 주요 색과 톤 3~5개. 영어 소문자 한 단어. 예: red, pink, orange, yellow, gold, beige, blue, teal, green, purple, black, white, monochrome, muted, pastel, neon, vibrant, warm, cool",
  "- mood: 분위기 2~4개. 영어 소문자 한 단어. 예: calm, quiet, dark, moody, elegant, energetic, playful, bold, dramatic, bright, dynamic, retro, vintage, nostalgic, dreamy, surreal",
  "- style: 디자인 사조·스타일 2~4개. 한국어. 예: 브루탈리즘, 바우하우스, 스위스 스타일, 미니멀리즘, 아르누보, 팝아트, 인상주의, 초현실주의, Y2K, 레트로 퓨처리즘",
  "- visualElements: 눈에 띄는 시각 요소·기법 3~5개. 한국어. 예: 하프톤, 그레인, 그라디언트, 글라스모피즘, 크롬 메탈, 대담한 산세리프, 손글씨 레터링, 기하학 도형, 콜라주, 강한 명암 대비",
  "- designKeywords: 이 레퍼런스를 찾을 때 쓸 구체적인 디자인 검색어 4~6개. 한국어. 매체를 알 수 있으면 '타이포 포스터', '패션 에디토리얼', '유화 정물화', '앨범 커버', '건축 사진'처럼 매체를 붙여 쓰세요.",
  "- subject: 무엇이 그려져 있는지 1~3개. 한국어.",
  `- description: ${DESCRIPTION_STYLE_RULE}`,
  "",
  "금지: 질감, 색감, 구도, 포스터, 패션, 인물, 예술, 텍스처, 이미지, 디자인 같은 한 단어 카테고리는 단독으로 쓰지 마세요.",
].join("\n");

const LIST_LIMITS: Record<Exclude<keyof DriveImageVisionFields, "description">, number> = {
  color: 5,
  mood: 4,
  style: 4,
  visualElements: 5,
  designKeywords: 6,
  subject: 3,
};

const VAGUE_TAGS = new Set(["질감", "색감", "구도", "포스터", "패션", "인물", "예술", "텍스처", "이미지", "디자인"]);

export class VisionQuotaError extends Error {}

function normalizeList(value: unknown, limit: number, lowercase: boolean): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }
    const tag = (lowercase ? entry.toLowerCase() : entry).trim().replace(/^#/, "");
    if (!tag || VAGUE_TAGS.has(tag) || seen.has(tag)) {
      continue;
    }
    seen.add(tag);
    result.push(tag);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

function parseVisionFields(text: string): DriveImageVisionFields {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const parsed = JSON.parse((fenced?.[1] ?? text).trim()) as Record<string, unknown>;
  return {
    color: normalizeList(parsed.color, LIST_LIMITS.color, true),
    mood: normalizeList(parsed.mood, LIST_LIMITS.mood, true),
    style: normalizeList(parsed.style, LIST_LIMITS.style, false),
    visualElements: normalizeList(parsed.visualElements, LIST_LIMITS.visualElements, false),
    designKeywords: normalizeList(parsed.designKeywords, LIST_LIMITS.designKeywords, false),
    subject: normalizeList(parsed.subject, LIST_LIMITS.subject, false),
    description: typeof parsed.description === "string" ? parsed.description.trim() : "",
  };
}

/**
 * 이미지 바이트만 Gemini에 보내 DriveImageVisionFields를 만든다.
 * fileName/category는 프롬프트에 넣지 않는다(파일명이 "1.jpg의 사본" 같은 경우가 많고, 폴더 태그가 아니라 비전으로 판단하기로 함).
 */
export async function analyzeDriveImageWithVision(
  input: DriveVisionAnalyzeInput,
): Promise<DriveImageVisionFields> {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    throw new Error("Gemini API key is missing. Set GOOGLE_API_KEY in .env.local.");
  }

  const mimeType = /^image\//i.test(input.mimeType) ? input.mimeType : "image/jpeg";
  const response = await fetch(`${VISION_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: VISION_PROMPT },
            { inlineData: { mimeType, data: input.imageBytes.toString("base64") } },
          ],
        },
      ],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 429 || body.includes("RESOURCE_EXHAUSTED")) {
      throw new VisionQuotaError("Gemini API quota exceeded.");
    }
    throw new Error(`Gemini vision failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const raw = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = raw.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini vision response did not include text.");
  }

  const fields = parseVisionFields(text);
  if (fields.color.length === 0 && fields.designKeywords.length === 0) {
    throw new Error("Gemini vision returned no usable tags.");
  }
  return fields;
}
