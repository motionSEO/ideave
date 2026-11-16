"use client";

import {
  memo,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";
import {
  applyBoardResize,
  cursorForResizeEdge,
  getResizeEdge,
  type ResizeEdge,
} from "@/components/reference-prototype/boardResize";
import { IDEAVE_DEFAULT_CURSOR } from "@/components/reference-prototype/ideaveCursor";

export type BoardCanvasItem = {
  id: string;
  refId: string;
  type: "image" | "text";
  shade?: string;
  imageUrl?: string;
  text?: string;
  textCategory?: "keyword" | "movement" | "style" | "artist";
  lockAspectRatio?: boolean;
  baseWidth?: number;
  baseHeight?: number;
  initialFontSize?: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type BoardCanvasCardProps = {
  item: BoardCanvasItem;
  canvasRef: RefObject<HTMLDivElement | null>;
  viewScaleRef: RefObject<number>;
  viewPanRef: RefObject<{ x: number; y: number }>;
  selected: boolean;
  onSelect: (id: string, options?: { keepGroup?: boolean }) => void;
  onMove: (id: string, x: number, y: number, options?: { moveGroup?: boolean }) => void;
  onResize: (
    id: string,
    patch: Pick<BoardCanvasItem, "x" | "y" | "width" | "height">,
    origin: Pick<BoardCanvasItem, "x" | "y" | "width" | "height">,
    edge: ResizeEdge,
    deltaX: number,
    deltaY: number,
  ) => void;
  onGestureEnd?: () => void;
  onTextChange: (id: string, text: string) => void;
  onOpenImage?: (item: BoardCanvasItem) => void;
};

const DRAG_THRESHOLD_PX = 4;

function BoardCanvasCardInner({
  item,
  canvasRef,
  viewScaleRef,
  viewPanRef,
  selected,
  onSelect,
  onMove,
  onResize,
  onGestureEnd,
  onTextChange,
  onOpenImage,
}: BoardCanvasCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const hoverEdgeRef = useRef<ResizeEdge | null>(null);
  const [hoverEdge, setHoverEdge] = useState<ResizeEdge | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const suppressClickRef = useRef(false);
  const lockAspect = item.lockAspectRatio ?? true;

  const showActiveOutline = isHovered || selected;
  const textBaseFontSize = item.initialFontSize ?? 18;
  const scaleFontSize = textBaseFontSize;

  useEffect(() => {
    if (!selected && isEditing) {
      setIsEditing(false);
    }
  }, [selected, isEditing]);

  useEffect(() => {
    if (isEditing) {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }
  }, [isEditing]);

  const updateHoverEdge = (event: MouseEvent<HTMLDivElement>) => {
    if (isResizing || isEditing || !cardRef.current) {
      if (hoverEdgeRef.current !== null) {
        hoverEdgeRef.current = null;
        setHoverEdge(null);
      }
      return;
    }

    const rect = cardRef.current.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const next = getResizeEdge(localX, localY, rect.width, rect.height);
    if (next === hoverEdgeRef.current) {
      return;
    }
    hoverEdgeRef.current = next;
    setHoverEdge(next);
  };

  const startResize = (event: MouseEvent<HTMLDivElement>, edge: ResizeEdge) => {
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = true;

    const startX = event.clientX;
    const startY = event.clientY;
    const startItem = {
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
    };

    setIsResizing(true);
    hoverEdgeRef.current = edge;
    setHoverEdge(edge);
    onSelect(item.id, { keepGroup: true });

    const onMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const scale = viewScaleRef.current || 1;
      const deltaX = (moveEvent.clientX - startX) / scale;
      const deltaY = (moveEvent.clientY - startY) / scale;
      const next = applyBoardResize(startItem, edge, deltaX, deltaY, lockAspect);
      onResize(item.id, next, startItem, edge, deltaX, deltaY);
    };

    const onMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      onGestureEnd?.();
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const startDrag = (event: MouseEvent<HTMLDivElement>) => {
    if (hoverEdgeRef.current || isResizing || isEditing || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const pan = viewPanRef.current;
    const scale = viewScaleRef.current || 1;
    const offsetX = (event.clientX - canvasRect.left - pan.x) / scale - item.x;
    const offsetY = (event.clientY - canvasRect.top - pan.y) / scale - item.y;
    const moveWithGroup = selected;
    let dragging = false;

    const onMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const dx = moveEvent.clientX - startClientX;
      const dy = moveEvent.clientY - startClientY;

      if (!dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
          return;
        }
        dragging = true;
        suppressClickRef.current = true;
        onSelect(item.id, { keepGroup: moveWithGroup });
      }

      const currentPan = viewPanRef.current;
      const currentScale = viewScaleRef.current || 1;
      onMove(
        item.id,
        (moveEvent.clientX - canvasRect.left - currentPan.x) / currentScale - offsetX,
        (moveEvent.clientY - canvasRect.top - currentPan.y) / currentScale - offsetY,
        { moveGroup: moveWithGroup },
      );
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (dragging) {
        onGestureEnd?.();
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current || isEditing) {
      return;
    }

    const rect = cardRef.current.getBoundingClientRect();
    const edge = getResizeEdge(
      event.clientX - rect.left,
      event.clientY - rect.top,
      rect.width,
      rect.height,
    );

    if (edge) {
      startResize(event, edge);
      return;
    }

    startDrag(event);
  };

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();

    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    if (isEditing) {
      return;
    }

    onSelect(item.id);
  };

  const handleDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault();

    if (item.type === "image") {
      onOpenImage?.(item);
      return;
    }

    onSelect(item.id);
    setIsEditing(true);
  };

  const borderClass = showActiveOutline
    ? "border-2 border-[var(--lime-green,#F5F53D)]"
    : item.type === "text"
      ? "border-2 border-[var(--silver,#E5E5E5)]"
      : "border-0";

  const cardClass =
    item.type === "image"
      ? `absolute overflow-hidden rounded-none bg-white shadow ${borderClass}`
      : `absolute overflow-hidden rounded-none bg-[var(--white-text,#FFF)] shadow ${borderClass}`;

  return (
    <div
      ref={cardRef}
      data-board-card
      data-board-item-id={item.id}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseMove={updateHoverEdge}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        if (!isResizing) {
          hoverEdgeRef.current = null;
          setHoverEdge(null);
        }
      }}
      className={`pointer-events-auto ${cardClass}`}
      style={{
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height,
        zIndex: selected || isEditing ? 20 : 10,
        cursor: hoverEdge ? cursorForResizeEdge(hoverEdge) : isEditing ? "text" : IDEAVE_DEFAULT_CURSOR,
        boxSizing: "border-box",
        contain: "layout style paint",
        willChange: selected || isResizing ? "left, top, width, height" : undefined,
      }}
    >
      {item.type === "image" ? (
        item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt=""
            draggable={false}
            className="pointer-events-none h-full w-full rounded-none object-cover"
          />
        ) : (
          <div
            className="h-full w-full rounded-none"
            style={{ backgroundColor: item.shade ?? "#d3d3d0" }}
          />
        )
      ) : isEditing ? (
        <textarea
          ref={textareaRef}
          value={item.text ?? ""}
          onChange={(event) => onTextChange(item.id, event.target.value)}
          onBlur={() => setIsEditing(false)}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          className="box-border h-full w-full resize-none rounded-none border-0 bg-transparent p-2 font-[family-name:var(--font-pretendard)] font-medium leading-normal text-[#222222] outline-none"
          style={{
            fontSize: `${scaleFontSize}px`,
            whiteSpace: "pre-wrap",
            wordBreak: "keep-all",
            overflowWrap: "break-word",
            writingMode: "horizontal-tb",
          }}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center whitespace-pre-wrap p-2 text-center font-[family-name:var(--font-pretendard)] font-medium leading-normal text-[#222222]"
          style={{
            fontSize: `${scaleFontSize}px`,
            wordBreak: "keep-all",
            overflowWrap: "break-word",
            writingMode: "horizontal-tb",
          }}
        >
          {item.text ?? ""}
        </div>
      )}
    </div>
  );
}

export const BoardCanvasCard = memo(BoardCanvasCardInner);
