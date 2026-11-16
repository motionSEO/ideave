import type { DriveImageRecord } from "@/lib/google-drive/personalDb";
import {
  createPendingMetadataRecord,
  type DriveImageMetadataRecord,
  type DriveImageMetadataStore,
} from "@/lib/google-drive/metadata/types";

export type DriveMetadataSyncSummary = {
  totalDriveImages: number;
  added: number;
  reused: number;
  stale: number;
  removed: number;
  pending: number;
  ready: number;
};

export function contentFingerprintFor(image: DriveImageRecord): string | null {
  return image.md5Checksum ?? image.modifiedTime ?? null;
}

function isAnalyzed(record: DriveImageMetadataRecord): boolean {
  return record.status === "ready" && Boolean(record.analyzedAt);
}

/**
 * Drive 현재 목록과 저장된 분석을 fileId 기준으로 맞춘다.
 * - 새 fileId → pending 레코드 (Vision 호출 없음)
 * - fingerprint 변경 → stale, 분석 필드는 다음 Vision 실행까지 유지하지 않고 비움
 * - Drive에서 삭제된 fileId → 저장소에서 제거
 * - 파일명/category는 Drive 값을 항상 갱신
 */
export function syncMetadataStoreWithDrive(
  store: DriveImageMetadataStore,
  driveImages: DriveImageRecord[],
): { store: DriveImageMetadataStore; summary: DriveMetadataSyncSummary } {
  const nextImages: Record<string, DriveImageMetadataRecord> = {};
  let added = 0;
  let reused = 0;
  let stale = 0;

  for (const image of driveImages) {
    const fingerprint = contentFingerprintFor(image);
    const existing = store.images[image.id];

    if (!existing) {
      nextImages[image.id] = createPendingMetadataRecord({
        fileId: image.id,
        fileName: image.name,
        category: image.category,
        contentFingerprint: fingerprint,
      });
      added += 1;
      continue;
    }

    const fingerprintChanged =
      Boolean(existing.contentFingerprint) &&
      Boolean(fingerprint) &&
      existing.contentFingerprint !== fingerprint;

    if (fingerprintChanged) {
      nextImages[image.id] = createPendingMetadataRecord({
        fileId: image.id,
        fileName: image.name,
        category: image.category,
        contentFingerprint: fingerprint,
      });
      nextImages[image.id]!.status = "stale";
      stale += 1;
      continue;
    }

    nextImages[image.id] = {
      ...existing,
      fileId: image.id,
      fileName: image.name,
      category: image.category,
      contentFingerprint: fingerprint ?? existing.contentFingerprint,
      status: isAnalyzed(existing) ? "ready" : existing.status === "stale" ? "stale" : "pending",
    };
    reused += 1;
  }

  const removed = Object.keys(store.images).filter((fileId) => !nextImages[fileId]).length;
  const records = Object.values(nextImages);

  return {
    store: {
      version: store.version,
      updatedAt: store.updatedAt,
      images: nextImages,
    },
    summary: {
      totalDriveImages: driveImages.length,
      added,
      reused,
      stale,
      removed,
      pending: records.filter((record) => record.status === "pending" || record.status === "stale").length,
      ready: records.filter((record) => record.status === "ready").length,
    },
  };
}
