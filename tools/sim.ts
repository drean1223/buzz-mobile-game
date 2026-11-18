/**
 * Headless difficulty check: a "human-like" bot plays many runs with a given
 * timing error (seconds, std dev) and we print the score distribution.
 *
 *   node tools/sim.ts [sigma=0.05] [runs=300]
 */
import { Sim, STEP } from '../src/core/sim.ts';
import type { DeathCause } from '../src/core/sim.ts';
import { CAT_R, CAT_SPEED, TAU, wrapAngle } from '../src/core/constants.ts';
import type { Planet } from '../src/core/world.ts';

function gauss(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

function predictX(p: Planet, t: number): number {
  if (p.kind !== 'moving') return p.x;
  return p.baseX + p.moveAmp * Math.sin((TAU * t) / p.movePeriod + p.movePhase);
}

function hazardBlocks(sim: Sim, from: Planet, dirA: number, target: Planet): boolean {
  const dx = Math.cos(dirA);
  const dy = Math.sin(dirA);
  const sx = sim.cat.x;
  const sy = sim.cat.y;
  for (const p of [from, target]) {
    const h = p.hazard;
    if (!h) continue;
    for (let t = 0; t < 0.6; t += 1 / 240) {
      const cx = sx + dx * CAT_SPEED * t;
      const cy = sy + dy * CAT_SPEED * t;
      const txp = predictX(target, sim.time + t);
      if (Math.hypot(cx - txp, cy - target.y) < target.r + CAT_R) break;
      const px = predictX(p, sim.time + t);
      const a = h.angle + h.omega * t;
      const hx = px + Math.cos(a) * h.orbitR;
      const hy = p.y + Math.sin(a) * h.orbitR;
      if (Math.hypot(hx - cx, hy - cy) < h.r + CAT_R + 4) return true;
    }
  }
  return false;
}

export function runBot(seed: number, sigma: number, maxTime = 900) {
  const sim = new Sim(seed, 700);
  const dt = STEP;
  let eps = gauss() * sigma;
  let prevTta = Infinity;
  let pressAt = -1;
  let onPlanetT = 0;
  let lastPlanet: Planet | null = null;
  while (!sim.over && sim.time < maxTime) {
    const c = sim.cat;
    if (c.state === 'ground' && c.planet) {
      if (c.planet !== lastPlanet) {
        lastPlanet = c.planet;
        onPlanetT = 0;
        prevTta = Infinity;
        pressAt = -1;
        eps = gauss() * sigma;
      }
      onPlanetT += dt;
      const p = c.planet;
      const target = sim.nextPlanet;
      if (target) {
        let tx = target.x;
        for (let k = 0; k < 3; k++) {
          const dist = Math.hypot(tx - p.x, target.y - p.y) - p.r - target.r;
          tx = predictX(target, sim.time + Math.max(0, dist) / CAT_SPEED);
        }
        const desired = Math.atan2(target.y - p.y, tx - p.x);
        const s = Math.sign(p.omega) || 1;
        let lead = wrapAngle(desired - sim.catAngle) * s;
        if (lead < 0) lead += TAU;
        const tta = lead / Math.abs(p.omega || 1);
        let press = false;
        if (pressAt >= 0 && sim.time >= pressAt) press = true;
        const wrapped = tta > prevTta + 0.5;
        if (eps <= 0 && onPlanetT > 0.15 && ((tta <= -eps && prevTta > -eps) || wrapped)) press = true;
        if (eps > 0 && wrapped && pressAt < 0) pressAt = sim.time + eps;
        prevTta = tta;
        if (press) {
          if (hazardBlocks(sim, p, sim.catAngle, target)) {
            pressAt = -1;
          } else {
            sim.jump();
            pressAt = -1;
          }
        }
      }
    }
    sim.step();
    sim.events.length = 0;
  }
  return { fallbacks: sim.course.fallbacks, score: sim.score, idx: sim.maxIdx, cause: sim.cause, time: sim.time, perfects: sim.perfects, maxCombo: sim.maxCombo, coins: sim.coins, jumps: sim.jumps };
}

const isMain = process.argv[1] && process.argv[1].endsWith('sim.ts');
if (isMain) {
  const sigma = Number(process.argv[2] ?? 0.05);
  const runs = Number(process.argv[3] ?? 300);
  const res: ReturnType<typeof runBot>[] = [];
  for (let i = 0; i < runs; i++) res.push(runBot(1000 + i * 7919, sigma));
  const scores = res.map((r) => r.score).sort((a, b) => a - b);
  const q = (f: number) => scores[Math.min(scores.length - 1, Math.floor(f * scores.length))];
  const causes: Record<string, number> = {};
  for (const r of res) causes[r.cause as DeathCause] = (causes[r.cause as DeathCause] ?? 0) + 1;
  const avg = (k: 'time' | 'perfects' | 'coins' | 'jumps' | 'idx') => (res.reduce((s, r) => s + r[k], 0) / res.length).toFixed(1);
  console.log(`sigma=${sigma}s runs=${runs}`);
  console.log(`score p10=${q(0.1)} p25=${q(0.25)} median=${q(0.5)} p75=${q(0.75)} p90=${q(0.9)} max=${scores[scores.length - 1]}`);
  console.log(`avg time=${avg('time')}s planets=${avg('idx')} perfects=${avg('perfects')} coins=${avg('coins')} jumps=${avg('jumps')}`);
  console.log('death causes', causes, 'fallbacks/run', (res.reduce((s, r) => s + r.fallbacks, 0) / res.length).toFixed(2));
}
