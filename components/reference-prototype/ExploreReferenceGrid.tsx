"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

function getColumnCount(width: number): number {
  if (width >= 1280) return 5;
  if (width >= 1024) return 4;
  if (width >= 640) return 3;
  return 2;
}

export function distributeToColumns<T>(items: T[], columnCount: number): T[][] {
  const columns = Array.from({ length: columnCount }, () => [] as T[]);
  items.forEach((item, index) => {
    columns[index % columnCount]!.push(item);
  });
  return columns;
}

type ExploreReferenceGridProps<T> = {
  items: T[];
  getItemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  /** 캔버스 패널 등 좁은 영역에서 열 수를 고정할 때 사용 */
  columnCountOverride?: number;
};

export function ExploreReferenceGrid<T>({
  items,
  getItemKey,
  renderItem,
  columnCountOverride,
}: ExploreReferenceGridProps<T>) {
  const [columnCount, setColumnCount] = useState(2);

  useEffect(() => {
    if (columnCountOverride !== undefined) {
      return;
    }

    const update = () => setColumnCount(getColumnCount(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [columnCountOverride]);

  const resolvedColumnCount = columnCountOverride ?? columnCount;

  const columns = useMemo(
    () => distributeToColumns(items, resolvedColumnCount),
    [items, resolvedColumnCount],
  );

  return (
    <div className="flex justify-center gap-[40px]">
      {columns.map((columnItems, columnIndex) =>
        columnItems.length === 0 ? null : (
          <div
            key={columnIndex}
            className="flex w-[240px] shrink-0 flex-col gap-[40px]"
          >
            {columnItems.map((item) => (
              <div key={getItemKey(item)} className="overflow-visible">
                {renderItem(item)}
              </div>
            ))}
          </div>
        ),
      )}
    </div>
  );
}
