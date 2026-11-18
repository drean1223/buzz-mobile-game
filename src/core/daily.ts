import { hashString } from './rng.ts';

/** Day #1 of the daily stage (JST). */
const LAUNCH_UTC = Date.UTC(2026, 10, 18);

/** Calendar date in Japan, e.g. "2026-11-18". Everyone in Japan shares the same daily stage. */
export function jstDateKey(now = Date.now()): string {
  return new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
}

export function dailyNumber(key = jstDateKey()): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.max(1, Math.floor((Date.UTC(y, m - 1, d) - LAUNCH_UTC) / 86_400_000) + 1);
}

export function dailySeed(key = jstDateKey()): number {
  return hashString('hoshineko-daily-' + key) || 1;
}

export function shortDate(key: string): string {
  const [, m, d] = key.split('-').map(Number);
  return `${m}/${d}`;
}
