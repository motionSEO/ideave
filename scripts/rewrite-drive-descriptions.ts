import { loadDriveMetadataStore, saveDriveMetadataStore } from "../lib/google-drive/metadata/store";
import { DESCRIPTION_STYLE_RULE } from "../lib/google-drive/metadata/visionAnalyzer";
import { resolveGeminiApiKey } from "../shared/lib/gemini";

// 사용법: npm run drive:rewrite-descriptions -- [--limit 40] [--batch 40]
// 이미 분석된 이미지 설명(description)을 이미지 없이 글만 Gemini에 보내 명사형·덜 번역투인 한 줄로 다시 쓴다.
// 태그(style·subject 등)는 건드리지 않는다. 결과는 image-metadata.json에 바로 저장한다.
const args = process.argv.slice(2);
function readNumberArg(name: string, fallback: number): number {
  const index = args.indexOf(name);
  const value = index >= 0 ? Number(args[index + 1]) : NaN;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
const LIMIT = readNumberArg("--limit", Number.POSITIVE_INFINITY);
const BATCH = readNumberArg("--batch", 40);
const MODEL = "gemini-2.5-flash-lite";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// 서술형으로 끝나거나 번역투 표현이 남은 설명만 다시 쓴다(이미 고친 설명은 다시 돌려도 건너뛴다).
const SENTENCE_ENDING = /(니다|어요|해요|이다|한다|된다|있다)\.?\s*$|\.\s*$/;
const TRANSLATIONESE = /돋보이|자아내|자아낸|연출하는|어우러진|조화를 이루|특징으로 하는|에 의해|의 모습$|모습$/;
const needsRewrite = (text: string) => SENTENCE_ENDING.test(text) || TRANSLATIONESE.test(text);

type Row = { id: string; description: string; style: string[]; subject: string[] };

async function rewriteBatch(apiKey: string, rows: Row[]): Promise<Map<string, string>> {
  const prompt = [
    "당신은 시각 디자인 레퍼런스 아카이브의 편집자입니다. 아래 각 항목의 description을 다시 써 주세요.",
    `규칙: ${DESCRIPTION_STYLE_RULE}`,
    "원래 설명의 내용(무엇이 보이는지, 스타일)은 유지하고 표현만 바꾸세요. style·subject는 참고용입니다.",
    '응답은 JSON 배열 하나만: [{ "id": "...", "description": "..." }]',
    "",
    JSON.stringify(rows),
  ].join("\n");

  const response = await fetch(`${API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`Gemini rewrite failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  }
  const payload = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  const parsed = JSON.parse(text) as { id?: unknown; description?: unknown }[];
  const result = new Map<string, string>();
  for (const entry of parsed) {
    if (typeof entry.id !== "string" || typeof entry.description !== "string") {
      continue;
    }
    const cleaned = entry.description.trim().replace(/[.。]\s*$/, "");
    if (cleaned && !needsRewrite(cleaned)) {
      result.set(entry.id, cleaned);
    }
  }
  return result;
}

async function main() {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    throw new Error("Gemini API key is missing. Set GOOGLE_API_KEY in .env.local.");
  }
  const store = await loadDriveMetadataStore();
  const targets: Row[] = Object.values(store.images)
    .filter((record) => record.status === "ready" && record.description.trim() && needsRewrite(record.description.trim()))
    .slice(0, LIMIT)
    .map((record) => ({
      id: record.fileId,
      description: record.description.trim(),
      style: record.style,
      subject: record.subject,
    }));

  console.log(`Rewriting ${targets.length} descriptions in batches of ${BATCH}.`);
  let done = 0;
  for (let start = 0; start < targets.length; start += BATCH) {
    const rows = targets.slice(start, start + BATCH);
    let rewritten: Map<string, string>;
    try {
      rewritten = await rewriteBatch(apiKey, rows);
    } catch (error) {
      console.error(`Batch ${start / BATCH + 1} failed: ${error instanceof Error ? error.message : error}`);
      continue;
    }
    for (const [id, description] of rewritten) {
      const record = store.images[id];
      if (record) {
        record.description = description;
        done += 1;
      }
    }
    await saveDriveMetadataStore(store);
    console.log(`  ${Math.min(start + BATCH, targets.length)}/${targets.length} checked, ${done} rewritten`);
  }
  console.log(`Done. ${done} descriptions rewritten.`);
}

void main();
