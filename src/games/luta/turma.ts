import { KIDS } from '@/games/bomba/art';
import type { FighterStats, SpecialKind } from './core';

/** Each kid of the turma has their own power. */
export interface KidPower {
  readonly kind: SpecialKind;
  readonly name: string;
  readonly hint: string;
}

export const POWERS: readonly KidPower[] = [
  { kind: 'dash', name: 'Furacão', hint: 'Avança girando e atropela' },
  { kind: 'lightning', name: 'Raio', hint: 'Um raio cai em cima do rival' },
  { kind: 'ice', name: 'Gelo', hint: 'Congela o rival' },
  { kind: 'wave', name: 'Terremoto', hint: 'Onda pelo chão: só pulando' },
  { kind: 'heal', name: 'Coração', hint: 'Recupera a vida' },
  { kind: 'fireball', name: 'Bola de Fogo', hint: 'Rápida e forte' },
  { kind: 'dive', name: 'Mergulho', hint: 'Super pulo e cai em cima' },
];

/** Base stats per kid: small differences so each one plays a bit differently. */
const BASE: readonly Omit<FighterStats, 'special'>[] = [
  { maxHp: 95, power: 0.95, speed: 1.15 }, // Lulu: quick
  { maxHp: 100, power: 1, speed: 1 }, // Téo
  { maxHp: 100, power: 0.95, speed: 1.05 }, // Mel
  { maxHp: 115, power: 1.1, speed: 0.88 }, // Davi: strong and sturdy
  { maxHp: 95, power: 0.95, speed: 1.05 }, // Bia (she heals)
  { maxHp: 100, power: 1.05, speed: 1 }, // Kauã
  { maxHp: 100, power: 1.05, speed: 1.05 }, // Zeca
];

export const kidStats = (i: number): FighterStats => ({ ...BASE[i]!, special: POWERS[i]!.kind });

/**
 * The n-th fight (1-based) against the other kids, in a fixed shuffled order; after everyone,
 * the round repeats tougher.
 */
export function turmaRival(level: number, player: number): { kid: number; stats: FighterStats } {
  const others = KIDS.map((_, i) => i).filter((i) => i !== player);
  const order = [3, 0, 5, 2, 6, 4, 1].filter((i) => others.includes(i));
  const kid = order[(level - 1) % order.length]!;
  const lap = Math.floor((level - 1) / order.length);
  const base = kidStats(kid);
  const t = level - 1;
  return {
    kid,
    stats: {
      ...base,
      maxHp: Math.round(base.maxHp * (0.85 + t * 0.05)),
      power: +(base.power * (0.8 + t * 0.06)).toFixed(2),
      speed: +(base.speed * (1 + Math.min(0.2, lap * 0.08))).toFixed(2),
    },
  };
}
