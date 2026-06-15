const { randomUUID } = require('crypto');
const { getDb } = require('../config/database');

/** 與 JCMS.html PAYSCALE_BUILTIN_ROWS 一致（民國 114 基準） */
const BUILTIN_ROWS = [
  { grade: 1, points: 800, basic: 63570, professional: 105200, job: 41630 },
  { grade: 2, points: 782, basic: 62079, professional: 104136, job: 40032 },
  { grade: 3, points: 764, basic: 60587, professional: 103071, job: 38433 },
  { grade: 4, points: 746, basic: 59096, professional: 102007, job: 36835 },
  { grade: 5, points: 728, basic: 57605, professional: 100943, job: 35237 },
  { grade: 6, points: 710, basic: 56113, professional: 99878, job: 33639 },
  { grade: 7, points: 692, basic: 54622, professional: 98814, job: 32040 },
  { grade: 8, points: 674, basic: 53131, professional: 97750, job: 30442 },
  { grade: 9, points: 656, basic: 51640, professional: 96685, job: 28844 },
  { grade: 10, points: 638, basic: 50148, professional: 95621, job: 27246 },
  { grade: 11, points: 620, basic: 48657, professional: 94557, job: 25647 },
  { grade: 12, points: 602, basic: 47166, professional: 93492, job: 24049 },
  { grade: 13, points: 583, basic: 45674, professional: 92428, job: 22451 },
  { grade: 14, points: 565, basic: 44183, professional: 91363, job: 20853 },
  { grade: 15, points: 547, basic: 42692, professional: 90299, job: 19254 },
  { grade: 16, points: 529, basic: 41200, professional: 89235, job: 17656 },
  { grade: 17, points: 511, basic: 39709, professional: 88170, job: 16058 },
  { grade: 18, points: 493, basic: 38218, professional: 87106, job: 14460 },
  { grade: 19, points: 475, basic: 36727, professional: 86042, job: 12861 },
  { grade: 20, points: 457, basic: 35235, professional: 84977, job: 11263 },
  { grade: 21, points: 439, basic: 33744, professional: 83913, job: 9665 },
  { grade: 22, points: 421, basic: 32253, professional: 82849, job: 8067 },
  { grade: 23, points: 403, basic: 30761, professional: 81784, job: 6468 },
  { grade: 24, points: 385, basic: 29270, professional: 80720, job: 4870 },
];

const BUILTIN_EFFECTIVE = '1140101';

function normalizeRoc7(s) {
  const d = String(s || '').replace(/\D/g, '').slice(0, 7);
  return d.length === 7 ? d : '';
}

function validateRows(rows) {
  if (!Array.isArray(rows) || rows.length !== 24) {
    throw new Error('rows 須為長度 24 的陣列');
  }
  const out = [];
  for (let i = 0; i < 24; i++) {
    const r = rows[i];
    const grade = i + 1;
    if (!r || typeof r !== 'object') throw new Error(`第 ${grade} 級資料無效`);
    const points = Math.round(Number(r.points));
    const basic = Math.round(Number(r.basic));
    const professional = Math.round(Number(r.professional));
    const job = Math.round(Number(r.job));
    if (![points, basic, professional, job].every((n) => Number.isFinite(n) && n >= 0)) {
      throw new Error(`第 ${grade} 級數值無效`);
    }
    out.push({ grade, points, basic, professional, job });
  }
  return out;
}

async function ensureTableAndSeed(database) {
  await database.runAsync(`
    CREATE TABLE IF NOT EXISTS payscale_data_version (
      id TEXT PRIMARY KEY,
      effective_roc7 TEXT NOT NULL,
      rows_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  await database.runAsync(
    'CREATE INDEX IF NOT EXISTS idx_payscale_data_eff ON payscale_data_version(effective_roc7 DESC)'
  );
}

async function listVersions() {
  const db = getDb();
  const rows = await db.allAsync(
    `SELECT id, effective_roc7 AS effectiveRoc7, created_at AS createdAt
     FROM payscale_data_version
     ORDER BY effective_roc7 DESC, created_at DESC`
  );
  return rows || [];
}

async function getLatest() {
  const db = getDb();
  const row = await db.getAsync(
    `SELECT id, effective_roc7 AS effectiveRoc7, rows_json AS rowsJson, created_at AS createdAt
     FROM payscale_data_version
     ORDER BY effective_roc7 DESC, created_at DESC
     LIMIT 1`
  );
  if (!row) return null;
  let rows;
  try {
    rows = JSON.parse(row.rowsJson);
  } catch {
    return null;
  }
  if (!Array.isArray(rows)) return null;
  try {
    return {
      id: row.id,
      effectiveRoc7: row.effectiveRoc7,
      createdAt: row.createdAt,
      rows: validateRows(rows),
    };
  } catch {
    return null;
  }
}

async function getById(id) {
  const db = getDb();
  const row = await db.getAsync(
    `SELECT id, effective_roc7 AS effectiveRoc7, rows_json AS rowsJson, created_at AS createdAt
     FROM payscale_data_version WHERE id = ?`,
    [id]
  );
  if (!row) return null;
  let parsed;
  try {
    parsed = JSON.parse(row.rowsJson);
  } catch {
    return null;
  }
  try {
    const rows = validateRows(parsed);
    return {
      id: row.id,
      effectiveRoc7: row.effectiveRoc7,
      createdAt: row.createdAt,
      rows,
    };
  } catch {
    return null;
  }
}

async function createVersion(body) {
  const eff = normalizeRoc7(body && body.effectiveRoc7);
  if (!eff) throw new Error('俸表施行日期須為民國連續 7 碼數字');

  const rows = validateRows(body.rows);

  const db = getDb();
  const dup = await db.getAsync(
    'SELECT id FROM payscale_data_version WHERE effective_roc7 = ?',
    [eff]
  );
  if (dup) throw new Error('已存在相同施行日之俸表');

  const id = randomUUID();
  const t = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO payscale_data_version (id, effective_roc7, rows_json, created_at) VALUES (?, ?, ?, ?)`,
    [id, eff, JSON.stringify(rows), t]
  );
  return getById(id);
}

async function updateVersion(id, body) {
  const sid = String(id || '').trim();
  if (!sid) throw new Error('俸表 id 無效');

  const existing = await getById(sid);
  if (!existing) throw new Error('俸表不存在');

  const eff = normalizeRoc7(body && body.effectiveRoc7);
  if (!eff) throw new Error('俸表施行日期須為民國連續 7 碼數字');

  const rows = validateRows(body.rows);

  const db = getDb();
  if (eff !== existing.effectiveRoc7) {
    const dup = await db.getAsync(
      'SELECT id FROM payscale_data_version WHERE effective_roc7 = ? AND id != ?',
      [eff, sid]
    );
    if (dup) throw new Error('已存在相同施行日之俸表');
  }

  await db.runAsync(
    `UPDATE payscale_data_version SET effective_roc7 = ?, rows_json = ? WHERE id = ?`,
    [eff, JSON.stringify(rows), sid]
  );
  return getById(sid);
}

async function deleteVersion(id) {
  const sid = String(id || '').trim();
  if (!sid) throw new Error('俸表 id 無效');
  const db = getDb();
  const r = await db.runAsync('DELETE FROM payscale_data_version WHERE id = ?', [sid]);
  if (!r.changes) throw new Error('俸表不存在');
  return { id: sid };
}

module.exports = {
  ensureTableAndSeed,
  listVersions,
  getLatest,
  getById,
  createVersion,
  updateVersion,
  deleteVersion,
  BUILTIN_ROWS,
  BUILTIN_EFFECTIVE,
};
