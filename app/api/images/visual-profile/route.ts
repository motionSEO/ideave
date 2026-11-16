import { isGeminiQuotaExceededError, resolveGeminiApiKey } from "@/shared/lib/gemini";
import { resolveAllowedImageTarget, UnsafeImageUrlError } from "@/shared/lib/safeImageFetch";
import { getVisualProfile } from "@/shared/lib/visualProfile";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/images/visual-profile  { imageUrl }
 *
 * 상세 화면에서 선택한 이미지의 색상·무드·그래픽 스타일 프로필을 돌려준다.
 * Gemini를 쓸 수 없으면 200 + profile:null 로 응답하고, 클라이언트는 픽셀 색상 분석만으로 추천한다.
 */
export async function POST(request: Request) {
  let body: { imageUrl?: unknown };
  try {
    body = (await request.json()) as { imageUrl?: unknown };
  } catch {
    return Response.json({ error: "JSON body is required." }, { status: 400 });
  }

  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  if (!imageUrl || !resolveAllowedImageTarget(imageUrl)) {
    return Response.json({ error: "imageUrl is missing or not an allowed image source." }, { status: 400 });
  }

  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    return Response.json({ profile: null, source: "none", reason: "missing_api_key" });
  }

  try {
    const profile = await getVisualProfile(imageUrl, apiKey);
    return Response.json({ profile, source: "gemini" });
  } catch (error) {
    const reason =
      error instanceof UnsafeImageUrlError
        ? "unsafe_url"
        : isGeminiQuotaExceededError(error)
          ? "quota"
          : "error";
    if (reason === "error") {
      console.warn("[IDEAVE] visual profile failed", error instanceof Error ? error.message : error);
    }
    return Response.json({ profile: null, source: "none", reason });
  }
}
