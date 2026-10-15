/**
 * Street fight vs the CPU — pure simulation (no Phaser). Positions are in world pixels on a flat
 * stage; `y` is the height above the ground. Inputs carry held directions plus pressed-this-step
 * buttons, so the same rules drive the player and the CPU.
 */

export type Rng = () => number;

export const STAGE_LEFT = 50;
export const STAGE_RIGHT = 670;
/** Fighters can't get closer than this (center to center). */
export const PUSH_DIST = 64;
const HURT_HALF = 32;

const GRAVITY = 2600;
const JUMP_VY = 940;
const JUMP_VX = 250;
const WALK_FWD = 250;
const WALK_BACK = 190;
export const ROUND_TIME = 60;
export const MAX_METER = 100;
const PROJECTILE_SPEED = 620;
const PROJECTILE_HALF = 26;
/** Fireballs fly low: a fighter whose feet are above FIREBALL_CLEAR jumps over them. */
export const FIREBALL_Y = 90;
const FIREBALL_CLEAR = 70;

export type AttackKind = 'punch' | 'kick' | 'airKick' | 'special';

export interface AttackData {
  readonly startup: number;
  readonly active: number;
  readonly recovery: number;
  readonly damage: number;
  /** Reach from the attacker's center. */
  readonly range: number;
  readonly hitstun: number;
  readonly blockstun: number;
  readonly knockback: number;
}

export const ATTACKS: Record<AttackKind, AttackData> = {
  punch: {
    startup: 0.07,
    active: 0.08,
    recovery: 0.14,
    damage: 6,
    range: 96,
    hitstun: 0.32,
    blockstun: 0.16,
    knockback: 140,
  },
  kick: {
    startup: 0.15,
    active: 0.1,
    recovery: 0.26,
    damage: 11,
    range: 128,
    hitstun: 0.4,
    blockstun: 0.2,
    knockback: 260,
  },
  airKick: {
    startup: 0.06,
    active: 0.3,
    recovery: 0.05,
    damage: 10,
    range: 112,
    hitstun: 0.42,
    blockstun: 0.2,
    knockback: 220,
  },
  special: {
    startup: 0.28,
    active: 0.02,
    recovery: 0.32,
    damage: 20,
    range: 0,
    hitstun: 0.55,
    blockstun: 0.3,
    knockback: 320,
  },
};

export type FighterState = 'idle' | 'walk' | 'jump' | 'attack' | 'hit' | 'block' | 'ko';

export interface FighterStats {
  readonly maxHp: number;
  readonly power: number;
  readonly speed: number;
}

export interface Fighter {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  hp: number;
  readonly stats: FighterStats;
  meter: number;
  state: FighterState;
  /** Time spent in the current state. */
  t: number;
  /** For 'hit'/'block': how long it lasts. */
  stun: number;
  attack: AttackKind | null;
  /** The current attack already connected (for the special: the fireball was thrown). */
  attackHit: boolean;
  /** Hits landed in a row while the opponent stayed in hitstun. */
  combo: number;
  /** Walking backwards (away from the opponent) blocks incoming attacks. */
  guarding: boolean;
}

export interface FightInput {
  left: boolean;
  right: boolean;
  /** Pressed this step. */
  jump: boolean;
  punch: boolean;
  kick: boolean;
  special: boolean;
}

export const NO_INPUT: FightInput = {
  left: false,
  right: false,
  jump: false,
  punch: false,
  kick: false,
  special: false,
};

export interface Projectile {
  readonly id: number;
  readonly owner: 0 | 1;
  x: number;
  readonly y: number;
  readonly vx: number;
}

export type FightEvent =
  | {
      type: 'hit';
      attacker: 0 | 1;
      damage: number;
      blocked: boolean;
      combo: number;
      kind: AttackKind;
      x: number;
      y: number;
    }
  | { type: 'whiff'; attacker: 0 | 1; kind: AttackKind }
  | { type: 'special'; owner: 0 | 1 }
  | { type: 'clash'; x: number }
  | { type: 'ko'; winner: 0 | 1 }
  | { type: 'timeup'; winner: 0 | 1 | null };

export function makeFighter(stats: FighterStats, x: number, facing: 1 | -1): Fighter {
  return {
    x,
    y: 0,
    vx: 0,
    vy: 0,
    facing,
    hp: stats.maxHp,
    stats,
    meter: 0,
    state: 'idle',
    t: 0,
    stun: 0,
    attack: null,
    attackHit: false,
    combo: 0,
    guarding: false,
  };
}

/** Damage drops along a combo so long strings stay fair. */
export const comboScale = (combo: number) => Math.max(0.5, 1 - 0.1 * (combo - 1));

const other = (i: 0 | 1): 0 | 1 => (i === 0 ? 1 : 0);

export class FightSim {
  readonly fighters: [Fighter, Fighter];
  readonly projectiles: Projectile[] = [];
  time = ROUND_TIME;
  winner: 0 | 1 | null = null;
  over = false;
  private ids = 0;

