"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  BOARD_PEN_PRESET_COLORS,
  BOARD_PEN_SIZES,
  BOARD_PEN_TYPES,
  PENCIL_FILTER_SVG,
  hexToHsv,
  hsvToHex,
  strokeToSvgMarkup,
  type BoardPenSettings,
  type BoardPenType,
  type BoardStroke,
} from "@/components/reference-prototype/boardPen";

const SAFE_HEX = /^#[0-9a-f]{6}$/i;

/** 저장된 획을 다시 그릴 때 색 값이 #RRGGBB가 아니면 기본 검정으로(세션 저장값을 그대로 마크업에 넣으므로). */
function safeStroke(stroke: BoardStroke): BoardStroke {
  return SAFE_HEX.test(stroke.color) ? stroke : { ...stroke, color: "#222222" };
}

/** 캔버스 월드 위에 얹는 획 레이어. 그리는 중인 획은 livePathRef에 직접 그려 React 재렌더 없이 따라간다. */
export function BoardStrokeLayer({
  strokes,
  width,
  height,
  livePathRef,
}: {
  strokes: BoardStroke[];
  width: number;
  height: number;
  livePathRef: RefObject<SVGPathElement | null>;
}) {
  const markup = strokes.map((stroke) => strokeToSvgMarkup(safeStroke(stroke), 0, 0)).join("");
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 z-[2]"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      <defs dangerouslySetInnerHTML={{ __html: PENCIL_FILTER_SVG }} />
      <g dangerouslySetInnerHTML={{ __html: markup }} />
      <path ref={livePathRef} fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ display: "none" }} />
    </svg>
  );
}

export function PenIcon({ active, color }: { active: boolean; color: string }) {
  return (
    <span
      className={`relative flex h-8 w-8 items-center justify-center rounded-[4px] transition-colors ${
        active ? "bg-[#222222]" : "bg-transparent"
      }`}
    >
      <svg width={20} height={20} viewBox="0 0 20 20" fill="none" aria-hidden>
        <path
          d="M13.5 3.5l3 3L7 16l-4 1 1-4 9.5-9.5z"
          stroke={active ? "#F5F53D" : "#222222"}
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
        <path d="M11.5 5.5l3 3" stroke={active ? "#F5F53D" : "#222222"} strokeWidth={1.6} />
      </svg>
      {active ? (
        <span
          aria-hidden
          className="absolute bottom-[3px] right-[3px] h-[7px] w-[7px] border-[1.5px] border-white"
          style={{ backgroundColor: color }}
        />
      ) : null}
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
export function PenSettingsPopover({
  settings,
  onChange,
  onClose,
  style,
}: {
  settings: BoardPenSettings;
  onChange: (next: BoardPenSettings) => void;
  onClose: () => void;
  style?: React.CSSProperties;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
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
      className="absolute z-50 flex w-[276px] select-none flex-col gap-2.5 rounded-[10px] bg-white p-4 shadow-[0_12px_32px_rgba(0,0,0,0.14),0_2px_6px_rgba(0,0,0,0.06)]"
      style={style}
    >
      {/* 말꼬리: 펜 아이콘을 가리킨다 */}
      <span aria-hidden className="absolute -bottom-[6px] right-[30px] h-3 w-3 rotate-45 bg-white" />

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
  );
}
