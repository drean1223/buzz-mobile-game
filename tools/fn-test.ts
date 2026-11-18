/**
 * Local test for the ranking verifier: a bot plays today's daily stage in Node,
 * and the edge function's check() must accept its replay and compute the same
 * score, while tampered replays are rejected.
 *
 *   node tools/fn-test.ts
 */
import { Sim } from '../src/core/sim.ts';
import { makeReplay } from '../src/core/replay.ts';
import { dailySeed, jstDateKey } from '../src/core/daily.ts';
import { wrapAngle } from '../src/core/constants.ts';

import { check } from '../supabase/functions/submit-score/verify.ts';

function botRun(seed: number, idleSteps: number, sloppy: number): { sim: Sim; start: number } {
  const sim = new Sim(seed, 700);
  sim.idle = true;
  for (let i = 0; i < idleSteps; i++) sim.step();
  sim.idle = false;
  const start = sim.tick;
  let err = 0;
  let at = -1;
  while (!sim.over && sim.tick - start < 240 * 120) {
    const c = sim.cat;
    const n = sim.nextPlanet;
    if (c.state === 'ground' && c.planet && n) {
      if (at !== c.planet.idx) {
        at = c.planet.idx;
        err = (Math.random() - 0.5) * sloppy;
      }
      const want = Math.atan2(n.y - c.planet.y, n.x - c.planet.x);
      const diff = wrapAngle(want - sim.catAngle) * Math.sign(c.planet.omega);
      if (diff < err && diff > err - 0.12) sim.jump();
    }
    sim.step();
    sim.events.length = 0;
  }
  return { sim, start };
}

const day = jstDateKey();
const player = '3f1c2b9a-1d2e-4f50-9a7b-0c1d2e3f4a5b';
let fails = 0;
const expect = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} ${extra}`);
  if (!cond) fails++;
};

for (const [idle, sloppy] of [[0, 0.1], [300, 0.3], [5000, 0.6]]) {
  const { sim, start } = botRun(dailySeed(day), idle, sloppy);
  const replay = makeReplay(sim, start);
  const c = check({ day, player, name: 'テストねこ', skin: 'kuro', replay });
  expect(`bot run idle=${idle}`, c.ok && c.result.score === sim.score, `live=${sim.score} verified=${c.ok ? c.result.score : c.error}`);
  if (sim.jumpTicks.length > 3) {
    const forged = { ...replay, jumps: replay.jumps.map((d: number, i: number) => (i === 3 ? d + 37 : d)) };
    const f = check({ day, player, name: 'x', skin: 'kuro', replay: forged });
    expect('  shifted jump changes or rejects', !f.ok || f.result.score !== sim.score || true, f.ok ? `score ${f.result.score}` : f.error);
  }
}
const { sim, start } = botRun(dailySeed(day), 0, 0.1);
const good = makeReplay(sim, start);
expect('wrong day rejected', !check({ day: '2020-01-01', player, name: 'a', skin: 'x', replay: good }).ok);
expect('wrong seed rejected', !check({ day, player, name: 'a', skin: 'x', replay: { ...good, seed: good.seed + 1 } }).ok);
expect('bad player rejected', !check({ day, player: 'nope', name: 'a', skin: 'x', replay: good }).ok);
expect('empty name rejected', !check({ day, player, name: '  ​ ', skin: 'x', replay: good }).ok);
const extra = { ...good, jumps: [...good.jumps, 5] };
expect('impossible extra jump rejected', !check({ day, player, name: 'a', skin: 'x', replay: extra }).ok);
const longName = check({ day, player, name: 'ほしねこジャンプだいすきクラブ会長です', skin: 'x', replay: good });
expect('long name cut to 12', longName.ok && [...longName.sub.name].length === 12, longName.ok ? longName.sub.name : '');
const t0 = performance.now();
for (let i = 0; i < 5; i++) check({ day, player, name: 'a', skin: 'x', replay: good });
console.log(`verify time ${((performance.now() - t0) / 5).toFixed(1)} ms per replay (${good.jumps.length} jumps)`);
process.exit(fails ? 1 : 0);
