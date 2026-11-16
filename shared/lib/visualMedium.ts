/**
 * 시각물의 "분야(매체)" 분류. 서버(Gemini 프롬프트)와 클라이언트(후보 추론·점수)가 함께 쓴다.
 * 서버 전용 모듈을 import 하지 말 것.
 */

export type MediumFamily = "fine-art" | "graphic-design" | "photography" | "object" | "material" | "digital";

export type MediumId =
  | "oil-painting"
  | "watercolor"
  | "drawing"
  | "printmaking"
  | "poster"
  | "leaflet"
  | "typography"
  | "editorial"
  | "illustration"
  | "graphic-pattern"
  | "logo-icon"
  | "packaging"
  | "photography"
  | "fashion"
  | "architecture"
  | "product"
  | "sculpture"
  | "3d-render"
  | "texture"
  | "ui-digital";

export type MediumDef = {
  id: MediumId;
  family: MediumFamily;
  labelKo: string;
  labelEn: string;
  /** 후보 이미지의 태그·설명에서 분야를 추론할 때 쓰는 용어 (소문자 영어·한국어) */
  terms: string[];
  /** Google Drive 개인 DB 카테고리 폴더명(소문자) → 이 분야 */
  driveCategories?: string[];
};

export const MEDIUMS: MediumDef[] = [
  {
    id: "oil-painting",
    family: "fine-art",
    labelKo: "유화",
    labelEn: "oil painting",
    terms: ["oil painting", "painting", "canvas", "impressionism", "impressionist", "masterpiece", "fine art", "acrylic", "유화", "명화", "회화", "인상주의", "아크릴화"],
    driveCategories: ["art"],
  },
  {
    id: "watercolor",
    family: "fine-art",
    labelKo: "수채화",
    labelEn: "watercolor painting",
    terms: ["watercolor", "watercolour", "ink wash", "fluid art", "수채화", "수묵", "번짐"],
    driveCategories: ["waterart"],
  },
  {
    id: "drawing",
    family: "fine-art",
    labelKo: "드로잉",
    labelEn: "drawing sketch",
    terms: ["drawing", "sketch", "pencil", "charcoal", "line art", "드로잉", "스케치", "연필", "목탄"],
  },
  {
    id: "printmaking",
    family: "fine-art",
    labelKo: "판화",
    labelEn: "printmaking",
    terms: ["printmaking", "woodcut", "linocut", "screen print", "screenprint", "risograph", "etching", "판화", "실크스크린", "리소그래프"],
  },
  {
    id: "poster",
    family: "graphic-design",
    labelKo: "포스터",
    labelEn: "poster design",
    terms: ["poster", "placard", "gig poster", "movie poster", "포스터"],
  },
  {
    id: "leaflet",
    family: "graphic-design",
    labelKo: "리플렛·브로슈어",
    labelEn: "leaflet brochure design",
    terms: ["leaflet", "flyer", "brochure", "pamphlet", "folded leaflet", "리플렛", "리플릿", "전단", "전단지", "브로슈어", "팸플릿", "팜플렛"],
  },
  {
    id: "typography",
    family: "graphic-design",
    labelKo: "타이포그래피",
    labelEn: "typography design",
    terms: ["typography", "typographic", "lettering", "typeface", "font", "calligraphy", "타이포그래피", "타이포", "레터링", "캘리그래피"],
    driveCategories: ["typhography", "typography"],
  },
  {
    id: "editorial",
    family: "graphic-design",
    labelKo: "편집 디자인",
    labelEn: "editorial layout",
    terms: ["editorial", "magazine", "book cover", "layout", "spread", "publication", "편집", "매거진", "잡지", "북커버", "레이아웃"],
  },
  {
    id: "illustration",
    family: "graphic-design",
    labelKo: "일러스트레이션",
    labelEn: "illustration",
    terms: ["illustration", "illustrated", "vector art", "digital art", "cartoon", "character", "일러스트", "일러스트레이션", "캐릭터"],
  },
  {
    id: "graphic-pattern",
    family: "graphic-design",
    labelKo: "그래픽 아트워크",
    labelEn: "abstract graphic artwork",
    terms: ["graphic", "abstract", "pattern", "halftone", "geometric", "artwork", "collage", "그래픽", "추상", "패턴", "하프톤", "기하", "콜라주"],
    driveCategories: ["halftone", "visual"],
  },
  {
    id: "logo-icon",
    family: "graphic-design",
    labelKo: "로고·아이콘",
    labelEn: "logo icon design",
    terms: ["logo", "icon", "symbol", "emblem", "pictogram", "brand mark", "로고", "아이콘", "심볼", "픽토그램"],
    driveCategories: ["icon"],
  },
  {
    id: "packaging",
    family: "graphic-design",
    labelKo: "패키지 디자인",
    labelEn: "packaging design",
    terms: ["packaging", "package", "label design", "bottle", "box design", "패키지", "패키징", "라벨"],
  },
  {
    id: "photography",
    family: "photography",
    labelKo: "사진",
    labelEn: "photography",
    terms: ["photography", "photo", "photograph", "portrait", "landscape", "film photo", "shadow", "사진", "인물", "풍경", "그림자"],
    driveCategories: ["human", "nature", "shadow"],
  },
  {
    id: "fashion",
    family: "photography",
    labelKo: "패션",
    labelEn: "fashion photography",
    terms: ["fashion", "runway", "outfit", "lookbook", "editorial fashion", "패션", "룩북", "런웨이"],
    driveCategories: ["fashion"],
  },
  {
    id: "architecture",
    family: "photography",
    labelKo: "건축",
    labelEn: "architecture",
    terms: ["architecture", "building", "facade", "interior", "건축", "건물", "파사드", "인테리어"],
    driveCategories: ["architecture"],
  },
  {
    id: "product",
    family: "object",
    labelKo: "제품 디자인",
    labelEn: "product design",
    terms: ["product design", "industrial design", "furniture", "object design", "제품", "프로덕트", "가구", "산업디자인"],
    driveCategories: ["product"],
  },
  {
    id: "sculpture",
    family: "object",
    labelKo: "조형·조각",
    labelEn: "sculpture",
    terms: ["sculpture", "installation", "ceramic", "glass art", "statue", "조각", "조형", "설치미술", "도자"],
    driveCategories: ["sculpture"],
  },
  {
    id: "3d-render",
    family: "object",
    labelKo: "3D 그래픽",
    labelEn: "3d render",
    terms: ["3d", "3d render", "render", "cgi", "blender", "3d 그래픽", "렌더링"],
  },
  {
    id: "texture",
    family: "material",
    labelKo: "텍스처",
    labelEn: "texture",
    terms: ["texture", "surface", "material", "grain", "paper texture", "텍스처", "질감", "재질"],
    driveCategories: ["texture"],
  },
  {
    id: "ui-digital",
    family: "digital",
    labelKo: "UI·디지털",
    labelEn: "ui design",
    terms: ["ui", "ux", "web design", "app design", "interface", "website", "웹디자인", "앱디자인", "인터페이스"],
  },
];

