import './style.css';
import { Sim } from './core/sim.ts';
import type { SimEvent } from './core/sim.ts';
import { W, CAT_R, TAU, clamp, wrapAngle } from './core/constants.ts';
import { ZONES, rankFor, nextRank } from './core/zones.ts';
import { randomSeed } from './core/rng.ts';
import { jstDateKey, dailyNumber, dailySeed, shortDate } from './core/daily.ts';
import { Scene } from './render/scene.ts';
import type { CatLook } from './render/scene.ts';
import { FX } from './render/fx.ts';
import { SKINS, skinById, drawCat } from './render/cat.ts';
import type { Skin } from './render/cat.ts';
import { Sound } from './app/audio.ts';
import { loadSave, writeSave } from './app/storage.ts';
import type { Save } from './app/storage.ts';
import { rollGacha, GACHA_COST, DUPLICATE_REFUND } from './app/gacha.ts';
import { missionsFor, missionLabel, applyRun, MISSION_REWARD, ALL_CLEAR_BONUS } from './app/missions.ts';
import { xIntentUrl, lineUrl, baseUrl, makeShareCard, prepareCard, canShareFile, shareFile, shareText, challengeUrl, copyText, GAME_NAME, HASHTAG } from './app/share.ts';
import type { RunResult, PreparedCard } from './app/share.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

type Mode = 'endless' | 'daily';
type State = 'title' | 'play' | 'over';

interface Rival {
  score: number;
  seed: number | null;
  mode: Mode;
}

const MISS_LINES = ['にゃーん…（宇宙ねこ）', 'どこまでも とんでいく…', 'ここは…どこ…？', 'あっ。', 'ちきゅうが…とおい…'];
const FUSE_LINES = ['星がこわれちゃった！', 'ながいしすぎたにゃ…', 'のんびりしすぎた…'];
const HAZARD_LINES = ['いんせきにゴツン！', 'いたいにゃ…', 'いんせき、よけて…'];
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

function vibrate(p: number | number[]): void {
  try {
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua && !ua.hasBeenActive) return;
    navigator.vibrate?.(p);
  } catch {
    /* unsupported */
  }
}

class Game {
  private app = $('app');
  private canvas = $<HTMLCanvasElement>('game');
  private ctx = this.canvas.getContext('2d')!;
  private dpr = 1;
  private scale = 1;
  private viewH = 640;

  private save: Save = loadSave();
  private sound = new Sound();
  private scene = new Scene();
  private fx = new FX();
  private sim: Sim;
  private state: State = 'title';
  private mode: Mode = 'endless';
  private rival: Rival | null = null;
  private skin: Skin;

  private look: CatLook = { squash: 0, squashV: 0, face: 'normal', faceT: 0, blinkT: 2 };
  private time = 0;
  private last = 0;
  private hitStop = 0;
  private timeScale = 1;
  private overT = 0;
  private resultShown = false;
  private tutorial = false;
  private landings = 0;
  private recordCelebrated = false;
  private prevBest = 0;
  private lastResult: RunResult | null = null;
  private hudScore = -1;
  private hudSubText = '';
  private bot = false;
  private botErr = 0;
  private botPlanet = -1;
  private revealing = false;
  private revealSkin: Skin | null = null;
  private card: PreparedCard | null = null;
  private runSkips = 0;
  private cardPromise: Promise<PreparedCard> | null = null;

