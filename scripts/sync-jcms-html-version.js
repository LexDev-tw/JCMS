/**
 * 將 public/JCMS.html 內本地資源 ?v= 與 package.json version 同步（快取破除）。
 * 含：script src、link rel=stylesheet href、頂端 JCMS 旁版號顯示。
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'public', 'JCMS.html');
const version = require(path.join(root, 'package.json')).version;

let html = fs.readFileSync(htmlPath, 'utf8');
let changed = false;

const scriptUpdated = html.replace(
    /(<script\b[^>]*\bsrc=")((?!https?:\/\/)([^"?]+))(?:\?v=[^"]*)?(")/gi,
    `$1$2?v=${version}$4`
);
if (scriptUpdated !== html) {
    html = scriptUpdated;
    changed = true;
}

const linkUpdated = html.replace(
    /(<link\b[^>]*\brel="stylesheet"[^>]*\bhref=")((?!https?:\/\/)([^"?]+))(?:\?v=[^"]*)?(")/gi,
    `$1$2?v=${version}$4`
);
if (linkUpdated !== html) {
    html = linkUpdated;
    changed = true;
}

const headerUpdated = html.replace(
    /(<span>JCMS<\/span><span class="text-accent font-normal text-\[10px\] leading-none hidden md:inline">)[^<]+(<\/span>)/,
    `$1${version}$2`
);
if (headerUpdated !== html) {
    html = headerUpdated;
    changed = true;
}

if (!changed) {
    console.log(`sync-jcms-html-version: already synced (${version})`);
} else {
    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log(`sync-jcms-html-version: synced ${version} (scripts, stylesheets, header)`);
}
