/**
 * Deterministic math for the simulation.
 *
 * JavaScript only guarantees + - * / and sqrt to be bit-exact. Math.sin, cos,
 * atan2, exp, pow... may differ in the last bit between engines (and even
 * between Chrome and Node versions), and over a long run such a difference can
 * grow until a landing or a PERFECT flips. Replays must give the same result on
 * every phone and on the server, so the core uses these instead. They are the
 * classic fdlibm kernels, written with plain arithmetic only.
 */

const PIO2_1 = 1.5707963267341256; // first 33 bits of pi/2
const PIO2_1T = 6.077100506506192e-11; // pi/2 - PIO2_1
const INV_PIO2 = 0.6366197723675814;
const PI = 3.141592653589793;
const PI_LO = 1.2246467991473532e-16;

function kSin(x: number): number {
  const z = x * x;
  const r = -1.6666666666666632e-1 + z * (8.33333333332249e-3 + z * (-1.984126982985795e-4 + z * (2.7557313707070068e-6 + z * (-2.5050760253406863e-8 + z * 1.58969099521155e-10))));
  return x + x * z * r;
}

function kCos(x: number): number {
  const z = x * x;
  const r = z * (4.1666666666666602e-2 + z * (-1.388888888887411e-3 + z * (2.480158728947673e-5 + z * (-2.7557314351390663e-7 + z * (2.087572321298175e-9 + z * -1.1359647557788195e-11)))));
  const hz = 0.5 * z;
  const w = 1 - hz;
  return w + (1 - w - hz + z * r);
}

/** Reduce x to y in [-pi/4, pi/4] and quadrant n. Good for |x| up to ~1e6. */
function reduce(x: number): [number, number] {
  const n = Math.round(x * INV_PIO2);
  const y = x - n * PIO2_1 - n * PIO2_1T;
  return [y, n & 3];
}

export function dsin(x: number): number {
  const [y, q] = reduce(x);
  switch (q) {
    case 0:
      return kSin(y);
    case 1:
      return kCos(y);
    case 2:
      return -kSin(y);
    default:
      return -kCos(y);
  }
}

export function dcos(x: number): number {
  const [y, q] = reduce(x);
  switch (q) {
    case 0:
      return kCos(y);
    case 1:
      return -kSin(y);
    case 2:
      return -kCos(y);
    default:
      return kSin(y);
  }
}

const ATANHI = [4.6364760900080609e-1, 7.8539816339744828e-1, 9.8279372324732905e-1, 1.5707963267948966];
const ATANLO = [2.2698777452961687e-17, 3.061616997868383e-17, 1.3903311031230998e-17, 6.123233995736766e-17];
const AT = [
  3.333333333333293e-1, -1.9999999999876483e-1, 1.4285714272503466e-1, -1.1111110405462356e-1, 9.090887133436507e-2, -7.691876205044830e-2,
  6.661073137387531e-2, -5.833570133790573e-2, 4.976877994615932e-2, -3.6531572744216916e-2, 1.6285820115365782e-2,
];

/** atan(x) for x >= 0. */
function atanPos(x: number): number {
  let id = -1;
  if (x >= 2.4375) {
    id = 3;
    x = -1 / x;
  } else if (x >= 1.1875) {
    id = 2;
    x = (x - 1.5) / (1 + 1.5 * x);
  } else if (x >= 0.6875) {
    id = 1;
    x = (x - 1) / (x + 1);
  } else if (x >= 0.4375) {
    id = 0;
    x = (2 * x - 1) / (2 + x);
  }
  const z = x * x;
  const w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) return x - x * (s1 + s2);
  return ATANHI[id] - (x * (s1 + s2) - ATANLO[id] - x);
}

export function datan(x: number): number {
  return x < 0 ? -atanPos(-x) : atanPos(x);
}

export function datan2(y: number, x: number): number {
  if (x === 0) return y > 0 ? PI / 2 : y < 0 ? -PI / 2 : 0;
  if (y === 0) return x > 0 ? 0 : PI;
  const ay = Math.abs(y);
  const ax = Math.abs(x);
  // atan(ay/ax) loses nothing for the ranges a game produces.
  const a = ay > ax * 1e300 ? PI / 2 : atanPos(ay / ax);
  if (x > 0) return y > 0 ? a : -a;
  const b = PI - (a - PI_LO);
  return y > 0 ? b : -b;
}

/** sqrt is exactly rounded by IEEE 754, so this is deterministic. */
export function dhypot(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export function dasin(x: number): number {
  return datan2(x, Math.sqrt(Math.max(0, 1 - x * x)));
}
