"use client";

import {
  EXPLORE_DETAIL_BODY_CLASS,
  EXPLORE_DETAIL_GROUP_CLASS,
  EXPLORE_DETAIL_HEADER_CLASS,
  EXPLORE_DETAIL_MAIN_ROW_CLASS,
  EXPLORE_DETAIL_OUTLINE_CARD_CLASS,
  EXPLORE_DETAIL_ROOT_CLASS,
  EXPLORE_DETAIL_ROW_CLASS,
  EXPLORE_DETAIL_SAVE_BUTTON_CLASS,
  EXPLORE_DETAIL_TITLE_CLASS,
} from "@/components/reference-prototype/exploreDetailShared";

const TEXT_DETAIL_DEFINITION_BLOCK_CLASS =
  "flex flex-col self-stretch items-start justify-center px-5 py-0";
const TEXT_DETAIL_ANTONYMS_BLOCK_CLASS =
  "flex w-full max-w-[1288px] flex-col items-start gap-2 self-stretch px-10 py-0";

type TextDetailPanelProps = {
  title: string;
  definition: string;
  functionText: string;
  antonyms: string[];
  relatedKeywords?: string[];
  loading: boolean;
  onSaveToCanvas: () => void;
  onAntonymClick: (keyword: string) => void;
};

function DetailRow({ label, children }: { label: string; children: string }) {
  return (
    <div className={EXPLORE_DETAIL_ROW_CLASS}>
      <p className={`shrink-0 ${EXPLORE_DETAIL_BODY_CLASS}`}>{label}</p>
      <p className={`min-w-0 flex-1 ${EXPLORE_DETAIL_BODY_CLASS}`}>{children}</p>
    </div>
  );
}

function AntonymIcon() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/antonym-icon.png"
      alt=""
      width={16}
      height={16}
      className="h-4 w-4 shrink-0 object-contain"
      aria-hidden
    />
  );
}

export function TextDetailPanel({
  title,
  definition,
  functionText,
  antonyms,
  relatedKeywords = [],
  loading,
  onSaveToCanvas,
  onAntonymClick,
}: TextDetailPanelProps) {
  return (
    <section className={EXPLORE_DETAIL_ROOT_CLASS}>
      <div className={EXPLORE_DETAIL_MAIN_ROW_CLASS}>
        <div className={EXPLORE_DETAIL_OUTLINE_CARD_CLASS}>
          <div className={`${EXPLORE_DETAIL_GROUP_CLASS} ${EXPLORE_DETAIL_HEADER_CLASS}`}>
            <h2 className={`${EXPLORE_DETAIL_TITLE_CLASS} pt-[0.08em] pb-[0.12em]`}>{title}</h2>
            <button type="button" onClick={onSaveToCanvas} className={EXPLORE_DETAIL_SAVE_BUTTON_CLASS}>
              캔버스에 저장
            </button>
          </div>

          {loading ? (
            <div className={`${EXPLORE_DETAIL_GROUP_CLASS} ${TEXT_DETAIL_DEFINITION_BLOCK_CLASS}`}>
              <p className={`${EXPLORE_DETAIL_ROW_CLASS} text-[#848484]`}>
                정의와 기능을 분석하는 중…
              </p>
            </div>
          ) : (
            <>
              <div className={`${EXPLORE_DETAIL_GROUP_CLASS} ${TEXT_DETAIL_DEFINITION_BLOCK_CLASS}`}>
                <DetailRow label="정의">{definition || "—"}</DetailRow>
                <DetailRow label="기능">{functionText || "—"}</DetailRow>
              </div>

              {relatedKeywords.length > 0 ? (
                <div className={`${EXPLORE_DETAIL_GROUP_CLASS} ${TEXT_DETAIL_ANTONYMS_BLOCK_CLASS}`}>
                  <p className={EXPLORE_DETAIL_BODY_CLASS}>관련 키워드</p>
                  <div className="flex flex-wrap items-start gap-2">
                    {relatedKeywords.map((keyword, keywordIndex) => {
                      const label = keyword.startsWith("#") ? keyword : `#${keyword}`;
                      return (
                        <button
                          key={`${keywordIndex}-${keyword}`}
                          type="button"
                          onClick={() => onAntonymClick(keyword)}
                          className="h-8 shrink-0 rounded-[5px] border border-[#E5E5E5] bg-white px-3 text-[14px] font-medium text-[#222222] transition-colors hover:bg-[#F0F0F0]"
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className={`${EXPLORE_DETAIL_GROUP_CLASS} ${TEXT_DETAIL_ANTONYMS_BLOCK_CLASS}`}>
                <div className="flex items-center gap-1.5">
                  <AntonymIcon />
                  <p className={EXPLORE_DETAIL_BODY_CLASS}>반의어</p>
                </div>
                {antonyms.length === 0 ? (
                  <p className="text-[14px] text-[#848484]">표시할 반의어가 없습니다.</p>
                ) : (
                  <div className="flex flex-wrap items-start gap-2">
                    {antonyms.map((antonym, antonymIndex) => {
                      const label = antonym.startsWith("#") ? antonym : `#${antonym}`;
                      return (
                        <button
                          key={`${antonymIndex}-${antonym}`}
                          type="button"
                          onClick={() => onAntonymClick(antonym)}
                          className="h-8 shrink-0 rounded-lg border border-[#E5E5E5] bg-white px-3 text-[14px] font-medium text-[#222222] transition-colors hover:bg-[#F0F0F0]"
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
