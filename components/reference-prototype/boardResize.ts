import { IDEAVE_DEFAULT_CURSOR } from "@/components/reference-prototype/ideaveCursor";

export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const MIN_BOARD_WIDTH = 90;
const MIN_BOARD_HEIGHT = 70;
const EDGE_HIT_PX = 8;

export function getResizeEdge(
  localX: number,
  localY: number,
  width: number,
  height: number,
  threshold = EDGE_HIT_PX,
): ResizeEdge | null {
  const onLeft = localX <= threshold;
  const onRight = localX >= width - threshold;
  const onTop = localY <= threshold;
  const onBottom = localY >= height - threshold;

  if (onTop && onLeft) {
    return "nw";
  }
  if (onTop && onRight) {
    return "ne";
  }
  if (onBottom && onLeft) {
    return "sw";
  }
  if (onBottom && onRight) {
    return "se";
  }
  if (onTop) {
    return "n";
  }
  if (onBottom) {
    return "s";
  }
  if (onLeft) {
    return "w";
  }
  if (onRight) {
    return "e";
  }

  return null;
}

const RESIZE_CURSOR_HOTSPOT = "12 12";

function boardResizeCursor(path: string, fallback: string) {
  return `url("${path}") ${RESIZE_CURSOR_HOTSPOT}, ${fallback}`;
}

export function cursorForResizeEdge(edge: ResizeEdge | null): string {
  if (!edge) {
    return IDEAVE_DEFAULT_CURSOR;
  }

  switch (edge) {
    case "n":
    case "s":
      return boardResizeCursor("/cursors/resize-ns.svg", "ns-resize");
    case "e":
    case "w":
      return boardResizeCursor("/cursors/resize-ew.svg", "ew-resize");
    case "ne":
    case "sw":
      return boardResizeCursor("/cursors/resize-nesw.svg", "nesw-resize");
    case "nw":
    case "se":
      return boardResizeCursor("/cursors/resize-nwse.svg", "nwse-resize");
    default:
      return "default";
  }
}

type BoardRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function clampSize(width: number, height: number) {
  const clampedWidth = Math.max(MIN_BOARD_WIDTH, width);
  const clampedHeight = Math.max(MIN_BOARD_HEIGHT, height);
  return { width: clampedWidth, height: clampedHeight };
}

function anchorAfterClamp(start: BoardRect, next: BoardRect, edge: ResizeEdge): BoardRect {
  let { x, y, width, height } = next;

  if (edge.includes("w")) {
    x = start.x + start.width - width;
  }
  if (edge.includes("n")) {
    y = start.y + start.height - height;
  }

  return {
    x: Math.max(0, x),
    y: Math.max(0, y),
    width,
    height,
  };
}

export function applyBoardResize(
  start: BoardRect,
  edge: ResizeEdge,
  deltaX: number,
  deltaY: number,
  lockAspect: boolean,
): BoardRect {
  if (!lockAspect) {
    let { x, y, width, height } = start;

    if (edge.includes("e")) {
      width = start.width + deltaX;
    }
    if (edge.includes("w")) {
      width = start.width - deltaX;
      x = start.x + deltaX;
    }
    if (edge.includes("s")) {
      height = start.height + deltaY;
    }
    if (edge.includes("n")) {
      height = start.height - deltaY;
      y = start.y + deltaY;
    }

    const clamped = clampSize(width, height);
    return anchorAfterClamp(start, { x, y, ...clamped }, edge);
  }

  const ratio = start.width / start.height;
  let width = start.width;
  let height = start.height;

  switch (edge) {
    case "se":
      width = start.width + deltaX;
      height = width / ratio;
      break;
    case "e":
      width = start.width + deltaX;
      height = width / ratio;
      break;
    case "s":
      height = start.height + deltaY;
      width = height * ratio;
      break;
    case "sw":
      width = start.width - deltaX;
      height = width / ratio;
      break;
    case "w":
      width = start.width - deltaX;
      height = width / ratio;
      break;
    case "nw":
      width = start.width - deltaX;
      height = width / ratio;
      break;
    case "ne":
      width = start.width + deltaX;
      height = width / ratio;
      break;
    case "n":
      height = start.height - deltaY;
      width = height * ratio;
      break;
    default:
      break;
  }

  const clamped = clampSize(width, height);
  return anchorAfterClamp(start, { x: start.x, y: start.y, ...clamped }, edge);
}
