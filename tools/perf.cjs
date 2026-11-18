// Rough render-cost check on a throttled CPU: node tools/perf.cjs [url] [throttle]
// Prints frame-time stats and how long each draw stage takes (flushed with getImageData).
const { chromium, devices } = require('playwright');
(async () => {
  const url = process.argv[2] || 'http://localhost:5173/';
  const rate = Number(process.argv[3] || 4);
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 5'] });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await p.goto(url + '?debug=1&bot=1' + (process.env.STAGES ? '&stages=1' : ''), { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  await p.evaluate(() => {
    const g = window.__game;
    g.save.tutorialDone = true;
    const stats = (window.__perf = { frames: [], stage: {} });
    const STAGES = new URLSearchParams(location.search).has('stages');
    const flush = () => g.ctx.getImageData(0, 0, 1, 1);
    const wrap = (obj, name, label) => {
      if (!STAGES) return;
      const f = obj[name].bind(obj);
      obj[name] = (...a) => {
        const t = performance.now();
        const r = f(...a);
        flush();
        (stats.stage[label] ||= []).push(performance.now() - t);
        return r;
      };
    };
    wrap(g.scene, 'drawBackground', 'background');
    wrap(g.scene, 'drawWorld', 'world');
    wrap(g.scene, 'drawOverlay', 'overlay');
    let last = performance.now();
    const loop = (t) => {
      stats.frames.push(t - last);
      last = t;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await p.waitForTimeout(12000);
  const r = await p.evaluate(() => {
    const s = window.__perf;
    const q = (a, k) => {
      const v = [...a].sort((x, y) => x - y);
      return v[Math.min(v.length - 1, Math.floor(v.length * k))];
    };
    const f = s.frames.slice(10);
    const out = {
      frames: f.length,
      fps: (1000 / (f.reduce((a, b) => a + b, 0) / f.length)).toFixed(1),
      p50: q(f, 0.5).toFixed(1),
      p95: q(f, 0.95).toFixed(1),
      over33: f.filter((x) => x > 33).length,
      dpr: window.__game.dpr,
      canvas: `${window.__game.canvas.width}x${window.__game.canvas.height}`,
    };
    for (const [k, v] of Object.entries(s.stage)) out[k] = `avg ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)}ms p95 ${q(v, 0.95).toFixed(2)}ms`;
    return out;
  });
  console.log(`throttle ${rate}x`, r);
  await b.close();
})();
