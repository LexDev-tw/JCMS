/**
 * 將 public/JCMS.html 內本地 script src 的 ?v= 與 package.json version 同步（快取破除）。
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'public', 'JCMS.html');
const version = require(path.join(root, 'package.json')).version;

let html = fs.readFileSync(htmlPath, 'utf8');

const updated = html.replace(
    /(<script\b[^>]*\bsrc=")((?!https?:\/\/)([^"?]+))(?:\?v=[^"]*)?(")/gi,
    `$1$2?v=${version}$4`
);

if (updated === html) {
    console.log(`sync-jcms-html-version: already ?v=${version}`);
} else {
    fs.writeFileSync(htmlPath, updated, 'utf8');
    console.log(`sync-jcms-html-version: set ?v=${version} on local script tags in public/JCMS.html`);
}
