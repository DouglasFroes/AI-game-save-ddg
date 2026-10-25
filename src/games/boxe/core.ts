/**
 * "Boxe" — pure rules of a first-person fight against a ladder of five boxers. The rival winds up
 * before each punch (that is your cue): dodge a hook from the LEFT by slipping RIGHT, a hook from
 * the RIGHT by slipping LEFT and a straight by ducking. A dodged punch leaves him open for a moment
 * (counters do double damage). Your jabs only land where his guard is open, and they cost stamina.
 */
import type { Rnd } from '@/platform/rnd';

export type Dodge = 'left' | 'right' | 'down';
export type Side = 'L' | 'R';
/** Where his punch comes from, on your screen. */
export type AttackKind = 'hookL' | 'hookR' | 'straight';
/** What his gloves cover. */
export type Guard = 'alta' | 'esquerda' | 'direita' | 'aberta';

export const ROUNDS = 3;
export const ROUND_TIME = 45;
export const MY_HP = 100;
const STAMINA_COST = 14;
const STAMINA_REGEN = 30;
const PUNCH_COOLDOWN = 0.22;
const DODGE_TIME = 0.42;
const EXPOSED_TIME = 1.1;
const STRIKE_TIME = 0.16;

export const RIVALS = [
  {
    name: 'Zé Pancada',
    hp: 90,
    wind: 0.85,
    rest: [1.4, 2.4],
    combo: 0,
    power: 12,
    guard: 0.35,
    feint: 0,
  },
  {
    name: 'Tigrão',
    hp: 110,
    wind: 0.72,
    rest: [1.1, 2],
    combo: 0.35,
    power: 14,
    guard: 0.45,
    feint: 0,
  },
  {
    name: 'Rita Relâmpago',
    hp: 110,
    wind: 0.55,
    rest: [0.8, 1.6],
    combo: 0.3,
    power: 12,
    guard: 0.45,
    feint: 0.1,
  },
  {
    name: 'Muralha',
    hp: 150,
    wind: 0.65,
    rest: [1, 1.8],
    combo: 0.25,
    power: 16,
    guard: 0.7,
    feint: 0.15,
  },
  {
    name: 'O Campeão',
    hp: 150,
    wind: 0.5,
    rest: [0.7, 1.4],
    combo: 0.45,
    power: 17,
    guard: 0.6,
    feint: 0.25,
  },
] as const;

/** The right dodge for each punch. */
export const ANSWER: Record<AttackKind, Dodge> = {
  hookL: 'right',
  hookR: 'left',
  straight: 'down',
};

/** Whether a jab to `side` gets through the guard (his open spots). */
export function lands(guard: Guard, side: Side): boolean {
  if (guard === 'aberta') return true;
  if (guard === 'alta') return false;
  return guard === 'esquerda' ? side === 'R' : side === 'L';
}

export type BoxEvent =
  | { type: 'windup'; kind: AttackKind }
  | { type: 'feint' }
  | { type: 'dodged'; kind: AttackKind }
  | { type: 'hurt'; damage: number }
  | { type: 'hit'; damage: number; counter: boolean; side: Side }
  | { type: 'blocked'; side: Side }
  | { type: 'tired' }
  | { type: 'guard'; guard: Guard }
  | { type: 'round'; round: number }
  | { type: 'ko'; winner: 'me' | 'them' }
  | { type: 'decision'; winner: 'me' | 'them' }
  | { type: 'over' };

export class BoxSim {
  rival = 0;
  hp: number = RIVALS[0].hp;
  myHp = MY_HP;
  stamina = 100;
  round = 1;
  clock = ROUND_TIME;
  guard: Guard = 'alta';
  /** The punch he is throwing: wind-up, then the strike. */
  attack: { kind: AttackKind; t: number; wind: number; feint: boolean } | null = null;
  /** Seconds he stays open after you dodged. */
  exposed = 0;
  dodge: { dir: Dodge; t: number } | null = null;
  score = 0;
  dealt = 0;
  taken = 0;
  dodges = 0;
  counters = 0;
  kos = 0;
  over = false;
  /** Beat all five. */
  champion = false;
  /** True between fights/rounds while the scene shows the result. */
  paused = false;
  private rest = 1.5;
  private guardT = 1;
  private cooldown = 0;
  private comboLeft = 0;

  constructor(private readonly rnd: Rnd = Math.random) {}

  get info() {
    return RIVALS[Math.min(this.rival, RIVALS.length - 1)]!;
  }

  /** Slip or duck: good for a short moment. */
  slip(dir: Dodge): boolean {
    if (this.over || this.paused || this.dodge) return false;
    this.dodge = { dir, t: 0 };
    return true;
  }

  punch(side: Side): BoxEvent[] {
    if (this.over || this.paused || this.cooldown > 0) return [];
    // Mid-dodge you can't punch, except to counter an opening (the counter ends the dodge).
    if (this.dodge && this.exposed === 0) return [];
    this.dodge = null;
    if (this.stamina < STAMINA_COST) return [{ type: 'tired' }];
    this.stamina -= STAMINA_COST;
    this.cooldown = PUNCH_COOLDOWN;
    const open = this.exposed > 0;
    // A jab while he winds up beats him to it (if it gets through).
    const interrupt = this.attack !== null && this.attack.t < this.attack.wind;
    if (!open && !lands(this.guard, side)) return [{ type: 'blocked', side }];
    const base = 6 + Math.floor(this.rnd() * 3);
    const damage = open ? base * 2 : interrupt ? Math.round(base * 1.5) : base;
    if (open) this.counters++;
    if (interrupt) {
      this.attack = null;
      this.rest = 0.6;
    }
    this.hp = Math.max(0, this.hp - damage);
    this.dealt += damage;
    this.score += damage * 10 + (open ? 30 : 0);
    const events: BoxEvent[] = [{ type: 'hit', damage, counter: open, side }];
    if (this.hp <= 0) events.push(...this.ko('me'));
    return events;
  }

