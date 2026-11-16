export const DRIVE_METADATA_STORE_VERSION = 1;

export type DriveImageAnalysisStatus = "pending" | "ready" | "stale";

/** AI Vision이 채우는 분석 필드. 파일명에서 추측하지 않는다. */
export type DriveImageVisionFields = {
  style: string[];
  mood: string[];
  color: string[];
  visualElements: string[];
  designKeywords: string[];
  subject: string[];
  description: string;
};

export type DriveImageMetadataRecord = DriveImageVisionFields & {
  fileId: string;
  fileName: string;
  category: string;
  analyzedAt: string | null;
  status: DriveImageAnalysisStatus;
  /** Drive md5Checksum 또는 modifiedTime. 바뀌면 stale */
  contentFingerprint: string | null;
};

export type DriveImageMetadataStore = {
  version: number;
  updatedAt: string | null;
  images: Record<string, DriveImageMetadataRecord>;
};

export function emptyVisionFields(): DriveImageVisionFields {
  return {
    style: [],
    mood: [],
    color: [],
    visualElements: [],
    designKeywords: [],
    subject: [],
    description: "",
  };
}

export function createPendingMetadataRecord(input: {
  fileId: string;
  fileName: string;
  category: string;
  contentFingerprint: string | null;
}): DriveImageMetadataRecord {
  return {
    fileId: input.fileId,
    fileName: input.fileName,
    category: input.category,
    ...emptyVisionFields(),
    analyzedAt: null,
    status: "pending",
    contentFingerprint: input.contentFingerprint,
  };
}
