/**
 * 한국어 검색어 ↔ 영어 태그·오탈자를 같은 묶음으로 연결한다.
 * Vision/Unsplash 태그는 영어인 경우가 많고, 사용자는 한글로 검색한다.
 */
const SYNONYM_GROUPS: string[][] = [
  [
    "타이포",
    "타이포그래피",
    "typography",
    "typographic",
    "typograph",
    "typo",
    "typho",
    "typhography",
    "lettering",
    "typeface",
    "typesetting",
    "bold typography",
  ],
  ["비주얼", "시각", "시각적", "시각디자인", "visual", "visuals", "visual design"],
  ["포스터", "poster", "posters", "poster design"],
  ["그래픽", "그래픽디자인", "graphic", "graphics", "graphic design"],
  ["미니멀", "미니멀리즘", "minimal", "minimalist", "minimalism"],
  ["브루탈", "브루탈리즘", "brutalist", "brutalism"],
  ["바우하우스", "bauhaus"],
  ["에디토리얼", "editorial", "editorial design"],
  ["브랜딩", "브랜드", "branding", "brand", "identity", "visual identity"],
  ["패키지", "패키징", "packaging", "package"],
  ["패션", "fashion"],
  ["질감", "텍스처", "texture", "textured", "tactile"],
  ["하프톤", "halftone"],
  ["기하", "기하학", "geometric", "geometry"],
  ["레이아웃", "layout"],
  ["일러스트", "일러스트레이션", "illustration", "illustrator"],
  ["추상", "abstract"],
  ["패턴", "pattern"],
  ["무드", "분위기", "mood", "moody"],
  ["레트로", "retro"],
  ["빈티지", "vintage"],
  ["파스텔", "pastel"],
  ["모노톤", "흑백", "monochrome", "monotone", "black and white"],
  ["네온", "neon"],
  ["고대비", "대비", "contrast", "high-contrast", "high contrast"],
  ["색감", "컬러", "색", "color", "colour", "colorful", "colourful"],
  ["구도", "구성", "composition"],
  ["여백", "네거티브스페이스", "negative space"],
  ["리듬", "rhythm"],
  ["실험적", "experimental"],
  ["장난", "유머", "플레이풀", "playful"],
  ["펑키", "펀키", "funky"],
  ["에너지", "활기", "energetic"],
  ["강렬", "비비드", "vivid"],
  ["차분", "고요", "calm", "quiet"],
  ["어두운", "dark"],
  ["밝은", "bright"],
  ["건축", "architecture"],
  ["자연", "nature"],
  ["제품", "product"],
  ["조각", "sculpture"],
  ["그림자", "shadow"],
  ["아이콘", "icon", "icons"],
  ["청년", "젊", "youth"],
  ["페스티벌", "뮤직페스티벌", "음악 축제", "festival", "music festival"],
  ["콜라주", "collage"],
  ["그리드", "grid"],
  ["그라데이션", "gradient"],
  ["그레인", "필름그레인", "grain", "film grain"],
  ["글리치", "glitch"],
  ["리소", "리소그래프", "risograph"],
  ["듀오톤", "duotone"],
  ["스위스", "swiss"],
  ["팝아트", "팝", "pop art", "pop"],
  ["키치", "kitsch"],
  ["따뜻한", "웜", "warm"],
  ["차가운", "쿨", "cool"],
  ["인쇄", "프린트", "print"],
  ["글라스모피즘", "글래스모피즘", "glassmorphism", "glass morphism"],
  ["컬러블로킹", "컬러 블로킹", "color blocking", "colour blocking"],
  ["개성있", "개성", "expressive", "distinctive"],
  // Drive Vision(color·mood)은 영어 기본어로 저장된다. 화면 표기·한글 검색용 묶음.
  ["빨강", "빨간색", "red"],
  ["분홍", "핑크", "pink"],
  ["주황", "오렌지", "orange"],
  ["노랑", "노란색", "옐로", "yellow"],
  ["골드", "금색", "gold"],
  ["베이지", "beige"],
  ["갈색", "브라운", "brown"],
  ["파랑", "파란색", "블루", "blue"],
  ["청록", "청록색", "teal", "cyan"],
  ["초록", "초록색", "그린", "green"],
  ["보라", "보라색", "퍼플", "purple"],
  ["검정", "검은색", "블랙", "black"],
  ["흰색", "화이트", "white"],
  ["회색", "그레이", "gray", "grey"],
  ["뮤트톤", "저채도", "muted"],
  ["몽환적", "드리미", "dreamy"],
  ["초현실", "초현실적", "surreal"],
  ["드라마틱", "극적인", "dramatic"],
  ["신비로운", "미스터리", "mysterious"],
  ["우아한", "엘레강스", "elegant"],
  ["대담한", "볼드", "bold"],
  ["노스탤지어", "nostalgic"],
  ["역동적", "다이내믹", "dynamic"],
  ["선명한", "비브런트", "vibrant"],
  ["은색", "실버", "silver"],
  ["깔끔한", "clean"],
  ["내추럴", "natural"],
  ["모던", "modern"],
  ["유기적", "organic"],
  ["평온한", "serene"],
  ["엉뚱한", "quirky"],
];

function uniqueLower(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value.trim());
  }
  return result;
}

