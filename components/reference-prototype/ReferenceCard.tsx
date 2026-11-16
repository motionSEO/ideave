"use client";

import { useMemo, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent, type ReactNode } from "react";
import type { ReferenceItem } from "@/components/reference-prototype/data";
import { startImageDragPreview } from "@/components/reference-prototype/dragPreview";

type ReferenceCardProps = {
  item: ReferenceItem;
  compact?: boolean;
  selected?: boolean;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: (item: ReferenceItem) => void;
  /** 카드에 표시할 태그(검색·필터용과 동일 출처 권장) */
  tagLabels?: string[];
  activeTagFilter?: string | null;
  onTagBadgeClick?: (tag: string) => void;
  variant?: "default" | "ideave";
  /** 텍스트 카드에 실로 꿰어 보여줄 엮인 이미지(키워드와 태그가 겹치는 수집 이미지) */
  wovenImages?: { thumbs: string[]; total: number };
};

/** 텍스트 카드 "구슬 실": 엮인 이미지 썸네일이 핑크 실에 꿰어진 줄. 클릭은 카드(텍스트 상세)로 넘긴다. */
function WovenBeads({ thumbs, total }: { thumbs: string[]; total: number }) {
  const more = total - thumbs.length;
  return (
    <div className="pointer-events-none relative flex items-center gap-[10px]" aria-hidden>
      <span className="absolute -left-2 top-1/2 h-[3px] -translate-y-1/2 bg-[#FF80FF]" style={{ right: more > 0 ? 28 : -8 }} />
      {thumbs.map((src) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          loading="lazy"
          draggable={false}
          className="relative h-11 w-11 rounded-[6px] border-2 border-white bg-[#E5E5E5] object-cover"
        />
      ))}
      {more > 0 ? (
        <span className="relative ml-0.5 font-[family-name:var(--font-pretendard)] text-[14px] font-medium text-[#848484]">
          +{more}
        </span>
      ) : null}
    </div>
  );
}

const UPPER_KEYWORD_FALLBACKS = ["구도", "색채", "리듬", "공간", "질감", "형태", "무드", "밸런스"];
const IDEAVE_EXPLORE_CARD_SIZE_CLASS = "h-[240px] w-[240px]";
const IDEAVE_EXPLORE_IMAGE_CARD_SHADOW_CLASS = "shadow-[0_4px_10px_0_rgba(0,0,0,0.10)]";
const IDEAVE_EXPLORE_IMAGE_CARD_SHADOW_STYLE: CSSProperties = {
  boxShadow: "0 4px 10px 0 rgba(0, 0, 0, 0.10)",
};
const IDEAVE_EXPLORE_IMAGE_CARD_SURFACE_CLASS = "rounded-lg bg-[#E5E5E5]";
const IDEAVE_EXPLORE_TEXT_CARD_SURFACE_CLASS =
  "rounded-lg bg-white shadow-[0_4px_10px_0_rgba(0,0,0,0.10)]";
const IDEAVE_IMAGE_HOVER_OVERLAY_STYLE: CSSProperties = {
  background:
    "linear-gradient(0deg, rgba(0, 0, 0, 0.20) 0%, rgba(0, 0, 0, 0.20) 100%)",
};

function IdeaveImageHoverOverlay() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[1] rounded-lg opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      style={IDEAVE_IMAGE_HOVER_OVERLAY_STYLE}
      aria-hidden
    />
  );
}

