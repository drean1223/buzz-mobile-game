export type Rarity = 1 | 2 | 3;
export type Pattern = 'plain' | 'stripes' | 'patches' | 'tuxedo' | 'point' | 'galaxy' | 'gold' | 'rainbow' | 'ghost' | 'robot';
export type Face = 'normal' | 'happy' | 'jump' | 'blank' | 'scared' | 'sleepy';

export interface Skin {
  id: string;
  name: string;
  rarity: Rarity;
  body: string;
  ear: string;
  outline: string;
  pattern: Pattern;
  accent?: string;
  accent2?: string;
  eye?: string;
}

export const SKINS: Skin[] = [
  { id: 'shiro', name: 'しろねこ', rarity: 1, body: '#ffffff', ear: '#ffb3c7', outline: '#2b2140', pattern: 'plain' },
  { id: 'kuro', name: 'くろねこ', rarity: 1, body: '#2d2838', ear: '#ff8fb0', outline: '#0d0b14', pattern: 'plain', eye: '#ffd54a' },
  { id: 'chatora', name: 'ちゃトラ', rarity: 1, body: '#ffb862', ear: '#ff9f9f', outline: '#5a2d0c', pattern: 'stripes', accent: '#e57a24' },
  { id: 'saba', name: 'サバトラ', rarity: 1, body: '#c3c9d4', ear: '#ffb3c7', outline: '#2b2f3a', pattern: 'stripes', accent: '#5d6675' },
  { id: 'hachi', name: 'はちわれ', rarity: 1, body: '#2d2838', ear: '#ff8fb0', outline: '#0d0b14', pattern: 'tuxedo', accent: '#ffffff' },
  { id: 'mike', name: 'みけねこ', rarity: 2, body: '#ffffff', ear: '#ffb3c7', outline: '#2b2140', pattern: 'patches', accent: '#f0913a', accent2: '#2d2838' },
  { id: 'siam', name: 'シャムねこ', rarity: 2, body: '#f5e9d6', ear: '#5a4030', outline: '#3a2a20', pattern: 'point', accent: '#5a4030', eye: '#3a9bff' },
  { id: 'russian', name: 'ロシアンブルー', rarity: 2, body: '#8fa3bf', ear: '#c9a0b0', outline: '#27303f', pattern: 'plain', eye: '#3ddc84' },
  { id: 'ghost', name: 'おばけねこ', rarity: 2, body: '#e8f6ff', ear: '#bfe3ff', outline: '#5b7fa8', pattern: 'ghost' },
  { id: 'galaxy', name: 'ぎんがねこ', rarity: 3, body: '#3b2a8f', ear: '#ff7ad9', outline: '#120a33', pattern: 'galaxy', eye: '#ffe66b' },
  { id: 'gold', name: 'きんのねこ', rarity: 3, body: '#ffd447', ear: '#ffad5a', outline: '#7a4b00', pattern: 'gold' },
  { id: 'rainbow', name: 'にじいろねこ', rarity: 3, body: '#ffffff', ear: '#ffb3c7', outline: '#3a2a55', pattern: 'rainbow' },
  { id: 'robo', name: 'ロボねこ', rarity: 3, body: '#b8c4d6', ear: '#6a7a92', outline: '#26303f', pattern: 'robot', eye: '#3df2ff' },
];

export function skinById(id: string): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}

export interface CatPose {
  face: Face;
  t: number;
  /** Horizontal / vertical scale for squash & stretch. */
  sx: number;
  sy: number;
  blink?: boolean;
  /** Draw as a dark silhouette (locked in the collection). */
  silhouette?: boolean;
}

const BODY_RX = 18;
const BODY_RY = 15;
const BODY_CY = -15;

function bodyPath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  // A soft "mochi" shape: flatter bottom, rounder top.
  ctx.moveTo(-BODY_RX, BODY_CY + 2);
  ctx.bezierCurveTo(-BODY_RX, BODY_CY - 13, -9, BODY_CY - BODY_RY - 1, 0, BODY_CY - BODY_RY - 1);
  ctx.bezierCurveTo(9, BODY_CY - BODY_RY - 1, BODY_RX, BODY_CY - 13, BODY_RX, BODY_CY + 2);
  ctx.bezierCurveTo(BODY_RX, BODY_CY + 12, 10, 0, 0, 0);
  ctx.bezierCurveTo(-10, 0, -BODY_RX, BODY_CY + 12, -BODY_RX, BODY_CY + 2);
  ctx.closePath();
}

