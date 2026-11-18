// Smoke-test the live site on a phone viewport: node tools/live-check.cjs [url]
const { chromium, devices } = require('playwright');
(async () => {
  const url = process.argv[2] || 'https://drean1223.github.io/buzz-mobile-game/';
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  p.on('requestfailed', (r) => errs.push('failed: ' + r.url()));
  await p.goto(url + '?debug=1', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: 'tools/out/live-title.png' });
  await p.touchscreen.tap(195, 420);
  await p.evaluate(() => { window.__game.bot = true; });
  await p.waitForTimeout(6000);
  await p.screenshot({ path: 'tools/out/live-play.png' });
  console.log('score', await p.evaluate(() => window.__game.sim.score));
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
