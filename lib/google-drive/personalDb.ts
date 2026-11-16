import { google, type drive_v3 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { expandKoreanDesignQuery } from "@/lib/google-drive/metadata/koreanLexicon";

export const PERSONAL_DB_FOLDER_NAME = "IDEAVE_개인 DB";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const SHORTCUT_MIME = "application/vnd.google-apps.shortcut";
const IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/tiff",
  "image/heic",
  "image/heif",
  "image/svg+xml",
]);
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".heic", ".heif", ".svg"];
const LIST_FIELDS =
  "nextPageToken, files(id, name, mimeType, parents, webViewLink, webContentLink, thumbnailLink, hasThumbnail, shortcutDetails, imageMediaMetadata, md5Checksum, modifiedTime)";

export type DriveImageRecord = {
  id: string;
  name: string;
  mimeType: string;
  category: string;
  width?: number;
  height?: number;
  webViewLink: string | null;
  webContentLink: string | null;
  thumbnailLink: string | null;
  md5Checksum?: string;
  modifiedTime?: string;
};

export type DriveFolderSkip = {
  name: string;
  mimeType: string;
  reason: string;
};

export type PersonalDbCategory = {
  id: string;
  name: string;
  images: DriveImageRecord[];
  skipped: DriveFolderSkip[];
  directChildCount: number;
};

export type PersonalDbSnapshot = {
  rootFolderId: string;
  rootFolderName: string;
  categories: PersonalDbCategory[];
};

function isImageMime(mime: string): boolean {
  if (IMAGE_MIME_TYPES.has(mime)) {
    return true;
  }
  return mime.startsWith("image/") && mime !== "image/vnd.adobe.photoshop";
}

function hasImageExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function isImageFile(file: drive_v3.Schema$File): boolean {
  const mime = file.mimeType ?? "";
  const name = file.name ?? "";
  return isImageMime(mime) || hasImageExtension(name);
}

function imageDimensions(file: drive_v3.Schema$File): { width?: number; height?: number } {
  const meta = file.imageMediaMetadata;
  const width = typeof meta?.width === "number" && meta.width > 0 ? meta.width : undefined;
  const height = typeof meta?.height === "number" && meta.height > 0 ? meta.height : undefined;
  return { ...(width ? { width } : {}), ...(height ? { height } : {}) };
}

function toImageRecord(file: drive_v3.Schema$File, category: string): DriveImageRecord | null {
  if (!file.id || !isImageFile(file)) {
    return null;
  }
  return {
    id: file.id,
    name: file.name ?? "(untitled)",
    mimeType: file.mimeType ?? "application/octet-stream",
    category,
    ...imageDimensions(file),
    webViewLink: file.webViewLink ?? null,
    webContentLink: file.webContentLink ?? null,
    thumbnailLink: file.thumbnailLink ?? null,
    ...(file.md5Checksum ? { md5Checksum: file.md5Checksum } : {}),
    ...(file.modifiedTime ? { modifiedTime: file.modifiedTime } : {}),
  };
}

async function listAllFiles(drive: drive_v3.Drive, query: string): Promise<drive_v3.Schema$File[]> {
  const collect = async (useOrderBy: boolean): Promise<drive_v3.Schema$File[]> => {
    const files: drive_v3.Schema$File[] = [];
    let pageToken: string | undefined;

    do {
      const response = await drive.files.list({
        q: query,
        fields: LIST_FIELDS,
        pageSize: 1000,
        pageToken,
        spaces: "drive",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        ...(useOrderBy ? { orderBy: "name" } : {}),
      });
      files.push(...(response.data.files ?? []));
      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);

    return files;
  };

  try {
    return await collect(true);
  } catch {
    return collect(false);
  }
}

