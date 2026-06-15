const { randomUUID } = require('crypto');
const { getDb, rebuildDynamicsFts } = require('../config/database');
const { lookupClassYearByName, clearRosterCache } = require('./judicialRoster');
const judgeCourtRoster = require('./judgeCourtRoster');

const DYNAMICS_PERSON_ROLES = ['judge', 'prosecutor', 'lawyer', 'scholar'];
const NGRAM_MIN = 1;
const NGRAM_MAX = 3;
/** 單篇文件索引 token 數上限；超過時仍保留全部 2～3 字元片段（地名／機關名），僅裁切 1 字元 token。 */
const NGRAM_INDEX_MAX_UNIQUE = 20000;
/** n-gram 索引策略版本；變更時自動全量重建 posting（避免舊版截斷導致地名搜不到）。 */
const DYNAMICS_NGRAM_SCHEMA_VERSION = '3';
let dynamicsNgramReady = false;

function normalizeNewPersonRole(role) {
  return DYNAMICS_PERSON_ROLES.includes(role) ? role : 'judge';
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeAttachmentList(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const url = String(item && item.url != null ? item.url : '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({
      url,
      name: String(item && item.name != null ? item.name : '').trim() || '附件',
    });
  }
  return out;
}

function parseAttachmentListJson(raw) {
  if (!raw) return [];
  try {
    return normalizeAttachmentList(JSON.parse(raw));
  } catch (_) {
    return [];
  }
}

function mapPerson(row) {
  if (!row) return null;
  return {
    id: row.id,
    role: row.role,
    display_name: row.display_name,
    class_year: row.class_year,
    notes: row.notes,
    notes_attachments: parseAttachmentListJson(row.notes_attachments),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    person_id: row.person_id,
    occurred_on: row.occurred_on,
    kind: row.kind,
    summary: row.summary,
    raw_text: row.raw_text,
    attachments: parseAttachmentListJson(row.attachments),
    source_channel: row.source_channel,
    import_batch_id: row.import_batch_id,
    created_at: row.created_at,
  };
}

/**
 * 將使用者輸入轉成 FTS5 MATCH 安全查詢（多詞為 AND，避免 OR/NOT 被誤用）。
 * @param {string} raw
 */
function buildFtsMatchQuery(raw) {
  const s = String(raw || '')
    .trim()
    .slice(0, 200)
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const safeTerms = parts
    .map((part) => {
      let sign = '';
      let t = String(part || '');
      if (t.startsWith('+') || t.startsWith('-')) {
        sign = t[0];
        t = t.slice(1);
      }
      t = t.replace(/[^\p{L}\p{N}_\u4e00-\u9fff]/gu, '');
      if (!t) return null;
      return `${sign}${t}*`;
    })
    .filter(Boolean);
  if (!safeTerms.length) return null;
  return safeTerms.join(' ');
}

