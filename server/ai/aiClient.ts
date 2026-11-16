export type GenerateTagsInput = {
  imageId: string;
};

export async function generateTags(_input: GenerateTagsInput): Promise<string[]> {
  // TODO: Wire OpenAI/Gemini provider implementation.
  return ["minimal", "editorial", "mobile-ui"];
}

export async function extractBoardKeywords(texts: string[]): Promise<string[]> {
  // TODO: Replace with model call once provider keys are configured.
  const words = texts.join(" ").split(" ").filter(Boolean);
  return Array.from(new Set(words)).slice(0, 5);
}
