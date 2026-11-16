"use client";

import Link from "next/link";
import { useEffect, useState, type ButtonHTMLAttributes } from "react";

const PROFILE_ICON_MUTED = "rgba(132, 132, 132, 0.60)";

/**
 * 로고 마크 3×3(8px 칸)의 바깥 테두리 8칸, 좌상단부터 시계방향.
 * 라임 픽셀 6개가 이 정사각형 틀 위에 있고 우상단·좌하단 2칸이 비어 있다(가운데는 핑크 교집합).
 */
const LOGO_RING = [
  [0, 0],
  [8, 0],
  [16, 0],
  [16, 8],
  [16, 16],
  [8, 16],
  [0, 16],
  [0, 8],
] as const;
const LOGO_INITIAL_SLOTS = [0, 1, 3, 4, 5, 7];
/** 처음 빈칸(우상·좌하). 두 빈칸은 항상 번갈아 한 칸씩 반시계로 물러나 서로 마주 본 채 돈다. */
const LOGO_INITIAL_GAPS = [2, 6] as const;
/**
 * 다음 픽셀이 출발하는 간격. 한 칸 이동(LOGO_PIXEL_MOVE_MS)이 끝나기 전에 뒤 픽셀이 출발해
 * 앞 픽셀에 쫀득하게 따라붙는다.
 */
const LOGO_PIXEL_STEP_MS = 95;
const LOGO_PIXEL_MOVE_MS = 300;
/** 살짝 지나쳤다 제자리에 붙는 탄성 이징 */
const LOGO_PIXEL_EASING = "cubic-bezier(0.34, 1.32, 0.64, 1)";

type LogoPixelState = {
  slots: number[];
  /** 두 빈칸의 현재 위치. 빈칸마다 따로 추적해야 번갈아 채우는 순서가 꼬이지 않는다. */
  gaps: [number, number];
  step: number;
};

function isLogoAtRest(state: LogoPixelState): boolean {
  const gaps = [...state.gaps].sort((left, right) => left - right);
  return gaps[0] === LOGO_INITIAL_GAPS[0] && gaps[1] === LOGO_INITIAL_GAPS[1];
}

function advanceLogoPixels(state: LogoPixelState): LogoPixelState {
  const which = state.step % 2;
  const gap = state.gaps[which];
  const from = (gap + LOGO_RING.length - 1) % LOGO_RING.length;
  const gaps: [number, number] = which === 0 ? [from, state.gaps[1]] : [state.gaps[0], from];
  return {
    slots: state.slots.map((slot) => (slot === from ? gap : slot)),
    gaps,
    step: state.step + 1,
  };
}

/**
 * 호버 동안 로딩 표시처럼 움직인다: 빈칸 바로 뒤(반시계 쪽) 픽셀이 시계방향으로 한 칸 들어가고,
 * 두 빈칸을 번갈아 채우며 픽셀들이 틀을 따라 돈다. 이동은 항상 틀을 따라 상하좌우 한 칸.
 * 마우스를 떼면 바로 멈추지 않고, 원래 로고 모양이 되는 주기 끝까지 움직인 뒤 멈춘다.
 */
function useLogoPixelSlots(active: boolean): number[] {
  // 업데이트 함수가 두 번 불려도 결과가 같도록 진행 상황(빈칸 위치·순번)을 모두 상태에 둔다.
  const [state, setState] = useState<LogoPixelState>({
    slots: LOGO_INITIAL_SLOTS,
    gaps: [...LOGO_INITIAL_GAPS],
    step: 0,
  });
  const running = active || !isLogoAtRest(state);

  useEffect(() => {
    if (!running || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const timer = window.setInterval(() => {
      // 마우스를 뗀 뒤에는 빈칸이 처음 자리(우상·좌하)로 돌아와 원래 로고 모양이 완성될 때까지만 움직인다.
      setState((prev) => (!active && isLogoAtRest(prev) ? prev : advanceLogoPixels(prev)));
    }, LOGO_PIXEL_STEP_MS);
    return () => window.clearInterval(timer);
  }, [running, active]);

  return state.slots;
}

export function ProfileIconButton({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label="프로필"
      className={`flex h-8 w-8 shrink-0 flex-col items-center justify-end gap-[2px] rounded-[5px] bg-[var(--grey-H0,#F0F0F0)] pt-1 ${className}`}
      {...props}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={12}
        height={12}
        viewBox="0 0 12 12"
        fill="none"
        className="aspect-square shrink-0"
        aria-hidden
      >
        <circle cx="6" cy="6" r="6" fill="#848484" fillOpacity="0.6" />
      </svg>
      <span
        className="h-3 w-6 shrink-0 rounded-t-[8px]"
        style={{ backgroundColor: PROFILE_ICON_MUTED }}
        aria-hidden
      />
    </button>
  );
}

export function IdeaveLogoMark({
  className = "h-6 w-6 shrink-0",
  animating = false,
}: {
  className?: string;
  animating?: boolean;
}) {
  const slots = useLogoPixelSlots(animating);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      {slots.map((slot, index) => {
        const [x, y] = LOGO_RING[slot]!;
        return (
          <rect
            key={index}
            width="8"
            height="8"
            fill="#F5F53D"
            style={{
              transform: `translate(${x}px, ${y}px)`,
              transition: `transform ${LOGO_PIXEL_MOVE_MS}ms ${LOGO_PIXEL_EASING}`,
            }}
          />
        );
      })}
      <rect x="8" y="8" width="8" height="8" fill="#FF80FF" />
    </svg>
  );
}

