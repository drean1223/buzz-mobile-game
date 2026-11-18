const { chromium, devices } = require('playwright');
const fs = require('fs');
(async () => {
const url = process.argv[2] ?? 'http://localhost:5173/';
const out = 'tools/out';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(url + '?debug=1&bot=1', { waitUntil: 'networkidle' });
// let the bot play a while, then stop so the run ends
await page.waitForTimeout(14000);
await page.evaluate(() => { window.__game.bot = false; });
for (let i = 0; i < 120; i++) {
  const st = await page.evaluate(() => window.__game.state);
  if (st === 'over') break;
  await page.waitForTimeout(500);
}
await page.waitForTimeout(2000);
const data = await page.evaluate(() => window.__card());
fs.writeFileSync(`${out}/card.png`, Buffer.from(data.split(',')[1], 'base64'));
console.log('score', await page.evaluate(() => window.__game.sim.score));
// gacha
await page.evaluate(() => { const g = window.__game; g.save.coins = 200; });
await page.click('#btn-res-gacha');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/6-gacha.png` });
await page.click('#gacha-pull');
await page.waitForTimeout(1300);
await page.screenshot({ path: `${out}/7-capsule.png` });
await page.waitForTimeout(2000);
await page.screenshot({ path: `${out}/8-reveal.png` });
console.log(errors.join('\n') || 'no console errors');
await browser.close();
})();