/** 카드 뒷면 키워드: 쉼표(,) 뒤 제거, "A하고 B" 형태는 각각 분리 */
function expandCardBackKeywords(value: string): string[] {
  const commaIndex = value.search(/[,，]/);
  const primary = (commaIndex === -1 ? value : value.slice(0, commaIndex)).trim();
  if (!primary) {
    return [];
  }

  const parts = primary
    .split(/\s*하고\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [primary];
}

function resolveUpperKeywords(tagLabels: string[], itemId: string): string[] {
  const unique = [
    ...new Set(
      tagLabels
        .flatMap((tag) => expandCardBackKeywords(tag))
        .map((keyword) => keyword.trim())
        .filter(Boolean),
    ),
  ];
  const used = new Set(unique.map((keyword) => keyword.toLowerCase()));
  const pool = [...unique];
  const fallbacks = UPPER_KEYWORD_FALLBACKS.filter((keyword) => !used.has(keyword.toLowerCase()));
  const seedSource = itemId.length > 0 ? itemId : "ref";
  let offset = 0;

  while (pool.length < 3 && fallbacks.length > 0) {
    const seed = seedSource.charCodeAt(offset % seedSource.length) + offset;
    const [picked] = fallbacks.splice(seed % fallbacks.length, 1);
    if (!picked) {
      break;
    }
    pool.push(picked);
    used.add(picked.toLowerCase());
    offset += 1;
  }

  return pool.slice(0, 3);
}

const FLIP_ICON_PATH =
  "M15.5455 7.22175H21V1.88702M21 7.22175L16.7818 3.34518C15.8048 2.38912 14.596 1.69071 13.2684 1.31511C11.9407 0.939518 10.5374 0.898983 9.18935 1.19729C7.84133 1.4956 6.59254 2.12302 5.55951 3.02102C4.52648 3.91902 3.74288 5.05833 3.28182 6.33263M6.45455 10.7782H1V16.113M1 10.7782L5.21818 14.6548C6.19522 15.6109 7.40397 16.3093 8.73164 16.6849C10.0593 17.0605 11.4626 17.101 12.8106 16.8027C14.1587 16.5044 15.4075 15.877 16.4405 14.979C17.4735 14.081 18.2571 12.9417 18.7182 11.6674";

function FlipIcon() {
  return (
    <svg
      width={20}
      height={16}
      viewBox="0 0 22 18"
      fill="none"
      className="block h-4 w-5 shrink-0"
      aria-hidden
    >
      <path
        d={FLIP_ICON_PATH}
        stroke="var(--hint-text-border, #848484)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const FLIP_TOGGLE_BUTTON_CLASS =
  "absolute bottom-2 right-2 z-[2] flex h-9 w-9 items-center justify-center rounded-lg bg-[#F0F0F0] opacity-0 pointer-events-none transition-opacity duration-200 group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto";

function FlipToggleButton({ onClick }: { onClick: (event: MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={FLIP_TOGGLE_BUTTON_CLASS}
      aria-label="카드 뒤집기"
    >
      <FlipIcon />
    </button>
  );
}

function TagBadgeRow({
  tags,
  activeTagFilter,
  onTagBadgeClick,
}: {
  tags: string[];
  activeTagFilter: string | null;
  onTagBadgeClick?: (tag: string) => void;
}) {
  if (!onTagBadgeClick || tags.length === 0) {
    return null;
  }

  return (
    <div className="mt-1.5 flex flex-wrap gap-1" onPointerDown={(event) => event.stopPropagation()}>
      {tags.slice(0, 8).map((tag, tagIndex) => {
        const isActive = activeTagFilter === tag;
        return (
          <button
            key={`${tag}-${tagIndex}`}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onTagBadgeClick(tag);
            }}
            className={`max-w-full truncate rounded-full border px-2 py-0.5 text-[10px] leading-tight ${
              isActive
                ? "border-[#1A1A1A] bg-[#1A1A1A] text-white"
                : "border-[#E5E7EB] bg-white text-[#333333] hover:border-[#1A1A1A]"
            }`}
          >
            #{tag}
          </button>
        );
      })}
    </div>
  );
}

function FlippableImageCard({
  item,
  compact,
  selected,
  onClick,
  draggable,
  onDragStart,
  tagLabels,
  variant,
  front,
}: {
  item: ReferenceItem;
  compact: boolean;
  selected: boolean;
  onClick?: () => void;
  draggable: boolean;
  onDragStart?: (item: ReferenceItem) => void;
  tagLabels: string[];
  variant: "default" | "ideave";
  front: ReactNode;
}) {
  const [flipped, setFlipped] = useState(false);
  const frontRef = useRef<HTMLDivElement | null>(null);
  const upperKeywords = useMemo(
    () => resolveUpperKeywords(tagLabels, item.id),
    [tagLabels, item.id],
  );
  const isIdeave = variant === "ideave";

  const toggleFlip = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    setFlipped((prev) => !prev);
  };

  const shellClass = isIdeave
    ? `group relative w-full ${IDEAVE_EXPLORE_IMAGE_CARD_SURFACE_CLASS}`
    : `group relative w-full rounded-lg border ${selected ? "border-[#1A1A1A]" : "border-[#E5E7EB]"}`;

  const backClass =
    "box-border flex min-h-full w-full flex-col justify-center gap-3 rounded-lg bg-white py-5 pr-5 pl-4 shadow-[inset_0_0_0_1px_#E5E7EB]";

  const flipCardInner = (
    <div className={`${shellClass} [perspective:1200px]`}>
      <div
        className={`relative w-full [transform-style:preserve-3d] transition-transform duration-[400ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
          flipped ? "[transform:rotateY(180deg)]" : ""
        }`}
      >
        <div
          ref={frontRef}
          className={`relative overflow-hidden rounded-lg [backface-visibility:hidden] ${
            flipped ? "pointer-events-none" : ""
          }`}
        >
          {front}
          {isIdeave ? <IdeaveImageHoverOverlay /> : null}
          <FlipToggleButton onClick={toggleFlip} />
        </div>
        <div
          className={`absolute inset-0 [transform:rotateY(180deg)] [backface-visibility:hidden] ${
            flipped ? "" : "pointer-events-none"
          }`}
        >
          <div className={`${backClass} h-full min-h-full`}>
            <ul className="flex flex-col self-stretch">
              {upperKeywords.map((keyword, keywordIndex) => (
                <li
                  key={`${keywordIndex}-${keyword}`}
                  className="self-stretch font-[family-name:var(--font-pretendard)] text-[14px] font-normal leading-6 text-black"
                >
                  {keyword}
                </li>
              ))}
            </ul>
          </div>
          <FlipToggleButton onClick={toggleFlip} />
        </div>
      </div>
    </div>
  );

  return (
    <article
      className={isIdeave ? "w-[240px] cursor-pointer overflow-visible" : "mb-3 cursor-pointer break-inside-avoid"}
      role={onClick && !flipped ? "button" : undefined}
      onClick={flipped ? undefined : onClick}
      draggable={draggable && !flipped}
      onDragStart={(event: DragEvent<HTMLElement>) => {
        if (flipped) {
          return;
        }
        // 브라우저 기본 드래그 이미지는 뒤집기 카드의 뒷면 키워드가 반전돼 비쳐 찍히므로,
        // 잡은 사진만 직접 띄워 마우스를 따라가게 한다(dragPreview.ts).
        const image = frontRef.current?.querySelector("img");
        if (image) {
          startImageDragPreview(event, image);
        }
        onDragStart?.(item);
      }}
    >
      {isIdeave ? (
        <div
          className={`overflow-visible rounded-lg ${IDEAVE_EXPLORE_IMAGE_CARD_SHADOW_CLASS} ${
            selected ? "ring-2 ring-[#1A1A1A]" : ""
          }`}
          style={IDEAVE_EXPLORE_IMAGE_CARD_SHADOW_STYLE}
        >
          {flipCardInner}
        </div>
      ) : (
        flipCardInner
      )}
    </article>
  );
}

export function ReferenceCard({
  item,
  compact = false,
  selected = false,
  onClick,
  draggable = false,
  onDragStart,
  tagLabels,
  activeTagFilter = null,
  onTagBadgeClick,
  variant = "ideave",
  wovenImages,
}: ReferenceCardProps) {
  const isIdeave = variant === "ideave";
  const tags = tagLabels ?? [];

  if (item.type === "text") {
    const label = item.textLabel?.trim() || "text";

    if (isIdeave) {
      const woven = wovenImages && wovenImages.thumbs.length > 0 ? wovenImages : null;
      return (
        <article
          className={`rounded-lg ${IDEAVE_EXPLORE_IMAGE_CARD_SHADOW_CLASS}`}
          onClick={onClick}
          draggable={draggable}
          onDragStart={() => onDragStart?.(item)}
        >
          <div
            className={`box-border flex ${IDEAVE_EXPLORE_CARD_SIZE_CLASS} flex-col items-center justify-center gap-[26px] px-4 py-5 transition-[background-color,box-shadow] hover:bg-[#F5F53D] ${IDEAVE_EXPLORE_TEXT_CARD_SURFACE_CLASS} ${
              selected ? "ring-2 ring-[#1A1A1A]" : ""
            }`}
          >
            <p
              className={`text-center text-[36px] font-medium leading-tight text-[#222222] ${
                woven ? "line-clamp-2" : "line-clamp-3"
              }`}
            >
              {label}
            </p>
            {woven ? <WovenBeads thumbs={woven.thumbs} total={woven.total} /> : null}
          </div>
        </article>
      );
    }

    return (
      <article
        className={`mb-3 break-inside-avoid rounded-lg border bg-white p-4 ${
          selected ? "border-[#1A1A1A]" : "border-[#E5E7EB]"
        }`}
        onClick={onClick}
        draggable={draggable}
        onDragStart={() => onDragStart?.(item)}
      >
        <p className="text-xl leading-snug text-[#1A1A1A] md:text-2xl">{label}</p>
        <TagBadgeRow tags={tags} activeTagFilter={activeTagFilter} onTagBadgeClick={onTagBadgeClick} />
      </article>
    );
  }

  if (item.imageUrl) {
    const imageFront = (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.imageUrl}
          alt=""
          draggable={false}
          decoding="async"
          onError={() => {
            console.error("[IDEAVE] image load failed", item.id, item.imageUrl);
          }}
          className={`block w-full max-w-full align-top ${
            isIdeave ? "rounded-lg bg-[#E5E5E5]" : "bg-[#E5E7EB]"
          } ${compact ? "aspect-[4/3] object-cover" : "h-auto"}`}
          style={
            compact
              ? undefined
              : {
                  aspectRatio: item.ratio,
                  objectFit: "contain",
                  objectPosition: "center",
                }
          }
        />
      </>
    );

    const card = (
      <FlippableImageCard
        item={item}
        compact={compact}
        selected={selected}
        onClick={onClick}
        draggable={draggable}
        onDragStart={onDragStart}
        tagLabels={tags}
        variant={variant}
        front={imageFront}
      />
    );

    if (isIdeave) {
      return card;
    }

    return (
      <>
        {card}
        <TagBadgeRow tags={tags} activeTagFilter={activeTagFilter} onTagBadgeClick={onTagBadgeClick} />
      </>
    );
  }

  const placeholderFront = (
    <div
      className={`w-full ${isIdeave ? "rounded-lg" : ""}`}
      style={
        {
          aspectRatio: compact ? "4 / 3" : item.ratio,
          backgroundColor: item.shade ?? (isIdeave ? "#E5E5E5" : "#E5E7EB"),
        } as CSSProperties
      }
    />
  );

  if (item.type === "image") {
    const card = (
      <FlippableImageCard
        item={item}
        compact={compact}
        selected={selected}
        onClick={onClick}
        draggable={draggable}
        onDragStart={onDragStart}
        tagLabels={tags}
        variant={variant}
        front={placeholderFront}
      />
    );

    if (isIdeave) {
      return card;
    }

    return (
      <>
        {card}
        <TagBadgeRow tags={tags} activeTagFilter={activeTagFilter} onTagBadgeClick={onTagBadgeClick} />
      </>
    );
  }

  return (
    <article
      className="mb-3 break-inside-avoid"
      onClick={onClick}
      draggable={draggable}
      onDragStart={() => onDragStart?.(item)}
    >
      <div
        className={`w-full rounded-lg border ${selected ? "border-[#1A1A1A]" : "border-[#E5E7EB]"}`}
        style={
          {
            aspectRatio: compact ? "4 / 3" : item.ratio,
            backgroundColor: item.shade ?? "#E5E7EB",
          } as CSSProperties
        }
      />
      <TagBadgeRow tags={tags} activeTagFilter={activeTagFilter} onTagBadgeClick={onTagBadgeClick} />
    </article>
  );
}
