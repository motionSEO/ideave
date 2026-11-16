export type ExploreTextDetailContent = {
  definition: string;
  function: string;
  antonyms: string[];
};

const GENERIC_DETAIL_PATTERNS = [
  /시각·구성 언어를 설명할 때 쓰이는 개념/,
  /레퍼런스 무드와 방향을 맞추고/,
  /관련 이미지·키워드를 탐색할 때 활용/,
  /디자인·레퍼런스 작업에서의 쓰임·역할/,
  /아이디어의 중심을 붙잡기 위해 선택하는 단어/,
  /이미지, 문장, 소재를 같은 방향으로 묶는 검색의 기준/,
  /시각·구성에서 .+의 특성을 설명할 때 쓰는 디자인 키워드/,
  /무드의 이미지·레이아웃·소재를 탐색하고/,
];

export function isGenericExploreTextDetail(
  _label: string,
  definition: string,
  functionText: string,
): boolean {
  const def = definition.trim();
  const fn = functionText.trim();
  if (!def || !fn) {
    return true;
  }
  if (GENERIC_DETAIL_PATTERNS.some((pattern) => pattern.test(def) || pattern.test(fn))) {
    return true;
  }
  return def === fn;
}

export function hasExploreTextDetailContent(detail: ExploreTextDetailContent): boolean {
  return Boolean(detail.definition.trim() && detail.function.trim());
}
