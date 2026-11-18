import { runReplay, dailySeed, jstDateKey, STEP } from './deps.ts';
import type { Replay, ReplayResult } from './deps.ts';

export interface Submission {
  day: string;
  player: string;
  name: string;
  skin: string;
  replay: Replay;
}

export type Checked = { ok: true; sub: Submission; result: ReplayResult } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PER_SEC = Math.round(1 / STEP);

const int = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

/** Control, zero-width and bidi characters are dropped from names. */
const hidden = (c: number) => c < 0x20 || (c >= 0x7f && c <= 0x9f) || (c >= 0x200b && c <= 0x200f) || (c >= 0x2028 && c <= 0x202e) || (c >= 0x2060 && c <= 0x206f) || c === 0xfeff;

export function cleanName(n: unknown): string | null {
  if (typeof n !== 'string') return null;
  const s = [...n.normalize('NFKC')]
    .filter((ch) => !hidden(ch.codePointAt(0) ?? 0))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = [...s].slice(0, 12);
  return chars.length ? chars.join('') : null;
}

/** Validate a score submission and re-run its replay. `now` is injectable for tests. */
export function check(body: unknown, now = Date.now()): Checked {
  if (!body || typeof body !== 'object') return { ok: false, error: 'bad body' };
  const b = body as Record<string, unknown>;
  const day = b.day;
  // Today in Japan, or yesterday for runs that ended just after midnight.
  if (typeof day !== 'string' || (day !== jstDateKey(now) && day !== jstDateKey(now - 30 * 60_000))) return { ok: false, error: 'bad day' };
  if (typeof b.player !== 'string' || !UUID.test(b.player)) return { ok: false, error: 'bad player' };
  const name = cleanName(b.name);
  if (!name) return { ok: false, error: 'bad name' };
  const skin = typeof b.skin === 'string' && /^[a-z]{1,16}$/.test(b.skin) ? b.skin : 'shiro';
  const r = b.replay as Replay | undefined;
  if (!r || r.v !== 1 || r.seed !== dailySeed(day)) return { ok: false, error: 'bad replay' };
  if (typeof r.viewH !== 'number' || !(r.viewH >= 400 && r.viewH <= 1400)) return { ok: false, error: 'bad view' };
  if (!int(r.idle, 0, PER_SEC * 130)) return { ok: false, error: 'bad idle' };
  if (!Array.isArray(r.jumps) || r.jumps.length > 4000 || !r.jumps.every((d) => int(d, 0, PER_SEC * 30))) return { ok: false, error: 'bad jumps' };
  const total = r.jumps.reduce((a, d) => a + d, 0);
  if (total > PER_SEC * 60 * 40) return { ok: false, error: 'too long' };
  const replay: Replay = { v: 1, seed: r.seed, viewH: r.viewH, idle: r.idle, jumps: r.jumps };
  const result = runReplay(replay);
  if (!result.over || result.badJumps > 0) return { ok: false, error: 'replay did not verify' };
  return { ok: true, sub: { day, player: b.player.toLowerCase(), name, skin, replay }, result };
}
