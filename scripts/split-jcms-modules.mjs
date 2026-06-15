/**
 * 自 JCMS.html 內嵌 script 拆出 ES 模組至 public/js/jcms/
 * 執行：node scripts/split-jcms-modules.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const htmlPath = path.join(ROOT, 'public', 'JCMS.html');
const outBase = path.join(ROOT, 'public', 'js', 'jcms');

/** 內嵌 script 區：4548=<script> … 11842=</script> */
const SCRIPT_TAG_START = 4548;
const SCRIPT_TAG_END = 11842;

const html = fs.readFileSync(htmlPath, 'utf8');
if (!html.includes('const { createApp, ref, computed, reactive, onMounted')) {
  console.log('[split-jcms-modules] JCMS.html 已模組化，略過（請自 git 還原後再執行）');
  process.exit(0);
}

const allLines = html.split('\n');

function sliceLines(start, end) {
  return allLines
    .slice(start - 1, end)
    .map((l) => (l.startsWith('        ') ? l.slice(8) : l))
    .join('\n');
}

function writeRel(relPath, header, body) {
  const full = path.join(outBase, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const content = body ? `${header}${body}` : header;
  fs.writeFileSync(full, content, 'utf8');
  console.log('  wrote', relPath);
}

function patchHtml() {
  const before = allLines.slice(0, SCRIPT_TAG_START - 1).join('\n');
  const after = allLines.slice(SCRIPT_TAG_END).join('\n');
  const replacement = `    <!-- [Logic] Vue 3 Composition API — ES modules -->
    <script type="module" src="js/jcms/main.js"></script>`;
  fs.writeFileSync(htmlPath, `${before}\n${replacement}\n${after}`, 'utf8');
  console.log('  patched JCMS.html');
}

console.log('[split-jcms-modules] extracting…');

writeRel(
  'vue-api.js',
  `/** Vue 3 CDN 全域 → ES module 橋接（ES module 無法直接讀取 bare \`Vue\` 識別符） */
const VueRuntime = globalThis.Vue;
if (!VueRuntime) {
  throw new Error('[JCMS] Vue 未載入：請確認 vue.global.js 在 main.js 之前');
}

export const {
  createApp,
  ref,
  computed,
  reactive,
  onMounted,
  onUnmounted,
  nextTick,
  watch,
} = VueRuntime;
`,
  ''
);

writeRel('utils.js', '/** 純函式：案件、日期、當事人樹等 */\n', sliceLines(4554, 5057).replace(/^const util = /, 'export const util = '));

const rocBody = sliceLines(5059, 5230)
  .replace(/^const RocDateInput = /m, 'export const RocDateInput = ')
  .replace(/^const RocMonthInput = /m, 'export const RocMonthInput = ')
  .replace(/^const RocTimeInput = /m, 'export const RocTimeInput = ');
writeRel(
  'components/roc-inputs.js',
  `/** 民國日期／月份／時間輸入元件 */
import { util } from '../utils.js';

`,
  rocBody
);

const apiFixed = sliceLines(5241, 5728)
  .replace(/^function ensureJcmsApiBaseUrl/m, 'export function ensureJcmsApiBaseUrl')
  .replace(/^function resolveJcmsApiBaseUrl/m, 'export function resolveJcmsApiBaseUrl')
  .replace(/^function getJcmsApiBaseUrl/m, 'export function getJcmsApiBaseUrl')
  .replace(/^async function jcmsFetch/m, 'export async function jcmsFetch')
  .replace(/^const apiService = /m, 'export const apiService = ');
writeRel(
  'api/client.js',
  `/** REST API 抽象層 */
import { util } from '../utils.js';

`,
  apiFixed
);

writeRel(
  'composables/use-clock.js',
  `import { reactive, onMounted, onUnmounted } from '../vue-api.js';

`,
  sliceLines(5735, 5746).replace(/^function useClock/m, 'export function useClock')
);

writeRel(
  'composables/use-settings.js',
  `import { ref, reactive, watch, nextTick } from '../vue-api.js';
import { util } from '../utils.js';

`,
  sliceLines(5748, 5969).replace(/^function useSettings/m, 'export function useSettings')
);

writeRel(
  'composables/use-personal-admin.js',
  `import { ref, reactive, computed, watch } from '../vue-api.js';
import { util } from '../utils.js';

`,
  sliceLines(5971, 7082).replace(/^function usePersonalAdmin/m, 'export function usePersonalAdmin')
);

writeRel(
  'composables/use-cases-manager.js',
  `import { ref, reactive, computed, watch, nextTick } from '../vue-api.js';
import { util } from '../utils.js';

`,
  sliceLines(7085, 7843).replace(/^function useCasesManager/m, 'export function useCasesManager')
);

writeRel(
  'composables/use-dynamics.js',
  `import { ref, reactive, computed, watch, nextTick } from '../vue-api.js';
import { util } from '../utils.js';

`,
  sliceLines(7845, 8801).replace(/^function useDynamics/m, 'export function useDynamics')
);

const appInner = sliceLines(8806, 11841);
const appBody = `export function mountJcmsApp() {
  ${appInner.replace(/^createApp\(/, 'createApp(').replace(/\n/g, '\n  ')}
}
`;
writeRel(
  'app/create-app.js',
  `/** Vue 根應用：setup 與 mount */
import {
  createApp,
  ref,
  computed,
  reactive,
  onMounted,
  onUnmounted,
  nextTick,
  watch,
} from '../vue-api.js';
import { util } from '../utils.js';
import { apiService } from '../api/client.js';
import { RocDateInput, RocMonthInput, RocTimeInput } from '../components/roc-inputs.js';
import { useClock } from '../composables/use-clock.js';
import { useSettings } from '../composables/use-settings.js';
import { usePersonalAdmin } from '../composables/use-personal-admin.js';
import { useCasesManager } from '../composables/use-cases-manager.js';
import { useDynamics } from '../composables/use-dynamics.js';

`,
  appBody
);

writeRel(
  'main.js',
  `/** JCMS SPA 入口 */
import { mountJcmsApp } from './app/create-app.js';

mountJcmsApp();
`,
  ''
);

patchHtml();
console.log('[split-jcms-modules] done');
