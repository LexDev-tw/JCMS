'use strict';
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'data', 'app.db');
const db = new sqlite3.Database(dbPath);

function q(sql) {
  return new Promise((resolve, reject) => {
    db.get(sql, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

(async () => {
  const cases = await q('SELECT COUNT(*) AS n FROM cases');
  const settings = await q("SELECT length(json) AS n, updated_at FROM app_settings WHERE id = 1");
  const personal = await q("SELECT length(json) AS n, updated_at FROM personal_admin WHERE id = 1");
  console.log(JSON.stringify({ cases, settings, personal }, null, 2));
  db.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