export function IdeaveLogo({
  href = "/",
  theme = "dark",
  onHomeClick,
}: {
  href?: string;
  theme?: "dark" | "light";
  onHomeClick?: () => void;
}) {
  const isDark = theme === "dark";
  const [hovered, setHovered] = useState(false);
  const hoverHandlers = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    onFocus: () => setHovered(true),
    onBlur: () => setHovered(false),
  };
  const className = "flex shrink-0 cursor-pointer items-center gap-[8px] border-0 bg-transparent p-0";
  const label = (
    <span
      className={`font-[family-name:var(--font-pretendard)] text-[20px] font-bold leading-normal ${
        isDark ? "text-white" : "text-[#000000]"
      }`}
    >
      IDEAVE
    </span>
  );

  if (onHomeClick) {
    return (
      <button type="button" aria-label="홈" onClick={onHomeClick} className={className} {...hoverHandlers}>
        <IdeaveLogoMark animating={hovered} />
        {label}
      </button>
    );
  }

  return (
    <Link href={href} className={className} {...hoverHandlers}>
      <IdeaveLogoMark animating={hovered} />
      {label}
    </Link>
  );
}

/** 490×48 슬롯. 모서리 픽셀은 테두리 꼭짓점에 걸치도록 반쯤 바깥으로 */
const PROJECT_REGISTER_SLOT_CLASS =
  "relative flex h-12 w-[490px] max-w-full shrink-0 items-center justify-center gap-3 border-[1.5px] bg-transparent p-0 font-[family-name:var(--font-pretendard)] text-[15px] font-semibold leading-none text-white transition-colors focus-visible:outline-none";
const PROJECT_REGISTER_SLOT_CORNER_POSITIONS = [
  "-left-[5px] -top-[5px]",
  "-right-[5px] -top-[5px]",
  "-bottom-[5px] -left-[5px]",
  "-bottom-[5px] -right-[5px]",
] as const;

function ProjectRegisterSlotCorners() {
  return PROJECT_REGISTER_SLOT_CORNER_POSITIONS.map((position) => (
    <span key={position} aria-hidden className={`pointer-events-none absolute size-2 bg-[#F5F53D] ${position}`} />
  ));
}

export function ProjectRegisterTrigger({
  onClick,
  label = "프로젝트 등록하기",
  hasProject = false,
  projectName,
  projectGoal,
}: {
  onClick: () => void;
  label?: string;
  hasProject?: boolean;
  projectName?: string;
  projectGoal?: string;
}) {
  const name = projectName?.trim();
  const goal = projectGoal?.trim();

  if (!hasProject || !name) {
    // 등록 전: 캔버스 편집 레이아웃처럼 회색 점선 슬롯 + 라임 모서리 픽셀 + 가운데 문구.
    // 호버(키보드 포커스 포함) 시 점선만 흰색에 가깝게 밝아진다.
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${PROJECT_REGISTER_SLOT_CLASS} border-dashed border-[#6B6B6B] hover:border-[#E5E5E5] focus-visible:border-[#E5E5E5]`}
      >
        <ProjectRegisterSlotCorners />
        <span>{label}</span>
      </button>
    );
  }

  // 등록 후: 빈 점선 칸이 라임 실선 프레임으로 "채워진" 상태. 주제는 흰색, 무드는 연회색.
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${PROJECT_REGISTER_SLOT_CLASS} border-solid border-[#F5F53D] px-6`}
    >
      <ProjectRegisterSlotCorners />
      <span className="min-w-0 max-w-[48%] truncate" title={name}>
        {name}
      </span>
      {goal ? (
        <>
          <span aria-hidden className="shrink-0 font-normal text-[#5E5E5E]">
            |
          </span>
          <span className="min-w-0 max-w-[48%] truncate font-medium text-[#BDBDBD]" title={goal}>
            {goal}
          </span>
        </>
      ) : null}
    </button>
  );
}
