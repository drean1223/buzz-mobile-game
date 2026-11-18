import { W, CAT_R, TAU, clamp, lerp, wrapAngle } from '../core/constants.ts';
import type { Sim } from '../core/sim.ts';
import type { Planet, Coin, Hazard } from '../core/world.ts';
import { ZONES } from '../core/zones.ts';
import { drawCat } from './cat.ts';
import type { Skin, Face } from './cat.ts';
import { FX, drawStar, FONT } from './fx.ts';

interface Star {
  x: number;
  y: number;
  s: number;
  layer: number;
  tw: number;
}

interface FarBody {
  x: number;
  y: number;
  r: number;
  hue: number;
  ring: boolean;
}

type RGB = [number, number, number];

function hexToRgb(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

interface Palette {
  top: RGB;
  bottom: RGB;
  n1: RGB;
  n2: RGB;
}

function zonePalette(i: number): Palette {
  const z = ZONES[i];
  return { top: hexToRgb(z.top), bottom: hexToRgb(z.bottom), n1: hexToRgb(z.nebula[0]), n2: hexToRgb(z.nebula[1]) };
}

/** Visual-only cat state (squash & stretch, expression). */
export interface CatLook {
  squash: number;
  squashV: number;
  face: Face;
  faceT: number;
  blinkT: number;
}

const STAR_TILE = 1100;

export class Scene {
  stars: Star[] = [];
  far: FarBody[] = [];
  private palFrom: Palette = zonePalette(0);
  private palTo: Palette = zonePalette(0);
  private palT = 1;
  shooting: { x: number; y: number; vx: number; vy: number; life: number } | null = null;
  feverT = 0;

  constructor() {
    for (let i = 0; i < 130; i++) {
      const layer = i % 3;
      this.stars.push({
        x: Math.random() * W,
        y: Math.random() * STAR_TILE,
        s: layer === 0 ? 0.7 : layer === 1 ? 1.1 : 1.6,
        layer,
        tw: Math.random() * TAU,
      });
    }
    for (let i = 0; i < 6; i++) {
      this.far.push({
        x: i % 2 === 0 ? Math.random() * 60 : W - Math.random() * 60,
        y: -i * 700 - Math.random() * 300,
        r: 14 + Math.random() * 26,
        hue: Math.random() * 360,
        ring: Math.random() < 0.35,
      });
    }
  }

  setZone(i: number, instant = false): void {
    this.palFrom = this.currentPalette();
    this.palTo = zonePalette(i);
    this.palT = instant ? 1 : 0;
  }

  private currentPalette(): Palette {
    const t = this.palT;
    const a = this.palFrom;
    const b = this.palTo;
    return { top: mix(a.top, b.top, t), bottom: mix(a.bottom, b.bottom, t), n1: mix(a.n1, b.n1, t), n2: mix(a.n2, b.n2, t) };
  }

  update(dt: number, fever: boolean): void {
    this.palT = Math.min(1, this.palT + dt / 1.6);
    this.feverT = clamp(this.feverT + (fever ? dt * 2.5 : -dt * 2), 0, 1);
    if (this.shooting) {
      const s = this.shooting;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (s.life <= 0) this.shooting = null;
    } else if (Math.random() < dt * 0.12) {
      const fromLeft = Math.random() < 0.5;
      this.shooting = {
        x: fromLeft ? -20 : W + 20,
        y: Math.random() * 300,
        vx: (fromLeft ? 1 : -1) * (420 + Math.random() * 200),
        vy: 160 + Math.random() * 120,
        life: 1.2,
      };
    }
  }

  drawBackground(ctx: CanvasRenderingContext2D, viewH: number, camY: number, time: number): void {
    const pal = this.currentPalette();
    const g = ctx.createLinearGradient(0, 0, 0, viewH);
    g.addColorStop(0, css(pal.top));
    g.addColorStop(1, css(pal.bottom));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, viewH);

    // Nebula clouds (slow parallax)
    const nebY = camY * 0.06;
    for (let i = 0; i < 4; i++) {
      const baseY = ((i * 420 - nebY) % 1680 + 1680) % 1680 - 400;
      const x = i % 2 === 0 ? W * 0.18 : W * 0.85;
      const r = 230 + (i % 3) * 40;
      const col = i % 2 === 0 ? pal.n1 : pal.n2;
      const ng = ctx.createRadialGradient(x, baseY, 0, x, baseY, r);
      ng.addColorStop(0, css(col, 0.26 + this.feverT * 0.15));
      ng.addColorStop(1, css(col, 0));
      ctx.fillStyle = ng;
      ctx.fillRect(x - r, baseY - r, r * 2, r * 2);
    }

    // Distant planets
    for (const f of this.far) {
      const y = ((f.y - camY * 0.12) % 4200 + 4200) % 4200 - 300;
      if (y < -f.r * 2 || y > viewH + f.r * 2) continue;
      ctx.globalAlpha = 0.13;
      const fg = ctx.createRadialGradient(f.x - f.r * 0.3, y - f.r * 0.3, 1, f.x, y, f.r);
      fg.addColorStop(0, `hsl(${f.hue} 60% 75%)`);
      fg.addColorStop(1, `hsl(${f.hue} 50% 35%)`);
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(f.x, y, f.r, 0, TAU);
      ctx.fill();
      if (f.ring) {
        ctx.strokeStyle = `hsl(${f.hue} 60% 80%)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(f.x, y, f.r * 1.7, f.r * 0.35, -0.3, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Stars (3 parallax layers)
    const speeds = [0.05, 0.13, 0.26];
    ctx.fillStyle = '#ffffff';
    for (const s of this.stars) {
      const y = ((s.y - camY * speeds[s.layer]) % STAR_TILE + STAR_TILE) % STAR_TILE - 40;
      if (y > viewH + 4) continue;
      const tw = 0.55 + 0.45 * Math.sin(time * (1.5 + s.layer) + s.tw);
      ctx.globalAlpha = tw * (0.5 + s.layer * 0.25);
      const sz = s.s * (1 + this.feverT * 0.6);
      ctx.fillRect(s.x - sz / 2, y - sz / 2, sz, sz);
      if (s.layer === 2 && tw > 0.92) {
        ctx.globalAlpha = (tw - 0.92) * 8;
        ctx.fillRect(s.x - sz * 2, y - 0.4, sz * 4, 0.8);
        ctx.fillRect(s.x - 0.4, y - sz * 2, 0.8, sz * 4);
      }
    }
    ctx.globalAlpha = 1;

    if (this.shooting) {
      const s = this.shooting;
      const len = 0.12;
      const lg = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * len, s.y - s.vy * len);
      lg.addColorStop(0, 'rgba(255,255,255,0.9)');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = lg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * len, s.y - s.vy * len);
      ctx.stroke();
    }
  }

  private bumps = new Map<Planet, number>();

  /** Make a planet wobble like jelly when the cat lands on it. */
  bump(p: Planet, time: number): void {
    this.bumps.set(p, time);
  }

  drawPlanet(ctx: CanvasRenderingContext2D, p: Planet, time: number, fuseFrac: number | null, aimed: boolean): void {
    let x = p.x;
    let y = p.y;
    let k = 1;
    const b = this.bumps.get(p);
    if (b !== undefined) {
      const a = time - b;
      if (a > 0.7) this.bumps.delete(p);
      else k = 1 - 0.07 * Math.exp(-a * 7) * Math.cos(a * 26);
    }
    const r = p.r * k;
    const danger = fuseFrac !== null && fuseFrac < 0.3;
    if (danger) {
      const amt = (0.3 - fuseFrac!) * 10;
      x += (Math.random() - 0.5) * amt;
      y += (Math.random() - 0.5) * amt;
    }
    const h = p.hue;
    const sat = p.kind === 'start' ? 45 : 72;

    // Glow
    const glow = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 1.75);
    glow.addColorStop(0, `hsla(${h}, 95%, 70%, ${aimed ? 0.42 : 0.26})`);
    glow.addColorStop(1, `hsla(${h}, 95%, 70%, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.75, 0, TAU);
    ctx.fill();

    // Body
    const body = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    body.addColorStop(0, `hsl(${h}, ${sat + 15}%, 82%)`);
    body.addColorStop(0.55, `hsl(${h}, ${sat}%, 63%)`);
    body.addColorStop(1, `hsl(${h}, ${sat - 10}%, 42%)`);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();

    // Rotating surface features (they make the spin readable)
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.clip();
    ctx.translate(x, y);
    ctx.rotate(p.angle);
    if (p.style === 1) {
      ctx.fillStyle = `hsla(${h}, ${sat}%, 35%, 0.28)`;
      for (const off of [-0.55, -0.1, 0.38]) {
        ctx.beginPath();
        ctx.ellipse(0, off * r, r * 1.1, r * 0.11, 0, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = `hsla(${h}, 90%, 88%, 0.35)`;
      ctx.beginPath();
      ctx.ellipse(r * 0.25, r * 0.12, r * 0.22, r * 0.12, 0, 0, TAU);
      ctx.fill();
    } else {
      for (const c of p.craters) {
        const cx = Math.cos(c.a) * c.d * r;
        const cy = Math.sin(c.a) * c.d * r;
        const cr = c.s * r;
        ctx.fillStyle = p.style === 2 ? `hsla(${h}, 90%, 88%, 0.45)` : `hsla(${h}, ${sat}%, 30%, 0.35)`;
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, TAU);
        ctx.fill();
        if (p.style === 0) {
          ctx.strokeStyle = `hsla(${h}, 90%, 90%, 0.35)`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(cx + cr * 0.12, cy + cr * 0.12, cr, Math.PI * 0.9, Math.PI * 1.9);
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    // Static shading for a 3D look
    const shade = ctx.createRadialGradient(x - r * 0.45, y - r * 0.5, r * 0.2, x, y, r * 1.05);
    shade.addColorStop(0, 'rgba(255,255,255,0)');
    shade.addColorStop(0.7, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(10,0,30,0.35)');
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y, r - 0.8, Math.PI * 1.05, Math.PI * 1.6);
    ctx.stroke();

    if (danger) {
      ctx.fillStyle = `rgba(255,40,60,${0.25 + 0.2 * Math.sin(time * 30)})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }

    // Kind markers
    if (p.kind === 'fast') {
      ctx.strokeStyle = 'rgba(255,170,190,0.75)';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      const dir = Math.sign(p.omega);
      for (let k = 0; k < 3; k++) {
        const a0 = p.angle * 1.0 + (k * TAU) / 3;
        ctx.beginPath();
        ctx.arc(x, y, r + 7, a0, a0 + 0.55 * dir, dir < 0);
        ctx.stroke();
      }
    } else if (p.kind === 'moving') {
      ctx.fillStyle = 'rgba(160,250,255,0.85)';
      const pulse = 3 * Math.sin(time * 6);
      for (const s of [-1, 1]) {
        const ax = x + s * (r + 11 + pulse);
        ctx.beginPath();
        ctx.moveTo(ax + s * 5, y);
        ctx.lineTo(ax - s * 2, y - 6);
        ctx.lineTo(ax - s * 2, y + 6);
        ctx.closePath();
        ctx.fill();
      }
    } else if (p.kind === 'wobble') {
      ctx.strokeStyle = 'rgba(220,180,255,0.6)';
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r + 6 + Math.sin(time * 4) * 2, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Fuse ring
    if (fuseFrac !== null) {
      const f = clamp(fuseFrac, 0, 1);
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(x, y, r + 9, 0, TAU);
      ctx.stroke();
      const hue = f > 0.5 ? 130 : f > 0.25 ? 48 : 0;
      ctx.strokeStyle = `hsl(${hue}, 95%, 62%)`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(x, y, r + 9, -Math.PI / 2, -Math.PI / 2 + f * TAU);
      ctx.stroke();
    }
  }

  drawHazard(ctx: CanvasRenderingContext2D, p: Planet, h: Hazard, time: number): void {
    ctx.strokeStyle = 'rgba(255,120,120,0.22)';
    ctx.setLineDash([3, 7]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, h.orbitR, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(time * 2);
    ctx.fillStyle = '#7d6a6a';
    ctx.strokeStyle = '#2a1a1a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const rr = h.r * (i % 2 === 0 ? 1.25 : 0.95);
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#5a4848';
    ctx.beginPath();
    ctx.arc(-2, -2, 2.5, 0, TAU);
    ctx.arc(3, 3, 1.6, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawCoin(ctx: CanvasRenderingContext2D, c: Coin, time: number): void {
    const bob = Math.sin(time * 3 + c.phase) * 3;
    const s = 1 + Math.sin(time * 6 + c.phase) * 0.08;
    const g = ctx.createRadialGradient(c.x, c.y + bob, 1, c.x, c.y + bob, 22);
    g.addColorStop(0, 'rgba(255,230,120,0.55)');
    g.addColorStop(1, 'rgba(255,230,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c.x, c.y + bob, 22, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffd84a';
    ctx.strokeStyle = '#b8700a';
    ctx.lineWidth = 2;
    ctx.save();
    ctx.translate(c.x, c.y + bob);
    ctx.scale(s, s);
    drawStar(ctx, 0, 0, 10, Math.sin(time * 2 + c.phase) * 0.2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(-2.5, -3, 1.8, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawGuide(ctx: CanvasRenderingContext2D, sim: Sim, len: number, aligned: boolean, time: number): void {
    const c = sim.cat;
    const a = sim.catAngle;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const start = CAT_R + 14;
    const n = Math.floor(len / 11);
    for (let i = 0; i < n; i++) {
      const d = start + i * 11 + ((time * 40) % 11);
      const k = 1 - i / n;
      ctx.globalAlpha = k * (aligned ? 0.95 : 0.55);
      ctx.fillStyle = aligned ? '#ffe45c' : '#ffffff';
      ctx.beginPath();
      ctx.arc(c.x + dx * d, c.y + dy * d, aligned ? 2.6 : 2, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawCat(ctx: CanvasRenderingContext2D, sim: Sim, skin: Skin, look: CatLook, time: number, fever: boolean): void {
    const c = sim.cat;
    let rot = c.rot;
    let sx = 1 + look.squash;
    let sy = 1 - look.squash;
    if (c.state === 'fly') {
      rot = Math.atan2(c.vy, c.vx) + Math.PI / 2;
      sx *= 0.86;
      sy *= 1.16;
    } else if (c.state === 'ground') {
      const breathe = Math.sin(time * 3.2) * 0.025;
      sy *= 1 + breathe;
      sx *= 1 - breathe * 0.5;
    }
    if (fever && c.state !== 'dead') {
      ctx.save();
      const g = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, 40);
      g.addColorStop(0, `hsla(${(time * 300) % 360}, 100%, 70%, 0.5)`);
      g.addColorStop(1, 'hsla(0,100%,70%,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 40, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(rot);
    ctx.translate(0, CAT_R);
    ctx.scale(1.18, 1.18);
    const blink = look.blinkT < 0.12;
    drawCat(ctx, skin, { face: look.face, t: time, sx, sy, blink });
    ctx.restore();
  }

  /** Whole world pass. */
  drawWorld(
    ctx: CanvasRenderingContext2D,
    sim: Sim,
    fx: FX,
    skin: Skin,
    look: CatLook,
    time: number,
    opts: { guideLen: number; tutorial: boolean; showCat: boolean },
  ): { aligned: boolean } {
    const c = sim.cat;
    const top = sim.camY - 80;
    const bottom = sim.camY + sim.viewH + 120;
    const next = sim.nextPlanet;
    let aligned = false;
    if (c.state === 'ground' && c.planet && next) {
      const p = c.planet;
      const want = Math.atan2(next.y - p.y, next.x - p.x);
      const dist = Math.hypot(next.x - p.x, next.y - p.y);
      const half = Math.asin(Math.min(1, (next.r + CAT_R) / dist));
      aligned = Math.abs(wrapAngle(want - sim.catAngle)) < half * 0.8;
    }

    for (const coin of sim.course.coins) {
      if (!coin.taken && coin.y > top - 30 && coin.y < bottom) this.drawCoin(ctx, coin, time);
    }
    for (const p of sim.course.planets) {
      if (!p.alive || p.y + p.r * 2 < top || p.y - p.r * 2 > bottom) continue;
      const fuse = c.planet === p && Number.isFinite(sim.fuse) && !sim.over ? sim.fuse / p.fuseMax : null;
      this.drawPlanet(ctx, p, time, fuse, opts.tutorial && p === next);
    }
    for (const p of sim.course.planets) {
      if (p.alive && p.hazard && p.y > top - 80 && p.y < bottom + 80) this.drawHazard(ctx, p, p.hazard, time);
    }
    if (c.state === 'ground' && !sim.over && opts.guideLen > 0) {
      this.drawGuide(ctx, sim, opts.guideLen, opts.tutorial && aligned, time);
    }
    fx.drawParticles(ctx);
    if (opts.showCat) this.drawCat(ctx, sim, skin, look, time, sim.fever);
    fx.drawTexts(ctx);
    return { aligned };
  }

  drawOverlay(ctx: CanvasRenderingContext2D, viewH: number, fx: FX, time: number): void {
    if (this.feverT > 0) {
      const a = this.feverT * (0.35 + 0.15 * Math.sin(time * 8));
      const hue = (time * 160) % 360;
      for (const [x0, x1] of [
        [0, 26],
        [W, W - 26],
      ]) {
        const g = ctx.createLinearGradient(x0, 0, x1, 0);
        g.addColorStop(0, `hsla(${hue}, 100%, 65%, ${a})`);
        g.addColorStop(1, `hsla(${hue}, 100%, 65%, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(Math.min(x0, x1), 0, 26, viewH);
      }
    }
    // Vignette
    const v = ctx.createRadialGradient(W / 2, viewH / 2, viewH * 0.35, W / 2, viewH / 2, viewH * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,10,0.35)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, viewH);
    if (fx.flash > 0) {
      ctx.fillStyle = `rgba(${fx.flashColor},${fx.flash})`;
      ctx.fillRect(0, 0, W, viewH);
    }
  }

  drawTutorialHint(ctx: CanvasRenderingContext2D, sim: Sim, aligned: boolean, time: number): void {
    const c = sim.cat;
    if (c.state !== 'ground') return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${aligned ? 26 : 18}px ${FONT}`;
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    const y = (c.planet ? c.planet.y + c.planet.r + 46 : c.y + 60);
    const txt = aligned ? 'いまだ！タップ！' : '矢印がつぎの星をむいたらタップ';
    ctx.strokeStyle = 'rgba(20,10,40,0.9)';
    ctx.strokeText(txt, W / 2, y);
    ctx.fillStyle = aligned ? `hsl(${50 + Math.sin(time * 20) * 10}, 100%, 65%)` : '#ffffff';
    ctx.fillText(txt, W / 2, y);
  }
}
