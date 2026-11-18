// Records a vertical promo clip of the bot playing: node tools/promo.cjs <out.webm-dir>
const { chromium } = require('playwright');
(async () => {
  const dir = process.argv[2] || 'tools/out/video';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 405, height: 720 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir, size: { width: 810, height: 1440 } },
  });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/?debug=1', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const g = window.__game;
    g.save.tutorialDone = true;
    g.equip('chatora');
    // Captions for the clip (promo only, not part of the game).
    const cap = document.createElement('div');
    cap.style.cssText = 'position:absolute;left:0;right:0;bottom:16%;text-align:center;font:900 30px "M PLUS Rounded 1c",sans-serif;color:#fff;-webkit-text-stroke:7px #1b1036;paint-order:stroke fill;pointer-events:none;z-index:30;transition:opacity .3s;line-height:1.3';
    document.getElementById('app').append(cap);
    window.__cap = (t) => { cap.style.opacity = t ? '1' : '0'; if (t) cap.innerHTML = t; };
  });
  await page.waitForTimeout(1800);
  await page.touchscreen.tap(200, 450);
  await page.evaluate(() => { window.__game.bot = true; window.__cap('タップするだけ。'); });
  await page.waitForTimeout(3500);
  await page.evaluate(() => window.__cap('星のまんなかに着地で<br>PERFECT！'));
  await page.waitForTimeout(5000);
  await page.evaluate(() => window.__cap('5連続で FEVER!!'));
  await page.waitForTimeout(5000);
  await page.evaluate(() => window.__cap('きみは どこまで いける？'));
  await page.waitForTimeout(6500);
  await page.evaluate(() => window.__cap(''));
  await page.evaluate(() => { window.__game.bot = false; });
  for (let i = 0; i < 40; i++) {
    if ((await page.evaluate(() => window.__game.state)) === 'over') break;
    await page.touchscreen.tap(200, 300);
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__cap('#ほしねこジャンプ'));
  await page.waitForTimeout(2500);
  await ctx.close();
  await browser.close();
})();
