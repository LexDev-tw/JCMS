/** Vue 3 CDN 全域 → ES module 橋接（ES module 無法直接讀取 bare `Vue` 識別符） */
const VueRuntime = globalThis.Vue;
if (!VueRuntime) {
  throw new Error('[JCMS] Vue 未載入：請確認 vue.global.js 在 main.js 之前');
}

export const {
  createApp,
  ref,
  computed,
  reactive,
  onMounted,
  onUnmounted,
  nextTick,
  watch,
} = VueRuntime;
