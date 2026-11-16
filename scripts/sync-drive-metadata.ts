import { authorizeDriveServer } from "../lib/google-drive/auth";
import { flattenPersonalDbImages, loadPersonalDbSnapshot } from "../lib/google-drive/personalDb";
import { loadDriveMetadataStore, saveDriveMetadataStore } from "../lib/google-drive/metadata/store";
import { syncMetadataStoreWithDrive } from "../lib/google-drive/metadata/syncPipeline";

async function main() {
  const auth = await authorizeDriveServer();
  const snapshot = await loadPersonalDbSnapshot(auth);
  const driveImages = flattenPersonalDbImages(snapshot);
  const current = await loadDriveMetadataStore();
  const { store, summary } = syncMetadataStoreWithDrive(current, driveImages);
  await saveDriveMetadataStore(store);

  console.log("");
  console.log("Google Drive metadata sync (no Vision analysis)");
  console.log(`Drive images: ${summary.totalDriveImages}`);
  console.log(`added (new fileId): ${summary.added}`);
  console.log(`reused: ${summary.reused}`);
  console.log(`stale (content changed): ${summary.stale}`);
  console.log(`removed (deleted on Drive): ${summary.removed}`);
  console.log(`pending/stale awaiting Vision: ${summary.pending}`);
  console.log(`ready: ${summary.ready}`);
  console.log("");
  console.log("Store: data/google-drive/image-metadata.json");
  console.log("Vision hook: lib/google-drive/metadata/visionAnalyzer.ts");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
