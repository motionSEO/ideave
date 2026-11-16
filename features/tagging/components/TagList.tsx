import Link from "next/link";
import type { Tag } from "@/features/tagging/types";

type TagListProps = {
  selectedTag?: string;
};

const MOCK_TAGS: Tag[] = [
  { id: "1", name: "minimal", confidence: 0.93 },
  { id: "2", name: "brutalism", confidence: 0.81 },
  { id: "3", name: "mobile-ui", confidence: 0.78 },
];

export function TagList({ selectedTag }: TagListProps) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Auto Tags</h2>
      <ul className="flex flex-wrap gap-2">
        {MOCK_TAGS.map((tag) => {
          const isSelected = selectedTag === tag.name;
          return (
            <li key={tag.id}>
              <Link
                href={`/tag/${encodeURIComponent(tag.name)}`}
                className={`rounded-full border px-3 py-1 text-sm ${
                  isSelected
                    ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                    : "border-zinc-300 hover:border-zinc-500 dark:border-zinc-700"
                }`}
              >
                #{tag.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
