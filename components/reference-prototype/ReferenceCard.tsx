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
  /** 이미지 카드 뒷면 키워드 버튼을 눌렀을 때(검색창에 넣고 검색) */
  onBackKeywordClick?: (keyword: string) => void;
};

// 텍스트 카드 관련 이미지 스택(T-a): 사진 한 변 80px, 사진끼리 밀리는 거리 44px. 호버 때 바깥 사진은 20px 더 벌어진다(아래 클래스).
const WOVEN_STACK_PHOTO_PX = 80;
const WOVEN_STACK_OFFSET_PX = 44;
// 바깥 사진의 기울기(평소 / 호버). 가운데 사진은 똑바로 둔다.
const WOVEN_STACK_TILT = [
  { rest: "-rotate-[4deg]", hover: "group-hover/textcard:-translate-x-[20px] group-hover/textcard:-rotate-[6deg]" },
  { rest: "", hover: "" },
  { rest: "rotate-[4deg]", hover: "group-hover/textcard:translate-x-[20px] group-hover/textcard:rotate-[6deg]" },
];

/** 텍스트 카드 관련 이미지: 사진 세 장이 살짝 기울어 겹쳐 있고, 카드에 마우스를 올리면 양옆으로 벌어진다. 클릭은 카드(텍스트 상세)로 넘긴다. */
function WovenStack({ thumbs }: { thumbs: string[] }) {
  const shown = thumbs.slice(0, 3);
  // 사진이 1~2장이면 가운데 기준으로 놓이도록 기울기 자리를 고른다.
  const slots = shown.length === 1 ? [1] : shown.length === 2 ? [0, 2] : [0, 1, 2];
  return (
    <div
      className="pointer-events-none relative shrink-0"
      style={{
        width: WOVEN_STACK_PHOTO_PX + WOVEN_STACK_OFFSET_PX * (shown.length - 1),
        height: WOVEN_STACK_PHOTO_PX,
      }}
      aria-hidden
    >
      {shown.map((src, index) => {
        const tilt = WOVEN_STACK_TILT[slots[index]];
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src}
            src={src}
            alt=""
            loading="lazy"
            draggable={false}
            style={{
              left: WOVEN_STACK_OFFSET_PX * index,
              width: WOVEN_STACK_PHOTO_PX,
              height: WOVEN_STACK_PHOTO_PX,
              zIndex: index + 1,
            }}
            className={`absolute top-0 rounded-[3px] border-2 border-white bg-[#E5E5E5] object-cover shadow-[0_2px_6px_rgba(0,0,0,0.14)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${tilt.rest} ${tilt.hover}`}
          />
        );
      })}
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

// 뒤집기 아이콘(C-2): 엇갈린 두 픽셀 화살표 ⇄ (7×7칸). "X"가 한 칸이다.
const FLIP_ICON_PIXEL_ROWS = [
  ".X.....",
  "XXXXXX.",
  ".X.....",
  ".......",
  ".....X.",
  ".XXXXXX",
  ".....X.",
];
// 한 칸을 정확히 3px로 그린다. 2.57px처럼 딱 떨어지지 않으면 가장자리가 번져 멀리서 털처럼 보인다.
const FLIP_ICON_CELL_PX = 3;
// 아이콘(21px)을 22px 상자에 그려, 36px 버튼 가운데에 놓아도 위치가 정수 픽셀(7px)에 떨어지게 한다.
const FLIP_ICON_BOX_PX = 22;
const FLIP_ICON_PATH = FLIP_ICON_PIXEL_ROWS.flatMap((row, y) =>
  [...row].flatMap((cell, x) =>
    cell === "X"
      ? [`M${x * FLIP_ICON_CELL_PX} ${y * FLIP_ICON_CELL_PX}h${FLIP_ICON_CELL_PX}v${FLIP_ICON_CELL_PX}h-${FLIP_ICON_CELL_PX}z`]
      : [],
  ),
).join("");