function earPath(ctx: CanvasRenderingContext2D, side: number, inner: boolean): void {
  const s = side;
  ctx.beginPath();
  if (inner) {
    ctx.moveTo(s * 13.5, -25);
    ctx.lineTo(s * 12.5, -33.5);
    ctx.lineTo(s * 6.5, -28.5);
  } else {
    ctx.moveTo(s * 17, -22);
    ctx.quadraticCurveTo(s * 15, -33, s * 12.5, -37);
    ctx.quadraticCurveTo(s * 8, -33, s * 2.5, -29);
  }
  ctx.closePath();
}

function bodyFill(ctx: CanvasRenderingContext2D, skin: Skin, t: number): string | CanvasGradient {
  switch (skin.pattern) {
    case 'galaxy': {
      const g = ctx.createLinearGradient(-18, -32, 18, 0);
      g.addColorStop(0, '#2a1a6e');
      g.addColorStop(0.5, '#5b2fb8');
      g.addColorStop(1, '#1f4fb8');
      return g;
    }
    case 'gold': {
      const g = ctx.createLinearGradient(-18, -32, 18, 0);
      const k = (Math.sin(t * 2) + 1) / 2;
      g.addColorStop(0, '#fff3a8');
      g.addColorStop(0.35 + k * 0.3, '#ffd447');
      g.addColorStop(1, '#e09a12');
      return g;
    }
    case 'rainbow': {
      const g = ctx.createLinearGradient(-18, -32, 18, 0);
      for (let i = 0; i <= 6; i++) {
        const h = (i * 55 + t * 120) % 360;
        g.addColorStop(i / 6, `hsl(${h} 95% 75%)`);
      }
      return g;
    }
    case 'robot': {
      const g = ctx.createLinearGradient(-18, -32, 18, 0);
      g.addColorStop(0, '#e6edf7');
      g.addColorStop(1, '#8796ad');
      return g;
    }
    default:
      return skin.body;
  }
}

