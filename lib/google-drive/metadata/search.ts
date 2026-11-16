import type { DriveImageRecord } from "@/lib/google-drive/personalDb";
import { expandKoreanDesignQuery } from "@/lib/google-drive/metadata/koreanLexicon";
import type { DriveImageMetadataRecord } from "@/lib/google-drive/metadata/types";
import { filterPersonalDbImages } from "@/lib/google-drive/personalDb";

function metadataHaystack(record: DriveImageMetadataRecord | undefined): string {
  if (!record || record.status !== "ready") {
    return "";
  }
  return [
    record.category,
    record.fileName,
    record.description,
    ...record.style,
    ...record.mood,
    ...record.color,
    ...record.visualElements,
    ...record.designKeywords,
    ...record.subject,
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * 기존 category/fileName 검색을 유지하고, 분석이 끝난 이미지는 영어 태그·한국어 확장 용어도 매칭한다.
 */
export function filterDriveImagesWithMetadata(
  images: DriveImageRecord[],
  query: string,
  recordsById: Record<string, DriveImageMetadataRecord>,
): DriveImageRecord[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return images;
  }

  const baseline = new Set(filterPersonalDbImages(images, trimmed).map((image) => image.id));
  const expanded = expandKoreanDesignQuery(trimmed);

  return images.filter((image) => {
    if (baseline.has(image.id)) {
      return true;
    }
    const haystack = metadataHaystack(recordsById[image.id]);
    if (!haystack) {
      return false;
    }
    if (haystack.includes(trimmed.toLowerCase())) {
      return true;
    }
    const hayExpanded = expandKoreanDesignQuery(haystack).map((token) => token.toLowerCase());
    return expanded.some(
      (token) => haystack.includes(token.toLowerCase()) || hayExpanded.includes(token.toLowerCase()),
    );
  });
}
