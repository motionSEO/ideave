"use client";

import { useEffect, useRef, useState } from "react";
import { ProfileIconButton } from "@/components/reference-prototype/IdeaveLogo";

// 픽셀 꺾쇠 ⌄ 의 다섯 칸(2px 단위). 메뉴를 열면 각 칸이 위아래로 자리를 바꿔 ⌃ 가 된다.
const CHEVRON_X = [0, 2, 4, 6, 8];
const CHEVRON_Y_CLOSED = [0, 2, 4, 2, 0];
const CHEVRON_Y_OPEN = [4, 2, 0, 2, 4];

function PixelChevron({ open }: { open: boolean }) {
  const ys = open ? CHEVRON_Y_OPEN : CHEVRON_Y_CLOSED;
  return (
    <svg width={14} height={8.4} viewBox="0 0 10 6" fill="#FFFFFF" shapeRendering="crispEdges" aria-hidden>
      {CHEVRON_X.map((x, index) => (
        <rect
          key={x}
          x={x}
          width={2}
          height={2}
          style={{ y: ys[index], transition: "y 220ms cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
      ))}
    </svg>
  );
}

/** 헤더 오른쪽: 프로필 아이콘 + 픽셀 꺾쇠 드롭다운(만들기). */
type ThemeMode = "light" | "dark";

function readTheme(): ThemeMode {
  if (typeof document === "undefined") {
    return "light";
  }
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function writeTheme(next: ThemeMode) {
  const root = document.documentElement;
  if (next === "dark") {
    root.setAttribute("data-theme", "dark");
  } else {
    root.removeAttribute("data-theme");
  }
  try {
    window.localStorage.setItem("ideave.theme", next);
  } catch {
    // 저장 불가 — 이번 방문 동안만 유지
  }
}

export function ProfileMenu({ onCreate }: { onCreate: () => void }) {
  const [open, setOpen] = useState(false);
  // 화면 모드: <html data-theme>에 반영하고 브라우저에 기억한다(layout의 스크립트가 다음 방문 때 먼저 적용).
  const [theme, setTheme] = useState<ThemeMode>(readTheme);
  const applyTheme = (next: ThemeMode) => {
    setTheme(next);
    writeTheme(next);
  };
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex shrink-0 items-center gap-2">
      <ProfileIconButton onClick={() => setOpen((prev) => !prev)} />
      <button
        type="button"
        aria-label="메뉴"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-8 w-6 items-center justify-center rounded-[4px] transition-colors hover:bg-[#333333]"
      >
        <PixelChevron open={open} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-[60] w-[200px] rounded-[10px] bg-white p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.16),0_2px_6px_rgba(0,0,0,0.06)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onCreate();
            }}
            className="flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-[9px] text-left font-[family-name:var(--font-pretendard)] text-[13px] font-medium text-[#222222] transition-colors hover:bg-[#F3F3F3]"
          >
            <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M8 2v12M2 8h12" stroke="#222222" strokeWidth={1.6} />
            </svg>
            만들기
            <span className="ml-auto text-[11px] font-normal text-[#9A9A9A]">레퍼런스 업로드</span>
          </button>
          <hr className="mx-0.5 my-1 border-0 border-t border-[#E5E5E5]" />
          <p className="px-2.5 pb-1 pt-1.5 font-[family-name:var(--font-pretendard)] text-[11px] font-semibold tracking-[0.06em] text-[#9A9A9A]">
            화면 모드
          </p>
          <div className="flex gap-1 px-1 pb-1">
            {(
              [
                { id: "light", label: "화이트" },
                { id: "dark", label: "다크" },
              ] as const
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                role="menuitemradio"
                aria-checked={theme === mode.id}
                onClick={() => applyTheme(mode.id)}
                className={`flex flex-1 items-center justify-center rounded-[6px] px-1.5 py-2 font-[family-name:var(--font-pretendard)] text-[12px] font-medium ${
                  theme === mode.id ? "bg-[#F5F53D] text-[#222222]" : "bg-[#F3F3F3] text-[#222222]"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