  constructor(player: FighterStats, cpu: FighterStats) {
    this.fighters = [makeFighter(player, 220, 1), makeFighter(cpu, 500, -1)];
  }

  step(dt: number, inputs: readonly [FightInput, FightInput]): FightEvent[] {
    const events: FightEvent[] = [];
    if (this.over) {
      // Let the KO'd fighter finish falling.
      for (const f of this.fighters) this.physics(f, dt);
      return events;
    }
    this.time = Math.max(0, this.time - dt);

    for (const i of [0, 1] as const) this.control(i, inputs[i], dt, events);
    for (const f of this.fighters) this.physics(f, dt);
    this.separate();
    for (const i of [0, 1] as const) this.resolveAttack(i, events);
    this.moveProjectiles(dt, events);

    const [a, b] = this.fighters;
    if (a.hp <= 0 || b.hp <= 0) {
      this.over = true;
      this.winner = a.hp <= 0 ? 1 : 0;
      const loser = this.fighters[other(this.winner)];
      loser.state = 'ko';
      loser.t = 0;
      events.push({ type: 'ko', winner: this.winner });
    } else if (this.time <= 0) {
      this.over = true;
      const ra = a.hp / a.stats.maxHp;
      const rb = b.hp / b.stats.maxHp;
      this.winner = ra === rb ? null : ra > rb ? 0 : 1;
      events.push({ type: 'timeup', winner: this.winner });
    }
    return events;
  }

  private setState(f: Fighter, state: FighterState): void {
    f.state = state;
    f.t = 0;
  }

  private control(i: 0 | 1, input: FightInput, dt: number, events: FightEvent[]): void {
    const f = this.fighters[i];
    const opp = this.fighters[other(i)];
    f.t += dt;
    if (f.state === 'ko') return;

    if (f.state === 'hit' || f.state === 'block') {
      if (f.t < f.stun) return;
      const landed = f.y <= 0;
      this.setState(f, landed ? 'idle' : 'jump');
      if (landed) opp.combo = 0;
    }

    if (f.state === 'attack') {
      const a = ATTACKS[f.attack!];
      if (f.attack === 'special' && f.t >= a.startup && !f.attackHit) {
        f.attackHit = true;
        this.projectiles.push({
          id: ++this.ids,
          owner: i,
          x: f.x + f.facing * 70,
          y: FIREBALL_Y,
          vx: f.facing * PROJECTILE_SPEED,
        });
        events.push({ type: 'special', owner: i });
      }
      if (f.attack === 'airKick') {
        if (f.y <= 0) {
          f.attack = null;
          this.setState(f, 'idle');
        }
        return;
      }
      if (f.t >= a.startup + a.active + a.recovery) {
        if (!f.attackHit) events.push({ type: 'whiff', attacker: i, kind: f.attack! });
        f.attack = null;
        this.setState(f, 'idle');
      }
      return;
    }

    if (f.state === 'jump') {
      if (input.kick || input.punch) {
        f.attack = 'airKick';
        f.attackHit = false;
        this.setState(f, 'attack');
      }
      return;
    }

    // Grounded and free to act: face the opponent.
    f.facing = opp.x >= f.x ? 1 : -1;
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    f.guarding = dir === -f.facing;

    if (input.jump) {
      f.vy = JUMP_VY;
      f.vx = dir * JUMP_VX * f.stats.speed;
      f.guarding = false;
      this.setState(f, 'jump');
      return;
    }
    let attack: AttackKind | null = null;
    if (input.special && f.meter >= MAX_METER) attack = 'special';
    else if (input.kick) attack = 'kick';
    else if (input.punch) attack = 'punch';
    if (attack) {
      if (attack === 'special') f.meter = 0;
      f.attack = attack;
      f.attackHit = false;
      f.vx = 0;
      f.guarding = false;
      this.setState(f, 'attack');
      return;
    }
    f.vx = dir === 0 ? 0 : dir * (dir === f.facing ? WALK_FWD : WALK_BACK) * f.stats.speed;
    const next: FighterState = dir === 0 ? 'idle' : 'walk';
    if (f.state !== next) this.setState(f, next);
  }

  private physics(f: Fighter, dt: number): void {
    if (f.y > 0 || f.vy > 0) {
      f.vy -= GRAVITY * dt;
      f.y = Math.max(0, f.y + f.vy * dt);
      if (f.y === 0) {
        f.vy = 0;
        if (f.state === 'jump') {
          f.vx = 0;
          this.setState(f, 'idle');
        }
      }
    } else if (f.state === 'hit' || f.state === 'block' || f.state === 'ko') {
      f.vx *= Math.exp(-dt * 8); // knockback slides out
    }
    f.x = Math.max(STAGE_LEFT, Math.min(STAGE_RIGHT, f.x + f.vx * dt));
  }

