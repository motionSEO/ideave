import { computeFileSha256Hex } from "@/shared/lib/fileHash";
import {
  analyzeImageWithGemini,
  buildGeminiQuotaFallback,
  isGeminiQuotaExceededError,
  resolveGeminiApiKey,
} from "@/shared/lib/gemini";
import { buildImageEmbeddingDocument, createTextEmbedding } from "@/shared/lib/openaiEmbedding";
import { getServerEnv } from "@/shared/lib/serverEnv";

export const runtime = "nodejs";

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * 업로드는 서버에서만 Supabase에 쓴다. service-role 키가 있으면 그것을 써서
 * anon 공개 쓰기 정책(supabase/harden-public-write.sql)을 제거해도 동작하게 한다.
 */
function getSupabaseEnv() {
  const url = getServerEnv("SUPABASE_URL");
  const accessKey = getServerEnv("SUPABASE_SERVICE_ROLE_KEY") ?? getServerEnv("SUPABASE_ANON_KEY");
  const bucket = getServerEnv("SUPABASE_STORAGE_BUCKET") ?? "images";

  if (!url || !accessKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) must be configured.");
  }

  return { url, accessKey, bucket };
}

async function imageExistsWithHash(
  supabase: ReturnType<typeof getSupabaseEnv>,
  fileHash: string,
): Promise<boolean> {
  const response = await fetch(
    `${supabase.url}/rest/v1/images?file_hash=eq.${encodeURIComponent(fileHash)}&select=id&limit=1`,
    {
      headers: {
        Authorization: `Bearer ${supabase.accessKey}`,
        apikey: supabase.accessKey,
      },
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Failed to check duplicate image hash. ${details}`);
  }

  const rows = (await response.json()) as Array<{ id: string }>;
  return rows.length > 0;
}

export async function POST(request: Request) {
  const geminiApiKey = resolveGeminiApiKey();
  if (!geminiApiKey) {
    console.error("[upload] Gemini key missing at runtime.");
    return Response.json(
      {
        error:
          "Gemini API key is not configured. Set GOOGLE_API_KEY (or GEMINI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY), then restart dev server.",
      },
      { status: 500 }
    );
  }

  let supabase: ReturnType<typeof getSupabaseEnv>;
  try {
    supabase = getSupabaseEnv();
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Supabase configuration is invalid." },
      { status: 500 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "file is required" }, { status: 400 });
  }

  // SVG 등 스크립트를 담을 수 있는 형식은 공개 버킷에 올리지 않는다.
  const ext = EXTENSION_BY_MIME[file.type.toLowerCase()];
  if (!ext) {
    return Response.json({ error: "only image files are supported." }, { status: 400 });
  }

  const maxBytes = 10 * 1024 * 1024;
  if (file.size > maxBytes) {
    return Response.json({ error: "image size must be 10MB or less." }, { status: 400 });
  }

  const fileBuffer = await file.arrayBuffer();
  const fileHash = computeFileSha256Hex(fileBuffer);

  try {
    if (await imageExistsWithHash(supabase, fileHash)) {
      return Response.json({ error: "이미 등록된 이미지입니다" }, { status: 409 });
    }

    let geminiUnavailableReason: string | null = null;
    let analysisResult;

    try {
      analysisResult = await analyzeImageWithGemini(file, geminiApiKey);
    } catch (geminiError) {
      if (isGeminiQuotaExceededError(geminiError)) {
        geminiUnavailableReason =
          geminiError instanceof Error ? geminiError.message : "Gemini quota exceeded.";
        analysisResult = buildGeminiQuotaFallback();
      } else if (
        geminiError instanceof Error &&
        geminiError.message.includes("Gemini API request failed for all models.")
      ) {
        const message = geminiError.message;
        if (message.includes("RESOURCE_EXHAUSTED") || message.includes('"code": 429')) {
          analysisResult = buildGeminiQuotaFallback();
          geminiUnavailableReason = "Gemini API quota exhausted for available models.";
        } else {
          throw geminiError;
        }
      } else {
        throw geminiError;
      }
    }

    const objectPath = `${crypto.randomUUID()}.${ext}`;

    const storageUploadResponse = await fetch(
      `${supabase.url}/storage/v1/object/${supabase.bucket}/${objectPath}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabase.accessKey}`,
          apikey: supabase.accessKey,
          "Content-Type": file.type,
          "x-upsert": "false",
        },
        body: fileBuffer,
      }
    );

    if (!storageUploadResponse.ok) {
      const details = await storageUploadResponse.text();
      return Response.json(
        { error: "Failed to upload image to Supabase Storage.", details },
        { status: 502 }
      );
    }

    const imageUrl = `${supabase.url}/storage/v1/object/public/${supabase.bucket}/${objectPath}`;

    let embedding: number[] | null = null;
    try {
      const embedText = buildImageEmbeddingDocument(
        analysisResult.tags,
        analysisResult.analysis,
      );
      embedding = await createTextEmbedding(embedText);
    } catch (embedError) {
      console.error("[upload] OpenAI embedding skipped:", embedError);
    }

    const insertPayload: Record<string, unknown> = {
      image_url: imageUrl,
      tags: analysisResult.tags,
      file_hash: fileHash,
    };
    if (embedding) {
      insertPayload.embedding = embedding;
    }

    const insertResponse = await fetch(`${supabase.url}/rest/v1/images`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabase.accessKey}`,
        apikey: supabase.accessKey,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(insertPayload),
    });

    if (!insertResponse.ok) {
      const details = await insertResponse.text();
      const isDuplicateHash =
        details.includes("images_file_hash_unique") ||
        details.includes("duplicate key") ||
        details.includes("23505");

      if (isDuplicateHash) {
        await fetch(`${supabase.url}/storage/v1/object/${supabase.bucket}/${objectPath}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${supabase.accessKey}`,
            apikey: supabase.accessKey,
          },
        });
        return Response.json({ error: "이미 등록된 이미지입니다" }, { status: 409 });
      }

      return Response.json(
        { error: "Failed to insert image row to Supabase DB.", details },
        { status: 502 }
      );
    }

    const insertedRows = (await insertResponse.json()) as Array<{
      id: string;
      image_url: string;
      tags: string[];
      created_at?: string;
    }>;
    const inserted = insertedRows[0];

    return Response.json({
      image: {
        id: inserted?.id,
        imageUrl: inserted?.image_url ?? imageUrl,
        tags: inserted?.tags ?? analysisResult.tags,
        createdAt: inserted?.created_at ?? null,
      },
      analysis: analysisResult.analysis,
      ...(geminiUnavailableReason
        ? {
            geminiUnavailable: true,
            warning:
              "Gemini 분석을 건너뜁니다(API 쿼터 또는 한도 문제). 이미지는 저장했고 기본 태그만 들어갑니다.",
            geminiUnavailableReason,
          }
        : {}),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "unknown error";

    return Response.json(
      {
        error: "Upload pipeline failed.",
        details,
      },
      { status: 500 }
    );
  }
}
