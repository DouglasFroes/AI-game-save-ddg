/**
 * "Seleção dos Sonhos" — pure rules. Pick a formation and a style, then draw a national team
 * from a random World Cup and take one of its players, eleven times. Your side then plays seven
 * knockout matches (three group games, round of 16, quarters, semi and final): lose one and
 * you are out, win them all and you lift the cup. Three re-rolls help a bad draw.
 */
import { NATIONS, type Nation } from './data';

export type Rng = () => number;

export type Role =
  'GOL' | 'LD' | 'LE' | 'ZAG' | 'VOL' | 'MC' | 'MEI' | 'ME' | 'MD' | 'PE' | 'PD' | 'CA';

export interface Player {
  readonly num: number;
  readonly name: string;
  readonly role: Role;
  /** A second position the player can also fill. */
  readonly alt?: Role;
  readonly rating: number;
}

export interface Squad {
  readonly nation: string;
  readonly flag: string;
  readonly year: number;
  readonly players: readonly Player[];
}

export type Style = 'defensivo' | 'equilibrado' | 'ofensivo';
/** `classico` shows every rating; `almanaque` hides them (and pays 50% more). */
export type Mode = 'classico' | 'almanaque';

export const STYLES: readonly Style[] = ['defensivo', 'equilibrado', 'ofensivo'];
export const REROLLS = 3;
export const MATCHES = 7;
export const STAGES = [
  'Grupos · 1º jogo',
  'Grupos · 2º jogo',
  'Grupos · 3º jogo',
  'Oitavas',
  'Quartas',
  'Semifinal',
  'FINAL',
] as const;

type Line = readonly Role[];
interface FormationDef {
  /** Lines from the defence to the attack, each listed left to right. */
  readonly lines: readonly Line[];
  /** Small tactical lean added to attack / defence. */
  readonly att: number;
  readonly def: number;
}

const D4: Line = ['LE', 'ZAG', 'ZAG', 'LD'];
const D3: Line = ['ZAG', 'ZAG', 'ZAG'];
const D5: Line = ['LE', 'ZAG', 'ZAG', 'ZAG', 'LD'];

export const FORMATIONS = {
  '4-3-3': { lines: [D4, ['MC', 'VOL', 'MC'], ['PE', 'CA', 'PD']], att: 1, def: 0 },
  '4-4-2': { lines: [D4, ['ME', 'MC', 'MC', 'MD'], ['CA', 'CA']], att: 0, def: 0 },
  '4-2-3-1': { lines: [D4, ['VOL', 'VOL'], ['ME', 'MEI', 'MD'], ['CA']], att: 0, def: 1 },
  '4-2-4': { lines: [D4, ['MC', 'VOL'], ['PE', 'CA', 'CA', 'PD']], att: 3, def: -3 },
  '3-5-2': { lines: [D3, ['LE', 'MC', 'VOL', 'MEI', 'LD'], ['CA', 'CA']], att: 1, def: -1 },
  '5-3-2': { lines: [D5, ['MC', 'VOL', 'MEI'], ['CA', 'CA']], att: -2, def: 3 },
  '4-5-1': { lines: [D4, ['ME', 'MC', 'VOL', 'MC', 'MD'], ['CA']], att: -2, def: 2 },
  '3-4-3': { lines: [D3, ['LE', 'MC', 'MC', 'LD'], ['PE', 'CA', 'PD']], att: 2, def: -2 },
} as const satisfies Record<string, FormationDef>;

export type FormationId = keyof typeof FORMATIONS;
export const FORMATION_IDS = Object.keys(FORMATIONS) as FormationId[];

export interface Slot {
  readonly role: Role;
  /** 0 (own goal) to 1 (opponent goal). */
  readonly depth: number;
  /** 0 (left) to 1 (right). */
  readonly side: number;
}

/** The eleven positions of a formation, goalkeeper first. */
export function slotsOf(formation: FormationId): Slot[] {
  const lines = FORMATIONS[formation].lines;
  const out: Slot[] = [{ role: 'GOL', depth: 0, side: 0.5 }];
  lines.forEach((line, li) => {
    const depth = (li + 1) / lines.length;
    line.forEach((role, i) => {
      out.push({ role, depth: 0.12 + depth * 0.88, side: (i + 1) / (line.length + 1) });
    });
  });
  return out;
}

