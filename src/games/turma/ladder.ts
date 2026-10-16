import { ROUND_TIME, type FighterSetup, type PowerKind } from './core';

export interface KidPower {
  readonly kind: PowerKind;
  readonly name: string;
  readonly hint: string;
}

/** One power per kid, indexed like KIDS. */
export const POWERS: readonly KidPower[] = [
  { kind: 'dash', name: 'Furacão', hint: 'Gira e atropela o rival' },
  { kind: 'lightning', name: 'Raio', hint: 'Cai um raio no rival (dá pra desviar)' },
  { kind: 'ice', name: 'Gelo', hint: 'Congela o rival' },
  { kind: 'quake', name: 'Terremoto', hint: 'Abala o chão: só pulando' },
  { kind: 'heal', name: 'Coração', hint: 'Cura e dá mais força por 5s' },
  { kind: 'fireball', name: 'Bola de Fogo', hint: 'Rápida e sempre pronta' },
  { kind: 'dive', name: 'Mergulho', hint: 'Voa e cai em cima do rival' },
];

/** Small differences so each kid plays a bit differently. */
const BASE: ReadonlyArray<{ hp: number; dmg: number; speed: number }> = [
  { hp: 95, dmg: 0.95, speed: 1.15 }, // Lulu: quick
  { hp: 100, dmg: 1, speed: 1 },
  { hp: 100, dmg: 0.95, speed: 1.05 },
  { hp: 115, dmg: 1.1, speed: 0.9 }, // Davi: strong and sturdy
  { hp: 95, dmg: 0.95, speed: 1.05 },
  { hp: 100, dmg: 1.05, speed: 1 },
  { hp: 100, dmg: 1.05, speed: 1.05 },
];

/** Permanent boosts the player picks after each won fight. */
export interface Mods {
  hp: number;
  dmg: number;
  cd: number;
  speed: number;
  guard: number;
  vamp: number;
}
export const BASE_MODS: Mods = { hp: 1, dmg: 1, cd: 1, speed: 1, guard: 1, vamp: 0 };

export interface Upgrade {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  readonly emoji: string;
  apply(m: Mods): Mods;
}

export const UPGRADES: readonly Upgrade[] = [
  {
    id: 'hp',
    name: 'Coração Forte',
    desc: '+15% de vida',
    emoji: '❤️',
    apply: (m) => ({ ...m, hp: m.hp * 1.15 }),
  },
  {
    id: 'dmg',
    name: 'Mãos de Pedra',
    desc: '+12% de dano',
    emoji: '👊',
    apply: (m) => ({ ...m, dmg: m.dmg * 1.12 }),
  },
  {
    id: 'cd',
    name: 'Poder Rápido',
    desc: 'Poder recarrega 15% mais rápido',
    emoji: '⚡',
    apply: (m) => ({ ...m, cd: m.cd * 0.85 }),
  },
  {
    id: 'speed',
    name: 'Pé Ligeiro',
    desc: '+8% de velocidade',
    emoji: '👟',
    apply: (m) => ({ ...m, speed: m.speed * 1.08 }),
  },
  {
    id: 'guard',
    name: 'Escudo Grande',
    desc: '+25% de energia de guarda',
    emoji: '🛡️',
    apply: (m) => ({ ...m, guard: m.guard * 1.25 }),
  },
  {
    id: 'vamp',
    name: 'Vampirinho',
    desc: 'Cura 8% do dano que você causa',
    emoji: '🦇',
    apply: (m) => ({ ...m, vamp: m.vamp + 0.08 }),
  },
];

/** Three different cards to choose from. */
export function offerUpgrades(rnd: () => number): Upgrade[] {
  const pool = [...UPGRADES];
  const out: Upgrade[] = [];
  while (out.length < 3 && pool.length)
    out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]!);
  return out;
}

export function kidSetup(kid: number, mods: Mods = BASE_MODS): FighterSetup {
  const b = BASE[kid]!;
  return {
    kid,
    power: POWERS[kid]!.kind,
    maxHp: Math.round(b.hp * mods.hp),
    dmg: b.dmg * mods.dmg,
    speed: b.speed * mods.speed,
    cd: mods.cd,
    guard: mods.guard,
    vamp: mods.vamp,
  };
}

/** The n-th fight (1-based) against the other kids, in a fixed order; each lap is tougher. */
export function turmaRival(
  level: number,
  player: number,
): { kid: number; setup: FighterSetup; skill: number } {
  const others = POWERS.map((_, i) => i).filter((i) => i !== player);
  const order = [3, 0, 5, 2, 6, 4, 1].filter((i) => others.includes(i));
  const kid = order[(level - 1) % order.length]!;
  const base = kidSetup(kid);
  const t = level - 1;
  return {
    kid,
    skill: Math.min(0.95, 0.22 + t * 0.07),
    setup: {
      ...base,
      maxHp: Math.round(base.maxHp * (0.85 + t * 0.06)),
      dmg: +(base.dmg * (0.8 + t * 0.05)).toFixed(2),
      cd: Math.max(0.6, 1 - t * 0.04),
    },
  };
}

export interface RoundWin {
  readonly level: number;
  readonly hpLeft: number;
  readonly maxHp: number;
  readonly timeLeft: number;
  readonly perfect: boolean;
}

/** Points for winning a round: life and time left pay, a flawless round pays a lot. */
export function roundBonus(w: RoundWin): number {
  const life = Math.round((w.hpLeft / w.maxHp) * 600);
  const time = Math.round((w.timeLeft / ROUND_TIME) * 400);
  return 300 * w.level + life + time + (w.perfect ? 1500 : 0);
}

export const FIGHT_BONUS = (level: number) => 800 * level;

/** Points per hit: damage times the combo length. */
export const hitPoints = (damage: number, combo: number) => damage * 10 * Math.max(1, combo);
