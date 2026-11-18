// Dev-only page that renders the app icons and the OGP image with the game's own drawing code.
import { drawCat, skinById } from '../src/render/cat.ts';
import { drawStar, FONT } from '../src/render/fx.ts';

function spaceBg(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0a0d2c');
  g.addColorStop(1, '#3a2380');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const n = ctx.createRadialGradient(w * 0.2, h * 0.25, 0, w * 0.2, h * 0.25, w * 0.6);
  n.addColorStop(0, 'rgba(91,68,201,0.55)');
  n.addColorStop(1, 'rgba(91,68,201,0)');
  ctx.fillStyle = n;
  ctx.fillRect(0, 0, w, h);
  let s = 7;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < (w * h) / 2500; i++) {
    ctx.globalAlpha = 0.3 + rnd() * 0.7;
    const z = (1 + rnd() * 2) * (w / 600);
    ctx.fillRect(rnd() * w, rnd() * h, z, z);
  }
  ctx.globalAlpha = 1;
}

function planet(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, hue: number): void {
  const glow = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 1.5);
  glow.addColorStop(0, `hsla(${hue},95%,70%,0.4)`);
  glow.addColorStop(1, `hsla(${hue},95%,70%,0)`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.5, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, `hsl(${hue},85%,82%)`);
  g.addColorStop(0.55, `hsl(${hue},72%,63%)`);
  g.addColorStop(1, `hsl(${hue},62%,42%)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `hsla(${hue},70%,30%,0.3)`;
  for (const [cx, cy, cr] of [[-0.4, -0.2, 0.16], [0.25, -0.45, 0.11], [0.35, 0.1, 0.13]]) {
    ctx.beginPath();
    ctx.arc(x + cx * r, y + cy * r, cr * r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function icon(size: number, maskable: boolean): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  spaceBg(ctx, size, size);
  const k = size / 512;
  const pad = maskable ? 0.8 : 1;
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.scale(pad, pad);
  ctx.translate(-size / 2, -size / 2);
  planet(ctx, size / 2, size * 1.2, size * 0.52, 268);
  ctx.fillStyle = '#ffe66b';
  drawStar(ctx, 90 * k, 110 * k, 26 * k, 0.2);
  drawStar(ctx, 420 * k, 150 * k, 18 * k, -0.3);
  ctx.save();
  ctx.translate(size / 2 - 14 * k, size * 0.7);
  ctx.scale(6.6 * k, 6.6 * k);
  drawCat(ctx, skinById('shiro'), { face: 'happy', t: 0.3, sx: 1, sy: 1 });
  ctx.restore();
  ctx.restore();
  return cv;
}

async function og(): Promise<HTMLCanvasElement> {
  await document.fonts.load(`900 100px ${FONT}`, 'ほしねこジャンプまわる星から星へ、タップでとべ！何コいける？');
  await document.fonts.load(`700 100px ${FONT}`, 'ほしねこジャンプまわる星から星へ、タップでとべ！何コいける？');
  const w = 1200;
  const h = 630;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  spaceBg(ctx, w, h);
  planet(ctx, 930, 760, 330, 268);
  planet(ctx, 1110, 110, 60, 42);
  planet(ctx, 700, 120, 38, 186);
  ctx.save();
  ctx.translate(930, 432);
  ctx.scale(7.5, 7.5);
  drawCat(ctx, skinById('shiro'), { face: 'happy', t: 0.3, sx: 1, sy: 1 });
  ctx.restore();
  ctx.fillStyle = '#ffe66b';
  drawStar(ctx, 640, 300, 22, 0.2);
  drawStar(ctx, 560, 520, 14, -0.3);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  const big = (t: string, x: number, y: number, size: number, fill: string) => {
    ctx.font = `900 ${size}px ${FONT}`;
    ctx.lineWidth = size * 0.22;
    ctx.strokeStyle = '#1b1036';
    ctx.strokeText(t, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(t, x, y);
  };
  ctx.save();
  ctx.translate(70, 0);
  ctx.rotate(-0.05);
  big('ほしねこ', 0, 175, 118, '#ffffff');
  big('ジャンプ', 0, 310, 128, '#ffd23d');
  ctx.restore();
  ctx.font = `900 40px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('まわる星から星へ、タップでとべ！', 74, 440);
  ctx.font = `700 32px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText('きみは何コまでいける？ 🐱🪐', 74, 500);
  return cv;
}

(async () => {
  const out: Record<string, string> = {};
  out['icon-512.png'] = icon(512, false).toDataURL();
  out['icon-192.png'] = icon(192, false).toDataURL();
  out['apple-touch-icon.png'] = icon(180, false).toDataURL();
  out['icon-maskable-512.png'] = icon(512, true).toDataURL();
  out['og.png'] = (await og()).toDataURL();
  (window as unknown as { __assets: Record<string, string> }).__assets = out;
  for (const [k, v] of Object.entries(out)) {
    const img = new Image();
    img.src = v;
    img.title = k;
    img.style.maxWidth = '300px';
    img.style.margin = '6px';
    document.body.append(img);
  }
})();
