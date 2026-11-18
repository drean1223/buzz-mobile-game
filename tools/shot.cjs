// Usage: node tools/shot.mjs [url]
const { chromium, devices } = require('playwright');
// turn on the bot and let it play a while
// wait for death
(async () => {
const url = process.argv[2] ?? 'http://localhost:5173/';
const out = 'tools/out';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(url + '?debug=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/1-title.png` });
await page.touchscreen.tap(195, 500);
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/2-play.png` });
await page.evaluate(() => { window.__game.bot = true; });
await page.waitForTimeout(9000);
await page.screenshot({ path: `${out}/3-play-later.png` });
await page.evaluate(() => { window.__game.bot = false; });
for (let i = 0; i < 40; i++) {
  const st = await page.evaluate(() => window.__game.state);
  if (st === 'over') break;
  await page.touchscreen.tap(195, 300);
  await page.waitForTimeout(700);
}
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/4-dying.png` });
await page.waitForTimeout(1600);
await page.screenshot({ path: `${out}/5-result.png` });
console.log('score', await page.evaluate(() => window.__game.sim.score));
console.log(errors.join('\n') || 'no console errors');
await browser.close();

})();