/** Roles of a squad: counts per position (every formation can be filled from any squad). */
const SQUAD_ROLES: ReadonlyArray<readonly [Role, number, Role?]> = [
  ['GOL', 3],
  ['LD', 2, 'ZAG'],
  ['LE', 2, 'ZAG'],
  ['ZAG', 4],
  ['VOL', 2, 'MC'],
  ['MC', 3, 'VOL'],
  ['MEI', 2, 'MC'],
  ['ME', 1, 'PE'],
  ['MD', 1, 'PD'],
  ['PE', 2, 'ME'],
  ['PD', 2, 'MD'],
  ['CA', 3],
];

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function mulberry(seed: number): Rng {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The squad of a nation in a given Cup. Always the same for the same pair. */
export function squadOf(nation: Nation, year: number): Squad {
  const strength = nation.cups[year] ?? 70;
  const rng = mulberry(hash(`${nation.name}${year}`));
  const surnames = nation.surnames.split(' ');
  const taken = new Set<string>();
  const players: Player[] = [];
  let num = 1;
  for (const [role, count, alt] of SQUAD_ROLES) {
    for (let i = 0; i < count; i++) {
      let name: string;
      do {
        const initial = String.fromCharCode(65 + Math.floor(rng() * 26));
        name = `${initial}. ${surnames[Math.floor(rng() * surnames.length)]}`;
      } while (taken.has(name));
      taken.add(name);
      const spread = (rng() + rng() + rng() - 1.5) * 9;
      const star = rng() < 0.14 ? 5 : 0;
      const rating = Math.round(clamp(strength + spread + star - 2, 50, 97));
      players.push({ num: num++, name, role, ...(rng() < 0.4 && alt ? { alt } : {}), rating });
    }
  }
  return { nation: nation.name, flag: nation.flag, year, players };
}

export interface TeamStats {
  readonly overall: number;
  readonly attack: number;
  readonly defence: number;
  readonly keeper: number;
}

const avg = (xs: readonly number[], fallback = 60) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : fallback;

export interface Opponent {
  readonly nation: string;
  readonly flag: string;
  readonly year: number;
  readonly attack: number;
  readonly defence: number;
  readonly keeper: number;
}

export interface MatchResult {
  readonly stage: string;
  readonly opponent: Opponent;
  readonly goals: number;
  readonly against: number;
  /** Penalty shoot-out score when the match was level (ours first). */
  readonly pens: readonly [number, number] | null;
  readonly win: boolean;
}

export interface Tournament {
  readonly matches: readonly MatchResult[];
  readonly wins: number;
  readonly champion: boolean;
  readonly goalDiff: number;
  readonly score: number;
}

const OPPONENT_TARGETS = [67, 71, 75, 79, 83, 86, 89];
const BASE_GOALS = 1.35;

function poisson(lambda: number, rng: Rng): number {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > limit && k < 12);
  return k - 1;
}

export class SelecaoGame {
  readonly slots: Slot[];
  /** The player filling each slot (same order as `slots`), null while empty. */
  readonly lineup: Array<Player | null>;
  /** The squad on the table now (null before the first roll or right after a pick). */
  current: Squad | null = null;
  rerollsLeft = REROLLS;
  private readonly usedNations = new Set<string>();

  constructor(
    private readonly rng: Rng = Math.random,
    readonly formation: FormationId = '4-3-3',
    readonly style: Style = 'equilibrado',
    readonly mode: Mode = 'classico',
  ) {
    this.slots = slotsOf(formation);
    this.lineup = this.slots.map(() => null);
  }

  get rerollsUsed(): number {
    return REROLLS - this.rerollsLeft;
  }

  get filled(): number {
    return this.lineup.filter(Boolean).length;
  }

  get complete(): boolean {
    return this.filled === this.slots.length;
  }

  private pickEntry(nation?: Nation, otherThan?: number): Squad {
    const pool = nation
      ? [nation]
      : NATIONS.filter(
          (n) => !this.usedNations.has(n.name) || this.usedNations.size >= NATIONS.length,
        );
    const n = pool[Math.floor(this.rng() * pool.length)]!;
    const years = Object.keys(n.cups)
      .map(Number)
      .filter((y) => y !== otherThan);
    const year = years[Math.floor(this.rng() * years.length)] ?? otherThan!;
    return squadOf(n, year);
  }

  /** Draws a new team (a nation not used yet, from one of its Cups). */
  draw(): Squad {
    this.current = this.pickEntry();
    this.usedNations.add(this.current.nation);
    return this.current;
  }

  /** `nation`: another team; `cup`: the same team in another Cup (or another team if it has one). */
  reroll(kind: 'nation' | 'cup'): boolean {
    const cur = this.current;
    if (!cur || this.rerollsLeft <= 0 || this.complete) return false;
    this.rerollsLeft--;
    this.usedNations.delete(cur.nation);
    const nation = NATIONS.find((n) => n.name === cur.nation)!;
    if (kind === 'cup' && Object.keys(nation.cups).length > 1) {
      this.current = this.pickEntry(nation, cur.year);
    } else {
      this.current = this.pickEntry();
    }
    this.usedNations.add(this.current.nation);
    return true;
  }

