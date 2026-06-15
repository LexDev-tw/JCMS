/**
 * 建置「勘驗附件製作工具」單一 HTML（不修改任何既有應用程式原始碼）。
 * 執行：node scripts/build-inspection-offline.mjs
 *
 * 預設（可連網）：函式庫自 CDN 載入，輸出 public/dist/inspection-tool.html
 * 離線：node scripts/build-inspection-offline.mjs --offline
 *   → 內嵌 React/Babel/Phosphor 字型等，輸出 public/dist/inspection-offline.html（建置時需網路）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const OFFLINE = process.argv.includes('--offline');
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(PUBLIC, 'dist', OFFLINE ? 'inspection-offline.html' : 'inspection-tool.html');

function escapeScriptBody(s) {
  return String(s).replace(/<\/script/gi, '<\\/script');
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'JCMS2-offline-builder/1' } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}

/** 離線版：內嵌 regular 樣式＋woff2（@phosphor-icons/web 無 UMD）。 */
async function fetchPhosphorRegularCssInlined() {
  const cssUrl = 'https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css';
  const fontUrl = 'https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/Phosphor.woff2';
  const [css, fontRes] = await Promise.all([
    fetchText(cssUrl),
    fetch(fontUrl, { headers: { 'User-Agent': 'JCMS2-offline-builder/1' } }),
  ]);
  if (!fontRes.ok) throw new Error(`GET ${fontUrl} -> ${fontRes.status}`);
  const b64 = Buffer.from(await fontRes.arrayBuffer()).toString('base64');
  const inlinedFace = `@font-face {
 font-family: "Phosphor";
 src: url("data:font/woff2;base64,${b64}") format("woff2");
 font-weight: normal;
 font-style: normal;
 font-display: block;
}`;
  return css.replace(/@font-face\s*\{[\s\S]*?\}/m, inlinedFace);
}

function runTailwindCss() {
  const config = path.join(__dirname, 'tailwind-inspection-offline.config.cjs');
  const input = path.join(__dirname, 'tailwind-inspection-offline-input.css');
  const out = path.join(__dirname, '.inspection-offline.tw.min.css');
  const cmd = `npx --yes tailwindcss@3.4.17 -c "${config}" -i "${input}" -o "${out}" --minify`;
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, env: { ...process.env, FORCE_COLOR: '0' } });
  const css = fs.readFileSync(out, 'utf8');
  fs.unlinkSync(out);
  return css;
}

const CDN = {
  react: 'https://unpkg.com/react@18.2.0/umd/react.production.min.js',
  reactDom: 'https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js',
  babel: 'https://unpkg.com/@babel/standalone@7.24.7/babel.min.js',
  /** 與 JCMS.html 相同：會再向 unpkg 載入各 weight 的 CSS（需連網） */
  phosphor: 'https://unpkg.com/@phosphor-icons/web@2.1.1',
};

