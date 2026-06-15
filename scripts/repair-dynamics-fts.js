/**
 * 司法動態 FTS5（dynamics_fts）倒排索引毀損時：卸除並重建虛擬表與觸發器，再自基表重灌。
 * 使用：停掉 JCMS 後端後執行 node scripts/repair-dynamics-fts.js
 */
const sqlite3 = require('sqlite3').verbose();
const { promisify } = require('util');
const path = require('path');
const { recreateDynamicsFtsSchema } = require('../src/config/database');

function attachAsync(instance) {
  instance.runAsync = function runAsync(sql, ...params) {
    return new Promise((resolve, reject) => {
      instance.run(sql, ...params, function onRun(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes, lastID: this.lastID });
      });
    });
  };
  instance.getAsync = promisify(instance.get.bind(instance));
  instance.allAsync = promisify(instance.all.bind(instance));
  return instance;
}

async function main() {
  const dbPath = path.join(__dirname, '..', 'data', 'app.db');
  const instance = await new Promise((resolve, reject) => {
    const d = new sqlite3.Database(dbPath, (err) => (err ? reject(err) : resolve(d)));
  });
  const db = attachAsync(instance);
  await db.runAsync('PRAGMA foreign_keys = ON');
  console.log('[repair] Recreating dynamics_fts schema and repopulating…');
  await recreateDynamicsFtsSchema(db);
  const rows = await db.allAsync('PRAGMA integrity_check');
  const first = rows && rows[0];
  const cell = first && (first.integrity_check ?? Object.values(first)[0]);
  console.log('[repair] PRAGMA integrity_check:', cell);
  if (String(cell).toLowerCase() !== 'ok') {
    console.error('[repair] 仍有錯誤，請檢查輸出。');
    process.exitCode = 1;
  } else {
    console.log('[repair] 完成。');
  }
  await new Promise((res) => instance.close(res));
}

main().catch((e) => {
  console.error('[repair] 失敗:', e.message);
  process.exit(1);
});
