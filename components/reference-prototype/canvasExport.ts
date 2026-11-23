import type { BoardCanvasItem } from "@/components/reference-prototype/BoardCanvasCard";
import {
  PENCIL_FILTER_SVG,
  drawStrokeOnCanvas,
  strokeBounds,
  strokeToSvgMarkup,
  type BoardStroke,
} from "@/components/reference-prototype/boardPen";

export type CanvasExportFormat = "png" | "jpg" | "webp" | "svg" | "pdf";

export const CANVAS_EXPORT_FORMATS: Array<{
  id: CanvasExportFormat;
  label: string;
  hint: string;
}> = [
  { id: "png", label: "PNG", hint: "투명 배경 · 화면/포트폴리오" },
  { id: "jpg", label: "JPG", hint: "작은 용량 · 사진 공유" },
  { id: "webp", label: "WebP", hint: "웹 업로드용 고효율" },
  { id: "svg", label: "SVG", hint: "벡터 · 텍스트 선명" },
  { id: "pdf", label: "PDF", hint: "인쇄 · 문서 첨부" },
];

const FRAME_PAD = 16;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function contentBounds(items: BoardCanvasItem[], strokes: BoardStroke[] = []): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  if (items.length === 0 && strokes.length === 0) {
    return null;
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x + item.width);
    maxY = Math.max(maxY, item.y + item.height);
  }
  for (const stroke of strokes) {
    const b = strokeBounds(stroke);
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  const x = Math.max(0, Math.floor(minX - FRAME_PAD));
  const y = Math.max(0, Math.floor(minY - FRAME_PAD));
  return {
    x,
    y,
    width: Math.max(1, Math.ceil(maxX + FRAME_PAD - x)),
    height: Math.max(1, Math.ceil(maxY + FRAME_PAD - y)),
  };
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image load failed"));
    image.src = url;
  });
}

function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split(/\n/);
  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const ch of paragraph) {
      if (current.length >= maxChars) {
        lines.push(current);
        current = ch;
      } else {
        current += ch;
      }
    }
    if (current) {
      lines.push(current);
    }
  }
  return lines.length > 0 ? lines : [""];
}

async function drawBoardToCanvas(items: BoardCanvasItem[], strokes: BoardStroke[]): Promise<HTMLCanvasElement> {
  const bounds = contentBounds(items, strokes);
  if (!bounds) {
    throw new Error("empty");
  }
  const canvas = document.createElement("canvas");
  canvas.width = bounds.width;
  canvas.height = bounds.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("canvas");
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, bounds.width, bounds.height);

  const ordered = [...items].sort((left, right) => left.y - right.y || left.x - right.x);
  for (const item of ordered) {
    const x = item.x - bounds.x;
    const y = item.y - bounds.y;
    if (item.type === "image") {
      if (item.imageUrl) {
        try {
          const image = await loadImageElement(item.imageUrl);
          ctx.drawImage(image, x, y, item.width, item.height);
        } catch {
          ctx.fillStyle = item.shade ?? "#e5e5e5";
          ctx.fillRect(x, y, item.width, item.height);
        }
      } else {
        ctx.fillStyle = item.shade ?? "#e5e5e5";
        ctx.fillRect(x, y, item.width, item.height);
      }
      continue;
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, item.width, item.height);
    ctx.strokeStyle = "#e5e5e5";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, item.width - 2, item.height - 2);
    ctx.fillStyle = "#222222";
    const fontSize = item.initialFontSize ?? 18;
    ctx.font = `500 ${fontSize}px Pretendard, sans-serif`;
    ctx.textBaseline = "top";
    const maxChars = Math.max(4, Math.floor((item.width - 16) / (fontSize * 0.9)));
    const lines = wrapText(item.text?.trim() || "", maxChars);
    let ty = y + 8;
    for (const line of lines) {
      ctx.fillText(line, x + 8, ty, item.width - 16);
      ty += fontSize * 1.35;
      if (ty > y + item.height - 8) {
        break;
      }
    }
  }

  // 펜 획은 화면처럼 카드 위에 그린다.
  for (const stroke of strokes) {
    drawStrokeOnCanvas(ctx, stroke, bounds.x, bounds.y);
  }

  return canvas;
}