const MEDIUM_BY_ID = new Map<MediumId, MediumDef>(MEDIUMS.map((medium) => [medium.id, medium]));

export function getMedium(id: string | null | undefined): MediumDef | null {
  return id ? (MEDIUM_BY_ID.get(id as MediumId) ?? null) : null;
}

export function isMediumId(value: unknown): value is MediumId {
  return typeof value === "string" && MEDIUM_BY_ID.has(value as MediumId);
}

/** Gemini 프롬프트에 넣는 분야 목록 */
export function mediumPromptList(): string {
  return MEDIUMS.map((medium) => `${medium.id} (${medium.labelEn})`).join(", ");
}

function containsTerm(haystack: string, term: string): boolean {
  if (/[가-힣]/.test(term)) {
    return haystack.includes(term);
  }
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(haystack);
}

export type MediumGuess = { id: MediumId; confidence: number };

/** 여러 분야에 두루 쓰이는 넓은 용어는 가중치를 낮춰, "watercolor painting" 이 유화로 잡히지 않게 한다. */
const GENERIC_MEDIUM_TERMS = new Set(["painting", "graphic", "photo", "abstract", "artwork", "art", "design", "그래픽", "추상"]);

/**
 * 후보 이미지의 분야 추론.
 * - Drive: 사용자가 분야별로 나눈 카테고리 폴더(searchQuery) 기준
 * - 그 외: 태그·설명(강) + 검색 쿼리(약)의 분야 용어
 */
