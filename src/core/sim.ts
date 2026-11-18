import { Course } from './world.ts';
import type { Planet, Coin } from './world.ts';
import { W, CAT_R, CAT_SPEED, PERFECT_ACC, FEVER_COMBO, clamp } from './constants.ts';
import { zoneIndexFor } from './zones.ts';

export type DeathCause = 'miss' | 'fuse' | 'hazard';
export type CatState = 'ground' | 'fly' | 'dead';

export interface Cat {
  state: CatState;
  planet: Planet | null;
  /** Angle on the planet, relative to the planet's own rotation. */
  local: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  flyT: number;
  from: Planet | null;
  spin: number;
  rot: number;
}

export type SimEvent =
  | { t: 'jump'; x: number; y: number; dx: number; dy: number }
  | {
      t: 'land';
      p: Planet;
      perfect: boolean;
      acc: number;
      pts: number;
      combo: number;
      gained: number;
      back: boolean;
      x: number;
      y: number;
      nx: number;
      ny: number;
    }
  | { t: 'coin'; c: Coin }
  | { t: 'zone'; zone: number }
  | { t: 'tick'; left: number }
  | { t: 'pop'; p: Planet }
  | { t: 'bonk'; x: number; y: number }
  | { t: 'fever'; on: boolean }
  | { t: 'death'; cause: DeathCause; nearMiss: boolean };

/**
 * One run of the game. Pure logic: no DOM, no rendering.
 * The renderer reads the state and reacts to `events`.
 */
export class Sim {
  readonly course: Course;
  readonly seed: number;
  cat: Cat;
  events: SimEvent[] = [];
  time = 0;
  score = 0;
  combo = 0;
  maxCombo = 0;
  perfects = 0;
  jumps = 0;
  coins = 0;
  maxIdx = 0;
  zone = 0;
  fever = false;
  fuse = Infinity;
  over = false;
  cause: DeathCause | null = null;
  nearMiss = false;
  camY = 0;
  viewH = 640;
  private tickAcc = 0;

  constructor(seed: number, viewH: number) {
    this.seed = seed;
    this.viewH = viewH;
    this.course = new Course(seed);
    const p0 = this.course.planets[0];
    this.cat = {
      state: 'ground',
      planet: p0,
      local: -Math.PI / 2 - p0.angle,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      flyT: 0,
      from: null,
      spin: 0,
      rot: 0,
    };
    this.placeOnPlanet();
    this.camY = this.cameraTarget();
    this.course.ensure(this.camY - 200);
  }

  setView(h: number): void {
    this.viewH = h;
  }

  get catAngle(): number {
    const p = this.cat.planet;
    return p ? p.angle + this.cat.local : 0;
  }

  /** Planet the player should aim at next (the next unvisited one). */
  get nextPlanet(): Planet | null {
    for (const p of this.course.planets) if (p.idx === this.maxIdx + 1 && p.alive) return p;
    return null;
  }

  jump(): boolean {
    const c = this.cat;
    if (this.over || c.state !== 'ground' || !c.planet) return false;
    const a = this.catAngle;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    c.vx = dx * CAT_SPEED;
    c.vy = dy * CAT_SPEED;
    c.from = c.planet;
    c.planet = null;
    c.state = 'fly';
    c.flyT = 0;
    c.rot = a + Math.PI / 2;
    this.jumps++;
    this.fuse = Infinity;
    this.events.push({ t: 'jump', x: c.x, y: c.y, dx, dy });
    return true;
  }

  update(dt: number): void {
    this.time += dt;
    this.course.update(dt, this.time);
    const c = this.cat;

    if (c.state === 'ground') {
      this.placeOnPlanet();
      if (!this.over && Number.isFinite(this.fuse)) {
        this.fuse -= dt;
        if (this.fuse < 1.5) {
          this.tickAcc -= dt;
          if (this.tickAcc <= 0) {
            this.tickAcc = this.fuse < 0.7 ? 0.14 : 0.25;
            this.events.push({ t: 'tick', left: this.fuse });
          }
        }
        if (this.fuse <= 0) this.popPlanet();
      }
    } else if (c.state === 'fly') {
      c.flyT += dt;
      const steps = Math.max(1, Math.ceil((CAT_SPEED * dt) / 5));
      const h = dt / steps;
      for (let s = 0; s < steps && c.state === 'fly'; s++) this.flyStep(h);
      if (c.state === 'fly') this.checkMiss();
    } else {
      // dead: drift away
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.rot += c.spin * dt;
    }

    this.updateCamera(dt);
    this.course.ensure(this.camY - 200);
    this.course.cull(this.camY + this.viewH, c.planet ?? c.from);
  }

  private flyStep(h: number): void {
    const c = this.cat;
    c.x += c.vx * h;
    c.y += c.vy * h;

    for (const coin of this.course.coins) {
      if (!coin.taken && Math.hypot(coin.x - c.x, coin.y - c.y) < CAT_R + 12) {
        coin.taken = true;
        this.coins++;
        this.events.push({ t: 'coin', c: coin });
      }
    }

    for (const p of this.course.planets) {
      if (!p.alive) continue;
      const hz = p.hazard;
      if (hz && Math.hypot(hz.x - c.x, hz.y - c.y) < hz.r + CAT_R * 0.8) {
        this.die('hazard');
        const nx = (c.x - hz.x) / (hz.r + CAT_R);
        const ny = (c.y - hz.y) / (hz.r + CAT_R);
        c.vx = nx * 240 - c.vx * 0.15;
        c.vy = ny * 240 - c.vy * 0.15;
        c.spin = 9;
        this.events.push({ t: 'bonk', x: (c.x + hz.x) / 2, y: (c.y + hz.y) / 2 });
        return;
      }
      if (p === c.from && c.flyT < 0.35) continue;
      const dx = c.x - p.x;
      const dy = c.y - p.y;
      if (dx * dx + dy * dy < (p.r + CAT_R) ** 2) {
        this.land(p);
        return;
      }
    }
  }

