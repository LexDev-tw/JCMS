/** JCMS SPA 入口 — create-app 帶與 main 相同 ?v=，避免手機瀏覽器快取舊模組 */
function readMainModuleVersion() {
  try {
    const el = document.querySelector('script[type="module"][src*="jcms/main.js"]');
    const src = (el && (el.src || el.getAttribute('src'))) || '';
    const m = String(src).match(/[?&]v=([^&]+)/);
    return m ? m[1] : '';
  } catch {
    return '';
  }
}

const assetV = readMainModuleVersion();
const createAppUrl = assetV ? `./app/create-app.js?v=${assetV}` : './app/create-app.js';

try {
  const { mountJcmsApp } = await import(createAppUrl);
  mountJcmsApp();
} catch (err) {
  console.error('[JCMS] mount failed:', err);
  const root = document.getElementById('app');
  if (root) {
    root.removeAttribute('v-cloak');
    root.innerHTML =
      '<div class="p-8 max-w-lg"><p class="text-ink-900 font-bold mb-2">JCMS 無法啟動</p>' +
      '<p class="text-ink-600 text-sm font-mono break-all">' +
      String(err && err.message ? err.message : err) +
      '</p></div>';
  }
}
