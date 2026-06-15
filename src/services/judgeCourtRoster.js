const fs = require('fs');
const path = require('path');

/** 與 judicial-roster 一致之姓名正規化，利於與人物庫 display_name 對應。 */
function normalizeJudgeName(name) {
  return String(name || '')
    .replace(/\u3000/g, ' ')
    .trim();
}

/** 與 dynamicsService 人物姓名檢核一致，排除股別表異常列。 */
const BAD_ROSTER_NAME_RE =
  /^(臺灣|台湾|福建|地方法院|高等|行政法院|裁判|民事|刑事|少年|家事|訴訟|庭長|法官|候補|試署|辦事|調派|調任|兼任|並以|新職|為|等|人數|院長|檢察長|無|臨時|意|巳)$/;

function isPlausibleRosterJudgeName(name) {
  const n = String(name || '').trim();
  if (n.length < 2 || n.length > 4) return false;
  if (!/^[\u4e00-\u9fff]+$/.test(n)) return false;
  if (BAD_ROSTER_NAME_RE.test(n)) return false;
  return true;
}

/**
 * 司法院股別表第一欄：去空白後截出「本院／機關」（不含庭別）。
 * 順序：分院高等 → 本院高等 → 智財法院 → 最高法院 → 最高行政 → 少年及家事法院 → 地方法院。
 */
function stripCourtDivision(courtFullRaw) {
  const c = String(courtFullRaw || '').replace(/\s+/g, '').trim();
  if (!c) return '';

  const tryMatch = (re) => {
    const m = c.match(re);
    return m ? m[1].trim() : null;
  };

  let base =
    tryMatch(/^(臺灣高等法院(?:臺中|臺南|高雄|花蓮)分院)(.+)$/) ||
    tryMatch(/^(臺灣高等法院)(.+)$/) ||
    tryMatch(/^(智慧財產及商業法院)(.+)$/) ||
    tryMatch(/^(最高法院)(.+)$/) ||
    tryMatch(/^(最高行政法院)(.+)$/) ||
    tryMatch(/^(.+少年及家事法院)(.+)$/) ||
    tryMatch(/^(.+地方法院)(.+)$/);

  if (base) return base;

  const tail = tryMatch(/^(.+)(刑事庭|民事庭|少年庭|家事庭|行政訴訟庭|商業庭|行政庭|簡易庭)$/);
  return tail || c;
}

/** 股別表異常股（分案列、臨時股等） */
function isAbnormalShare(share) {
  const s = String(share || '').trim();
  if (!s) return true;
  if (s === '分案') return true;
  if (/臨時/.test(s)) return true;
  return false;
}

/**
 * 第三欄「姓名 職稱」：僅採法官（含試署／候補／辦事）；略過司法事務官等。
 * @returns {string|null} 姓名或 null
 */
function parseJudgeNameFromDptColumn3(col3) {
  const raw = String(col3 || '').replace(/\u3000/g, ' ').trim();
  if (!raw) return null;
  if (/司法事務官|事務官/.test(raw)) return null;

  const rest = raw.replace(/\s+(試署法官|候補法官|辦事法官|法官)\s*$/i, '').trim();

  if (/司法事務官|事務官/.test(rest)) return null;

  if (!rest) return null;

  const firstTok = rest.split(/\s+/)[0].trim();
  if (!firstTok) return null;
  return firstTok;
}

const ROSTER_REL = path.join('data', 'taiwan-judges-court-list.md');

function rosterAbsPath() {
  return path.join(process.cwd(), ROSTER_REL);
}

/**
 * 解析「法院|法官姓名」選列；略過表頭與 markdown 分隔線。
 * @param {string} text
 * @returns {Map<string, Set<string>>} 正規化姓名 → 法院名稱集合
 */