  constructor() {
    this.skin = skinById(this.save.skin);
    this.sound.sfxOn = this.save.sfx;
    this.sound.bgmOn = this.save.bgm;
    this.readUrl();
    this.refreshDay();
    this.sim = new Sim(this.seedFor(), this.viewH);
    this.resize();
    this.bindUi();
    this.refreshTitle();
    this.refreshSoundIcons();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.sound.suspend();
    });
    requestAnimationFrame((t) => {
      this.last = t;
      this.frame(t);
    });
    const q = new URLSearchParams(location.search);
    if (q.get('debug') === '1') {
      const w = window as unknown as { __game: Game; __card: () => Promise<string> };
      w.__game = this;
      w.__card = async () => (this.lastResult ? (await makeShareCard(this.lastResult)).toDataURL('image/png') : '');
    }
    if (q.get('bot') === '1') this.bot = true;
  }

  // ---------------------------------------------------------------- setup

  private readUrl(): void {
    const q = new URLSearchParams(location.search);
    const vs = parseInt(q.get('vs') ?? '', 10);
    if (!Number.isFinite(vs) || vs < 0 || vs > 100000) return;
    const d = q.get('d');
    const seedStr = q.get('seed');
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      if (d === jstDateKey()) {
        this.mode = 'daily';
        this.rival = { score: vs, seed: null, mode: 'daily' };
      } else {
        this.rival = { score: vs, seed: dailySeed(d), mode: 'endless' };
      }
    } else if (seedStr) {
      const seed = parseInt(seedStr, 36);
      if (Number.isFinite(seed) && seed > 0) this.rival = { score: vs, seed, mode: 'endless' };
    }
  }

  /** New JST day: fresh missions, and keep the login streak going. */
  private refreshDay(): void {
    const sv = this.save;
    const today = jstDateKey();
    if (sv.missionKey !== today || !Array.isArray(sv.missions) || sv.missions.length === 0) {
      sv.missionKey = today;
      sv.missions = missionsFor(today);
      sv.missionAllClaimed = false;
    }
    if (sv.lastLoginKey !== today) {
      const yesterday = jstDateKey(Date.now() - 86_400_000);
      sv.streak = sv.lastLoginKey === yesterday ? sv.streak + 1 : 1;
      sv.lastLoginKey = today;
    }
    writeSave(sv);
  }

  private seedFor(): number {
    if (this.mode === 'daily') return dailySeed(jstDateKey());
    if (this.rival && this.rival.mode === 'endless' && this.rival.seed) return this.rival.seed;
    return randomSeed();
  }

  private activeRival(): Rival | null {
    return this.rival && this.rival.mode === this.mode ? this.rival : null;
  }

  private bestIdxForMode(): number {
    if (this.mode === 'daily') return this.save.dailyKey === jstDateKey() ? this.save.dailyBestIdx : 0;
    return this.save.bestIdx;
  }

  private bestForMode(): number {
    if (this.mode === 'daily') return this.save.dailyKey === jstDateKey() ? this.save.dailyBest : 0;
    return this.save.best;
  }

  private resize(): void {
    document.documentElement.style.setProperty('--app-h', `${window.innerHeight}px`);
    const rect = this.app.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.scale = rect.width / W;
    this.viewH = rect.height / this.scale;
    this.sim.setView(this.viewH);
  }

  private bindUi(): void {
    this.app.addEventListener('pointerdown', (e) => this.onPointer(e));
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowUp') {
        e.preventDefault();
        this.onAction();
      }
    });
    // Stop iOS double-tap zoom / long-press menus inside the game.
    this.app.addEventListener('touchend', (e) => {
      const t = e.target as HTMLElement;
      if (!t.closest('button, #gacha')) e.preventDefault();
    }, { passive: false });
    this.app.addEventListener('contextmenu', (e) => e.preventDefault());

    for (const tab of Array.from(document.querySelectorAll<HTMLButtonElement>('.tab'))) {
      tab.addEventListener('click', () => {
        this.sound.unlock();
        this.sound.click();
        this.setMode(tab.dataset.mode as Mode);
      });
    }
    const toggleSound = () => {
      this.sound.unlock();
      const on = !(this.save.sfx || this.save.bgm);
      this.save.sfx = on;
      this.save.bgm = on;
      this.sound.setSfx(on);
      this.sound.setBgm(on);
      if (on && this.state === 'play') this.sound.startBgm();
      writeSave(this.save);
      this.refreshSoundIcons();
    };
    $('hud-sound').addEventListener('click', toggleSound);
    $('title-sound').addEventListener('click', toggleSound);
    $('btn-retry').addEventListener('click', () => this.retry());
    $('btn-home').addEventListener('click', () => this.goHome());
    $('btn-share-img').addEventListener('click', () => void this.shareImg());
    $('btn-share-x').addEventListener('click', () => this.sound.click());
    $('btn-share-line').addEventListener('click', () => this.sound.click());
    $('btn-share-game').addEventListener('click', () => void this.shareGame());
    $('btn-gacha').addEventListener('click', () => this.openGacha());
    $('btn-missions').addEventListener('click', () => this.openMissions());
    $('missions-close').addEventListener('click', () => {
      this.sound.click();
      $('missions').classList.add('hidden');
    });
    $('btn-res-gacha').addEventListener('click', () => this.openGacha());
    $('gacha-close').addEventListener('click', () => this.closeGacha());
    $('gacha-pull').addEventListener('click', () => this.pullGacha());
    $('reveal-equip').addEventListener('click', () => {
      if (this.revealSkin) this.equip(this.revealSkin.id);
      this.closeReveal();
    });
    $('reveal-close').addEventListener('click', () => this.closeReveal());
    $('sheet-close').addEventListener('click', () => {
      this.sound.click();
      $('sheet').classList.add('hidden');
    });
    $('sheet-copy').addEventListener('click', async () => {
      if (!this.lastResult) return;
      const ok = await copyText(shareText(this.lastResult) + '\n' + challengeUrl(this.lastResult));
      this.toast(ok ? 'コピーしたよ！SNSに貼ってね' : 'コピーできなかった…');
    });
    // iOS sometimes only unlocks audio on touchend/click.
    const unlock = () => this.sound.unlock();
    window.addEventListener('touchend', unlock, { passive: true });
    window.addEventListener('click', unlock);
  }

  private onPointer(e: PointerEvent): void {
    const t = e.target as HTMLElement;
    this.sound.unlock();
    if (t.closest('button, a, #gacha, #reveal, #result, #sheet, #missions')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.onAction();
  }

  private onAction(): void {
    this.sound.unlock();
    for (const id of ['gacha', 'sheet', 'missions']) if (!$(id).classList.contains('hidden')) return;
    if (this.revealing) return;
    if (this.state === 'title') this.startRun(false);
    else if (this.state === 'play') this.tryJump();
    else if (this.state === 'over' && this.resultShown && this.overT > 1.6) this.retry();
  }

  private tryJump(): void {
    if (this.sim.jump()) {
      vibrate(6);
    }
  }

  // ---------------------------------------------------------------- flow

  private setMode(m: Mode): void {
    if (this.mode === m) return;
    this.mode = m;
    this.sim = new Sim(this.seedFor(), this.viewH);
    this.scene.setZone(0, true);
    this.refreshTitle();
  }

  private startRun(fresh: boolean): void {
    if (jstDateKey() !== this.save.missionKey) this.refreshDay();
    if (fresh) this.sim = new Sim(this.seedFor(), this.viewH);
    this.runSkips = 0;
    this.state = 'play';
    this.fx = new FX();
    this.scene.setZone(0, true);
    this.overT = 0;
    this.resultShown = false;
    this.timeScale = 1;
    this.hitStop = 0;
    this.landings = 0;
    this.recordCelebrated = false;
    this.prevBest = this.bestForMode();
    this.tutorial = !this.save.tutorialDone;
    this.hudScore = -1;
    this.look.face = 'normal';
    $('title').classList.add('hidden');
    $('result').classList.add('hidden');
    $('result').classList.remove('show');
    $('hud').classList.remove('hidden');
    $('hud-score').classList.remove('fever');
    this.updateHud(true);
    this.sound.intensity = 0;
    if (this.sound.bgmOn) this.sound.startBgm();
    this.sound.meow(1.1);
  }

  private retry(): void {
    this.sound.click();
    this.startRun(true);
  }

  private goHome(): void {
    this.sound.click();
    this.state = 'title';
    this.sim = new Sim(this.seedFor(), this.viewH);
    this.fx = new FX();
    this.scene.setZone(0, true);
    this.sound.stopBgm();
    $('result').classList.add('hidden');
    $('result').classList.remove('show');
    $('hud').classList.add('hidden');
    $('title').classList.remove('hidden');
    this.refreshTitle();
  }

  // ---------------------------------------------------------------- loop

  private frame(now: number): void {
    const raw = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.update(raw);
    this.render();
    requestAnimationFrame((t) => this.frame(t));
  }

  private update(raw: number): void {
    this.time += raw;
    let dt = raw;
    if (this.hitStop > 0) {
      this.hitStop -= raw;
      dt = 0;
    }
    if (this.state === 'over') {
      this.timeScale += (1 - this.timeScale) * (1 - Math.exp(-raw * 1.5));
    }
    dt *= this.timeScale;

    if (this.bot && this.state === 'play') this.botStep();
    if (this.bot && this.state === 'title' && this.time > 1.2) this.startRun(false);
    if (this.bot && this.state === 'over' && this.overT > 3.2) this.startRun(true);

    if (this.state === 'title' && this.sim.cat.planet) {
      // On the title screen the cat "runs" on top while the planet spins under it.
      this.sim.cat.local = -Math.PI / 2 - this.sim.cat.planet.angle;
    }
    this.sim.update(dt);
    this.handleEvents();
    if (this.sim.cat.state === 'fly') {
      const hue = (this.time * 400) % 360;
      this.fx.trail(this.sim.cat.x, this.sim.cat.y, this.sim.fever ? `hsl(${hue},100%,70%)` : 'rgba(200,230,255,0.9)', this.sim.fever ? 13 : 10);
    }
    this.fx.update(dt);
    this.scene.update(raw, this.sim.fever);
    this.updateLook(dt);

    if (this.state === 'over') {
      this.overT += raw;
      if (!this.resultShown && this.overT > 1.05) this.showResult();
    }
    if (this.state === 'play') this.updateHud(false);
  }

  private updateLook(dt: number): void {
    const L = this.look;
    L.squashV += (-260 * L.squash - 15 * L.squashV) * dt;
    L.squash += L.squashV * dt;
    L.blinkT -= dt;
    if (L.blinkT <= 0) L.blinkT = 2.2 + Math.random() * 2.5;
    L.faceT -= dt;
    const c = this.sim.cat;
    if (c.state === 'dead') L.face = 'blank';
    else if (c.state === 'fly') L.face = 'jump';
    else if (L.faceT > 0) L.face = 'happy';
    else if (Number.isFinite(this.sim.fuse) && this.sim.fuse < 1.1 && this.state === 'play') L.face = 'scared';
    else L.face = 'normal';
  }

  private handleEvents(): void {
    const ev = this.sim.events;
    if (!ev.length) return;
    for (const e of ev) this.onEvent(e);
    ev.length = 0;
  }

  private onEvent(e: SimEvent): void {
    const fx = this.fx;
    switch (e.t) {
      case 'jump': {
        this.sound.jump();
        this.look.squash = -0.3;
        this.look.squashV = 0;
        const from = this.sim.cat.from;
        const col = from ? `hsl(${from.hue},80%,75%)` : '#fff';
        fx.spray(e.x - e.dx * CAT_R, e.y - e.dy * CAT_R, -e.dx, -e.dy, 8, col, 150, 0.9);
        break;
      }
      case 'land': {
        this.scene.bump(e.p, this.time);
        this.look.squash = 0.34;
        this.look.squashV = 0;
        const col = `hsl(${e.p.hue},85%,72%)`;
        const fx0 = e.x - e.nx * CAT_R;
        const fy0 = e.y - e.ny * CAT_R;
        if (e.back) {
          this.sound.land(0, false);
          fx.text(e.x, e.y - 50, 'もどった…', '#cfd8ff', 16);
          break;
        }
        this.landings++;
        if (this.tutorial && this.landings >= 3) {
          this.tutorial = false;
          this.save.tutorialDone = true;
          writeSave(this.save);
        }
        if (e.perfect) {
          this.sound.land(e.combo, true);
          const fever = this.sim.fever;
          fx.burst(e.x, e.y, fever ? 26 : 16, fever ? ['#ff8ad8', '#ffe45c', '#7af0ff', '#ffffff'] : ['#fff6a0', '#ffd23d', '#ffffff'], 280, { kind: 'star', size: 6, max: 0.75 });
          fx.ring(e.x, e.y, fever ? '#ff9de2' : '#ffe45c', 80);
          fx.spray(fx0, fy0, e.nx, e.ny, 10, col, 220, 1.4);
          this.hitStop = 0.055;
          fx.shake(0.18);
          vibrate(14);
          this.look.faceT = 0.7;
          const size = 24 + Math.min(e.combo, 8) * 2;
          fx.text(e.x, e.y - 78, e.combo >= 2 ? `PERFECT ×${e.combo}` : 'PERFECT!', fever ? '#ff9de2' : '#fff36b', size, 1.0);
        } else {
          this.sound.land(0, false);
          fx.spray(fx0, fy0, e.nx, e.ny, 12, col, 170, 1.4);
          fx.shake(0.07);
          vibrate(5);
          fx.text(e.x, e.y - 74, e.acc > 0.84 ? 'ギリギリ！' : 'GOOD', e.acc > 0.84 ? '#ffb0b0' : '#bfe8ff', 20, 0.8);
        }
        if (e.gained >= 2) {
          this.runSkips++;
          fx.text(e.x, e.y - 112, `${e.gained}コとばし！`, '#7af0ff', 26, 1.2);
          fx.burst(e.x, e.y, 20, ['#7af0ff', '#ffffff'], 320, { kind: 'spark', size: 3 });
        }
        fx.text(e.x + 46, e.y - 40, `+${e.pts}`, '#ffe45c', 20, 0.8);
        if (e.p.rare) {
          this.sound.zone();
          fx.confetti(e.x, e.y, 40);
          fx.text(e.x, e.y - 140, 'レア！にじ星 ★+3', '#ffffff', 24, 1.4);
          vibrate([15, 30, 15]);
          this.updateCoinsHud();
        }
        this.bumpScore();
        this.checkRecordCelebration();
        break;
      }
      case 'coin': {
        this.sound.coin();
        fx.burst(e.c.x, e.c.y, 10, ['#ffd84a', '#fff6a0'], 180, { kind: 'star', size: 4, max: 0.5 });
        fx.text(e.c.x, e.c.y - 20, '★+1', '#ffd84a', 15, 0.6);
        this.updateCoinsHud();
        break;
      }
      case 'zone': {
        const z = ZONES[e.zone];
        this.sound.zone();
        this.scene.setZone(e.zone);
        fx.doFlash(0.35);
        this.showBanner(`ZONE ${e.zone + 1}`, z.name, false);
        break;
      }
      case 'tick':
        this.sound.tick(e.left < 0.7);
        if (e.left < 0.7) vibrate(4);
        break;
      case 'pop': {
        this.sound.pop();
        const col = `hsl(${e.p.hue},85%,70%)`;
        fx.burst(e.p.x, e.p.y, 40, [col, '#ffffff', '#ff6a6a'], 380, { size: 5, max: 0.9 });
        fx.ring(e.p.x, e.p.y, '#ff6a6a', e.p.r * 2.2, 0.6);
        fx.shake(0.65);
        fx.doFlash(0.45, '255,80,80');
        break;
      }
      case 'bonk':
        this.sound.bonk();
        fx.burst(e.x, e.y, 18, ['#ffffff', '#ffb36b'], 260, { kind: 'spark', size: 3 });
        fx.text(e.x, e.y - 30, 'ゴツン！', '#ffb36b', 24);
        fx.shake(0.55);
        break;
      case 'fever':
        if (e.on) {
          this.sound.fever();
          this.sound.intensity = 1;
          this.showBanner('PERFECT×5', 'FEVER!!', true);
          $('hud-score').classList.add('fever');
          vibrate([10, 30, 10]);
        } else {
          this.sound.intensity = 0;
          $('hud-score').classList.remove('fever');
        }
        break;
      case 'death':
        this.onDeath(e.cause, e.nearMiss);
        break;
    }
  }

  private onDeath(cause: string, nearMiss: boolean): void {
    this.state = 'over';
    this.overT = 0;
    this.timeScale = 0.3;
    this.sound.stopBgm();
    vibrate([30, 40, 60]);
    if (cause === 'miss') this.sound.fall();
    const c = this.sim.cat;
    if (nearMiss) this.fx.text(c.x, c.y - 40, 'おしい！', '#ffb0d0', 30, 1.4);
    this.fx.shake(cause === 'miss' ? 0.25 : 0.4);
    this.finishRun(cause, nearMiss);
  }

  private checkRecordCelebration(): void {
    if (this.recordCelebrated || this.prevBest <= 0) return;
    if (this.sim.score > this.prevBest) {
      this.recordCelebrated = true;
      this.sound.record();
      this.fx.confetti(W / 2, this.sim.camY + this.viewH * 0.2, 60);
      this.showBanner('NEW RECORD', 'ベスト更新！', false);
    }
  }

  // ---------------------------------------------------------------- bot (for demos/tests: ?bot=1)

  private botStep(): void {
    const s = this.sim;
    const c = s.cat;
    if (c.state !== 'ground' || !c.planet) return;
    if (c.planet.idx !== this.botPlanet) {
      this.botPlanet = c.planet.idx;
      this.botErr = (Math.random() - 0.5) * 0.06;
    }
    const n = s.nextPlanet;
    if (!n) return;
    const p = c.planet;
    let tx = n.x;
    if (n.kind === 'moving') {
      const dist = Math.hypot(n.x - p.x, n.y - p.y) - p.r - n.r;
      tx = n.baseX + n.moveAmp * Math.sin((TAU * (s.time + dist / 620)) / n.movePeriod + n.movePhase);
    }
    const want = Math.atan2(n.y - p.y, tx - p.x);
    const diff = wrapAngle(want - s.catAngle) * Math.sign(p.omega);
    if (diff < this.botErr && diff > this.botErr - 0.12) this.tryJump();
  }

  // ---------------------------------------------------------------- HUD

  private bumpScore(): void {
    const el = $('hud-score');
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  private updateHud(force: boolean): void {
    const s = this.sim;
    if (force || s.score !== this.hudScore) {
      this.hudScore = s.score;
      $('hud-score').textContent = String(s.score);
    }
    let sub = '';
    let hot = false;
    const rival = this.activeRival();
    if (rival) {
      if (s.score <= rival.score) {
        sub = `ライバル ${rival.score} まで あと${rival.score - s.score + 1}`;
        hot = rival.score - s.score <= 5;
      } else {
        sub = 'ライバル撃破！🎉';
        hot = true;
      }
    } else if (this.prevBest > 0) {
      if (s.score <= this.prevBest) {
        const left = this.prevBest - s.score + 1;
        sub = left <= 5 ? `ベストまで あと${left}！` : `BEST ${this.prevBest}`;
        hot = left <= 5;
      } else {
        sub = 'ベスト更新中！🔥';
        hot = true;
      }
    } else if (this.tutorial) {
      sub = 'まんなかに着地でPERFECT！';
    }
    const key = sub + hot;
    if (force || key !== this.hudSubText) {
      this.hudSubText = key;
      const el = $('hud-sub');
      el.textContent = sub;
      el.classList.toggle('hot', hot);
    }
    if (force) this.updateCoinsHud();
  }

  private updateCoinsHud(): void {
    $('hud-coin-n').textContent = String(this.save.coins + this.sim.coins);
  }

  private showBanner(small: string, big: string, fever: boolean): void {
    const b = $('banner');
    b.innerHTML = '';
    const s = document.createElement('div');
    s.className = 'b-small';
    s.textContent = small;
    const g = document.createElement('div');
    g.className = 'b-big';
    g.textContent = big;
    b.append(s, g);
    b.classList.remove('show', 'fever');
    void b.offsetWidth;
    b.classList.add('show');
    b.classList.toggle('fever', fever);
  }

  private toastTimer = 0;
  private toast(msg: string): void {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('show'), 2200);
  }

  private refreshSoundIcons(): void {
    const on = this.save.sfx || this.save.bgm;
    $('hud-sound').textContent = on ? '🔊' : '🔇';
    $('title-sound').textContent = on ? '🔊' : '🔇';
  }

  private refreshTitle(): void {
    for (const tab of Array.from(document.querySelectorAll<HTMLButtonElement>('.tab'))) {
      tab.classList.toggle('active', tab.dataset.mode === this.mode);
    }
    const key = jstDateKey();
    $('daily-no').textContent = `#${dailyNumber(key)}`;
    const best = this.bestForMode();
    $('title-best').textContent = this.mode === 'daily' ? `${shortDate(key)} のベスト ${best}` : `BEST ${best}`;
    const coinPill = $('title-coins').lastElementChild as HTMLElement;
    coinPill.textContent = String(this.save.coins);
    const rival = this.activeRival();
    const rb = $('rival');
    if (rival) {
      rb.innerHTML = '';
      rb.append('ともだちのスコア ');
      const b = document.createElement('b');
      b.textContent = String(rival.score);
      rb.append(b, ' をこえろ！（おなじコース）');
      rb.classList.remove('hidden');
    } else rb.classList.add('hidden');
    $('mission-count').textContent = `${this.save.missions.filter((m) => m.done).length}/${this.save.missions.length}`;
    const can = this.save.coins >= GACHA_COST;
    $('gacha-dot').classList.toggle('hidden', !can);
    $('gacha-dot-2').classList.toggle('hidden', !can);
  }

  // ---------------------------------------------------------------- results

  private finishRun(cause: string, nearMiss: boolean): void {
    const s = this.sim;
    const sv = this.save;
    const today = jstDateKey();
    const prevBest = this.prevBest;
    const isRecord = s.score > prevBest && s.score > 0;
    sv.plays++;
    sv.totalPerfect += s.perfects;
    sv.totalJumps += s.jumps;
    sv.bestZone = Math.max(sv.bestZone, s.zone);
    if (this.mode === 'daily') {
      if (sv.dailyKey !== today) {
        sv.dailyKey = today;
        sv.dailyBest = 0;
        sv.dailyPlays = 0;
        sv.dailyBestIdx = 0;
      }
      sv.dailyPlays++;
      sv.dailyBest = Math.max(sv.dailyBest, s.score);
      sv.dailyBestIdx = Math.max(sv.dailyBestIdx, s.maxIdx);
    } else {
      sv.best = Math.max(sv.best, s.score);
      sv.bestIdx = Math.max(sv.bestIdx, s.maxIdx);
    }
    const scoreBonus = Math.floor(s.score / 10);
    let dailyBonus = 0;
    if (sv.lastBonusKey !== today) {
      sv.lastBonusKey = today;
      dailyBonus = 10 + 5 * Math.min(Math.max(sv.streak, 1) - 1, 6);
    }
    const newly = applyRun(sv.missions, {
      score: s.score,
      perfects: s.perfects,
      coins: s.coins,
      maxCombo: s.maxCombo,
      zone: s.zone,
      skips: this.runSkips,
      daily: this.mode === 'daily',
    });
    let missionReward = newly.length * MISSION_REWARD;
    const allDone = sv.missions.every((m) => m.done);
    const allClear = allDone && !sv.missionAllClaimed;
    if (allClear) {
      sv.missionAllClaimed = true;
      missionReward += ALL_CLEAR_BONUS;
    }
    const earned = s.coins + scoreBonus + dailyBonus + missionReward;
    sv.coins += earned;
    writeSave(sv);

    this.lastResult = {
      score: s.score,
      best: Math.max(prevBest, s.score),
      isRecord,
      perfects: s.perfects,
      maxCombo: s.maxCombo,
      coins: earned,
      zone: s.zone,
      mode: this.mode,
      seed: s.seed,
      dailyKey: today,
      skin: this.skin,
    };

    let msg = cause === 'fuse' ? pick(FUSE_LINES) : cause === 'hazard' ? pick(HAZARD_LINES) : pick(MISS_LINES);
    if (nearMiss) msg = 'おしい！あとちょっとだった…！';
    $('res-msg').textContent = msg;
    $('res-record').classList.toggle('hidden', !isRecord);
    $('res-best').textContent = this.mode === 'daily' ? `きょうのベスト ${this.lastResult.best}` : `BEST ${this.lastResult.best}`;
    const rank = rankFor(s.score);
    $('res-rank-name').textContent = rank.name;
    $('res-rank-comment').textContent = rank.comment;
    const rival = this.activeRival();
    const next = nextRank(s.score);
    let nextTxt = '';
    if (rival) nextTxt = s.score > rival.score ? `ライバル（${rival.score}）に勝った！🎉` : `ライバル（${rival.score}）まで あと${rival.score - s.score + 1}！`;
    else if (next) nextTxt = `つぎの称号まで あと${next.min - s.score}！`;
    $('res-next').textContent = nextTxt;
    $('res-perfect').textContent = String(s.perfects);
    $('res-combo').textContent = String(s.maxCombo);
    $('res-coins').textContent = `+${earned}`;
    for (const id of ['btn-share-x', 'sheet-x']) $<HTMLAnchorElement>(id).href = xIntentUrl(this.lastResult);
    for (const id of ['btn-share-line', 'sheet-line']) $<HTMLAnchorElement>(id).href = lineUrl(this.lastResult);
    this.card = null;
    const res = this.lastResult;
    this.cardPromise = prepareCard(res).then((c) => {
      if (this.lastResult === res) this.card = c;
      return c;
    });
    const lines: string[] = [];
    if (newly.length) {
      let txt = newly.length === 1 ? `ミッション達成！「${missionLabel(newly[0])}」★+${MISSION_REWARD}` : `ミッション${newly.length}つ達成！★+${newly.length * MISSION_REWARD}`;
      if (allClear) txt += ` ／ ぜんぶクリア ★+${ALL_CLEAR_BONUS}`;
      lines.push(txt);
    }
    if (dailyBonus) lines.push(sv.streak > 1 ? `🔥 連続ログイン${sv.streak}日目！ ★+${dailyBonus}` : `🎁 ログインボーナス ★+${dailyBonus}`);
    const rm = $('res-mission');
    rm.textContent = lines.join('\n');
    rm.classList.toggle('hidden', lines.length === 0);
  }

  private showResult(): void {
    this.resultShown = true;
    $('hud').classList.add('hidden');
    const r = $('result');
    r.classList.remove('hidden');
    r.classList.remove('show');
    void r.offsetWidth;
    r.classList.add('show');
    const can = this.save.coins >= GACHA_COST;
    $('gacha-dot-2').classList.toggle('hidden', !can);
    this.drawResultCat();
    // Count-up
    const target = this.lastResult?.score ?? 0;
    const el = $('res-score');
    const t0 = performance.now();
    const step = (now: number) => {
      const k = clamp((now - t0) / 650, 0, 1);
      el.textContent = String(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    if (this.lastResult?.isRecord) {
      this.sound.record();
      this.fx.confetti(W / 2, this.sim.camY + this.viewH * 0.1, 80);
    }
  }

  private async shareImg(): Promise<void> {
    const r = this.lastResult;
    if (!r) return;
    this.sound.click();
    const ready = this.card;
    if (ready && canShareFile(ready.file)) {
      // Call share synchronously inside the tap so mobile browsers allow it.
      const out = await shareFile(r, ready.file!);
      if (out !== 'failed') return;
    }
    const btn = $<HTMLButtonElement>('btn-share-img');
    btn.disabled = true;
    try {
      const card = ready ?? (await (this.cardPromise ?? prepareCard(r)));
      this.openSheet(card);
    } catch {
      this.toast('ごめん、画像をつくれなかった…');
    } finally {
      btn.disabled = false;
    }
  }

  private openSheet(card: PreparedCard): void {
    $<HTMLImageElement>('sheet-img').src = card.dataUrl;
    $('sheet').classList.remove('hidden');
  }

  private drawResultCat(): void {
    const cv = $<HTMLCanvasElement>('res-cat');
    const c = cv.getContext('2d')!;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    const r = this.lastResult;
    const happy = !!r && (r.isRecord || r.score >= 25);
    // little planet
    const g = c.createRadialGradient(100, 150, 10, 120, 190, 110);
    g.addColorStop(0, '#d9b8ff');
    g.addColorStop(1, '#5a3aa8');
    c.fillStyle = g;
    c.beginPath();
    c.arc(120, 205, 90, 0, Math.PI * 2);
    c.fill();
    c.translate(120, 118);
    c.scale(2.6, 2.6);
    drawCat(c, this.skin, { face: happy ? 'happy' : 'blank', t: 0.5, sx: 1, sy: 1 });
  }

  private async shareGame(): Promise<void> {
    this.sound.click();
    const text = `まわる星から星へ、タップでとぶ猫ゲーム「${GAME_NAME}」🐱🪐 何コまでいける？ #${HASHTAG}`;
    const url = baseUrl();
    const nav = navigator as Navigator;
    if (nav.share) {
      try {
        await nav.share({ title: GAME_NAME, text, url });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank', 'noopener');
  }

  // ---------------------------------------------------------------- missions

  private openMissions(): void {
    this.sound.click();
    this.refreshDay();
    const list = $('mission-list');
    list.innerHTML = '';
    for (const m of this.save.missions) {
      const row = document.createElement('div');
      row.className = `mission${m.done ? ' done' : ''}`;
      const label = document.createElement('div');
      label.className = 'm-label';
      label.textContent = missionLabel(m);
      const reward = document.createElement('div');
      reward.className = 'm-reward';
      reward.textContent = m.done ? 'クリア！' : `★${MISSION_REWARD}`;
      const bar = document.createElement('div');
      bar.className = 'm-bar';
      const fill = document.createElement('i');
      fill.style.width = `${Math.round((100 * Math.min(m.progress, m.target)) / m.target)}%`;
      bar.append(fill);
      const count = document.createElement('div');
      count.className = 'm-count';
      count.textContent = `${Math.min(m.progress, m.target)} / ${m.target}`;
      row.append(label, reward, bar, count);
      list.append(row);
    }
    $('mission-bonus').textContent = this.save.missionAllClaimed ? 'ぜんぶクリア！またあしたね' : `ぜんぶクリアで さらに ★+${ALL_CLEAR_BONUS}`;
    $('mission-streak').textContent = `🔥 連続ログイン ${Math.max(1, this.save.streak)}日目`;
    $('missions').classList.remove('hidden');
  }

  // ---------------------------------------------------------------- gacha

  private openGacha(): void {
    this.sound.click();
    $('gacha').classList.remove('hidden');
    this.refreshGacha();
  }

  private closeGacha(): void {
    this.sound.click();
    $('gacha').classList.add('hidden');
    this.refreshTitle();
  }

  private refreshGacha(): void {
    ($('gacha-coins').lastElementChild as HTMLElement).textContent = String(this.save.coins);
    const pull = $<HTMLButtonElement>('gacha-pull');
    pull.textContent = `まわす（★${GACHA_COST}）`;
    pull.disabled = this.save.coins < GACHA_COST;
    const grid = $('collection');
    grid.innerHTML = '';
    for (const s of SKINS) {
      const owned = this.save.owned.includes(s.id);
      const cell = document.createElement('button');
      cell.className = `cell r${s.rarity}${owned ? '' : ' locked'}${this.save.skin === s.id ? ' equipped' : ''}`;
      const cv = document.createElement('canvas');
      cv.width = 128;
      cv.height = 128;
      const c = cv.getContext('2d')!;
      c.translate(64, 104);
      c.scale(2.3, 2.3);
      drawCat(c, s, { face: owned ? 'normal' : 'normal', t: 0.4, sx: 1, sy: 1, silhouette: !owned });
      const nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = owned ? s.name : '？？？';
      const rs = document.createElement('div');
      rs.className = 'rs';
      rs.textContent = '★'.repeat(s.rarity);
      cell.append(cv, nm, rs);
      if (owned) {
        cell.addEventListener('click', () => {
          this.equip(s.id);
          this.sound.meow(1 + Math.random() * 0.2);
        });
      }
      grid.append(cell);
    }
    $('collection-count').textContent = `ずかん ${this.save.owned.length} / ${SKINS.length}`;
  }

  private equip(id: string): void {
    this.save.skin = id;
    this.skin = skinById(id);
    writeSave(this.save);
    this.refreshGacha();
  }

  private pullGacha(): void {
    this.sound.unlock();
    if (this.save.coins < GACHA_COST || this.revealing) {
      this.toast(`★があと${GACHA_COST - this.save.coins}たりない…`);
      return;
    }
    this.save.coins -= GACHA_COST;
    this.save.gachaCount++;
    const { skin, isNew } = rollGacha(this.save.owned);
    if (isNew) this.save.owned.push(skin.id);
    else this.save.coins += DUPLICATE_REFUND;
    writeSave(this.save);
    this.revealing = true;
    this.revealSkin = skin;
    const machine = document.querySelector('.machine')!;
    machine.classList.add('shake');
    this.sound.gacha();
    setTimeout(() => {
      machine.classList.remove('shake');
      const rv = $('reveal');
      rv.className = `reveal r${skin.rarity}`;
      $('reveal-stars').textContent = '★'.repeat(skin.rarity);
      $('reveal-name').textContent = skin.name;
      $('reveal-tag').textContent = isNew ? 'NEW!' : `もう持ってる！ ★${DUPLICATE_REFUND} おかえし`;
      $('reveal-equip').classList.toggle('hidden', false);
      setTimeout(() => {
        rv.classList.add('open');
        this.sound.reveal(skin.rarity);
        vibrate(skin.rarity >= 3 ? [20, 40, 20, 40, 60] : 20);
        this.drawReveal();
      }, 1700);
      this.refreshGacha();
    }, 1000);
  }

  private drawReveal(): void {
    if (!this.revealing || !this.revealSkin) return;
    const cv = $<HTMLCanvasElement>('reveal-cat');
    const c = cv.getContext('2d')!;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    const bounce = Math.abs(Math.sin(this.time * 4)) * 10;
    c.translate(160, 270 - bounce);
    c.scale(5.4, 5.4);
    drawCat(c, this.revealSkin, { face: 'happy', t: this.time, sx: 1, sy: 1 });
    requestAnimationFrame(() => this.drawReveal());
  }

  private closeReveal(): void {
    this.sound.click();
    this.revealing = false;
    $('reveal').className = 'reveal hidden';
    this.refreshGacha();
  }

  // ---------------------------------------------------------------- render

  private render(): void {
    const ctx = this.ctx;
    const k = this.dpr * this.scale;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const s = this.sim;
    this.scene.drawBackground(ctx, this.viewH, s.camY, this.time);
    ctx.save();
    ctx.translate(this.fx.shakeX, -s.camY + this.fx.shakeY);
    const guideLen = this.tutorial ? 130 : Math.max(48, 92 - s.maxIdx);
    const { aligned } = this.scene.drawWorld(ctx, s, this.fx, this.skin, this.look, this.time, {
      guideLen: this.state === 'play' ? guideLen : 0,
      tutorial: this.tutorial && this.state === 'play',
      showCat: true,
      bestIdx: this.state === 'title' ? 0 : this.bestIdxForMode(),
    });
    if (this.tutorial && this.state === 'play') this.scene.drawTutorialHint(ctx, s, aligned, this.time);
    ctx.restore();
    this.scene.drawOverlay(ctx, this.viewH, this.fx, this.time);
  }
}

new Game();
