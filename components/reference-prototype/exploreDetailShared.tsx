export const EXPLORE_DETAIL_ROOT_CLASS =
  "mx-auto mb-6 flex w-full max-w-[1440px] shrink-0 self-stretch border-y border-[#E5E5E5] bg-white px-10 py-5";

export const EXPLORE_DETAIL_MAIN_ROW_CLASS =
  "flex w-full max-w-[1360px] shrink-0 items-start justify-start gap-5 self-stretch";

export const EXPLORE_DETAIL_BACK_GROUP_CLASS = "mt-5 flex shrink-0 items-start self-start";

export const EXPLORE_DETAIL_BACK_BUTTON_CLASS =
  "flex h-8 w-8 shrink-0 items-center justify-center transition-opacity hover:opacity-70";

export const EXPLORE_DETAIL_SAVE_BUTTON_CLASS =
  "flex shrink-0 items-center justify-center gap-2.5 rounded-[5px] border-0 bg-[#F5F53D] px-4 py-2 text-[14px] font-medium leading-none text-[#222222] transition-colors hover:bg-[color-mix(in_srgb,#FFFFFF_20%,#F5F53D)]";

export const EXPLORE_DETAIL_TITLE_CLASS =
  "min-w-0 break-words overflow-visible font-[family-name:var(--font-pretendard)] text-[48px] font-medium leading-[1.25] text-black";

export const EXPLORE_DETAIL_BODY_CLASS =
  "font-[family-name:var(--font-pretendard)] text-[14px] font-medium leading-normal text-black";

export const EXPLORE_DETAIL_OUTLINE_CARD_CLASS =
  "flex min-w-0 flex-1 flex-col items-center gap-5 self-stretch border border-[#E5E5E5] bg-white py-5";

export const EXPLORE_DETAIL_GROUP_CLASS = "w-full self-stretch";

export const EXPLORE_DETAIL_HEADER_CLASS =
  "flex items-center justify-between gap-4 overflow-visible self-stretch py-1 pl-10 pr-5";

export const EXPLORE_DETAIL_ROW_CLASS =
  "flex self-stretch items-start gap-10 border-t border-[#E5E5E5] px-5 py-4";

export function BackChevronIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 8 14"
      fill="none"
      className="h-5 w-5"
      aria-hidden
    >
      <path
        d="M7 1L1 7L7 13"
        stroke="var(--sds-color-icon-default-default)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ExploreDetailBackButton({
  onBack,
  groupClassName,
}: {
  onBack: () => void;
  groupClassName?: string;
}) {
  return (
    <div className={groupClassName ?? EXPLORE_DETAIL_BACK_GROUP_CLASS}>
      <button
        type="button"
        onClick={onBack}
        className={EXPLORE_DETAIL_BACK_BUTTON_CLASS}
        aria-label="뒤로"
      >
        <BackChevronIcon />
      </button>
    </div>
  );
}