function wordBoundaryPattern(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9가-힣])${escaped}(?:$|[^a-z0-9가-힣])`, "i");
}

// 짧은 영어 별칭("pop", "red")은 단어 경계로만, 나머지는 부분 문자열로 매칭한다.
// 태그 수천 개마다 RegExp를 새로 만들면 렌더가 수 초씩 멈춰서 별칭별 매처를 한 번만 만든다.
type AliasMatcher = (lowerText: string) => boolean;
const ALIAS_MATCHERS = new Map<string, AliasMatcher>();

function aliasMatcher(alias: string): AliasMatcher {
  const needle = alias.trim().toLowerCase();
  let matcher = ALIAS_MATCHERS.get(needle);
  if (!matcher) {
    if (!needle) {
      matcher = () => false;
    } else if (/^[a-z0-9]{1,4}$/i.test(needle)) {
      const pattern = wordBoundaryPattern(needle);
      matcher = (hay) => pattern.test(hay);
    } else {
      matcher = (hay) => hay.includes(needle);
    }
    ALIAS_MATCHERS.set(needle, matcher);
  }
  return matcher;
}

const SYNONYM_GROUP_MATCHERS = SYNONYM_GROUPS.map((group) => ({
  group,
  matchers: group.map(aliasMatcher),
}));

export function synonymGroupHitsText(group: readonly string[], text: string): boolean {
  const hay = text.toLowerCase();
  return Boolean(hay) && group.some((alias) => aliasMatcher(alias)(hay));
}

function matchedSynonymGroups(text: string): string[][] {
  const hay = text.trim().toLowerCase();
  if (!hay) {
    return [];
  }
  return SYNONYM_GROUP_MATCHERS.filter(({ matchers }) => matchers.some((match) => match(hay))).map(
    ({ group }) => group,
  );
}

const EXPAND_QUERY_CACHE = new Map<string, string[]>();
const EXPAND_QUERY_CACHE_LIMIT = 4000;

/** "타이포" / "typho" / "typography" → 같은 묶음의 한글·영어 검색어 */
export function expandKoreanDesignQuery(query: string): string[] {
  const raw = query.trim();
  if (!raw) {
    return [];
  }

  const cached = EXPAND_QUERY_CACHE.get(raw);
  if (cached) {
    return cached;
  }

  const expanded: string[] = [raw];
  if (raw.length <= 80) {
    for (const group of matchedSynonymGroups(raw)) {
      expanded.push(...group);
    }
  }

  for (const token of raw.toLowerCase().split(/[\s,/|+#-]+/).filter(Boolean)) {
    expanded.push(token);
    for (const group of matchedSynonymGroups(token)) {
      expanded.push(...group);
    }
  }

  const result = uniqueLower(expanded);
  if (EXPAND_QUERY_CACHE.size >= EXPAND_QUERY_CACHE_LIMIT) {
    EXPAND_QUERY_CACHE.clear();
  }
  EXPAND_QUERY_CACHE.set(raw, result);
  return result;
}

/** Unsplash 등 영어 API에 보낼 검색어. "타이포 포스터" → "typography poster" */
export function composeEnglishDesignQuery(query: string): string {
  const raw = query.trim();
  if (!raw) {
    return "";
  }

  const english: string[] = [];
  for (const group of matchedSynonymGroups(raw)) {
    const primary =
      group.find((term) => /^[a-z][a-z0-9 -]*$/i.test(term) && !term.includes(" ")) ??
      group.find((term) => /^[a-z]/i.test(term) && !/[가-힣]/.test(term));
    if (primary) {
      english.push(primary);
    }
  }

  if (english.length > 0) {
    return uniqueLower(english).slice(0, 4).join(" ");
  }

  if (!/[가-힣]/.test(raw)) {
    return raw
      .replace(/\btyphography\b/gi, "typography")
      .replace(/\btypho\b/gi, "typography");
  }

  return raw;
}

/**
 * term과 정확히 같은 별칭을 가진 동의어 묶음의 모든 표기. 부분 문자열로 넓게 잡는
 * expandKoreanDesignQuery와 달리 "컬러 블로킹" → "컬러" 묶음처럼 번지지 않아 개수 집계에 쓴다.
 */
// 별칭 → 같은 묶음의 모든 표기. 카탈로그 태그 수만 개에 쓰이므로 묶음 전체를 매번 훑지 않게 미리 만든다.
const EXACT_SYNONYMS: Map<string, string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const group of SYNONYM_GROUPS) {
    for (const alias of group) {
      const key = alias.toLowerCase();
      map.set(key, uniqueLower([...(map.get(key) ?? []), ...group]));
    }
  }
  return map;
})();

export function exactDesignSynonyms(term: string): string[] {
  return EXACT_SYNONYMS.get(term.trim().toLowerCase()) ?? [];
}

/** 검색 칩·카드에 쓸 한글 대표 표기. "typography" → "타이포그래피" */
export function preferKoreanDesignLabel(term: string): string {
  const raw = term.trim().replace(/^#/, "");
  if (!raw) {
    return "";
  }
  const groups = matchedSynonymGroups(raw);
  for (const group of groups) {
    const hangul = [...group]
      .filter((alias) => /[가-힣]/.test(alias) && alias.replace(/[^가-힣]/g, "").length >= 2)
      .sort((left, right) => right.length - left.length)[0];
    if (hangul) {
      return hangul;
    }
  }
  return raw;
}

export function designSearchTermsOverlap(left: string, right: string): boolean {
  const a = left.trim();
  const b = right.trim();
  if (!a || !b) {
    return false;
  }
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  if (aLower === bLower || aLower.includes(bLower) || bLower.includes(aLower)) {
    return true;
  }

  const aGroups = matchedSynonymGroups(a);
  if (aGroups.some((group) => synonymGroupHitsText(group, b))) {
    return true;
  }

  const aTerms = new Set(expandKoreanDesignQuery(a).map((term) => term.toLowerCase()));
  return expandKoreanDesignQuery(b).some((term) => aTerms.has(term.toLowerCase()));
}
