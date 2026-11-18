export interface Zone {
  at: number;
  name: string;
  en: string;
  top: string;
  bottom: string;
  nebula: [string, string];
  emoji: string;
  /** Color of the zone chip on the share card. */
  chip: string;
}

/** Score thresholds that change the sky. Reaching a new one is a mini-goal. */
export const ZONES: Zone[] = [
  { at: 0, name: 'よぞら', en: 'NIGHT SKY', top: '#0a0d2c', bottom: '#2c1d63', nebula: ['#5b44c9', '#2373c4'], emoji: '🟪', chip: '#8f6bff' },
  { at: 10, name: 'つきのうら', en: 'MOON SIDE', top: '#04182a', bottom: '#0f4c70', nebula: ['#19a7b8', '#3561d6'], emoji: '🟦', chip: '#3fa4ff' },
  { at: 25, name: 'オーロラの海', en: 'AURORA SEA', top: '#03140f', bottom: '#0c4e48', nebula: ['#2fe0a2', '#1f86d8'], emoji: '🟩', chip: '#2fd98f' },
  { at: 45, name: 'ほしくずの川', en: 'STARDUST RIVER', top: '#1a1004', bottom: '#5e4110', nebula: ['#ffcc33', '#ff7ad9'], emoji: '🟨', chip: '#ffd23d' },
  { at: 70, name: 'まっかな星雲', en: 'CRIMSON NEBULA', top: '#1f0606', bottom: '#6e1f12', nebula: ['#ff6a3d', '#c21f6a'], emoji: '🟧', chip: '#ff8a3d' },
  { at: 100, name: 'ブラックホールの前', en: 'EVENT HORIZON', top: '#000000', bottom: '#2a0a3a', nebula: ['#ff3d6a', '#7a3dff'], emoji: '🟥', chip: '#ff4466' },
  { at: 150, name: 'ねこの楽園', en: 'CAT PARADISE', top: '#2a1a3a', bottom: '#ff9ad5', nebula: ['#ffe66b', '#7af0ff'], emoji: '🌈', chip: '#ffffff' },
];

export function zoneIndexFor(score: number): number {
  let z = 0;
  for (let i = 0; i < ZONES.length; i++) if (score >= ZONES[i].at) z = i;
  return z;
}

export interface Rank {
  min: number;
  name: string;
  comment: string;
}

/** 称号: a funny title for the result screen and share card. */
export const RANKS: Rank[] = [
  { min: 0, name: 'ちきゅうに未練がある猫', comment: '重力とはまだ仲良し' },
  { min: 4, name: 'やねの上の見習い猫', comment: 'ジャンプの才能、ちょっとある' },
  { min: 10, name: 'つきに手がとどいた猫', comment: 'うさぎとお茶してきたらしい' },
  { min: 18, name: 'ほしをわたる旅猫', comment: '肉球に星くずがついている' },
  { min: 25, name: 'オーロラで顔をあらう猫', comment: '毛並みがキラキラしてきた' },
  { min: 35, name: '流れ星をおいこした猫', comment: 'ねがいごとは、ちゅ〜る' },
  { min: 45, name: 'ほしくずの川の主', comment: '近所の星から一目おかれている' },
  { min: 58, name: '銀河でうわさの猫', comment: '宇宙人のSNSでバズり中' },
  { min: 70, name: 'まっかな星雲の番猫', comment: 'ここから先はプロの領域' },
  { min: 85, name: 'ブラックホールを二度見させた猫', comment: '光より速いとの噂' },
  { min: 100, name: '宇宙の伝説ねこ', comment: '星座になる日も近い' },
  { min: 150, name: 'ねこの楽園の神', comment: 'すべての猫があなたを拝んでいる' },
  { min: 250, name: 'もはや宇宙そのもの', comment: 'あなたが宇宙で、宇宙があなた' },
];

export function rankFor(score: number): Rank {
  let r = RANKS[0];
  for (const k of RANKS) if (score >= k.min) r = k;
  return r;
}

export function nextRank(score: number): Rank | null {
  for (const k of RANKS) if (k.min > score) return k;
  return null;
}
