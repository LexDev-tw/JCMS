import { chromium } from 'playwright';

const url = process.env.JCMS_URL || 'http://127.0.0.1:3000/JCMS.html';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);

const state = await page.evaluate(() => ({
  hasHeader: !!document.querySelector('header'),
  appChildCount: document.querySelector('#app')?.childElementCount ?? 0,
  cloak: document.querySelector('#app')?.hasAttribute('v-cloak') ?? false,
  title: document.querySelector('header .font-bold')?.textContent?.trim() || '',
}));

console.log(JSON.stringify({ url, errors, state }, null, 2));
await browser.close();
process.exit(state.hasHeader && state.appChildCount > 0 && errors.length === 0 ? 0 : 1);
