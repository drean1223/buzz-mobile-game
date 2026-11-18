const KEY = 'hoshineko-save-v1';

export interface Save {
  best: number;
  coins: number;
  owned: string[];
  skin: string;
  sfx: boolean;
  bgm: boolean;
  plays: number;
  dailyKey: string;
  dailyBest: number;
  dailyPlays: number;
  lastBonusKey: string;
  totalPerfect: number;
  totalJumps: number;
  tutorialDone: boolean;
  gachaCount: number;
  bestZone: number;
}

const defaults: Save = {
  best: 0,
  coins: 0,
  owned: ['shiro'],
  skin: 'shiro',
  sfx: true,
  bgm: true,
  plays: 0,
  dailyKey: '',
  dailyBest: 0,
  dailyPlays: 0,
  lastBonusKey: '',
  totalPerfect: 0,
  totalJumps: 0,
  tutorialDone: false,
  gachaCount: 0,
  bestZone: 0,
};

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = { ...defaults, ...JSON.parse(raw) } as Save;
      if (!Array.isArray(data.owned) || data.owned.length === 0) data.owned = ['shiro'];
      return data;
    }
  } catch {
    /* storage unavailable: play without saving */
  }
  return { ...defaults, owned: [...defaults.owned] };
}

export function writeSave(s: Save): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
