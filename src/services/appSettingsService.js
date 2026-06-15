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

async function getAppSettings() {
  const db = getDb();
  const row = await db.getAsync('SELECT json, updated_at FROM app_settings WHERE id = 1');
  const obj = safeParseObject(row?.json, {});
  return {
    ...obj,
    _updatedAt: row?.updated_at || null,
  };
}

async function saveAppSettings(body) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Invalid settings payload');
  }
  const { _updatedAt, ...rest } = body;
  const json = JSON.stringify(rest);
  const db = getDb();
  await db.runAsync(
    `UPDATE app_settings SET json = ?, updated_at = datetime('now') WHERE id = 1`,
    [json]
  );
  return safeParseObject(json, {});
}

module.exports = {
  getAppSettings,
  saveAppSettings,
};
