export type ReferenceItem = {
  id: string;
  type: "image" | "text";
  ratio: string;
  shade?: string;
  /** 업로드·Supabase 원본 이미지 URL */
  imageUrl?: string;
  tags?: string[];
  /** 탐색 그리드 텍스트 카드 문구 */
  textLabel?: string;
  /** 탐색 텍스트 카드 분류 */
  textCategory?: "keyword" | "movement" | "style" | "artist";
  /** 벡터 검색 시 코사인 유사도 0~1 (메인 표시용) */
  similarity?: number;
  /** 이미지 출처. 없으면 레거시/목업 항목 */
  source?: "upload" | "unsplash" | "ai" | "google-drive";
  width?: number;
  height?: number;
  photographerName?: string;
  photographerUrl?: string;
  unsplashUrl?: string;
  altDescription?: string;
  description?: string;
  searchQuery?: string;
  /** Drive 비전 분석 필드(필드별, 대표성 높은 순). 텍스트 카드의 엮인 이미지 점수에 쓴다. */
  vision?: ReferenceVisionFields;
};

export type ReferenceVisionFields = {
  designKeywords: string[];
  style: string[];
  visualElements: string[];
  mood: string[];
  color: string[];
  subject: string[];
};

export const TAGS = [
  "여백",
  "질감",
  "정적",
  "구조",
  "레이아웃",
  "형태",
  "색감",
  "패턴",
  "키워드",
  "정의",
  "연상",
  "리듬",
  "공간",
];

export const REFERENCES: ReferenceItem[] = [
  { id: "img-01", type: "image", ratio: "4 / 5", shade: "#d3d3d0" },
  { id: "txt-01", type: "text", ratio: "1 / 1" },
  { id: "img-02", type: "image", ratio: "16 / 10", shade: "#dededb" },
  { id: "img-03", type: "image", ratio: "3 / 4", shade: "#c1c1bd" },
  { id: "txt-02", type: "text", ratio: "4 / 3" },
  { id: "img-04", type: "image", ratio: "1 / 1", shade: "#d3d3d0" },
  { id: "img-05", type: "image", ratio: "2 / 3", shade: "#c9c9c6" },
  { id: "txt-03", type: "text", ratio: "5 / 4" },
  { id: "img-06", type: "image", ratio: "5 / 4", shade: "#c1c1bd" },
  { id: "img-07", type: "image", ratio: "3 / 5", shade: "#d8d8d5" },
  { id: "txt-04", type: "text", ratio: "3 / 4" },
  { id: "img-08", type: "image", ratio: "4 / 3", shade: "#c9c9c6" },
];

export const ALGORITHM: ReferenceItem[] = [
  { id: "a-1", type: "image", ratio: "4 / 3", shade: "#d3d3d0" },
  { id: "a-2", type: "text", ratio: "4 / 3" },
  { id: "a-3", type: "image", ratio: "4 / 3", shade: "#dededb" },
  { id: "a-4", type: "image", ratio: "4 / 3", shade: "#c1c1bd" },
  { id: "a-5", type: "text", ratio: "4 / 3" },
  { id: "a-6", type: "image", ratio: "4 / 3", shade: "#d3d3d0" },
];
