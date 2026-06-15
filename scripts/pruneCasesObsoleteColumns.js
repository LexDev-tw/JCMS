/**
 * 掃描專案內 SQLite 檔，自 cases 表卸除已廢棄欄位（與 src/config/database.js 內 OBSOLETE_CASE_COLUMNS 一致）。
 * 建議在後端未佔用該 DB 檔時執行，避免鎖定衝突。
 *
 * 使用：
 *   node scripts/pruneCasesObsoleteColumns.js
 *   node scripts/pruneCasesObsoleteColumns.js D:\path\custom.db
 * 亦會處理 DB_PATH 與 data/ 目錄下所有 .db
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pruneCasesObsoleteColumnsAtPath } = require('../src/config/database');

function findDbFilesUnder(dir) {
  const out = [];
  if (!fs.existsSync(dir)) {
    return out;
  }
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) {
        stack.push(p);
      } else if (ent.isFile() && ent.name.endsWith('.db')) {
        out.push(p);
      }
    }
  }
  return out;
}

async function main() {
  const root = path.join(__dirname, '..');
  const dataDir = path.join(root, 'data');
  const fromArgs = process.argv.slice(2).map((a) => path.resolve(a));
  const fromEnv = process.env.DB_PATH
    ? [path.resolve(process.cwd(), process.env.DB_PATH)]
    : [];
  const fromData = findDbFilesUnder(dataDir);
  const fromDefault = [path.join(dataDir, 'app.db')];
  const all = [
    ...new Set([...fromArgs, ...fromEnv, ...fromData, ...fromDefault].map((p) => path.resolve(p))),
  ].filter((p) => fs.existsSync(p));
  if (all.length === 0) {
    console.log(
      '[jcms] 未找到任何 .db 檔（可傳入路徑、設定 DB_PATH、或於 data/ 放置 app.db）。'
    );
    return;
  }
  for (const f of all) {
    process.stdout.write(`[jcms] prune cases obsolete columns: ${f}\n`);
    const ok = await pruneCasesObsoleteColumnsAtPath(f);
    process.stdout.write(ok ? '  → 完成\n' : '  → 略過（無 cases 表或失敗，見上列訊息）\n');
  }
  process.stdout.write('[jcms] 處理結束。\n');
}

main().catch((e) => {
  console.error('[jcms]', e);
  process.exit(1);
});
