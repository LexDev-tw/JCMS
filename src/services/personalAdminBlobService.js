const { getDb } = require('../config/database');

function safeParseObject(s, fallback) {
  if (s == null || s === '') return fallback;
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function legacyPayscaleHasData(row) {
  if (!row) return false;
  const mg = Number(row.my_grade) || 0;
  if (mg >= 1 && mg <= 24) return true;
  const arts = safeParseObject(row.artifacts_json, []);
  if (Array.isArray(arts) && arts.length > 0) return true;
  const ro = safeParseObject(row.row_overrides, {});
  return Object.keys(ro).length > 0;
}

function blobHasPayscaleData(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const g = Number(obj.payscaleMyGrade);
  if (Number.isInteger(g) && g >= 1 && g <= 24) return true;
  if (Array.isArray(obj.payscaleArtifacts) && obj.payscaleArtifacts.length > 0) return true;
  const o = obj.payscaleRowOverrides;
  if (o && typeof o === 'object' && Object.keys(o).length > 0) return true;
  return false;
}

/**
 * 讀取 personal_admin JSON；若尚無俸表資料且舊表 personal_payscale 有資料，合併寫回。
 */
async function getPersonalAdminBlob() {
  const db = getDb();
  const row = await db.getAsync('SELECT json, updated_at FROM personal_admin WHERE id = 1');
  let obj = safeParseObject(row?.json, {});

  if (!blobHasPayscaleData(obj)) {
    const ps = await db.getAsync(
      'SELECT row_overrides, my_grade, artifacts_json FROM personal_payscale WHERE id = 1'
    );
    if (legacyPayscaleHasData(ps)) {
      obj.payscaleRowOverrides = safeParseObject(ps.row_overrides, {});
      obj.payscaleMyGrade = Number(ps.my_grade) || 0;
      obj.payscaleArtifacts = Array.isArray(safeParseObject(ps.artifacts_json, []))
        ? safeParseObject(ps.artifacts_json, [])
        : [];
      await db.runAsync(
        `UPDATE personal_admin SET json = ?, updated_at = datetime('now') WHERE id = 1`,
        [JSON.stringify(obj)]
      );
    }
  }

  return {
    ...obj,
    _updatedAt: row?.updated_at || null,
  };
}

async function savePersonalAdminBlob(body) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Invalid personal admin payload');
  }
  const { _updatedAt, ...rest } = body;
  const json = JSON.stringify(rest);
  const db = getDb();
  await db.runAsync(
    `UPDATE personal_admin SET json = ?, updated_at = datetime('now') WHERE id = 1`,
    [json]
  );
  return safeParseObject(json, {});
}

module.exports = {
  getPersonalAdminBlob,
  savePersonalAdminBlob,
};
