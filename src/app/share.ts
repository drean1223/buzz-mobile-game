import { ZONES, rankFor } from '../core/zones.ts';
import { dailyNumber, shortDate } from '../core/daily.ts';
import { drawCat } from '../render/cat.ts';
import type { Skin } from '../render/cat.ts';
import { FONT, drawStar } from '../render/fx.ts';

export const GAME_NAME = 'ほしねこジャンプ';
export const HASHTAG = 'ほしねこジャンプ';

export interface RunResult {
  score: number;
  best: number;
  isRecord: boolean;
  perfects: number;
  maxCombo: number;
  coins: number;
  zone: number;
  mode: 'endless' | 'daily';
  seed: number;
  dailyKey: string;
  skin: Skin;
}

/** Public URL of the game (set VITE_PUBLIC_URL at build time for builds hosted elsewhere). */
export function baseUrl(): string {
  const env = (import.meta.env.VITE_PUBLIC_URL as string | undefined) ?? '';
  if (env) return env;
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    return location.origin + location.pathname.replace(/index\.html$/, '');
  }
  return 'https://drean1223.github.io/buzz-mobile-game/';
}

/** A link that drops a friend onto the same course with your score as the target. */
export function challengeUrl(r: RunResult): string {
  const u = new URL(baseUrl());
  u.searchParams.set('vs', String(r.score));
  if (r.mode === 'daily') u.searchParams.set('d', r.dailyKey);
  else u.searchParams.set('seed', r.seed.toString(36));
  return u.toString();
}

export function zoneBar(zone: number): string {
  return ZONES.map((z, i) => (i <= zone ? z.emoji : '⬛')).join('');
}

export function shareText(r: RunResult): string {
  const rank = rankFor(r.score);
  const head = r.mode === 'daily' ? `きょうのステージ#${dailyNumber(r.dailyKey)}（${shortDate(r.dailyKey)}）` : 'エンドレス';
  const lines = [
    `🐱${GAME_NAME} ${head}`,
    `スコア ${r.score}${r.isRecord ? ' 🏆自己ベスト！' : ''}`,
    `称号「${rank.name}」`,
    zoneBar(r.zone),
    `⭐PERFECT×${r.perfects} 🔥最大${r.maxCombo}コンボ`,
    `おなじコースで勝負👇`,
    `#${HASHTAG}`,
  ];
  return lines.join('\n');
}

export function xIntentUrl(r: RunResult): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText(r))}&url=${encodeURIComponent(challengeUrl(r))}`;
}

export function lineUrl(r: RunResult): string {
  return `https://line.me/R/share?text=${encodeURIComponent(shareText(r) + '\n' + challengeUrl(r))}`;
}

