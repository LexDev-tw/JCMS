/**
 * 將 public/JCMS.html 內本地資源 ?v= 與 package.json version 同步（快取破除）。
 * 含：script src、link rel=stylesheet href、頂端 JCMS 旁版號顯示、jcms ES module 相對 import。
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'public', 'JCMS.html');
const jcmsDir = path.join(root, 'public', 'js', 'jcms');
const version = require(path.join(root, 'package.json')).version;

const REL_IMPORT_RE =
    /(from\s+['"])(\.\.?\/[^'"]+?)(\.js)(\?v=[^'"]*)?(['"])/g;
const DYN_IMPORT_RE =
    /(import\s*\(\s*['"])(\.\.?\/[^'"]+?)(\.js)(\?v=[^'"]*)?(['"]\s*\))/g;

function walkJsFiles(dir) {
    const out = [];
    for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, name.name);
        if (name.isDirectory()) out.push(...walkJsFiles(full));
        else if (name.isFile() && name.name.endsWith('.js')) out.push(full);
    }
    return out;
}

function syncJcmsModuleImports() {
    let fileCount = 0;
    for (const file of walkJsFiles(jcmsDir)) {
        const prev = fs.readFileSync(file, 'utf8');
        const next = prev
            .replace(REL_IMPORT_RE, `$1$2$3?v=${version}$5`)
            .replace(DYN_IMPORT_RE, `$1$2$3?v=${version}$5`);
        if (next !== prev) {
            fs.writeFileSync(file, next, 'utf8');
            fileCount += 1;
        }
    }
    return fileCount;
}

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

const moduleFiles = syncJcmsModuleImports();

if (!changed && moduleFiles === 0) {
    console.log(`sync-jcms-html-version: already synced (${version})`);
} else {
    if (changed) {
        fs.writeFileSync(htmlPath, html, 'utf8');
    }
    const parts = [];
    if (changed) parts.push('JCMS.html');
    if (moduleFiles > 0) parts.push(`${moduleFiles} module file(s)`);
    console.log(`sync-jcms-html-version: synced ${version} (${parts.join(', ')})`);
}