function normalizeNgramText(input) {
  return String(input || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\u3000/g, ' ')
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 建索引用：不可依「詞頻截斷」丟棄低頻 2～3gram，否則長文中「彰化」「士林」等機關名常被排掉。
 * @returns {Array<[string, number]>}
 */
function extractNgramTokensForIndex(input) {
  const words = normalizeNgramText(input).split(' ').filter(Boolean);
  /** @type {Map<string, number>} */
  const tf = new Map();
  for (const word of words) {
    const chars = Array.from(word);
    if (chars.length === 0) continue;
    for (let n = NGRAM_MIN; n <= NGRAM_MAX; n++) {
      if (chars.length < n) continue;
      for (let i = 0; i <= chars.length - n; i++) {
        const token = chars.slice(i, i + n).join('');
        if (!token) continue;
        tf.set(token, (tf.get(token) || 0) + 1);
      }
    }
  }
  let entries = Array.from(tf.entries());
  if (entries.length <= NGRAM_INDEX_MAX_UNIQUE) return entries;
  const multi = entries.filter(([tok]) => tok.length >= 2);
  const uni = entries.filter(([tok]) => tok.length === 1);
  uni.sort((a, b) => b[1] - a[1]);
  const capUni = Math.max(0, NGRAM_INDEX_MAX_UNIQUE - multi.length);
  return multi.concat(uni.slice(0, capUni));
}

/**
 * 查詢用 n-gram：純中文且長度≥2 時不使用 1-gram，避免「臺中」拆成「中」造成誤命中。
 * 單一漢字查詢仍允許 1-gram。
 * @param {string} phrase 已 trim 的單一片語（不含空白）
 * @returns {string[]}
 */
function extractNgramTokensForQueryPhrase(phrase) {
  const word = String(phrase || '').trim();
  if (!word) return [];
  const chars = Array.from(word);
  if (chars.length === 0) return [];
  const isCjkOnly = chars.every((c) => /[\u4e00-\u9fff]/.test(c));
  let minN = NGRAM_MIN;
  if (isCjkOnly) {
    minN = chars.length >= 2 ? 2 : 1;
  }
  /** @type {Set<string>} */
  const out = new Set();
  for (let n = minN; n <= NGRAM_MAX && n <= chars.length; n++) {
    for (let i = 0; i <= chars.length - n; i++) {
      out.add(chars.slice(i, i + n).join(''));
    }
  }
  return Array.from(out);
}

/**
 * 依空白分詞；每一段須各自命中（AND），段內多 token 為 OR。
 * @param {string} rawQuery
 * @returns {string[][]}
 */
function extractQueryPhraseTokenSets(rawQuery) {
  const phrases = normalizeNgramText(rawQuery).split(' ').filter(Boolean);
  return phrases.map((p) => extractNgramTokensForQueryPhrase(p)).filter((tokens) => tokens.length > 0);
}

/** 單一純中文片語（長度≥2）：結果必須字面包含該片語，避免 FTS／其它路徑誤命中。 */
function shouldStrictLiteralSubstringFilter(rawQuery) {
  const phrases = normalizeNgramText(rawQuery).split(' ').filter(Boolean);
  if (phrases.length !== 1) return false;
  const w = phrases[0];
  if (w.length < 2) return false;
  return Array.from(w).every((c) => /[\u4e00-\u9fff]/.test(c));
}

function normalizeDynamicsSearchNeedle(rawQuery) {
  return normalizeNgramText(rawQuery).replace(/\s+/g, '');
}

function escapeSqlLikePattern(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

/**
 * 姓名優先階段：由使用者查詢拆出用於 display_name 的片語（空白為 AND；略過 FTS 尾端 *）。
 * @param {string} rawQuery
 * @returns {string[]}
 */
function extractDisplayNameLikePhrases(rawQuery) {
  const s = String(rawQuery || '')
    .trim()
    .slice(0, 200)
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return [];
  const parts = s.split(/\s+/).filter(Boolean);
  /** @type {string[]} */
  const out = [];
  for (const part of parts) {
    let t = String(part || '');
    if (t.startsWith('+') || t.startsWith('-')) t = t.slice(1);
    t = t.replace(/^"+|"+$/g, '').trim();
    t = t.replace(/\*+$/g, '');
    t = normalizeNgramText(t);
    if (t) out.push(t);
  }
  return out;
}

/**
 * 僅比對 dynamics_person.display_name（與全文索引 body 分離，避免 class_year／notes 先命中）。
 * @param {import('sqlite3').Database} db
 * @param {string} rawQuery
 * @param {number} limit
 */
async function searchDynamicsPersonDisplayNameOnly(db, rawQuery, limit) {
  const phrases = extractDisplayNameLikePhrases(rawQuery);
  if (!phrases.length) return [];
  const lim = Math.min(80, Math.max(1, parseInt(limit, 10) || 40));
  const candidateLimit = Math.min(200, lim * 3);
  let sql =
    'SELECT id AS ref_id, id AS person_id, display_name AS person_display_name FROM dynamics_person WHERE 1=1';
  const params = [];
  for (const ph of phrases) {
    sql += " AND display_name LIKE ? ESCAPE '\\'";
    params.push(`%${escapeSqlLikePattern(ph)}%`);
  }
  sql += ' ORDER BY display_name ASC LIMIT ?';
  params.push(candidateLimit);
  const rows = await db.allAsync(sql, params);
  return rows.map((row) => ({
    ref_id: row.ref_id,
    kind: 'person',
    person_id: row.person_id,
    event_id: null,
    snippet: '',
    person_display_name: row.person_display_name || '',
    rank: null,
  }));
}

/**
 * 子字串後備（LIKE）：補足 n-gram 尚未重建或極長尾文本邊界案例；僅在單一純中文查詢且結果不足時啟用。
 */
async function searchDynamicsSubtextFallback(db, needle, limit) {
  if (!needle || limit < 1) return [];
  const like = `%${escapeSqlLikePattern(needle)}%`;
  const lim = Math.min(120, Math.max(1, limit));
  const evRows = await db.allAsync(
    `SELECT e.id AS ref_id, e.person_id AS person_id,
            p.display_name AS person_display_name,
            trim(coalesce(e.summary, '') || ' ' || coalesce(e.raw_text, '')) AS snippet_source
     FROM dynamics_event e
     LEFT JOIN dynamics_person p ON p.id = e.person_id
     WHERE e.summary LIKE ? ESCAPE '\\' OR e.raw_text LIKE ? ESCAPE '\\'
     LIMIT ?`,
    [like, like, lim]
  );
  const perRows = await db.allAsync(
    `SELECT id AS ref_id, id AS person_id, display_name AS person_display_name,
            trim(coalesce(display_name, '') || ' ' || coalesce(class_year, '') || ' ' || coalesce(notes, '')) AS snippet_source
     FROM dynamics_person
     WHERE display_name LIKE ? ESCAPE '\\'
        OR COALESCE(notes, '') LIKE ? ESCAPE '\\'
        OR COALESCE(class_year, '') LIKE ? ESCAPE '\\'
     LIMIT ?`,
    [like, like, like, lim]
  );
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < evRows.length; i++) {
    const row = evRows[i];
    const sn = String(row.snippet_source || '');
    const snippet = sn.length > 96 ? `${sn.slice(0, 96)}…` : sn;
    out.push({
      ref_id: row.ref_id,
      kind: 'event',
      person_id: row.person_id,
      event_id: row.ref_id,
      snippet,
      person_display_name: row.person_display_name || '',
      rank: null,
      _score: 0.004 / (i + 1),
    });
  }
  for (let j = 0; j < perRows.length; j++) {
    const row = perRows[j];
    const sn = String(row.snippet_source || '');
    const snippet = sn.length > 96 ? `${sn.slice(0, 96)}…` : sn;
    out.push({
      ref_id: row.ref_id,
      kind: 'person',
      person_id: row.ref_id,
      event_id: null,
      snippet,
      person_display_name: row.person_display_name || '',
      rank: null,
      _score: 0.003 / (j + 1),
    });
  }
  return out;
}

async function upsertNgramDoc(db, { refId, kind, personId, body }) {
  if (!refId || !kind || !personId) return;
  await db.runAsync('DELETE FROM dynamics_ngram_posting WHERE ref_id = ? AND kind = ?', [refId, kind]);
  const tokens = extractNgramTokensForIndex(body);
  if (!tokens.length) return;
  for (const [token, tf] of tokens) {
    await db.runAsync(
      `INSERT OR REPLACE INTO dynamics_ngram_posting (token, ref_id, kind, person_id, tf)
       VALUES (?, ?, ?, ?, ?)`,
      [token, refId, kind, personId, tf]
    );
  }
}

async function deleteNgramDoc(db, { refId, kind }) {
  if (!refId || !kind) return;
  await db.runAsync('DELETE FROM dynamics_ngram_posting WHERE ref_id = ? AND kind = ?', [refId, kind]);
}

async function rebuildDynamicsNgramIndex(db) {
  await db.runAsync('BEGIN IMMEDIATE');
  try {
    await db.runAsync('DELETE FROM dynamics_ngram_posting');
    const persons = await db.allAsync('SELECT id, display_name, class_year, notes FROM dynamics_person');
    for (const p of persons) {
      const body = `${p.display_name || ''} ${p.class_year || ''} ${p.notes || ''}`.trim();
      const tokens = extractNgramTokensForIndex(body);
      for (const [token, tf] of tokens) {
        await db.runAsync(
          `INSERT OR REPLACE INTO dynamics_ngram_posting (token, ref_id, kind, person_id, tf)
           VALUES (?, ?, 'person', ?, ?)`,
          [token, p.id, p.id, tf]
        );
      }
    }
    const events = await db.allAsync('SELECT id, person_id, summary, raw_text FROM dynamics_event');
    for (const e of events) {
      const body = `${e.summary || ''} ${e.raw_text || ''}`.trim();
      const tokens = extractNgramTokensForIndex(body);
      for (const [token, tf] of tokens) {
        await db.runAsync(
          `INSERT OR REPLACE INTO dynamics_ngram_posting (token, ref_id, kind, person_id, tf)
           VALUES (?, ?, 'event', ?, ?)`,
          [token, e.id, e.person_id, tf]
        );
      }
    }
    await db.runAsync('COMMIT');
  } catch (e) {
    await db.runAsync('ROLLBACK').catch(() => {});
    throw e;
  }
}

async function ensureDynamicsNgramReady(db) {
  if (dynamicsNgramReady) return;
  let postingCount = 0;
  let sourceCount = 0;
  let needSchemaRebuild = false;
  try {
    const meta = await db.getAsync(
      `SELECT value FROM dynamics_search_meta WHERE key = 'ngram_schema_v'`
    );
    needSchemaRebuild = String(meta?.value || '') !== DYNAMICS_NGRAM_SCHEMA_VERSION;
  } catch {
    needSchemaRebuild = true;
  }
  try {
    const p = await db.getAsync('SELECT COUNT(*) AS n FROM dynamics_ngram_posting');
    postingCount = Number(p?.n || 0);
    const ps = await db.getAsync('SELECT COUNT(*) AS n FROM dynamics_person');
    const es = await db.getAsync('SELECT COUNT(*) AS n FROM dynamics_event');
    sourceCount = Number(ps?.n || 0) + Number(es?.n || 0);
  } catch {
    postingCount = 0;
    sourceCount = 0;
  }
  if (needSchemaRebuild || (sourceCount > 0 && postingCount === 0)) {
    await rebuildDynamicsNgramIndex(db);
    await db.runAsync(
      `INSERT OR REPLACE INTO dynamics_search_meta (key, value) VALUES ('ngram_schema_v', ?)`,
      [DYNAMICS_NGRAM_SCHEMA_VERSION]
    );
  }
  dynamicsNgramReady = true;
}

/**
 * 單一純中文查詢時：僅保留全文（人物／事件）正規化後含 needle 的結果。
 * @param {import('sqlite3').Database} db
 * @param {any[]} mergedSorted
 * @param {string} needle
 */
async function filterMergedByLiteralNeedle(db, mergedSorted, needle) {
  if (!needle || !mergedSorted.length) return mergedSorted;
  const personIds = [...new Set(mergedSorted.filter((r) => r.kind === 'person').map((r) => r.ref_id))];
  const eventIds = [...new Set(mergedSorted.filter((r) => r.kind === 'event').map((r) => r.ref_id))];
  /** @type {Map<string, string>} */
  const bodyByKey = new Map();
  if (personIds.length) {
    const placeholders = personIds.map(() => '?').join(',');
    const rows = await db.allAsync(
      `SELECT id, display_name, class_year, notes FROM dynamics_person WHERE id IN (${placeholders})`,
      personIds
    );
    for (const row of rows) {
      const body = normalizeNgramText(
        `${row.display_name || ''} ${row.class_year || ''} ${row.notes || ''}`
      );
      bodyByKey.set(`person:${row.id}`, body);
    }
  }
  if (eventIds.length) {
    const placeholders = eventIds.map(() => '?').join(',');
    const rows = await db.allAsync(
      `SELECT id, summary, raw_text FROM dynamics_event WHERE id IN (${placeholders})`,
      eventIds
    );
    for (const row of rows) {
      const body = normalizeNgramText(`${row.summary || ''} ${row.raw_text || ''}`);
      bodyByKey.set(`event:${row.id}`, body);
    }
  }
  return mergedSorted.filter((r) => {
    const key = `${r.kind}:${r.ref_id}`;
    const body = bodyByKey.get(key);
    if (!body) return true;
    return body.includes(needle);
  });
}

function mapProposal(row) {
  if (!row) return null;
  return {
    id: row.id,
    batch_id: row.batch_id,
    suggested_person_name: row.suggested_person_name,
    person_id: row.person_id,
    occurred_on: row.occurred_on,
    kind: row.kind,
    summary: row.summary,
    excerpt: row.excerpt,
    status: row.status,
    created_at: row.created_at,
  };
}

/** @param {string} chunk */
function extractOccurredOn(chunk) {
  const s = String(chunk || '');
  const iso = s.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const y = iso[1];
    const m = iso[2].padStart(2, '0');
    const d = iso[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const m = s.match(/(?:民國)?\s*(\d{2,3})\s*[年./]\s*(\d{1,2})\s*[月./]\s*(\d{1,2})/);
  if (m) {
    const roc = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    const y = roc + 1911;
    if (y >= 1940 && y <= 2120 && mo >= 1 && mo <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return null;
}

function splitHints(str) {
  return String(str || '')
    .split(/[,，、\s\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 司法院人事決議常見「職稱＋姓名」：由長至短匹配，避免「法官」吃掉「試署法官」。
 * 涵蓋使用者提供之決議體例（分號子句、顿號續列姓名、多種法官職稱）。
 */
const JUDICIAL_TITLE_FRAGMENTS = [
  '法官兼庭長',
  '少年及家事法院（試署）法官',
  '（試署、候補）法官',
  '地方行政訴訟庭法官',
  '辦事法官',
  '試署法官',
  '候補法官',
  '（試署）法官',
  '（候補）法官',
  '法官',
].sort((a, b) => b.length - a.length);

/** 姓名緊接：顿號／句讀／「為」（派任）／「并／並」／「等N」（須為「等+數字」）／句末（勿單獨用 \\d 以免吃掉「等」） */
const NAME_TAIL_LOOKAHEAD = '(?=[、，；。为為并並]|等\\d|$)';

const TITLE_CAPTURE_RE = new RegExp(
  `(${JUDICIAL_TITLE_FRAGMENTS.map(escapeRegExp).join('|')})([\\u4e00-\\u9fff]{2,4})${NAME_TAIL_LOOKAHEAD}`,
  'g'
);

const CHAIN_BREAK_RE = new RegExp(
  `^(${JUDICIAL_TITLE_FRAGMENTS.map(escapeRegExp).join('|')})`
);

/**
 * 顿號後若接另一法院／機關敘述，停止續抓（避免「、臺灣橋頭…」「、臺中高等…」被當成姓名）。
 */
const CHAIN_COURT_PREFIX_RE =
  /^(臺灣|台湾|福建|臺中|臺北|臺南|臺東|臺西|高雄|新北|桃園|新竹|苗栗|南投|雲林|嘉義|彰化|屏東|宜蘭|花蓮|基隆|橋頭|士林|金門|澎湖|最高法院|司法院|行政院|高等法院|少年及家事|福建金門|臺中高等|臺北高等|高雄高等)/;

const BAD_PERSON_NAME_RE =
  /^(臺灣|台湾|福建|地方法院|高等|行政法院|裁判|民事|刑事|少年|家事|訴訟|庭長|法官|候補|試署|辦事|調派|調任|兼任|並以|新職|為|等|人數|院長|檢察長)/;

function isPlausiblePersonName(name) {
  const n = String(name || '').trim();
  if (n.length < 2 || n.length > 4) return false;
  if (!/^[\u4e00-\u9fff]+$/.test(n)) return false;
  if (BAD_PERSON_NAME_RE.test(n)) return false;
  return true;
}

/** 民國 YYYMMDD 七碼 → YYYY-MM-DD */
function roc7DigitsToIso(roc7) {
  const s = String(roc7 || '').replace(/\D/g, '').slice(0, 7);
  if (s.length !== 7) return null;
  const ry = parseInt(s.slice(0, 3), 10);
  const mo = parseInt(s.slice(3, 5), 10);
  const day = parseInt(s.slice(5, 7), 10);
  if (!Number.isFinite(ry) || !Number.isFinite(mo) || !Number.isFinite(day)) return null;
  const gy = ry + 1911;
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return null;
  const dt = new Date(gy, mo - 1, day);
  if (dt.getFullYear() !== gy || dt.getMonth() !== mo - 1 || dt.getDate() !== day) return null;
  return `${gy}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * 姓名|單位|職稱|日期|來源|內容（半形 |）；第六段起併為內容，允許來源／內文含 |。
 */
function parsePipeStructuredLine(line, lineIndex) {
  const rawLine = String(line || '').trim();
  if (!rawLine) return null;
  const parts = rawLine.split('|').map((x) => x.trim());
  if (parts.length < 6) {
    throw new Error(`第 ${lineIndex + 1} 列欄位不足 6 段（需以 | 分隔）：${rawLine.slice(0, 48)}…`);
  }
  const display_name = parts[0];
  const organization = parts[1];
  const role_title = parts[2];
  const dateRaw = parts[3];
  const source = parts[4];
  const content = parts.slice(5).join('|');
  if (!display_name) {
    throw new Error(`第 ${lineIndex + 1} 列姓名不得為空`);
  }
  if (!isPlausiblePersonName(display_name)) {
    throw new Error(`第 ${lineIndex + 1} 列姓名異常「${display_name}」，請確認為 2～4 個漢字`);
  }
  let occurred_on = null;
  if (dateRaw && String(dateRaw).toUpperCase() !== 'UNKNOWN') {
    occurred_on = roc7DigitsToIso(dateRaw);
    if (!occurred_on) {
      throw new Error(`第 ${lineIndex + 1} 列日期須為民國七碼 YYYMMDD 或 UNKNOWN：${dateRaw}`);
    }
  }
  const summaryBase = source || content || role_title;
  const summary = summaryBase.length > 160 ? `${summaryBase.slice(0, 160)}…` : summaryBase;
  return {
    display_name,
    organization,
    role_title,
    occurred_on,
    source,
    content,
    summary,
    raw_text: rawLine,
  };
}

/**
 * 依全形分號、句號拆成子句（單句長決議仍會保留為一條）。
 * @param {string} text
 */
function segmentResolutionClauses(text) {
  const t = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!t) return [];
  const parts = t.split(/[；。]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 0) return parts;
  return [t];
}

/**
 * 從單一決議子句擷取司法官姓名：職稱＋姓名，並處理「張某、王某、」顿號續列（不跨下一職稱或下一法院）。
 * @param {string} clause
 * @returns {string[]}
 */
function extractJudicialOfficerNamesFromClause(clause) {
  const s = String(clause || '').trim();
  if (!s) return [];
  const re = new RegExp(TITLE_CAPTURE_RE.source, 'g');
  const names = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(s)) !== null) {
    const primary = m[2];
    if (isPlausiblePersonName(primary) && !seen.has(primary)) {
      names.push(primary);
      seen.add(primary);
    }
    let idx = m.index + m[0].length;
    while (s[idx] === '、') {
      idx += 1;
      const rest = s.slice(idx);
      if (CHAIN_COURT_PREFIX_RE.test(rest)) break;
      if (CHAIN_BREAK_RE.test(rest)) break;
      const nm = rest.match(
        new RegExp(`^([\\u4e00-\\u9fff]{2,4})${NAME_TAIL_LOOKAHEAD}`)
      );
      if (!nm) break;
      const bn = nm[1];
      if (!isPlausiblePersonName(bn)) break;
      if (!seen.has(bn)) {
        names.push(bn);
        seen.add(bn);
      }
      idx += bn.length;
    }
  }
  return names;
}

/**
 * @param {string} rawText
 * @param {string} nameHints
 * @param {{ id: string, display_name: string }[]} personsFromDb
 */
function buildProposalsFromText(rawText, nameHints, personsFromDb) {
  const manual = splitHints(nameHints);
  const dbNames = (personsFromDb || []).map((p) => p.display_name).filter(Boolean);
  const candidates = [...new Set([...manual, ...dbNames])].sort((a, b) => b.length - a.length);

  const clauses = segmentResolutionClauses(rawText);
  const proposals = [];
  const seen = new Set();

  for (const clause of clauses) {
    const fromRegex = extractJudicialOfficerNamesFromClause(clause);
    const fromDict = candidates.filter((n) => n && clause.includes(n));
    const orderedNames = [];
    const used = new Set();
    for (const n of fromRegex) {
      if (!used.has(n)) {
        orderedNames.push(n);
        used.add(n);
      }
    }
    for (const n of fromDict) {
      if (!used.has(n)) {
        orderedNames.push(n);
        used.add(n);
      }
    }
    if (orderedNames.length === 0) continue;

    for (const name of orderedNames) {
      const person = personsFromDb.find((p) => p.display_name === name);
      const key = `${name}::${clause}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const excerpt = clause;
      const summary = excerpt.length > 160 ? `${excerpt.slice(0, 160)}…` : excerpt;
      proposals.push({
        suggested_person_name: name,
        person_id: person ? person.id : null,
        occurred_on: extractOccurredOn(clause),
        kind: 'resolution',
        summary,
        excerpt,
      });
    }
  }
  return proposals;
}

async function listPersons() {
  const db = getDb();
  const rows = await db.allAsync(
    'SELECT * FROM dynamics_person ORDER BY display_name COLLATE NOCASE ASC'
  );
  return rows.map(mapPerson);
}

/**
 * 依最新 judicial-roster.md 為「未填期別」人物補 class_year；lookup 規則見 judicialRoster。
 * @returns {Promise<{ filled: Array<{id: string, display_name: string, class_year: string}>, unchanged: number }>}
 */
async function syncMissingClassYearsFromJudicialRoster() {
  clearRosterCache();
  const db = getDb();
  const rows = await db.allAsync(
    `SELECT id, display_name FROM dynamics_person
     WHERE class_year IS NULL OR trim(class_year) = ''`
  );
  const filled = [];
  for (const row of rows) {
    const inferred = lookupClassYearByName(row.display_name);
    if (!inferred) continue;
    await updatePerson(row.id, { class_year: inferred });
    filled.push({
      id: row.id,
      display_name: String(row.display_name || '').trim(),
      class_year: inferred,
    });
  }
  return { filled, unchanged: rows.length - filled.length };
}

async function getPersonById(id) {
  const db = getDb();
  const row = await db.getAsync('SELECT * FROM dynamics_person WHERE id = ?', [id]);
  return mapPerson(row);
}

async function getPersonWithEvents(id) {
  const person = await getPersonById(id);
  if (!person) return null;
  const db = getDb();
  const events = await db.allAsync(
    `SELECT * FROM dynamics_event WHERE person_id = ?
     ORDER BY
       CASE WHEN occurred_on IS NULL OR occurred_on = '' THEN 1 ELSE 0 END,
       occurred_on DESC,
       created_at DESC`,
    [id]
  );
  const roster_posting_unit =
    person.role === 'judge' ? judgeCourtRoster.lookupPostingUnit(person.display_name) : '';
  return { person, events: events.map(mapEvent), roster_posting_unit };
}

function getJudgeCourtRosterMeta() {
  return judgeCourtRoster.getMeta();
}

function saveJudgeCourtRosterFromDpt(body) {
  const b = body && typeof body === 'object' ? body : {};
  const text =
    b.content != null
      ? String(b.content)
      : b.raw != null
        ? String(b.raw)
        : b.dpt != null
          ? String(b.dpt)
          : '';
  return judgeCourtRoster.saveFromDptText(text);
}

async function createPerson(body) {
  const db = getDb();
  await ensureDynamicsNgramReady(db);
  const id = randomUUID();
  const display_name = String(body.display_name || '').trim();
  if (!display_name) {
    throw new Error('display_name 必填');
  }
  const role = normalizeNewPersonRole(body.role);
  const class_year = body.class_year != null ? String(body.class_year).trim() || null : null;
  const notes = body.notes != null ? String(body.notes).trim() || null : null;
  const notes_attachments = JSON.stringify(normalizeAttachmentList(body.notes_attachments));
  const t = nowIso();
  await db.runAsync(
    `INSERT INTO dynamics_person (id, role, display_name, class_year, notes, notes_attachments, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, role, display_name, class_year, notes, notes_attachments, t, t]
  );
  await upsertNgramDoc(db, {
    refId: id,
    kind: 'person',
    personId: id,
    body: `${display_name} ${class_year || ''} ${notes || ''}`,
  });
  return getPersonById(id);
}

async function updatePerson(id, body) {
  const db = getDb();
  await ensureDynamicsNgramReady(db);
  const existing = await getPersonById(id);
  if (!existing) return null;
  const role =
    body.role !== undefined
      ? DYNAMICS_PERSON_ROLES.includes(body.role)
        ? body.role
        : existing.role
      : existing.role;
  const display_name =
    body.display_name != null ? String(body.display_name).trim() : existing.display_name;
  if (!display_name) throw new Error('display_name 不可為空');
  const class_year =
    body.class_year !== undefined ? (String(body.class_year).trim() || null) : existing.class_year;
  const notes = body.notes !== undefined ? (String(body.notes).trim() || null) : existing.notes;
  const notes_attachments =
    body.notes_attachments !== undefined
      ? JSON.stringify(normalizeAttachmentList(body.notes_attachments))
      : JSON.stringify(normalizeAttachmentList(existing.notes_attachments));
  const t = nowIso();
  await db.runAsync(
    `UPDATE dynamics_person SET role = ?, display_name = ?, class_year = ?, notes = ?, notes_attachments = ?, updated_at = ?
     WHERE id = ?`,
    [role, display_name, class_year, notes, notes_attachments, t, id]
  );
  await upsertNgramDoc(db, {
    refId: id,
    kind: 'person',
    personId: id,
    body: `${display_name} ${class_year || ''} ${notes || ''}`,
  });
  return getPersonById(id);
}

async function deletePerson(id) {
  const db = getDb();
  await ensureDynamicsNgramReady(db);
  const existing = await getPersonById(id);
  if (!existing) return false;
  const eventRows = await db.allAsync('SELECT id FROM dynamics_event WHERE person_id = ?', [id]);
  await db.runAsync('DELETE FROM dynamics_event WHERE person_id = ?', [id]);
  await db.runAsync('DELETE FROM dynamics_person WHERE id = ?', [id]);
  for (const ev of eventRows) {
    await deleteNgramDoc(db, { refId: ev.id, kind: 'event' });
  }
  await deleteNgramDoc(db, { refId: id, kind: 'person' });
  return true;
}

async function insertEvent({
  person_id,
  occurred_on,
  kind,
  summary,
  raw_text,
  attachments,
  source_channel,
  import_batch_id,
}) {
  const db = getDb();
  await ensureDynamicsNgramReady(db);
  const id = randomUUID();
  const k = ['resolution', 'news', 'note', 'other'].includes(kind) ? kind : 'note';
  const ch = source_channel === 'bulk_parse' ? 'bulk_parse' : 'person_direct';
  const attachmentJson = JSON.stringify(normalizeAttachmentList(attachments));
  const t = nowIso();
  await db.runAsync(
    `INSERT INTO dynamics_event (id, person_id, occurred_on, kind, summary, raw_text, attachments, source_channel, import_batch_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      person_id,
      occurred_on || null,
      k,
      summary != null ? String(summary) : null,
      String(raw_text || ''),
      attachmentJson,
      ch,
      import_batch_id || null,
      t,
    ]
  );
  await upsertNgramDoc(db, {
    refId: id,
    kind: 'event',
    personId: person_id,
    body: `${summary != null ? String(summary) : ''} ${String(raw_text || '')}`,
  });
  const row = await db.getAsync('SELECT * FROM dynamics_event WHERE id = ?', [id]);
  return mapEvent(row);
}

async function createDirectEvent(personId, body) {
  const p = await getPersonById(personId);
  if (!p) throw new Error('人物不存在');
  const raw = String(body.raw_text || '').trim();
  if (!raw) throw new Error('raw_text 必填');
  return insertEvent({
    person_id: personId,
    occurred_on: body.occurred_on || null,
    kind: body.kind || 'note',
    summary: body.summary != null ? String(body.summary).trim() || null : null,
    raw_text: raw,
    attachments: body.attachments,
    source_channel: 'person_direct',
    import_batch_id: null,
  });
}

async function deleteEvent(eventId) {
  const db = getDb();
  await ensureDynamicsNgramReady(db);
  const r = await db.runAsync('DELETE FROM dynamics_event WHERE id = ?', [eventId]);
  if (r.changes > 0) {
    await deleteNgramDoc(db, { refId: eventId, kind: 'event' });
  }
  return r.changes > 0;
}

/**
 * 條列管理：列出全部 dynamics_event，附人物顯示名稱。
 * @param {number} [limit]
 * @param {number} [offset]
 */
async function listAllEventsWithPerson(limit = 5000, offset = 0) {
  const db = getDb();
  const lim = Math.min(50000, Math.max(1, parseInt(limit, 10) || 5000));
  const off = Math.max(0, parseInt(offset, 10) || 0);
  const rows = await db.allAsync(
    `SELECT e.*, p.display_name AS person_display_name
     FROM dynamics_event e
     LEFT JOIN dynamics_person p ON p.id = e.person_id
     ORDER BY datetime(COALESCE(e.created_at, '')) DESC, e.id DESC
     LIMIT ? OFFSET ?`,
    [lim, off]
  );
  return rows.map((r) => ({
    ...mapEvent(r),
    person_display_name: r.person_display_name || '',
  }));
}

/**
 * 條列編輯：更新單筆紀錄（FTS 由 UPDATE 觸發器同步）。
 * @param {string} eventId
 * @param {{ person_id?: string, occurred_on?: string|null, kind?: string, summary?: string|null, raw_text?: string, attachments?: Array<{url: string, name?: string}> }} body
 */
async function updateEventById(eventId, body) {
  const db = getDb();
  await ensureDynamicsNgramReady(db);
  const existing = await db.getAsync('SELECT * FROM dynamics_event WHERE id = ?', [eventId]);
  if (!existing) return null;

  let person_id = existing.person_id;
  if (body.person_id !== undefined) {
    const np = await getPersonById(body.person_id);
    if (!np) throw new Error('人物不存在');
    person_id = body.person_id;
  }

  const raw =
    body.raw_text !== undefined ? String(body.raw_text).trim() : String(existing.raw_text || '').trim();
  if (!raw) throw new Error('raw_text 不可為空');

  const kind =
    body.kind !== undefined
      ? ['resolution', 'news', 'note', 'other'].includes(body.kind)
        ? body.kind
        : existing.kind
      : existing.kind;

  const summary =
    body.summary !== undefined
      ? body.summary != null
        ? String(body.summary).trim() || null
        : null
      : existing.summary != null
        ? String(existing.summary)
        : null;

  const occurred_on =
    body.occurred_on !== undefined
      ? body.occurred_on
        ? String(body.occurred_on).trim()
        : null
      : existing.occurred_on;
  const attachmentJson =
    body.attachments !== undefined
      ? JSON.stringify(normalizeAttachmentList(body.attachments))
      : JSON.stringify(parseAttachmentListJson(existing.attachments));

  await db.runAsync(
    `UPDATE dynamics_event SET person_id = ?, occurred_on = ?, kind = ?, summary = ?, raw_text = ?, attachments = ? WHERE id = ?`,
    [person_id, occurred_on || null, kind, summary, raw, attachmentJson, eventId]
  );
  await upsertNgramDoc(db, {
    refId: eventId,
    kind: 'event',
    personId: person_id,
    body: `${summary != null ? String(summary) : ''} ${raw}`,
  });

  const row = await db.getAsync(
    `SELECT e.*, p.display_name AS person_display_name
     FROM dynamics_event e
     LEFT JOIN dynamics_person p ON p.id = e.person_id
     WHERE e.id = ?`,
    [eventId]
  );
  return {
    ...mapEvent(row),
    person_display_name: row.person_display_name || '',
  };
}

/**
 * 與 createImportBatch 相同擷取規則，但略過 dynamics_proposal，直接寫入 dynamics_event（交易全有或全無）。
 * @param {{ title?: string, raw_text: string, name_hints?: string, new_person_role?: string }} body
 */
async function commitStructuredImport(body) {
  const db = getDb();
  const raw = String(body.raw_text || '').trim();
  if (!raw) throw new Error('raw_text 必填');

  const title = body.title != null ? String(body.title).trim() || null : null;
  const nameHints = body.name_hints != null ? String(body.name_hints).trim() : '';
  const newPersonRole = normalizeNewPersonRole(body.new_person_role);

  const persons = await db.allAsync('SELECT id, display_name FROM dynamics_person');
  const proposals = buildProposalsFromText(raw, nameHints, persons);
  if (proposals.length === 0) {
    throw new Error(
      '未能擷取任何人物條目。請確認全文含可辨識之法官職稱＋姓名、全形分號／句號分段，或補強「姓名提示」後再試。'
    );
  }

  const batchId = randomUUID();
  const t = nowIso();

  await db.runAsync('BEGIN IMMEDIATE');
  try {
    await db.runAsync(
      `INSERT INTO dynamics_import_batch (id, title, raw_text, status, created_at) VALUES (?, ?, ?, 'committed', ?)`,
      [batchId, title, raw, t]
    );

    const events = [];
    for (const pr of proposals) {
      const person = await resolvePersonForProposal(
        {
          person_id: pr.person_id || undefined,
          new_person_role: newPersonRole,
        },
        pr.suggested_person_name
      );
      const ev = await insertEvent({
        person_id: person.id,
        occurred_on: pr.occurred_on || null,
        kind: pr.kind || 'resolution',
        summary: pr.summary != null ? pr.summary : null,
        raw_text: pr.excerpt || '',
        source_channel: 'bulk_parse',
        import_batch_id: batchId,
      });
      events.push(ev);
    }

    await db.runAsync('COMMIT');

    return {
      batch: {
        id: batchId,
        title,
        status: 'committed',
        created_at: t,
        event_count: events.length,
      },
      events,
    };
  } catch (e) {
    try {
      await db.runAsync('ROLLBACK');
    } catch (_) {
      /* ignore */
    }
    throw e;
  }
}

/**
 * Gemini 管道格式：每行 姓名|單位|職稱|民國七碼或UNKNOWN|來源|內容（略過審核直寫）。
 */
async function commitPipeStructuredImport(body) {
  const db = getDb();
  const pipeText = String(body.pipe_text || '').trim();
  if (!pipeText) throw new Error('pipe_text 必填');

  const title = body.title != null ? String(body.title).trim() || null : null;
  const newPersonRole = normalizeNewPersonRole(body.new_person_role);

  const lines = pipeText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const parsed = [];
  for (let i = 0; i < lines.length; i++) {
    parsed.push(parsePipeStructuredLine(lines[i], i));
  }

  const batchId = randomUUID();
  const t = nowIso();

  await db.runAsync('BEGIN IMMEDIATE');
  try {
    await db.runAsync(
      `INSERT INTO dynamics_import_batch (id, title, raw_text, status, created_at) VALUES (?, ?, ?, 'committed', ?)`,
      [batchId, title, pipeText, t]
    );

    const events = [];
    for (const row of parsed) {
      const person = await resolvePersonForProposal({ new_person_role: newPersonRole }, row.display_name);
      const ev = await insertEvent({
        person_id: person.id,
        occurred_on: row.occurred_on,
        kind: 'resolution',
        summary: row.summary || null,
        raw_text: row.raw_text,
        source_channel: 'bulk_parse',
        import_batch_id: batchId,
      });
      events.push(ev);
    }

    await db.runAsync('COMMIT');

    return {
      batch: {
        id: batchId,
        title,
        status: 'committed',
        created_at: t,
        event_count: events.length,
      },
      events,
    };
  } catch (e) {
    try {
      await db.runAsync('ROLLBACK');
    } catch (_) {
      /* ignore */
    }
    throw e;
  }
}

async function createImportBatch({ title, raw_text, name_hints }) {
  const db = getDb();
  const raw = String(raw_text || '').trim();
  if (!raw) throw new Error('raw_text 必填');

  const persons = await db.allAsync('SELECT id, display_name FROM dynamics_person');
  const proposals = buildProposalsFromText(raw, name_hints, persons);

  const batchId = randomUUID();
  const t = nowIso();
  await db.runAsync(
    `INSERT INTO dynamics_import_batch (id, title, raw_text, status, created_at) VALUES (?, ?, ?, 'parsed', ?)`,
    [batchId, title != null ? String(title).trim() || null : null, raw, t]
  );

  for (const pr of proposals) {
    const pid = randomUUID();
    await db.runAsync(
      `INSERT INTO dynamics_proposal (id, batch_id, suggested_person_name, person_id, occurred_on, kind, summary, excerpt, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [
        pid,
        batchId,
        pr.suggested_person_name,
        pr.person_id,
        pr.occurred_on,
        pr.kind,
        pr.summary,
        pr.excerpt,
        t,
      ]
    );
  }

  const batchRow = await db.getAsync('SELECT * FROM dynamics_import_batch WHERE id = ?', [batchId]);
  const propRows = await db.allAsync(
    'SELECT * FROM dynamics_proposal WHERE batch_id = ? ORDER BY created_at ASC',
    [batchId]
  );

  return {
    batch: {
      id: batchRow.id,
      title: batchRow.title,
      status: batchRow.status,
      created_at: batchRow.created_at,
      proposal_count: propRows.length,
    },
    proposals: propRows.map(mapProposal),
  };
}

async function getBatchWithProposals(batchId) {
  const db = getDb();
  const batchRow = await db.getAsync('SELECT * FROM dynamics_import_batch WHERE id = ?', [batchId]);
  if (!batchRow) return null;
  const propRows = await db.allAsync(
    'SELECT * FROM dynamics_proposal WHERE batch_id = ? ORDER BY status ASC, created_at ASC',
    [batchId]
  );
  return {
    batch: {
      id: batchRow.id,
      title: batchRow.title,
      status: batchRow.status,
      raw_text: batchRow.raw_text,
      created_at: batchRow.created_at,
    },
    proposals: propRows.map(mapProposal),
  };
}

async function listImportBatches(limit = 30) {
  const db = getDb();
  const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
  const rows = await db.allAsync(
    `SELECT b.*, (SELECT COUNT(*) FROM dynamics_proposal p WHERE p.batch_id = b.id AND p.status = 'pending') AS pending_count
     FROM dynamics_import_batch b
     WHERE b.status != 'discarded'
     ORDER BY b.created_at DESC
     LIMIT ?`,
    [lim]
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    created_at: r.created_at,
    pending_count: r.pending_count,
  }));
}

async function findPersonByDisplayName(name) {
  const db = getDb();
  const row = await db.getAsync('SELECT * FROM dynamics_person WHERE display_name = ? COLLATE NOCASE', [
    String(name || '').trim(),
  ]);
  return mapPerson(row);
}

async function resolvePersonForProposal(body, suggestedName) {
  if (body.person_id) {
    const p = await getPersonById(body.person_id);
    if (!p) throw new Error('指定的人物不存在');
    return p;
  }
  const overrideName =
    body.display_name != null ? String(body.display_name).trim() : '';
  const name = overrideName || String(suggestedName || '').trim();
  if (!name) throw new Error('需指定人物或姓名');

  const hasIncomingClassYear =
    body.new_person_class_year !== undefined &&
    body.new_person_class_year !== null &&
    String(body.new_person_class_year).trim() !== '';

  let p = await findPersonByDisplayName(name);
  if (p) {
    const missing =
      p.class_year == null || String(p.class_year).trim() === '';
    if (missing && !hasIncomingClassYear) {
      const inferred = lookupClassYearByName(name);
      if (inferred) {
        p = await updatePerson(p.id, { class_year: inferred });
      }
    }
    return p;
  }

  const role = normalizeNewPersonRole(body.new_person_role);
  let classYearToSet = null;

  if (hasIncomingClassYear) {
    classYearToSet = String(body.new_person_class_year).trim();
  } else {
    classYearToSet = lookupClassYearByName(name);
  }

  return createPerson({
    display_name: name,
    role,
    class_year: classYearToSet,
  });
}

async function deleteImportBatch(batchId) {
  const db = getDb();
  const r = await db.runAsync('DELETE FROM dynamics_import_batch WHERE id = ?', [batchId]);
  return r.changes > 0;
}

async function patchProposal(proposalId, body) {
  const db = getDb();
  const prop = await db.getAsync('SELECT * FROM dynamics_proposal WHERE id = ?', [proposalId]);
  if (!prop) return { error: '找不到提案' };

  const action = String(body.action || '').toLowerCase();
  if (action === 'reject') {
    await db.runAsync(`UPDATE dynamics_proposal SET status = 'rejected' WHERE id = ?`, [proposalId]);
    return { ok: true, proposal: mapProposal({ ...prop, status: 'rejected' }) };
  }

  if (action !== 'approve') {
    return { error: 'action 須為 approve 或 reject' };
  }

  if (prop.status !== 'pending') {
    return { error: '僅能核准待處理提案' };
  }

  const person = await resolvePersonForProposal(body, prop.suggested_person_name);

  const occurred_on =
    body.occurred_on !== undefined
      ? body.occurred_on || null
      : prop.occurred_on || null;
  const kind = ['resolution', 'news', 'note', 'other'].includes(body.kind) ? body.kind : prop.kind;
  const summary =
    body.summary !== undefined ? (String(body.summary).trim() || null) : prop.summary;
  const raw_text =
    body.excerpt !== undefined && String(body.excerpt).trim()
      ? String(body.excerpt).trim()
      : prop.excerpt;

  const ev = await insertEvent({
    person_id: person.id,
    occurred_on,
    kind,
    summary,
    raw_text,
    source_channel: 'bulk_parse',
    import_batch_id: prop.batch_id,
  });

  await db.runAsync(
    `UPDATE dynamics_proposal SET status = 'approved', person_id = ?, occurred_on = ?, kind = ?, summary = ?, excerpt = ? WHERE id = ?`,
    [person.id, occurred_on, kind, summary, raw_text, proposalId]
  );

  const updated = await db.getAsync('SELECT * FROM dynamics_proposal WHERE id = ?', [proposalId]);
  return { ok: true, proposal: mapProposal(updated), event: ev };
}

async function searchDynamics(query, limit = 40) {
  const db = getDb();
  await ensureDynamicsNgramReady(db);
  const match = buildFtsMatchQuery(query);
  const phraseTokenSets = extractQueryPhraseTokenSets(query);
  const allQueryTokens = Array.from(new Set(phraseTokenSets.flat()));
  const namePhrases = extractDisplayNameLikePhrases(query);
  if (!match && allQueryTokens.length === 0 && namePhrases.length === 0) {
    return [];
  }
  const lim = Math.min(80, Math.max(1, parseInt(limit, 10) || 40));
  const candidateLimit = Math.min(200, lim * 3);

  if (namePhrases.length > 0) {
    const nameRows = await searchDynamicsPersonDisplayNameOnly(db, query, limit);
    if (nameRows.length > 0) {
      return nameRows.slice(0, lim).map((r) => ({
        ref_id: r.ref_id,
        kind: r.kind,
        person_id: r.person_id,
        event_id: r.event_id,
        snippet: r.snippet,
        rank: r.rank,
        person_display_name: r.person_display_name,
      }));
    }
  }

  let ftsRows = [];
  let ngramRows = [];
  try {
    if (match) {
      ftsRows = await db.allAsync(
        `
        SELECT
          dynamics_fts.ref_id AS ref_id,
          dynamics_fts.kind AS kind,
          dynamics_fts.person_id AS person_id,
          snippet(dynamics_fts, 3, '«', '»', '…', 48) AS snippet,
          dynamics_fts.rank AS rank,
          p.display_name AS person_display_name
        FROM dynamics_fts
        LEFT JOIN dynamics_person AS p ON p.id = CASE WHEN dynamics_fts.kind = 'person' THEN dynamics_fts.ref_id ELSE dynamics_fts.person_id END
        WHERE dynamics_fts MATCH ?
        ORDER BY dynamics_fts.rank
        LIMIT ?
        `,
        [match, candidateLimit]
      );
    }
  } catch (e) {
    if (e && /no such table/i.test(String(e.message))) {
      ftsRows = [];
    } else {
      throw e;
    }
  }
  if (phraseTokenSets.length > 0) {
    const uniqTokens = allQueryTokens.slice(0, 48);
    const tokenPlaceholders = uniqTokens.map(() => '?').join(',');
    const havingParts = [];
    const havingParams = [];
    for (const tokens of phraseTokenSets) {
      const ph = tokens.map(() => '?').join(',');
      havingParts.push(`SUM(CASE WHEN n.token IN (${ph}) THEN 1 ELSE 0 END) > 0`);
      havingParams.push(...tokens);
    }
    const havingClause = havingParts.join(' AND ');
    ngramRows = await db.allAsync(
      `
      SELECT
        n.ref_id AS ref_id,
        n.kind AS kind,
        n.person_id AS person_id,
        p.display_name AS person_display_name,
        SUM(n.tf) AS tf_sum,
        COUNT(DISTINCT n.token) AS hit_tokens,
        CASE
          WHEN n.kind = 'person'
          THEN trim(coalesce(p.display_name, '') || ' ' || coalesce(p.class_year, '') || ' ' || coalesce(p.notes, ''))
          ELSE trim(coalesce(e.summary, '') || ' ' || coalesce(e.raw_text, ''))
        END AS snippet_source
      FROM dynamics_ngram_posting n
      LEFT JOIN dynamics_person p ON p.id = CASE WHEN n.kind = 'person' THEN n.ref_id ELSE n.person_id END
      LEFT JOIN dynamics_event e ON e.id = CASE WHEN n.kind = 'event' THEN n.ref_id ELSE NULL END
      WHERE n.token IN (${tokenPlaceholders})
      GROUP BY n.ref_id, n.kind, n.person_id
      HAVING ${havingClause}
      ORDER BY hit_tokens DESC, tf_sum DESC
      LIMIT ?
      `,
      [...uniqTokens, ...havingParams, candidateLimit]
    );
  }

  const keyOf = (row) => `${row.kind}:${row.ref_id}`;
  /** @type {Map<string, any>} */
  const merged = new Map();
  const K = 50;
  for (let i = 0; i < ftsRows.length; i++) {
    const row = ftsRows[i];
    const key = keyOf(row);
    const score = 1 / (K + i + 1);
    const prev = merged.get(key);
    const next = prev || {
      ref_id: row.ref_id,
      kind: row.kind,
      person_id: row.kind === 'person' ? row.ref_id : row.person_id,
      event_id: row.kind === 'event' ? row.ref_id : null,
      snippet: row.snippet || '',
      person_display_name: row.person_display_name || '',
      rank: row.rank,
      _score: 0,
    };
    next._score += score + 0.02; // fts 路徑微幅加權，提升精準結果排序穩定度
    if (!next.snippet && row.snippet) next.snippet = row.snippet;
    merged.set(key, next);
  }
  for (let i = 0; i < ngramRows.length; i++) {
    const row = ngramRows[i];
    const key = keyOf(row);
    const score = 1 / (K + i + 1);
    const prev = merged.get(key);
    const sn = String(row.snippet_source || '');
    const snippet = sn.length > 96 ? `${sn.slice(0, 96)}…` : sn;
    const next = prev || {
      ref_id: row.ref_id,
      kind: row.kind,
      person_id: row.kind === 'person' ? row.ref_id : row.person_id,
      event_id: row.kind === 'event' ? row.ref_id : null,
      snippet: snippet || '',
      person_display_name: row.person_display_name || '',
      rank: null,
      _score: 0,
    };
    next._score += score;
    if (!next.snippet && snippet) next.snippet = snippet;
    merged.set(key, next);
  }
  let mergedSorted = Array.from(merged.values()).sort((a, b) => b._score - a._score);
  if (shouldStrictLiteralSubstringFilter(query)) {
    const needle = normalizeDynamicsSearchNeedle(query);
    mergedSorted = await filterMergedByLiteralNeedle(db, mergedSorted, needle);
    if (mergedSorted.length < lim) {
      const extra = await searchDynamicsSubtextFallback(db, needle, lim * 3);
      const seen = new Set(mergedSorted.map((r) => `${r.kind}:${r.ref_id}`));
      for (const row of extra) {
        const k = `${row.kind}:${row.ref_id}`;
        if (seen.has(k)) continue;
        mergedSorted.push(row);
        seen.add(k);
      }
      mergedSorted.sort((a, b) => b._score - a._score);
      mergedSorted = await filterMergedByLiteralNeedle(db, mergedSorted, needle);
    }
  }
  return mergedSorted.slice(0, lim).map((r) => ({
    ref_id: r.ref_id,
    kind: r.kind,
    person_id: r.person_id,
    event_id: r.event_id,
    snippet: r.snippet,
    rank: r.rank,
    person_display_name: r.person_display_name,
  }));
}

async function rebuildDynamicsFtsIndex() {
  const db = getDb();
  await rebuildDynamicsFts(db);
  await rebuildDynamicsNgramIndex(db);
  await db.runAsync(
    `INSERT OR REPLACE INTO dynamics_search_meta (key, value) VALUES ('ngram_schema_v', ?)`,
    [DYNAMICS_NGRAM_SCHEMA_VERSION]
  );
  dynamicsNgramReady = true;
  return { ok: true };
}

/**
 * 正規化紀錄本文，供重複比對（全形空白→半形、連續空白折疊）。
 * @param {string} s
 */
function normalizeDynamicsEventRawText(s) {
  return String(s || '')
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 掃描 dynamics_event：同一人物下，若多筆紀錄正規化後 raw_text 相同，只保留最早建立的一筆，刪除其餘。
 * FTS5 會由觸發器同步更新。
 */
async function dedupeDuplicateDynamicsEvents() {
  const db = getDb();
  await ensureDynamicsNgramReady(db);
  const rows = await db.allAsync(
    'SELECT id, person_id, raw_text, created_at FROM dynamics_event ORDER BY person_id ASC, created_at ASC, id ASC'
  );
  /** @type {Map<string, Array<{ id: string, person_id: string, raw_text: string, created_at: string }>>} */
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.person_id}\0${normalizeDynamicsEventRawText(row.raw_text)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const idsToDelete = [];
  let groupsWithDuplicates = 0;
  for (const [, list] of groups) {
    if (list.length <= 1) continue;
    groupsWithDuplicates += 1;
    for (let i = 1; i < list.length; i++) {
      idsToDelete.push(list[i].id);
    }
  }
  if (idsToDelete.length === 0) {
    return {
      deleted: 0,
      duplicate_groups: 0,
      remaining_events: rows.length,
    };
  }
  await db.runAsync('BEGIN IMMEDIATE');
  try {
    const placeholders = idsToDelete.map(() => '?').join(',');
    await db.runAsync(`DELETE FROM dynamics_event WHERE id IN (${placeholders})`, idsToDelete);
    await db.runAsync('COMMIT');
  } catch (e) {
    await db.runAsync('ROLLBACK').catch(() => {});
    throw e;
  }
  await rebuildDynamicsNgramIndex(db);
  await db.runAsync(
    `INSERT OR REPLACE INTO dynamics_search_meta (key, value) VALUES ('ngram_schema_v', ?)`,
    [DYNAMICS_NGRAM_SCHEMA_VERSION]
  );
  dynamicsNgramReady = true;
  return {
    deleted: idsToDelete.length,
    duplicate_groups: groupsWithDuplicates,
    remaining_events: rows.length - idsToDelete.length,
  };
}

module.exports = {
  listPersons,
  syncMissingClassYearsFromJudicialRoster,
  getPersonWithEvents,
  getJudgeCourtRosterMeta,
  saveJudgeCourtRosterFromDpt,
  createPerson,
  updatePerson,
  deletePerson,
  createDirectEvent,
  deleteEvent,
  createImportBatch,
  commitStructuredImport,
  commitPipeStructuredImport,
  getBatchWithProposals,
  listImportBatches,
  patchProposal,
  deleteImportBatch,
  buildProposalsFromText,
  searchDynamics,
  rebuildDynamicsFtsIndex,
  dedupeDuplicateDynamicsEvents,
  listAllEventsWithPerson,
  updateEventById,
};