async function ensureFonts(texts: string[]): Promise<void> {
  if (!document.fonts) return;
  try {
    await Promise.race([
      Promise.all(texts.flatMap((t) => [document.fonts.load(`900 40px ${FONT}`, t), document.fonts.load(`700 40px ${FONT}`, t)])),
      new Promise((res) => setTimeout(res, 1500)),
    ]);
  } catch {
    /* fall back to system font */
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function outlinedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, stroke = 'rgba(20,10,45,0.9)', weight = 900): void {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.2;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, size: number, maxW: number, weight = 900): number {
  ctx.font = `${weight} ${size}px ${FONT}`;
  const w = ctx.measureText(text).width;
  return w > maxW ? Math.floor((size * maxW) / w) : size;
}

/** Draws the 1080×1350 result card used for image sharing. */
export async function makeShareCard(r: RunResult): Promise<HTMLCanvasElement> {
  const rank = rankFor(r.score);
  const modeLabel = r.mode === 'daily' ? `きょうのステージ #${dailyNumber(r.dailyKey)}  ${shortDate(r.dailyKey)}` : 'エンドレスモード';
  await ensureFonts([GAME_NAME, rank.name, rank.comment, modeLabel, '自己ベスト更新！称号SCOREPERFECT最大コンボ#0123456789', HASHTAG]);

  const cw = 1080;
  const ch = 1350;
  const cv = document.createElement('canvas');
  cv.width = cw;
  cv.height = ch;
  const ctx = cv.getContext('2d')!;
  const z = ZONES[r.zone];

  const bg = ctx.createLinearGradient(0, 0, 0, ch);
  bg.addColorStop(0, z.top);
  bg.addColorStop(1, z.bottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cw, ch);
  for (const [x, y, col, rr] of [
    [180, 300, z.nebula[0], 520],
    [900, 700, z.nebula[1], 560],
    [300, 1150, z.nebula[0], 420],
  ] as const) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, col + '66');
    g.addColorStop(1, col + '00');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
  }
  // Deterministic star field
  let s = r.score * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 160; i++) {
    ctx.globalAlpha = 0.3 + rnd() * 0.7;
    const sz = 1 + rnd() * 3.5;
    ctx.fillRect(rnd() * cw, rnd() * ch, sz, sz);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff6b0';
  for (let i = 0; i < 7; i++) drawStar(ctx, rnd() * cw, rnd() * 700, 8 + rnd() * 12, rnd());

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Logo
  outlinedText(ctx, GAME_NAME, cw / 2, 108, 86, '#ffffff');
  ctx.font = `700 34px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(modeLabel, cw / 2, 190);

  // Score
  ctx.font = `900 40px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText('SCORE', cw / 2, 262);
  const scoreStr = String(r.score);
  ctx.save();
  ctx.shadowColor = 'rgba(255,230,120,0.9)';
  ctx.shadowBlur = 40;
  outlinedText(ctx, scoreStr, cw / 2, 400, 230, '#ffe45c', 'rgba(60,20,0,0.85)');
  ctx.restore();

  if (r.isRecord) {
    ctx.save();
    ctx.translate(cw / 2 + 300, 300);
    ctx.rotate(0.22);
    roundRect(ctx, -150, -40, 300, 80, 40);
    ctx.fillStyle = '#ff4d7e';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.font = `900 40px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('自己ベスト！', 0, 2);
    ctx.restore();
  }

  // Planet + cat
  const px = cw / 2;
  const py = 1080;
  const pr = 290;
  const pg = ctx.createRadialGradient(px - 100, py - 120, 30, px, py, pr);
  pg.addColorStop(0, '#ffd9f2');
  pg.addColorStop(0.55, '#c08cff');
  pg.addColorStop(1, '#5a3aa8');
  const glow = ctx.createRadialGradient(px, py, pr * 0.9, px, py, pr * 1.35);
  glow.addColorStop(0, 'rgba(200,150,255,0.45)');
  glow.addColorStop(1, 'rgba(200,150,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(px, py, pr * 1.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.arc(px, py, pr, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(90,50,160,0.35)';
  for (const [cx, cy, cr] of [
    [-120, -150, 40],
    [90, -200, 28],
    [160, -90, 34],
  ]) {
    ctx.beginPath();
    ctx.arc(px + cx, py + cy, cr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  ctx.translate(px, py - pr + 4);
  ctx.scale(6.2, 6.2);
  drawCat(ctx, r.skin, { face: r.score >= 10 ? 'happy' : 'blank', t: 0.6, sx: 1, sy: 1 });
  ctx.restore();

  // Title panel
  roundRect(ctx, 90, 905, cw - 180, 190, 36);
  ctx.fillStyle = 'rgba(15,8,40,0.72)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.stroke();
  ctx.font = `700 32px ${FONT}`;
  ctx.fillStyle = '#ffd84a';
  ctx.fillText('称号', cw / 2, 948);
  const ts = fitFont(ctx, `「${rank.name}」`, 62, cw - 240);
  outlinedText(ctx, `「${rank.name}」`, cw / 2, 1010, ts, '#ffffff', 'rgba(20,10,45,0.0)');
  ctx.font = `700 30px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(rank.comment, cw / 2, 1064);

  // Stats
  ctx.font = `900 38px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`PERFECT ×${r.perfects}　　最大 ${r.maxCombo} コンボ`, cw / 2, 1148);

  // Zone chips
  const chip = 70;
  const gap = 16;
  const total = ZONES.length * chip + (ZONES.length - 1) * gap;
  let x0 = (cw - total) / 2;
  for (let i = 0; i < ZONES.length; i++) {
    roundRect(ctx, x0, 1190, chip, chip, 16);
    if (i <= r.zone) {
      if (i === ZONES.length - 1) {
        const rg = ctx.createLinearGradient(x0, 1190, x0 + chip, 1190 + chip);
        ['#ff5c8a', '#ffd23d', '#3fe0a2', '#4fa8ff', '#b07aff'].forEach((c, k) => rg.addColorStop(k / 4, c));
        ctx.fillStyle = rg;
      } else ctx.fillStyle = ZONES[i].chip;
    } else ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    x0 += chip + gap;
  }

  ctx.font = `700 32px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(`#${HASHTAG}  ·  ${new URL(baseUrl()).host}`, cw / 2, 1305);
  return cv;
}

function canvasToBlob(cv: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((res) => cv.toBlob((b) => res(b), 'image/png'));
}

export interface PreparedCard {
  dataUrl: string;
  file: File | null;
}

/** Render the card ahead of time so the share button can call navigator.share right inside the tap. */
export async function prepareCard(r: RunResult): Promise<PreparedCard> {
  const cv = await makeShareCard(r);
  const blob = await canvasToBlob(cv);
  return {
    dataUrl: cv.toDataURL('image/png'),
    file: blob ? new File([blob], `hoshineko-${r.score}.png`, { type: 'image/png' }) : null,
  };
}

type ShareNav = { share?: (d: ShareData) => Promise<void>; canShare?: (d: ShareData) => boolean };

export function canShareFile(file: File | null): boolean {
  const nav = navigator as unknown as ShareNav;
  try {
    return !!(file && nav.share && nav.canShare && nav.canShare({ files: [file] }));
  } catch {
    return false;
  }
}

export type ShareOutcome = 'shared' | 'cancelled' | 'failed';

export async function shareFile(r: RunResult, file: File): Promise<ShareOutcome> {
  try {
    await navigator.share({ files: [file], text: shareText(r) + '\n' + challengeUrl(r) });
    return 'shared';
  } catch (e) {
    return (e as Error).name === 'AbortError' ? 'cancelled' : 'failed';
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
