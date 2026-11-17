"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { REFERENCES, type ReferenceItem, type ReferenceVisionFields } from "@/components/reference-prototype/data";
import { isSafeReference, isSafeUnsplashPhoto } from "@/lib/contentSafety";
import { BOARD_COMMON_KEYWORD_COUNT, expandKeywordSignalLabel, isVagueCategoryKeyword } from "@/shared/lib/commonKeywords";
import {
  DEFAULT_EXPLORE_TEXTS,
  extractTagLabelsFromImages,
  getExploreTextsForHashtag,
  getExploreTextsForSearchQuery,
  getExploreTextCategoryLabel,
  getRelatedExploreTextsForLabel,
  getRelatedImagesByLabel,
  shuffleExploreTextEntries,
  filterExploreTextsExcludingProject,
  isGenericExploreTextLabel,
  buildExploreGridItems,
  mergeExploreTextEntries,
  mergeImageTagExploreTexts,
  projectLabelsToExploreTexts,
  seedProjectExploreTexts,
  type ExploreTextEntry,
} from "@/components/reference-prototype/exploreGrid";
import { IdeaveLogo, ProfileIconButton } from "@/components/reference-prototype/IdeaveLogo";
import { BoardCanvasCard, type BoardCanvasItem } from "@/components/reference-prototype/BoardCanvasCard";
import {
  BOARD_TEXT_FONT_SIZE,
  measureBoardTextBox,
} from "@/components/reference-prototype/boardTextSize";
import { applyBoardResize, type ResizeEdge } from "@/components/reference-prototype/boardResize";
import { CloseButton } from "@/components/reference-prototype/CloseIcon";
import { CreateModal } from "@/components/reference-prototype/CreateModal";
import { ProjectRegisterModal } from "@/components/reference-prototype/ProjectRegisterModal";
import { ExploreReferenceGrid } from "@/components/reference-prototype/ExploreReferenceGrid";
import { ReferenceCard } from "@/components/reference-prototype/ReferenceCard";
import {
  collectCatalogSearchHashtags,
  composeVisualRelatedSearchQuery,
  extractDesignKeywords,
  extractDesignKeywordsFromText,
  extractVisualKeywords,
  rankCatalogRelatedImages,
  buildWovenImageLookup,
  scoreRelatedReference,
  scoreVisualRelatedReference,
} from "@/components/reference-prototype/referenceKeywords";
import {
  composeBrowseRecommendQuery,
  composeProjectDiscoverQuery,
  filterMatchedReferenceItems,
  mixDrivePriorityFeed,
  needsUnsplashFill,
  rankReferenceItemsByTerms,
  splitCollectedAndRemote,
  termsFromProjectContext,
} from "@/components/reference-prototype/homeFeedMix";
import {
  composeEnglishDesignQuery,
  expandKoreanDesignQuery,
} from "@/lib/google-drive/metadata/koreanLexicon";
import {
  CANVAS_EXPORT_FORMATS,
  exportBoardCanvas,
  type CanvasExportFormat,
} from "@/components/reference-prototype/canvasExport";
import { ImageDetailPanel } from "@/components/reference-prototype/ImageDetailPanel";
import { TextDetailPanel } from "@/components/reference-prototype/TextDetailPanel";
import { ExploreDetailBackButton } from "@/components/reference-prototype/exploreDetailShared";
import {
  buildProfileTextEntries,
  composeCollectedFirst,
  featuresFromPalette,
  getColorFeatures,
  getColorFeaturesForItems,
  inferItemMedium,
  isCollectedReference,
  profileTermKeys,
  projectProfileAsVisualProfile,
  relevantCollectedItems,
  resolveSelectedMedium,
  scoreVisualCandidates,
  type ColorFeatures,
  type ProjectVisualProfile,
  profileTermSimilarity,
  type VisualProfile,
} from "@/components/reference-prototype/visualSimilarity";
import { getMedium, type MediumId } from "@/shared/lib/visualMedium";
import { fallbackProjectVisualProfile } from "@/shared/lib/projectVisual";

const UNSPLASH_FEED_ENABLED = true;

/** Supabase `images.id` 등 UUID 업로드 항목 */
const DATABASE_IMAGE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MIN_BOARD_BAND_PX = 4;
/** Ctrl+V로 붙여넣을 때 원본에서 비켜 놓는 거리(붙여넣을수록 누적) */
const BOARD_PASTE_OFFSET_PX = 24;
const BOARD_HISTORY_LIMIT = 50;
/** Viewport is 480px wide; world is 3× wide and ~2.5× a typical ~860px-tall panel. */
const CANVAS_WIDTH = 1440;
const CANVAS_HEIGHT = 2160;
const MIN_ZOOM = 480 / CANVAS_WIDTH;
const MAX_ZOOM = 2.8;
const BOARD_OBJECT_EDGE_KEEP_PX = 24;
const BOARD_DOT_TILE_PX = 24;
const BOARD_TOOLBAR_CLEARANCE_PX = 64;
const BOARD_KEYWORD_BUBBLE_HEIGHT = 44;
const BOARD_KEYWORD_ARROW = 7;

// 캔버스 패널 너비(사용자가 왼쪽 경계를 끌어 조절). 패널 560 → 캔버스 영역 480처럼 안쪽 여백 80px을 뺀다.
const BOARD_PANEL_DEFAULT_PX = 560;
const BOARD_PANEL_MIN_PX = 400;
const BOARD_PANEL_INNER_GUTTER_PX = 80;
const BOARD_PANEL_WIDTH_STORAGE_KEY = "ideave.boardPanelWidth";
// 화면 오른쪽 인덱스 탭(프로젝트·캔버스) 너비. 캔버스가 닫혀 있을 땐 탐색 그리드 오른쪽 여백에 이만큼 더 비우고,
// 열려 있을 땐 캔버스 패널 왼쪽 안쪽 여백(BOARD_PANEL_INNER_GUTTER_PX의 절반 40px)에 탭을 넣어 그리드 칸 수를 지킨다.
// 홈 그리드 위 여백: 상단 바 아래 전체/이미지/텍스트 필터 줄(약 57px)이 떠 있을 때도 첫 줄 이미지를 가리지 않고,
// 필터 줄이 숨은 맨 위 상태에선 상단 바와 이미지 사이가 넉넉히 떨어져 보이게 한다.
const EXPLORE_HOME_TOP_PAD_PX = 80;
const INDEX_TAB_PX = 36;
// 인덱스 패널(프로젝트·캔버스)이 오른쪽에서 밀려 나오고 들어가는 시간. 탭과 패널이 같은 값으로 움직여 붙어 다닌다.
const SIDE_PANEL_SLIDE_MS = 320;
const SIDE_PANEL_SLIDE_CLASS = "duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)]";
// 탐색 그리드: 카드 240px, 간격 40px, 섹션 좌우 패딩(px-8) 64px. 캔버스를 넓혀도 최소 2칸은 남긴다.
const EXPLORE_CARD_PX = 240;
const EXPLORE_GAP_PX = 40;
const EXPLORE_SECTION_PAD_PX = 64;
const EXPLORE_MIN_COLUMNS = 2;
const EXPLORE_MAX_COLUMNS = 5;
const EXPLORE_MIN_WIDTH_PX =
  EXPLORE_MIN_COLUMNS * EXPLORE_CARD_PX + (EXPLORE_MIN_COLUMNS - 1) * EXPLORE_GAP_PX + EXPLORE_SECTION_PAD_PX;

function clampBoardPanelWidth(width: number, viewportWidth: number): number {
  const max = Math.max(BOARD_PANEL_MIN_PX, viewportWidth - EXPLORE_MIN_WIDTH_PX);
  return Math.round(Math.min(max, Math.max(BOARD_PANEL_MIN_PX, width)));
}

function exploreColumnsForWidth(exploreWidth: number): number {
  const fit = Math.floor((exploreWidth - EXPLORE_SECTION_PAD_PX + EXPLORE_GAP_PX) / (EXPLORE_CARD_PX + EXPLORE_GAP_PX));
  return Math.min(EXPLORE_MAX_COLUMNS, Math.max(EXPLORE_MIN_COLUMNS, fit));
}

function readStoredBoardPanelWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(BOARD_PANEL_WIDTH_STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : BOARD_PANEL_DEFAULT_PX;
  } catch {
    return BOARD_PANEL_DEFAULT_PX;
  }
}

function boardFitScale(viewW: number, viewH: number): number {
  const fit = Math.min(viewW / CANVAS_WIDTH, viewH / CANVAS_HEIGHT);
  return Number.isFinite(fit) && fit > 0 ? fit : MIN_ZOOM;
}

function clampBoardScale(value: number, viewW = 480, viewH = 720): number {
  const min = boardFitScale(viewW, viewH);
  return Math.min(MAX_ZOOM, Math.max(min, value));
}

function clampBoardPan(
  panX: number,
  panY: number,
  scale: number,
  viewW: number,
  viewH: number,
): { x: number; y: number } {
  const worldW = CANVAS_WIDTH * scale;
  const worldH = CANVAS_HEIGHT * scale;

  const clampAxis = (pan: number, world: number, view: number) => {
    if (world <= view) {
      return (view - world) / 2;
    }
    const min = view - world;
    const max = 0;
    return Math.min(max, Math.max(min, pan));
  };

  return {
    x: clampAxis(panX, worldW, viewW),
    y: clampAxis(panY, worldH, viewH),
  };
}

function clampBoardGroupDelta(
  items: Array<{ id: string; x: number; y: number; width: number; height: number }>,
  ids: Set<string>,
  dx: number,
  dy: number,
): { dx: number; dy: number } {
  let nextDx = dx;
  let nextDy = dy;
  for (let pass = 0; pass < 2; pass += 1) {
    for (const item of items) {
      if (!ids.has(item.id)) {
        continue;
      }
      const clamped = clampBoardItemRect(item.x + nextDx, item.y + nextDy, item.width, item.height);
      nextDx = clamped.x - item.x;
      nextDy = clamped.y - item.y;
    }
  }
  return { dx: nextDx, dy: nextDy };
}

function clampBoardItemRect(
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const keep = BOARD_OBJECT_EDGE_KEEP_PX;
  const minX = keep - width;
  const minY = keep - height;
  const maxX = CANVAS_WIDTH - keep;
  const maxY = CANVAS_HEIGHT - keep;
  return {
    x: Math.min(Math.max(x, minX), Math.max(minX, maxX)),
    y: Math.min(Math.max(y, minY), Math.max(minY, maxY)),
  };
}

function clientToBoardPoint(
  clientX: number,
  clientY: number,
  canvas: HTMLElement,
  panX: number,
  panY: number,
  scale: number,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const safeScale = scale === 0 ? 1 : scale;
  return {
    x: (clientX - rect.left - panX) / safeScale,
    y: (clientY - rect.top - panY) / safeScale,
  };
}

function clampBoardKeywordBubbleStyle(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  label: string,
  canvas: HTMLElement | null,
  panX: number,
  panY: number,
  scale: number,
): { left: number; top: number; transform: string } {
  const safeScale = scale === 0 ? 1 : scale;
  const viewW = canvas?.clientWidth ?? 480;
  const viewH = canvas?.clientHeight ?? 480;
  const pad = 8 / safeScale;
  const toolbar = BOARD_TOOLBAR_CLEARANCE_PX / safeScale;
  const vx = -panX / safeScale;
  const vy = -panY / safeScale;
  const vw = viewW / safeScale;
  const vh = Math.max(80 / safeScale, viewH / safeScale - toolbar);

  // 키워드 칩(한글 14px ≈ 13px/자 + 칩 여백)이 들어간 말풍선 너비 추정
  const estimatedWidth = Math.min(420, Math.max(96, 24 + label.length * 13)) / safeScale;
  const bubbleH = (BOARD_KEYWORD_BUBBLE_HEIGHT + BOARD_KEYWORD_ARROW) / safeScale;
  const gap = 18 / safeScale;

  let left = (bounds.minX + bounds.maxX) / 2;
  let top = bounds.minY - gap;
  const transform = "translate(-50%, -100%)";

  const minLeft = Math.max(vx + pad + estimatedWidth / 2, estimatedWidth / 2);
  const maxLeft = Math.min(vx + vw - pad - estimatedWidth / 2, CANVAS_WIDTH - estimatedWidth / 2);
  left = Math.min(Math.max(left, minLeft), Math.max(minLeft, maxLeft));

  const minTop = Math.max(vy + pad + bubbleH, bubbleH);
  const maxTop = Math.min(vy + vh - pad, CANVAS_HEIGHT - pad);
  top = Math.min(Math.max(top, minTop), Math.max(minTop, maxTop));

  return { left, top, transform };
}
/** 헤더+검색 sticky 블록 아래까지는 필터를 항상 표시 */
const FILTER_NAV_DELTA_MIN = 2;
const FILTER_NAV_HIDE_DISTANCE = 14;
const FILTER_NAV_REVEAL_DISTANCE = 10;
const FILTER_NAV_TOGGLE_COOLDOWN_MS = 400;
const DETAIL_RELATED_IMAGE_LIMIT = 32;
const DETAIL_RELATED_TEXT_ENTRY_LIMIT = 32;
const DETAIL_RELATED_TAG_LABEL_LIMIT = 20;
const SEARCH_HASHTAG_LIMIT = 8;

function parseItemAspectRatio(item: ReferenceItem): number | null {
  if (item.type !== "image") {
    return null;
  }

  const [ratioW, ratioH] = item.ratio.split("/").map((value) => Number(value.trim()));
  if (!Number.isFinite(ratioW) || !Number.isFinite(ratioH) || ratioH <= 0 || ratioW <= 0) {
    return null;
  }

  return ratioW / ratioH;
}

type UnsplashSearchPhoto = {
  id?: unknown;
  width?: unknown;
  height?: unknown;
  description?: unknown;
  alt_description?: unknown;
  urls?: { regular?: unknown };
  tags?: unknown;
  tags_preview?: unknown;
  topics?: unknown;
  topic_submissions?: unknown;
  user?: { name?: unknown; links?: { html?: unknown } };
  links?: { html?: unknown };
};

function greatestCommonDivisor(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

function unsplashPhotoRatio(width: unknown, height: unknown): string {
  const w = typeof width === "number" && Number.isFinite(width) && width > 0 ? Math.round(width) : 0;
  const h = typeof height === "number" && Number.isFinite(height) && height > 0 ? Math.round(height) : 0;
  if (w <= 0 || h <= 0) {
    return "4 / 5";
  }
  const divisor = greatestCommonDivisor(w, h);
  return `${w / divisor} / ${h / divisor}`;
}

function unsplashPhotoTags(photo: UnsplashSearchPhoto): string[] {
  const rawTags = Array.isArray(photo.tags)
    ? photo.tags
    : Array.isArray(photo.tags_preview)
      ? photo.tags_preview
      : [];

  const tags: string[] = [];
  for (const entry of rawTags) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const title = (entry as { title?: unknown }).title;
    if (typeof title !== "string") {
      continue;
    }
    const label = title.trim();
    if (label && !tags.includes(label)) {
      tags.push(label);
    }
  }
  return tags;
}

function unsplashTopicLabels(photo: UnsplashSearchPhoto): string[] {
  const labels: string[] = [];

  if (Array.isArray(photo.topics)) {
    for (const entry of photo.topics) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const title = (entry as { title?: unknown }).title;
      if (typeof title === "string" && title.trim()) {
        labels.push(title.trim());
      }
    }
  }

  if (photo.topic_submissions && typeof photo.topic_submissions === "object") {
    for (const rawKey of Object.keys(photo.topic_submissions as Record<string, unknown>)) {
      const label = rawKey.replace(/-/g, " ").trim();
      if (label) {
        labels.push(label);
      }
    }
  }

  return labels;
}

function mapUnsplashPhotosToReferenceItems(results: unknown, searchQuery = ""): ReferenceItem[] {
  if (!Array.isArray(results)) {
    return [];
  }

  const items: ReferenceItem[] = [];
  for (const row of results) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const photo = row as UnsplashSearchPhoto;
    if (typeof photo.id !== "string" || !photo.id.trim()) {
      continue;
    }
    if (!isSafeUnsplashPhoto(photo)) {
      continue;
    }
    const id = `unsplash-${photo.id}`;
    if (items.some((item) => item.id === id)) {
      continue;
    }
    const imageUrl =
      photo.urls && typeof photo.urls.regular === "string" ? photo.urls.regular.trim() : "";
    if (!imageUrl) {
      continue;
    }

    const width =
      typeof photo.width === "number" && Number.isFinite(photo.width) && photo.width > 0
        ? Math.round(photo.width)
        : undefined;
    const height =
      typeof photo.height === "number" && Number.isFinite(photo.height) && photo.height > 0
        ? Math.round(photo.height)
        : undefined;
    const photographerName =
      photo.user && typeof photo.user.name === "string" ? photo.user.name.trim() : "";
    const photographerUrl =
      photo.user?.links && typeof photo.user.links.html === "string"
        ? photo.user.links.html.trim()
        : "";
    const unsplashUrl =
      photo.links && typeof photo.links.html === "string" ? photo.links.html.trim() : "";

    const altDescription =
      typeof photo.alt_description === "string" ? photo.alt_description.trim() : "";
    const description = typeof photo.description === "string" ? photo.description.trim() : "";
    const tags = [...unsplashPhotoTags(photo)];
    for (const label of unsplashTopicLabels(photo)) {
      if (!tags.includes(label)) {
        tags.push(label);
      }
    }

    items.push({
      id,
      type: "image",
      imageUrl,
      ratio: unsplashPhotoRatio(photo.width, photo.height),
      tags,
      source: "unsplash",
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
      ...(photographerName ? { photographerName } : {}),
      ...(photographerUrl ? { photographerUrl } : {}),
      ...(unsplashUrl ? { unsplashUrl } : {}),
      ...(altDescription ? { altDescription } : {}),
      ...(description ? { description } : {}),
      ...(searchQuery.trim() ? { searchQuery: searchQuery.trim() } : {}),
    });
  }
  return items;
}

function mapSupabaseSearchImagesToReferenceItems(
  images:
    | Array<{
        id: string;
        imageUrl: string;
        tags: string[];
        similarity?: number;
      }>
    | undefined,
): ReferenceItem[] {
  return (
    images?.map((row) => ({
      id: row.id,
      type: "image" as const,
      ratio: "4 / 5",
      imageUrl: row.imageUrl,
      tags: row.tags,
      similarity: row.similarity,
      source: "upload" as const,
    })) ?? []
  );
}

async function fetchUnsplashRelatedItems(
  query: string,
  signal: AbortSignal,
  options?: { visual?: boolean },
): Promise<ReferenceItem[]> {
  if (!UNSPLASH_FEED_ENABLED) {
    return [];
  }
  // visual: Gemini가 만든 영어 쿼리(분야+색상+무드)를 변형 없이 사용
  const trimmed = options?.visual
    ? query.trim()
    : composeEnglishDesignQuery(query.trim()) || query.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const response = await fetchWithTimeout(
      `/api/unsplash/search?q=${encodeURIComponent(trimmed)}${options?.visual ? "&visual=1" : ""}`,
      signal,
      options?.visual ? 8000 : 4000,
    );
    const payload = (await response.json()) as { results?: unknown };
    if (!response.ok) {
      return [];
    }
    return mapUnsplashPhotosToReferenceItems(payload.results, trimmed);
  } catch (error) {
    if (isAbortError(error)) {
      return [];
    }
    return [];
  }
}

const visualProfileCache = new Map<string, VisualProfile | null>();

/** 선택 이미지의 색상·무드·스타일 프로필 (Gemini). 실패하면 null → 픽셀 색상만으로 추천 */
async function fetchVisualProfile(imageUrl: string, signal: AbortSignal): Promise<VisualProfile | null> {
  if (visualProfileCache.has(imageUrl)) {
    return visualProfileCache.get(imageUrl) ?? null;
  }
  const local = new AbortController();
  const timeoutId = window.setTimeout(() => abortController(local), 20000);
  const forwardAbort = () => abortController(local);
  signal.addEventListener("abort", forwardAbort, { once: true });
  try {
    const response = await fetch("/api/images/visual-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl }),
      signal: local.signal,
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as { profile?: VisualProfile | null; reason?: string };
    const profile = payload.profile ?? null;
    // 쿼터·키 문제는 잠시 후 다시 시도할 수 있도록 성공한 결과만 캐시한다.
    if (profile) {
      visualProfileCache.set(imageUrl, profile);
    }
    return profile;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
    signal.removeEventListener("abort", forwardAbort);
  }
}

/** 프로젝트 무드 키워드 → 시각 프로필. 네트워크 실패 시 키워드 기반 대체 프로필을 쓴다. */
async function fetchProjectVisualProfile(
  projectName: string,
  mood: string,
  signal: AbortSignal,
): Promise<ProjectVisualProfile> {
  try {
    const response = await fetch("/api/project/visual-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectName, mood }),
      signal,
    });
    if (response.ok) {
      const payload = (await response.json()) as { profile?: ProjectVisualProfile | null };
      if (payload.profile) {
        return payload.profile;
      }
    }
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
  }
  return fallbackProjectVisualProfile(projectName, mood);
}

const PROJECT_ANCHOR_ITEM: ReferenceItem = { id: "__project-anchor__", type: "image", ratio: "1 / 1" };
const PROJECT_RECOMMEND_LIMIT = 72;

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * 픽셀 색상 비교 대상 후보군. 전체 카탈로그를 다 내려받지 않도록
 * 프로필 용어 매칭 상위 + 태그 매칭 상위 + 같은 카테고리 + 카테고리별 고른 샘플 + 원격 결과로 구성한다.
 */