function buildSvg(items: BoardCanvasItem[], strokes: BoardStroke[]): string {
  const bounds = contentBounds(items, strokes);
  if (!bounds) {
    return "";
  }
  const nodes: string[] = [
    `<rect width="${bounds.width}" height="${bounds.height}" fill="#ffffff"/>`,
  ];
  const ordered = [...items].sort((left, right) => left.y - right.y || left.x - right.x);
  for (const item of ordered) {
    const x = item.x - bounds.x;
    const y = item.y - bounds.y;
    if (item.type === "image") {
      if (item.imageUrl) {
        nodes.push(
          `<image href="${escapeXml(item.imageUrl)}" x="${x}" y="${y}" width="${item.width}" height="${item.height}" preserveAspectRatio="xMidYMid slice"/>`,
        );
      } else {
        nodes.push(
          `<rect x="${x}" y="${y}" width="${item.width}" height="${item.height}" fill="${escapeXml(item.shade ?? "#e5e5e5")}"/>`,
        );
      }
      continue;
    }
    const fontSize = item.initialFontSize ?? 18;
    nodes.push(
      `<rect x="${x}" y="${y}" width="${item.width}" height="${item.height}" fill="#ffffff" stroke="#e5e5e5" stroke-width="2"/>`,
    );
    nodes.push(
      `<foreignObject x="${x + 8}" y="${y + 8}" width="${Math.max(1, item.width - 16)}" height="${Math.max(1, item.height - 16)}"><div xmlns="http://www.w3.org/1999/xhtml" style="font:500 ${fontSize}px Pretendard,sans-serif;color:#222;white-space:pre-wrap;word-break:keep-all;">${escapeXml(item.text ?? "")}</div></foreignObject>`,
    );
  }
  for (const stroke of strokes) {
    nodes.push(strokeToSvgMarkup(stroke, bounds.x, bounds.y));
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${bounds.width}" height="${bounds.height}" viewBox="0 0 ${bounds.width} ${bounds.height}"><defs>${PENCIL_FILTER_SVG}</defs>${nodes.join("")}</svg>`;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("blob"));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

function wrapJpegInPdf(jpeg: Uint8Array, width: number, height: number): Blob {
  const encode = (value: string) => new TextEncoder().encode(value);
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let position = 0;

  const add = (value: string | Uint8Array) => {
    const bytes = typeof value === "string" ? encode(value) : value;
    chunks.push(bytes);
    position += bytes.length;
  };

  add("%PDF-1.4\n");
  offsets[1] = position;
  add("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n");
  offsets[2] = position;
  add("2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n");
  offsets[3] = position;
  add(
    `3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>endobj\n`,
  );
  offsets[4] = position;
  add(
    `4 0 obj<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>stream\n`,
  );
  add(jpeg);
  add("\nendstream\nendobj\n");
  const content = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q\n`;
  offsets[5] = position;
  add(`5 0 obj<< /Length ${content.length} >>stream\n${content}endstream\nendobj\n`);
  const xrefPosition = position;
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (let index = 1; index <= 5; index += 1) {
    xref += `${String(offsets[index] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  add(xref);
  add(`trailer<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPosition}\n%%EOF`);
  const combined = new Uint8Array(position);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return new Blob([combined], { type: "application/pdf" });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function exportBoardCanvas(
  items: BoardCanvasItem[],
  format: CanvasExportFormat,
  strokes: BoardStroke[] = [],
): Promise<void> {
  if (items.length === 0 && strokes.length === 0) {
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `ideave-canvas-${stamp}`;

  if (format === "svg") {
    const svg = buildSvg(items, strokes);
    triggerDownload(new Blob([svg], { type: "image/svg+xml" }), `${base}.svg`);
    return;
  }

  const canvas = await drawBoardToCanvas(items, strokes);
  if (format === "pdf") {
    const jpegBlob = await canvasToBlob(canvas, "image/jpeg", 0.92);
    const jpeg = new Uint8Array(await jpegBlob.arrayBuffer());
    triggerDownload(wrapJpegInPdf(jpeg, canvas.width, canvas.height), `${base}.pdf`);
    return;
  }

  if (format === "jpg") {
    triggerDownload(await canvasToBlob(canvas, "image/jpeg", 0.92), `${base}.jpg`);
    return;
  }
  if (format === "webp") {
    triggerDownload(await canvasToBlob(canvas, "image/webp", 0.92), `${base}.webp`);
    return;
  }
  triggerDownload(await canvasToBlob(canvas, "image/png"), `${base}.png`);
}
