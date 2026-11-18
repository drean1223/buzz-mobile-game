// Frame-exact promo clip: the page runs on a virtual clock, every frame is a
// screenshot, and the game's own WebAudio sound is rendered offline in sync.
//
//   npm run build
//   node tools/clip.cjs dry                 # print the run's timeline, no capture
//   node tools/clip.cjs render out.mp4      # 1080x1920 60fps mp4 with sound
//
// Everything is deterministic for a given CONFIG, so tune with `dry` first.
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CONFIG = {
  seed: Number(process.env.CLIP_SEED || 7),
  skin: process.env.CLIP_SKIN || 'chatora',
  // Start capturing right after landing on this planet.
  captureAfterIdx: Number(process.env.CLIP_START || 6),
  // Planet idx -> landing accuracy for the jump made FROM that planet
  // (0 = dead center, >0.36 = not PERFECT, >1 = miss). Others: bot plays clean.
  plan: JSON.parse(process.env.CLIP_PLAN || '{}'),
  // The planet after the one we die on carries the 👑 BEST marker.
  bestOffset: 1,
  best: Number(process.env.CLIP_BEST || 0),
  resultHold: 3.2, // seconds from death until the end card
  endCard: 2.6,
  hook: Number(process.env.CLIP_HOOK || 1.6), // seconds the opening question stays up
  fps: 60,
};

const PORT = 4179;
const ROOT = path.resolve(__dirname, '..');

function waitForServer(url, tries = 60) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      http
        .get(url, (res) => {
          res.resume();
          resolve();
        })
        .on('error', () => (n > 0 ? setTimeout(() => attempt(n - 1), 250) : reject(new Error('server did not start'))));
    };
    attempt(tries);
  });
}

// Runs in the page before any game code.
function virtualTime(seed) {
  let s = seed >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let vt = 0;
  const date0 = Date.now();
  performance.now = () => vt;
  Date.now = () => date0 + vt;

  let raf = [];
  let rid = 0;
  window.requestAnimationFrame = (cb) => {
    raf.push({ id: ++rid, cb });
    return rid;
  };
  window.cancelAnimationFrame = (id) => {
    raf = raf.filter((r) => r.id !== id);
  };
  let timers = [];
  let tid = 0;
  window.setTimeout = (fn, ms = 0, ...args) => {
    timers.push({ id: ++tid, at: vt + Math.max(0, ms || 0), fn, args });
    return tid;
  };
  window.setInterval = (fn, ms = 0, ...args) => {
    const every = Math.max(1, ms || 0);
    timers.push({ id: ++tid, at: vt + every, fn, args, every });
    return tid;
  };
  window.clearTimeout = window.clearInterval = (id) => {
    timers = timers.filter((t) => t.id !== id);
  };

  // WebAudio: an OfflineAudioContext that we render forward frame by frame.
  const SR = 48000;
  let actx = null;
  let renderP = null;
  let started = false;
  window.__audioVt0 = -1;
  const AC = function () {
    actx = new OfflineAudioContext(2, SR * 150, SR);
    window.__audioVt0 = vt;
    return actx;
  };
  window.AudioContext = AC;
  window.webkitAudioContext = AC;
  const go = () => {
    if (!started) {
      started = true;
      renderP = actx.startRendering();
    } else void actx.resume();
  };
  const audioTo = async (ms) => {
    if (!actx) return;
    const q = 128 / SR;
    const t = Math.floor((ms - window.__audioVt0) / 1000 / q) * q;
    if (t <= actx.currentTime + 1e-9) return;
    const p = actx.suspend(t);
    go();
    await p;
  };
  window.__audioPcm = async (fromSec, durSec) => {
    if (!actx) return '';
    go();
    const buf = await renderP;
    const from = Math.max(0, Math.round(fromSec * SR));
    const n = Math.max(0, Math.min(buf.length - from, Math.round(durSec * SR)));
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);
    const out = new Int16Array(n * 2);
    for (let i = 0; i < n; i++) {
      out[i * 2] = Math.max(-1, Math.min(1, L[from + i])) * 32767;
      out[i * 2 + 1] = Math.max(-1, Math.min(1, R[from + i])) * 32767;
    }
    const bytes = new Uint8Array(out.buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };

  const anims = new WeakMap();
  window.__step = async (ms) => {
    vt += ms;
    await audioTo(vt);
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const t = timers[0];
      if (!t || t.at > vt) break;
      if (t.every) t.at += t.every;
      else timers.shift();
      try {
        t.fn(...t.args);
      } catch (e) {
        console.error(e);
      }
    }
    const q = raf;
    raf = [];
    for (const r of q) {
      try {
        r.cb(vt);
      } catch (e) {
        console.error(e);
      }
    }
    // CSS animations and transitions follow the virtual clock too.
    for (const a of document.getAnimations()) {
      let st = anims.get(a);
      if (st === undefined) {
        st = vt;
        anims.set(a, st);
        a.pause();
      }
      a.currentTime = vt - st;
    }
    return vt;
  };
}

