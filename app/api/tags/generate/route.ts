export const runtime = "nodejs";
import { analyzeImageWithGemini, resolveGeminiApiKey } from "@/shared/lib/gemini";

export async function POST(request: Request) {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    return Response.json(
      {
        error:
          "Gemini API key is not configured. Set GOOGLE_API_KEY (or GEMINI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY), then restart dev server.",
      },
      { status: 500 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("image");

  if (!(file instanceof File)) {
    return Response.json({ error: "image file is required." }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "only image files are supported." }, { status: 400 });
  }

  const maxBytes = 10 * 1024 * 1024;
  if (file.size > maxBytes) {
    return Response.json({ error: "image size must be 10MB or less." }, { status: 400 });
  }

  try {
    const result = await analyzeImageWithGemini(file, apiKey);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        error: "Failed to generate tags with Gemini.",
        details: error instanceof Error ? error.message : "unknown parse error",
      },
      { status: 502 }
    );
  }
}