  /** Bodies don't overlap on the ground; jumping over the other fighter is allowed. */
  private separate(): void {
    const [a, b] = this.fighters;
    if (a.y > 90 || b.y > 90) return;
    const dx = b.x - a.x;
    const overlap = PUSH_DIST - Math.abs(dx);
    if (overlap <= 0) return;
    const sign = dx === 0 ? a.facing : Math.sign(dx);
    a.x -= (sign * overlap) / 2;
    b.x += (sign * overlap) / 2;
    // Pinned against a wall: the one in the open gets pushed instead.
    const fix =
      Math.min(0, STAGE_RIGHT - Math.max(a.x, b.x)) + Math.max(0, STAGE_LEFT - Math.min(a.x, b.x));
    a.x += fix;
    b.x += fix;
  }

  private resolveAttack(i: 0 | 1, events: FightEvent[]): void {
    const f = this.fighters[i];
    if (f.state !== 'attack' || f.attackHit || !f.attack || f.attack === 'special') return;
    const a = ATTACKS[f.attack];
    if (f.t < a.startup || f.t >= a.startup + a.active) return;
    const target = this.fighters[other(i)];
    if (target.state === 'ko') return;
    const dx = (target.x - f.x) * f.facing;
    if (dx < -10 || dx > a.range + HURT_HALF) return;
    // A grounded punch passes under someone high in the air.
    if (f.attack === 'punch' && target.y > 120) return;
    f.attackHit = true;
    const reach = Math.min(a.range, Math.abs(target.x - f.x) - 10);
    this.applyHit(i, f.attack, f.x + f.facing * reach, events);
  }

  private moveProjectiles(dt: number, events: FightEvent[]): void {
    for (const p of this.projectiles) p.x += p.vx * dt;
    // Two fireballs cancel each other out.
    const p0 = this.projectiles.find((p) => p.owner === 0);
    const p1 = this.projectiles.find((p) => p.owner === 1);
    if (p0 && p1 && Math.abs(p0.x - p1.x) < PROJECTILE_HALF * 2) {
      events.push({ type: 'clash', x: (p0.x + p1.x) / 2 });
      this.projectiles.splice(this.projectiles.indexOf(p0), 1);
      this.projectiles.splice(this.projectiles.indexOf(p1), 1);
    }
    for (let k = this.projectiles.length - 1; k >= 0; k--) {
      const p = this.projectiles[k]!;
      const target = this.fighters[other(p.owner)];
      const hits =
        target.state !== 'ko' &&
        Math.abs(target.x - p.x) < HURT_HALF + PROJECTILE_HALF &&
        target.y < FIREBALL_CLEAR;
      if (hits) {
        this.projectiles.splice(k, 1);
        this.applyHit(p.owner, 'special', p.x, events);
      } else if (p.x < STAGE_LEFT - 80 || p.x > STAGE_RIGHT + 80) {
        this.projectiles.splice(k, 1);
      }
    }
  }

  private applyHit(i: 0 | 1, kind: AttackKind, x: number, events: FightEvent[]): void {
    const attacker = this.fighters[i];
    const target = this.fighters[other(i)];
    const a = ATTACKS[kind];
    const power = attacker.stats.power;
    const push = Math.sign(target.x - x) || attacker.facing;
    const canBlock =
      target.guarding &&
      target.y === 0 &&
      (target.state === 'idle' || target.state === 'walk' || target.state === 'block');

    if (canBlock) {
      // Chip damage never finishes a fight.
      const chip = Math.max(1, Math.round(a.damage * power * 0.15));
      target.hp = Math.max(1, target.hp - chip);
      target.stun = a.blockstun;
      target.vx = push * a.knockback * 0.6;
      this.setState(target, 'block');
      attacker.meter = Math.min(MAX_METER, attacker.meter + 3);
      target.meter = Math.min(MAX_METER, target.meter + 4);
      events.push({
        type: 'hit',
        attacker: i,
        damage: chip,
        blocked: true,
        combo: 0,
        kind,
        x,
        y: 120,
      });
      return;
    }

    attacker.combo = target.state === 'hit' ? attacker.combo + 1 : 1;
    const damage = Math.max(1, Math.round(a.damage * power * comboScale(attacker.combo)));
    target.hp = Math.max(0, target.hp - damage);
    target.stun = a.hitstun;
    target.vx = push * a.knockback;
    if (target.y > 0) target.vy = Math.max(target.vy, 300);
    target.attack = null;
    target.guarding = false;
    this.setState(target, 'hit');
    attacker.meter = Math.min(MAX_METER, attacker.meter + 9);
    target.meter = Math.min(MAX_METER, target.meter + 6);
    events.push({
      type: 'hit',
      attacker: i,
      damage,
      blocked: false,
      combo: attacker.combo,
      kind,
      x,
      y: kind === 'airKick' ? 150 : kind === 'kick' ? 95 : 125,
    });
  }
}
