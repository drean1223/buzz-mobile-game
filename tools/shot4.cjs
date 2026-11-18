// Missions UI check: node tools/shot4.cjs
const { chromium, devices } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('http://localhost:5173/?debug=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'tools/out/m-title.png' });
  await page.click('#btn-missions');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tools/out/m-panel.png' });
  await page.click('#missions-close');
  await page.touchscreen.tap(195, 420);
  await page.evaluate(() => { window.__game.bot = true; });
  await page.waitForTimeout(25000);
  await page.evaluate(() => { window.__game.bot = false; });
  for (let i = 0; i < 60; i++) {
    if ((await page.evaluate(() => window.__game.state)) === 'over') break;
    await page.touchscreen.tap(195, 300);
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(2200);
  await page.screenshot({ path: 'tools/out/m-result.png' });
  console.log(JSON.stringify(await page.evaluate(() => window.__game.save.missions)));
  console.log(errors.join('\n') || 'no errors');
  await browser.close();
})();
