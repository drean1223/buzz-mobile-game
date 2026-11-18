// Small-screen check of the result screen and share sheet: node tools/shot3.cjs
const { chromium, devices } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone SE'], deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('http://localhost:5173/?debug=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'tools/out/se-title.png' });
  await page.touchscreen.tap(180, 400);
  await page.evaluate(() => { window.__game.bot = true; });
  await page.waitForTimeout(7000);
  await page.evaluate(() => { window.__game.bot = false; });
  for (let i = 0; i < 60; i++) {
    if ((await page.evaluate(() => window.__game.state)) === 'over') break;
    await page.touchscreen.tap(180, 300);
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(2200);
  await page.screenshot({ path: 'tools/out/se-result.png' });
  await page.click('#btn-share-img');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tools/out/se-sheet.png' });
  console.log(errors.join('\n') || 'no errors');
  await browser.close();
})();
