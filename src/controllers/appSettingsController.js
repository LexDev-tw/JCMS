const fs = require('fs');
const appSettingsService = require('../services/appSettingsService');
const { dbPath, getDb } = require('../config/database');
const { wrapAsyncController } = require('../middleware/controllerAsyncWrap');

const getSettings = wrapAsyncController(async (req, res) => {
  const data = await appSettingsService.getAppSettings();
  res.status(200).json({ success: true, data });
});

const putSettings = wrapAsyncController(async (req, res) => {
  const data = await appSettingsService.saveAppSettings(req.body || {});
  res.status(200).json({ success: true, data });
});

const getDbBackup = wrapAsyncController(async (req, res) => {
  if (!fs.existsSync(dbPath)) {
    res.status(404).json({ success: false, error: '找不到資料庫檔案' });
    return;
  }
  try {
    await getDb().runAsync('PRAGMA wal_checkpoint(FULL)');
  } catch (e) {
    console.warn('[jcms] wal_checkpoint before db backup:', e.message);
  }
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  const filename = `app-backup-${stamp}.db`;
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const stream = fs.createReadStream(dbPath);
  stream.on('error', (err) => {
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message || '讀取資料庫失敗' });
    } else {
      res.destroy(err);
    }
  });
  stream.pipe(res);
});

module.exports = {
  getSettings,
  putSettings,
  getDbBackup,
};