async function main() {
  const tag = OFFLINE ? 'build-inspection-offline --offline' : 'build-inspection-tool';
  console.log(`[${tag}] Tailwind…`);
  const twCss = runTailwindCss();

  console.log(`[${tag}] 讀取專案檔案…`);
  const inspJsx = fs.readFileSync(path.join(PUBLIC, 'apps', 'inspection-layout-app.jsx'), 'utf8');
  const pdfjs = fs.readFileSync(path.join(PUBLIC, 'vendor', 'pdfjs.min.js'), 'utf8');
  const pdfWorker = fs.readFileSync(path.join(PUBLIC, 'vendor', 'pdf.worker.min.js'), 'utf8');
  const html2pdf = fs.readFileSync(path.join(PUBLIC, 'vendor', 'html2pdf.bundle.min.js'), 'utf8');

  let phosphorCss = '';
  let react = '';
  let reactDom = '';
  let babel = '';
  let cdnScripts = '';

  if (OFFLINE) {
    console.log(`[${tag}] 下載並內嵌執行庫（需網路）…`);
    const [r, rd, b, pcss] = await Promise.all([
      fetchText(CDN.react),
      fetchText(CDN.reactDom),
      fetchText(CDN.babel),
      fetchPhosphorRegularCssInlined(),
    ]);
    react = r;
    reactDom = rd;
    babel = b;
    phosphorCss = pcss;
  } else {
    console.log(`[${tag}] 函式庫使用 CDN（瀏覽器需可連 unpkg）…`);
    cdnScripts = `
  <script src="${CDN.react}" crossorigin></script>
  <script src="${CDN.reactDom}" crossorigin></script>
  <script src="${CDN.phosphor}" crossorigin></script>
  <script src="${CDN.babel}" crossorigin></script>`;
  }

  const workerBlobScript = `
(function(){
  var code = ${JSON.stringify(pdfWorker)};
  try {
    window.__INSP_PDF_WORKER_BLOB__ = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
  } catch (e) {
    console.error(e);
  }
})();`;

  const pdfWorkerPatch = `
(function patchPdfWorker(){
  function apply(){
    if (typeof pdfjsLib === 'undefined') return false;
    var blob = window.__INSP_PDF_WORKER_BLOB__;
    if (!blob) return false;
    try {
      Object.defineProperty(pdfjsLib.GlobalWorkerOptions, 'workerSrc', {
        configurable: true,
        enumerable: true,
        get: function(){ return blob; },
        set: function(){ /* 忽略應用程式寫入的 vendor 相對路徑 */ }
      });
    } catch (e) { console.warn(e); }
    return true;
  }
  if (!apply()) {
    var n = 0;
    var t = setInterval(function(){
      n++;
      if (apply() || n > 500) clearInterval(t);
    }, 10);
  }
})();`;

  const extraCss = `
html { font-size: 120%; }
body { margin: 0; }
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #EAEAEA; border-radius: 0; }
::-webkit-scrollbar-thumb:hover { background: #999999; }
`;

  const title = OFFLINE ? '勘驗附件製作工具（離線單檔）' : '勘驗附件製作工具';

  const libScripts = OFFLINE
    ? `  <script>${escapeScriptBody(react)}</script>
  <script>${escapeScriptBody(reactDom)}</script>
  <script>${escapeScriptBody(babel)}</script>`
    : cdnScripts.trimEnd();

  const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
${extraCss}
${phosphorCss}
${twCss}
  </style>
</head>
<body class="bg-panel text-ink-900 font-sans antialiased">
  <div id="inspection-layout-root" class="h-[100dvh] min-h-0 flex flex-col overflow-hidden bg-surface"></div>

  <script>${escapeScriptBody(workerBlobScript)}</script>
  <script>${escapeScriptBody(pdfjs)}</script>
  <script>${escapeScriptBody(pdfWorkerPatch)}</script>
  <script>${escapeScriptBody(html2pdf)}</script>
${libScripts}
  <script type="text/babel" data-presets="react">${escapeScriptBody(inspJsx)}</script>
  <script>
  (function () {
    /* Babel 預設在 DOMContentLoaded 才編譯 text/babel，與此處掛載競態會導致白屏。
       在 text/babel 之後同步編譯並掛載，並關閉預設 listener 避免執行兩次。 */
    try {
      if (typeof Babel !== 'undefined' && typeof Babel.disableScriptTags === 'function') {
        Babel.disableScriptTags();
      }
      if (typeof Babel !== 'undefined' && typeof Babel.transformScriptTags === 'function') {
        Babel.transformScriptTags();
      }
    } catch (e) {
      console.error(e);
    }
    if (typeof window.__jcmsMountInspectionLayout === 'function') {
      window.__jcmsMountInspectionLayout();
    } else {
      console.error('[勘驗工具] __jcmsMountInspectionLayout 未定義（請檢查主控台 Babel 錯誤）');
    }
  })();
  </script>
</body>
</html>`;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html, 'utf8');
  const mb = (Buffer.byteLength(html, 'utf8') / 1024 / 1024).toFixed(2);
  console.log(`[${tag}] 完成：`, OUT, '（約', mb, 'MB）');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
