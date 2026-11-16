// Builds the main page into a single self-contained HTML file (dist/ideave-app.html).
// Usage: node scripts/build-html.mjs [apiBaseUrl]
//   apiBaseUrl: the deployed Next server that serves /api/* (default http://localhost:3001)
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shims = path.join(root, "scripts", "html-shims");
const apiBase = (process.argv[2] || "http://localhost:3001").replace(/\/+$/, "") + "/";

const nextShims = {
  name: "next-shims",
  setup(b) {
    const map = {
      "next/navigation": "next-navigation.ts",
      "next/link": "next-link.tsx",
      "next/image": "next-image.tsx",
    };
    b.onResolve({ filter: /^next\/(navigation|link|image)$/ }, (args) => ({
      path: path.join(shims, map[args.path]),
    }));
    b.onResolve({ filter: /^@\// }, (args) => b.resolve("./" + args.path.slice(2), {
      kind: args.kind,
      resolveDir: root,
    }));
  },
};

const js = await build({
  entryPoints: [path.join(shims, "entry.tsx")],
  bundle: true,
  minify: true,
  write: false,
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  charset: "utf8",
  plugins: [nextShims],
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
const script = js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

const cssPath = path.join(root, "app", "globals.css");
const css = await postcss([tailwind({ base: root, optimize: { minify: true } })]).process(
  await readFile(cssPath, "utf8"),
  { from: cssPath },
);

// Cursor rules injected by app/layout.tsx.
const cursorModule = await build({
  entryPoints: [path.join(root, "components", "reference-prototype", "ideaveCursor.ts")],
  bundle: true,
  write: false,
  format: "esm",
});
const cursorStyles = (await import(
  "data:text/javascript;base64," + Buffer.from(cursorModule.outputFiles[0].text).toString("base64")
)).IDEAVE_CURSOR_STYLES;

const html = `<!DOCTYPE html>
<html lang="ko" class="h-full antialiased">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>IDEAVE</title>
<meta name="description" content="Design reference curation with AI-powered exploration." />
<!-- API 서버 주소: 검색·AI·업로드·이미지 요청과 /public 아이콘이 모두 이 주소로 갑니다. 서버를 옮기면 이 줄만 바꾸세요. -->
<base href="${apiBase}" />
<link rel="stylesheet" crossorigin="anonymous" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
<style>${css.css}</style>
<style>${cursorStyles}</style>
</head>
<body class="min-h-full flex flex-col">
<div id="root" class="min-h-full flex flex-col"></div>
<script>${script}</script>
</body>
</html>
`;

await mkdir(path.join(root, "dist"), { recursive: true });
const out = path.join(root, "dist", "ideave-app.html");
await writeFile(out, html, "utf8");
console.log(`Wrote ${out} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB), API base ${apiBase}`);
