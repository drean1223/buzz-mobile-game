import { RNG } from './rng.ts';
import { W, CAT_R, TAU, FUSE_FROM, clamp, lerp, wrapAngle } from './constants.ts';
import { dcos, dsin, dhypot, datan2, dasin } from './dmath.ts';

export type PlanetKind = 'start' | 'normal' | 'moving' | 'fast' | 'wobble';

export interface Crater {
  a: number;
  d: number;
  s: number;
}

export interface Hazard {
  orbitR: number;
  angle: number;
  omega: number;
  r: number;
  x: number;
  y: number;
}

export interface Planet {
  idx: number;
  x: number;
  y: number;
  baseX: number;
  r: number;
  angle: number;
  omega: number;
  omega0: number;
  kind: PlanetKind;
  hue: number;
  moveAmp: number;
  movePeriod: number;
  movePhase: number;
  wobblePhase: number;
  fuseMax: number;
  craters: Crater[];
  style: number;
  /** Rare rainbow planet: bonus points and stars. */
  rare: boolean;
  alive: boolean;
  hazard: Hazard | null;
}

export interface Coin {
  x: number;
  y: number;
  taken: boolean;
  phase: number;
}

/** 0 → 1 difficulty curve by planet index. */
export function difficulty(i: number): number {
  const x = clamp((i - 3) / 120, 0, 1);
  // (1 - x)^1.5 with sqrt only: pow() is not bit-exact across engines.
  return 1 - (1 - x) * Math.sqrt(1 - x);
}

function flipSpin(p: Planet): void {
  p.omega0 = -p.omega0;
  p.omega = -p.omega;
  const h = p.hazard;
  if (h && Math.abs(h.omega - p.omega0) < 1.0) h.omega = -h.omega;
}

const NORMAL_HUES = [42, 95, 150, 200, 28, 325, 260, 175];

/**
 * The course: an endless, seeded column of spinning planets.
 * Pure logic, no DOM, so it can be simulated headlessly.
 */
export class Course {
  readonly rng: RNG;
  planets: Planet[] = [];
  coins: Coin[] = [];
  private last: Planet;
  /** Debug counter: how often generation had to fall back. */
  fallbacks = 0;

  constructor(seed: number) {
    this.rng = new RNG(seed);
    const start = this.makePlanet(0, W / 2, 0, 62, 'start', 1.5 * this.rng.sign());
    this.planets.push(start);
    this.last = start;
  }

  get lastPlanet(): Planet {
    return this.last;
  }

  /** Make sure planets exist up to (and a bit beyond) world y = yTop. */
  ensure(yTop: number): void {
    let guard = 0;
    while (this.last.y > yTop - 260 && guard++ < 50) this.addNext();
  }

  /** Drop planets/coins far below the view to keep the arrays small. */
  cull(yBottom: number, keep: Planet | null): void {
    this.planets = this.planets.filter((p) => p === keep || p.y - p.r < yBottom + 400);
    this.coins = this.coins.filter((c) => !c.taken && c.y < yBottom + 400);
  }

  update(dt: number, time: number): void {
    for (const p of this.planets) {
      if (p.kind === 'wobble') {
        p.omega = p.omega0 * (1 + 0.62 * dsin(time * 2.1 + p.wobblePhase));
      }
      p.angle += p.omega * dt;
      if (p.kind === 'moving') {
        p.x = p.baseX + p.moveAmp * dsin((TAU * time) / p.movePeriod + p.movePhase);
      }
      const h = p.hazard;
      if (h) {
        h.angle += h.omega * dt;
        h.x = p.x + dcos(h.angle) * h.orbitR;
        h.y = p.y + dsin(h.angle) * h.orbitR;
      }
    }
  }

  private makePlanet(idx: number, x: number, y: number, r: number, kind: PlanetKind, omega: number): Planet {
    const rng = this.rng;
    const craters: Crater[] = [];
    const n = rng.int(3, 5);
    for (let k = 0; k < n; k++) {
      craters.push({ a: rng.range(0, TAU), d: rng.range(0.15, 0.68), s: rng.range(0.1, 0.22) });
    }
    let hue = rng.pick(NORMAL_HUES) + rng.range(-12, 12);
    if (kind === 'fast') hue = 350;
    if (kind === 'moving') hue = 186;
    if (kind === 'wobble') hue = 280;
    if (kind === 'start') hue = 210;
    return {
      idx,
      x,
      y,
      baseX: x,
      r,
      angle: rng.range(0, TAU),
      omega,
      omega0: omega,
      kind,
      hue,
      moveAmp: 0,
      movePeriod: 3,
      movePhase: 0,
      wobblePhase: rng.range(0, TAU),
      fuseMax: Infinity,
      craters,
      style: rng.int(0, 2),
      rare: false,
      alive: true,
      hazard: null,
    };
  }