export function inferMedium(input: {
  source?: string;
  category?: string;
  tags?: string[];
  description?: string;
  altDescription?: string;
  searchQuery?: string;
}): MediumGuess | null {
  if (input.source === "google-drive" && input.category) {
    const category = input.category.trim().toLowerCase();
    const fromFolder = MEDIUMS.find((medium) => medium.driveCategories?.includes(category));
    if (fromFolder) {
      return { id: fromFolder.id, confidence: 0.8 };
    }
  }

  const strong = [input.altDescription, input.description, ...(input.tags ?? [])]
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .join(" ")
    .toLowerCase();
  const weak = input.source === "google-drive" ? "" : (input.searchQuery ?? "").toLowerCase();

  let best: MediumGuess | null = null;
  for (const medium of MEDIUMS) {
    let score = 0;
    for (const term of medium.terms) {
      const scale = GENERIC_MEDIUM_TERMS.has(term) ? 0.25 : 1;
      if (strong && containsTerm(strong, term)) {
        score += (term.includes(" ") ? 3 : 2) * scale;
      } else if (weak && containsTerm(weak, term)) {
        score += scale;
      }
    }
    if (score > 0 && (!best || score > best.confidence)) {
      best = { id: medium.id, confidence: score };
    }
  }
  if (!best) {
    return null;
  }
  return { id: best.id, confidence: Math.min(0.75, 0.25 + best.confidence * 0.1) };
}

/**
 * 프로젝트 주제에 명시된 작업 형식(만들 결과물) 추출. 예: "전시 포스터" → poster, "명화 패러디" → oil-painting.
 * - "그래픽", "디자인" 같은 넓은 단어는 형식으로 보지 않는다.
 * - 여러 형식이 보이면 한국어 명사구 특성상 가장 뒤에 나온 것이 만들 결과물이다 ("사진전 리플렛" → leaflet).
 */
export function detectExplicitMedium(text: string): MediumId | null {
  const haystack = text.trim().toLowerCase();
  if (!haystack) {
    return null;
  }
  let best: { id: MediumId; end: number; length: number } | null = null;
  for (const medium of MEDIUMS) {
    for (const term of medium.terms) {
      if (GENERIC_MEDIUM_TERMS.has(term)) {
        continue;
      }
      const lowerTerm = term.toLowerCase();
      if (!containsTerm(haystack, lowerTerm)) {
        continue;
      }
      const end = haystack.lastIndexOf(lowerTerm) + lowerTerm.length;
      if (!best || end > best.end || (end === best.end && lowerTerm.length > best.length)) {
        best = { id: medium.id, end, length: lowerTerm.length };
      }
    }
  }
  return best?.id ?? null;
}

/**
 * 0~1. 같은 분야 1, 같은 계열(예: 유화↔수채화, 포스터↔타이포) 0.55,
 * 후보 분야를 모르면 0.3, 다른 분야 0.
 */
export function mediumMatchScore(selected: MediumId, candidate: MediumGuess | null): number {
  if (!candidate) {
    return 0.3;
  }
  if (candidate.id === selected) {
    return 1;
  }
  const left = getMedium(selected);
  const right = getMedium(candidate.id);
  if (left && right && left.family === right.family) {
    return 0.55;
  }
  return 0;
}
