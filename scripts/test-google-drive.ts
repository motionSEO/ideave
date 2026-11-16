import { authorizeDrive } from "../lib/google-drive/auth";
import { loadPersonalDbSnapshot } from "../lib/google-drive/personalDb";

const SAMPLE_COUNT = 8;

async function main() {
  const auth = await authorizeDrive();
  const snapshot = await loadPersonalDbSnapshot(auth);
  const allImages = snapshot.categories.flatMap((category) => category.images);
  const uniqueIds = new Set(allImages.map((image) => image.id));
  const categorySum = snapshot.categories.reduce((sum, category) => sum + category.images.length, 0);

  console.log("");
  console.log(snapshot.rootFolderName);
  for (const category of snapshot.categories) {
    console.log(`${category.name}: ${category.images.length}개`);
    if (category.images.length === 0) {
      console.log(`  (direct children: ${category.directChildCount}, skipped: ${category.skipped.length})`);
      if (category.skipped.length > 0) {
      const mimeCounts = new Map<string, number>();
      for (const skip of category.skipped) {
        mimeCounts.set(skip.mimeType, (mimeCounts.get(skip.mimeType) ?? 0) + 1);
      }
      const summary = [...mimeCounts.entries()]
        .map(([mime, count]) => `${mime}×${count}`)
        .join(", ");
      console.log(`  skipped ${category.skipped.length}: ${summary}`);
      for (const skip of category.skipped.slice(0, 8)) {
        console.log(`  - ${skip.name} (${skip.mimeType}, ${skip.reason})`);
      }
      }
    }
  }
  console.log(`Total images: ${allImages.length}`);

  if (categorySum !== allImages.length || uniqueIds.size !== allImages.length) {
    console.warn(
      `집계 불일치: 카테고리 합=${categorySum}, flattened=${allImages.length}, unique ids=${uniqueIds.size}`,
    );
  }

  const samples = allImages.slice(0, SAMPLE_COUNT);
  if (samples.length === 0) {
    console.log("");
    console.log("샘플 이미지가 없습니다.");
    return;
  }

  console.log("");
  console.log("Sample images");
  for (const image of samples) {
    console.log(`- [${image.category}] ${image.name}`);
    console.log(`  id: ${image.id}`);
    console.log(`  mime: ${image.mimeType}`);
    if (image.webViewLink) {
      console.log(`  view: ${image.webViewLink}`);
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