export async function findPersonalDbFolder(drive: drive_v3.Drive): Promise<drive_v3.Schema$File> {
  const escapedName = PERSONAL_DB_FOLDER_NAME.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const folders = await listAllFiles(
    drive,
    `name = '${escapedName}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
  );

  if (folders.length === 0 || !folders[0]?.id) {
    throw new Error(`Google Drive에서 이름이 정확히 "${PERSONAL_DB_FOLDER_NAME}"인 폴더를 찾지 못했습니다.`);
  }

  if (folders.length > 1) {
    console.warn(`같은 이름의 폴더가 ${folders.length}개입니다. 첫 번째 폴더를 사용합니다.`);
  }

  return folders[0];
}

async function listChildFolders(drive: drive_v3.Drive, parentId: string): Promise<drive_v3.Schema$File[]> {
  const children = await listAllFiles(drive, `'${parentId}' in parents and trashed = false`);
  const folders: drive_v3.Schema$File[] = [];

  for (const file of children) {
    if (!file.id) {
      continue;
    }
    if (file.mimeType === FOLDER_MIME) {
      folders.push(file);
      continue;
    }
    if (file.mimeType === SHORTCUT_MIME && file.shortcutDetails?.targetMimeType === FOLDER_MIME) {
      const targetId = file.shortcutDetails.targetId;
      if (!targetId) {
        continue;
      }
      folders.push({
        ...file,
        id: targetId,
        name: file.name || "shortcut-folder",
        mimeType: FOLDER_MIME,
      });
    }
  }

  return folders;
}

async function getFileById(drive: drive_v3.Drive, fileId: string): Promise<drive_v3.Schema$File | null> {
  try {
    const response = await drive.files.get({
      fileId,
      fields: "id, name, mimeType, webViewLink, webContentLink, thumbnailLink, hasThumbnail, shortcutDetails, imageMediaMetadata, md5Checksum, modifiedTime",
      supportsAllDrives: true,
    });
    return response.data;
  } catch {
    return null;
  }
}

async function collectImagesRecursive(
  drive: drive_v3.Drive,
  folderId: string,
  category: string,
  seenFileIds: Set<string>,
  seenFolderIds: Set<string>,
  skipped: DriveFolderSkip[],
): Promise<{ images: DriveImageRecord[]; directChildCount: number }> {
  if (seenFolderIds.has(folderId)) {
    return { images: [], directChildCount: 0 };
  }
  seenFolderIds.add(folderId);

  const images: DriveImageRecord[] = [];
  const files = await listAllFiles(drive, `'${folderId}' in parents and trashed = false`);

  for (const file of files) {
    if (!file.id) {
      continue;
    }

    if (file.mimeType === FOLDER_MIME) {
      const nested = await collectImagesRecursive(drive, file.id, category, seenFileIds, seenFolderIds, skipped);
      images.push(...nested.images);
      continue;
    }

    if (file.mimeType === SHORTCUT_MIME) {
      const targetId = file.shortcutDetails?.targetId;
      const targetMime = file.shortcutDetails?.targetMimeType ?? "";
      if (!targetId) {
        skipped.push({ name: file.name ?? "(shortcut)", mimeType: SHORTCUT_MIME, reason: "shortcut-missing-target" });
        continue;
      }
      if (targetMime === FOLDER_MIME) {
        const nested = await collectImagesRecursive(
          drive,
          targetId,
          category,
          seenFileIds,
          seenFolderIds,
          skipped,
        );
        images.push(...nested.images);
        continue;
      }
      const target = await getFileById(drive, targetId);
      if (!target) {
        skipped.push({ name: file.name ?? targetId, mimeType: targetMime || SHORTCUT_MIME, reason: "shortcut-target-unreadable" });
        continue;
      }
      const record = toImageRecord(target, category);
      if (!record) {
        skipped.push({
          name: target.name ?? file.name ?? targetId,
          mimeType: target.mimeType ?? targetMime,
          reason: "shortcut-target-not-image",
        });
        continue;
      }
      if (seenFileIds.has(record.id)) {
        skipped.push({ name: record.name, mimeType: record.mimeType, reason: "duplicate-file-id" });
        continue;
      }
      seenFileIds.add(record.id);
      images.push(record);
      continue;
    }

    const record = toImageRecord(file, category);
    if (!record) {
      skipped.push({
        name: file.name ?? file.id,
        mimeType: file.mimeType ?? "unknown",
        reason: "unsupported-type",
      });
      continue;
    }
    if (seenFileIds.has(record.id)) {
      skipped.push({ name: record.name, mimeType: record.mimeType, reason: "duplicate-file-id" });
      continue;
    }
    seenFileIds.add(record.id);
    images.push(record);
  }

  return { images, directChildCount: files.length };
}

export async function loadPersonalDbSnapshot(auth: OAuth2Client): Promise<PersonalDbSnapshot> {
  const drive = google.drive({ version: "v3", auth });
  const root = await findPersonalDbFolder(drive);
  const categoryFolders = await listChildFolders(drive, root.id!);
  const seenFileIds = new Set<string>();
  const categories: PersonalDbCategory[] = [];

  const rootFiles = await listAllFiles(drive, `'${root.id}' in parents and trashed = false`);
  const rootImages: DriveImageRecord[] = [];
  const rootSkipped: DriveFolderSkip[] = [];
  for (const file of rootFiles) {
    if (!file.id || file.mimeType === FOLDER_MIME || file.mimeType === SHORTCUT_MIME) {
      continue;
    }
    const record = toImageRecord(file, file.name?.replace(/\.[^.]+$/, "") || "root");
    if (!record) {
      continue;
    }
    if (seenFileIds.has(record.id)) {
      continue;
    }
    seenFileIds.add(record.id);
    rootImages.push(record);
  }
  if (rootImages.length > 0) {
    categories.push({
      id: `${root.id}-root-files`,
      name: "root",
      images: rootImages,
      skipped: rootSkipped,
      directChildCount: rootImages.length,
    });
  }

  for (const folder of categoryFolders) {
    if (!folder.id || !folder.name) {
      continue;
    }
    const skipped: DriveFolderSkip[] = [];
    const collected = await collectImagesRecursive(
      drive,
      folder.id,
      folder.name,
      seenFileIds,
      new Set<string>(),
      skipped,
    );
    categories.push({
      id: folder.id,
      name: folder.name,
      images: collected.images,
      skipped,
      directChildCount: collected.directChildCount,
    });
  }

  categories.sort((a, b) => a.name.localeCompare(b.name, "en"));

  return {
    rootFolderId: root.id!,
    rootFolderName: root.name ?? PERSONAL_DB_FOLDER_NAME,
    categories,
  };
}

export function flattenPersonalDbImages(snapshot: PersonalDbSnapshot): DriveImageRecord[] {
  return snapshot.categories.flatMap((category) => category.images);
}

function normalizeDriveSearchText(value: string): string {
  return value
    .toLowerCase()
    .split("typhography")
    .join("typography")
    .split("typho")
    .join("typo");
}

export function filterPersonalDbImages(images: DriveImageRecord[], query: string): DriveImageRecord[] {
  const needle = normalizeDriveSearchText(query.trim());
  if (!needle) {
    return images;
  }
  const tokens = [
    ...needle.split(/\s+/).filter(Boolean),
    ...expandKoreanDesignQuery(query).map((term) => normalizeDriveSearchText(term)),
  ];
  return images.filter((image) => {
    const fileName = normalizeDriveSearchText(image.name);
    const category = normalizeDriveSearchText(image.category);
    const haystack = `${category} ${fileName}`;
    const hayExpanded = expandKoreanDesignQuery(haystack).map((term) => term.toLowerCase());
    if (haystack.includes(needle) || hayExpanded.includes(needle)) {
      return true;
    }
    return tokens.some(
      (token) =>
        token.length >= 2 &&
        (category.includes(token) ||
          fileName.includes(token) ||
          haystack.includes(token) ||
          hayExpanded.includes(token)),
    );
  });
}
