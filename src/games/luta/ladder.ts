import { ROUND_TIME, type FighterStats } from './core';

/** Look of a fighter; drawn procedurally by the scene. */
export interface FighterLook {
  readonly name: string;
  readonly skin: number;
  readonly outfit: number;
  readonly trim: number;
  readonly hair: number;
  /** Visual size (1 = normal). */
  readonly size: number;
}

export interface Rival {
  readonly look: FighterLook;
  readonly stats: FighterStats;
}

export const PLAYER_LOOK: FighterLook = {
  name: 'Você',
  skin: 0xd8a47f,
  outfit: 0x1d4ed8,
  trim: 0xffd23f,
  hair: 0x2b1d14,
  size: 1,
};
export const PLAYER_STATS: FighterStats = { maxHp: 100, power: 1, speed: 1 };

const ROSTER: readonly FighterLook[] = [
  { name: 'Zé Marreta', skin: 0xc68642, outfit: 0xe63946, trim: 0xffffff, hair: 0x111111, size: 1 },
  {
    name: 'Tina Bala',
    skin: 0xf1c27d,
    outfit: 0x8338ec,
    trim: 0xff8fab,
    hair: 0xd62828,
    size: 0.95,
  },
  {
    name: 'Kiko Capoeira',
    skin: 0x8d5524,
    outfit: 0x2a9d8f,
    trim: 0xffd166,
    hair: 0x111111,
    size: 1,
  },
  { name: 'Brutus', skin: 0xe0ac69, outfit: 0x495057, trim: 0xff6b6b, hair: 0x3d2c22, size: 1.15 },
  {
    name: 'Mestre Onça',
    skin: 0xffdbac,
    outfit: 0xf4a261,
    trim: 0x1d3557,
    hair: 0xe9ecef,
    size: 1,
  },
];

/** Rival for the n-th fight (1-based): the roster repeats, each lap tougher. */
export function rivalFor(level: number): Rival {
  const look = ROSTER[(level - 1) % ROSTER.length]!;
  const lap = Math.floor((level - 1) / ROSTER.length);
  const name =
    lap === 0
      ? look.name
      : `${look.name} ${['', 'II', 'III', 'IV', 'V'][Math.min(lap, 4)] || lap + 1}`;
  const big = look.size > 1.05;
  return {
    look: { ...look, name },
    stats: {
      maxHp: Math.round((big ? 120 : 90) + level * 6),
      power: +(0.8 + level * 0.07 + (big ? 0.15 : 0)).toFixed(2),
      speed: +((big ? 0.85 : 1) + Math.min(0.25, level * 0.025)).toFixed(2),
    },
  };
}

/** HP the player recovers between fights (a fraction of the missing HP). */
export const healBetweenFights = (hp: number, maxHp: number) =>
  Math.min(maxHp, Math.round(hp + (maxHp - hp) * 0.5));

export interface WinInfo {
  readonly level: number;
  readonly hpLeft: number;
  readonly maxHp: number;
  readonly timeLeft: number;
  readonly perfect: boolean;
}

/** Points for winning a fight: harder rivals, more life and time left all pay more. */
export function winBonus(w: WinInfo): number {
  const life = Math.round((w.hpLeft / w.maxHp) * 1000);
  const time = Math.round((w.timeLeft / ROUND_TIME) * 500);
  return 500 * w.level + life + time + (w.perfect ? 3000 : 0);
}

/** Points per hit: damage times the combo length. */
export const hitPoints = (damage: number, combo: number) => damage * 10 * Math.max(1, combo);
