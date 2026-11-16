const PERSONAL_SOURCES = new Set(["google-drive", "upload"]);

/** Word-boundary terms: English profanity, sexual, hate, and graphic-violence language. */
const BLOCKED_WORD_PATTERNS = [
  String.raw`\bfuck(?:ing|ed|er|ers|s)?\b`,
  String.raw`\bmotherfuck(?:er|ers|ing|s)?\b`,
  String.raw`\bshit(?:ty|s|ting)?\b`,
  String.raw`\bbullshit\b`,
  String.raw`\bbitch(?:es|y|ing)?\b`,
  String.raw`\bassholes?\b`,
  String.raw`\bbastards?\b`,
  String.raw`\bdick(?:s|head|heads)?\b`,
  String.raw`\bcocksuckers?\b`,
  String.raw`\bcocks?\b`,
  String.raw`\bpuss(?:y|ies)\b`,
  String.raw`\bcunts?\b`,
  String.raw`\bsluts?\b`,
  String.raw`\bwhores?\b`,
  String.raw`\bporn(?:o|ography)?\b`,
  String.raw`\bnsfw\b`,
  String.raw`\bxxx\b`,
  String.raw`\bnudes?\b`,
  String.raw`\bnudity\b`,
  String.raw`\bnaked\b`,
  String.raw`\bsex(?:ual|y|ually)\b`,
  String.raw`\bsex\s*toys?\b`,
  String.raw`\berotic\b`,
  String.raw`\bbondage\b`,
  String.raw`\bfetish(?:es)?\b`,
  String.raw`\borgasm\b`,
  String.raw`\bmasturbat(?:e|ion|ing)\b`,
  String.raw`\bhorny\b`,
  String.raw`\bboobs?\b`,
  String.raw`\bbreasts?\b`,
  String.raw`\bnipples?\b`,
  String.raw`\bpenis(?:es)?\b`,
  String.raw`\bvagina(?:s|l)?\b`,
  String.raw`\banus\b`,
  String.raw`\banal\b`,
  String.raw`\bblowjobs?\b`,
  String.raw`\bhandjobs?\b`,
  String.raw`\bcumshots?\b`,
  String.raw`\bsperm\b`,
  String.raw`\bhentai\b`,
  String.raw`\blolicon\b`,
  String.raw`\bshotacon\b`,
  String.raw`\bpedoph(?:ile|ilia|ilic)\b`,
  String.raw`\bchild\s*porn\b`,
  String.raw`\brape(?:d|s|ist|ists|ing)?\b`,
  String.raw`\bgore\b`,
  String.raw`\bgory\b`,
  String.raw`\bsnuff\b`,
  String.raw`\bbehead(?:ing|ed)?\b`,
  String.raw`\btortur(?:e|ed|ing|es)\b`,
  String.raw`\bmutilat(?:e|ed|ion|ing)\b`,
  String.raw`\bniggers?\b`,
  String.raw`\bniggas?\b`,
  String.raw`\bfaggots?\b`,
  String.raw`\bfags?\b`,
  String.raw`\btrann(?:y|ies)\b`,
  String.raw`\bretards?\b`,
  String.raw`\bretarded\b`,
  String.raw`\bkikes?\b`,
  String.raw`\bwetbacks?\b`,
  String.raw`\bspics?\b`,
  String.raw`\bchinks?\b`,
  String.raw`\bnazi\b`,
  String.raw`\bswastika\b`,
] as const;

const BLOCKED_WORD_RE = new RegExp(BLOCKED_WORD_PATTERNS.join("|"), "i");

/** Compact-letter matches for masked spellings (f*ck, s-h-i-t). Short stems omitted to avoid cocktail/class hits. */
const BLOCKED_COMPACT_STEMS = [
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "nigger",
  "nigga",
  "faggot",
  "porn",
  "porno",
  "rape",
  "rapist",
  "nude",
  "nudes",
  "nsfw",
  "hentai",
  "pedophil",
] as const;

export type ReferenceSafetyInput = {
  source?: string | null;
  type?: string | null;
  description?: string | null;
  altDescription?: string | null;
  textLabel?: string | null;
  title?: string | null;
  tags?: string[] | null;
};

function leetNormalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[@4]/g, "a")
    .replace(/[1!|]/g, "i")
    .replace(/3/g, "e")
    .replace(/[$5]/g, "s")
    .replace(/0/g, "o")
    .replace(/7/g, "t");
}

function compactLetters(value: string): string {
  return leetNormalize(value).replace(/[^a-z]+/g, "");
}

function collectTagTitles(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const titles: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && entry.trim()) {
      titles.push(entry.trim());
      continue;
    }
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const title = (entry as { title?: unknown }).title;
    if (typeof title === "string" && title.trim()) {
      titles.push(title.trim());
    }
  }
  return titles;
}

function joinSafetyText(parts: Array<string | null | undefined>): string {
  return parts
    .flatMap((part) => (part ? [part] : []))
    .join(" ")
    .trim();
}

export function isSafeContentText(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }

  const normalized = leetNormalize(trimmed).replace(/[_*+\-./\\]+/g, " ");
  if (BLOCKED_WORD_RE.test(normalized)) {
    return false;
  }

  const compact = compactLetters(trimmed);
  for (const stem of BLOCKED_COMPACT_STEMS) {
    if (compact.includes(stem)) {
      return false;
    }
  }

  return true;
}

export function isSafeUnsplashPhoto(photo: unknown): boolean {
  if (!photo || typeof photo !== "object") {
    return false;
  }

  const row = photo as {
    description?: unknown;
    alt_description?: unknown;
    altDescription?: unknown;
    title?: unknown;
    slug?: unknown;
    tags?: unknown;
    tags_preview?: unknown;
    topics?: unknown;
  };

  const topicTitles: string[] = [];
  if (Array.isArray(row.topics)) {
    for (const entry of row.topics) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const title = (entry as { title?: unknown }).title;
      if (typeof title === "string" && title.trim()) {
        topicTitles.push(title.trim());
      }
    }
  }

  const text = joinSafetyText([
    typeof row.description === "string" ? row.description : "",
    typeof row.alt_description === "string" ? row.alt_description : "",
    typeof row.altDescription === "string" ? row.altDescription : "",
    typeof row.title === "string" ? row.title : "",
    typeof row.slug === "string" ? row.slug.replace(/-/g, " ") : "",
    ...collectTagTitles(row.tags),
    ...collectTagTitles(row.tags_preview),
    ...topicTitles,
  ]);

  return isSafeContentText(text);
}

export function isSafeReference(item: ReferenceSafetyInput): boolean {
  if (item.source && PERSONAL_SOURCES.has(item.source)) {
    return true;
  }
  if (item.type === "text") {
    return true;
  }

  return isSafeContentText(
    joinSafetyText([
      item.description ?? "",
      item.altDescription ?? "",
      item.title ?? "",
      item.textLabel ?? "",
      ...(item.tags ?? []),
    ]),
  );
}

export function filterSafeUnsplashPhotos<T>(photos: T[]): T[] {
  return photos.filter((photo) => isSafeUnsplashPhoto(photo));
}

export function filterSafeReferences<T extends ReferenceSafetyInput>(items: T[]): T[] {
  return items.filter((item) => isSafeReference(item));
}
