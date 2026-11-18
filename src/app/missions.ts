import { RNG, hashString } from '../core/rng.ts';

export type MissionKind = 'perfect' | 'score' | 'coins' | 'combo' | 'zone' | 'plays' | 'skip' | 'daily';

export interface Mission {
  kind: MissionKind;
  target: number;
  progress: number;
  done: boolean;
}

export interface RunStats {
  score: number;
  perfects: number;
  coins: number;
  maxCombo: number;
  zone: number;
  skips: number;
  daily: boolean;
}

export const MISSION_REWARD = 10;
export const ALL_CLEAR_BONUS = 20;

const POOL: { kind: MissionKind; targets: number[] }[] = [
  { kind: 'perfect', targets: [10, 15, 20] },
  { kind: 'score', targets: [15, 25, 35] },
  { kind: 'coins', targets: [8, 12, 18] },
  { kind: 'combo', targets: [3, 5, 7] },
  { kind: 'zone', targets: [2, 3] },
  { kind: 'plays', targets: [3, 5] },
  { kind: 'skip', targets: [1] },
  { kind: 'daily', targets: [1] },
];

/** Three missions per JST day, the same for everyone. */
export function missionsFor(dateKey: string): Mission[] {
  const rng = new RNG(hashString('missions-' + dateKey));
  const pool = [...POOL];
  const out: Mission[] = [];
  while (out.length < 3 && pool.length) {
    const i = Math.floor(rng.next() * pool.length);
    const m = pool.splice(i, 1)[0];
    out.push({ kind: m.kind, target: rng.pick(m.targets), progress: 0, done: false });
  }
  return out;
}

export function missionLabel(m: Mission): string {
  switch (m.kind) {
    case 'perfect':
      return `PERFECTを合計${m.target}回`;
    case 'score':
      return `1回で${m.target}点以上とる`;
    case 'coins':
      return `★を合計${m.target}こ集める`;
    case 'combo':
      return `${m.target}コンボを出す`;
    case 'zone':
      return `ゾーン${m.target}までいく`;
    case 'plays':
      return `${m.target}回あそぶ`;
    case 'skip':
      return '星をとばして着地する';
    case 'daily':
      return '「きょうのステージ」をあそぶ';
  }
}

/** Apply one finished run; returns the missions completed by it. */
export function applyRun(ms: Mission[], s: RunStats): Mission[] {
  const newly: Mission[] = [];
  for (const m of ms) {
    if (m.done) continue;
    switch (m.kind) {
      case 'perfect':
        m.progress += s.perfects;
        break;
      case 'score':
        m.progress = Math.max(m.progress, s.score);
        break;
      case 'coins':
        m.progress += s.coins;
        break;
      case 'combo':
        m.progress = Math.max(m.progress, s.maxCombo);
        break;
      case 'zone':
        m.progress = Math.max(m.progress, s.zone + 1);
        break;
      case 'plays':
        m.progress += 1;
        break;
      case 'skip':
        m.progress += s.skips;
        break;
      case 'daily':
        if (s.daily) m.progress = 1;
        break;
    }
    if (m.progress >= m.target) {
      m.progress = m.target;
      m.done = true;
      newly.push(m);
    }
  }
  return newly;
}
