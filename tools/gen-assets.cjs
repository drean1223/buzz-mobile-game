// node tools/gen-assets.cjs  (needs `npm run dev` on :5173)
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/tools/assets.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__assets, null, { timeout: 20000 });
  const assets = await page.evaluate(() => window.__assets);
  for (const [name, url] of Object.entries(assets)) {
    fs.writeFileSync(`public/${name}`, Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote public/' + name);
  }
  await browser.close();
})();
