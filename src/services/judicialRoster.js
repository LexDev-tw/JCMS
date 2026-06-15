const fs = require('fs');
const path = require('path');

/** @typedef {{ classYear: string|null, count: number }} RosterEntry */

/** @type {Map<string, RosterEntry>|null} */
let rosterCache = null;

function normalizeRosterName(name) {
  return String(name || '')
    .replace(/\u3000/g, ' ')
    .trim();
}

function loadRosterUnsafe() {
  const filePath = path.join(process.cwd(), 'data', 'judicial-roster.md');
  if (!fs.existsSync(filePath)) {
    return new Map();
  }
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);

  /** @type {Map<string, string[]>} */
  const nameToYears = new Map();
  let currentClassYear = null;

  for (const raw of lines) {
    const line = String(raw || '').trim();
    if (!line) continue;

    if (line.startsWith('##')) {
      // 期別標題格式：## 第N期（...）
      // 僅提取數字 N 作為 class_year，以避免存入「第N期」文字。
      const m = line.match(/^##\s*第(\d+)期/);
      currentClassYear = m ? m[1].trim() : null;
      continue;
    }

    if (line.startsWith('-')) {
      if (!currentClassYear) continue;
      const name = normalizeRosterName(line.replace(/^-+/, ''));
      if (!name) continue;
      if (!nameToYears.has(name)) nameToYears.set(name, []);
      nameToYears.get(name).push(currentClassYear);
    }
  }

  /** @type {Map<string, RosterEntry>} */
  const result = new Map();
  for (const [name, years] of nameToYears.entries()) {
    const uniq = Array.from(new Set(years.filter(Boolean)));
    // 同名在名冊出現 2 筆以上（含重複列於同一期）一律不推斷期別，避免誤配。
    const singleOccurrence = years.length === 1;
    const singlePeriod = uniq.length === 1;
    if (singleOccurrence && singlePeriod) {
      result.set(name, { classYear: uniq[0], count: years.length });
    } else {
      result.set(name, { classYear: null, count: years.length });
    }
  }

  return result;
}

function loadRoster() {
  if (rosterCache) return rosterCache;
  try {
    rosterCache = loadRosterUnsafe();
  } catch (e) {
    console.warn('[jcms] judicial-roster: 讀取或解析失敗：', e.message || String(e));
    rosterCache = new Map();
  }
  return rosterCache;
}

function clearRosterCache() {
  rosterCache = null;
}

/**
 * 依姓名查詢名冊期別：
 * - 名冊內該姓名僅 1 筆且期別唯一 → 回傳期別數字（如 "42"）
 * - 無紀錄、同名多筆、或同名跨多期 → 回傳 null
 * @param {string} displayName
 * @returns {string|null}
 */
function lookupClassYearByName(displayName) {
  const norm = normalizeRosterName(displayName);
  if (!norm) return null;
  const roster = loadRoster();
  const entry = roster.get(norm);
  return entry ? entry.classYear : null;
}

module.exports = {
  lookupClassYearByName,
  clearRosterCache,
};

