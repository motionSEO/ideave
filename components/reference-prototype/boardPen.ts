// 캔버스 펜 툴: 획 데이터와 그리기(화면 SVG·내보내기 canvas/SVG) 공용 로직.
// 획 좌표는 캔버스 월드 좌표(CANVAS_WIDTH×CANVAS_HEIGHT)라 확대·이동과 함께 움직인다.

export type BoardPenType = "pen" | "fountain" | "pencil" | "dash";

export type BoardStroke = {
  id: string;
  type: BoardPenType;
  color: string;
  /** 월드 좌표 기준 굵기(px) */
  size: number;
  /** [x, y] 쌍 */
  points: Array<[number, number]>;
};

export type BoardPenSettings = {
  type: BoardPenType;
  color: string;
  size: number;
};

export const BOARD_PEN_TYPES: Array<{ id: BoardPenType; label: string }> = [
  { id: "pen", label: "일반 펜" },
  { id: "fountain", label: "만년필" },
  { id: "pencil", label: "연필" },
  { id: "dash", label: "점선" },
];

/** 두께 4단계(월드 px) */
export const BOARD_PEN_SIZES = [2, 4, 8, 14];

/** 색 팔레트 옆 브랜드 색 바로가기 */
export const BOARD_PEN_PRESET_COLORS = ["#222222", "#F5F53D", "#FF80FF", "#FFFFFF"];

export const DEFAULT_BOARD_PEN: BoardPenSettings = { type: "pen", color: "#222222", size: 4 };

/** 만년필: 45° 펜촉을 흉내 내려고 같은 획을 대각선으로 조금씩 밀어 겹친다. 굵기에 따라 겹치는 수. */
export function fountainOffsets(size: number): number[] {
  const steps = Math.max(3, Math.round(size * 1.6));
  return Array.from({ length: steps + 1 }, (_, k) => (k - steps / 2) * 0.7);
}

/** 점선: 둥근 끝 + 거의 0 길이 선분 → 점이 일정 간격으로 찍힌다. */
export function dashPattern(size: number): [number, number] {
  return [0.1, size * 2.4 + 4];
}

/** 점 목록을 부드러운 SVG 경로로(중점 사이 2차 곡선). */
export function strokePathD(points: Array<[number, number]>): string {
  if (points.length === 0) {
    return "";
  }
  const [x0, y0] = points[0]!;
  if (points.length === 1) {
    // 클릭 한 번: 아주 짧은 선으로 점을 찍는다.
    return `M${x0} ${y0} L${x0 + 0.01} ${y0}`;
  }
  let d = `M${x0} ${y0}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[i + 1]!;
    d += ` Q${x1} ${y1} ${(x1 + x2) / 2} ${(y1 + y2) / 2}`;
  }
  const [xl, yl] = points[points.length - 1]!;
  d += ` L${xl} ${yl}`;
  return d;
}

export function strokeBounds(stroke: BoardStroke): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const pad = stroke.size * 1.5 + 4;
  for (const [x, y] of stroke.points) {
    minX = Math.min(minX, x - pad);
    minY = Math.min(minY, y - pad);
    maxX = Math.max(maxX, x + pad);
    maxY = Math.max(maxY, y + pad);
  }
  return { minX, minY, maxX, maxY };
}

/** 내보내기용 SVG 조각(offset만큼 옮겨서). 연필 질감 필터는 id="ideave-pencil"을 쓴다. */
export function strokeToSvgMarkup(stroke: BoardStroke, offsetX: number, offsetY: number): string {
  const moved = stroke.points.map(([x, y]) => [x - offsetX, y - offsetY] as [number, number]);
  const d = strokePathD(moved);
  const color = stroke.color;
  if (stroke.type === "fountain") {
    return fountainOffsets(stroke.size)
      .map(
        (o) =>
          `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" transform="translate(${o} ${-o})"/>`,
      )
      .join("");
  }
  if (stroke.type === "dash") {
    const [dash, gap] = dashPattern(stroke.size);
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${stroke.size}" stroke-linecap="round" stroke-dasharray="${dash} ${gap}"/>`;
  }
  if (stroke.type === "pencil") {
    return `<path d="${d}" fill="none" stroke="${color}" stroke-opacity="0.75" stroke-width="${Math.max(1, stroke.size * 0.8)}" stroke-linecap="round" stroke-linejoin="round" filter="url(#ideave-pencil)"/>`;
  }
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${stroke.size}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