  private addNext(): void {
    const prev = this.last;
    const i = prev.idx + 1;
    const d = difficulty(i);
    const rng = this.rng;

    for (let attempt = 0; attempt < 16; attempt++) {
      let kind: PlanetKind = 'normal';
      const roll = rng.next();
      if (i >= 7 && roll < 0.2 + 0.12 * d) kind = 'moving';
      else if (i >= 13 && roll < 0.36 + 0.12 * d) kind = 'fast';
      else if (i >= 21 && roll < 0.5 + 0.1 * d) kind = 'wobble';

      let r = i <= 3 ? rng.range(50, 58) : clamp(lerp(54, 27, d) * rng.range(0.86, 1.14), 24, 62);
      const gap = i <= 3 ? rng.range(62, 82) : lerp(74, 150, d) * rng.range(0.85, 1.15);

      // Guarantee a fair timing window from the previous planet's spin:
      // the farther / smaller the target, the shorter the window.
      const prevSpin = Math.abs(prev.omega0) * (prev.kind === 'wobble' ? 1.45 : 1);
      const minWin = i <= 5 ? 0.55 : lerp(0.42, 0.12, d);
      const sinHalf = dsin(Math.min(1.2, (minWin * prevSpin) / 2));
      const minGap = 46;
      if ((r + CAT_R) / sinHalf < prev.r + r + minGap) {
        r = (prev.r + minGap - CAT_R / sinHalf) / (1 / sinHalf - 1);
        if (r > 66) continue;
      }
      let dist = Math.min(prev.r + r + gap, (r + CAT_R) / sinHalf);
      const moveAmp = kind === 'moving' ? rng.range(32, lerp(55, 90, d)) : 0;
      const margin = r + CAT_R * 2 + 6 + moveAmp;
      const minX = margin;
      const maxX = W - margin;
      if (minX > maxX) continue;

      let x = rng.range(minX, maxX);
      let dx = x - prev.baseX;
      const maxDx = dist * 0.8;
      if (Math.abs(dx) > maxDx) {
        dx = Math.sign(dx) * maxDx;
        x = prev.baseX + dx;
      }
      if (x < minX || x > maxX) {
        x = clamp(x, minX, maxX);
        dx = x - prev.baseX;
      }
      const dy = Math.sqrt(Math.max(dist * dist - dx * dx, (dist * 0.5) * (dist * 0.5)));
      const y = prev.y - dy;
      dist = dhypot(dx, dy);

      const win = (2 * dasin(Math.min(1, (r + CAT_R) / dist))) / prevSpin;
      if (win < minWin * 0.98) continue;

      // Keep clear of nearby planets (including their movement range).
      let ok = true;
      for (let k = Math.max(0, this.planets.length - 4); k < this.planets.length; k++) {
        const q = this.planets[k];
        // Closest the two can get while sliding horizontally.
        const hd = Math.max(0, Math.abs(q.baseX - x) - q.moveAmp - moveAmp);
        if (dhypot(hd, q.y - y) < q.r + r + CAT_R * 2 + 12) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      let spin = (i <= 5 ? 1.5 : lerp(1.7, 3.2, d)) * rng.range(0.9, 1.1);
      if (kind === 'fast') spin *= 1.45;
      const p = this.makePlanet(i, x, y, r, kind, spin * rng.sign());

      // Pick the previous planet's spin direction so that, after landing there, the cat
      // usually swings toward this planet the short way round. Keeps the pace snappy.
      const pp = this.planets.length >= 2 ? this.planets[this.planets.length - 2] : null;
      const landA = pp ? datan2(pp.y - prev.y, pp.baseX - prev.baseX) : -Math.PI / 2;
      const delta = wrapAngle(datan2(y - prev.y, x - prev.baseX) - landA);
      const shortSign = delta >= 0 ? 1 : -1;
      const want = rng.chance(i <= 6 ? 0.92 : lerp(0.8, 0.6, d)) ? shortSign : -shortSign;
      if (Math.sign(prev.omega0) !== want) flipSpin(prev);

      if (kind === 'moving') {
        p.moveAmp = moveAmp;
        p.movePeriod = rng.range(lerp(4.2, 2.6, d), lerp(5.2, 3.4, d));
        p.movePhase = rng.range(0, TAU);
      }

      const rotation = TAU / spin;
      if (i >= FUSE_FROM) {
        p.fuseMax = Math.max(lerp(6.5, 2.8, d), rotation * 1.25 + 0.6);
      }

      if (i >= 17 && kind !== 'moving' && rng.chance(0.14 + 0.16 * d)) {
        let hw = lerp(1.0, 2.0, d) * rng.sign();
        if (Math.abs(hw - p.omega0) < 1.0) hw = -hw;
        if (Math.abs(hw - p.omega0) < 1.0) hw += Math.sign(hw) * 1.0;
        p.hazard = { orbitR: r + CAT_R * 2 + 13, angle: rng.range(0, TAU), omega: hw, r: 9, x: 0, y: 0 };
        p.fuseMax = Math.max(p.fuseMax, rotation * 2.2 + 0.6);
        // The asteroid can block the approach too: give the previous planet two chances.
        if (Number.isFinite(prev.fuseMax)) {
          prev.fuseMax = Math.max(prev.fuseMax, (TAU / Math.abs(prev.omega0)) * 2.2 + 0.6);
        }
      }

      if (i >= 8 && kind === 'normal' && !p.hazard && rng.chance(0.04)) p.rare = true;

      // Coins on the straight line between the planets reward center shots.
      if (i > 1 && rng.chance(0.55)) {
        const ux = (x - prev.baseX) / dist;
        const uy = (y - prev.y) / dist;
        const free = dist - prev.r - r;
        const pattern = i > 10 && rng.chance(0.18) ? [0.28, 0.5, 0.72] : [0.5];
        for (const f of pattern) {
          const s = prev.r + free * f;
          this.coins.push({ x: prev.baseX + ux * s, y: prev.y + uy * s, taken: false, phase: rng.range(0, TAU) });
        }
      }

      this.planets.push(p);
      this.last = p;
      return;
    }

    this.fallbacks++;
    // Fallback: an easy planet straight above.
    const r = 48;
    const p = this.makePlanet(i, W / 2, prev.y - (prev.r + r + 90), r, 'normal', 1.4 * rng.sign());
    if (i >= FUSE_FROM) p.fuseMax = 6;
    this.planets.push(p);
    this.last = p;
  }
}
