import { google } from "googleapis";
import { authorizeDriveServer } from "@/lib/google-drive/auth";
import { flattenPersonalDbImages } from "@/lib/google-drive/personalDb";
import { getCachedPersonalDbSnapshot, isAllowedDriveFileId } from "@/lib/google-drive/serverCache";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ id: string }>;
};

const THUMB_MAX_BYTES = 512 * 1024;
// 그리드 카드용 중간 크기(카드 240px × 화면 배율 2). 원본(수 MB)을 수백 장 받지 않으려고 쓴다.
const CARD_THUMB_PX = 480;
const CARD_MAX_BYTES = 2 * 1024 * 1024;
const DRIVE_MEDIA_TIMEOUT_MS = 20_000;

/**
 * 색상 분석용 작은 썸네일(약 128px).
 * 스냅샷(최대 10분 전)에 있는 thumbnailLink 를 먼저 쓰고, 만료됐으면 Drive에서 새 링크를 받아 한 번 더 시도한다.
 * googleusercontent.com 호스트만 인증 헤더로 요청한다. 실패하면 null → 원본으로 대체.
 */
async function fetchDriveThumbnail(
  drive: ReturnType<typeof google.drive>,
  accessToken: string,
  fileId: string,
  snapshotLink: string | null,
  px = 128,
  maxBytes = THUMB_MAX_BYTES,
): Promise<Response | null> {
  if (snapshotLink) {
    const cached = await fetchThumbnailFromLink(snapshotLink, accessToken, px, maxBytes);
    if (cached) {
      return cached;
    }
  }
  try {
    const meta = await drive.files.get({ fileId, fields: "thumbnailLink", supportsAllDrives: true });
    return meta.data.thumbnailLink
      ? await fetchThumbnailFromLink(meta.data.thumbnailLink, accessToken, px, maxBytes)
      : null;
  } catch {
    return null;
  }
}

async function fetchThumbnailFromLink(
  link: string,
  accessToken: string,
  px = 128,
  maxBytes = THUMB_MAX_BYTES,
): Promise<Response | null> {
  try {
    const url = new URL(link.replace(/=s\d+(-[a-z0-9-]+)?$/i, `=s${px}`));
    if (url.protocol !== "https:" || !url.hostname.endsWith(".googleusercontent.com")) {
      return null;
    }
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.startsWith("image/")) {
      return null;
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) {
      return null;
    }
    return new Response(bytes, {
      headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=86400" },
    });
  } catch {
    return null;
  }
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const sizeParam = new URL(request.url).searchParams.get("size");
  const wantsThumb = sizeParam === "thumb";
  const wantsCard = sizeParam === "card";
  if (!isAllowedDriveFileId(id)) {
    return new Response("Invalid file id", { status: 400 });
  }

  try {
    const snapshot = await getCachedPersonalDbSnapshot();
    const record = flattenPersonalDbImages(snapshot).find((image) => image.id === id);
    if (!record) {
      return new Response("Not found", { status: 404 });
    }

    const auth = await authorizeDriveServer();
    const drive = google.drive({ version: "v3", auth });

    if (wantsThumb || wantsCard) {
      const token = (await auth.getAccessToken()).token;
      const thumb = token
        ? wantsCard
          ? await fetchDriveThumbnail(drive, token, id, record.thumbnailLink, CARD_THUMB_PX, CARD_MAX_BYTES)
          : await fetchDriveThumbnail(drive, token, id, record.thumbnailLink)
        : null;
      if (thumb) {
        return thumb;
      }
    }

    // 스트림(Readable.toWeb)으로 넘기면 응답 헤더만 가고 본문이 멈추는 경우가 있어,
    // 브라우저의 호스트당 연결(6개)이 묶이고 이후 이미지·캔버스 저장이 전부 대기하게 된다.
    // 이미지는 수 MB 이하라 다 받은 뒤 한 번에 보내고, Drive가 응답하지 않으면 시간 제한으로 끊는다.
    const media = await drive.files.get(
      {
        fileId: id,
        alt: "media",
        supportsAllDrives: true,
      },
      { responseType: "arraybuffer", timeout: DRIVE_MEDIA_TIMEOUT_MS },
    );

    // MIME 형식은 스냅샷 값을 써서 메타데이터 API 호출을 한 번 줄인다.
    const mimeType = record.mimeType || "application/octet-stream";

    return new Response(media.data as ArrayBuffer, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Drive 파일을 불러오지 못했습니다.";
    return new Response(message, { status: 500 });
  }
}
