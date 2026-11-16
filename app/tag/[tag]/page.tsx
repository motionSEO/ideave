import { RelatedImageGrid } from "@/features/explore/components/RelatedImageGrid";
import { TagList } from "@/features/tagging/components/TagList";

type TagPageProps = {
  params: Promise<{ tag: string }>;
};

export default async function TagPage({ params }: TagPageProps) {
  const { tag } = await params;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Tag: #{decodeURIComponent(tag)}</h1>
      <TagList selectedTag={decodeURIComponent(tag)} />
      <RelatedImageGrid selectedTag={decodeURIComponent(tag)} />
    </main>
  );
}
