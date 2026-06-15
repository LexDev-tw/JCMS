/** 將 JCMS.html 內嵌 <style> 抽出至 public/css/jcms.css */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = path.join(ROOT, 'public', 'JCMS.html');
const cssPath = path.join(ROOT, 'public', 'css', 'jcms.css');

const lines = fs.readFileSync(htmlPath, 'utf8').split('\n');
if (lines.some((l) => l.includes('href="css/jcms.css"'))) {
  console.log('[extract-jcms-css] already extracted');
  process.exit(0);
}

const css = lines.slice(42, 1265).join('\n');
fs.mkdirSync(path.dirname(cssPath), { recursive: true });
fs.writeFileSync(cssPath, css, 'utf8');

const out = [
  ...lines.slice(0, 41),
  '    <link rel="stylesheet" href="css/jcms.css">',
  ...lines.slice(1266),
];
fs.writeFileSync(htmlPath, out.join('\n'), 'utf8');
console.log('[extract-jcms-css] wrote public/css/jcms.css');