function buildIndexFromText(text) {
  const map = new Map();
  const lines = String(text || '').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (/^法院\s*\|/.test(line)) continue;
    if (/^\s*---\s*\|\s*---/.test(line)) continue;
    const pipeIdx = line.indexOf('|');
    if (pipeIdx < 0) continue;
    const court = line.slice(0, pipeIdx).trim();
    const judgeName = line.slice(pipeIdx + 1).trim();
    if (!court || !judgeName) continue;
    const key = normalizeJudgeName(judgeName);
    if (!key) continue;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(court);
  }
  return map;
}

function countDataRows(text) {
  let n = 0;
  const lines = String(text || '').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (/^法院\s*\|/.test(line)) continue;
    if (/^\s*---\s*\|\s*---/.test(line)) continue;
    const pipeIdx = line.indexOf('|');
    if (pipeIdx < 0) continue;
    const court = line.slice(0, pipeIdx).trim();
    const judgeName = line.slice(pipeIdx + 1).trim();
    if (court && judgeName) n += 1;
  }
  return n;
}

/** @type {Map<string, Set<string>>|null} */
let indexCache = null;

function loadIndexUnsafe() {
  const fp = rosterAbsPath();
  if (!fs.existsSync(fp)) {
    return new Map();
  }
  const text = fs.readFileSync(fp, 'utf8');
  return buildIndexFromText(text);
}

function loadIndex() {
  if (indexCache) return indexCache;
  try {
    indexCache = loadIndexUnsafe();
  } catch (e) {
    console.warn('[jcms] judge-court-roster:', e.message || String(e));
    indexCache = new Map();
  }
  return indexCache;
}

function clearIndexCache() {
  indexCache = null;
}

/**
 * @param {string} displayName 人物庫之 display_name
 * @returns {string} 多法院以「 · 」連接；無則空字串
 */
function lookupPostingUnit(displayName) {
  const key = normalizeJudgeName(displayName);
  if (!key) return '';
  const idx = loadIndex();
  const set = idx.get(key);
  if (!set || set.size === 0) return '';
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-Hant')).join(' · ');
}

/** BOM、不換行空白；股別表常見全形逗號改半形以利 split。 */
function normalizeUploadText(s) {
  return String(s ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\u00A0/g, ' ');
}

/** 股別表一列：至少四欄（法院,股,承辦人,書記官…）；支援 Tab 分隔。 */
function splitDptFields(lineRaw) {
  const line = String(lineRaw || '').trim();
  if (!line) return [];
  const commaLine = line.replace(/，/g, ',');
  let parts = commaLine.split(',').map((p) => String(p || '').trim());
  if (parts.length >= 4) return parts;
  if (line.includes('\t')) {
    parts = line.split(/\t+/).map((p) => String(p || '').trim());
  }
  return parts;
}

/**
 * 司法院股別分配表（DPT.txt）→ 內部對照檔（法院|姓名，含註解標頭）。
 * 同名跨機關者整名排除；僅法官列；已撤股／司法事務官／異常股略過。
 */
function buildMarkdownFromDptText(dptText) {
  const nameToCourts = new Map();
  let dpt_rows = 0;
  let rows_used = 0;
  let skipped_clerk = 0;
  let skipped_role = 0;
  let skipped_name = 0;
  let skipped_court = 0;
  let skipped_share = 0;

  const lines = normalizeUploadText(dptText).split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    dpt_rows += 1;

    const parts = splitDptFields(line);
    if (parts.length < 4) continue;

    const courtFull = parts[0];
    const share = parts[1] || '';
    const col3 = parts[2] || '';
    const clerk = parts[3] || '';

    if (/已撤股/.test(clerk)) {
      skipped_clerk += 1;
      continue;
    }
    if (isAbnormalShare(share)) {
      skipped_share += 1;
      continue;
    }

    const baseCourt = stripCourtDivision(courtFull);
    if (!baseCourt) {
      skipped_court += 1;
      continue;
    }

    const jName = parseJudgeNameFromDptColumn3(col3);
    if (!jName) {
      skipped_role += 1;
      continue;
    }
    const norm = normalizeJudgeName(jName);
    if (!isPlausibleRosterJudgeName(norm)) {
      skipped_name += 1;
      continue;
    }

    rows_used += 1;
    if (!nameToCourts.has(norm)) nameToCourts.set(norm, new Set());
    nameToCourts.get(norm).add(baseCourt);
  }

  const linesOut = [];
  let ambiguous_names_excluded = 0;
  for (const [name, set] of nameToCourts.entries()) {
    if (set.size > 1) {
      ambiguous_names_excluded += 1;
      continue;
    }
    const [court] = Array.from(set);
    linesOut.push(`${court}|${name}`);
  }

  linesOut.sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  const header =
    '# JCMS 法官任職對照（來源：司法院股別表 DPT.txt）\n' +
    '# 同名跨機關者已排除，不寫入本表。\n\n';
  const markdown = header + linesOut.join('\n') + '\n';

  return {
    markdown,
    stats: {
      dpt_rows,
      rows_used,
      row_count: linesOut.length,
      unique_judge_names: linesOut.length,
      ambiguous_names_excluded,
      skipped_clerk_已撤股: skipped_clerk,
      skipped_share,
      skipped_court,
      skipped_not_judge: skipped_role,
      skipped_bad_name: skipped_name,
    },
  };
}

