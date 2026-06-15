/**
 * Maps low-level SQLite driver messages to operator-facing hints (Chinese).
 * @param {unknown} err
 * @returns {string|null} null = no mapping, caller should use err.message
 */
function formatSqliteUserMessage(err) {
  const msg = err && err.message ? String(err.message) : '';
  if (!msg) return null;
  if (/SQLITE_CORRUPT|database disk image is malformed/i.test(msg)) {
    return (
      '資料庫檔案可能已損毀（SQLITE_CORRUPT）。請先停止 JCMS 後，自「設定」匯出的 DB 備份還原至 data 目錄下的 app.db。' +
      '若曾複製資料庫，請一併帶上同資料夾的 app.db-wal、app.db-shm（若存在），或僅保留乾淨的 app.db 後再啟動。' +
      '若無備份，可嘗試以 sqlite3 的 .recover 匯出新庫（需自行安裝 SQLite CLI）。'
    );
  }
  if (/SQLITE_BUSY|database is locked|SQLITE_LOCKED/i.test(msg)) {
    return '資料庫暫時忙碌或被其他程式鎖定，請稍後再試；請勿將 data 目錄置於雲端同步資料夾內。';
  }
  return null;
}

module.exports = {
  formatSqliteUserMessage,
};