function FlipIcon() {
  return (
    <svg
      width={FLIP_ICON_BOX_PX}
      height={FLIP_ICON_BOX_PX}
      viewBox={`0 0 ${FLIP_ICON_BOX_PX} ${FLIP_ICON_BOX_PX}`}
      fill="#F5F53D"
      shapeRendering="crispEdges"
      // 버튼에 마우스를 올리면 통째로 좌우로 뒤집힌다(두 화살표 사이 간격은 그대로).
      className="block h-[22px] w-[22px] shrink-0 transition-transform duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/flip:-scale-x-100"
      aria-hidden
    >
      <path d={FLIP_ICON_PATH} />
    </svg>
  );
}

const FLIP_TOGGLE_BUTTON_CLASS =
  "group/flip absolute bottom-2 right-2 z-[2] flex h-9 w-9 items-center justify-center rounded-[3px] bg-[#222222] opacity-0 pointer-events-none transition-opacity duration-200 group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto";

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
  onBackKeywordClick,
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
  onBackKeywordClick?: (keyword: string) => void;
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
    "box-border flex min-h-full w-full flex-col justify-center gap-2.5 rounded-lg bg-white py-5 pr-5 pl-4 shadow-[inset_0_0_0_1px_#E5E7EB]";

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
            {/* B-1: 키워드를 라임 칩으로 한 줄에 하나씩. 누르면 검색창에 넣고 검색한다. */}
            <span className="font-[family-name:var(--font-pretendard)] text-[11px] font-semibold tracking-[0.08em] text-[#9A9A9A]">
              KEYWORDS
            </span>
            <ul className="flex flex-col items-start gap-1.5 self-stretch">
              {upperKeywords.map((keyword, keywordIndex) => (
                <li key={`${keywordIndex}-${keyword}`} className="max-w-full">
                  <button
                    type="button"
                    tabIndex={flipped ? 0 : -1}
                    onClick={(event) => {
                      event.stopPropagation();
                      event.preventDefault();
                      onBackKeywordClick?.(keyword);
                    }}
                    className="max-w-full cursor-pointer truncate rounded-[4px] bg-[#F5F53D] px-2.5 py-[7px] text-left font-[family-name:var(--font-pretendard)] text-[14px] font-semibold leading-none text-[#222222] transition-colors hover:bg-[#222222] hover:text-[#F5F53D]"
                  >
                    {keyword}
                  </button>
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
  onBackKeywordClick,
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
            className={`group/textcard box-border flex ${IDEAVE_EXPLORE_CARD_SIZE_CLASS} flex-col items-center justify-center gap-[18px] px-4 py-5 transition-[background-color,box-shadow] hover:bg-[#F5F53D] ${IDEAVE_EXPLORE_TEXT_CARD_SURFACE_CLASS} ${
              selected ? "ring-2 ring-[#1A1A1A]" : ""
            }`}
          >
            <p
              // 두 줄이 될 때 글자 중간이 아니라 띄어쓰기에서 줄을 바꾸고(keep-all), 두 줄 길이를 고르게(balance) 맞춘다.
              className={`text-center text-[34px] font-medium leading-tight text-[#222222] [overflow-wrap:anywhere] [text-wrap:balance] [word-break:keep-all] ${
                woven ? "line-clamp-2" : "line-clamp-3"
              }`}
            >
              {label}
            </p>
            {woven ? <WovenStack thumbs={woven.thumbs} /> : null}
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
    // 그리드 카드는 240px라 Drive 원본(수 MB) 대신 긴 변 480px 사본을 쓰고, 화면 가까이 올 때만 불러온다.
    const cardSrc =
      item.imageUrl.startsWith("/api/drive/file/") && !item.imageUrl.includes("?")
        ? `${item.imageUrl}?size=card`
        : item.imageUrl;
    const imageFront = (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cardSrc}
          alt=""
          draggable={false}
          loading="lazy"
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
        onBackKeywordClick={onBackKeywordClick}
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
        onBackKeywordClick={onBackKeywordClick}
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