export const PENCIL_FILTER_SVG =
  '<filter id="ideave-pencil" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="1" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.5"/></filter>';

/** 내보내기용 canvas에 획 하나를 그린다. */
export function drawStrokeOnCanvas(ctx: CanvasRenderingContext2D, stroke: BoardStroke, offsetX: number, offsetY: number) {
  const path = new Path2D(strokePathD(stroke.points.map(([x, y]) => [x - offsetX, y - offsetY] as [number, number])));
  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (stroke.type === "fountain") {
    ctx.lineWidth = 1.3;
    for (const o of fountainOffsets(stroke.size)) {
      ctx.save();
      ctx.translate(o, -o);
      ctx.stroke(path);
      ctx.restore();
    }
  } else if (stroke.type === "dash") {
    ctx.lineWidth = stroke.size;
    ctx.setLineDash(dashPattern(stroke.size));
    ctx.stroke(path);
  } else if (stroke.type === "pencil") {
    // canvas에는 SVG 필터가 없으니, 살짝 어긋난 옅은 선을 몇 번 겹쳐 연필 느낌을 낸다.
    ctx.lineWidth = Math.max(1, stroke.size * 0.6);
    ctx.globalAlpha = 0.35;
    for (const [dx, dy] of [[0, 0], [0.6, -0.4], [-0.5, 0.5]] as const) {
      ctx.save();
      ctx.translate(dx, dy);
      ctx.stroke(path);
      ctx.restore();
    }
  } else {
    ctx.lineWidth = stroke.size;
    ctx.stroke(path);
  }
  ctx.restore();
}

/** 선분이 사각형(경계 포함)을 지나가는지: 끝점이 안에 있거나, 사각형 네 변 중 하나와 교차하면 참. */
function segmentHitsRect(ax: number, ay: number, bx: number, by: number, x0: number, y0: number, x1: number, y1: number): boolean {
  const inside = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  if (inside(ax, ay) || inside(bx, by)) {
    return true;
  }
  const cross = (px: number, py: number, qx: number, qy: number, rx: number, ry: number, sx: number, sy: number) => {
    const d = (qx - px) * (sy - ry) - (qy - py) * (sx - rx);
    if (d === 0) {
      return false;
    }
    const t = ((rx - px) * (sy - ry) - (ry - py) * (sx - rx)) / d;
    const u = ((rx - px) * (qy - py) - (ry - py) * (qx - px)) / d;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  };
  return (
    cross(ax, ay, bx, by, x0, y0, x1, y0) ||
    cross(ax, ay, bx, by, x1, y0, x1, y1) ||
    cross(ax, ay, bx, by, x0, y1, x1, y1) ||
    cross(ax, ay, bx, by, x0, y0, x0, y1)
  );
}

/** 끌어서 만든 선택 사각형(월드 좌표)에 획의 어느 부분이라도 걸리면 선택한다(굵기만큼 여유). */
export function strokeHitsRect(stroke: BoardStroke, x: number, y: number, w: number, h: number): boolean {
  const pad = stroke.size / 2;
  const x0 = x - pad;
  const y0 = y - pad;
  const x1 = x + w + pad;
  const y1 = y + h + pad;
  const pts = stroke.points;
  if (pts.length === 1) {
    const [px, py] = pts[0]!;
    return px >= x0 && px <= x1 && py >= y0 && py <= y1;
  }
  for (let i = 1; i < pts.length; i += 1) {
    const [ax, ay] = pts[i - 1]!;
    const [bx, by] = pts[i]!;
    if (segmentHitsRect(ax, ay, bx, by, x0, y0, x1, y1)) {
      return true;
    }
  }
  return false;
}

export function isBoardStroke(value: unknown): value is BoardStroke {
  if (!value || typeof value !== "object") {
    return false;
  }
  const stroke = value as Partial<BoardStroke>;
  return (
    typeof stroke.id === "string" &&
    typeof stroke.color === "string" &&
    typeof stroke.size === "number" &&
    Array.isArray(stroke.points) &&
    BOARD_PEN_TYPES.some((type) => type.id === stroke.type)
  );
}

// ── 색 변환(사각형 색상 팔레트용) ──
export function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return `#${[f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export function hexToHsv(hex: string): { h: number; s: number; v: number } | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) {
    return null;
  }
  const n = parseInt(match[1]!, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  }
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}