function buildVisualCandidatePool(
  selected: ReferenceItem,
  catalog: ReferenceItem[],
  profileKeys: Set<string>,
  remote: ReferenceItem[],
  targetMediums: MediumId[],
  caps: { sameMedium: number; diverse: number } = { sameMedium: 40, diverse: 24 },
): ReferenceItem[] {
  const images = catalog.filter(
    (item) =>
      item.type !== "text" &&
      Boolean(item.imageUrl) &&
      item.id !== selected.id &&
      item.imageUrl !== selected.imageUrl &&
      isSafeReference(item),
  );

  const byTerms =
    profileKeys.size > 0
      ? images
          .map((item) => ({ item, score: profileTermSimilarity(profileKeys, item) }))
          .filter((entry) => entry.score > 0)
          .sort((left, right) => right.score - left.score)
          .slice(0, 30)
          .map((entry) => entry.item)
      : [];
  const byTags = rankCatalogRelatedImages(selected, images, 12);

  const category = selected.searchQuery?.trim().toLowerCase() ?? "";
  const sameCategory = category
    ? images.filter((item) => item.searchQuery?.trim().toLowerCase() === category).slice(0, 10)
    : [];

  // 카테고리(또는 출처)별로 나눠 선택 이미지 id 기준 고정 순서로 고르게 샘플링 → 다른 카테고리의 비슷한 색도 찾는다.
  const groups = new Map<string, ReferenceItem[]>();
  for (const item of images) {
    const key = `${item.source ?? "catalog"}:${item.searchQuery?.trim().toLowerCase() ?? ""}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  const seed = stableHash(selected.id);
  const queues = [...groups.values()].map((list) =>
    [...list].sort((left, right) => stableHash(`${seed}:${left.id}`) - stableHash(`${seed}:${right.id}`)),
  );
  const diverse: ReferenceItem[] = [];
  while (diverse.length < caps.diverse && queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next) {
        diverse.push(next);
      }
      if (diverse.length >= caps.diverse) {
        break;
      }
    }
  }

  // 같은 분야(예: 유화 → 명화 폴더, 포스터 → 그래픽 계열) 후보를 우선 넣는다.
  const sameMedium: ReferenceItem[] = [];
  const sameFamily: ReferenceItem[] = [];
  if (targetMediums.length > 0) {
    const targetFamilies = new Set(targetMediums.map((id) => getMedium(id)?.family).filter(Boolean));
    const shuffled = [...images].sort(
      (left, right) => stableHash(`${seed}:m:${left.id}`) - stableHash(`${seed}:m:${right.id}`),
    );
    for (const item of shuffled) {
      const guess = inferItemMedium(item);
      if (!guess) {
        continue;
      }
      if (targetMediums.includes(guess.id)) {
        if (sameMedium.length < caps.sameMedium) {
          sameMedium.push(item);
        }
      } else if (targetFamilies.has(getMedium(guess.id)?.family) && sameFamily.length < 16) {
        sameFamily.push(item);
      }
    }
  }

  return mergeReferenceItemsById(sameMedium, byTerms, remote, sameCategory, sameFamily, byTags, diverse).filter(
    (item) => item.type !== "text" && item.id !== selected.id && item.imageUrl !== selected.imageUrl,
  );
}

/**
 * Drive 우선 추천 (상세 화면·프로젝트 메인 공용).
 * 1) 수집 레퍼런스(Drive·업로드)만으로 후보를 넓게 모아 분야·색상·용어 유사도를 매긴다.
 * 2) 충분히 비슷한 수집 레퍼런스로 limit 을 채우면 그대로 끝 — Unsplash는 호출하지 않는다.
 * 3) 모자랄 때만 Unsplash를 검색해 유사도 순으로 맨 뒤에 붙인다.
 */
async function recommendCollectedFirst(options: {
  anchor: ReferenceItem;
  catalog: ReferenceItem[];
  extraCollected?: ReferenceItem[];
  profileKeys: Set<string>;
  targetFeatures: ColorFeatures | null;
  targetMediums: MediumId[];
  mediumWeight?: number;
  caps: { sameMedium: number; diverse: number };
  limit: number;
  fetchRemote: () => Promise<ReferenceItem[]>;
  signal: AbortSignal;
}): Promise<{ items: ReferenceItem[]; collectedCount: number; usedRemote: boolean }> {
  const { anchor, profileKeys, targetFeatures, targetMediums, mediumWeight, limit, signal } = options;
  const collectedCatalog = mergeReferenceItemsById(
    options.catalog.filter(isCollectedReference),
    (options.extraCollected ?? []).filter(isCollectedReference),
  );

  const pool = buildVisualCandidatePool(anchor, collectedCatalog, profileKeys, [], targetMediums, options.caps);
  const poolFeatures = targetFeatures ? await getColorFeaturesForItems(pool, signal) : new Map<string, ColorFeatures>();
  if (signal.aborted) {
    return { items: [], collectedCount: 0, usedRemote: false };
  }
  const scoreInput = {
    selected: anchor,
    selectedFeatures: targetFeatures,
    profileKeys,
    targetMediums,
    mediumWeight,
    limit,
  };
  const collectedScored = scoreVisualCandidates({ ...scoreInput, candidates: pool, candidateFeatures: poolFeatures });
  // 색상·용어 정보를 전혀 못 얻었으면(이미지 로드 실패 + Gemini 불가) 분야 일치(같은 분야·계열)만으로 판단한다.
  const hasVisualData = Boolean(targetFeatures) || profileKeys.size > 0;
  const collected = hasVisualData
    ? relevantCollectedItems(collectedScored, limit)
    : collectedScored
        .filter((entry) => entry.medium !== null && entry.medium >= 0.55)
        .slice(0, limit)
        .map((entry) => entry.item);

  if (collected.length >= limit) {
    return { items: collected, collectedCount: collected.length, usedRemote: false };
  }

  // 수집 레퍼런스가 부족할 때만 Unsplash
  const remote = (await options.fetchRemote()).filter((item) => !isCollectedReference(item));
  if (signal.aborted) {
    return { items: [], collectedCount: 0, usedRemote: false };
  }
  const remoteFeatures = targetFeatures
    ? await getColorFeaturesForItems(remote, signal)
    : new Map<string, ColorFeatures>();
  if (signal.aborted) {
    return { items: [], collectedCount: 0, usedRemote: false };
  }
  const remoteScored = scoreVisualCandidates({ ...scoreInput, candidates: remote, candidateFeatures: remoteFeatures });
  return {
    items: composeCollectedFirst(collected, remoteScored, limit),
    collectedCount: collected.length,
    usedRemote: true,
  };
}

/** 시각 분석이 불가능할 때의 대체 추천: 시각 태그가 실제로 겹치는 항목만 (무작위 채우기 없음) */
function rankTagMatchedImages(
  selected: ReferenceItem,
  catalog: ReferenceItem[],
  limit: number,
): ReferenceItem[] {
  return rankCatalogRelatedImages(
    selected,
    catalog.filter((item) => isSafeReference(item)),
    limit,
    { requireOverlap: true },
  );
}

function mergeReferenceItemsById(...groups: ReferenceItem[][]): ReferenceItem[] {
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const merged: ReferenceItem[] = [];

  for (const group of groups) {
    for (const item of group) {
      if (seenIds.has(item.id)) {
        continue;
      }
      const imageUrl = item.imageUrl?.trim();
      if (imageUrl && seenUrls.has(imageUrl)) {
        continue;
      }
      seenIds.add(item.id);
      if (imageUrl) {
        seenUrls.add(imageUrl);
      }
      merged.push(item);
    }
  }

  return merged;
}

function exploreItemKey(item: ReferenceItem, prefix: string): string {
  return `${prefix}:${item.source ?? "catalog"}:${item.id}`;
}

type GoogleDriveApiImage = {
  id?: string;
  source?: string;
  fileName?: string;
  category?: string;
  mimeType?: string;
  imageUrl?: string;
  tags?: string[];
  vision?: ReferenceVisionFields;
  description?: string;
  width?: number;
  height?: number;
};

function mapGoogleDriveImagesToReferenceItems(images: GoogleDriveApiImage[] | undefined): ReferenceItem[] {
  if (!Array.isArray(images)) {
    return [];
  }

  const items: ReferenceItem[] = [];
  const seen = new Set<string>();
  for (const row of images) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const driveId = typeof row.id === "string" ? row.id.trim() : "";
    const imageUrl = typeof row.imageUrl === "string" ? row.imageUrl.trim() : "";
    if (!driveId || !imageUrl || seen.has(driveId)) {
      continue;
    }
    seen.add(driveId);
    const fileName = typeof row.fileName === "string" ? row.fileName.trim() : "";
    const category = typeof row.category === "string" ? row.category.trim() : "";
    const description = typeof row.description === "string" ? row.description.trim() : "";
    const visualTags = Array.isArray(row.tags)
      ? row.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
      : [];
    const tags = [...new Set(visualTags.map((tag) => tag.trim()))];
    items.push({
      id: `google-drive-${driveId}`,
      type: "image",
      imageUrl,
      ratio: unsplashPhotoRatio(row.width, row.height),
      tags,
      source: "google-drive",
      ...(typeof row.width === "number" ? { width: row.width } : {}),
      ...(typeof row.height === "number" ? { height: row.height } : {}),
      ...(fileName ? { altDescription: fileName } : {}),
      ...(description ? { description } : {}),
      ...(category ? { searchQuery: category } : {}),
      ...(row.vision && typeof row.vision === "object" ? { vision: row.vision } : {}),
    });
  }
  return items;
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const name = "name" in error ? String(error.name) : "";
  const message = "message" in error ? String(error.message) : "";
  return name === "AbortError" || message.includes("aborted without reason") || message.includes("The operation was aborted");
}

function abortController(controller: AbortController) {
  if (controller.signal.aborted) {
    return;
  }
  try {
    controller.abort();
  } catch {
    /* React effect cleanup: abort is expected */
  }
}

async function fetchWithTimeout(input: string, signal: AbortSignal, timeoutMs: number): Promise<Response> {
  const local = new AbortController();
  const timeoutId = window.setTimeout(() => abortController(local), timeoutMs);
  const forwardAbort = () => abortController(local);
  if (signal.aborted) {
    abortController(local);
  } else {
    signal.addEventListener("abort", forwardAbort, { once: true });
  }
  try {
    return await fetch(input, { signal: local.signal });
  } finally {
    window.clearTimeout(timeoutId);
    signal.removeEventListener("abort", forwardAbort);
  }
}

async function fetchGoogleDriveReferenceItems(
  query = "",
  signal?: AbortSignal,
): Promise<{ ok: boolean; items: ReferenceItem[] }> {
  try {
    const url = query.trim()
      ? `/api/drive/images?q=${encodeURIComponent(query.trim())}`
      : "/api/drive/images";
    const response = signal
      ? await fetchWithTimeout(url, signal, query.trim() ? 8000 : 45000)
      : await fetch(url);
    const payload = (await response.json()) as { error?: string; images?: GoogleDriveApiImage[] };
    if (!response.ok) {
      console.error("[IDEAVE] Google Drive images failed", payload.error ?? `status ${response.status}`);
      return { ok: false, items: [] };
    }
    return { ok: true, items: mapGoogleDriveImagesToReferenceItems(payload.images) };
  } catch (error) {
    if (isAbortError(error)) {
      return { ok: false, items: [] };
    }
    console.error("[IDEAVE] Google Drive images failed", error);
    return { ok: false, items: [] };
  }
}

let driveCatalogInFlight: Promise<{ ok: boolean; items: ReferenceItem[] }> | null = null;

function loadGoogleDriveCatalog(): Promise<{ ok: boolean; items: ReferenceItem[] }> {
  if (driveCatalogInFlight) {
    return driveCatalogInFlight;
  }
  driveCatalogInFlight = fetchGoogleDriveReferenceItems()
    .catch((error: unknown) => {
      console.error("[IDEAVE] Google Drive home feed failed", error);
      return { ok: false, items: [] as ReferenceItem[] };
    })
    .finally(() => {
      driveCatalogInFlight = null;
    });
  return driveCatalogInFlight;
}

const HOME_FEED_REQUEST_URL = "/api/unsplash/search?feed=home&page=1";
let homeFeedInFlight: Promise<ReferenceItem[]> | null = null;

function loadHomeFeedReferenceItems(): Promise<ReferenceItem[]> {
  if (!UNSPLASH_FEED_ENABLED) {
    return Promise.resolve([]);
  }
  if (homeFeedInFlight) {
    return homeFeedInFlight;
  }

  homeFeedInFlight = (async () => {
    const response = await fetch(HOME_FEED_REQUEST_URL);
    const payload = (await response.json()) as { error?: string; results?: unknown };
    if (!response.ok) {
      throw new Error(payload.error || `Unsplash home feed failed (${response.status})`);
    }
    const items = mapUnsplashPhotosToReferenceItems(payload.results);
    if (items.length === 0) {
      homeFeedInFlight = null;
      throw new Error("Unsplash home feed returned no photos");
    }
    return items;
  })().catch((error: unknown) => {
    homeFeedInFlight = null;
    throw error;
  });

  return homeFeedInFlight;
}

const SEARCH_LOADING_MIN_MS = 700;

// 이미지가 다른 요청 뒤에 줄 서 있으면 캔버스 저장이 한참 멈춘 것처럼 보여서, 늦으면 카드 비율로 바로 놓는다.
const IMAGE_ASPECT_TIMEOUT_MS = 4000;

function loadImageAspectRatio(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const img = new Image();
    window.setTimeout(() => resolve(null), IMAGE_ASPECT_TIMEOUT_MS);
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve(img.naturalWidth / img.naturalHeight);
        return;
      }
      resolve(null);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function boardSizeFromAspect(aspect: number | null) {
  const baseWidth = 140;
  if (!aspect || aspect <= 0) {
    return { width: baseWidth, height: 105 };
  }

  const height = Math.min(220, Math.max(72, Math.round(baseWidth / aspect)));
  const width = Math.round(height * aspect);
  return { width, height };
}

function boardRectsIntersect(
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

function getSearchTagsForItem(item: ReferenceItem): string[] {
  return extractDesignKeywords(item, "", 10);
}

function getReferenceSourceLink(item: ReferenceItem): string {
  if (item.unsplashUrl?.trim()) {
    return item.unsplashUrl.trim();
  }
  const imageUrl = item.imageUrl?.trim() ?? "";
  if (imageUrl.startsWith("http")) {
    return `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}`;
  }
  if (imageUrl.startsWith("/") && typeof window !== "undefined") {
    const hint = item.altDescription || item.photographerName || "design reference";
    return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${hint} original`)}`;
  }
  const query = [item.altDescription, item.description, item.photographerName, "original source"]
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .slice(0, 3)
    .join(" ");
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query || "design reference original")}`;
}

/** 검색어·해시태그·시맨틱 검색 조건(전체/이미지/텍스트 탭과 무관) */
function matchesExploreSearchFilters(
  item: ReferenceItem,
  term: string,
  badgeFilterTag: string | null,
  semanticSearchActive: boolean,
): boolean {
  const itemTags = getSearchTagsForItem(item);

  if (badgeFilterTag) {
    if (!itemTags.includes(badgeFilterTag)) {
      return false;
    }
    if (!term || term === badgeFilterTag) {
      return true;
    }
    if (item.type === "text" && "키워드".includes(term)) {
      return true;
    }
    if (semanticSearchActive && Boolean(item.imageUrl)) {
      return true;
    }
    return itemTags.some((tag) => tag.includes(term));
  }

  if (!term) {
    return true;
  }

  if (semanticSearchActive && Boolean(item.imageUrl)) {
    return true;
  }

  if (item.type === "text" && "키워드".includes(term)) {
    return true;
  }

  const haystack = [
    ...itemTags,
    item.altDescription ?? "",
    item.description ?? "",
    item.searchQuery ?? "",
    item.textLabel ?? "",
  ]
    .join(" ")
    .toLowerCase();
  const expanded = expandKoreanDesignQuery(term);
  const hayExpanded = expandKoreanDesignQuery(haystack);
  const haySet = new Set([haystack, ...hayExpanded.map((token) => token.toLowerCase())]);
  return expanded.some((token) => haySet.has(token.toLowerCase()) || haystack.includes(token.toLowerCase()));
}

const BOARD_TEXT_PLACEHOLDER = "텍스트 입력";
const BOARD_TEXT_GENERIC_LABELS = new Set(["", BOARD_TEXT_PLACEHOLDER, "키워드", "text"]);
const FORUS_PROJECT_KEY = "forus.project";
const FORUS_MEMO_KEY = "forus.memo";
const FORUS_BOARD_KEY = "forus.board";
const FORUS_SESSION_KEY = "forus.session";
const FORUS_BROWSE_KEY = "forus.browse";
const FORUS_HOME_SHUFFLE_KEY = "forus.homeShuffle";
// v3: 비전 필드(vision)가 추가돼, 예전 세션 캐시(필드 없음)는 버리고 다시 받는다.
const FORUS_DRIVE_CATALOG_KEY = "ideave.driveCatalog.v3";

function readSessionItem(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionItem(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // ignore quota / private mode
  }
}

function removeSessionItem(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function clearLegacyLocalStorage() {
  try {
    window.localStorage.removeItem(FORUS_PROJECT_KEY);
    window.localStorage.removeItem(FORUS_MEMO_KEY);
    window.localStorage.removeItem(FORUS_BOARD_KEY);
    window.localStorage.removeItem(FORUS_SESSION_KEY);
    window.localStorage.removeItem(FORUS_BROWSE_KEY);
    window.localStorage.removeItem(FORUS_HOME_SHUFFLE_KEY);
  } catch {
    // ignore
  }
}

function readDriveCatalogSession(): ReferenceItem[] | null {
  const raw = readSessionItem(FORUS_DRIVE_CATALOG_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { items?: ReferenceItem[] };
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
      return null;
    }
    return parsed.items.filter(
      (item): item is ReferenceItem =>
        Boolean(item) &&
        typeof item.id === "string" &&
        item.type === "image" &&
        Boolean(item.imageUrl),
    );
  } catch {
    return null;
  }
}

function writeDriveCatalogSession(items: ReferenceItem[]) {
  if (items.length === 0) {
    return;
  }
  writeSessionItem(FORUS_DRIVE_CATALOG_KEY, JSON.stringify({ at: Date.now(), items }));
}

function getHomeShuffleSeed(): string {
  if (typeof window === "undefined") {
    return "home";
  }
  const existing = readSessionItem(FORUS_HOME_SHUFFLE_KEY);
  if (existing) {
    return existing;
  }
  const seed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  writeSessionItem(FORUS_HOME_SHUFFLE_KEY, seed);
  return seed;
}

function nextBoardIdSeed(items: BoardCanvasItem[]): number {
  let max = 0;
  for (const item of items) {
    const matched = /^board-(\d+)$/.exec(item.id);
    if (matched) {
      max = Math.max(max, Number(matched[1]) + 1);
    }
  }
  return max;
}

function clearIdeavePersistentState() {
  clearLegacyLocalStorage();
  removeSessionItem(FORUS_PROJECT_KEY);
  removeSessionItem(FORUS_MEMO_KEY);
  removeSessionItem(FORUS_BOARD_KEY);
  removeSessionItem(FORUS_SESSION_KEY);
  removeSessionItem(FORUS_BROWSE_KEY);
  removeSessionItem(FORUS_HOME_SHUFFLE_KEY);
}

function labelFromExploreTextRefId(refId: string): string | null {
  if (!refId.startsWith("explore-txt-")) {
    return null;
  }
  const label = refId.replace(/^explore-txt-\d+-/, "").trim();
  return label || null;
}

function expandBoardKeywordSignals(rawSignals: string[]): string[] {
  const out: string[] = [];
  for (const raw of rawSignals) {
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    const parts = expandKeywordSignalLabel(trimmed);
    for (const part of parts.length > 0 ? parts : [trimmed]) {
      if (part && !out.includes(part)) {
        out.push(part);
      }
    }
  }
  return out;
}

function resolveBoardTextLabel(bi: BoardCanvasItem, catalog: ReferenceItem[]): string {
  const candidates = [
    bi.text?.trim(),
    catalog.find((entry) => entry.id === bi.refId)?.textLabel?.trim(),
    labelFromExploreTextRefId(bi.refId),
  ];

  for (const candidate of candidates) {
    if (candidate && !BOARD_TEXT_GENERIC_LABELS.has(candidate)) {
      return candidate;
    }
  }

  return "";
}

function getBoardItemKeywordSignals(
  bi: BoardCanvasItem,
  catalog: ReferenceItem[],
): string[] {
  if (bi.type === "image") {
    const refItem = catalog.find((entry) => entry.id === bi.refId);
    if (!refItem) {
      return [];
    }
    return expandBoardKeywordSignals(getSearchTagsForItem(refItem));
  }

  if (bi.type === "text") {
    const label = resolveBoardTextLabel(bi, catalog);
    if (!label) {
      return [];
    }
    const signals = expandBoardKeywordSignals([label]);
    const category =
      bi.textCategory ?? catalog.find((entry) => entry.id === bi.refId)?.textCategory;
    if (category) {
      const categoryLabel = getExploreTextCategoryLabel(category);
      if (categoryLabel && !signals.includes(categoryLabel)) {
        signals.push(categoryLabel);
      }
    }
    return signals;
  }

  return [];
}

function buildBoardKeywordPayloadItem(
  bi: BoardCanvasItem,
  catalog: ReferenceItem[],
): { kind: "text" | "image"; signals: string[]; primaryLabel?: string; imageUrl?: string } | null {
  const signals = getBoardItemKeywordSignals(bi, catalog);

  if (bi.type === "text") {
    if (signals.length === 0) {
      return null;
    }
    const primaryLabel = resolveBoardTextLabel(bi, catalog);
    return {
      kind: "text",
      signals,
      ...(primaryLabel ? { primaryLabel } : {}),
    };
  }

  const imageUrl = bi.imageUrl?.trim();
  if (!imageUrl && signals.length === 0) {
    return null;
  }

  return {
    kind: "image",
    signals,
    ...(imageUrl ? { imageUrl } : {}),
  };
}

/** 오른쪽 인덱스 탭. 두 탭은 크기·모양이 같고 색만 반전(dark = 다크 바탕+흰 글자, lime = 라임 바탕+다크 글자). */
/** on이 꺼진 뒤에도 ms 동안 true를 유지해, 패널이 닫히는(밀려 들어가는) 모션이 끝난 다음에 사라지게 한다. */
function useStaysOnFor(on: boolean, ms: number) {
  const [lingering, setLingering] = useState(on);
  useEffect(() => {
    if (on) {
      setLingering(true);
      return;
    }
    const timer = window.setTimeout(() => setLingering(false), ms);
    return () => window.clearTimeout(timer);
  }, [on, ms]);
  return on || lingering;
}

// 등록된 프로젝트 탭에 마우스를 올리면 왼쪽으로 펼쳐지는 주제·키워드 영역 너비(H-1).
const INDEX_TAB_DETAIL_PX = 200;