async function main() {
  const mode = process.argv[2] || 'dry';
  const out = path.resolve(process.argv[3] || 'tools/out/clip.mp4');
  if (!fs.existsSync(path.join(ROOT, 'dist/index.html'))) throw new Error('run npm run build first');
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  try {
    await waitForServer(`http://localhost:${PORT}/`);
    await run(mode, out);
  } finally {
    server.kill();
  }
}

async function run(mode, out) {
  const C = CONFIG;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  await page.addInitScript(virtualTime, C.seed);
  await page.goto(`http://localhost:${PORT}/?debug=1`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const step = (ms) => page.evaluate((m) => window.__step(m), ms);
  for (let i = 0; i < 5; i++) await step(16);

  await page.evaluate(
    ({ C }) => {
      const g = window.__game;
      // Crisp canvas at 3x for a 1080x1920 capture.
      const r0 = g.resize.bind(g);
      g.resize = function () {
        r0();
        const rect = this.app.getBoundingClientRect();
        this.dpr = 3;
        this.canvas.width = Math.round(rect.width * 3);
        this.canvas.height = Math.round(rect.height * 3);
      };
      g.resize();
      g.save.tutorialDone = true;
      g.save.coins = 140;
      g.save.best = C.best;
      const deaths = Object.entries(C.plan).filter(([, v]) => v > 1).map(([k]) => Number(k));
      if (deaths.length) g.save.bestIdx = Math.max(...deaths) + C.bestOffset;
      if (!g.save.owned.includes(C.skin)) g.save.owned.push(C.skin);
      g.equip(C.skin);

      window.__log = [];
      const oe = g.onEvent.bind(g);
      g.onEvent = (e) => {
        window.__log.push({
          vt: Math.round(performance.now()),
          t: e.t,
          idx: e.p ? e.p.idx : undefined,
          kind: e.p ? e.p.kind : undefined,
          perfect: e.perfect,
          acc: e.acc !== undefined ? Math.round(e.acc * 100) / 100 : undefined,
          combo: e.combo,
          score: g.sim.score,
          cause: e.cause,
          near: e.nearMiss,
          zone: e.zone,
          on: e.on,
        });
        if (e.t === 'death') g.bot = false;
        if (e.t === 'jump' && window.__capturing) window.__tap();
        oe(e);
      };

      // Director: clean bot play, except planets listed in the plan.
      const ob = g.botStep.bind(g);
      g.botStep = function () {
        const s = this.sim;
        const c = s.cat;
        if (c.state === 'ground' && c.planet && this.botPlanet !== c.planet.idx && C.plan[c.planet.idx] !== undefined) {
          const n = s.nextPlanet;
          const p = c.planet;
          if (n) {
            const D = Math.hypot(n.x - p.x, n.y - p.y);
            this.botPlanet = p.idx;
            this.botErr = -Math.asin(Math.min(0.95, (C.plan[p.idx] * (n.r + 15)) / D));
          }
        }
        ob();
      };

      // Caption layer (promo only).
      const st = document.createElement('style');
      st.textContent = `
        .clip-cap{position:absolute;left:0;right:0;text-align:center;font:900 31px var(--font);color:#fff;
          -webkit-text-stroke:8px #1b1036;paint-order:stroke fill;pointer-events:none;z-index:40;line-height:1.28;
          opacity:0;transform:scale(.85);transition:opacity .25s,transform .35s cubic-bezier(.3,1.6,.5,1)}
        .clip-cap.on{opacity:1;transform:none}
        .clip-cap small{display:block;font-size:20px;-webkit-text-stroke:6px #1b1036}
        .clip-cap b{color:#ffd84d}
        .clip-cap.instant{transition:none}
        #clip-top{top:19%}
        #clip-bot{top:30.5%}
        #clip-bot small{font-size:18px;margin-bottom:6px}
        .clip-end .title-top,.clip-end .tabs,.clip-end #title-best,.clip-end .title-bottom,.clip-end .tap-start,.clip-end #rival,.clip-end .tagline{visibility:hidden}
        .clip-tap{position:absolute;left:50%;bottom:8%;width:84px;height:84px;margin-left:-42px;pointer-events:none;z-index:40;opacity:0}
        .clip-tap.go{animation:cliptap .5s ease-out}
        .clip-tap i{position:absolute;inset:0;border-radius:50%;border:5px solid #fff;box-shadow:0 0 18px rgba(255,255,255,.7)}
        .clip-tap.go i{animation:clipring .5s ease-out}
        .clip-tap b{position:absolute;left:50%;top:44%;font-size:44px;transform:translate(-30%,0);filter:drop-shadow(0 3px 4px rgba(0,0,0,.5))}
        @keyframes cliptap{0%{opacity:1}70%{opacity:1}100%{opacity:0}}
        @keyframes clipring{0%{transform:scale(.35);opacity:1}100%{transform:scale(1.35);opacity:0}}
      `;
      document.head.append(st);
      for (const id of ['clip-top', 'clip-bot']) {
        const d = document.createElement('div');
        d.id = id;
        d.className = 'clip-cap';
        document.getElementById('app').append(d);
      }
      const tap = document.createElement('div');
      tap.className = 'clip-tap';
      tap.innerHTML = '<i></i><b>👆</b>';
      document.getElementById('app').append(tap);
      window.__tap = () => {
        tap.classList.remove('go');
        void tap.offsetWidth;
        tap.classList.add('go');
      };
      window.__cap = (id, html) => {
        const d = document.getElementById(id);
        if (html) d.innerHTML = html;
        d.classList.toggle('on', !!html);
      };
      g.sound.unlock();
      g.bot = true;
    },
    { C },
  );

  // Warm up until we are standing on the capture planet.
  const DT = 1000 / C.fps;
  let vt = 0;
  for (let i = 0; i < 60 * 120; i++) {
    vt = await step(DT);
    const ready = await page.evaluate((k) => {
      const g = window.__game;
      return g.state === 'play' && g.sim.cat.state === 'ground' && g.sim.maxIdx >= k;
    }, C.captureAfterIdx);
    if (ready) break;
  }
  const capStart = vt;

  if (mode === 'dry') {
    let deathVt = -1;
    for (let i = 0; i < 60 * 60; i++) {
      vt = await step(DT);
      if (deathVt < 0) {
        const dead = await page.evaluate(() => window.__game.sim.over);
        if (dead) deathVt = vt;
      } else if (vt - deathVt > 1500) break;
    }
    const log = await page.evaluate(() => window.__log);
    for (const e of log) {
      const t = ((e.vt - capStart) / 1000).toFixed(2).padStart(6);
      const rest = Object.entries(e)
        .filter(([k, v]) => v !== undefined && k !== 'vt' && k !== 't')
        .map(([k, v]) => `${k}=${v}`)
        .join(' ');
      if (e.t !== 'tick' && e.t !== 'coin') console.log(`${t}s ${e.t.padEnd(6)} ${rest}`);
    }
    console.log(`death at clip t=${((deathVt - capStart) / 1000).toFixed(2)}s`);
    await browser.close();
    return;
  }

  // ---- render
  const frames = path.join(path.dirname(out), 'clip-frames');
  fs.rmSync(frames, { recursive: true, force: true });
  fs.mkdirSync(frames, { recursive: true });
  let n = 0;
  const shot = async () => {
    await page.screenshot({ path: path.join(frames, `${String(n++).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 94 });
  };

  let deathT = -1;
  let endT = -1;
  let ended = false;
  await page.evaluate(() => {
    window.__capturing = true;
    document.getElementById('clip-top').classList.add('instant');
  });
  for (;;) {
    const t = (vt - capStart) / 1000;
    // captions by clip time
    await page.evaluate(
      ({ t, deathT, endT, HOOK }) => {
        const cap = window.__cap;
        const top = document.getElementById('clip-top');
        if (t > 0.05) top.classList.remove('instant');
        if (t < HOOK) cap('clip-top', 'この猫、<br>どこまで とべる？');
        else cap('clip-top', '');
        if (endT >= 0 && t > endT + 0.3) cap('clip-bot', '<small>タップだけ・無料・インストール不要</small><b>#ほしねこジャンプ</b>');
      },
      { t, deathT, endT, HOOK: C.hook },
    );
    await shot();
    vt = await step(DT);
    const tt = (vt - capStart) / 1000;
    if (deathT < 0 && (await page.evaluate(() => window.__game.sim.over))) deathT = tt;
    if (deathT >= 0 && !ended && tt > deathT + C.resultHold) {
      ended = true;
      endT = tt;
      await page.evaluate(() => {
        const g = window.__game;
        g.goHome();
        document.getElementById('app').classList.add('clip-end');
        g.sound.startBgm();
        g.sound.meow(1.05, 0.25);
      });
    }
    if (ended && tt > endT + C.endCard) break;
    if (n > C.fps * 40) break;
  }
  const dur = n / C.fps;
  const vt0 = await page.evaluate(() => window.__audioVt0);
  const b64 = await page.evaluate(({ from, dur }) => window.__audioPcm(from, dur), { from: (capStart - vt0) / 1000, dur });
  const pcm = path.join(path.dirname(out), 'clip-audio.pcm');
  fs.writeFileSync(pcm, Buffer.from(b64, 'base64'));
  await browser.close();

  execFileSync(
    'ffmpeg',
    [
      '-y', '-loglevel', 'error',
      '-framerate', String(C.fps), '-i', path.join(frames, '%05d.jpg'),
      '-f', 's16le', '-ar', '48000', '-ac', '2', '-i', pcm,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
      '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11,afade=t=out:st=' + (dur - 0.6).toFixed(2) + ':d=0.6',
      '-c:a', 'aac', '-b:a', '192k',
      '-shortest', '-movflags', '+faststart', out,
    ],
    { stdio: 'inherit' },
  );
  console.log(`wrote ${out} (${dur.toFixed(2)}s, ${n} frames, death at ${deathT.toFixed(2)}s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
