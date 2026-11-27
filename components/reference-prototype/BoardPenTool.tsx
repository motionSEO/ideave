"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  BOARD_ERASER_MAX,
  BOARD_ERASER_MIN,
  BOARD_PEN_PRESET_COLORS,
  BOARD_PEN_SIZES,
  BOARD_PEN_TYPES,
  PENCIL_FILTER_SVG,
  hexToHsv,
  hsvToHex,
  strokePathD,
  strokeToSvgMarkup,
  type BoardPenSettings,
  type BoardPenType,
  type BoardStroke,
} from "@/components/reference-prototype/boardPen";

const SAFE_HEX = /^#[0-9a-f]{6}$/i;
// 펜 설정 창 기본 너비와, 캔버스 가장자리와 띄울 최소 간격
const POPOVER_WIDTH = 276;
const POPOVER_EDGE_GAP = 8;

/** 저장된 획을 다시 그릴 때 색 값이 #RRGGBB가 아니면 기본 검정으로(세션 저장값을 그대로 마크업에 넣으므로). */
function safeStroke(stroke: BoardStroke): BoardStroke {
  return SAFE_HEX.test(stroke.color) ? stroke : { ...stroke, color: "#222222" };
}

/** 캔버스 월드 위에 얹는 획 레이어. 그리는 중인 획은 livePathRef에 직접 그려 React 재렌더 없이 따라간다. */
export function BoardStrokeLayer({
  strokes,
  selectedIds,
  width,
  height,
  livePathRef,
}: {
  strokes: BoardStroke[];
  /** 선택된 획: 다른 카드처럼 라임으로 감싸 보여 준다 */
  selectedIds: Set<string>;
  width: number;
  height: number;
  livePathRef: RefObject<SVGPathElement | null>;
}) {
  const markup = strokes.map((stroke) => strokeToSvgMarkup(safeStroke(stroke), 0, 0)).join("");
  // 선택 표시: 획 뒤에 굵은 라임 선을 깔아 형광펜처럼 감싼다.
  const halo = strokes
    .filter((stroke) => selectedIds.has(stroke.id))
    .map(
      (stroke) =>
        `<path d="${strokePathD(stroke.points)}" fill="none" stroke="#F5F53D" stroke-opacity="0.9" stroke-width="${stroke.size + 10}" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join("");
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 z-[2]"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      <defs dangerouslySetInnerHTML={{ __html: PENCIL_FILTER_SVG }} />
      <g dangerouslySetInnerHTML={{ __html: halo }} />
      <g dangerouslySetInnerHTML={{ __html: markup }} />
      <path ref={livePathRef} fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ display: "none" }} />
    </svg>
  );
}

/** 색이 어두운지(밝기 0~1). 어두운 펜 색이면 아이콘 바탕을 밝게 바꿔 색이 보이게 한다. */
function colorLuminance(hex: string): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) {
    return 0;
  }
  const n = parseInt(match[1]!, 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/** 하단 바 펜 아이콘. 켜져 있으면 고른 펜 색으로 펜을 그린다(어두운 색은 밝은 칸, 밝은 색은 검정 칸 위에). */
export function PenIcon({ active, color }: { active: boolean; color: string }) {
  const penColor = SAFE_HEX.test(color) ? color : "#222222";
  const darkPen = colorLuminance(penColor) < 0.35;
  // 인라인 스타일로 지정해 다크 모드 CSS 덮어쓰기보다 우선한다.
  const boxStyle = active ? { backgroundColor: darkPen ? "#F0F0F0" : "#222222" } : undefined;
  const strokeStyle = active ? { stroke: penColor } : undefined;
  return (
    <span
      data-pen-icon={active ? "on" : "off"}
      className="relative flex h-8 w-8 items-center justify-center rounded-[4px] bg-transparent transition-colors"
      style={boxStyle}
    >
      <svg width={20} height={20} viewBox="0 0 20 20" fill="none" aria-hidden>
        <path
          d="M13.5 3.5l3 3L7 16l-4 1 1-4 9.5-9.5z"
          stroke="#222222"
          style={strokeStyle}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
        <path d="M11.5 5.5l3 3" stroke="#222222" style={strokeStyle} strokeWidth={1.8} />
      </svg>
    </span>
  );
}

const PREVIEW_POINTS: Array<[number, number]> = [
  [14, 26], [40, 16], [70, 11], [100, 17], [130, 26], [160, 22], [190, 14], [220, 12], [250, 18], [266, 22],
];

function PenTypeSample({ type, color }: { type: BoardPenType; color: string }) {
  const markup = strokeToSvgMarkup(
    { id: "sample", type, color, size: 2.4, points: [[4, 8], [12, 3], [20, 10], [28, 6], [36, 8]] },
    0,
    0,
  );
  return (
    <svg width={40} height={14} viewBox="0 0 40 14" aria-hidden className="shrink-0 overflow-visible">
      <defs dangerouslySetInnerHTML={{ __html: PENCIL_FILTER_SVG }} />
      <g dangerouslySetInnerHTML={{ __html: markup }} />
    </svg>
  );
}

/**
 * 펜 설정 창(L-1 화이트 기본): 미리보기 → 펜 종류 드롭다운 → 두께 → 사각형 색상 팔레트.
 * 테두리 없이 흰 면 + 그림자, 고른 항목은 라임.
 */
type AnchoredPopoverLayout = {
  left: number;
  bottom: number;
  width: number;
  arrowLeft: number;
  maxHeight: number;
};

/**
 * 하단 바 아이콘 위에 뜨는 설정 창의 위치.
 * 캔버스 너비를 줄이거나 하단 바가 가로로 스크롤돼도 창이 캔버스 안에 들어오고 말꼬리는 아이콘을 가리키게 한다.
 */
function useAnchoredPopoverLayout(
  anchorRef: RefObject<HTMLElement | null>,
  boundsRef: RefObject<HTMLElement | null>,
  preferredWidth: number,
): AnchoredPopoverLayout | null {
  const [layout, setLayout] = useState<AnchoredPopoverLayout | null>(null);
  useLayoutEffect(() => {
    const bounds = boundsRef.current;
    const anchor = anchorRef.current;
    if (!bounds || !anchor) {
      return;
    }
    const measure = () => {
      const box = bounds.getBoundingClientRect();
      const a = anchor.getBoundingClientRect();
      const width = Math.min(preferredWidth, box.width - POPOVER_EDGE_GAP * 2);
      const anchorX = a.left + a.width / 2 - box.left;
      // 기본은 말꼬리가 창 오른쪽에서 36px 들어간 자리(아이콘 위). 캔버스 밖으로 나가면 안쪽으로 민다.
      const preferredLeft = anchorX - (width - 36);
      const left = Math.max(POPOVER_EDGE_GAP, Math.min(preferredLeft, box.width - width - POPOVER_EDGE_GAP));
      const arrowLeft = Math.max(14, Math.min(anchorX - left - 6, width - 26));
      const anchorTop = a.top - box.top;
      setLayout({
        left,
        width,
        arrowLeft,
        bottom: box.height - anchorTop + 12,
        maxHeight: Math.max(160, anchorTop - 12 - POPOVER_EDGE_GAP),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bounds);
    const toolbar = anchor.closest("[data-board-toolbar]");
    toolbar?.addEventListener("scroll", measure);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      toolbar?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [anchorRef, boundsRef, preferredWidth]);
  return layout;
}

/** 하단 바 지우개 아이콘(E-1). 켜져 있으면 밝은 칸 위에 검정 선. */
export function EraserIcon({ active }: { active: boolean }) {
  // 켜진 칸은 밝은 회색이라, 다크 모드에서도 선을 검정으로 둔다(인라인 스타일이 다크 CSS보다 우선).
  const strokeStyle = active ? { stroke: "#222222" } : undefined;
  return (
    <span
      data-pen-icon={active ? "on" : "off"}
      className="relative flex h-8 w-8 items-center justify-center rounded-[4px] bg-transparent transition-colors"
      style={active ? { backgroundColor: "#F0F0F0" } : undefined}
    >
      <svg width={20} height={20} viewBox="0 0 20 20" fill="none" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
        <path d="M3 12 11 4l5 5-8 8z" stroke="#222222" style={strokeStyle} strokeWidth={1.8} />
        <path d="M6.5 8.5l5 5" stroke="#222222" style={strokeStyle} strokeWidth={1.8} />
        <path d="M8 17h9" stroke="#222222" style={strokeStyle} strokeWidth={1.8} />
      </svg>
    </span>
  );
}

const ERASER_POPOVER_WIDTH = 236;

/** 지우개 설정 창(S-2): 크기 숫자 + 실제 크기 원 미리보기 + 슬라이더. */
export function EraserSettingsPopover({
  size,
  onChange,
  onClose,
  anchorRef,
  boundsRef,
}: {
  size: number;
  onChange: (next: number) => void;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  boundsRef: RefObject<HTMLElement | null>;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const layout = useAnchoredPopoverLayout(anchorRef, boundsRef, ERASER_POPOVER_WIDTH);

  // 바깥을 누르면 닫는다(지우개 모드는 유지). 지우개 아이콘 버튼은 직접 열고 닫으므로 제외.
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || rootRef.current?.contains(target) || target.closest("[data-eraser-toggle]")) {
        return;
      }
      onClose();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const clamp = (value: number) => Math.round(Math.min(BOARD_ERASER_MAX, Math.max(BOARD_ERASER_MIN, value)));
  const ratio = (size - BOARD_ERASER_MIN) / (BOARD_ERASER_MAX - BOARD_ERASER_MIN);

  const startDrag = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const track = event.currentTarget;
    track.focus();
    const update = (clientX: number) => {
      const rect = track.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      onChange(clamp(BOARD_ERASER_MIN + t * (BOARD_ERASER_MAX - BOARD_ERASER_MIN)));
    };
    update(event.clientX);
    const move = (ev: MouseEvent) => update(ev.clientX);
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const labelClass =
    "font-[family-name:var(--font-pretendard)] text-[11px] font-semibold tracking-[0.06em] text-[#9A9A9A]";

  return (
    <div
      ref={rootRef}
      data-board-chrome
      role="dialog"
      aria-label="지우개 설정"
      onMouseDown={(event) => event.stopPropagation()}
      className="absolute z-50 flex select-none flex-col rounded-[10px] bg-white shadow-[0_12px_32px_rgba(0,0,0,0.14),0_2px_6px_rgba(0,0,0,0.06)]"
      style={
        layout
          ? { left: layout.left, bottom: layout.bottom, width: layout.width }
          : { right: 96, bottom: 70, width: ERASER_POPOVER_WIDTH, visibility: "hidden" }
      }
    >
      <span
        aria-hidden
        className="absolute -bottom-[6px] h-3 w-3 rotate-45 bg-white"
        style={{ left: layout?.arrowLeft ?? ERASER_POPOVER_WIDTH - 36 }}
      />
      <div className="flex flex-col gap-2.5 p-4">
        <div className="flex items-center justify-between">
          <span className={labelClass}>지우개 크기</span>
          <span className="rounded-[4px] bg-[#F3F3F3] px-2 py-[3px] font-mono text-[12px] text-[#222222]">{size}px</span>
        </div>
        {/* 고른 크기 그대로의 원(캔버스 위 지우개 원과 같은 크기) */}
        <div className="flex h-[96px] items-center justify-center rounded-[6px] bg-[#F3F3F3]">
          <i
            aria-hidden
            className="block rounded-full border-[1.5px] border-[#222222] bg-white"
            style={{ width: size, height: size }}
          />
        </div>
        <div
          role="slider"
          tabIndex={0}
          aria-label="지우개 크기"
          aria-valuemin={BOARD_ERASER_MIN}
          aria-valuemax={BOARD_ERASER_MAX}
          aria-valuenow={size}
          onMouseDown={startDrag}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 8 : 2;
            if (event.key === "ArrowRight" || event.key === "ArrowUp") {
              event.preventDefault();
              onChange(clamp(size + step));
            } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
              event.preventDefault();
              onChange(clamp(size - step));
            }
          }}
          className="relative mx-1 my-2 h-4 cursor-pointer outline-none"
        >
          <span aria-hidden className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-[2px] bg-[#E5E5E5]" />
          <span
            aria-hidden
            className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-[2px] bg-[#222222]"
            style={{ width: `${ratio * 100}%` }}
          />
          <span
            aria-hidden
            className="absolute top-1/2 -ml-[7px] -mt-[7px] h-[14px] w-[14px] rounded-[3px] border-2 border-[#222222] bg-white"
            style={{ left: `${ratio * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function PenSettingsPopover({
  settings,
  onChange,
  onClose,
  anchorRef,
  boundsRef,
}: {
  settings: BoardPenSettings;
  onChange: (next: BoardPenSettings) => void;
  onClose: () => void;
  /** 펜 아이콘 버튼: 창의 말꼬리가 가리킬 곳 */
  anchorRef: RefObject<HTMLElement | null>;
  /** 캔버스 상자: 창이 이 안에서 잘리지 않게 위치·너비·높이를 맞춘다 */
  boundsRef: RefObject<HTMLElement | null>;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const layout = useAnchoredPopoverLayout(anchorRef, boundsRef, POPOVER_WIDTH);
  const [typeOpen, setTypeOpen] = useState(false);
  const [hsv, setHsv] = useState(() => hexToHsv(settings.color) ?? { h: 0, s: 0, v: 0.13 });
  const [hexDraft, setHexDraft] = useState(settings.color);

  // 바깥을 누르면 닫는다(펜 모드는 유지). 펜 아이콘 버튼은 직접 열고 닫으므로 제외.
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || rootRef.current?.contains(target) || target.closest("[data-pen-toggle]")) {
        return;
      }
      onClose();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const setColor = (hex: string, nextHsv?: { h: number; s: number; v: number }) => {
    const normalized = hex.toUpperCase();
    setHexDraft(normalized);
    if (nextHsv) {
      setHsv(nextHsv);
    } else {
      const parsed = hexToHsv(normalized);
      if (parsed) {
        // 무채색(채도 0)이면 색상 막대 위치는 그대로 둔다.
        setHsv((prev) => ({ h: parsed.s === 0 ? prev.h : parsed.h, s: parsed.s, v: parsed.v }));
      }
    }
    onChange({ ...settings, color: normalized });
  };

  const startDrag = (kind: "sv" | "hue", event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const zone = event.currentTarget;
    // 끄는 동안의 최신 색 위치(눌렀을 때 값에서 시작해 이벤트마다 갱신)
    let current = hsv;
    const update = (clientX: number, clientY: number) => {
      const rect = zone.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
      const next = kind === "sv" ? { ...current, s: x, v: 1 - y } : { ...current, h: x * 359.9 };
      current = next;
      const hex = hsvToHex(next.h, next.s, next.v);
      setHsv(next);
      setHexDraft(hex);
      onChange({ ...settings, color: hex });
    };
    update(event.clientX, event.clientY);
    const move = (ev: MouseEvent) => update(ev.clientX, ev.clientY);
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const currentType = BOARD_PEN_TYPES.find((type) => type.id === settings.type) ?? BOARD_PEN_TYPES[0]!;
  const previewMarkup = strokeToSvgMarkup(
    { id: "preview", type: settings.type, color: settings.color, size: settings.size, points: PREVIEW_POINTS },
    0,
    0,
  );
  const labelClass =
    "font-[family-name:var(--font-pretendard)] text-[11px] font-semibold tracking-[0.06em] text-[#9A9A9A]";

  return (
    <div
      ref={rootRef}
      data-board-chrome
      role="dialog"
      aria-label="펜 설정"
      onMouseDown={(event) => event.stopPropagation()}
      className="absolute z-50 flex select-none flex-col rounded-[10px] bg-white shadow-[0_12px_32px_rgba(0,0,0,0.14),0_2px_6px_rgba(0,0,0,0.06)]"
      style={
        layout
          ? { left: layout.left, bottom: layout.bottom, width: layout.width }
          : { right: 138, bottom: 70, width: POPOVER_WIDTH, visibility: "hidden" }
      }
    >
      {/* 말꼬리: 펜 아이콘을 가리킨다 */}
      <span
        aria-hidden
        className="absolute -bottom-[6px] h-3 w-3 rotate-45 bg-white"
        style={{ left: layout?.arrowLeft ?? POPOVER_WIDTH - 36 }}
      />
      {/* 캔버스가 낮으면 창 안쪽만 세로로 스크롤된다 */}
      <div
        className="flex min-h-0 flex-col gap-2.5 overflow-y-auto overscroll-contain p-4 [scrollbar-width:thin]"
        style={{ maxHeight: layout?.maxHeight }}
      >

      <div className="h-10 overflow-hidden rounded-[6px] bg-[#F3F3F3]">
        <svg viewBox="0 0 280 40" preserveAspectRatio="none" className="h-full w-full" aria-hidden>
          <defs dangerouslySetInnerHTML={{ __html: PENCIL_FILTER_SVG }} />
          <g dangerouslySetInnerHTML={{ __html: previewMarkup }} />
        </svg>
      </div>

      <span className={labelClass}>펜 종류</span>
      <div className="relative">
        <button
          type="button"
          onClick={() => setTypeOpen((prev) => !prev)}
          aria-expanded={typeOpen}
          className="flex h-[38px] w-full items-center gap-2.5 rounded-[6px] bg-[#F3F3F3] px-2.5 font-[family-name:var(--font-pretendard)] text-[13px] font-semibold text-[#222222]"
        >
          <PenTypeSample type={currentType.id} color="#222222" />
          <span>{currentType.label}</span>
          <svg
            width={10}
            height={6}
            viewBox="0 0 10 6"
            aria-hidden
            className={`ml-auto transition-transform ${typeOpen ? "rotate-180" : ""}`}
          >
            <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth={1.6} />
          </svg>
        </button>
        {typeOpen ? (
          <ul className="absolute inset-x-0 top-[calc(100%+4px)] z-10 m-0 list-none rounded-[6px] bg-white p-1 shadow-[0_10px_24px_rgba(0,0,0,0.16)]">
            {BOARD_PEN_TYPES.map((type) => {
              const on = type.id === settings.type;
              return (
                <li key={type.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange({ ...settings, type: type.id });
                      setTypeOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-[3px] px-2 py-[7px] text-left font-[family-name:var(--font-pretendard)] text-[13px] text-[#222222] ${
                      on ? "bg-[#F5F53D] font-semibold" : "hover:bg-[#F0F0F0]"
                    }`}
                  >
                    <PenTypeSample type={type.id} color="#222222" />
                    <span>{type.label}</span>
                    <i aria-hidden className={`ml-auto h-2 w-2 bg-[#222222] ${on ? "opacity-100" : "opacity-0"}`} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <span className={labelClass}>두께</span>
      <div className="flex items-center gap-1.5">
        {BOARD_PEN_SIZES.map((size) => (
          <button
            key={size}
            type="button"
            aria-label={`두께 ${size}`}
            aria-pressed={settings.size === size}
            onClick={() => onChange({ ...settings, size })}
            className={`flex h-8 w-8 items-center justify-center rounded-[6px] ${
              settings.size === size ? "bg-[#F5F53D]" : "bg-[#F3F3F3]"
            }`}
          >
            <i aria-hidden className="block bg-[#222222]" style={{ width: size + 2, height: size + 2 }} />
          </button>
        ))}
      </div>

      <span className={labelClass}>색상</span>
      <div className="flex flex-col gap-2">
        <div
          onMouseDown={(event) => startDrag("sv", event)}
          className="relative h-[120px] w-full cursor-crosshair rounded-[4px]"
          style={{
            backgroundColor: hsvToHex(hsv.h, 1, 1),
            backgroundImage: "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -ml-[7px] -mt-[7px] h-[14px] w-[14px] rounded-[2px] border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
            style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: settings.color }}
          />
        </div>
        <div
          onMouseDown={(event) => startDrag("hue", event)}
          className="relative h-3 cursor-pointer rounded-[3px]"
          style={{ background: "linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -top-[3px] -ml-1 h-4 w-2 rounded-[1px] border-2 border-[#222222] bg-white"
            style={{ left: `${(hsv.h / 360) * 100}%` }}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="h-7 w-7 shrink-0 rounded-[3px]" style={{ backgroundColor: settings.color }} />
          <input
            value={hexDraft}
            maxLength={7}
            aria-label="색상 코드"
            onChange={(event) => setHexDraft(event.target.value)}
            onBlur={() => {
              const value = hexDraft.startsWith("#") ? hexDraft : `#${hexDraft}`;
              if (SAFE_HEX.test(value)) {
                setColor(value);
              } else {
                setHexDraft(settings.color);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                (event.target as HTMLInputElement).blur();
              }
            }}
            className="h-7 min-w-0 flex-1 rounded-[4px] bg-[#F3F3F3] px-2 font-mono text-[12px] uppercase text-[#222222] outline-none"
          />
          <div className="flex gap-1">
            {BOARD_PEN_PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`색 ${color}`}
                onClick={() => setColor(color)}
                className={`h-[18px] w-[18px] rounded-[3px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)] ${
                  settings.color === color ? "outline outline-2 outline-offset-2 outline-[#222222]" : ""
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