/** "레트로, 따뜻한 / 미니멀" 같은 스타일·무드 입력을 키워드 칩으로 나눈다. */
function splitProjectKeywords(goal: string): string[] {
  const parts = goal
    .split(/[,，、·|/]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return (parts.length ? parts : [goal.trim()]).filter(Boolean).slice(0, 4);
}

function IndexTab({
  label,
  tone,
  active,
  onClick,
  detail,
}: {
  label: string;
  tone: "dark" | "lime";
  active: boolean;
  onClick: () => void;
  /** 있으면 호버 시 높이는 그대로, 왼쪽으로 넓어지며 주제와 키워드를 보여 준다. */
  detail?: { topic: string; keywords: string[] } | null;
}) {
  const toneClass = tone === "dark" ? "bg-[#222222] text-white" : "bg-[#F5F53D] text-[#222222]";
  const expandable = Boolean(detail) && !active;
  const widthClass = active
    ? "w-10"
    : expandable
      ? "w-[var(--index-tab-w)] hover:w-[calc(var(--index-tab-w)+200px)] focus-visible:w-[calc(var(--index-tab-w)+200px)]"
      : "w-[var(--index-tab-w)] hover:w-10";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={detail ? undefined : label}
      aria-label={detail ? `${detail.topic} · ${detail.keywords.join(", ")}` : undefined}
      className={`group/tab flex h-[150px] items-stretch justify-end overflow-hidden rounded-l-[4px] ${
        expandable ? `transition-[width] ${SIDE_PANEL_SLIDE_CLASS}` : "transition-[width] duration-150"
      } ${toneClass} ${widthClass}`}
    >
      {detail ? (
        <span
          aria-hidden
          style={{ width: INDEX_TAB_DETAIL_PX }}
          className={`flex shrink-0 translate-x-3 flex-col justify-center gap-2.5 py-4 pl-[18px] pr-1 text-left opacity-0 transition-[opacity,transform] ${SIDE_PANEL_SLIDE_CLASS} ${
            expandable ? "group-hover/tab:translate-x-0 group-hover/tab:opacity-100 group-focus-visible/tab:translate-x-0 group-focus-visible/tab:opacity-100" : ""
          }`}
        >
          <span className="font-[family-name:var(--font-pretendard)] text-[11px] font-semibold tracking-[0.08em] text-[#9A9A9A]">
            PROJECT
          </span>
          <span className="truncate font-[family-name:var(--font-pretendard)] text-[18px] font-bold leading-[1.25]">
            {detail.topic}
          </span>
          <span className="flex max-h-[52px] flex-wrap gap-1 overflow-hidden">
            {detail.keywords.map((keyword) => (
              <span
                key={keyword}
                className="whitespace-nowrap rounded-[3px] bg-[#F5F53D] px-2 py-[3px] font-[family-name:var(--font-pretendard)] text-[12px] font-semibold leading-normal text-[#222222]"
              >
                {keyword}
              </span>
            ))}
          </span>
        </span>
      ) : null}
      <span className="flex w-[var(--index-tab-w)] shrink-0 items-center justify-center group-aria-pressed/tab:w-10">
        <span className="max-h-[126px] overflow-hidden text-ellipsis whitespace-nowrap font-[family-name:var(--font-pretendard)] text-[13px] font-semibold tracking-[0.08em] [writing-mode:vertical-rl]">
          {label}
        </span>
      </span>
    </button>
  );
}

function formatBoardKeywordBubbleLabel(words: string[]): string {
  return words.slice(0, 3).join(", ");
}

type ProjectContext = {
  name: string;
  goal: string;
};

type TextDetailState = {
  label: string;
  category?: ExploreTextEntry["category"];
  definition: string;
  function: string;
  antonyms: string[];
  loading: boolean;
};

type ExploreNavSnapshot = {
  selectedId: string;
  textDetail: TextDetailState | null;
  textRelatedForLabel: string | null;
};

/** Canvas workspace plus explore UI restored on Ctrl+R within the same tab. */
type IdeaveCanvasWorkspaceState = {
  v: 3;
  boardOpen: boolean;
  query: string;
  filter: "all" | "image" | "text";
  selectedId: string;
  badgeFilterTag: string | null;
  activeTag: string;
  browseRecommendQuery: string | null;
  projectDiscoverQuery: string | null;
  textDetail: TextDetailState | null;
  boardViewScale: number;
  boardViewPan: { x: number; y: number };
  boardKeywords: string[] | null;
  boardKeywordResultKey: string;
  boardKeywordExtractKey: string;
};

