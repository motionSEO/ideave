type RelatedImageGridProps = {
  selectedTag?: string;
};

const MOCK_IMAGES = [
  { id: "a", title: "Landing layout" },
  { id: "b", title: "Mobile cards" },
  { id: "c", title: "Grid typography" },
];

export function RelatedImageGrid({ selectedTag }: RelatedImageGridProps) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">
        Related Images {selectedTag ? `for #${selectedTag}` : ""}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {MOCK_IMAGES.map((item) => (
          <article
            key={item.id}
            className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800"
          >
            <div className="h-40 w-full bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900" />
            <div className="p-2 text-sm">{item.title}</div>
          </article>
        ))}
      </div>
    </section>
  );
}