function persistRosterFile(content, extraStats) {
  const fp = rosterAbsPath();
  const dir = path.dirname(fp);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(fp, content, 'utf8');
  clearIndexCache();
  return {
    ...extraStats,
    path: ROSTER_REL,
  };
}

/**
 * 上傳內容優先依 DPT 解析；失敗時若為舊版「法院|法官姓名」對照檔仍予寫入。
 * @returns {object} stats + path + format
 */
function saveFromDptText(dptText) {
  const raw = normalizeUploadText(dptText);
  if (!raw.trim()) {
    throw new Error('上傳檔案內容為空。');
  }

  const { markdown, stats } = buildMarkdownFromDptText(raw);
  if (stats.row_count >= 1) {
    return persistRosterFile(markdown, { ...stats, format: 'dpt' });
  }

  const legacyCount = countDataRows(raw);
  if (legacyCount >= 1) {
    const idx = buildIndexFromText(raw);
    return persistRosterFile(raw, {
      row_count: legacyCount,
      unique_judge_names: idx.size,
      ambiguous_names_excluded: 0,
      dpt_rows: stats.dpt_rows,
      rows_used: stats.rows_used,
      format: 'legacy_pipe_md',
    });
  }

  const hint =
    stats.dpt_rows < 2
      ? ' 檔案似非股別表（有效列過少），或編碼非 UTF-8 導致無法分行解析。'
      : stats.rows_used < 1
        ? ' 已讀取資料列但未解析出法官（欄位分隔或格式與預期不符）。'
        : ' 已解析法官列但經「同名跨機關排除」後無可寫入對照。';

  throw new Error(
    '無法建立法官任職對照：請使用司法院「股別分配表」下載之 TXT（UTF-8，逗號或 Tab 分隔，至少四欄）。' +
      hint +
      ' 若訊息仍出現舊版「法院|法官姓名」提示，請重啟後端（node server／PM2）以載入最新程式。'
  );
}

function getMeta() {
  const fp = rosterAbsPath();
  if (!fs.existsSync(fp)) {
    return {
      loaded: false,
      row_count: 0,
      unique_judge_names: 0,
      ambiguous_names: 0,
      updated_at: null,
      path: ROSTER_REL,
    };
  }
  const st = fs.statSync(fp);
  const text = fs.readFileSync(fp, 'utf8');
  const idx = buildIndexFromText(text);
  let ambiguous_names = 0;
  for (const s of idx.values()) {
    if (s.size > 1) ambiguous_names += 1;
  }
  return {
    loaded: true,
    row_count: countDataRows(text),
    unique_judge_names: idx.size,
    ambiguous_names,
    updated_at: st.mtime.toISOString(),
    path: ROSTER_REL,
  };
}

module.exports = {
  normalizeJudgeName,
  lookupPostingUnit,
  saveFromDptText,
  getMeta,
  clearIndexCache,
  ROSTER_REL,
};
