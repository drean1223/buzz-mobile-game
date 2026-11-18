import { SKINS } from '../render/cat.ts';
import type { Skin, Rarity } from '../render/cat.ts';

export const GACHA_COST = 30;
export const DUPLICATE_REFUND = 10;

const RATES: [Rarity, number][] = [
  [3, 0.1],
  [2, 0.3],
  [1, 0.6],
];

export function rollGacha(owned: readonly string[], rnd = Math.random): { skin: Skin; isNew: boolean } {
  let r = rnd();
  let rarity: Rarity = 1;
  for (const [k, p] of RATES) {
    if (r < p) {
      rarity = k;
      break;
    }
    r -= p;
  }
  const pool = SKINS.filter((s) => s.rarity === rarity && s.id !== 'shiro');
  let skin = pool[Math.floor(rnd() * pool.length)];
  // Soften duplicates: one free re-roll inside the same rarity.
  if (owned.includes(skin.id)) {
    const fresh = pool.filter((s) => !owned.includes(s.id));
    if (fresh.length && rnd() < 0.6) skin = fresh[Math.floor(rnd() * fresh.length)];
  }
  return { skin, isNew: !owned.includes(skin.id) };
}
