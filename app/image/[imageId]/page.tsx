import { TagList } from "@/features/tagging/components/TagList";
import { RelatedImageGrid } from "@/features/explore/components/RelatedImageGrid";

type ImageDetailPageProps = {
  params: Promise<{ imageId: string }>;
};

export default async function ImageDetailPage({ params }: ImageDetailPageProps) {
  const { imageId } = await params;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Image #{imageId}</h1>
      <TagList />
      <RelatedImageGrid />
    </main>
  );
}
