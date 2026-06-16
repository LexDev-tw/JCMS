/**
 * 遞增 package.json 版號（大.小.YYYYMMDD[a-z]），並同步 JCMS.html script ?v=。
 */
const fs = require('fs');
const path = require('path');
const { bumpVersion } = require('./jcms-version');

const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const prev = pkg.version;
const next = bumpVersion(prev);

if (next === prev) {
    console.log(`bump-jcms-version: unchanged (${prev})`);
    process.exit(0);
}

pkg.version = next;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

if (fs.existsSync(lockPath)) {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    lock.version = next;
    if (lock.packages && lock.packages['']) {
        lock.packages[''].version = next;
    }
    fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
}

console.log(`bump-jcms-version: ${prev} → ${next}`);
require('./sync-jcms-html-version.js');
