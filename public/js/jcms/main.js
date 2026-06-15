/** JCMS SPA 入口 */
import { mountJcmsApp } from './app/create-app.js';

try {
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
