"use client";

import type { ReferenceItem } from "@/components/reference-prototype/data";
import { startImageDragPreview } from "@/components/reference-prototype/dragPreview";
import { EXPLORE_DETAIL_SAVE_BUTTON_CLASS } from "@/components/reference-prototype/exploreDetailShared";

const IMAGE_DETAIL_ROOT_CLASS =
  "mx-auto mb-6 w-full min-w-0 max-w-[1440px] shrink-0 self-stretch bg-white";

const IMAGE_DETAIL_INFO_STACK_CLASS =
  "flex w-full flex-col items-start gap-6 self-stretch";

const IMAGE_DETAIL_FIELD_GROUP_CLASS =
  "flex w-full flex-col items-start gap-[8px] self-stretch";

const IMAGE_DETAIL_LABEL_TEXT_CLASS =
  "font-[family-name:var(--font-pretendard)] text-[14px] font-medium leading-normal text-black";

const IMAGE_DETAIL_MUTED_TEXT_CLASS =
  "font-[family-name:var(--font-pretendard)] text-[14px] font-medium leading-normal text-[var(--dark-mode_button-unabled,rgba(132,132,132,0.6))]";

type ImageDetailPanelProps = {
  item: ReferenceItem;
  title: string;
  link: string;
  tagLabels: string[];
  activeTagFilter?: string | null;
  compact?: boolean;
  onSaveToCanvas: () => void;
  onTagClick: (tag: string) => void;
  onDragStart: () => void;
};

function KeywordChip({
  tag,
  active,
  onClick,
}: {
  tag: string;
  active: boolean;
  onClick: () => void;
}) {
  const label = tag.startsWith("#") ? tag : `#${tag}`;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 shrink-0 rounded-[5px] border px-3 text-[14px] font-medium transition-colors ${
        active
          ? "border-[#222222] bg-[#222222] text-white"
          : "border-[#E5E5E5] bg-white text-[#222222] hover:bg-[#F0F0F0]"
      }`}
    >
      {label}
    </button>
  );
}

export function ImageDetailPanel({
  item,
  title,
  link,
  tagLabels,
  activeTagFilter = null,
  compact = false,
  onSaveToCanvas,
  onTagClick,
  onDragStart,
}: ImageDetailPanelProps) {
  const description = item.description?.trim() ?? "";
  const bundleClass = compact
    ? "flex min-w-0 max-w-full self-stretch items-start justify-center gap-5 border-y border-[#E5E5E5] px-4 py-5"
    : "flex self-stretch items-start justify-center gap-10 border-y border-[#E5E5E5] px-10 py-5";

  const infoColumnClass = compact
    ? "flex h-[600px] w-[min(648px,46%)] min-w-[240px] shrink-0 flex-col items-stretch justify-between self-stretch border border-[#E5E5E5] bg-white p-5"
    : "flex h-[600px] w-[648px] max-w-full shrink-0 flex-col items-stretch justify-between self-stretch border border-[#E5E5E5] bg-white p-5";

  const imageWrapClass = compact
    ? "flex h-[600px] min-w-0 flex-1 items-center justify-center self-stretch"
    : "flex shrink-0 items-start self-start";

  const imageFrameClass = compact
    ? "flex max-h-[600px] w-fit max-w-full min-w-0 items-center justify-center bg-transparent"
    : "flex h-[600px] w-fit max-w-full shrink-0 items-center justify-center bg-transparent";

  const imageClass = compact
    ? "block max-h-[600px] max-w-full h-auto w-auto object-contain"
    : "block h-full w-auto max-w-full object-contain";

  return (
    <section className={IMAGE_DETAIL_ROOT_CLASS}>
      <div className={bundleClass}>
        <div className={imageWrapClass}>
          <div
            className={imageFrameClass}
            draggable
            onDragStart={(event) => {
              // 홈 카드와 같은 드래그 미리보기(잡은 사진 + 투명도·그레인)
              const image = event.currentTarget.querySelector("img");
              if (image) {
                startImageDragPreview(event, image);
              }
              onDragStart();
            }}
          >
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.imageUrl} alt="" className={imageClass} />
            ) : (
              <div
                className={compact ? "max-h-full max-w-full object-contain" : "h-full w-auto"}
                style={{
                  aspectRatio: item.ratio.replace(/\s+/g, ""),
                  height: compact ? undefined : "100%",
                  maxHeight: compact ? 600 : undefined,
                  width: compact ? "auto" : undefined,
                  backgroundColor: item.shade ?? "#E5E5E5",
                }}
              />
            )}
          </div>
        </div>

        <div className={infoColumnClass}>
          <div className={IMAGE_DETAIL_INFO_STACK_CLASS}>
            {/* 파일 이름 대신 AI가 이미지의 시각적 특징·주제를 요약한 한 문장을 제목으로 쓴다(없으면 파일 이름). */}
            {description ? (
              <h2
                title={title}
                className="w-full font-[family-name:var(--font-pretendard)] text-[18px] font-medium leading-[1.45] text-[#222222] [word-break:keep-all]"
              >
                {description}
              </h2>
            ) : (
              <h2 className={`w-full ${IMAGE_DETAIL_MUTED_TEXT_CLASS}`}>{title}</h2>
            )}

            <div className={IMAGE_DETAIL_FIELD_GROUP_CLASS}>
              <p className={IMAGE_DETAIL_LABEL_TEXT_CLASS}>링크</p>
              <div className={`w-full break-all ${IMAGE_DETAIL_MUTED_TEXT_CLASS}`}>
                {link ? (
                  /^https?:\/\//i.test(link) ? (
                    // 힌트 문구처럼 보이지 않도록 밑줄로 '열 수 있는 링크'임을 알린다.
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all underline decoration-1 underline-offset-[3px] transition-colors hover:text-[#222222]"
                    >
                      {link}
                    </a>
                  ) : (
                    link
                  )
                ) : (
                  "—"
                )}
              </div>
            </div>

            <div className={IMAGE_DETAIL_FIELD_GROUP_CLASS}>
              <p className={IMAGE_DETAIL_LABEL_TEXT_CLASS}>관련 키워드</p>
              <div className="flex flex-wrap gap-[8px]">
                {tagLabels.length === 0 ? (
                  <p className={IMAGE_DETAIL_MUTED_TEXT_CLASS}>—</p>
                ) : (
                  tagLabels.map((tag, index) => (
                    <KeywordChip
                      key={`${tag}-${index}`}
                      tag={tag}
                      active={activeTagFilter === tag}
                      onClick={() => onTagClick(tag)}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="flex w-full justify-end">
            <button type="button" onClick={onSaveToCanvas} className={EXPLORE_DETAIL_SAVE_BUTTON_CLASS}>
              캔버스에 저장
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
