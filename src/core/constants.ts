/** Logical world width. Everything in the game is laid out in these units. */
export const W = 360;
/** Cat body radius (the cat stands with its feet on the planet surface). */
export const CAT_R = 15;
/** Flight speed in units per second. */
export const CAT_SPEED = 620;
/** Impact parameter (0 = dead center) below which a landing counts as PERFECT. */
export const PERFECT_ACC = 0.36;
/** Consecutive perfects needed to enter FEVER. */
export const FEVER_COMBO = 5;
/** Planets before the first one that has a fuse. */
export const FUSE_FROM = 5;

export const TAU = Math.PI * 2;

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const wrapAngle = (a: number): number => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