  private openSlot(p: Player): number {
    const exact = this.slots.findIndex((s, i) => !this.lineup[i] && s.role === p.role);
    if (exact >= 0) return exact;
    return p.alt ? this.slots.findIndex((s, i) => !this.lineup[i] && s.role === p.alt) : -1;
  }

  /** Players of the current team that fit an open slot. */
  eligible(): Player[] {
    return (this.current?.players ?? []).filter((p) => this.openSlot(p) >= 0);
  }

  /** Takes a player of the current team. Returns the slot index he fills, or -1. */
  pick(num: number): number {
    const p = this.current?.players.find((x) => x.num === num);
    if (!p) return -1;
    const slot = this.openSlot(p);
    if (slot < 0) return -1;
    this.lineup[slot] = p;
    this.current = null;
    return slot;
  }

  get stats(): TeamStats {
    const by = (roles: readonly Role[]) =>
      this.lineup.flatMap((p, i) => (p && roles.includes(this.slots[i]!.role) ? [p.rating] : []));
    const keeper = avg(by(['GOL']));
    const def = avg(by(['LD', 'LE', 'ZAG']));
    const mid = avg(by(['VOL', 'MC', 'MEI', 'ME', 'MD']));
    const att = avg(by(['PE', 'PD', 'CA']));
    const f = FORMATIONS[this.formation];
    const lean = this.style === 'ofensivo' ? 3 : this.style === 'defensivo' ? -3 : 0;
    const all = avg(this.lineup.flatMap((p) => (p ? [p.rating] : [])));
    return {
      overall: Math.round(all),
      attack: 0.5 * att + 0.35 * mid + 0.15 * def + f.att + lean,
      defence: 0.25 * keeper + 0.45 * def + 0.3 * mid + f.def - lean,
      keeper,
    };
  }

  /** Seven opponents of rising strength, picked from the same table of Cups. */
  opponents(): Opponent[] {
    const all = NATIONS.flatMap((n) =>
      Object.entries(n.cups).map(([y, s]) => ({ nation: n, year: Number(y), strength: s })),
    );
    const used = new Set<string>();
    return OPPONENT_TARGETS.map((target) => {
      const want = target + (this.rng() - 0.5) * 4;
      const best = all
        .filter((e) => !used.has(e.nation.name))
        .sort((a, b) => Math.abs(a.strength - want) - Math.abs(b.strength - want))[0]!;
      used.add(best.nation.name);
      const jitter = () => (this.rng() - 0.5) * 6;
      return {
        nation: best.nation.name,
        flag: best.nation.flag,
        year: best.year,
        attack: best.strength + jitter(),
        defence: best.strength + jitter(),
        keeper: best.strength,
      };
    });
  }

  playMatch(stage: string, opp: Opponent): MatchResult {
    const me = this.stats;
    const goals = poisson(BASE_GOALS * Math.exp((me.attack - opp.defence) / 18), this.rng);
    const against = poisson(BASE_GOALS * Math.exp((opp.attack - me.defence) / 18), this.rng);
    if (goals !== against)
      return { stage, opponent: opp, goals, against, pens: null, win: goals > against };
    // Level after 90 minutes: penalties, nudged by the goalkeepers.
    const odds = clamp(0.5 + (me.keeper - opp.keeper) / 200, 0.3, 0.7);
    let a = 0;
    let b = 0;
    for (let i = 0; i < 5; i++) {
      if (this.rng() < 0.76) a++;
      if (this.rng() < 0.76) b++;
    }
    while (a === b) {
      if (this.rng() < 0.76) a++;
      if (this.rng() < 0.76) b++;
      if (a === b && this.rng() < odds) a++;
    }
    return { stage, opponent: opp, goals, against, pens: [a, b], win: a > b };
  }

  /** Plays the knockout run until a loss (or the final). Needs a complete line-up. */
  tournament(): Tournament {
    const opps = this.opponents();
    const matches: MatchResult[] = [];
    for (let i = 0; i < MATCHES; i++) {
      const m = this.playMatch(STAGES[i]!, opps[i]!);
      matches.push(m);
      if (!m.win) break;
    }
    const wins = matches.filter((m) => m.win).length;
    const champion = wins === MATCHES;
    const goalDiff = matches.reduce((s, m) => s + m.goals - m.against, 0);
    const base = wins * 1000 + Math.max(0, goalDiff) * 20 + (champion ? 2000 : 0);
    return {
      matches,
      wins,
      champion,
      goalDiff,
      score: Math.round(base * (this.mode === 'almanaque' ? 1.5 : 1)),
    };
  }
}