function drawPattern(ctx: CanvasRenderingContext2D, skin: Skin, t: number): void {
  const a = skin.accent ?? '#000';
  switch (skin.pattern) {
    case 'stripes': {
      ctx.fillStyle = a;
      // Forehead stripes
      for (const x of [-5.5, 0, 5.5]) {
        ctx.beginPath();
        ctx.moveTo(x - 2, -31);
        ctx.quadraticCurveTo(x, -26, x, -23.5);
        ctx.quadraticCurveTo(x + 0.6, -26, x + 2, -31);
        ctx.fill();
      }
      // Side stripes
      for (const side of [-1, 1]) {
        for (const y of [-19, -13]) {
          ctx.beginPath();
          ctx.moveTo(side * 19, y - 2);
          ctx.quadraticCurveTo(side * 13, y, side * 19, y + 2.5);
          ctx.fill();
        }
      }
      break;
    }
    case 'tuxedo': {
      ctx.fillStyle = a;
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.quadraticCurveTo(-4, -16, -11, -12);
      ctx.quadraticCurveTo(-16, -6, -12, 0);
      ctx.lineTo(12, 0);
      ctx.quadraticCurveTo(16, -6, 11, -12);
      ctx.quadraticCurveTo(4, -16, 0, -22);
      ctx.fill();
      break;
    }
    case 'patches': {
      ctx.fillStyle = a;
      ctx.beginPath();
      ctx.ellipse(-12, -26, 11, 9, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = skin.accent2 ?? '#222';
      ctx.beginPath();
      ctx.ellipse(13, -24, 9, 8, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = a;
      ctx.beginPath();
      ctx.ellipse(14, -5, 6, 5, 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'point': {
      const g = ctx.createRadialGradient(0, -12, 1, 0, -12, 10);
      g.addColorStop(0, a);
      g.addColorStop(1, 'rgba(90,64,48,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, -12, 11, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'galaxy': {
      ctx.fillStyle = '#ffffff';
      const pts = [
        [-10, -24, 1.1],
        [6, -27, 0.8],
        [12, -14, 1],
        [-14, -10, 0.7],
        [2, -4, 0.9],
        [-5, -30, 0.6],
        [15, -22, 0.6],
      ];
      for (const [x, y, r] of pts) {
        const tw = 0.5 + 0.5 * Math.sin(t * 4 + x);
        ctx.globalAlpha = 0.4 + tw * 0.6;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'gold': {
      const k = ((t * 0.6) % 1.6) - 0.3;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      const x = -20 + k * 40;
      ctx.moveTo(x, -34);
      ctx.lineTo(x + 6, -34);
      ctx.lineTo(x - 4, 0);
      ctx.lineTo(x - 10, 0);
      ctx.fill();
      break;
    }
    case 'robot': {
      ctx.fillStyle = '#6a7a92';
      for (const [x, y] of [
        [-14, -10],
        [14, -10],
        [-12, -26],
        [12, -26],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(38,48,63,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-18, -20);
      ctx.lineTo(18, -20);
      ctx.stroke();
      break;
    }
    default:
      break;
  }
}

function drawFace(ctx: CanvasRenderingContext2D, skin: Skin, pose: CatPose): void {
  const dark = skin.pattern === 'plain' && (skin.id === 'kuro') ? '#ffffff' : skin.outline;
  const eyeCol = skin.eye ?? '#2b2140';
  const ey = -17;
  const ex = 6.8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const face = pose.blink && (pose.face === 'normal' || pose.face === 'sleepy') ? 'blinkface' : pose.face;
  if (skin.pattern === 'robot' && face !== 'blank') {
    ctx.fillStyle = eyeCol;
    ctx.shadowColor = eyeCol;
    ctx.shadowBlur = 6;
    if (face === 'happy') {
      ctx.strokeStyle = eyeCol;
      ctx.lineWidth = 2;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * ex - 3, ey + 1);
        ctx.lineTo(s * ex, ey - 2);
        ctx.lineTo(s * ex + 3, ey + 1);
        ctx.stroke();
      }
    } else {
      for (const s of [-1, 1]) ctx.fillRect(s * ex - 3, ey - 2, 6, face === 'blinkface' ? 1 : 4);
    }
    ctx.shadowBlur = 0;
  } else if (face === 'normal' || face === 'scared') {
    const big = face === 'scared' ? 1.25 : 1;
    for (const s of [-1, 1]) {
      ctx.fillStyle = eyeCol === '#2b2140' ? dark : '#1b1426';
      ctx.beginPath();
      ctx.ellipse(s * ex, ey, 2.6 * big, 3.3 * big, 0, 0, Math.PI * 2);
      ctx.fill();
      if (skin.eye) {
        ctx.fillStyle = skin.eye;
        ctx.beginPath();
        ctx.ellipse(s * ex, ey, 2.2 * big, 2.9 * big, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#120c1c';
        ctx.beginPath();
        ctx.ellipse(s * ex, ey, 0.9, 2.3 * big, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s * ex - 0.9, ey - 1.3, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (face === 'blinkface' || face === 'sleepy') {
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1.6;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * ex - 2.6, ey);
      ctx.quadraticCurveTo(s * ex, ey + 1.6, s * ex + 2.6, ey);
      ctx.stroke();
    }
  } else if (face === 'happy') {
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1.8;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * ex - 2.8, ey + 1);
      ctx.quadraticCurveTo(s * ex, ey - 3.2, s * ex + 2.8, ey + 1);
      ctx.stroke();
    }
  } else if (face === 'jump') {
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1.8;
    // > <
    ctx.beginPath();
    ctx.moveTo(-ex - 2.5, ey - 2.5);
    ctx.lineTo(-ex + 2, ey);
    ctx.lineTo(-ex - 2.5, ey + 2.5);
    ctx.moveTo(ex + 2.5, ey - 2.5);
    ctx.lineTo(ex - 2, ey);
    ctx.lineTo(ex + 2.5, ey + 2.5);
    ctx.stroke();
  } else if (face === 'blank') {
    // The "space cat" stare: wide white eyes, tiny pupils.
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = skin.outline;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(s * ex, ey, 4.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#120c1c';
      ctx.beginPath();
      ctx.arc(s * ex + s * 0.6, ey + 0.4, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Cheeks
  if (face !== 'blank') {
    ctx.fillStyle = 'rgba(255,120,150,0.45)';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s * 11.5, -11.5, 2.9, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Mouth: "ω", or a tiny "o" when stunned
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.3;
  if (face === 'blank' || face === 'scared') {
    ctx.beginPath();
    ctx.ellipse(0, -10.5, 1.2, face === 'scared' ? 2 : 0.9, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(-1.6, -11.2, 1.6, 0.1, Math.PI - 0.1);
    ctx.arc(1.6, -11.2, 1.6, 0.1, Math.PI - 0.1);
    ctx.stroke();
  }

  // Whiskers
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (const s of [-1, 1]) {
    ctx.moveTo(s * 13, -13.5);
    ctx.lineTo(s * 21, -15);
    ctx.moveTo(s * 13, -11);
    ctx.lineTo(s * 21, -10);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function tailColor(skin: Skin, t: number): string {
  switch (skin.pattern) {
    case 'point':
      return skin.accent ?? skin.body;
    case 'patches':
      return skin.accent2 ?? skin.body;
    case 'galaxy':
      return '#5b2fb8';
    case 'robot':
      return '#aab6c8';
    case 'gold':
      return '#ffc93a';
    case 'rainbow':
      return `hsl(${(t * 120) % 360} 95% 75%)`;
    default:
      return skin.body;
  }
}

/**
 * Draws the cat at the origin with its feet at (0,0) and "up" toward -y.
 * Body center is at (0, -15).
 */
export function drawCat(ctx: CanvasRenderingContext2D, skin: Skin, pose: CatPose): void {
  ctx.save();
  // Squash/stretch around the body center
  ctx.translate(0, BODY_CY);
  ctx.scale(pose.sx, pose.sy);
  ctx.translate(0, -BODY_CY);

  const sil = !!pose.silhouette;
  const fill = sil ? 'rgba(10,8,30,0.55)' : bodyFill(ctx, skin, pose.t);
  const outline = sil ? 'rgba(255,255,255,0.25)' : skin.outline;
  const ghost = skin.pattern === 'ghost' && !sil;
  if (ghost) ctx.globalAlpha = 0.82 + 0.1 * Math.sin(pose.t * 3);

  // Tail
  const wag = Math.sin(pose.t * 5) * 0.35;
  ctx.save();
  ctx.translate(14, -6);
  ctx.rotate(wag);
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = 8.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(10, -2, 11, -13);
  ctx.stroke();
  ctx.strokeStyle = sil ? 'rgba(10,8,30,0.9)' : tailColor(skin, pose.t);
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(10, -2, 11, -13);
  ctx.stroke();
  ctx.restore();

  // Ears
  ctx.lineJoin = 'round';
  for (const s of [-1, 1]) {
    earPath(ctx, s, false);
    ctx.fillStyle = typeof fill === 'string' ? fill : skin.body;
    if (skin.pattern === 'patches' && !sil) ctx.fillStyle = s < 0 ? skin.accent ?? skin.body : skin.accent2 ?? skin.body;
    if (skin.pattern === 'point' && !sil) ctx.fillStyle = skin.accent ?? skin.body;
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    if (!sil) {
      earPath(ctx, s, true);
      ctx.fillStyle = skin.ear;
      ctx.fill();
    }
  }

  // Robot antenna
  if (skin.pattern === 'robot' && !sil) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -31);
    ctx.lineTo(0, -38);
    ctx.stroke();
    ctx.fillStyle = Math.sin(pose.t * 6) > 0 ? '#ff4d6d' : '#7a2033';
    ctx.beginPath();
    ctx.arc(0, -39.5, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Body
  bodyPath(ctx);
  ctx.fillStyle = fill;
  ctx.fill();
  if (!sil) {
    ctx.save();
    bodyPath(ctx);
    ctx.clip();
    drawPattern(ctx, skin, pose.t);
    // soft top highlight + bottom shade for volume
    const g = ctx.createLinearGradient(0, -31, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.28)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.16)');
    ctx.fillStyle = g;
    ctx.fillRect(-20, -34, 40, 34);
    ctx.restore();
  }
  bodyPath(ctx);
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Little feet
  if (!sil) {
    ctx.fillStyle = skin.pattern === 'tuxedo' ? '#ffffff' : typeof fill === 'string' ? fill : skin.body;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.6;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s * 6.5, -1.2, 3.6, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    drawFace(ctx, skin, pose);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '900 14px "M PLUS Rounded 1c", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 0, -15);
  }
  ctx.restore();
}
