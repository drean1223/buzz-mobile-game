/**
 * Daily ranking and anonymous play stats (Supabase). Everything here is
 * optional: when the network is down the game just plays without it.
 */
import type { Replay } from '../core/replay.ts';

const API = 'https://kykpeeufoixvwfweabbu.supabase.co';
// Publishable key: safe to ship; the database only exposes the functions below.
const KEY = 'sb_publishable_lezB97jyebfY58jEaDAJ-g_9b9UAego';

export interface RankRow {
  rank: number;
  name: string;
  score: number;
  skin: string;
}

export interface MyRank {
  rank: number;
  total: number;
  score: number;
}

export interface SubmitResult extends MyRank {
  improved: boolean;
}

async function post<T>(path: string, body: unknown, timeout = 9000, keepalive = false): Promise<T | null> {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeout) : 0;
  try {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}` },
      body: JSON.stringify(body),
      signal: ctl?.signal,
      keepalive,
    });
    if (!res.ok) return null;
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function submitDaily(day: string, player: string, name: string, skin: string, replay: Replay): Promise<SubmitResult | null> {
  const r = await post<{ ok: boolean; score: number; rank: number; total: number; best: number; improved: boolean }>(
    '/functions/v1/submit-score',
    { day, player, name, skin, replay },
    15000,
  );
  if (!r || !r.ok || r.rank == null) return null;
  return { rank: r.rank, total: r.total, score: r.best, improved: r.improved };
}

export async function dailyTop(day: string, limit = 50): Promise<RankRow[] | null> {
  return post<RankRow[]>('/rest/v1/rpc/daily_top', { p_day: day, p_limit: limit });
}

export async function dailyMe(day: string, player: string): Promise<MyRank | null> {
  const rows = await post<MyRank[]>('/rest/v1/rpc/daily_me', { p_day: day, p_player: player });
  return rows && rows.length ? rows[0] : null;
}

export interface SessionStats {
  id: string;
  player_id: string;
  first_visit: boolean;
  source: string;
  lang: string;
  mobile: boolean;
  plays: number;
  daily_plays: number;
  best: number;
  first_score: number | null;
  total_score: number;
  shares: number;
  gacha: number;
  seconds: number;
}

export function trackSession(s: SessionStats): void {
  void post('/rest/v1/rpc/track_session', { p: s }, 8000, true);
}

export function uuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && c.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = (Math.random() * 256) | 0;
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Where this visit came from, for the stats (no personal data). */
export function visitSource(): string {
  const q = new URLSearchParams(location.search);
  if (q.has('vs')) return 'challenge';
  const ref = document.referrer;
  if (!ref) return 'direct';
  try {
    const h = new URL(ref).hostname;
    if (/(^|\.)(t\.co|x\.com|twitter\.com)$/.test(h)) return 'x';
    if (/line\.me$|line-apps|naver/.test(h)) return 'line';
    if (/tiktok/.test(h)) return 'tiktok';
    if (/instagram|facebook/.test(h)) return 'meta';
    if (/google|yahoo|bing/.test(h)) return 'search';
    if (h === location.hostname) return 'self';
    return 'other';
  } catch {
    return 'other';
  }
}
