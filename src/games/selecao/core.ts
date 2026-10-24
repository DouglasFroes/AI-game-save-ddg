/**
 * "Seleção dos Sonhos" — pure rules. Pick a formation and a style, then draw a national team
 * from a random World Cup and take one of its players, eleven times. Your side then plays seven
 * knockout matches (three group games, round of 16, quarters, semi and final): lose one and
 * you are out, win them all and you lift the cup. Three re-rolls help a bad draw.
 */
import { NATIONS, type Nation } from './data';

/** Anything that can be drawn: a national team (or a club) with the seasons it can come from. */
export type Team = Nation;

export type Rng = () => number;

export type Role =
  'GOL' | 'LD' | 'LE' | 'ZAG' | 'VOL' | 'MC' | 'MEI' | 'ME' | 'MD' | 'PE' | 'PD' | 'CA';

export interface Player {
  readonly num: number;
  readonly name: string;
  readonly role: Role;
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

/**
 * Which player positions can fill a slot, best fit first. A slot always takes its own role
 * first; the rest is the natural neighbours (a centre-back at full-back, a winger up front…).
 */
export const ACCEPTS: Readonly<Record<Role, readonly Role[]>> = {
  GOL: ['GOL'],
  ZAG: ['ZAG', 'LD', 'LE', 'VOL'],
  LD: ['LD', 'LE', 'ZAG', 'MD'],
  LE: ['LE', 'LD', 'ZAG', 'ME'],
  VOL: ['VOL', 'MC', 'ZAG'],
  MC: ['MC', 'VOL', 'MEI'],
  MEI: ['MEI', 'MC', 'ME', 'MD'],
  ME: ['ME', 'MD', 'MEI', 'PE', 'PD'],
  MD: ['MD', 'ME', 'MEI', 'PD', 'PE'],
  PE: ['PE', 'PD', 'ME', 'CA'],
  PD: ['PD', 'PE', 'MD', 'CA'],
  CA: ['CA', 'PE', 'PD', 'MEI'],
};

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

const fold = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** Years of a team that have a roster, i.e. that can be drawn. */
export const draftYears = (team: Team): number[] =>
  Object.keys(team.cups)
    .map(Number)
    .filter((y) => team.cups[y]!.roster);

/** Rating offset of a roster mark: `*` star, `~` reserve. */
const TIER: Record<string, number> = { '*': 6, '': -1, '~': -7 };

/** The squad of a team in a given year (the same every time): real names, rated from the year. */
export function squadOf(team: Team, year: number): Squad {
  const campaign = team.cups[year]!;
  const rng = mulberry(hash(`${team.name}${year}`));
  const seen = new Set<string>();
  const players: Player[] = [];
  for (const group of (campaign.roster ?? '').split(';')) {
    const [roleText, names = ''] = group.split(':');
    const role = roleText!.trim() as Role;
    for (const raw of names.split(',')) {
      const mark = /[*~]$/.exec(raw.trim())?.[0] ?? '';
      const name = raw.trim().replace(/[*~]$/, '');
      if (!name || seen.has(fold(name))) continue;
      seen.add(fold(name));
      const jitter = Math.round((rng() - 0.5) * 4);
      const rating = Math.round(clamp(campaign.strength + TIER[mark]! + jitter, 52, 97));
      players.push({ num: players.length + 1, name, role, rating });
    }
  }
  return { nation: team.name, flag: team.flag, year, players };
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

export const LEAGUE_TEAMS = 20;
export const LEAGUE_ROUNDS = (LEAGUE_TEAMS - 1) * 2;
const HOME_EDGE = 2.5;
/** Rivals play above their cup strength: a league is longer and tougher than one knockout run. */
const LEAGUE_BOOST = 4;

export interface LeagueTeam {
  readonly name: string;
  readonly flag: string;
  /** 0 for your own side. */
  readonly year: number;
  readonly attack: number;
  readonly defence: number;
  readonly me: boolean;
}

export interface TableRow {
  /** Index into `Season.teams`. */
  readonly team: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
}

export interface LeagueMatch {
  readonly home: number;
  readonly away: number;
  readonly homeGoals: number;
  readonly awayGoals: number;
}

export interface LeagueRound {
  readonly number: number;
  readonly matches: readonly LeagueMatch[];
  /** The table after this round, best first. */
  readonly table: readonly TableRow[];
}

/** A whole league season: every fixture, the table after each round and the final summary. */
export interface Season {
  readonly teams: readonly LeagueTeam[];
  readonly rounds: readonly LeagueRound[];
  readonly final: readonly TableRow[];
  /** Your final place (1 = champion). */
  readonly position: number;
  readonly points: number;
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
  readonly goalDiff: number;
  readonly champion: boolean;
  readonly score: number;
}

const sortTable = (rows: readonly TableRow[]): TableRow[] =>
  [...rows].sort(
    (a, b) => b.points - a.points || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf || a.team - b.team,
  );

/** Round-robin fixtures (circle method): 19 rounds, then the same pairs with the venues swapped. */
export function leagueFixtures(n = LEAGUE_TEAMS): Array<Array<[number, number]>> {
  const ring = Array.from({ length: n }, (_, i) => i);
  const first: Array<Array<[number, number]>> = [];
  for (let r = 0; r < n - 1; r++) {
    const round: Array<[number, number]> = [];
    for (let i = 0; i < n / 2; i++) {
      const a = ring[i]!;
      const b = ring[n - 1 - i]!;
      round.push((r + i) % 2 === 0 ? [a, b] : [b, a]);
    }
    first.push(round);
    ring.splice(1, 0, ring.pop()!);
  }
  return [...first, ...first.map((round) => round.map(([h, a]): [number, number] => [a, h]))];
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
    /** The teams that can be drawn (and that the opponents come from). */
    private readonly teams: readonly Team[] = NATIONS,
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

  private pickEntry(team?: Team, otherThan?: number): Squad {
    const drawable = this.teams.filter((n) => draftYears(n).length > 0);
    const pool = team
      ? [team]
      : drawable.filter(
          (n) => !this.usedNations.has(n.name) || this.usedNations.size >= drawable.length,
        );
    const n = pool[Math.floor(this.rng() * pool.length)]!;
    const years = draftYears(n).filter((y) => y !== otherThan);
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
    const nation = this.teams.find((n) => n.name === cur.nation)!;
    if (kind === 'cup' && draftYears(nation).length > 1) {
      this.current = this.pickEntry(nation, cur.year);
    } else {
      this.current = this.pickEntry();
    }
    this.usedNations.add(this.current.nation);
    return true;
  }

  private openSlot(p: Player): number {
    const open = (role: Role) => this.slots.findIndex((s, i) => !this.lineup[i] && s.role === role);
    const exact = open(p.role);
    if (exact >= 0) return exact;
    // No slot of his own position left: the first open slot that takes him.
    return this.slots.findIndex((s, i) => !this.lineup[i] && ACCEPTS[s.role].includes(p.role));
  }

  /** The position a player would take on the pitch right now (null when no slot fits). */
  fillsAs(p: Player): Role | null {
    const i = this.openSlot(p);
    return i >= 0 ? this.slots[i]!.role : null;
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
  opponents(boost = 0): Opponent[] {
    const all = this.teams.flatMap((n) =>
      Object.entries(n.cups).map(([y, camp]) => ({
        nation: n,
        year: Number(y),
        strength: camp.strength,
      })),
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
        attack: best.strength + jitter() + boost,
        defence: best.strength + jitter() + boost,
        keeper: best.strength + boost,
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
  tournament(boost = 0): Tournament {
    const opps = this.opponents(boost);
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

  /** The 19 rivals of a league season: as many different clubs as possible, in random strengths. */
  private leagueRivals(): LeagueTeam[] {
    const all = this.teams.flatMap((n) =>
      Object.entries(n.cups).map(([y, camp]) => ({ n, year: Number(y), strength: camp.strength })),
    );
    all.sort(() => this.rng() - 0.5);
    const picked: typeof all = [];
    const clubs = new Set<string>();
    for (const e of all)
      if (picked.length < LEAGUE_TEAMS - 1 && !clubs.has(e.n.name)) {
        clubs.add(e.n.name);
        picked.push(e);
      }
    for (const e of all)
      if (picked.length < LEAGUE_TEAMS - 1 && !picked.includes(e)) picked.push(e);
    const jitter = () => (this.rng() - 0.5) * 6;
    return picked.map((e) => ({
      name: e.n.name,
      flag: e.n.flag,
      year: e.year,
      attack: e.strength + LEAGUE_BOOST + jitter(),
      defence: e.strength + LEAGUE_BOOST + jitter(),
      me: false,
    }));
  }

  private leagueGoals(home: LeagueTeam, away: LeagueTeam): [number, number] {
    return [
      poisson(BASE_GOALS * Math.exp((home.attack + HOME_EDGE - away.defence) / 18), this.rng),
      poisson(BASE_GOALS * Math.exp((away.attack - home.defence - HOME_EDGE) / 18), this.rng),
    ];
  }

  /** Plays a 38-round league (everyone twice) with your line-up against 19 rivals. */
  season(): Season {
    const me = this.stats;
    const teams: LeagueTeam[] = [
      { name: 'Seu time', flag: '⭐', year: 0, attack: me.attack, defence: me.defence, me: true },
      ...this.leagueRivals(),
    ];
    const rows: TableRow[] = teams.map((_, team) => ({
      team,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      points: 0,
    }));
    const rounds = leagueFixtures(teams.length).map((fixtures, i): LeagueRound => {
      const matches = fixtures.map(([home, away]): LeagueMatch => {
        const [homeGoals, awayGoals] = this.leagueGoals(teams[home]!, teams[away]!);
        const h = rows[home]!;
        const a = rows[away]!;
        h.played++;
        a.played++;
        h.gf += homeGoals;
        h.ga += awayGoals;
        a.gf += awayGoals;
        a.ga += homeGoals;
        if (homeGoals > awayGoals) {
          h.won++;
          h.points += 3;
          a.lost++;
        } else if (homeGoals < awayGoals) {
          a.won++;
          a.points += 3;
          h.lost++;
        } else {
          h.drawn++;
          a.drawn++;
          h.points++;
          a.points++;
        }
        return { home, away, homeGoals, awayGoals };
      });
      return {
        number: i + 1,
        matches,
        table: sortTable(rows).map((r) => ({ ...r })),
      };
    });
    const final = rounds[rounds.length - 1]!.table;
    const position = final.findIndex((r) => r.team === 0) + 1;
    const mine = final[position - 1]!;
    const goalDiff = mine.gf - mine.ga;
    const bonus = position === 1 ? 2000 : position <= 4 ? 1000 : position <= 6 ? 500 : 0;
    const base = mine.points * 100 + Math.max(0, goalDiff) * 5 + bonus;
    return {
      teams,
      rounds,
      final,
      position,
      points: mine.points,
      wins: mine.won,
      draws: mine.drawn,
      losses: mine.lost,
      goalDiff,
      champion: position === 1,
      score: Math.round(base * (this.mode === 'almanaque' ? 1.5 : 1)),
    };
  }
}