  step(dt: number): BoxEvent[] {
    const events: BoxEvent[] = [];
    if (this.over || this.paused) return events;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.stamina = Math.min(100, this.stamina + STAMINA_REGEN * dt);
    this.exposed = Math.max(0, this.exposed - dt);
    if (this.dodge) {
      this.dodge.t += dt;
      if (this.dodge.t > DODGE_TIME) this.dodge = null;
    }
    this.clock -= dt;
    if (this.clock <= 0) return this.endRound(events);
    // His guard shifts now and then (not while he is open or punching).
    this.guardT -= dt;
    if (this.guardT <= 0 && !this.attack && this.exposed === 0) {
      const r = this.rnd();
      const g = this.info.guard;
      this.guard =
        r < g
          ? 'alta'
          : r < g + (1 - g) * 0.35
            ? 'esquerda'
            : r < g + (1 - g) * 0.7
              ? 'direita'
              : 'aberta';
      this.guardT = 0.8 + this.rnd() * 1.2;
      events.push({ type: 'guard', guard: this.guard });
    }
    if (this.exposed > 0) return events;
    if (!this.attack) {
      this.rest -= dt;
      if (this.rest <= 0) this.startAttack(events);
      return events;
    }
    const a = this.attack;
    a.t += dt;
    if (a.feint && a.t >= a.wind * 0.6) {
      // A fake: he pulls it back; dodging now wastes your move.
      this.attack = null;
      this.rest = 0.3;
      events.push({ type: 'feint' });
      return events;
    }
    if (a.t < a.wind + STRIKE_TIME) return events;
    // The punch arrives.
    this.attack = null;
    if (this.dodge && this.dodge.dir === ANSWER[a.kind]) {
      this.dodges++;
      this.score += 50;
      this.exposed = EXPOSED_TIME;
      this.guard = 'aberta';
      this.comboLeft = 0;
      this.rest = EXPOSED_TIME + 0.3;
      events.push({ type: 'dodged', kind: a.kind });
      return events;
    }
    const damage = this.info.power + Math.floor(this.rnd() * 5);
    this.myHp = Math.max(0, this.myHp - damage);
    this.taken += damage;
    events.push({ type: 'hurt', damage });
    if (this.myHp <= 0) return [...events, ...this.ko('them')];
    if (this.comboLeft > 0) {
      this.comboLeft--;
      this.rest = 0.15;
    } else this.rest = this.restTime();
    return events;
  }

  private restTime(): number {
    const [lo, hi] = this.info.rest;
    return lo + this.rnd() * (hi - lo);
  }

  private startAttack(events: BoxEvent[]): void {
    const kinds: AttackKind[] = ['hookL', 'hookR', 'straight'];
    const kind = kinds[Math.floor(this.rnd() * 3)]!;
    const feint = this.rnd() < this.info.feint;
    if (this.comboLeft === 0 && this.rnd() < this.info.combo) this.comboLeft = 1;
    this.attack = { kind, t: 0, wind: this.info.wind * (this.comboLeft > 0 ? 0.8 : 1), feint };
    this.guard = kind === 'straight' ? 'alta' : kind === 'hookL' ? 'direita' : 'esquerda';
    events.push({ type: 'windup', kind });
  }

  private ko(winner: 'me' | 'them'): BoxEvent[] {
    this.paused = true;
    this.attack = null;
    if (winner === 'me') {
      this.kos++;
      this.score += 1000 + Math.round(this.myHp * 5);
    } else this.over = true;
    const events: BoxEvent[] = [{ type: 'ko', winner }];
    if (winner === 'me' && this.rival + 1 >= RIVALS.length) {
      this.over = true;
      this.champion = true;
      events.push({ type: 'over' });
    } else if (winner === 'them') events.push({ type: 'over' });
    return events;
  }

  private endRound(events: BoxEvent[]): BoxEvent[] {
    this.attack = null;
    this.paused = true;
    if (this.round < ROUNDS) {
      events.push({ type: 'round', round: this.round + 1 });
      return events;
    }
    // On points: the damage each one did.
    const winner = this.dealt >= this.taken ? 'me' : 'them';
    events.push({ type: 'decision', winner });
    if (winner === 'me') {
      this.score += 500;
      if (this.rival + 1 >= RIVALS.length) {
        this.over = true;
        this.champion = true;
        events.push({ type: 'over' });
      }
    } else {
      this.over = true;
      events.push({ type: 'over' });
    }
    return events;
  }

  /** Continue after a round break. */
  nextRound(): void {
    this.round++;
    this.clock = ROUND_TIME;
    this.myHp = Math.min(MY_HP, this.myHp + 15);
    this.stamina = 100;
    this.rest = 1.2;
    this.paused = false;
  }

  /** Continue against the next boxer after a win. */
  nextRival(): void {
    this.rival++;
    this.hp = this.info.hp;
    this.myHp = MY_HP;
    this.round = 1;
    this.clock = ROUND_TIME;
    this.dealt = this.taken = 0;
    this.stamina = 100;
    this.rest = 1.5;
    this.exposed = 0;
    this.guard = 'alta';
    this.paused = false;
  }
}
