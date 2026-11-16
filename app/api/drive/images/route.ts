import type { NextRequest } from "next/server";
import {
  filterPersonalDbImages,
  flattenPersonalDbImages,
} from "@/lib/google-drive/personalDb";
import { preferKoreanDesignLabel } from "@/lib/google-drive/metadata/koreanLexicon";
import { filterDriveImagesWithMetadata } from "@/lib/google-drive/metadata/search";
import { loadDriveMetadataStore } from "@/lib/google-drive/metadata/store";
import { driveFilePublicPath, getCachedPersonalDbSnapshot } from "@/lib/google-drive/serverCache";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const snapshot = await getCachedPersonalDbSnapshot();
    const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const allImages = flattenPersonalDbImages(snapshot);
    const metadataStore = await loadDriveMetadataStore();
    const images = (
      query
        ? filterDriveImagesWithMetadata(allImages, query, metadataStore.images)
        : filterPersonalDbImages(allImages, query)
    ).map((image) => {
      const meta = metadataStore.images[image.id];
      const ready = meta?.status === "ready";
      // color·mood는 영어로 저장돼 있어 카드에 그대로 보이므로 한글 표기로 바꾼다(매칭은 사전 확장으로 영어도 유지).
      // 한글 태그("기하학적 패턴")는 사전에 넣으면 "기하학"처럼 줄어들므로 영어 태그만 바꾼다.
      const toLabels = (values: string[]) =>
        values
          .map((tag) => (/[가-힣]/.test(tag) ? tag.trim() : preferKoreanDesignLabel(tag.trim())))
          .filter(Boolean);
      // 필드별·순서 그대로(앞쪽일수록 그 이미지를 잘 대표: 색은 주된 색부터). 텍스트 카드의 엮인 이미지 점수에 쓴다.
      const vision = ready
        ? {
            designKeywords: toLabels(meta.designKeywords),
            style: toLabels(meta.style),
            visualElements: toLabels(meta.visualElements),
            mood: toLabels(meta.mood),
            color: toLabels(meta.color),
            subject: toLabels(meta.subject),
          }
        : undefined;
      // 상세의 관련 키워드·카드 해시태그는 앞쪽 태그를 쓰므로 구체적인 디자인어를 먼저 둔다.
      const visualTags = vision
        ? [...vision.designKeywords, ...vision.style, ...vision.visualElements, ...vision.mood, ...vision.color]
        : [];
      const uniqueTags = [...new Set(visualTags)];
      return {
        id: image.id,
        source: "google-drive" as const,
        fileName: image.name,
        category: image.category,
        mimeType: image.mimeType,
        imageUrl: driveFilePublicPath(image.id),
        tags: uniqueTags,
        vision,
        description: ready ? meta.description : undefined,
        ...(image.width ? { width: image.width } : {}),
        ...(image.height ? { height: image.height } : {}),
      };
    });

    return Response.json({
      rootFolderName: snapshot.rootFolderName,
      categories: snapshot.categories.map((category) => ({
        name: category.name,
        count: category.images.length,
      })),
      images,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Drive 목록을 불러오지 못했습니다.";
    return Response.json({ error: message, images: [] }, { status: 500 });
  }
}
