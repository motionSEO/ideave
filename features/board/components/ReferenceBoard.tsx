"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TAGS } from "@/components/reference-prototype/data";

type BoardImageCard = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shade: string;
  tags: string[];
};

const MIN_BAND_PX = 4;

function intersectsRects(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function pickMockTags(seed: number): string[] {
  const a = TAGS[seed % TAGS.length];
  const b = TAGS[(seed + 3) % TAGS.length];
  const c = TAGS[(seed + 6) % TAGS.length];
  return Array.from(new Set([a, b, c]));
}

const MOCK_SHADES = ["#d3d3d0", "#dededb", "#c1c1bd", "#c9c9c6", "#d8d8d5", "#eeeeeb"];

export function ReferenceBoard() {
  const [cards, setCards] = useState<BoardImageCard[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [rubber, setRubber] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );
  const [keywords, setKeywords] = useState<string[] | null>(null);
  const [keywordLoading, setKeywordLoading] = useState(false);
  const [keywordCount, setKeywordCount] = useState(1);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const cardsRef = useRef<BoardImageCard[]>(cards);
  cardsRef.current = cards;

  const dragRef = useRef<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const bandStartRef = useRef<{ sx: number; sy: number } | null>(null);

  const keywordFetchKey = useMemo(() => {
    const ids = [...selectedIds].sort();
    if (ids.length === 0) {
      return "";
    }

    const tagsPart = ids
      .map((id) => {
        const c = cards.find((x) => x.id === id);
        return c ? [...c.tags].sort().join("\x1f") : "";
      })
      .join("\x1e");

    return `${ids.join(",")}|${tagsPart}`;
  }, [selectedIds, cards]);

  const selectionBounds = useMemo(() => {
    if (selectedIds.size === 0) {
      return null;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const card of cards) {
      if (!selectedIds.has(card.id)) {
        continue;
      }
      minX = Math.min(minX, card.x);
      minY = Math.min(minY, card.y);
      maxX = Math.max(maxX, card.x + card.width);
      maxY = Math.max(maxY, card.y + card.height);
    }

    if (minX === Infinity) {
      return null;
    }

    return { minX, minY, maxX, maxY };
  }, [cards, selectedIds]);

  const clientToBoard = useCallback((clientX: number, clientY: number) => {
    const el = canvasRef.current;
    if (!el) {
      return { x: 0, y: 0 };
    }

    const r = el.getBoundingClientRect();
    return {
      x: clientX - r.left + el.scrollLeft,
      y: clientY - r.top + el.scrollTop,
    };
  }, []);

  const addItem = () => {
    const index = cards.length;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `card-${Date.now()}-${index}`;

    setCards((prev) => [
      ...prev,
      {
        id,
        shade: MOCK_SHADES[index % MOCK_SHADES.length],
        tags: pickMockTags(index),
        x: 32 + (index % 5) * 28,
        y: 36 + Math.floor(index / 5) * 100,
        width: 120,
        height: 90,
      },
    ]);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedIds(new Set());
        setRubber(null);
        bandStartRef.current = null;
        setKeywords(null);
        setKeywordLoading(false);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!keywordFetchKey) {
      setKeywords(null);
      setKeywordLoading(false);
      return;
    }

    const pipe = keywordFetchKey.indexOf("|");
    const ids =
      pipe === -1 ? [] : keywordFetchKey.slice(0, pipe).split(",").filter(Boolean);
    const itemGroups = ids
      .map((id) => cardsRef.current.find((c) => c.id === id)?.tags ?? [])
      .filter((group) => group.some((t) => t.trim().length > 0));

    if (itemGroups.length === 0) {
      setKeywords(null);
      setKeywordLoading(false);
      return;
    }

    const boardKeywordItems = itemGroups.map((signals) => ({
      kind: "image" as const,
      signals,
    }));

    const controller = new AbortController();

    const run = async () => {
      setKeywordLoading(true);
      try {
        const response = await fetch("/api/board/common-keyword", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: boardKeywordItems,
            count: Math.min(5, Math.max(1, keywordCount)),
          }),
          signal: controller.signal,
        });

        const payload = (await response.json()) as { keywords?: unknown; keyword?: string };

        if (controller.signal.aborted) {
          return;
        }

        let words: string[] = [];
        if (Array.isArray(payload.keywords)) {
          words = payload.keywords.filter((entry): entry is string => typeof entry === "string");
        }
        words = [...new Set(words.map((w) => w.trim()).filter(Boolean))];
        if (words.length === 0 && typeof payload.keyword === "string" && payload.keyword.trim()) {
          words = [payload.keyword.trim()];
        }
        setKeywords(words.length > 0 ? words : null);
      } catch (error) {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        setKeywords(null);
      } finally {
        if (!controller.signal.aborted) {
          setKeywordLoading(false);
        }
      }
    };

    void run();
    return () => controller.abort();
  }, [keywordFetchKey, keywordCount]);

  const onSurfaceMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) {
      return;
    }

    e.preventDefault();
    const p = clientToBoard(e.clientX, e.clientY);
    bandStartRef.current = { sx: p.x, sy: p.y };
    setRubber({ x: p.x, y: p.y, w: 0, h: 0 });

    const move = (ev: MouseEvent) => {
      const start = bandStartRef.current;
      if (!start) {
        return;
      }

      const cur = clientToBoard(ev.clientX, ev.clientY);
      const x1 = Math.min(start.sx, cur.x);
      const y1 = Math.min(start.sy, cur.y);
      const w = Math.abs(cur.x - start.sx);
      const h = Math.abs(cur.y - start.sy);
      setRubber({ x: x1, y: y1, w, h });
    };

    const up = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);

      const start = bandStartRef.current;
      bandStartRef.current = null;

      const cur = clientToBoard(ev.clientX, ev.clientY);

      if (!start) {
        setRubber(null);
        return;
      }

      const x1 = Math.min(start.sx, cur.x);
      const y1 = Math.min(start.sy, cur.y);
      const w = Math.abs(cur.x - start.sx);
      const h = Math.abs(cur.y - start.sy);

      setRubber(null);

      if (w < MIN_BAND_PX || h < MIN_BAND_PX) {
        setSelectedIds(new Set());
        return;
      }

      const next = new Set<string>();
      for (const c of cardsRef.current) {
        if (intersectsRects(x1, y1, w, h, c.x, c.y, c.width, c.height)) {
          next.add(c.id);
        }
      }

      setSelectedIds(next);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const onCardMouseDown = (e: React.MouseEvent, id: string) => {
    if (e.button !== 0) {
      return;
    }

    e.stopPropagation();
    const card = cardsRef.current.find((c) => c.id === id);
    if (!card) {
      return;
    }

    const p = clientToBoard(e.clientX, e.clientY);
    dragRef.current = {
      id,
      offsetX: p.x - card.x,
      offsetY: p.y - card.y,
    };

    const move = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) {
        return;
      }

      const cur = clientToBoard(ev.clientX, ev.clientY);
      setCards((prev) =>
        prev.map((c) =>
          c.id === d.id
            ? {
                ...c,
                x: Math.max(0, cur.x - d.offsetX),
                y: Math.max(0, cur.y - d.offsetY),
              }
            : c,
        ),
      );
    };

    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      dragRef.current = null;
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const showBubble =
    selectionBounds !== null &&
    selectedIds.size > 0 &&
    (keywordLoading || Boolean(keywords && keywords.length > 0));

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Reference Board</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            빈 곳에서 드래그해 영역 선택 · 아래 슬라이더로 공통 키워드 개수(1–5) 선택 · Gemini 제안 · Esc로
            해제.
          </p>
        </div>
        <button
          type="button"
          onClick={addItem}
          className="shrink-0 rounded-md border border-zinc-300 px-3 py-1 text-sm dark:border-zinc-700 dark:text-zinc-100"
        >
          Add Mock Card
        </button>
      </header>

      <div
        ref={canvasRef}
        className="relative min-h-[520px] select-none rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div
          data-board-surface
          aria-hidden
          className="absolute inset-0 z-0 rounded-[inherit] bg-[linear-gradient(#e4e4e2_1px,transparent_1px),linear-gradient(90deg,#e4e4e2_1px,transparent_1px)] bg-[length:28px_28px] dark:bg-[linear-gradient(#3f3f46_1px,transparent_1px),linear-gradient(90deg,#3f3f46_1px,transparent_1px)]"
          onMouseDown={onSurfaceMouseDown}
        />

        {rubber && rubber.w >= 1 && rubber.h >= 1 ? (
          <div
            className="pointer-events-none absolute z-[5] rounded border-2 border-sky-500 bg-sky-400/15 dark:bg-sky-400/25"
            style={{
              left: rubber.x,
              top: rubber.y,
              width: rubber.w,
              height: rubber.h,
            }}
          />
        ) : null}

        {showBubble && selectionBounds ? (
          <div
            className="pointer-events-none absolute z-[25]"
            style={{
              left: (selectionBounds.minX + selectionBounds.maxX) / 2,
              top: selectionBounds.minY - 10,
              transform: "translate(-50%, -100%)",
            }}
          >
            <div className="relative max-w-[min(92vw,380px)] cursor-default rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-lg pointer-events-auto dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50">
              {keywordLoading ? (
                <span className="block text-center text-zinc-500 dark:text-zinc-400">공통 키워드 추출 중…</span>
              ) : (
                <span className="flex flex-wrap items-center justify-center gap-1.5">
                  {(keywords ?? []).map((w, index) => (
                    <Link
                      key={`${w}-${index}`}
                      href={`/?q=${encodeURIComponent(w)}`}
                      scroll
                      className="rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[13px] transition-colors hover:border-zinc-900 hover:bg-white dark:border-zinc-600 dark:bg-zinc-800 dark:hover:border-zinc-100 dark:hover:bg-zinc-700"
                    >
                      {w}
                    </Link>
                  ))}
                </span>
              )}
              <span
                aria-hidden
                className="absolute left-1/2 top-full -translate-x-1/2 border-[7px] border-transparent border-t-white dark:border-t-zinc-900"
              />
            </div>
          </div>
        ) : null}

        {cards.map((card) => {
          const selected = selectedIds.has(card.id);

          return (
            <button
              key={card.id}
              type="button"
              title={card.tags.map((t) => `#${t}`).join(" ")}
              data-board-card=""
              aria-pressed={selected}
              aria-label={`reference card: ${card.tags.join(", ") || "no tags"}`}
              style={{
                position: "absolute",
                left: card.x,
                top: card.y,
                width: card.width,
                height: card.height,
                backgroundColor: card.shade,
                zIndex: 10,
              }}
              className={`flex cursor-move flex-col rounded-lg border p-2 text-left text-[10px] leading-tight text-zinc-800 shadow-sm outline-none ring-offset-1 transition-[box-shadow,ring] hover:shadow-md focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-zinc-900 ${
                selected
                  ? "border-sky-500 ring-2 ring-sky-500 dark:ring-sky-400"
                  : "border-zinc-300 dark:border-zinc-600"
              }`}
              onMouseDown={(e) => onCardMouseDown(e, card.id)}
            >
              <span className="pointer-events-none font-medium text-zinc-600">Image</span>
              <span className="pointer-events-none mt-auto line-clamp-3 text-zinc-500">
                {card.tags.join(" · ")}
              </span>
            </button>
          );
        })}

        {cards.length === 0 ? (
          <p className="pointer-events-none absolute left-1/2 top-1/2 z-[1] -translate-x-1/2 -translate-y-1/2 text-sm text-zinc-500">
            Add Mock Card로 카드를 추가한 뒤, 빈 배경 위에서 드래그하여 선택해 보세요.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <label htmlFor="ref-board-keyword-count" className="shrink-0 text-xs font-medium text-zinc-700 dark:text-zinc-300">
          공통 키워드 개수 (1–5)
        </label>
        <input
          id="ref-board-keyword-count"
          type="range"
          min={1}
          max={5}
          step={1}
          value={keywordCount}
          onChange={(e) => setKeywordCount(Number(e.target.value))}
          className="h-1.5 min-w-[120px] flex-1 cursor-pointer appearance-none rounded-full bg-zinc-200 accent-zinc-900 dark:bg-zinc-700 dark:accent-zinc-100 sm:max-w-xs"
        />
        <span className="min-w-[1rem] shrink-0 text-right tabular-nums text-sm text-zinc-900 dark:text-zinc-50">
          {keywordCount}
        </span>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-100">현재 카드 태그 (참고)</h3>
        <div className="flex flex-wrap gap-2 text-xs">
          {cards.length === 0 ? (
            <span className="text-zinc-500">카드 없음.</span>
          ) : (
            cards.map((c) =>
              selectedIds.has(c.id) ? (
                <span
                  key={c.id}
                  className="rounded-full bg-sky-600 px-2 py-1 text-[11px] text-white dark:bg-sky-500"
                >
                  {c.tags.join(", ")}
                </span>
              ) : (
                <span key={c.id} className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] dark:bg-zinc-800 dark:text-zinc-200">
                  {c.tags.join(", ")}
                </span>
              ),
            )
          )}
        </div>
      </div>
    </section>
  );
}
