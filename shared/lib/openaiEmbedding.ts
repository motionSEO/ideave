import { getServerEnv } from "@/shared/lib/serverEnv";

export const TEXT_EMBEDDING_MODEL = "text-embedding-3-small";
export const TEXT_EMBEDDING_DIMENSIONS = 1536;

/** 태그와(선택) 분석 문구를 임베딩용 문서로 만듭니다. */
export function buildImageEmbeddingDocument(
  tags: string[],
  analysis?: { colorTone: string; mood: string; style: string },
): string {
  const tagLine = tags.map((t) => t.trim()).filter(Boolean).join(", ");
  const parts = [`이미지 태그 및 설명: ${tagLine}`];
  if (analysis) {
    parts.push(
      `색감: ${analysis.colorTone}. 분위기: ${analysis.mood}. 스타일: ${analysis.style}.`,
    );
  }
  return parts.join("\n");
}

export async function createTextEmbedding(input: string): Promise<number[]> {
  const key = getServerEnv("OPENAI_API_KEY");
  if (!key) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const body = input.trim();
  if (!body) {
    throw new Error("Embedding input is empty.");
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: TEXT_EMBEDDING_MODEL,
      input: body,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI embedding failed: ${errText}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };

  const vector = payload.data?.[0]?.embedding;
  if (!vector || vector.length !== TEXT_EMBEDDING_DIMENSIONS) {
    throw new Error("OpenAI returned an invalid embedding vector.");
  }

  return vector;
}
