import { Sim } from './sim.ts';
import type { DeathCause } from './sim.ts';

/**
 * Everything needed to re-run a play exactly: the course seed, the view height
 * (it decides when a fly-away counts as a miss), how many steps the cat idled
 * on the title screen, and the steps at which the player jumped.
 */
export interface Replay {
  v: 1;
  seed: number;
  viewH: number;
  /** Steps spent idling on the title screen before the run started. */
  idle: number;
  /** Jump steps, each relative to the previous jump (the first to the run start). */
  jumps: number[];
}

export interface ReplayResult {
  score: number;
  maxIdx: number;
  perfects: number;
  maxCombo: number;
  coins: number;
  jumps: number;
  over: boolean;
  cause: DeathCause | null;
  /** Steps from the run start to the end. */
  steps: number;
  /** Jumps that were not possible at their step (a sign of a forged replay). */
  badJumps: number;
}

export function encodeJumps(ticks: number[], start: number): number[] {
  const out: number[] = [];
  let prev = start;
  for (const t of ticks) {
    out.push(t - prev);
    prev = t;
  }
  return out;
}

export function makeReplay(sim: Sim, runStart: number): Replay {
  return { v: 1, seed: sim.seed, viewH: sim.viewH, idle: runStart, jumps: encodeJumps(sim.jumpTicks.filter((t) => t >= runStart), runStart) };
}

/** Longest run we are willing to simulate (steps after the last jump). */
const AFTER_LAST_JUMP = 240 * 20;

export function runReplay(r: Replay): ReplayResult {
  const sim = new Sim(r.seed, r.viewH);
  sim.idle = true;
  for (let i = 0; i < r.idle; i++) {
    sim.step();
    sim.events.length = 0;
  }
  sim.idle = false;
  const start = sim.tick;
  const at: number[] = [];
  let t = start;
  for (const d of r.jumps) at.push((t += d));
  const limit = t + AFTER_LAST_JUMP;
  let j = 0;
  let bad = 0;
  while (!sim.over && sim.tick < limit) {
    while (j < at.length && at[j] <= sim.tick) {
      if (at[j] < sim.tick || !sim.jump()) bad++;
      j++;
    }
    sim.step();
    sim.events.length = 0;
  }
  bad += at.length - j;
  return {
    score: sim.score,
    maxIdx: sim.maxIdx,
    perfects: sim.perfects,
    maxCombo: sim.maxCombo,
    coins: sim.coins,
    jumps: sim.jumps,
    over: sim.over,
    cause: sim.cause,
    steps: sim.tick - start,
    badJumps: bad,
  };
}
