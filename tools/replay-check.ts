/**
 * Plays real games in the browser (bot, real frame timing, hit-stop, slow-mo)
 * and checks that each recorded replay reproduces the same result in Node.
 *
 *   npm run build && node tools/replay-check.ts [url] [runs=3]
 */
import { createRequire } from 'node:module';
import { runReplay } from '../src/core/replay.ts';
import type { Replay } from '../src/core/replay.ts';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const url = process.argv[2] || 'http://localhost:4180/';
const runs = Number(process.argv[3] || 3);
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
await page.goto(url + '?debug=1', { waitUntil: 'networkidle' });
await page.evaluate(() => {
  const g = (window as any).__game;
  g.save.tutorialDone = true;
});
let ok = 0;
for (let i = 0; i < runs; i++) {
  await page.evaluate((daily: boolean) => {
    const g = (window as any).__game;
    if (g.state !== 'title') g.goHome();
    g.setMode(daily ? 'daily' : 'endless');
    g.lastReplay = null;
    g.bot = true;
  }, i % 2 === 0);
  // The in-game bot rarely dies; after a while let go so the fuse ends the run.
  const ended = await page
    .waitForFunction(() => (window as any).__game.lastReplay, null, { timeout: 25_000 + i * 8_000, polling: 500 })
    .then(() => true, () => false);
  if (!ended) {
    await page.evaluate(() => ((window as any).__game.bot = false));
    await page.waitForFunction(() => (window as any).__game.lastReplay, null, { timeout: 60_000, polling: 500 });
  }
  const got = await page.evaluate(() => {
    const g = (window as any).__game;
    g.bot = false;
    return { replay: g.lastReplay, score: g.sim.score, perfects: g.sim.perfects, cause: g.sim.cause, maxIdx: g.sim.maxIdx };
  });
  const r = runReplay(got.replay as Replay);
  const same = r.score === got.score && r.perfects === got.perfects && r.cause === got.cause && r.maxIdx === got.maxIdx && r.badJumps === 0;
  if (same) ok++;
  console.log(`${same ? 'OK  ' : 'DIFF'} live score=${got.score} idx=${got.maxIdx} perf=${got.perfects} ${got.cause} | replay score=${r.score} idx=${r.maxIdx} perf=${r.perfects} ${r.cause} bad=${r.badJumps} idle=${got.replay.idle} jumps=${got.replay.jumps.length}`);
}
await browser.close();
console.log(`${ok}/${runs} replays matched`);
process.exit(ok === runs ? 0 : 1);
