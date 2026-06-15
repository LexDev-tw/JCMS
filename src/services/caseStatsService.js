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

function normalizePayload(body) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Invalid case stats payload');
  }
  const { _updatedAt, byWorkspace, ...rest } = body;
  if (Object.keys(rest).length > 0) {
    throw new Error('Invalid case stats payload');
  }
  const ws =
    byWorkspace && typeof byWorkspace === 'object' && !Array.isArray(byWorkspace)
      ? byWorkspace
      : {};
  return { byWorkspace: ws };
}

async function getCaseStatsBlob() {
  const db = getDb();
  const row = await db.getAsync('SELECT json, updated_at FROM case_stats WHERE id = 1');
  const obj = safeParseObject(row?.json, { byWorkspace: {} });
  if (!obj.byWorkspace || typeof obj.byWorkspace !== 'object' || Array.isArray(obj.byWorkspace)) {
    obj.byWorkspace = {};
  }
  return {
    ...obj,
    _updatedAt: row?.updated_at || null,
  };
}

async function saveCaseStatsBlob(body) {
  const payload = normalizePayload(body);
  const json = JSON.stringify(payload);
  const db = getDb();
  await db.runAsync(
    `UPDATE case_stats SET json = ?, updated_at = datetime('now') WHERE id = 1`,
    [json]
  );
  return safeParseObject(json, { byWorkspace: {} });
}

module.exports = {
  getCaseStatsBlob,
  saveCaseStatsBlob,
};