export function ReferencePrototypePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // boardShown: 캔버스를 펼친 상태(탭·밀려 나오는 모션 기준). boardOpen: 닫힐 때 모션이 끝날 때까지 자리를 유지하는 레이아웃 기준.
  const [boardShown, setBoardOpen] = useState(false);
  const boardOpen = useStaysOnFor(boardShown, SIDE_PANEL_SLIDE_MS);
  const [boardPanelWidth, setBoardPanelWidth] = useState(BOARD_PANEL_DEFAULT_PX);
  const [viewportWidth, setViewportWidth] = useState(1440);
  const [boardPanelResizing, setBoardPanelResizing] = useState(false);
  const [filter, setFilter] = useState<"all" | "image" | "text">("all");
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [badgeFilterTag, setBadgeFilterTag] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [boardItems, setBoardItems] = useState<BoardCanvasItem[]>([]);
  const [draggingRefId, setDraggingRefId] = useState("");
  const [memo, setMemo] = useState("");
  const [uploadedItems, setUploadedItems] = useState<ReferenceItem[]>([]);
  const [homeFeedItems, setHomeFeedItems] = useState<ReferenceItem[]>([]);
  const [driveItems, setDriveItems] = useState<ReferenceItem[]>([]);
  const [vectorSearchResults, setVectorSearchResults] = useState<ReferenceItem[] | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  /** 검색어(키워드 클릭 포함)로 Drive·Unsplash 결과를 모으는 중인지. 로딩 안내를 띄우는 데 쓴다. */
  const [searchRunning, setSearchRunning] = useState(false);
  const [similarBelow, setSimilarBelow] = useState<{
    forId: string | null;
    loading: boolean;
    items: ReferenceItem[];
    /** 색상·무드·스타일 시각 유사도 분석이 아직 진행 중 (임시 결과 표시 중) */
    analyzing?: boolean;
    /** 선택 이미지의 Gemini 시각 프로필 (텍스트 레퍼런스 추천에 사용) */
    profile?: VisualProfile | null;
  }>({ forId: null, loading: false, items: [] });
  const [relatedSessionItems, setRelatedSessionItems] = useState<ReferenceItem[]>([]);
  const [textRelated, setTextRelated] = useState<{
    forLabel: string | null;
    loading: boolean;
    images: ReferenceItem[];
  }>({ forLabel: null, loading: false, images: [] });
  const [boardSelectedIds, setBoardSelectedIds] = useState<Set<string>>(() => new Set());
  const [boardViewScale, setBoardViewScale] = useState(1);
  const [boardViewPan, setBoardViewPan] = useState({ x: 0, y: 0 });
  const [boardKeywords, setBoardKeywords] = useState<string[] | null>(null);
  const [boardKeywordLoading, setBoardKeywordLoading] = useState(false);
  const [boardKeywordCount, setBoardKeywordCount] = useState(3);
  const [boardKeywordExtractNonce, setBoardKeywordExtractNonce] = useState(0);
  const [boardKeywordExtractKey, setBoardKeywordExtractKey] = useState("");
  const [boardKeywordResultKey, setBoardKeywordResultKey] = useState("");
  const [boardClearConfirmOpen, setBoardClearConfirmOpen] = useState(false);
  const [boardExportOpen, setBoardExportOpen] = useState(false);
  const [boardExporting, setBoardExporting] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const projectPanelMounted = useStaysOnFor(projectModalOpen, SIDE_PANEL_SLIDE_MS);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [project, setProject] = useState<ProjectContext | null>(null);
  const [projectDiscoverQuery, setProjectDiscoverQuery] = useState<string | null>(null);
  const [projectDiscoverLoading, setProjectDiscoverLoading] = useState(false);
  const [projectExploreTexts, setProjectExploreTexts] = useState<ExploreTextEntry[]>([]);
  /** 프로젝트 무드 키워드의 시각 정보 기반 메인 추천. 분석이 끝나기 전에는 메인 레퍼런스를 보여주지 않는다. */
  const [projectVisual, setProjectVisual] = useState<{
    key: string;
    status: "loading" | "ready";
    items: ReferenceItem[];
    texts: ExploreTextEntry[];
  } | null>(null);
  const [browseTerms, setBrowseTerms] = useState<string[]>([]);
  const [browseRecommendQuery, setBrowseRecommendQuery] = useState<string | null>(null);
  const [queryExploreTexts, setQueryExploreTexts] = useState<ExploreTextEntry[]>([]);
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [searchSuggestionsLoading, setSearchSuggestionsLoading] = useState(false);
  const [searchSuggestionsOpen, setSearchSuggestionsOpen] = useState(false);
  const searchFocusLockRef = useRef(false);
  const searchSuggestionsCacheRef = useRef<Map<string, string[]>>(new Map());
  const searchInputRef = useRef<HTMLDivElement | null>(null);
  const searchInputPlaceholderRef = useRef<HTMLDivElement | null>(null);
  const searchInputFloatingRef = useRef<HTMLDivElement | null>(null);
  const searchHashtagPanelRef = useRef<HTMLDivElement | null>(null);
  const [searchInputLayout, setSearchInputLayout] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const boardCanvasRef = useRef<HTMLDivElement | null>(null);
  const boardWorldRef = useRef<HTMLDivElement | null>(null);
  const boardRubberElRef = useRef<HTMLDivElement | null>(null);
  const boardBubbleElRef = useRef<HTMLDivElement | null>(null);
  const boardViewScaleRef = useRef(1);
  const boardViewPanRef = useRef({ x: 0, y: 0 });
  const boardSpacePressedRef = useRef(false);
  const boardBandStartRef = useRef<{ sx: number; sy: number; skipDeselect: boolean } | null>(null);
  const boardKeywordFetchGenRef = useRef(0);
  const boardKeywordExtractKeyRef = useRef("");
  const boardItemsRef = useRef<BoardCanvasItem[]>([]);
  /** Ctrl+C로 복사한 캔버스 카드(앱 내부 클립보드) */
  const boardClipboardRef = useRef<BoardCanvasItem[]>([]);
  const boardPasteCountRef = useRef(0);
  /** Ctrl+Z용: 캔버스 카드 목록이 바뀌기 직전 상태들 */
  const boardHistoryRef = useRef<BoardCanvasItem[][]>([]);
  const boardHistoryPrevRef = useRef<BoardCanvasItem[] | null>(null);
  const boardHistoryArmedRef = useRef(false);
  const boardUndoingRef = useRef(false);
  const boardSelectedIdsRef = useRef<Set<string>>(boardSelectedIds);
  const boardLiveGestureRef = useRef(false);
  const cameraCommitTimerRef = useRef<number | null>(null);
  const mergedCatalogForBoardRef = useRef<ReferenceItem[]>(REFERENCES);
  const draggingRefItemRef = useRef<ReferenceItem | null>(null);
  const exploreTopRef = useRef<HTMLDivElement | null>(null);
  const detailAnchorRef = useRef<HTMLDivElement | null>(null);
  const stickyChromeRef = useRef<HTMLDivElement | null>(null);
  const filterNavRef = useRef<HTMLDivElement | null>(null);
  const filterChromeRef = useRef<HTMLDivElement | null>(null);
  const exploreNavStackRef = useRef<ExploreNavSnapshot[]>([]);
  const filterNavLastScrollYRef = useRef(0);
  const filterNavScrollDownAccumRef = useRef(0);
  const filterNavScrollUpAccumRef = useRef(0);
  const filterNavLastToggleAtRef = useRef(0);
  const filterNavVisibleRef = useRef(true);
  const searchEpochRef = useRef(0);
  const idRef = useRef(0);
  const boardStackOffsetRef = useRef(0);
  const boardResizeGestureRef = useRef<{
    id: string;
    origin: { x: number; y: number; width: number; height: number };
    starts: Map<string, { x: number; y: number; width: number; height: number }>;
  } | null>(null);
  const [filterNavHidden, setFilterNavHidden] = useState(false);
  const [textDetail, setTextDetail] = useState<TextDetailState | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [driveCatalogReady, setDriveCatalogReady] = useState(false);

  const term = query.trim().replace(/^#/, "");
  // 입력 직후(디바운스 대기)부터 검색 effect가 끝날 때까지를 검색 중으로 본다.
  const searchPending = Boolean(term) && (term !== debouncedSearch.trim() || searchRunning);
  const semanticSearchActive = vectorSearchResults !== null || Boolean(debouncedSearch.trim());
  const projectVisualKey = project ? `${project.name}\u001f${project.goal}` : "";
  const projectVisualReady = Boolean(
    projectVisual && projectVisual.key === projectVisualKey && projectVisual.status === "ready",
  );
  const mergedCatalog = useMemo(() => {
    const seed = sessionReady ? getHomeShuffleSeed() : "home";
    const collectedHome = mergeReferenceItemsById(uploadedItems, driveItems);
    const remoteHome =
      driveCatalogReady && needsUnsplashFill(collectedHome) ? homeFeedItems : [];
    const pool = mergeReferenceItemsById(
      uploadedItems,
      mixDrivePriorityFeed(driveItems, remoteHome, seed),
    );
    const poolHasImages = pool.some((item) => item.type !== "text" && Boolean(item.imageUrl));
    const searchLabel = debouncedSearch.trim();
    const semanticHits = (vectorSearchResults ?? []).filter(
      (item) => item.type !== "text" && Boolean(item.imageUrl),
    );

    const rankCollectedThenRemote = (terms: string[], rankSeed: string, requireMatch: boolean) => {
      const collected = mergeReferenceItemsById(uploadedItems, driveItems);
      const collectedRanked = requireMatch
        ? filterMatchedReferenceItems(collected, terms, `${rankSeed}:drive`)
        : rankReferenceItemsByTerms(collected, terms, `${rankSeed}:drive`);
      const remote = needsUnsplashFill(collectedRanked) ? homeFeedItems : [];
      const remoteRanked = requireMatch
        ? filterMatchedReferenceItems(remote, terms, `${rankSeed}:unsplash`)
        : rankReferenceItemsByTerms(remote, terms, `${rankSeed}:unsplash`);
      return mixDrivePriorityFeed(collectedRanked, remoteRanked, rankSeed, { shuffle: false });
    };

    let liveItems = pool;
    if (searchLabel) {
      const searchTerms = [searchLabel, ...expandKoreanDesignQuery(searchLabel)];
      const driveMatches = filterMatchedReferenceItems(
        mergeReferenceItemsById(uploadedItems, driveItems),
        searchTerms,
        `${seed}:search-drive`,
      );
      const { collected: hitCollected, remote: hitRemote } = splitCollectedAndRemote(semanticHits);
      const homeUnsplashMatches =
        hitRemote.length > 0
          ? hitRemote
          : filterMatchedReferenceItems(homeFeedItems, searchTerms, `${seed}:search-unsplash`);
      liveItems = mixDrivePriorityFeed(
        mergeReferenceItemsById(driveMatches, hitCollected),
        homeUnsplashMatches,
        `${seed}:search`,
        { shuffle: false },
      );
    } else if (!searchLabel && project) {
      // 프로젝트 무드 키워드의 색상·스타일·분야 유사도 분석 결과만 보여준다.
      // 분석 전에는 빈 목록(목업·기존 피드로 채우지 않음) → 화면에는 분석 중 문구가 뜬다.
      return projectVisualReady && projectVisual ? projectVisual.items : [];
    } else if (!searchLabel && browseRecommendQuery && poolHasImages) {
      liveItems = rankCollectedThenRemote(browseTerms, `${seed}:browse`, false);
    } else if (semanticHits.length > 0) {
      const { collected, remote } = splitCollectedAndRemote(semanticHits);
      liveItems = mixDrivePriorityFeed(
        mergeReferenceItemsById(uploadedItems, driveItems, collected),
        remote,
        `${seed}:hits`,
        { shuffle: false },
      );
    }

    const hasRealImages = liveItems.some((item) => item.type !== "text" && Boolean(item.imageUrl));
    if (hasRealImages) {
      return liveItems;
    }
    if (searchLabel || !UNSPLASH_FEED_ENABLED || !driveCatalogReady) {
      return liveItems;
    }
    return mergeReferenceItemsById(liveItems, REFERENCES);
  }, [
    uploadedItems,
    homeFeedItems,
    driveItems,
    driveCatalogReady,
    vectorSearchResults,
    sessionReady,
    debouncedSearch,
    project,
    projectVisual,
    projectVisualReady,
    browseRecommendQuery,
    browseTerms,
  ]);

  // 상세 화면 유사도 추천의 후보군·선택 항목 조회용: 메인 그리드가 프로젝트 추천으로 좁혀져도
  // 전체 수집 레퍼런스(Drive·업로드·홈 피드)에서 찾을 수 있게 합친다.
  const detailCatalog = useMemo(
    () =>
      mergeReferenceItemsById(mergedCatalog, relatedSessionItems, uploadedItems, driveItems, homeFeedItems),
    [mergedCatalog, relatedSessionItems, uploadedItems, driveItems, homeFeedItems],
  );

  boardItemsRef.current = boardLiveGestureRef.current ? boardItemsRef.current : boardItems;
  boardSelectedIdsRef.current = boardSelectedIds;

  // 카드 추가·삭제·이동(손을 뗄 때 한 번 커밋)·붙여넣기·비우기마다 직전 상태를 쌓아 Ctrl+Z로 되돌린다.
  // 세션 복원으로 채워지는 첫 변경은 기록하지 않는다(되돌리면 캔버스가 비어 버리므로).
  useEffect(() => {
    const previous = boardHistoryPrevRef.current;
    boardHistoryPrevRef.current = boardItems;
    if (boardUndoingRef.current) {
      boardUndoingRef.current = false;
      return;
    }
    if (!boardHistoryArmedRef.current || previous === null || previous === boardItems) {
      return;
    }
    boardHistoryRef.current.push(previous);
    if (boardHistoryRef.current.length > BOARD_HISTORY_LIMIT) {
      boardHistoryRef.current.shift();
    }
  }, [boardItems]);

  useEffect(() => {
    if (sessionReady) {
      boardHistoryArmedRef.current = true;
    }
  }, [sessionReady]);
  mergedCatalogForBoardRef.current = detailCatalog;
  const selectedItem = detailCatalog.find((item) => item.id === selectedId) ?? null;
  const selectedImageItem =
    selectedItem && selectedItem.type !== "text" ? selectedItem : null;
  const selectedTextItem =
    selectedItem?.type === "text" && selectedItem.textLabel ? selectedItem : null;

  const scrollToExploreAnchor = useCallback((anchor: HTMLElement | null) => {
    filterNavVisibleRef.current = true;
    filterNavScrollDownAccumRef.current = 0;
    filterNavScrollUpAccumRef.current = 0;
    filterNavLastScrollYRef.current = window.scrollY;
    setFilterNavHidden(false);

    const run = () => {
      const target = anchor;
      if (!target) {
        return;
      }

      const chromeBottom = stickyChromeRef.current?.getBoundingClientRect().bottom ?? 0;
      const overlayRect = filterChromeRef.current?.getBoundingClientRect();
      const filterRect = filterNavRef.current?.getBoundingClientRect();
      const overlayBottom =
        overlayRect && overlayRect.height > 2 ? overlayRect.bottom : chromeBottom;
      const filterOverlayBottom =
        overlayBottom > chromeBottom
          ? overlayBottom
          : filterNavVisibleRef.current && filterRect && filterRect.height > 2
            ? filterRect.bottom
            : chromeBottom;
      const offset = Math.ceil(filterOverlayBottom + 20);
      target.style.scrollMarginTop = `${offset}px`;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(run);
    });
  }, []);

  const scrollToExploreTop = useCallback(() => {
    scrollToExploreAnchor(exploreTopRef.current);
  }, [scrollToExploreAnchor]);

  const scrollDetailIntoView = useCallback(() => {
    scrollToExploreAnchor(detailAnchorRef.current ?? exploreTopRef.current);
  }, [scrollToExploreAnchor]);

  useEffect(() => {
    filterNavLastScrollYRef.current = window.scrollY;
    filterNavVisibleRef.current = true;

    const setFilterNavVisible = (visible: boolean) => {
      if (filterNavVisibleRef.current === visible) {
        return;
      }
      filterNavVisibleRef.current = visible;
      filterNavLastToggleAtRef.current = performance.now();
      filterNavScrollDownAccumRef.current = 0;
      filterNavScrollUpAccumRef.current = 0;
      setFilterNavHidden(!visible);
    };

    const onScroll = () => {
      const currentY = window.scrollY;
      const delta = currentY - filterNavLastScrollYRef.current;
      filterNavLastScrollYRef.current = currentY;

      if (performance.now() - filterNavLastToggleAtRef.current < FILTER_NAV_TOGGLE_COOLDOWN_MS) {
        return;
      }

      if (Math.abs(delta) < FILTER_NAV_DELTA_MIN) {
        return;
      }

      // 아래로 내리며 레퍼런스를 훑을 때는 필터 바를 보여 주고, 위로 올릴 때는 숨겨
      // 다시 보는 위쪽 이미지를 가리지 않게 한다(사용자 요청). 맨 위로 올라와도 숨긴 상태를 유지해
      // 첫 줄 이미지 윗부분이 가려지지 않는다.
      if (filterNavVisibleRef.current) {
        if (delta < 0) {
          filterNavScrollUpAccumRef.current += -delta;
          if (filterNavScrollUpAccumRef.current >= FILTER_NAV_HIDE_DISTANCE) {
            setFilterNavVisible(false);
          }
        } else {
          filterNavScrollUpAccumRef.current = 0;
        }
        return;
      }

      if (delta > 0) {
        filterNavScrollDownAccumRef.current += delta;
        if (filterNavScrollDownAccumRef.current >= FILTER_NAV_REVEAL_DISTANCE) {
          setFilterNavVisible(true);
        }
      } else {
        filterNavScrollDownAccumRef.current = 0;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const fetchTextDetail = useCallback(async (label: string, category?: ExploreTextEntry["category"]) => {
    setTextDetail({
      label,
      category,
      definition: "",
      function: "",
      antonyms: [],
      loading: true,
    });

    try {
      const response = await fetch("/api/explore/text-detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, category }),
      });
      const payload = (await response.json()) as {
        definition?: string;
        function?: string;
        antonyms?: string[];
      };

      setTextDetail({
        label,
        category,
        definition: payload.definition?.trim() ?? "",
        function: payload.function?.trim() ?? "",
        antonyms: Array.isArray(payload.antonyms)
          ? payload.antonyms
              .map((entry) => (typeof entry === "string" ? entry.trim().replace(/^#/, "") : ""))
              .filter(Boolean)
              .slice(0, 3)
          : [],
        loading: false,
      });
    } catch {
      setTextDetail({
        label,
        category,
        definition: `${label}에 대한 정의를 불러오지 못했습니다.`,
        function: "레퍼런스 탐색 시 방향 설정·키워드 확장에 활용할 수 있습니다.",
        antonyms: [],
        loading: false,
      });
    }
  }, []);

  const beginDragToBoard = useCallback((item: ReferenceItem) => {
    setDraggingRefId(item.id);
    draggingRefItemRef.current = item;
    setBoardOpen(true);
  }, []);

  const clearExploreDetail = useCallback(() => {
    exploreNavStackRef.current = [];
    setSelectedId("");
    setTextDetail(null);
    setTextRelated({ forLabel: null, loading: false, images: [] });
    setSimilarBelow({ forId: null, loading: false, items: [] });
  }, []);

  const pushExploreNavSnapshot = useCallback(() => {
    exploreNavStackRef.current.push({
      selectedId,
      textDetail: textDetail ? { ...textDetail } : null,
      textRelatedForLabel: textRelated.forLabel,
    });
  }, [selectedId, textDetail, textRelated.forLabel]);

  const navigateExploreBack = useCallback(() => {
    const previous = exploreNavStackRef.current.pop();
    if (!previous) {
      clearExploreDetail();
      return;
    }

    setSelectedId(previous.selectedId);
    setTextDetail(previous.textDetail);
    setSimilarBelow({ forId: null, loading: false, items: [] });

    if (previous.textDetail?.label) {
      const needsTextRefetch =
        previous.textDetail.loading || !previous.textDetail.definition.trim();
      setTextRelated({
        forLabel: previous.textDetail.label,
        loading: needsTextRefetch,
        images: [],
      });
      if (needsTextRefetch) {
        void fetchTextDetail(previous.textDetail.label, previous.textDetail.category);
      }
    } else {
      setTextRelated({
        forLabel: previous.textRelatedForLabel,
        loading: false,
        images: [],
      });
    }

    scrollToExploreTop();
  }, [clearExploreDetail, fetchTextDetail, scrollToExploreTop]);

  const recordBrowseTerm = useCallback((raw: string) => {
    const next = raw.trim().replace(/^#/, "");
    if (!next || isGenericExploreTextLabel(next) || next.length < 2) {
      return;
    }
    setBrowseTerms((prev) => {
      const key = next.toLowerCase();
      const merged = [next, ...prev.filter((term) => term.toLowerCase() !== key)].slice(0, 24);
      writeSessionItem(FORUS_BROWSE_KEY, JSON.stringify(merged));
      return merged;
    });
  }, []);

  const closeSearchSuggestions = useCallback(() => {
    searchFocusLockRef.current = true;
    setSearchSuggestionsOpen(false);
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
    window.setTimeout(() => {
      searchFocusLockRef.current = false;
    }, 200);
  }, []);

  const selectExploreImage = useCallback(
    (id: string) => {
      closeSearchSuggestions();
      if (id === selectedId) {
        return;
      }
      pushExploreNavSnapshot();
      setFilter("all");
      setSelectedId(id);
      setTextDetail(null);
      setTextRelated({ forLabel: null, loading: false, images: [] });
      const item = mergedCatalogForBoardRef.current.find((entry) => entry.id === id);
      if (item) {
        for (const keyword of extractDesignKeywords(item).slice(0, 6)) {
          recordBrowseTerm(keyword);
        }
      }
    },
    [closeSearchSuggestions, selectedId, pushExploreNavSnapshot, recordBrowseTerm],
  );

  const openCanvasImageDetail = useCallback(
    (card: BoardCanvasItem) => {
      if (card.type !== "image" || !card.imageUrl) {
        return;
      }

      const existing = mergedCatalogForBoardRef.current.find((entry) => entry.id === card.refId);
      if (!existing || existing.type === "text") {
        const fallback: ReferenceItem = {
          id: card.refId,
          type: "image",
          ratio:
            card.baseWidth && card.baseHeight && card.baseHeight > 0
              ? `${card.baseWidth} / ${card.baseHeight}`
              : "4 / 5",
          imageUrl: card.imageUrl,
          source: "google-drive",
        };
        setRelatedSessionItems((prev) => mergeReferenceItemsById(prev, [fallback]));
      }

      selectExploreImage(card.refId);
      scrollToExploreTop();
    },
    [selectExploreImage, scrollToExploreTop],
  );

  const selectExploreText = useCallback(
    (item: ReferenceItem) => {
      const label = item.textLabel?.trim();
      if (!label) {
        return;
      }
      closeSearchSuggestions();
      if (item.id === selectedId && textDetail?.label === label) {
        return;
      }
      pushExploreNavSnapshot();
      setFilter("all");
      setSelectedId(item.id);
      setSimilarBelow({ forId: null, loading: false, items: [] });
      setTextRelated({ forLabel: label, loading: true, images: [] });
      recordBrowseTerm(label);
      void fetchTextDetail(label, item.textCategory);
    },
    [closeSearchSuggestions, selectedId, textDetail?.label, pushExploreNavSnapshot, fetchTextDetail, recordBrowseTerm],
  );

  const clearTextSelection = useCallback(() => {
    setSelectedId("");
    setTextDetail(null);
    setTextRelated({ forLabel: null, loading: false, images: [] });
  }, []);

  const clearImageSelection = useCallback(() => {
    setSelectedId("");
    setSimilarBelow({ forId: null, loading: false, items: [] });
  }, []);

  const goToExploreHome = useCallback(() => {
    clearExploreDetail();
    setQuery("");
    setDebouncedSearch("");
    setQueryExploreTexts([]);
    setBadgeFilterTag(null);
    setActiveTag("");
    setFilter("all");
    setSearchSuggestionsOpen(false);
    setRelatedSessionItems([]);
    setSimilarBelow({ forId: null, loading: false, items: [] });
    setBrowseRecommendQuery(null);
    setVectorSearchResults(null);
    setProjectDiscoverQuery(null);
    setProjectDiscoverLoading(false);
    setFilterNavHidden(false);
    filterNavVisibleRef.current = true;
    filterNavScrollDownAccumRef.current = 0;
    filterNavScrollUpAccumRef.current = 0;
    // 홈은 처음 화면처럼 캔버스 패널을 닫는다. 보드 내용은 그대로 두고 패널만 숨긴다(전체 리셋 아님).
    setBoardOpen(false);
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });

    const memoryQuery = composeBrowseRecommendQuery(browseTerms);
    if (memoryQuery) {
      setBrowseRecommendQuery(memoryQuery);
    } else if (project) {
      setProjectDiscoverQuery(composeProjectDiscoverQuery(project.name, project.goal));
      setProjectDiscoverLoading(true);
    } else if (!project) {
      searchEpochRef.current += 1;
      const loadShortageUnsplash = (collected: ReferenceItem[]) => {
        if (!UNSPLASH_FEED_ENABLED || !needsUnsplashFill(collected) || homeFeedItems.length > 0) {
          return;
        }
        void loadHomeFeedReferenceItems()
          .then((items) => {
            setHomeFeedItems(items);
          })
          .catch((error: unknown) => {
            console.error("[IDEAVE] Unsplash home feed failed", error);
          });
      };
      if (driveItems.length === 0) {
        void fetchGoogleDriveReferenceItems()
          .then((result) => {
            if (result.ok) {
              setDriveItems(result.items);
              loadShortageUnsplash(mergeReferenceItemsById(uploadedItems, result.items));
              return;
            }
            loadShortageUnsplash(uploadedItems);
          })
          .catch((error: unknown) => {
            console.error("[IDEAVE] Google Drive home feed failed", error);
            loadShortageUnsplash(uploadedItems);
          });
      } else {
        loadShortageUnsplash(mergeReferenceItemsById(uploadedItems, driveItems));
      }
    }

    if (typeof window !== "undefined" && `${window.location.pathname}${window.location.search}` !== "/") {
      router.replace("/", { scroll: false });
    }
  }, [
    browseTerms,
    clearExploreDetail,
    driveItems,
    homeFeedItems.length,
    project,
    router,
    uploadedItems,
  ]);

  const handleSearchInputChange = useCallback(
    (next: string) => {
      setQuery(next);
      setActiveTag("");
      setBadgeFilterTag(null);
      if (next.trim()) {
        setFilter("all");
        setProjectDiscoverQuery(null);
        setBrowseRecommendQuery(null);
        setProjectDiscoverLoading(false);
        clearExploreDetail();
      }
    },
    [clearExploreDetail],
  );

  const commitSearch = useCallback(
    (raw?: string) => {
      const next = (raw ?? query).trim();
      setSearchSuggestionsOpen(false);
      setActiveTag("");
      setBadgeFilterTag(null);
      setQuery(raw !== undefined ? raw : query);
      if (!next) {
        setDebouncedSearch("");
        return;
      }
      setQuery(next);
      setDebouncedSearch(next);
      setFilter("all");
      setProjectDiscoverQuery(null);
      setBrowseRecommendQuery(null);
      setProjectDiscoverLoading(false);
      recordBrowseTerm(next.replace(/^#/, ""));
      clearExploreDetail();
    },
    [clearExploreDetail, query, recordBrowseTerm],
  );

  const searchFromSharedKeyword = useCallback(
    (raw: string) => {
      const kw = raw.trim();
      if (!kw) {
        return;
      }
      setFilter("all");
      setProjectDiscoverQuery(null);
      setBadgeFilterTag(null);
      setActiveTag("");
      clearExploreDetail();
      setQuery(kw);
      setDebouncedSearch(kw);
      setSearchSuggestionsOpen(false);
      recordBrowseTerm(kw.replace(/^#/, ""));
    },
    [clearExploreDetail, recordBrowseTerm],
  );

  const handleProjectStart = useCallback((projectName: string, goal: string) => {
    setProject({ name: projectName, goal });
    setMemo(`${projectName} | ${goal}`);
    setProjectModalOpen(false);
    setQuery("");
    setBadgeFilterTag(null);
    setActiveTag("");
    clearExploreDetail();
    setProjectDiscoverQuery(composeProjectDiscoverQuery(projectName, goal));
    setBrowseRecommendQuery(null);
    setProjectExploreTexts(seedProjectExploreTexts(projectName, goal));
    setProjectDiscoverLoading(false);
    searchSuggestionsCacheRef.current.clear();
    setSearchSuggestions([]);
    setSearchSuggestionsOpen(false);
  }, [clearExploreDetail]);

  const handleProjectUpdate = useCallback(
    (projectName: string, goal: string) => {
      setProject({ name: projectName, goal });
      setMemo(`${projectName} | ${goal}`);
      setProjectModalOpen(false);
      setQuery("");
      setBadgeFilterTag(null);
      setActiveTag("");
      setFilter("all");
      clearExploreDetail();
      setProjectDiscoverQuery(composeProjectDiscoverQuery(projectName, goal));
      setBrowseRecommendQuery(null);
      setProjectExploreTexts(seedProjectExploreTexts(projectName, goal));
      setProjectDiscoverLoading(false);
      searchSuggestionsCacheRef.current.clear();
      setSearchSuggestions([]);
      setSearchSuggestionsOpen(false);
      scrollToExploreTop();
    },
    [clearExploreDetail, scrollToExploreTop],
  );

  const handleProjectReset = useCallback(() => {
    searchEpochRef.current += 1;
    setProject(null);
    setProjectVisual(null);
    setMemo("");
    setProjectDiscoverQuery(null);
    setProjectDiscoverLoading(false);
    setProjectExploreTexts([]);
    searchSuggestionsCacheRef.current.clear();
    setSearchSuggestions([]);
    setSearchSuggestionsOpen(false);
    setQuery("");
    setDebouncedSearch("");
    setQueryExploreTexts([]);
    setBadgeFilterTag(null);
    setActiveTag("");
    setFilter("all");
    clearExploreDetail();
    setVectorSearchResults(null);
    setBrowseTerms([]);
    setBrowseRecommendQuery(null);
    setRelatedSessionItems([]);
    setBoardOpen(false);
    setBoardItems([]);
    setBoardSelectedIds(new Set());
    if (boardRubberElRef.current) {
      boardRubberElRef.current.style.display = "none";
    }
    boardBandStartRef.current = null;
    setBoardKeywords(null);
    setBoardKeywordLoading(false);
    setBoardKeywordExtractNonce(0);
    setBoardKeywordExtractKey("");
    setBoardKeywordResultKey("");
    boardKeywordExtractKeyRef.current = "";
    setBoardViewScale(1);
    setBoardViewPan({ x: 0, y: 0 });
    boardViewScaleRef.current = 1;
    boardViewPanRef.current = { x: 0, y: 0 };
    idRef.current = 0;
    boardStackOffsetRef.current = 0;
    clearIdeavePersistentState();
    scrollToExploreTop();
  }, [clearExploreDetail, scrollToExploreTop]);

  const fetchSearchSuggestions = useCallback(async () => {
    setSearchSuggestionsOpen(true);

    if (!driveCatalogReady && driveItems.length === 0 && uploadedItems.length === 0) {
      setSearchSuggestionsLoading(true);
      return;
    }

    const cacheKey = `${project ? `${project.name}\x1f${project.goal}` : "home"}\x1f${driveItems.length}\x1f${uploadedItems.length}`;
    const cached = searchSuggestionsCacheRef.current.get(cacheKey);
    if (cached) {
      setSearchSuggestions(cached);
      setSearchSuggestionsLoading(false);
      return;
    }

    setSearchSuggestionsLoading(true);

    const collected = mergeReferenceItemsById(uploadedItems, driveItems);
    const boostTerms = project ? termsFromProjectContext(project.name, project.goal) : [];
    const list = collectCatalogSearchHashtags(collected, {
      limit: SEARCH_HASHTAG_LIMIT,
      boostTerms,
    });

    searchSuggestionsCacheRef.current.set(cacheKey, list);
    setSearchSuggestions(list);
    setSearchSuggestionsLoading(false);
  }, [driveCatalogReady, driveItems, project, uploadedItems]);

  const openSearchSuggestions = useCallback(() => {
    if (searchFocusLockRef.current) {
      return;
    }
    setSearchSuggestionsOpen(true);
    void fetchSearchSuggestions();
  }, [fetchSearchSuggestions]);

  useEffect(() => {
    if (!searchSuggestionsOpen) {
      return;
    }
    void fetchSearchSuggestions();
  }, [searchSuggestionsOpen, fetchSearchSuggestions]);

  const updateSearchInputLayout = useCallback(() => {
    const anchor =
      searchInputRef.current?.querySelector("label") ??
      searchInputRef.current ??
      searchInputPlaceholderRef.current;
    if (!anchor) {
      return;
    }
    const rect = anchor.getBoundingClientRect();
    setSearchInputLayout({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
  }, []);

  useEffect(() => {
    if (!searchSuggestionsOpen) {
      setSearchInputLayout(null);
      return;
    }

    updateSearchInputLayout();
    const frame = window.requestAnimationFrame(updateSearchInputLayout);
    window.addEventListener("resize", updateSearchInputLayout);
    window.addEventListener("scroll", updateSearchInputLayout, { passive: true });

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateSearchInputLayout);
      window.removeEventListener("scroll", updateSearchInputLayout);
    };
  }, [searchSuggestionsOpen, filterNavHidden, updateSearchInputLayout]);

  useEffect(() => {
    if (!searchSuggestionsOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (searchInputFloatingRef.current?.contains(target)) {
        return;
      }
      if (searchHashtagPanelRef.current?.contains(target)) {
        return;
      }
      closeSearchSuggestions();
    };

    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [closeSearchSuggestions, searchSuggestionsOpen]);

  useEffect(() => {
    const q = searchParams.get("q")?.trim();
    if (!q) {
      return;
    }
    searchFromSharedKeyword(q);
    router.replace("/", { scroll: false });
  }, [searchParams, router, searchFromSharedKeyword]);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(term), 180);
    return () => window.clearTimeout(handle);
  }, [term]);

  const semanticQuery =
    debouncedSearch.trim() || browseRecommendQuery?.trim() || projectDiscoverQuery?.trim() || "";

  useEffect(() => {
    if (!semanticQuery) {
      setVectorSearchResults(null);
      setProjectDiscoverLoading(false);
      setSearchRunning(false);
      return;
    }

    const isProjectDiscover = Boolean(projectDiscoverQuery && !debouncedSearch.trim());
    const isBrowseRecommend = Boolean(browseRecommendQuery && !debouncedSearch.trim());
    const imageSearchTerm = debouncedSearch.trim() || browseRecommendQuery?.trim() || "";
    const controller = new AbortController();
    const searchEpoch = searchEpochRef.current;
    const searchStartedAt = Date.now();
    let searchDoneTimer: number | undefined;
    setSearchRunning(Boolean(debouncedSearch.trim()));

    if ((isProjectDiscover || isBrowseRecommend) && homeFeedItems.length === 0 && driveItems.length === 0) {
      setProjectDiscoverLoading(true);
    }

    const run = async () => {
      const fetchUnsplashImages = async (): Promise<{ ok: boolean; items: ReferenceItem[] }> => {
        if (!UNSPLASH_FEED_ENABLED || !imageSearchTerm) {
          return { ok: true, items: [] };
        }

        try {
          const unsplashQuery = composeEnglishDesignQuery(imageSearchTerm) || imageSearchTerm;
        const response = await fetchWithTimeout(
            `/api/unsplash/search?q=${encodeURIComponent(unsplashQuery)}`,
            controller.signal,
            4000,
          );
          const payload = (await response.json()) as {
            error?: string;
            results?: unknown;
          };

          if (!response.ok) {
            console.error(
              "[IDEAVE] Unsplash search failed",
              payload.error ?? `status ${response.status}`,
            );
            return { ok: false, items: [] };
          }

          return { ok: true, items: mapUnsplashPhotosToReferenceItems(payload.results, imageSearchTerm) };
        } catch (error) {
          if (isAbortError(error) || controller.signal.aborted) {
            return { ok: false, items: [] };
          }
          console.error("[IDEAVE] Unsplash search failed", error);
          return { ok: false, items: [] };
        }
      };

      try {
        if (isProjectDiscover) {
          // 프로젝트 메인 추천은 무드 키워드 시각 분석 effect가 담당한다. 여기서는 Drive 카탈로그만 보장한다.
          if (driveItems.length === 0) {
            const drive = await loadGoogleDriveCatalog();
            if (controller.signal.aborted || searchEpoch !== searchEpochRef.current) {
              return;
            }
            if (drive.ok && drive.items.length > 0) {
              setDriveItems(drive.items);
            }
          }
          setVectorSearchResults(null);
          return;
        }

        if (!UNSPLASH_FEED_ENABLED) {
          if (driveItems.length === 0) {
            const drive = await loadGoogleDriveCatalog();
            if (controller.signal.aborted || searchEpoch !== searchEpochRef.current) {
              return;
            }
            if (drive.ok && drive.items.length > 0) {
              setDriveItems(drive.items);
              writeDriveCatalogSession(drive.items);
            }
          }
          setVectorSearchResults(null);
          return;
        }

        const searchTerms = imageSearchTerm
          ? [imageSearchTerm, ...expandKoreanDesignQuery(imageSearchTerm)]
          : browseTerms;
        const localCollected = filterMatchedReferenceItems(
          mergeReferenceItemsById(uploadedItems, driveItems),
          searchTerms,
          `${getHomeShuffleSeed()}:${isBrowseRecommend ? "browse-drive" : "search-drive"}`,
        );
        if (controller.signal.aborted || searchEpoch !== searchEpochRef.current) {
          return;
        }
        setVectorSearchResults(localCollected);

        if (!needsUnsplashFill(localCollected)) {
          return;
        }

        const unsplash = await fetchUnsplashImages();
        if (controller.signal.aborted || searchEpoch !== searchEpochRef.current) {
          return;
        }
        const rankedUnsplash = isBrowseRecommend
          ? rankReferenceItemsByTerms(
              unsplash.items,
              browseTerms,
              `${getHomeShuffleSeed()}:browse-unsplash`,
            )
          : unsplash.items;
        const merged = mixDrivePriorityFeed(
          localCollected,
          rankedUnsplash,
          `${getHomeShuffleSeed()}:${isBrowseRecommend ? "browse" : "search"}`,
          { shuffle: false },
        );
        if (!merged.some((item) => item.type !== "text" && Boolean(item.imageUrl))) {
          return;
        }
        setVectorSearchResults(merged);
      } catch (error) {
        if (isAbortError(error) || controller.signal.aborted) {
          return;
        }
        setVectorSearchResults(null);
      } finally {
        if ((isProjectDiscover || isBrowseRecommend) && !controller.signal.aborted) {
          setProjectDiscoverLoading(false);
        }
        if (!controller.signal.aborted) {
          // Drive 안에서 바로 찾으면 0.2초 만에 끝나 로딩 안내가 스쳐 지나가므로 최소한 잠깐은 보여 준다.
          const remaining = SEARCH_LOADING_MIN_MS - (Date.now() - searchStartedAt);
          searchDoneTimer = window.setTimeout(() => {
            if (!controller.signal.aborted) {
              setSearchRunning(false);
            }
          }, Math.max(0, remaining));
        }
      }
    };

    void run();
    return () => {
      window.clearTimeout(searchDoneTimer);
      abortController(controller);
    };
  }, [
    semanticQuery,
    debouncedSearch,
    projectDiscoverQuery,
    project,
    browseRecommendQuery,
    browseTerms,
    driveItems,
    uploadedItems,
  ]);

  useEffect(() => {
    setQueryExploreTexts([]);
  }, [debouncedSearch]);

  useEffect(() => {
    if (!project || !projectDiscoverQuery || debouncedSearch.trim()) {
      return;
    }

    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch("/api/project/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectName: project.name,
            goal: project.goal,
          }),
          signal: controller.signal,
        });

        const payload = (await response.json()) as {
          exploreTexts?: Array<{ label?: string; category?: string }>;
          keywords?: string[];
        };

        if (controller.signal.aborted) {
          return;
        }

        const fromApi: ExploreTextEntry[] = Array.isArray(payload.exploreTexts)
          ? payload.exploreTexts
              .map((row) => {
                const label = typeof row.label === "string" ? row.label.trim() : "";
                const category = row.category;
                if (
                  !label ||
                  (category !== "keyword" &&
                    category !== "movement" &&
                    category !== "style" &&
                    category !== "artist")
                ) {
                  return null;
                }
                return { label, category };
              })
              .filter((row): row is ExploreTextEntry => row !== null)
          : [];

        const fallbackLabels = Array.isArray(payload.keywords)
          ? payload.keywords.filter((k): k is string => typeof k === "string" && k.trim().length > 0)
          : [];

        const analyzed =
          fromApi.length > 0
            ? fromApi
            : projectLabelsToExploreTexts(fallbackLabels);

        if (analyzed.length > 0) {
          setProjectExploreTexts((prev) =>
            mergeExploreTextEntries(
              seedProjectExploreTexts(project.name, project.goal),
              prev,
              project
                ? filterExploreTextsExcludingProject(analyzed, project.name, project.goal)
                : analyzed,
            ),
          );
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    })();

    return () => abortController(controller);
  }, [project, projectDiscoverQuery, debouncedSearch]);

  // 프로젝트 등록·수정 시: 스타일·무드 키워드 → 시각 프로필(팔레트·스타일·분야) → 후보 이미지 색상·분야·용어 유사도로 재추천
  useEffect(() => {
    if (!project || !driveCatalogReady) {
      return;
    }
    const key = `${project.name}\u001f${project.goal}`;
    const controller = new AbortController();
    // 새 프로젝트면 projectVisual.key 가 달라 projectVisualReady=false → 분석 중 문구만 표시된다.
    // 같은 프로젝트의 재계산(카탈로그 갱신)이면 기존 결과를 유지한 채 결과만 교체한다.

    void (async () => {
      try {
        const profile = await fetchProjectVisualProfile(project.name, project.goal, controller.signal);
        if (controller.signal.aborted) {
          return;
        }
        const asVisual = projectProfileAsVisualProfile(profile);
        const profileKeys = profileTermKeys(asVisual);
        const targetFeatures = featuresFromPalette(profile.palette);
        // 주제에 작업 형식(포스터·리플렛·명화 …)이 있으면 그 형식만 목표 분야로 두고 상세 화면과 같은 비중(50%)으로 우선한다.
        // 형식이 없으면 Gemini가 고른 분야들을 보조 신호(30%)로만 쓴다.
        const targetMediums = profile.format ? [profile.format] : profile.mediums;
        const mediumWeight = profile.format ? 0.5 : 0.3;

        // Drive(수집) 레퍼런스를 먼저 최대한 채우고, 모자랄 때만 Unsplash 검색 결과를 뒤에 붙인다.
        const { items } = await recommendCollectedFirst({
          anchor: PROJECT_ANCHOR_ITEM,
          catalog: mergeReferenceItemsById(uploadedItems, driveItems),
          profileKeys,
          targetFeatures,
          targetMediums,
          mediumWeight,
          caps: { sameMedium: 100, diverse: 60 },
          limit: PROJECT_RECOMMEND_LIMIT,
          signal: controller.signal,
          fetchRemote: async () => {
            const groups = await Promise.all(
              profile.searchQueries
                .slice(0, 3)
                .map((query) => fetchUnsplashRelatedItems(query, controller.signal, { visual: true })),
            );
            return mergeReferenceItemsById(...groups);
          },
        });
        if (controller.signal.aborted) {
          return;
        }

        setProjectVisual({
          key,
          status: "ready",
          items,
          texts: buildProfileTextEntries(asVisual, DEFAULT_EXPLORE_TEXTS, DETAIL_RELATED_TEXT_ENTRY_LIMIT),
        });
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          return;
        }
        console.error("[IDEAVE] Project visual recommendation failed", error);
        setProjectVisual({ key, status: "ready", items: [], texts: [] });
      }
    })();

    return () => abortController(controller);
  }, [project, driveCatalogReady, driveItems, uploadedItems]);

  useEffect(() => {
    if (!selectedId) {
      setSimilarBelow({ forId: null, loading: false, items: [] });
      return;
    }

    const selected = mergedCatalogForBoardRef.current.find((entry) => entry.id === selectedId);
    if (!selected || selected.type === "text" || !selected.imageUrl) {
      setSimilarBelow({ forId: null, loading: false, items: [] });
      return;
    }

    const controller = new AbortController();
    const keywords = extractVisualKeywords(selected);
    // 임시 결과(이전·무작위 레퍼런스)는 보여주지 않고, 시각 유사도 분석이 끝난 결과만 표시한다.
    setSimilarBelow({ forId: selectedId, loading: true, analyzing: true, profile: null, items: [] });
    const relatedQuery = composeVisualRelatedSearchQuery(selected, keywords);
    const selectedImageUrl = selected.imageUrl;

    void (async () => {
      try {
        // 선택 이미지의 시각 프로필(Gemini)과 픽셀 색상 특징을 동시에 구한다.
        const [profile, selectedFeatures] = await Promise.all([
          fetchVisualProfile(selectedImageUrl, controller.signal),
          getColorFeatures(selectedImageUrl),
        ]);
        if (controller.signal.aborted) {
          return;
        }
        const profileKeys = profile ? profileTermKeys(profile) : new Set<string>();
        // 분야(유화·포스터 등): Gemini 프로필 우선, 없으면 Drive 폴더·태그로 추정
        const selectedMedium = resolveSelectedMedium(profile, selected);
        const profileQuery = profile?.searchQuery?.trim() ?? "";
        const mediumLabel = getMedium(selectedMedium)?.labelEn ?? "";
        const visualQuery =
          profileQuery || (mediumLabel ? `${mediumLabel} ${relatedQuery}`.trim() : relatedQuery);
        const useVisualSearch = Boolean(profileQuery || mediumLabel);

        // 업로드 이미지(Supabase)는 수집 레퍼런스이므로 DB 벡터 유사 결과도 Drive와 같은 우선순위로 넣는다.
        const dbItems = DATABASE_IMAGE_ID_RE.test(selected.id)
          ? await (async () => {
              try {
                const response = await fetch(
                  `/api/images/similar?imageId=${encodeURIComponent(selected.id)}`,
                  { signal: controller.signal },
                );
                if (!response.ok) {
                  return [] as ReferenceItem[];
                }
                const payload = (await response.json()) as {
                  images?: Array<{ id: string; imageUrl: string; tags: string[]; similarity?: number }>;
                };
                return mapSupabaseSearchImagesToReferenceItems(payload.images);
              } catch (error) {
                if (isAbortError(error)) {
                  throw error;
                }
                return [] as ReferenceItem[];
              }
            })()
          : [];
        if (controller.signal.aborted) {
          return;
        }

        // 분야·색상·프로필 신호가 하나도 없으면(이미지 로드 실패 + Gemini 불가) 태그가 실제로 겹치는 항목만 쓴다.
        // 아무 이미지나 채우지 않으므로 결과가 없으면 "찾지 못했습니다" 가 표시된다.
        const hasVisualSignal =
          Boolean(selectedFeatures) || profileKeys.size > 0 || Boolean(selectedMedium);
        const items = hasVisualSignal
          ? (
              await recommendCollectedFirst({
                anchor: selected,
                catalog: mergedCatalogForBoardRef.current,
                extraCollected: dbItems,
                profileKeys,
                targetFeatures: selectedFeatures,
                targetMediums: selectedMedium ? [selectedMedium] : [],
                caps: { sameMedium: 80, diverse: 48 },
                limit: DETAIL_RELATED_IMAGE_LIMIT,
                signal: controller.signal,
                // Drive가 부족할 때만: 선택 이미지의 분야·색상·무드로 만든 쿼리로 Unsplash 검색
                fetchRemote: async () => {
                  if (!visualQuery) {
                    return [];
                  }
                  const found = await fetchUnsplashRelatedItems(visualQuery, controller.signal, {
                    visual: useVisualSearch,
                  });
                  // 쿼리가 너무 구체적이라 결과가 적으면 "분야 + 대표 색 + 스타일" 로 넓혀 한 번 더 찾는다.
                  if (found.length >= 8 || !useVisualSearch || !mediumLabel || controller.signal.aborted) {
                    return found;
                  }
                  const broader = [mediumLabel, profile?.colors[0], profile?.style[0]]
                    .filter((part): part is string => Boolean(part?.trim()))
                    .join(" ");
                  const more = await fetchUnsplashRelatedItems(broader, controller.signal, { visual: true });
                  return mergeReferenceItemsById(found, more);
                },
              })
            ).items
          : rankTagMatchedImages(selected, mergedCatalogForBoardRef.current, DETAIL_RELATED_IMAGE_LIMIT);
        if (controller.signal.aborted) {
          return;
        }

        setRelatedSessionItems((prev) => mergeReferenceItemsById(prev, [selected], items));
        setSimilarBelow({ forId: selectedId, loading: false, analyzing: false, profile, items });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setSimilarBelow({
          forId: selectedId,
          loading: false,
          analyzing: false,
          profile: null,
          items: rankTagMatchedImages(selected, mergedCatalogForBoardRef.current, DETAIL_RELATED_IMAGE_LIMIT),
        });
      }
    })();

    return () => {
      abortController(controller);
    };
  }, [selectedId]);

  const activeTextLabel = useMemo(() => {
    if (!selectedTextItem && !textDetail) {
      return null;
    }
    return (textDetail?.label ?? selectedTextItem?.textLabel)?.trim() ?? null;
  }, [selectedTextItem, textDetail]);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    scrollDetailIntoView();
  }, [selectedId, activeTextLabel, scrollDetailIntoView]);

  useEffect(() => {
    if (!activeTextLabel) {
      setTextRelated({ forLabel: null, loading: false, images: [] });
      return;
    }

    if (textDetail?.label === activeTextLabel && textDetail.loading) {
      setTextRelated({ forLabel: activeTextLabel, loading: true, images: [] });
      return;
    }

    const controller = new AbortController();
    setTextRelated({ forLabel: activeTextLabel, loading: true, images: [] });

    const definition =
      textDetail?.label === activeTextLabel ? `${textDetail.definition} ${textDetail.function}` : "";
    const extraTerms = extractDesignKeywordsFromText(definition, 8);
    const relatedTerms = extractVisualKeywords(
      {
        id: `text-related-${activeTextLabel}`,
        type: "text",
        ratio: "1 / 1",
        textLabel: activeTextLabel,
        tags: extraTerms,
        description: definition,
      },
      `${activeTextLabel} ${definition}`,
      8,
    );
    const visualTerms = relatedTerms.length > 0 ? relatedTerms : extraTerms.slice(0, 4);
    const searchQuery = composeEnglishDesignQuery(visualTerms.join(" ")) || visualTerms.slice(0, 4).join(" ");

    void (async () => {
      try {
        const [supabase, unsplash, drive] = await Promise.all([
          fetch(`/api/images/search?q=${encodeURIComponent(searchQuery)}`, {
            signal: controller.signal,
          })
            .then(async (response) => {
              const payload = (await response.json()) as {
                images?: Array<{
                  id: string;
                  imageUrl: string;
                  tags: string[];
                  similarity?: number;
                }>;
              };
              if (!response.ok) {
                return [] as ReferenceItem[];
              }
              return mapSupabaseSearchImagesToReferenceItems(payload.images);
            })
            .catch((error: unknown) => {
              if (isAbortError(error)) {
                return [] as ReferenceItem[];
              }
              return [] as ReferenceItem[];
            }),
          fetchUnsplashRelatedItems(searchQuery, controller.signal),
          fetchGoogleDriveReferenceItems(searchQuery, controller.signal).then((result) =>
            result.ok ? result.items : [],
          ),
        ]);

        if (controller.signal.aborted) {
          return;
        }

        const catalogMatches = getRelatedImagesByLabel(
          activeTextLabel,
          mergedCatalogForBoardRef.current.filter((item) => item.type !== "text" && isSafeReference(item)),
          DETAIL_RELATED_IMAGE_LIMIT,
        );
        const scored = mergeReferenceItemsById(supabase, catalogMatches, unsplash, drive)
          .filter((item) => item.type !== "text" && isSafeReference(item))
          .map((item) => ({
            item,
            score: scoreVisualRelatedReference(visualTerms, item, { minAxes: visualTerms.length >= 2 ? 2 : 1 }),
          }))
          .filter((entry) => entry.score > 0)
          .sort((left, right) => right.score - left.score)
          .map((entry) => entry.item);
        const { collected, remote } = splitCollectedAndRemote(scored);
        const merged = mixDrivePriorityFeed(collected, remote, `text:${activeTextLabel}`, {
          shuffle: false,
        }).slice(0, DETAIL_RELATED_IMAGE_LIMIT);

        setTextRelated({ forLabel: activeTextLabel, loading: false, images: merged });
        setRelatedSessionItems((prev) => mergeReferenceItemsById(prev, merged));
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        const fallback = getRelatedImagesByLabel(
          activeTextLabel,
          mergedCatalogForBoardRef.current.filter((item) => item.type !== "text" && isSafeReference(item)),
          DETAIL_RELATED_IMAGE_LIMIT,
        ).filter((item) => scoreVisualRelatedReference(visualTerms, item, { minAxes: 1 }) > 0);
        setTextRelated({
          forLabel: activeTextLabel,
          loading: false,
          images: fallback,
        });
      }
    })();

    return () => abortController(controller);
  }, [
    activeTextLabel,
    textDetail?.label,
    textDetail?.loading,
    textDetail?.definition,
    textDetail?.function,
  ]);

  const applyTagFilter = useCallback(
    (tag: string) => {
      const nextTag = tag.trim().replace(/^#/, "");
      if (!nextTag) {
        return;
      }
      setFilter("all");
      setBadgeFilterTag(nextTag);
      setActiveTag(nextTag);
      // 검색은 term에서 #을 떼고 하므로 검색창에도 키워드만 보여 준다.
      setQuery(nextTag);
      setProjectDiscoverQuery(null);
      setBrowseRecommendQuery(null);
      setProjectDiscoverLoading(false);
      recordBrowseTerm(nextTag);
      clearExploreDetail();
      scrollToExploreTop();
    },
    [clearExploreDetail, recordBrowseTerm, scrollToExploreTop],
  );

  const clearTagBadgeFilter = () => {
    setBadgeFilterTag(null);
    setActiveTag("");
    setQuery("");
  };

  // 텍스트 카드 "구슬 실"용: 수집 이미지(Drive·업로드)의 태그 색인. 카탈로그가 바뀔 때만 다시 만든다.
  const wovenImageLookup = useMemo(
    () => buildWovenImageLookup(mergeReferenceItemsById(uploadedItems, driveItems)),
    [uploadedItems, driveItems],
  );

  const renderReferenceGridCard = useCallback(
    (item: ReferenceItem, keyPrefix: string) => (
      <ReferenceCard
        key={exploreItemKey(item, keyPrefix)}
        item={item}
        selected={selectedId === item.id}
        onClick={() => {
          if (item.type === "text" && item.textLabel) {
            selectExploreText(item);
            return;
          }
          selectExploreImage(item.id);
        }}
        draggable
        onDragStart={(dragItem) => beginDragToBoard(dragItem)}
        tagLabels={item.type === "text" ? [] : getSearchTagsForItem(item)}
        activeTagFilter={badgeFilterTag}
        onTagBadgeClick={applyTagFilter}
        onBackKeywordClick={searchFromSharedKeyword}
        variant="ideave"
        wovenImages={item.type === "text" && item.textLabel ? wovenImageLookup(item.textLabel) : undefined}
      />
    ),
    [selectedId, selectExploreText, selectExploreImage, badgeFilterTag, applyTagFilter, beginDragToBoard, wovenImageLookup, searchFromSharedKeyword],
  );

  useEffect(() => {
    clearLegacyLocalStorage();
    const savedMemo = readSessionItem(FORUS_MEMO_KEY);
    const savedBoard = readSessionItem(FORUS_BOARD_KEY);
    const savedProject = readSessionItem(FORUS_PROJECT_KEY);
    const savedSession = readSessionItem(FORUS_SESSION_KEY);
    const savedBrowse = readSessionItem(FORUS_BROWSE_KEY);

    if (savedMemo) {
      setMemo(savedMemo);
    }

    let restoredBoard: BoardCanvasItem[] = [];
    if (savedBoard) {
      try {
        const parsed = JSON.parse(savedBoard) as BoardCanvasItem[];
        restoredBoard = parsed.map((item) => {
          let next = item;
          if (item.type === "text") {
            const looksLikeLegacySquare = item.width === 160 && item.height === 160;
            if (!looksLikeLegacySquare) {
              next = { ...item, lockAspectRatio: false };
            } else {
              const size = measureBoardTextBox(item.text ?? BOARD_TEXT_PLACEHOLDER);
              next = {
                ...item,
                lockAspectRatio: false,
                width: size.width,
                height: size.height,
                baseWidth: size.width,
                baseHeight: size.height,
                initialFontSize: item.initialFontSize ?? BOARD_TEXT_FONT_SIZE,
              };
            }
          }
          const origin = clampBoardItemRect(next.x, next.y, next.width, next.height);
          return { ...next, x: origin.x, y: origin.y };
        });
        setBoardItems(restoredBoard);
        idRef.current = nextBoardIdSeed(restoredBoard);
        boardStackOffsetRef.current = restoredBoard.length;
      } catch {
        setBoardItems([]);
        boardStackOffsetRef.current = 0;
      }
    }

    let restoredProject = false;
    if (savedProject) {
      try {
        const parsed = JSON.parse(savedProject) as { name?: string; goal?: string };
        const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
        const goal = typeof parsed.goal === "string" ? parsed.goal.trim() : "";
        if (name && goal) {
          setProject({ name, goal });
          setProjectExploreTexts(seedProjectExploreTexts(name, goal));
          setProjectDiscoverQuery(composeProjectDiscoverQuery(name, goal));
          restoredProject = true;
        }
      } catch {
        // fall through — show registration modal
      }
    }

    if (savedSession) {
      try {
        const session = JSON.parse(savedSession) as Partial<IdeaveCanvasWorkspaceState>;
        if (typeof session.boardOpen === "boolean") {
          setBoardOpen(session.boardOpen);
        } else if (restoredBoard.length > 0) {
          setBoardOpen(true);
        }
        if (typeof session.query === "string") {
          const restoredQuery = session.query;
          setQuery(restoredQuery);
          setDebouncedSearch(restoredQuery.trim());
        }
        if (session.filter === "all" || session.filter === "image" || session.filter === "text") {
          setFilter(session.filter);
        }
        if (typeof session.selectedId === "string" && session.selectedId) {
          setSelectedId(session.selectedId);
        }
        if (session.badgeFilterTag === null || typeof session.badgeFilterTag === "string") {
          setBadgeFilterTag(session.badgeFilterTag ?? null);
        }
        if (typeof session.activeTag === "string") {
          setActiveTag(session.activeTag);
        }
        if (session.browseRecommendQuery === null || typeof session.browseRecommendQuery === "string") {
          setBrowseRecommendQuery(session.browseRecommendQuery ?? null);
        }
        if (!restoredProject && typeof session.projectDiscoverQuery === "string" && session.projectDiscoverQuery.trim()) {
          setProjectDiscoverQuery(session.projectDiscoverQuery.trim());
        }
        if (session.textDetail && typeof session.textDetail.label === "string" && session.textDetail.label.trim()) {
          setTextDetail({
            label: session.textDetail.label,
            category: session.textDetail.category,
            definition: typeof session.textDetail.definition === "string" ? session.textDetail.definition : "",
            function: typeof session.textDetail.function === "string" ? session.textDetail.function : "",
            antonyms: Array.isArray(session.textDetail.antonyms)
              ? session.textDetail.antonyms.filter((entry): entry is string => typeof entry === "string")
              : [],
            loading: false,
          });
        }
        if (typeof session.boardViewScale === "number" && Number.isFinite(session.boardViewScale)) {
          const scale = clampBoardScale(session.boardViewScale);
          setBoardViewScale(scale);
          boardViewScaleRef.current = scale;
        }
        if (
          session.boardViewPan &&
          typeof session.boardViewPan.x === "number" &&
          typeof session.boardViewPan.y === "number"
        ) {
          const pan = clampBoardPan(
            session.boardViewPan.x,
            session.boardViewPan.y,
            boardViewScaleRef.current,
            480,
            720,
          );
          setBoardViewPan(pan);
          boardViewPanRef.current = pan;
        }
        if (Array.isArray(session.boardKeywords)) {
          setBoardKeywords(session.boardKeywords);
        }
        if (typeof session.boardKeywordResultKey === "string") {
          setBoardKeywordResultKey(session.boardKeywordResultKey);
        }
        if (typeof session.boardKeywordExtractKey === "string") {
          setBoardKeywordExtractKey(session.boardKeywordExtractKey);
          boardKeywordExtractKeyRef.current = session.boardKeywordExtractKey;
        }
      } catch {
        // ignore malformed session
      }
    } else if (restoredBoard.length > 0) {
      setBoardOpen(true);
    }

    if (restoredBoard.length > 0) {
      const fromBoard: ReferenceItem[] = restoredBoard.flatMap((item) => {
        if (item.type !== "image" || !item.imageUrl) {
          return [];
        }
        return [
          {
            id: item.refId,
            type: "image" as const,
            ratio:
              item.baseWidth && item.baseHeight && item.baseHeight > 0
                ? `${item.baseWidth} / ${item.baseHeight}`
                : "4 / 5",
            imageUrl: item.imageUrl,
            source: "google-drive" as const,
          },
        ];
      });
      if (fromBoard.length > 0) {
        setRelatedSessionItems(fromBoard);
      }
    }

    if (savedBrowse) {
      try {
        const parsed = JSON.parse(savedBrowse) as unknown;
        if (Array.isArray(parsed)) {
          setBrowseTerms(
            parsed.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0),
          );
        }
      } catch {
        // ignore
      }
    }

    const cachedDrive = readDriveCatalogSession();
    if (cachedDrive && cachedDrive.length > 0) {
      setDriveItems(cachedDrive);
      setDriveCatalogReady(true);
    }

    if (!restoredProject) {
      setProjectModalOpen(true);
    }

    setSessionReady(true);
    // Restore project, canvas, explore query, and open panels for the same tab session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshUploadedItems = useCallback(async () => {
    try {
      const response = await fetch("/api/images/search");
      const payload = (await response.json()) as {
        images?: Array<{ id: string; imageUrl: string; tags: string[] }>;
      };
      if (!response.ok) {
        return;
      }

      const mapped: ReferenceItem[] =
        payload.images?.map((row) => ({
          id: row.id,
          type: "image",
          ratio: "4 / 5",
          imageUrl: row.imageUrl,
          tags: row.tags,
          similarity: undefined,
          source: "upload",
        })) ?? [];

      setUploadedItems(mapped);
    } catch {
      // Keep mock grid if Supabase/API is unreachable.
    }
  }, []);

  useEffect(() => {
    void refreshUploadedItems();
    const refreshOnVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshUploadedItems();
      }
    };

    document.addEventListener("visibilitychange", refreshOnVisible);
    return () => document.removeEventListener("visibilitychange", refreshOnVisible);
  }, [refreshUploadedItems]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      let collected: ReferenceItem[] = [];
      try {
        const result = await loadGoogleDriveCatalog();
        if (cancelled) {
          return;
        }
        if (result.ok) {
          collected = result.items;
          setDriveItems(result.items);
          writeDriveCatalogSession(result.items);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.error("[IDEAVE] Google Drive home feed failed", error);
      } finally {
        if (!cancelled) {
          setDriveCatalogReady(true);
        }
      }

      if (cancelled || !UNSPLASH_FEED_ENABLED || !needsUnsplashFill(collected)) {
        if (!cancelled && !needsUnsplashFill(collected)) {
          setHomeFeedItems([]);
        }
        return;
      }

      try {
        const items = await loadHomeFeedReferenceItems();
        if (cancelled) {
          return;
        }
        setHomeFeedItems(items);
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.error("[IDEAVE] Unsplash home feed failed", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionReady) {
      return;
    }
    if (project) {
      writeSessionItem(FORUS_PROJECT_KEY, JSON.stringify(project));
    } else {
      removeSessionItem(FORUS_PROJECT_KEY);
    }
  }, [project, sessionReady]);

  useEffect(() => {
    if (!sessionReady) {
      return;
    }
    writeSessionItem(FORUS_MEMO_KEY, memo);
  }, [memo, sessionReady]);

  useEffect(() => {
    if (!sessionReady) {
      return;
    }
    const timer = window.setTimeout(() => {
      writeSessionItem(FORUS_BOARD_KEY, JSON.stringify(boardItems));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [boardItems, sessionReady]);

  useEffect(() => {
    if (!sessionReady) {
      return;
    }
    const session: IdeaveCanvasWorkspaceState = {
      v: 3,
      boardOpen,
      query,
      filter,
      selectedId,
      badgeFilterTag,
      activeTag,
      browseRecommendQuery,
      projectDiscoverQuery,
      textDetail,
      boardViewScale,
      boardViewPan,
      boardKeywords,
      boardKeywordResultKey,
      boardKeywordExtractKey,
    };
    writeSessionItem(FORUS_SESSION_KEY, JSON.stringify(session));
  }, [
    sessionReady,
    boardOpen,
    query,
    filter,
    selectedId,
    badgeFilterTag,
    activeTag,
    browseRecommendQuery,
    projectDiscoverQuery,
    textDetail,
    boardViewScale,
    boardViewPan,
    boardKeywords,
    boardKeywordResultKey,
    boardKeywordExtractKey,
  ]);

  useEffect(() => {
    const valid = new Set(boardItems.map((b) => b.id));
    setBoardSelectedIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (valid.has(id)) {
          next.add(id);
        }
      }

      const sameSize = prev.size === next.size;
      const sameMembers = sameSize && [...prev].every((id) => next.has(id));
      if (sameMembers) {
        return prev;
      }

      return next;
    });
  }, [boardItems]);

  const exploreCatalogImages = useMemo(
    () =>
      mergedCatalog.filter(
        (item) =>
          item.type !== "text" &&
          isSafeReference(item) &&
          matchesExploreSearchFilters(item, term, badgeFilterTag, semanticSearchActive),
      ),
    [mergedCatalog, term, badgeFilterTag, semanticSearchActive],
  );

  const isProjectExploreMode = Boolean(project && !debouncedSearch.trim() && !browseRecommendQuery);

  const exploreTextPoolBase = useMemo((): ExploreTextEntry[] => {
    if (isProjectExploreMode && project) {
      // 무드 키워드 시각 분석이 끝나기 전에는 텍스트 레퍼런스도 보여주지 않는다.
      if (!projectVisualReady || !projectVisual) {
        return [];
      }
      const pool = mergeExploreTextEntries(
        projectVisual.texts,
        projectExploreTexts.length > 0
          ? projectExploreTexts
          : mergeExploreTextEntries(
              seedProjectExploreTexts(project.name, project.goal),
              projectLabelsToExploreTexts(searchSuggestions),
            ),
      );
      return filterExploreTextsExcludingProject(pool, project.name, project.goal);
    }
    return DEFAULT_EXPLORE_TEXTS;
  }, [isProjectExploreMode, projectExploreTexts, project, searchSuggestions, projectVisual, projectVisualReady]);

  const exploreImageItems = exploreCatalogImages;

  const exploreTextPool = useMemo((): ExploreTextEntry[] => {
    let pool: ExploreTextEntry[];

    if (badgeFilterTag) {
      pool = getExploreTextsForHashtag(badgeFilterTag, exploreTextPoolBase, exploreImageItems);
    } else {
      const searchLabel = debouncedSearch.trim().replace(/^#/, "");
      if (searchLabel) {
        pool = getExploreTextsForSearchQuery(
          searchLabel,
          exploreTextPoolBase,
          exploreImageItems,
          queryExploreTexts,
        );
      } else if (isProjectExploreMode) {
        pool = exploreTextPoolBase;
      } else {
        pool = exploreTextPoolBase;
      }
    }

    if (project) {
      pool = filterExploreTextsExcludingProject(pool, project.name, project.goal);
    }

    return pool;
  }, [
    badgeFilterTag,
    debouncedSearch,
    isProjectExploreMode,
    exploreTextPoolBase,
    exploreImageItems,
    queryExploreTexts,
    project,
  ]);

  const exploreTextShuffleKey = useMemo(
    () =>
      [
        badgeFilterTag ?? "",
        debouncedSearch,
        projectDiscoverQuery ?? "",
        exploreTextPool.map((entry) => `${entry.category}:${entry.label}`).join("|"),
      ].join("\x1f"),
    [badgeFilterTag, debouncedSearch, projectDiscoverQuery, exploreTextPool],
  );

  const shuffledExploreTextPool = useMemo(
    () => shuffleExploreTextEntries(exploreTextPool, exploreTextShuffleKey),
    [exploreTextPool, exploreTextShuffleKey],
  );

  const exploreGridItems = useMemo(
    () =>
      buildExploreGridItems(exploreImageItems, shuffledExploreTextPool, filter, {
        allowTextOnlyFallback: !debouncedSearch.trim() && !badgeFilterTag,
      }),
    [filter, exploreImageItems, shuffledExploreTextPool, debouncedSearch, badgeFilterTag],
  );

  const showNoReferenceMessage = useMemo(() => {
    if (!driveCatalogReady && driveItems.length === 0 && homeFeedItems.length === 0) {
      return false;
    }
    if (filter === "text") {
      return shuffledExploreTextPool.length === 0;
    }
    const hasImages = exploreImageItems.some((item) => Boolean(item.imageUrl));
    return !hasImages;
  }, [
    driveCatalogReady,
    driveItems.length,
    homeFeedItems.length,
    filter,
    shuffledExploreTextPool.length,
    exploreImageItems,
  ]);

  const relatedImages = useMemo(() => {
    if (!selectedImageItem) {
      return [];
    }

    // 분석이 끝난 결과만 사용한다. 다른 이미지용 결과나 임의의 카탈로그 이미지로 채우지 않는다.
    if (similarBelow.forId === selectedImageItem.id && !similarBelow.loading) {
      return similarBelow.items.filter((item) => item.id !== selectedImageItem.id);
    }
    return [];
  }, [selectedImageItem, similarBelow]);

  const relatedImageTextEntries = useMemo(() => {
    if (!selectedImageItem) {
      return [];
    }

    const labels = extractTagLabelsFromImages(
      [selectedImageItem, ...relatedImages],
      DETAIL_RELATED_TAG_LABEL_LIMIT,
    );
    const tagEntries =
      labels.length === 0 && selectedImageItem.tags?.length
        ? projectLabelsToExploreTexts(selectedImageItem.tags.slice(0, 8))
        : projectLabelsToExploreTexts(labels);

    // 선택 이미지의 시각 프로필(색상·무드·스타일·기법)에서 나온 텍스트 레퍼런스를 앞에 둔다.
    const profile =
      similarBelow.forId === selectedImageItem.id ? (similarBelow.profile ?? null) : null;
    if (!profile) {
      return tagEntries;
    }
    return mergeExploreTextEntries(
      buildProfileTextEntries(profile, exploreTextPool, DETAIL_RELATED_TEXT_ENTRY_LIMIT),
      tagEntries,
    ).slice(0, DETAIL_RELATED_TEXT_ENTRY_LIMIT);
  }, [selectedImageItem, relatedImages, similarBelow.forId, similarBelow.profile, exploreTextPool]);

  // 선택 직후(분석 effect 시작 전) 프레임도 로딩으로 취급해 이전 결과가 잠깐 보이지 않게 한다.
  const relatedImagesLoading = Boolean(
    selectedImageItem &&
      (similarBelow.forId !== selectedImageItem.id || similarBelow.loading),
  );

  /** 메인 화면 상단과 상세 화면 추천 영역이 함께 쓰는 전체/이미지/텍스트 필터 */
  const renderExploreFilterNav = (navClassName: string) => (
    <nav className={`flex gap-[8px] ${navClassName}`} aria-label="레퍼런스 필터">
      {(
        [
          { id: "all" as const, label: "전체" },
          { id: "image" as const, label: "이미지" },
          { id: "text" as const, label: "텍스트" },
        ] as const
      ).map(({ id, label }) => {
        const active = filter === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            aria-pressed={active}
            className={`h-8 rounded-[5px] border-0 px-3 text-[14px] font-medium leading-none transition-colors ${
              active
                ? "bg-[#222222] text-white"
                : "bg-[#F0F0F0] text-[#222222] hover:bg-[color-mix(in_srgb,#000000_20%,#F0F0F0)] disabled:bg-[#F0F0F0] disabled:text-[#222222]/30"
            }`}
          >
            {label}
          </button>
        );
      })}
    </nav>
  );

  // 텍스트 카드에 꿰어 보여준 "엮인 이미지"를 상세 추천의 맨 앞에 둔다(카드 +N과 상세가 어긋나지 않게).
  // 바로 계산되므로 원격 검색을 기다리지 않고 먼저 보여 주고, 검색 결과는 남는 자리를 채운다.
  const textWovenImages = useMemo(() => {
    if (!activeTextLabel) {
      return [];
    }
    return wovenImageLookup(activeTextLabel)
      .items.filter((item) => isSafeReference(item))
      .slice(0, DETAIL_RELATED_IMAGE_LIMIT);
  }, [activeTextLabel, wovenImageLookup]);

  const textRelatedImages = useMemo(() => {
    if (!activeTextLabel) {
      return [];
    }
    const searched = textRelated.forLabel === activeTextLabel ? textRelated.images : [];
    return mergeReferenceItemsById(textWovenImages, searched)
      .filter((item) => item.type !== "text")
      .slice(0, DETAIL_RELATED_IMAGE_LIMIT);
  }, [activeTextLabel, textRelated, textWovenImages]);

  const textRelatedTextEntries = useMemo(() => {
    if (!activeTextLabel) {
      return [];
    }
    return getRelatedExploreTextsForLabel(
      activeTextLabel,
      textRelatedImages,
      exploreTextPool,
      DETAIL_RELATED_TEXT_ENTRY_LIMIT,
      extractDesignKeywordsFromText(
        `${textDetail?.label === activeTextLabel ? textDetail.definition : ""} ${
          textDetail?.label === activeTextLabel ? textDetail.function : ""
        }`,
        8,
      ),
    );
  }, [activeTextLabel, textRelatedImages, exploreTextPool, textDetail?.label, textDetail?.definition, textDetail?.function]);

  const isDetailExplore = Boolean(selectedImageItem || activeTextLabel);
  const [detailChromePad, setDetailChromePad] = useState(56);

  useLayoutEffect(() => {
    const el = filterChromeRef.current;
    if (!el || !isDetailExplore) {
      setDetailChromePad(0);
      return;
    }
    const sync = () => {
      setDetailChromePad(Math.ceil(el.getBoundingClientRect().height));
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isDetailExplore, filterNavHidden]);

  const detailRelatedLoading = selectedImageItem
    ? relatedImagesLoading
    : Boolean(activeTextLabel && textRelated.loading && textWovenImages.length === 0);

  const detailRelatedImages = selectedImageItem ? relatedImages : textRelatedImages;
  const detailRelatedTexts = selectedImageItem ? relatedImageTextEntries : textRelatedTextEntries;

  const detailGridItems = useMemo(
    () =>
      buildExploreGridItems(detailRelatedImages, detailRelatedTexts, filter, {
        appendUnusedTexts: true,
      }),
    [detailRelatedImages, detailRelatedTexts, filter],
  );

  const textDetailAntonyms = useMemo(() => {
    if (textDetail?.antonyms && textDetail.antonyms.length > 0) {
      return textDetail.antonyms;
    }
    return [];
  }, [textDetail?.antonyms]);

  const textRelatedKeywords = useMemo(() => {
    if (!activeTextLabel) {
      return [];
    }

    const textItem: ReferenceItem = {
      id: selectedTextItem?.id ?? `text-${activeTextLabel}`,
      type: "text",
      ratio: "1 / 1",
      textLabel: activeTextLabel,
      tags: selectedTextItem?.tags,
    };

    return extractDesignKeywords(
      textItem,
      `${textDetail?.definition ?? ""} ${textDetail?.function ?? ""}`,
      6,
    );
  }, [activeTextLabel, selectedTextItem, textDetail?.definition, textDetail?.function]);

  const boardKeywordFetchKey = useMemo(() => {
    const ids = [...boardSelectedIds].sort();
    if (ids.length === 0) {
      return "";
    }

    let hasSignal = false;
    const signalsPart = ids
      .map((bid) => {
        const bi = boardItems.find((b) => b.id === bid);
        if (!bi) {
          return "";
        }
        const signals = getBoardItemKeywordSignals(bi, mergedCatalog);
        const hasVisual = bi.type === "image" && Boolean(bi.imageUrl?.trim());
        if (signals.length > 0 || hasVisual) {
          hasSignal = true;
        }
        return [hasVisual ? bi.imageUrl : "", ...signals].join("\x1f");
      })
      .join("\x1e");

    if (!hasSignal) {
      return "";
    }

    return `${ids.join(",")}|${signalsPart}`;
  }, [boardSelectedIds, boardItems, mergedCatalog]);

  const boardSelectionKey = useMemo(
    () => [...boardSelectedIds].sort().join(","),
    [boardSelectedIds],
  );

  const boardSelectionBounds = useMemo(() => {
    if (boardSelectedIds.size === 0) {
      return null;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const item of boardItems) {
      if (!boardSelectedIds.has(item.id)) {
        continue;
      }

      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + item.width);
      maxY = Math.max(maxY, item.y + item.height);
    }

    if (minX === Infinity) {
      return null;
    }

    return { minX, minY, maxX, maxY };
  }, [boardItems, boardSelectedIds]);

  const boardShowBubble =
    boardSelectionBounds !== null &&
    boardSelectedIds.size > 0 &&
    !boardKeywordLoading &&
    Boolean(boardKeywords && boardKeywords.length > 0) &&
    boardKeywordResultKey !== "" &&
    boardKeywordResultKey === boardKeywordFetchKey;

  const boardKeywordBubbleStyle = useMemo(() => {
    if (!boardShowBubble || !boardSelectionBounds) {
      return { left: 0, top: 0, transform: "translate(-50%, -100%)" };
    }
    return clampBoardKeywordBubbleStyle(
      boardSelectionBounds,
      formatBoardKeywordBubbleLabel(boardKeywords ?? []),
      boardCanvasRef.current,
      boardViewPan.x,
      boardViewPan.y,
      boardViewScale,
    );
  }, [boardShowBubble, boardSelectionBounds, boardKeywords, boardViewPan.x, boardViewPan.y, boardViewScale]);

  const addToBoard = (item: ReferenceItem, x?: number, y?: number) => {
    const nextId = `board-${idRef.current++}`;
    const stacked = x === undefined || y === undefined;
    const stackIndex = stacked ? boardStackOffsetRef.current++ : boardItemsRef.current.length;
    const originX = stacked ? 24 + stackIndex * 32 : x;
    const originY = stacked ? 24 + stackIndex * 32 : y;

    const placeOnBoard = (aspect: number | null) => {
      const isText = item.type === "text";
      const textValue = isText ? item.textLabel?.trim() || BOARD_TEXT_PLACEHOLDER : undefined;
      const textSize = isText ? measureBoardTextBox(textValue ?? BOARD_TEXT_PLACEHOLDER) : null;
      const { width, height } = textSize ?? boardSizeFromAspect(aspect);
      const origin = clampBoardItemRect(originX, originY, width, height);
      setBoardItems((prev) => [
        ...prev,
        {
          id: nextId,
          refId: item.id,
          type: item.type,
          shade: item.shade,
          imageUrl: item.type === "image" ? item.imageUrl : undefined,
          text: textValue,
          textCategory: item.type === "text" ? item.textCategory : undefined,
          lockAspectRatio: !isText,
          baseWidth: width,
          baseHeight: height,
          initialFontSize: isText ? BOARD_TEXT_FONT_SIZE : undefined,
          x: origin.x,
          y: origin.y,
          width,
          height,
        },
      ]);
      setBoardOpen(true);
    };

    if (item.type === "image" && item.imageUrl) {
      void loadImageAspectRatio(item.imageUrl).then((aspect) => {
        placeOnBoard(aspect ?? parseItemAspectRatio(item));
      });
      return;
    }

    placeOnBoard(item.type === "image" ? parseItemAspectRatio(item) : null);
  };

  const onDropToBoard = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const source =
      draggingRefItemRef.current ??
      (draggingRefId ? mergedCatalog.find((item) => item.id === draggingRefId) : undefined);
    if (!source || !boardCanvasRef.current) {
      draggingRefItemRef.current = null;
      setDraggingRefId("");
      return;
    }
    const scale = boardViewScaleRef.current;
    const pan = boardViewPanRef.current;
    const point = clientToBoardPoint(event.clientX, event.clientY, boardCanvasRef.current, pan.x, pan.y, scale);
    addToBoard(source, point.x - 56, point.y - 40);
    draggingRefItemRef.current = null;
    setDraggingRefId("");
  };

  const paintBoardCamera = () => {
    const el = boardWorldRef.current;
    if (!el) {
      return;
    }
    const pan = boardViewPanRef.current;
    const scale = boardViewScaleRef.current;
    el.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${scale})`;
  };

  const scheduleCommitBoardCamera = () => {
    if (cameraCommitTimerRef.current !== null) {
      window.clearTimeout(cameraCommitTimerRef.current);
    }
    cameraCommitTimerRef.current = window.setTimeout(() => {
      cameraCommitTimerRef.current = null;
      setBoardViewScale(boardViewScaleRef.current);
      setBoardViewPan({ ...boardViewPanRef.current });
    }, 140);
  };

  const paintBoardRubber = (rect: { x: number; y: number; w: number; h: number } | null) => {
    const el = boardRubberElRef.current;
    if (!el) {
      return;
    }
    if (!rect || rect.w < 1 || rect.h < 1) {
      el.style.display = "none";
      return;
    }
    el.style.display = "block";
    el.style.left = `${rect.x}px`;
    el.style.top = `${rect.y}px`;
    el.style.width = `${rect.w}px`;
    el.style.height = `${rect.h}px`;
  };

  const paintBoardItemRect = (item: BoardCanvasItem) => {
    const root = boardWorldRef.current;
    if (!root) {
      return;
    }
    const el = root.querySelector(`[data-board-item-id="${CSS.escape(item.id)}"]`) as HTMLElement | null;
    if (!el) {
      return;
    }
    el.style.left = `${item.x}px`;
    el.style.top = `${item.y}px`;
    el.style.width = `${item.width}px`;
    el.style.height = `${item.height}px`;
  };

  const paintBoardKeywordBubble = (items: BoardCanvasItem[]) => {
    const el = boardBubbleElRef.current;
    if (!el) {
      return;
    }
    const selected = boardSelectedIdsRef.current;
    if (selected.size === 0) {
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const item of items) {
      if (!selected.has(item.id)) {
        continue;
      }
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + item.width);
      maxY = Math.max(maxY, item.y + item.height);
    }
    if (minX === Infinity) {
      return;
    }
    const style = clampBoardKeywordBubbleStyle(
      { minX, minY, maxX, maxY },
      formatBoardKeywordBubbleLabel(boardKeywords ?? []),
      boardCanvasRef.current,
      boardViewPanRef.current.x,
      boardViewPanRef.current.y,
      boardViewScaleRef.current,
    );
    el.style.left = `${style.left}px`;
    el.style.top = `${style.top}px`;
    el.style.transform = style.transform;
  };

  const handleBoardSelect = useCallback((id: string, options?: { keepGroup?: boolean }) => {
    setBoardSelectedIds((prev) => {
      if (options?.keepGroup && prev.has(id)) {
        return prev;
      }
      return new Set([id]);
    });
  }, []);

  const handleBoardTextChange = useCallback((id: string, text: string) => {
    const size = measureBoardTextBox(text, BOARD_TEXT_FONT_SIZE);
    setBoardItems((prev) => {
      const next = prev.map((item) => {
        if (item.id !== id) {
          return item;
        }
        const merged = {
          ...item,
          text,
          width: size.width,
          height: size.height,
          baseWidth: size.width,
          baseHeight: size.height,
          initialFontSize: BOARD_TEXT_FONT_SIZE,
        };
        const pos = clampBoardItemRect(merged.x, merged.y, merged.width, merged.height);
        return { ...merged, x: pos.x, y: pos.y };
      });
      boardItemsRef.current = next;
      return next;
    });
  }, []);

  const commitBoardItems = useCallback(() => {
    boardLiveGestureRef.current = false;
    setBoardItems(boardItemsRef.current);
  }, []);

  const moveBoardItem = (id: string, x: number, y: number, options?: { moveGroup?: boolean }) => {
    boardLiveGestureRef.current = true;
    const prev = boardItemsRef.current;
    const dragged = prev.find((item) => item.id === id);
    if (!dragged) {
      return;
    }

    const selected = boardSelectedIdsRef.current;
    const group =
      options?.moveGroup && selected.size > 1 && selected.has(id) ? selected : new Set([id]);
    const intended = clampBoardItemRect(x, y, dragged.width, dragged.height);
    const delta = clampBoardGroupDelta(prev, group, intended.x - dragged.x, intended.y - dragged.y);

    if (delta.dx === 0 && delta.dy === 0) {
      return;
    }

    const next = prev.map((item) => {
      if (!group.has(item.id)) {
        return item;
      }
      const pos = clampBoardItemRect(item.x + delta.dx, item.y + delta.dy, item.width, item.height);
      const moved = { ...item, x: pos.x, y: pos.y };
      paintBoardItemRect(moved);
      return moved;
    });
    boardItemsRef.current = next;
    paintBoardKeywordBubble(next);
  };

  const resizeBoardItems = (
    id: string,
    patch: Pick<BoardCanvasItem, "x" | "y" | "width" | "height">,
    origin: Pick<BoardCanvasItem, "x" | "y" | "width" | "height">,
    edge: ResizeEdge,
    deltaX: number,
    deltaY: number,
  ) => {
    boardLiveGestureRef.current = true;
    const selected = boardSelectedIdsRef.current;
    if (selected.size <= 1 || !selected.has(id)) {
      boardResizeGestureRef.current = null;
      const next = boardItemsRef.current.map((item) => {
        if (item.id !== id) {
          return item;
        }
        const merged = { ...item, ...patch };
        const pos = clampBoardItemRect(merged.x, merged.y, merged.width, merged.height);
        const updated = { ...merged, x: pos.x, y: pos.y };
        paintBoardItemRect(updated);
        return updated;
      });
      boardItemsRef.current = next;
      paintBoardKeywordBubble(next);
      return;
    }

    const sameOrigin = (
      left: { x: number; y: number; width: number; height: number },
      right: typeof origin,
    ) =>
      left.x === right.x &&
      left.y === right.y &&
      left.width === right.width &&
      left.height === right.height;

    let gesture = boardResizeGestureRef.current;
    if (!gesture || gesture.id !== id || !sameOrigin(gesture.origin, origin)) {
      const starts = new Map<string, { x: number; y: number; width: number; height: number }>();
      for (const item of boardItemsRef.current) {
        if (selected.has(item.id)) {
          starts.set(item.id, {
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
          });
        }
      }
      starts.set(id, { ...origin });
      gesture = { id, origin: { ...origin }, starts };
      boardResizeGestureRef.current = gesture;
    }

    const next = boardItemsRef.current.map((item) => {
      const start = gesture.starts.get(item.id);
      if (!start) {
        return item;
      }
      const resized = applyBoardResize(
        start,
        edge,
        deltaX,
        deltaY,
        item.lockAspectRatio ?? item.type === "image",
      );
      const pos = clampBoardItemRect(resized.x, resized.y, resized.width, resized.height);
      const updated = { ...item, x: pos.x, y: pos.y, width: resized.width, height: resized.height };
      paintBoardItemRect(updated);
      return updated;
    });
    boardItemsRef.current = next;
    paintBoardKeywordBubble(next);
  };

  const clearBoardItems = () => {
    setBoardItems([]);
    boardStackOffsetRef.current = 0;
    setBoardSelectedIds(new Set());
    paintBoardRubber(null);
    boardBandStartRef.current = null;
    setBoardKeywords(null);
    setBoardKeywordLoading(false);
    setBoardKeywordExtractNonce(0);
    setBoardClearConfirmOpen(false);
    removeSessionItem(FORUS_BOARD_KEY);
  };

  const handleBoardExport = async (format: CanvasExportFormat) => {
    if (boardItems.length === 0 || boardExporting) {
      return;
    }
    setBoardExporting(true);
    try {
      await exportBoardCanvas(boardItems, format);
      setBoardExportOpen(false);
    } catch (error) {
      console.error("[IDEAVE] Canvas export failed", error);
    } finally {
      setBoardExporting(false);
    }
  };

  useEffect(() => {
    setBoardKeywords(null);
    setBoardKeywordLoading(false);
    setBoardKeywordExtractNonce(0);
    setBoardKeywordExtractKey("");
    setBoardKeywordResultKey("");
    boardKeywordExtractKeyRef.current = "";
  }, [boardSelectionKey]);

  useEffect(() => {
    if (boardKeywordExtractNonce === 0 || !boardKeywordExtractKey) {
      return;
    }

    const extractKey = boardKeywordExtractKey;
    const pipe = extractKey.indexOf("|");
    const ids =
      pipe === -1 ? [] : extractKey.slice(0, pipe).split(",").filter(Boolean);
    if (ids.length === 0) {
      setBoardKeywords(null);
      setBoardKeywordLoading(false);
      return;
    }

    const boardKeywordItems = ids
      .map((id) => {
        const bi = boardItemsRef.current.find((b) => b.id === id);
        if (!bi) {
          return null;
        }
        return buildBoardKeywordPayloadItem(bi, mergedCatalogForBoardRef.current);
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (boardKeywordItems.length === 0) {
      setBoardKeywords(null);
      setBoardKeywordLoading(false);
      return;
    }

    const controller = new AbortController();
    const keywordCountPayload = BOARD_COMMON_KEYWORD_COUNT;
    const fetchGen = ++boardKeywordFetchGenRef.current;

    const run = async () => {
      setBoardKeywordLoading(true);
      try {
        const response = await fetch("/api/board/common-keyword", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: boardKeywordItems, count: keywordCountPayload }),
          signal: controller.signal,
        });
        const payload = (await response.json()) as { keywords?: unknown; keyword?: string };
        if (
          controller.signal.aborted ||
          fetchGen !== boardKeywordFetchGenRef.current ||
          extractKey !== boardKeywordExtractKeyRef.current
        ) {
          return;
        }

        let words: string[] = [];
        if (Array.isArray(payload.keywords)) {
          words = payload.keywords.filter((entry): entry is string => typeof entry === "string");
        }
        words = [...new Set(words.map((w) => w.trim()).filter(Boolean))]
          .filter((word) => !isVagueCategoryKeyword(word))
          .slice(0, 3);
        if (words.length === 0 && typeof payload.keyword === "string" && payload.keyword.trim()) {
          words = [payload.keyword.trim()];
        }
        setBoardKeywordResultKey(extractKey);
        setBoardKeywords(words.length > 0 ? words : null);
      } catch (error) {
        if (
          controller.signal.aborted ||
          fetchGen !== boardKeywordFetchGenRef.current ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        setBoardKeywords(null);
        setBoardKeywordResultKey("");
      } finally {
        if (!controller.signal.aborted && fetchGen === boardKeywordFetchGenRef.current) {
          setBoardKeywordLoading(false);
        }
      }
    };

    void run();
    return () => abortController(controller);
  }, [boardKeywordExtractNonce, boardKeywordCount, boardKeywordExtractKey]);

  useEffect(() => {
    if (!boardOpen) {
      setBoardSelectedIds(new Set());
      paintBoardRubber(null);
      boardBandStartRef.current = null;
      setBoardKeywords(null);
      setBoardKeywordLoading(false);
      setBoardKeywordExtractNonce(0);
      return;
    }

    // 이 핸들러는 캔버스를 열 때 한 번만 등록되므로 선택·카드 목록은 항상 ref로 읽는다
    // (state를 직접 읽으면 열 때의 빈 선택이 굳어서 Delete가 동작하지 않았다).
    const onKey = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const typing =
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLInputElement ||
        (active instanceof HTMLElement && active.isContentEditable);
      const selected = boardSelectedIdsRef.current;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (e.key === "Delete" || e.key === "Backspace") {
        if (typing) {
          return;
        }

        if (selected.size > 0) {
          e.preventDefault();
          setBoardItems((prev) => prev.filter((item) => !selected.has(item.id)));
          setBoardSelectedIds(new Set());
          setBoardKeywords(null);
          setBoardKeywordLoading(false);
          setBoardKeywordExtractNonce(0);
        }
        return;
      }

      if (mod && !e.shiftKey && !e.altKey && (key === "c" || key === "v" || key === "z")) {
        if (typing) {
          // 텍스트 상자 안에서는 브라우저 기본 복사·붙여넣기·실행취소를 쓴다.
          return;
        }

        if (key === "c") {
          const copied = boardItemsRef.current.filter((item) => selected.has(item.id));
          if (copied.length === 0) {
            return;
          }
          e.preventDefault();
          boardClipboardRef.current = copied.map((item) => ({ ...item }));
          boardPasteCountRef.current = 0;
          return;
        }

        if (key === "v") {
          const source = boardClipboardRef.current;
          if (source.length === 0) {
            return;
          }
          e.preventDefault();
          // 붙여넣을 때마다 조금씩 비켜 놓아 원본·이전 사본과 겹치지 않게 한다.
          boardPasteCountRef.current += 1;
          const offset = BOARD_PASTE_OFFSET_PX * boardPasteCountRef.current;
          const pasted = source.map((item) => {
            const pos = clampBoardItemRect(item.x + offset, item.y + offset, item.width, item.height);
            return { ...item, id: `board-${idRef.current++}`, x: pos.x, y: pos.y };
          });
          setBoardItems((prev) => [...prev, ...pasted]);
          setBoardSelectedIds(new Set(pasted.map((item) => item.id)));
          return;
        }

        const previous = boardHistoryRef.current.pop();
        if (!previous) {
          return;
        }
        e.preventDefault();
        boardUndoingRef.current = true;
        setBoardItems(previous);
        setBoardSelectedIds(new Set());
        return;
      }

      if (e.key !== "Escape") {
        return;
      }

      setBoardSelectedIds(new Set());
      paintBoardRubber(null);
      boardBandStartRef.current = null;
      setBoardKeywords(null);
      setBoardKeywordLoading(false);
      setBoardKeywordExtractNonce(0);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [boardOpen]);

  // 창 너비를 따라가며 캔버스 패널 너비를 허용 범위 안으로 맞춘다(저장된 너비도 여기서 복원).
  useEffect(() => {
    const sync = () => {
      const width = document.documentElement.clientWidth;
      setViewportWidth(width);
      setBoardPanelWidth((prev) => clampBoardPanelWidth(prev, width));
    };
    setBoardPanelWidth(clampBoardPanelWidth(readStoredBoardPanelWidth(), document.documentElement.clientWidth));
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  const startBoardPanelResize = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = boardPanelWidth;
    let latest = startWidth;
    setBoardPanelResizing(true);
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "col-resize";

    const move = (ev: MouseEvent) => {
      // 패널은 오른쪽에 붙어 있으므로 왼쪽으로 끌수록 넓어진다.
      latest = clampBoardPanelWidth(startWidth + (startX - ev.clientX), document.documentElement.clientWidth);
      setBoardPanelWidth(latest);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.cursor = previousCursor;
      setBoardPanelResizing(false);
      try {
        window.localStorage.setItem(BOARD_PANEL_WIDTH_STORAGE_KEY, String(latest));
      } catch {
        // 저장 불가(시크릿 창 등) — 이번 방문 동안만 유지
      }
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const gridColumnOverride = boardOpen ? exploreColumnsForWidth(viewportWidth - boardPanelWidth) : undefined;

  const canExtractBoardKeywords = Boolean(boardKeywordFetchKey);

  const requestBoardKeywordExtract = () => {
    if (!canExtractBoardKeywords || !boardKeywordFetchKey) {
      return;
    }
    setBoardKeywordExtractKey(boardKeywordFetchKey);
    boardKeywordExtractKeyRef.current = boardKeywordFetchKey;
    setBoardKeywordResultKey("");
    setBoardKeywords(null);
    setBoardKeywordExtractNonce((prev) => prev + 1);
  };

  const zoomBoardAtClient = useCallback((clientX: number, clientY: number, factor: number) => {
    const canvas = boardCanvasRef.current;
    if (!canvas) {
      return;
    }
    const viewW = canvas.clientWidth;
    const viewH = canvas.clientHeight;
    const prevScale = boardViewScaleRef.current;
    const nextScale = clampBoardScale(prevScale * factor, viewW, viewH);
    if (nextScale === prevScale) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const pan = boardViewPanRef.current;
    const worldX = (clientX - rect.left - pan.x) / prevScale;
    const worldY = (clientY - rect.top - pan.y) / prevScale;
    const nextPan = clampBoardPan(
      clientX - rect.left - worldX * nextScale,
      clientY - rect.top - worldY * nextScale,
      nextScale,
      viewW,
      viewH,
    );
    boardViewScaleRef.current = nextScale;
    boardViewPanRef.current = nextPan;
    paintBoardCamera();
    scheduleCommitBoardCamera();
  }, []);

  const panBoardBy = useCallback((dx: number, dy: number) => {
    const canvas = boardCanvasRef.current;
    const viewW = canvas?.clientWidth ?? 480;
    const viewH = canvas?.clientHeight ?? 720;
    const scale = boardViewScaleRef.current;
    const next = clampBoardPan(
      boardViewPanRef.current.x + dx,
      boardViewPanRef.current.y + dy,
      scale,
      viewW,
      viewH,
    );
    boardViewPanRef.current = next;
    paintBoardCamera();
    scheduleCommitBoardCamera();
  }, []);

  const startBoardPan = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const canvas = boardCanvasRef.current;
    const startX = event.clientX;
    const startY = event.clientY;
    const startPan = { ...boardViewPanRef.current };
    const scale = boardViewScaleRef.current;

    const move = (ev: MouseEvent) => {
      const viewW = canvas?.clientWidth ?? 480;
      const viewH = canvas?.clientHeight ?? 720;
      const next = clampBoardPan(
        startPan.x + (ev.clientX - startX),
        startPan.y + (ev.clientY - startY),
        scale,
        viewW,
        viewH,
      );
      boardViewPanRef.current = next;
      paintBoardCamera();
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      scheduleCommitBoardCamera();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }, []);

  useEffect(() => {
    if (!boardOpen) {
      return;
    }

    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) {
        return;
      }
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea")) {
        return;
      }
      event.preventDefault();
      boardSpacePressedRef.current = true;
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        boardSpacePressedRef.current = false;
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      boardSpacePressedRef.current = false;
    };
  }, [boardOpen]);

  useLayoutEffect(() => {
    if (!boardOpen) {
      return;
    }
    const el = boardCanvasRef.current;
    const viewW = el?.clientWidth ?? 480;
    const viewH = el?.clientHeight ?? 720;
    const scale = clampBoardScale(boardViewScaleRef.current, viewW, viewH);
    const pan = clampBoardPan(boardViewPanRef.current.x, boardViewPanRef.current.y, scale, viewW, viewH);
    boardViewScaleRef.current = scale;
    boardViewPanRef.current = pan;
    paintBoardCamera();
    setBoardViewScale(scale);
    setBoardViewPan(pan);
    // 패널 너비가 바뀌면 보이는 영역이 달라지므로 확대·이동 범위를 다시 맞춘다.
  }, [boardOpen, boardPanelWidth]);

  useEffect(() => {
    const el = boardCanvasRef.current;
    if (!el || !boardOpen) {
      return;
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      // 하단 툴바가 넘칠 때는 휠로 캔버스 대신 툴바를 가로 스크롤한다.
      const toolbar = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-board-toolbar]");
      if (toolbar) {
        if (toolbar.scrollWidth > toolbar.clientWidth) {
          toolbar.scrollLeft += event.deltaX !== 0 ? event.deltaX : event.deltaY;
        }
        return;
      }
      if (event.ctrlKey || event.metaKey) {
        zoomBoardAtClient(event.clientX, event.clientY, event.deltaY < 0 ? 1.08 : 1 / 1.08);
        return;
      }
      panBoardBy(-event.deltaX, -event.deltaY);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [boardOpen, panBoardBy, zoomBoardAtClient]);

  const onBoardSurfaceMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-board-chrome], [data-board-card]")) {
      return;
    }

    if (event.button === 1 || (event.button === 0 && boardSpacePressedRef.current)) {
      startBoardPan(event);
      return;
    }

    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    const el = boardCanvasRef.current;
    if (!el) {
      return;
    }

    const pan = boardViewPanRef.current;
    const scale = boardViewScaleRef.current;
    const start = clientToBoardPoint(event.clientX, event.clientY, el, pan.x, pan.y, scale);

    boardBandStartRef.current = { sx: start.x, sy: start.y, skipDeselect: false };
    paintBoardRubber({ x: start.x, y: start.y, w: 0, h: 0 });

    const move = (ev: MouseEvent) => {
      const origin = boardBandStartRef.current;
      if (!origin) {
        return;
      }
      const currentPan = boardViewPanRef.current;
      const currentScale = boardViewScaleRef.current;
      const point = clientToBoardPoint(ev.clientX, ev.clientY, el, currentPan.x, currentPan.y, currentScale);
      const x1 = Math.min(origin.sx, point.x);
      const y1 = Math.min(origin.sy, point.y);
      const w = Math.abs(point.x - origin.sx);
      const h = Math.abs(point.y - origin.sy);
      paintBoardRubber({ x: x1, y: y1, w, h });
    };

    const up = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);

      const origin = boardBandStartRef.current;
      boardBandStartRef.current = null;

      const currentPan = boardViewPanRef.current;
      const currentScale = boardViewScaleRef.current;
      const point = clientToBoardPoint(ev.clientX, ev.clientY, el, currentPan.x, currentPan.y, currentScale);

      if (!origin) {
        paintBoardRubber(null);
        return;
      }

      const x1 = Math.min(origin.sx, point.x);
      const y1 = Math.min(origin.sy, point.y);
      const w = Math.abs(point.x - origin.sx);
      const h = Math.abs(point.y - origin.sy);

      paintBoardRubber(null);

      if (w < MIN_BOARD_BAND_PX || h < MIN_BOARD_BAND_PX) {
        if (!origin.skipDeselect) {
          setBoardSelectedIds(new Set());
        }
        return;
      }

      const next = new Set<string>();
      for (const c of boardItemsRef.current) {
        if (boardRectsIntersect(x1, y1, w, h, c.x, c.y, c.width, c.height)) {
          next.add(c.id);
        }
      }

      setBoardSelectedIds(next);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const addCustomTextToBoard = () => {
    const nextId = `board-${idRef.current++}`;
    const text = BOARD_TEXT_PLACEHOLDER;
    const size = measureBoardTextBox(text);
    const stackIndex = boardStackOffsetRef.current++;
    const origin = clampBoardItemRect(24 + stackIndex * 32, 24 + stackIndex * 32, size.width, size.height);
    setBoardItems((prev) => [
      ...prev,
      {
        id: nextId,
        refId: nextId,
        type: "text",
        text,
        lockAspectRatio: false,
        baseWidth: size.width,
        baseHeight: size.height,
        initialFontSize: BOARD_TEXT_FONT_SIZE,
        x: origin.x,
        y: origin.y,
        width: size.width,
        height: size.height,
      },
    ]);
    setBoardOpen(true);
  };

  // 인덱스 탭을 어디에 붙일지: 열려 있는(또는 닫히는 중인) 패널 안 → 함께 밀려 나오고 들어간다.
  const indexTabsHost: "project" | "board" | "fixed" = projectModalOpen
    ? "project"
    : boardShown
      ? "board"
      : projectPanelMounted
        ? "project"
        : boardOpen
          ? "board"
          : "fixed";
  const indexTabs = (
    <>
    <IndexTab
      label={project ? project.name : "프로젝트 등록"}
      tone="dark"
      active={projectModalOpen}
      detail={project ? { topic: project.name, keywords: splitProjectKeywords(project.goal) } : null}
      onClick={() => {
        // 프로젝트 패널을 열 땐 캔버스를 닫아 한 번에 한 패널만 보이게 한다.
        if (!projectModalOpen) {
          setBoardOpen(false);
        }
        setProjectModalOpen((prev) => !prev);
      }}
    />
    <IndexTab
      label="캔버스"
      tone="lime"
      active={boardShown && !projectModalOpen}
      onClick={() => {
        // 프로젝트 패널이 열려 있으면 닫고 캔버스를 보여 준다.
        if (projectModalOpen) {
          setProjectModalOpen(false);
          setBoardOpen(true);
          return;
        }
        setBoardOpen((prev) => !prev);
      }}
    />
    </>
  );
  const indexTabsEdgeClass = "absolute right-full flex flex-col items-end gap-2";

  return (
    <div
      className="min-h-screen overflow-x-clip bg-white text-[#1A1A1A]"
      style={
        {
          "--board-w": `${boardPanelWidth}px`,
          "--board-inner-w": `${boardPanelWidth - BOARD_PANEL_INNER_GUTTER_PX}px`,
          "--index-tab-w": `${INDEX_TAB_PX}px`,
        } as CSSProperties
      }
    >
      <ProjectRegisterModal
        open={projectPanelMounted}
        shown={projectModalOpen}
        initialProject={project}
        onClose={() => setProjectModalOpen(false)}
        onStart={handleProjectStart}
        onUpdate={handleProjectUpdate}
        onReset={handleProjectReset}
        variant="panel"
        edgeSlot={
          indexTabsHost === "project" ? (
            <nav aria-label="프로젝트와 캔버스" className={`${indexTabsEdgeClass} top-[12.5rem]`}>
              {indexTabs}
            </nav>
          ) : null
        }
      />
      <CreateModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onUploaded={() => void refreshUploadedItems()}
      />

      {boardClearConfirmOpen ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          role="presentation"
          onClick={() => setBoardClearConfirmOpen(false)}
        >
          <div className="absolute inset-0 bg-black/50" aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="board-clear-title"
            className="relative z-[1] w-[520px] max-w-[calc(100vw-2rem)] rounded-[5px] bg-white p-10 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <p
              id="board-clear-title"
              className="whitespace-pre-line font-[family-name:var(--font-pretendard)] text-[16px] font-medium leading-normal text-[#222222]"
            >
              {"캔버스의 모든 이미지와 텍스트를 삭제할까요?\n이 작업은 되돌릴 수 없습니다."}
            </p>
            <div className="mt-8 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBoardClearConfirmOpen(false)}
                className="flex h-8 shrink-0 items-center justify-center rounded-[5px] border-0 bg-[#F0F0F0] px-4 text-[14px] font-medium text-[#222222]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={clearBoardItems}
                className="flex h-8 shrink-0 items-center justify-center rounded-[5px] border-0 bg-[#F5F53D] px-4 text-[14px] font-medium text-[#222222]"
              >
                전체 삭제
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {boardExportOpen ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          role="presentation"
          onClick={() => {
            if (!boardExporting) {
              setBoardExportOpen(false);
            }
          }}
        >
          <div className="absolute inset-0 bg-black/50" aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="board-export-title"
            className="relative z-[1] w-[420px] max-w-[calc(100vw-2rem)] rounded-[5px] bg-white p-8 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <p
              id="board-export-title"
              className="font-[family-name:var(--font-pretendard)] text-[16px] font-medium text-[#222222]"
            >
              저장 형식 선택
            </p>
            <p className="mt-2 text-[13px] font-medium text-[#848484]">
              캔버스에 올려 둔 이미지·텍스트 범위만큼 저장됩니다.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {CANVAS_EXPORT_FORMATS.map((format) => (
                <button
                  key={format.id}
                  type="button"
                  disabled={boardExporting}
                  onClick={() => void handleBoardExport(format.id)}
                  className="flex h-12 items-center justify-between rounded-[5px] border border-[#E5E5E5] bg-[#F0F0F0] px-4 text-left transition-colors hover:bg-[color-mix(in_srgb,#000000_8%,#F0F0F0)] disabled:opacity-50"
                >
                  <span className="text-[14px] font-medium text-[#222222]">{format.label}</span>
                  <span className="text-[12px] font-medium text-[#848484]">{format.hint}</span>
                </button>
              ))}
            </div>
            {boardExporting ? (
              <p className="mt-4 text-[13px] font-medium text-[#848484]">저장 중…</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* 화면 오른쪽 인덱스 탭: 프로젝트(다크) / 캔버스(라임).
          패널이 닫혀 있을 땐 화면 오른쪽 끝에 고정하고, 패널이 열리면 그 패널 안(왼쪽 바깥)에 붙여 패널과 한 몸으로 움직인다. */}
      {indexTabsHost === "fixed" || indexTabsHost === "board" ? (
        <nav
          aria-label="프로젝트와 캔버스"
          className={`fixed right-0 top-[12.5rem] z-[46] flex flex-col items-end gap-2 ${
            indexTabsHost === "board" ? "lg:hidden" : ""
          }`}
        >
          {indexTabs}
        </nav>
      ) : null}

      <div ref={stickyChromeRef} className="sticky top-0 z-50 w-full">
        <header className="bg-[#222222]">
          <div className="flex w-full items-center justify-between px-10 py-3">
            <IdeaveLogo theme="dark" onHomeClick={goToExploreHome} />
            <div className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setCreateModalOpen(true)}
                className="text-[14px] font-medium text-[#F0F0F0] transition-opacity hover:opacity-80"
              >
                만들기
              </button>
              <ProfileIconButton />
            </div>
          </div>
        </header>

        <div className="relative w-full bg-[#FFFFFF]">
          <div className="box-border px-10 pt-4 pb-3">
            <div className="flex w-full items-center gap-[85px]">
              <div ref={searchInputPlaceholderRef} className="min-w-0 flex-1">
                <div
                  ref={searchInputRef}
                  className={searchSuggestionsOpen ? "pointer-events-none invisible" : "relative min-w-0 flex-1"}
                  aria-hidden={searchSuggestionsOpen}
                >
                  <label className="flex h-8 w-full items-center rounded-[5px] border-0 bg-[#F0F0F0] py-0 pl-3 pr-1">
                    <span className="sr-only">검색</span>
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => handleSearchInputChange(event.target.value)}
                      onFocus={openSearchSuggestions}
                      onClick={openSearchSuggestions}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitSearch();
                        }
                      }}
                      className="min-w-0 flex-1 bg-transparent text-[14px] font-medium text-[#222222] outline-none placeholder:text-[#848484]"
                      placeholder="해시태그 또는 키워드 검색"
                      tabIndex={searchSuggestionsOpen ? -1 : 0}
                    />
                    <button
                      type="button"
                      aria-label="검색 실행"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-[#848484] transition-colors hover:bg-[#E5E5E5] hover:text-[#222222]"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => commitSearch()}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                        <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.4" />
                        <path d="M10.2 10.2L13.5 13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      </svg>
                    </button>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div
            ref={filterChromeRef}
            className={`absolute left-0 top-full z-10 w-full bg-[#FFFFFF] ${
              boardOpen ? "lg:max-w-[calc(100%-var(--board-w))]" : ""
            }`}
          >
            {/* 상세 화면에서는 같은 필터가 추천 레퍼런스 바로 위에 표시된다. */}
            {!isDetailExplore ? (
              <div
                ref={filterNavRef}
                /* 숨길 때는 페이드아웃이 끝난 뒤(300ms) 높이를 접어, 바와 흰 배경이 위로 밀려 올라가지 않고 그 자리에서 사라지게 한다. */
                className={`overflow-hidden ${
                  filterNavHidden
                    ? "pointer-events-none max-h-0 opacity-0 [transition:opacity_300ms_ease,max-height_0s_linear_300ms]"
                    : "max-h-14 opacity-100 [transition:opacity_300ms_ease,max-height_0s]"
                }`}
                aria-hidden={filterNavHidden}
              >
                {renderExploreFilterNav("border-t border-[#E5E5E5] px-10 py-3")}
              </div>
            ) : null}
            {isDetailExplore ? (
              <div className="flex items-center bg-[#FFFFFF] px-10 py-2">
                <ExploreDetailBackButton
                  onBack={navigateExploreBack}
                  groupClassName="flex shrink-0 items-center"
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {searchSuggestionsOpen ? (
        <>
          <button
            type="button"
            className="pointer-events-none fixed inset-0 z-[55] bg-black/20"
            aria-label="검색 닫기"
            tabIndex={-1}
          />
          {searchInputLayout ? (
            <>
              <div
                ref={searchInputFloatingRef}
                className="fixed z-[60]"
                style={{
                  top: searchInputLayout.top,
                  left: searchInputLayout.left,
                  width: searchInputLayout.width,
                  height: searchInputLayout.height,
                }}
              >
                <label className="flex h-full w-full items-center rounded-[5px] border-0 bg-[#F0F0F0] py-0 pl-3 pr-1">
                  <span className="sr-only">검색</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => handleSearchInputChange(event.target.value)}
                    autoFocus
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitSearch();
                      }
                    }}
                    className="min-w-0 flex-1 bg-transparent text-[14px] font-medium text-[#222222] outline-none placeholder:text-[#848484]"
                    placeholder="해시태그 또는 키워드 검색"
                  />
                  <button
                    type="button"
                    aria-label="검색 실행"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-[#848484] transition-colors hover:bg-[#E5E5E5] hover:text-[#222222]"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => commitSearch()}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M10.2 10.2L13.5 13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </button>
                </label>
              </div>
              <div
                ref={searchHashtagPanelRef}
                className="fixed z-[60] flex flex-col items-start gap-2 rounded-lg bg-[#F0F0F0] p-5"
                style={{
                  top: searchInputLayout.top + searchInputLayout.height + 8,
                  left: searchInputLayout.left,
                  width: searchInputLayout.width,
                }}
              >
                <p className="text-[12px] font-medium text-[#222222]">해시태그</p>
                {searchSuggestionsLoading ? (
                  <p className="text-xs text-[#848484]">추천 해시태그 생성 중…</p>
                ) : searchSuggestions.length === 0 ? (
                  <p className="text-xs text-[#848484]">수집한 레퍼런스에서 키워드를 찾지 못했습니다.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {searchSuggestions.map((suggestion, suggestionIndex) => {
                      const label = suggestion.startsWith("#") ? suggestion : `#${suggestion}`;
                      return (
                        <button
                          key={`${suggestionIndex}-${suggestion}`}
                          type="button"
                          className="h-8 shrink-0 rounded-[5px] border border-[#E5E5E5] bg-white px-3 text-[14px] font-medium text-[#222222] transition-colors hover:bg-[#E5E7EB]"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => searchFromSharedKeyword(suggestion)}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </>
      ) : null}

      <main
        className={`grid min-h-[calc(100vh-9rem)] ${boardOpen ? "lg:min-h-[calc(100vh-7rem)] lg:grid-cols-[1fr_var(--board-w)]" : "grid-cols-1"}`}
      >
        <section
          className={`min-w-0 pb-6 pl-8 ${boardOpen ? "pr-[calc(2rem+var(--index-tab-w))] lg:pr-8" : "pr-[calc(2rem+var(--index-tab-w))]"}`}
          style={{ paddingTop: isDetailExplore ? Math.max(24, detailChromePad + 12) : EXPLORE_HOME_TOP_PAD_PX }}
        >
          <div
            ref={exploreTopRef}
            className="h-0"
            aria-hidden
          />

          {uploadedItems.length > 0 ? (
            <p className="mb-3 text-xs text-[#9CA3AF]">{uploadedItems.length} uploads</p>
          ) : null}
          <div ref={detailAnchorRef}>
          {selectedImageItem ? (
            <ImageDetailPanel
              item={selectedImageItem}
              compact={boardOpen}
              title={
                selectedImageItem.altDescription?.trim() ||
                getSearchTagsForItem(selectedImageItem)[0] ||
                selectedImageItem.textLabel?.trim() ||
                "레퍼런스"
              }
              link={getReferenceSourceLink(selectedImageItem)}
              tagLabels={getSearchTagsForItem(selectedImageItem)}
              activeTagFilter={badgeFilterTag}
              onSaveToCanvas={() => addToBoard(selectedImageItem)}
              onTagClick={applyTagFilter}
              onDragStart={() => beginDragToBoard(selectedImageItem)}
            />
          ) : null}

          {activeTextLabel ? (
            <TextDetailPanel
              title={textDetail?.label ?? activeTextLabel}
              definition={textDetail?.definition ?? ""}
              functionText={textDetail?.function ?? ""}
              antonyms={textDetailAntonyms}
              relatedKeywords={textRelatedKeywords}
              loading={Boolean(textDetail?.loading)}
              onSaveToCanvas={() => {
                const label = (textDetail?.label ?? activeTextLabel ?? "").trim();
                if (!label) {
                  return;
                }
                addToBoard(
                  selectedTextItem ?? {
                    id: selectedId || `explore-txt-save-${label}`,
                    type: "text",
                    ratio: "4 / 3",
                    textLabel: label,
                    textCategory: textDetail?.category,
                  },
                );
              }}
              onAntonymClick={searchFromSharedKeyword}
            />
          ) : null}
          </div>

          {isDetailExplore ? (
            <section aria-label="추천 레퍼런스">
              <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                {renderExploreFilterNav("")}
              </div>
              {detailRelatedLoading ? (
                <p
                  className="mb-8 rounded-lg border border-dashed border-[#E5E5E5] bg-white py-10 text-center text-sm text-[#848484]"
                  role="status"
                >
                  {selectedImageItem
                    ? "분야·색상·무드·스타일 유사도를 분석해 추천 레퍼런스를 찾는 중…"
                    : "관련 레퍼런스를 불러오는 중…"}
                </p>
              ) : detailGridItems.length === 0 ? (
                <p className="mb-8 rounded-lg border border-dashed border-[#E5E5E5] bg-white py-10 text-center text-sm text-[#848484]">
                  {selectedImageItem
                    ? "시각적으로 유사한 레퍼런스를 찾지 못했습니다."
                    : "해당하는 레퍼런스를 찾지 못했습니다."}
                </p>
              ) : (
                <div className="mb-8">
                  <ExploreReferenceGrid
                    items={detailGridItems}
                    columnCountOverride={gridColumnOverride}
                    getItemKey={(item) => exploreItemKey(item, "explore")}
                    renderItem={(item) => renderReferenceGridCard(item, "explore")}
                  />
                </div>
              )}
            </section>
          ) : isProjectExploreMode && !projectVisualReady ? (
            <div
              className="rounded-lg border border-dashed border-[#E5E5E5] bg-white py-16 text-center text-sm text-[#848484]"
              role="status"
            >
              프로젝트 스타일·무드 키워드의 색상과 그래픽 스타일을 분석해 레퍼런스를 추천하는 중…
            </div>
          ) : projectDiscoverLoading &&
            exploreGridItems.length === 0 &&
            (projectDiscoverQuery || browseRecommendQuery) &&
            !debouncedSearch.trim() ? (
            <div className="rounded-lg border border-dashed border-[#E5E5E5] bg-white py-16 text-center text-sm text-[#848484]">
              프로젝트 문장을 분석해 레퍼런스를 불러오는 중…
            </div>
          ) : searchPending ? (
            <div
              className="rounded-lg border border-dashed border-[#E5E5E5] bg-white py-16 text-center text-sm text-[#848484]"
              role="status"
            >
              「{term.trim()}」 레퍼런스를 탐색하는 중…
            </div>
          ) : showNoReferenceMessage ? (
            <div className="rounded-lg border border-dashed border-[#E5E5E5] bg-white py-16 text-center text-sm text-[#848484]">
              해당하는 레퍼런스를 찾지 못했습니다.
            </div>
          ) : (
            <ExploreReferenceGrid
              items={exploreGridItems}
              columnCountOverride={gridColumnOverride}
              getItemKey={(item) => exploreItemKey(item, "explore")}
              renderItem={(item) => renderReferenceGridCard(item, "explore")}
            />
          )}
        </section>

        {/* select-none: 캔버스 여백에서 끌기 시작하면 브라우저가 카드 이미지를 파랗게 '텍스트 선택'하는 것을 막는다(텍스트 편집은 textarea라 영향 없음). */}
        {boardOpen && (
          <aside className={`sticky top-[8.25rem] z-45 hidden min-w-0 select-none self-start bg-white transition-transform starting:translate-x-full lg:flex lg:h-[calc(100vh-8.25rem)] lg:w-[var(--board-w)] lg:flex-col ${SIDE_PANEL_SLIDE_CLASS} ${boardShown ? "translate-x-0" : "translate-x-full"}`}>
            {indexTabsHost === "board" ? (
              // 화면 기준 top 12.5rem = 캔버스 패널(top 8.25rem) 안에서 4.25rem 아래.
              <nav aria-label="프로젝트와 캔버스" className={`${indexTabsEdgeClass} top-[4.25rem] z-20`}>
                {indexTabs}
              </nav>
            ) : null}
            {/* 왼쪽 경계를 끌어 캔버스 너비 조절. 탐색 그리드가 2칸 아래로 줄지 않게 clampBoardPanelWidth가 막는다. */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="캔버스 너비 조절"
              onMouseDown={startBoardPanelResize}
              className="group absolute -left-[5px] top-0 z-10 h-full w-[10px] cursor-col-resize"
            >
              <div
                className={`mx-auto h-full w-[2px] transition-colors ${
                  boardPanelResizing ? "bg-[#222222]" : "bg-transparent group-hover:bg-[#BDBDBD]"
                }`}
              />
            </div>
            <div className="flex h-full min-h-0 flex-col overflow-hidden border-l border-[#E5E5E5] bg-white">
              <div className="flex shrink-0 justify-center px-4 pb-3 pt-3">
                <div className="flex w-[var(--board-inner-w)] max-w-full items-center justify-between">
                  <h2 className="pl-[10px] font-[family-name:var(--font-pretendard)] text-[24px] font-medium leading-none text-[var(--hint-text-border,#848484)]">
                    캔버스
                  </h2>
                  <CloseButton
                    ariaLabel="캔버스 닫기"
                    onClick={() => {
                      setBoardOpen(false);
                      setBoardSelectedIds(new Set());
                      paintBoardRubber(null);
                      boardBandStartRef.current = null;
                      setBoardKeywords(null);
                      setBoardKeywordLoading(false);
                      setBoardKeywordExtractNonce(0);
                    }}
                  />
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
                <div
                  ref={boardCanvasRef}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={onDropToBoard}
                  onMouseDown={onBoardSurfaceMouseDown}
                  className="relative min-h-0 w-[var(--board-inner-w)] max-w-full flex-1 self-center overflow-hidden rounded-[8px] border-2 border-[#E5E5E5] bg-white"
                  style={{ touchAction: "none" }}
                >
                  <div
                    ref={boardWorldRef}
                    className="absolute left-0 top-0 z-0 origin-top-left"
                    style={{
                      width: CANVAS_WIDTH,
                      height: CANVAS_HEIGHT,
                      transform: `translate(${boardViewPanRef.current.x}px, ${boardViewPanRef.current.y}px) scale(${boardViewScaleRef.current})`,
                      transformOrigin: "0 0",
                    }}
                  >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 z-0"
                    style={{
                      backgroundImage:
                        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Crect width='4' height='4' fill='%23E5E5E5'/%3E%3C/svg%3E\")",
                      backgroundSize: `${BOARD_DOT_TILE_PX}px ${BOARD_DOT_TILE_PX}px`,
                      backgroundRepeat: "repeat",
                      backgroundColor: "#FFFFFF",
                      width: "100%",
                      height: "100%",
                    }}
                  />
                  <div
                    ref={boardRubberElRef}
                    aria-hidden
                    className="pointer-events-none absolute z-[5] rounded bg-[rgba(245,245,61,0.40)]"
                    style={{ display: "none", left: 0, top: 0, width: 0, height: 0 }}
                  />
                  {boardShowBubble && boardSelectionBounds ? (
                    <div
                      ref={boardBubbleElRef}
                      data-board-chrome
                      className="pointer-events-none absolute z-[25]"
                      style={boardKeywordBubbleStyle}
                    >
                      {/* 키워드마다 흰 칩으로 나눠, 누른 키워드 하나로만 검색한다. */}
                      <div
                        onMouseDown={(event) => event.stopPropagation()}
                        className="pointer-events-auto relative flex items-center gap-1 whitespace-nowrap rounded-[8px] bg-[var(--lime-green,#F5F53D)] p-1.5"
                      >
                        {(boardKeywords ?? []).slice(0, 3).map((keyword) => (
                          <button
                            key={keyword}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              searchFromSharedKeyword(keyword);
                            }}
                            className="cursor-pointer rounded-[5px] bg-white px-2.5 py-1 font-[family-name:var(--font-pretendard)] text-[14px] font-medium leading-normal text-black transition-colors hover:bg-[#222222] hover:text-white"
                          >
                            {keyword}
                          </button>
                        ))}
                        <span
                          aria-hidden
                          className="absolute left-1/2 top-full -translate-x-1/2 border-[7px] border-transparent border-t-[var(--lime-green,#F5F53D)]"
                        />
                      </div>
                    </div>
                  ) : null}
                  {boardItems.length === 0 ? null : (
                    <div className="pointer-events-none relative z-[1] min-h-full">
                      {boardItems.map((item) => (
                        <BoardCanvasCard
                          key={item.id}
                          item={item}
                          canvasRef={boardCanvasRef}
                          viewScaleRef={boardViewScaleRef}
                          viewPanRef={boardViewPanRef}
                          selected={boardSelectedIds.has(item.id)}
                          onSelect={handleBoardSelect}
                          onMove={moveBoardItem}
                          onResize={resizeBoardItems}
                          onGestureEnd={commitBoardItems}
                          onTextChange={handleBoardTextChange}
                          onOpenImage={openCanvasImageDetail}
                        />
                      ))}
                    </div>
                  )}
                  </div>

                  {/* 캔버스를 좁히면 버튼이 테두리 밖으로 나가지 않고 테두리 안에서 가로 스크롤된다. */}
                  <div
                    data-board-chrome
                    data-board-toolbar
                    className="pointer-events-auto absolute inset-x-3 bottom-3 z-40 overflow-x-auto overflow-y-hidden rounded-[5px] border-2 border-[#E5E5E5] bg-white [scrollbar-color:#BDBDBD_transparent] [scrollbar-width:thin]"
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                    <div className="flex w-max min-w-full items-center gap-2 p-2">
                    <button
                      type="button"
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={requestBoardKeywordExtract}
                      disabled={!canExtractBoardKeywords || boardKeywordLoading}
                      className={`flex h-8 min-w-[240px] flex-1 items-center justify-center gap-2.5 rounded-[5px] border px-4 py-[10px] transition-colors ${
                        boardKeywordLoading
                          ? "border-[#E5E5E5] bg-[#F0F0F0] font-[family-name:var(--font-pretendard)] text-[14px] font-medium text-black"
                          : canExtractBoardKeywords
                            ? "border-[#E5E5E5] bg-[#F5F53D] font-[family-name:var(--font-pretendard)] text-[14px] font-medium text-black hover:bg-[linear-gradient(0deg,rgba(0,0,0,0.2),rgba(0,0,0,0.2)),#F5F53D]"
                            : "border-[#E5E5E5] bg-[#F0F0F0] font-[family-name:var(--font-pretendard)] text-[14px] font-medium text-[#848484]"
                      } disabled:cursor-not-allowed`}
                    >
                      {boardKeywordLoading ? "공통 키워드 추출중···" : "공통 키워드 추출하기"}
                    </button>
                    <div className="flex h-8 shrink-0 items-center gap-3">
                        <button
                          type="button"
                          onClick={addCustomTextToBoard}
                          className="flex h-8 w-8 items-center justify-center p-0 transition-opacity hover:opacity-70"
                          aria-label="텍스트 추가"
                        >
                          <img src="/canvas-type.png" alt="" className="h-5 w-5 shrink-0 object-contain" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setBoardExportOpen(true)}
                          disabled={boardItems.length === 0}
                          className="flex h-8 w-8 items-center justify-center p-0 transition-opacity hover:opacity-70 disabled:opacity-30"
                          aria-label="캔버스 저장"
                        >
                          <img src="/canvas-download.png" alt="" className="h-5 w-5 shrink-0 object-contain" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (boardItems.length === 0) {
                              return;
                            }
                            setBoardClearConfirmOpen(true);
                          }}
                          disabled={boardItems.length === 0}
                          className="flex h-8 w-8 items-center justify-center p-0 transition-opacity hover:opacity-70 disabled:opacity-30"
                          aria-label="캔버스 비우기"
                        >
                          <img src="/canvas-trash.png" alt="" className="h-5 w-5 shrink-0 object-contain" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}
      </main>
    </div>
  );
}