  private land(p: Planet): void {
    const c = this.cat;
    const sp = Math.hypot(c.vx, c.vy) || 1;
    const dirX = c.vx / sp;
    const dirY = c.vy / sp;
    const b = Math.abs((p.x - c.x) * dirY - (p.y - c.y) * dirX);
    const acc = clamp(b / (p.r + CAT_R), 0, 1);
    const ang = Math.atan2(c.y - p.y, c.x - p.x);
    c.local = ang - p.angle;
    c.state = 'ground';
    c.planet = p;
    c.vx = c.vy = 0;
    this.placeOnPlanet();

    let pts = 0;
    let gained = 0;
    let perfect = false;
    const back = p.idx <= this.maxIdx;
    if (!back) {
      gained = p.idx - this.maxIdx;
      this.maxIdx = p.idx;
      perfect = acc < PERFECT_ACC;
      pts = gained + (gained >= 2 ? gained - 1 : 0);
      const wasFever = this.fever;
      if (perfect) {
        this.combo++;
        this.perfects++;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        pts += this.combo >= FEVER_COMBO ? 2 : 1;
      } else {
        this.combo = 0;
      }
      this.fever = this.combo >= FEVER_COMBO;
      if (this.fever !== wasFever) this.events.push({ t: 'fever', on: this.fever });
      this.score += pts;
      const z = zoneIndexFor(this.score);
      if (z > this.zone) {
        this.zone = z;
        this.events.push({ t: 'zone', zone: z });
      }
    } else {
      this.combo = 0;
      if (this.fever) {
        this.fever = false;
        this.events.push({ t: 'fever', on: false });
      }
    }

    this.fuse = p.fuseMax;
    this.tickAcc = 0;
    this.events.push({
      t: 'land',
      p,
      perfect,
      acc,
      pts,
      combo: this.combo,
      gained,
      back,
      x: c.x,
      y: c.y,
      nx: Math.cos(ang),
      ny: Math.sin(ang),
    });
  }

  private popPlanet(): void {
    const c = this.cat;
    const p = c.planet;
    if (!p) return;
    p.alive = false;
    this.events.push({ t: 'pop', p });
    const a = this.catAngle;
    c.planet = null;
    c.state = 'dead';
    c.vx = Math.cos(a) * 160;
    c.vy = Math.sin(a) * 160;
    c.spin = 3;
    this.die('fuse');
  }

  private checkMiss(): void {
    const c = this.cat;
    const off =
      c.x < -60 ||
      c.x > W + 60 ||
      c.y > this.camY + this.viewH + 80 ||
      c.flyT > 3.2 ||
      (c.y < this.camY - 120 && !this.rayHitsAnything());
    if (!off) return;
    // Near miss: the flight line passed close to an unvisited planet.
    const sp = Math.hypot(c.vx, c.vy) || 1;
    const dx = c.vx / sp;
    const dy = c.vy / sp;
    let near = false;
    for (const p of this.course.planets) {
      if (!p.alive || p.idx <= this.maxIdx) continue;
      const ox = p.x - (c.from ? c.from.x : c.x);
      const oy = p.y - (c.from ? c.from.y : c.y);
      const t = ox * dx + oy * dy;
      if (t <= 0) continue;
      const b = Math.abs(ox * dy - oy * dx);
      if (b < (p.r + CAT_R) * 1.55) near = true;
    }
    this.nearMiss = near;
    c.state = 'dead';
    c.spin = 1.4 * (Math.random() < 0.5 ? -1 : 1);
    c.vx *= 0.35;
    c.vy *= 0.35;
    this.die('miss');
  }

  private rayHitsAnything(): boolean {
    const c = this.cat;
    const sp = Math.hypot(c.vx, c.vy) || 1;
    const dx = c.vx / sp;
    const dy = c.vy / sp;
    for (const p of this.course.planets) {
      if (!p.alive || p === c.from) continue;
      const ox = p.x - c.x;
      const oy = p.y - c.y;
      const t = ox * dx + oy * dy;
      if (t <= 0) continue;
      if (Math.abs(ox * dy - oy * dx) < p.r + CAT_R + p.moveAmp) return true;
    }
    return false;
  }

  private die(cause: DeathCause): void {
    if (this.over) return;
    this.over = true;
    this.cause = cause;
    this.cat.state = 'dead';
    if (this.fever) {
      this.fever = false;
      this.events.push({ t: 'fever', on: false });
    }
    this.events.push({ t: 'death', cause, nearMiss: this.nearMiss });
  }

  private placeOnPlanet(): void {
    const c = this.cat;
    const p = c.planet;
    if (!p) return;
    const a = p.angle + c.local;
    c.x = p.x + Math.cos(a) * (p.r + CAT_R);
    c.y = p.y + Math.sin(a) * (p.r + CAT_R);
    c.rot = a + Math.PI / 2;
  }

  private cameraTarget(): number {
    const c = this.cat;
    if (c.state === 'ground' && c.planet) return c.planet.y - this.viewH * 0.66;
    return this.camY;
  }

  private updateCamera(dt: number): void {
    const c = this.cat;
    let target = this.cameraTarget();
    if (c.state === 'fly') target = Math.min(target, c.y - this.viewH * 0.42);
    if (c.state === 'dead') target = this.camY;
    const k = 1 - Math.exp(-dt * 4.5);
    this.camY += (target - this.camY) * k;
  }
}
