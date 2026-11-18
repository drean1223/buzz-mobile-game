import { TAU } from '../core/constants.ts';

type Kind = 'dot' | 'star' | 'spark' | 'confetti' | 'ring' | 'trail';

interface Particle {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  g: number;
  drag: number;
  rot: number;
  vr: number;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  life: number;
  max: number;
  vy: number;
  stroke: string;
}

export const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", sans-serif';

export class FX {
  parts: Particle[] = [];
  texts: FloatText[] = [];
  trauma = 0;
  flash = 0;
  flashColor = '255,255,255';
  shakeX = 0;
  shakeY = 0;

  private add(p: Partial<Particle> & { x: number; y: number }): void {
    if (this.parts.length > 520) this.parts.shift();
    this.parts.push({
      kind: 'dot',
      vx: 0,
      vy: 0,
      life: 0.6,
      max: 0.6,
      size: 3,
      color: '#fff',
      g: 0,
      drag: 2,
      rot: 0,
      vr: 0,
      ...p,
    });
  }

  burst(x: number, y: number, n: number, color: string | string[], speed = 220, opts: Partial<Particle> = {}): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.35 + Math.random() * 0.65);
      const life = (opts.max ?? 0.6) * (0.6 + Math.random() * 0.6);
      this.add({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        color: Array.isArray(color) ? color[i % color.length] : color,
        size: (opts.size ?? 3) * (0.6 + Math.random() * 0.8),
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 12,
        ...opts,
        life,
        max: life,
      });
    }
  }

  /** A directional spray (e.g. dust kicked up along the surface normal). */
  spray(x: number, y: number, nx: number, ny: number, n: number, color: string, speed = 200, spread = 1.1, opts: Partial<Particle> = {}): void {
    const base = Math.atan2(ny, nx);
    for (let i = 0; i < n; i++) {
      const a = base + (Math.random() - 0.5) * spread * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      const life = (opts.max ?? 0.5) * (0.6 + Math.random() * 0.6);
      this.add({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        color,
        size: (opts.size ?? 3) * (0.6 + Math.random() * 0.8),
        ...opts,
        life,
        max: life,
      });
    }
  }

  ring(x: number, y: number, color: string, size = 60, life = 0.45): void {
    this.add({ kind: 'ring', x, y, color, size, life, max: life, drag: 0 });
  }

  trail(x: number, y: number, color: string, size: number): void {
    this.add({ kind: 'trail', x, y, color, size, life: 0.32, max: 0.32, drag: 0 });
  }

  confetti(x: number, y: number, n: number): void {
    const colors = ['#ff5c8a', '#ffd23d', '#3fe0a2', '#4fa8ff', '#b07aff', '#ffffff'];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const s = 260 + Math.random() * 360;
      const life = 1.4 + Math.random() * 1.2;
      this.add({
        kind: 'confetti',
        x: x + (Math.random() - 0.5) * 120,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        color: colors[i % colors.length],
        size: 5 + Math.random() * 4,
        g: 520,
        drag: 1.6,
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 18,
        life,
        max: life,
      });
    }
  }

  text(x: number, y: number, text: string, color = '#ffffff', size = 22, life = 0.9, stroke = 'rgba(20,10,40,0.85)'): void {
    this.texts.push({ x, y, text, color, size, life, max: life, vy: -60, stroke });
  }

  /** 1 normally, smaller when the player asked the OS for reduced motion. */
  motion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.25 : 1;

  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount * this.motion);
  }

  doFlash(alpha: number, rgb = '255,255,255'): void {
    this.flash = Math.max(this.flash, alpha * this.motion);
    this.flashColor = rgb;
  }

  update(dt: number): void {
    for (const p of this.parts) {
      p.life -= dt;
      p.vy += p.g * dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const t of this.texts) {
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy *= Math.exp(-3 * dt);
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma * 14;
    this.shakeX = (Math.random() * 2 - 1) * s;
    this.shakeY = (Math.random() * 2 - 1) * s;
    this.flash = Math.max(0, this.flash - dt * 3.2);
  }

  drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.parts) {
      const k = p.life / p.max;
      switch (p.kind) {
        case 'ring': {
          const e = 1 - k;
          ctx.globalAlpha = k * 0.9;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2 + 6 * k;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.3 + e * 0.9), 0, TAU);
          ctx.stroke();
          break;
        }
        case 'star': {
          ctx.globalAlpha = Math.min(1, k * 1.6);
          ctx.fillStyle = p.color;
          drawStar(ctx, p.x, p.y, p.size * (0.5 + k * 0.6), p.rot);
          break;
        }
        case 'confetti': {
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, (p.size / 2) * Math.abs(Math.cos(p.rot * 1.7)) + 1);
          ctx.restore();
          break;
        }
        case 'spark': {
          ctx.globalAlpha = k;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * k + 0.5;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
          ctx.stroke();
          break;
        }
        case 'trail': {
          ctx.globalAlpha = k * 0.55;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * k, 0, TAU);
          ctx.fill();
          break;
        }
        default: {
          ctx.globalAlpha = k;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * k), 0, TAU);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  drawTexts(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const t of this.texts) {
      const age = t.max - t.life;
      const pop = age < 0.12 ? 0.6 + (age / 0.12) * 0.55 : age < 0.22 ? 1.15 - ((age - 0.12) / 0.1) * 0.15 : 1;
      const a = Math.min(1, t.life / 0.25);
      ctx.globalAlpha = a;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(pop, pop);
      ctx.font = `900 ${t.size}px ${FONT}`;
      ctx.lineWidth = Math.max(3, t.size * 0.22);
      ctx.strokeStyle = t.stroke;
      ctx.strokeText(t.text, 0, 0);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

export function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot = 0): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}
