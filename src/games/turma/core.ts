/**
 * "Turma da Luta" combat — pure simulation (no Phaser).
 *
 * The loop is built on four ideas:
 *  - a fast 3-hit chain (tap ATAQUE again to continue; the 3rd hit knocks down);
 *  - GUARD is a held button with an energy bar; a guard pressed right before a hit is a PARRY
 *    (the attacker is stunned and the defender's power recharges);
 *  - every kid has ONE power on a short cooldown (no slow meter): ready at the start of a round,
 *    recharged faster by hitting, and it can cancel an attack that connected;
 *  - rounds: first to two round wins takes the fight.
 */

export type Rng = () => number;

export const STAGE_LEFT = 50;
export const STAGE_RIGHT = 670;
export const PUSH_DIST = 64;
const HURT_HALF = 30;
const GRAVITY = 2600;
const JUMP_VY = 960;
const JUMP_VX = 260;
const WALK_FWD = 270;
const WALK_BACK = 210;
export const ROUND_TIME = 45;
export const PARRY_WINDOW = 0.2;
export const GUARD_MAX = 100;
const GUARD_REGEN = 22;
/** Seconds of casting before a power takes effect, and of recovery after. */
export const CAST = 0.12;
const CAST_RECOVERY = 0.2;
const START_COOLDOWN = 1.5;
const PROJECTILE_HALF = 24;
export const PROJECTILE_Y = 95;

export type PowerKind = 'dash' | 'lightning' | 'ice' | 'quake' | 'heal' | 'fireball' | 'dive';
export type AttackKind = 'jab' | 'hook' | 'kick' | 'airKick' | 'dash' | 'dive' | 'special';
const CHAIN: readonly AttackKind[] = ['jab', 'hook', 'kick'];

export interface AttackData {
  readonly startup: number;
  readonly active: number;
  readonly recovery: number;
  readonly damage: number;
  readonly range: number;
  readonly hitstun: number;
  readonly knockback: number;
  readonly knockdown?: boolean;
}

export const ATTACKS: Record<AttackKind, AttackData> = {
  jab: {
    startup: 0.06,
    active: 0.07,
    recovery: 0.12,
    damage: 5,
    range: 92,
    hitstun: 0.3,
    knockback: 110,
  },
  hook: {
    startup: 0.07,
    active: 0.07,
    recovery: 0.14,
    damage: 6,
    range: 98,
    hitstun: 0.32,
    knockback: 150,
  },
  kick: {
    startup: 0.1,
    active: 0.1,
    recovery: 0.22,
    damage: 10,
    range: 132,
    hitstun: 0.5,
    knockback: 380,
    knockdown: true,
  },
  airKick: {
    startup: 0.05,
    active: 0.4,
    recovery: 0.05,
    damage: 9,
    range: 112,
    hitstun: 0.4,
    knockback: 240,
  },
  dash: {
    startup: 0,
    active: 0.38,
    recovery: 0.2,
    damage: 13,
    range: 88,
    hitstun: 0.5,
    knockback: 420,
    knockdown: true,
  },
  dive: {
    startup: 0,
    active: 9,
    recovery: 0,
    damage: 15,
    range: 112,
    hitstun: 0.5,
    knockback: 320,
    knockdown: true,
  },
  special: {
    startup: CAST,
    active: 0.02,
    recovery: CAST_RECOVERY,
    damage: 0,
    range: 0,
    hitstun: 0.4,
    knockback: 200,
  },
};

interface PowerSpec {
  readonly cooldown: number;
}
export const POWER_SPECS: Record<PowerKind, PowerSpec> = {
  fireball: { cooldown: 4 },
  dash: { cooldown: 5 },
  dive: { cooldown: 5.5 },
  ice: { cooldown: 6 },
  quake: { cooldown: 6 },
  lightning: { cooldown: 6.5 },
  heal: { cooldown: 9 },
};

type ProjectileKind = 'fireball' | 'ice';
const PROJECTILES: Record<
  ProjectileKind,
  { speed: number; damage: number; hitstun: number; freeze: number }
> = {
  fireball: { speed: 700, damage: 13, hitstun: 0.45, freeze: 0 },
  ice: { speed: 500, damage: 7, hitstun: 1, freeze: 1 },
};
const STRIKE_DELAY = 0.5;
const STRIKE_HALF = 60;
const QUAKE_RANGE = 200;
const HEAL_RATIO = 0.2;

export type FighterState =
  'idle' | 'walk' | 'jump' | 'attack' | 'power' | 'guard' | 'hit' | 'down' | 'ko';

export interface FighterSetup {
  readonly kid: number;
  readonly power: PowerKind;
  readonly maxHp: number;
  /** Damage multiplier. */
  readonly dmg: number;
  readonly speed: number;
  /** Cooldown multiplier (lower is faster). */
  readonly cd: number;
  /** Guard energy multiplier. */
  readonly guard: number;
  /** Share of dealt damage healed. */
  readonly vamp: number;
}

export interface Fighter {
  readonly setup: FighterSetup;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  hp: number;
  state: FighterState;
  t: number;
  stun: number;
  attack: AttackKind | null;
  attackHit: boolean;
  /** Index in the 3-hit chain of the current/last attack. */
  step: number;
  queued: boolean;
  /** Time since the last attack ended (the chain resets after a pause). */
  chainT: number;
  guard: number;
  /** Seconds since the guard was raised (a hit within PARRY_WINDOW is a parry). */
  guardT: number;
  powerCd: number;
  combo: number;
  buff: number;
  invuln: number;
  frozen: number;
  /** Damage taken in this round (for "perfect" rounds). */
  taken: number;
}

export interface FightInput {
  left: boolean;
  right: boolean;
  guard: boolean;
  /** Pressed this step. */
  jump: boolean;
  attack: boolean;
  power: boolean;
}

export const NO_INPUT: FightInput = {
  left: false,
  right: false,
  guard: false,
  jump: false,
  attack: false,
  power: false,
};

export interface Projectile {
  readonly id: number;
  readonly owner: 0 | 1;
  readonly kind: ProjectileKind;
  x: number;
  readonly vx: number;
}

export interface Strike {
  readonly id: number;
  readonly owner: 0 | 1;
  readonly x: number;
  t: number;
}

export type HitKind = AttackKind | PowerKind;

export type FightEvent =
  | {
      type: 'hit';
      attacker: 0 | 1;
      damage: number;
      blocked: boolean;
      combo: number;
      kind: HitKind;
      knockdown: boolean;
      x: number;
      y: number;
    }
  | { type: 'parry'; defender: 0 | 1; x: number }
  | { type: 'guardBreak'; who: 0 | 1 }
  | { type: 'power'; owner: 0 | 1; kind: PowerKind }
  | { type: 'heal'; owner: 0 | 1; amount: number }
  | { type: 'strike'; owner: 0 | 1; x: number }
  | { type: 'quake'; owner: 0 | 1; x: number }
  | { type: 'clash'; x: number }
  | { type: 'ko'; winner: 0 | 1 }
  | { type: 'timeup'; winner: 0 | 1 | null };

export function makeFighter(setup: FighterSetup, x: number, facing: 1 | -1): Fighter {
  return {
    setup,
    x,
    y: 0,
    vx: 0,
    vy: 0,
    facing,
    hp: setup.maxHp,
    state: 'idle',
    t: 0,
    stun: 0,
    attack: null,
    attackHit: false,
    step: 0,
    queued: false,
    chainT: 9,
    guard: GUARD_MAX * setup.guard,
    guardT: 99,
    powerCd: START_COOLDOWN * setup.cd,
    combo: 0,
    buff: 0,
    invuln: 0,
    frozen: 0,
    taken: 0,
  };
}

export const guardMax = (f: Fighter) => GUARD_MAX * f.setup.guard;
export const powerCooldown = (f: Fighter) => POWER_SPECS[f.setup.power].cooldown * f.setup.cd;

/** Damage drops along a combo so long strings stay fair. */
export const comboScale = (combo: number) => Math.max(0.5, 1 - 0.1 * (combo - 1));

const other = (i: 0 | 1): 0 | 1 => (i === 0 ? 1 : 0);

interface HitSpec {
  readonly kind: HitKind;
  readonly damage: number;
  readonly hitstun: number;
  readonly knockback: number;
  readonly knockdown?: boolean;
  readonly unblockable?: boolean;
  readonly freeze?: number;
}

const fromAttack = (kind: AttackKind): HitSpec => ({ kind, ...ATTACKS[kind] });

export class FightSim {
  readonly fighters: [Fighter, Fighter];
  readonly projectiles: Projectile[] = [];
  readonly strikes: Strike[] = [];
  time = ROUND_TIME;
  winner: 0 | 1 | null = null;
  over = false;
  private ids = 0;

  constructor(player: FighterSetup, rival: FighterSetup) {
    this.fighters = [makeFighter(player, 220, 1), makeFighter(rival, 500, -1)];
  }

  step(dt: number, inputs: readonly [FightInput, FightInput]): FightEvent[] {
    const events: FightEvent[] = [];
    if (this.over) {
      for (const f of this.fighters) this.physics(f, dt);
      return events;
    }
    this.time = Math.max(0, this.time - dt);
    for (const i of [0, 1] as const) this.control(i, inputs[i], dt, events);
    for (const f of this.fighters) this.physics(f, dt);
    this.separate();
    for (const i of [0, 1] as const) this.resolveAttack(i, events);
    this.moveProjectiles(dt, events);
    this.updateStrikes(dt, events);

    const [a, b] = this.fighters;
    if (a.hp <= 0 || b.hp <= 0) {
      this.over = true;
      this.winner = a.hp <= 0 ? 1 : 0;
      const loser = this.fighters[other(this.winner)];
      loser.state = 'ko';
      loser.t = 0;
      loser.frozen = 0;
      events.push({ type: 'ko', winner: this.winner });
    } else if (this.time <= 0) {
      this.over = true;
      const ra = a.hp / a.setup.maxHp;
      const rb = b.hp / b.setup.maxHp;
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
    f.chainT += dt;
    f.invuln = Math.max(0, f.invuln - dt);
    f.buff = Math.max(0, f.buff - dt);
    f.frozen = Math.max(0, f.frozen - dt);
    f.powerCd = Math.max(0, f.powerCd - dt);
    if (f.state === 'ko') return;
    if (f.state !== 'guard') {
      f.guardT = 99;
      f.guard = Math.min(guardMax(f), f.guard + GUARD_REGEN * dt);
    }

    if (f.state === 'hit' || f.state === 'down') {
      if (f.t < f.stun) return;
      if (f.state === 'down') {
        if (f.y > 0) return;
        f.invuln = 0.4;
      }
      const landed = f.y <= 0;
      this.setState(f, landed ? 'idle' : 'jump');
      f.step = 0;
      if (landed) opp.combo = 0;
    }

    if (f.state === 'power') {
      if (!f.attackHit && f.t >= CAST) {
        f.attackHit = true;
        this.releasePower(i, events);
        if (f.state !== 'power') return; // turned into a dash or a dive
      }
      if (f.t >= CAST + CAST_RECOVERY) this.endAttack(f);
      return;
    }

    if (f.state === 'attack') {
      const a = ATTACKS[f.attack!];
      if (input.attack && CHAIN.includes(f.attack!) && f.step < 2) f.queued = true;
      // A connected hit can be cancelled into the power.
      if (
        input.power &&
        f.attackHit &&
        f.powerCd <= 0 &&
        f.attack !== 'dash' &&
        f.attack !== 'dive'
      ) {
        this.startPower(i);
        return;
      }
      if (f.attack === 'airKick' || f.attack === 'dive') {
        if (f.y <= 0 && f.t > 0.05) this.endAttack(f);
        return;
      }
      const activeEnd = a.startup + a.active;
      if (f.t >= activeEnd) f.vx = 0;
      if (
        f.queued &&
        f.step < 2 &&
        (f.attackHit ? f.t >= activeEnd : f.t >= activeEnd + a.recovery)
      ) {
        this.startChain(f, f.step + 1);
        return;
      }
      if (f.t >= activeEnd + a.recovery) this.endAttack(f);
      return;
    }

    if (f.state === 'jump') {
      if (input.power && f.powerCd <= 0) this.startPower(i);
      else if (input.attack) {
        f.attack = 'airKick';
        f.attackHit = false;
        this.setState(f, 'attack');
      }
      return;
    }

    // Grounded and free to act: face the opponent.
    f.facing = opp.x >= f.x ? 1 : -1;
    if (input.guard && f.guard > 0) {
      if (f.state !== 'guard') {
        this.setState(f, 'guard');
        f.guardT = 0;
      } else f.guardT += dt;
      f.vx = 0;
      return;
    }
    if (f.state === 'guard') this.setState(f, 'idle');

    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (input.jump) {
      f.vy = JUMP_VY;
      f.vx = dir * JUMP_VX * f.setup.speed;
      this.setState(f, 'jump');
      return;
    }
    if (input.power && f.powerCd <= 0) {
      this.startPower(i);
      return;
    }
    if (input.attack) {
      this.startChain(f, f.chainT < 0.3 && f.step < 2 ? f.step + 1 : 0);
      return;
    }
    f.vx = dir === 0 ? 0 : dir * (dir === f.facing ? WALK_FWD : WALK_BACK) * f.setup.speed;
    const next: FighterState = dir === 0 ? 'idle' : 'walk';
    if (f.state !== next) this.setState(f, next);
  }

  private startChain(f: Fighter, step: number): void {
    f.step = step;
    f.attack = CHAIN[step]!;
    f.attackHit = false;
    f.queued = false;
    f.vx = f.facing * 190 * f.setup.speed;
    this.setState(f, 'attack');
  }

  private endAttack(f: Fighter): void {
    f.attack = null;
    f.vx = 0;
    f.queued = false;
    f.chainT = 0;
    this.setState(f, f.y > 0 ? 'jump' : 'idle');
  }

  private startPower(i: 0 | 1): void {
    const f = this.fighters[i];
    f.powerCd = powerCooldown(f);
    f.attack = 'special';
    f.attackHit = false;
    f.queued = false;
    f.vx = 0;
    this.setState(f, 'power');
  }

  /** End of the cast: the kid's own power happens. */
  private releasePower(i: 0 | 1, events: FightEvent[]): void {
    const f = this.fighters[i];
    const foe = this.fighters[other(i)];
    const kind = f.setup.power;
    events.push({ type: 'power', owner: i, kind });
    switch (kind) {
      case 'fireball':
      case 'ice':
        this.projectiles.push({
          id: ++this.ids,
          owner: i,
          kind,
          x: f.x + f.facing * 60,
          vx: f.facing * PROJECTILES[kind].speed,
        });
        break;
      case 'lightning':
        this.strikes.push({ id: ++this.ids, owner: i, x: foe.x, t: STRIKE_DELAY });
        break;
      case 'quake':
        events.push({ type: 'quake', owner: i, x: f.x });
        if (foe.state !== 'ko' && foe.y < 40 && Math.abs(foe.x - f.x) < QUAKE_RANGE)
          this.applyHit(
            i,
            { kind: 'quake', damage: 15, hitstun: 0.5, knockback: 300, knockdown: true },
            foe.x,
            events,
          );
        break;
      case 'heal': {
        const amount = Math.min(f.setup.maxHp - f.hp, Math.round(f.setup.maxHp * HEAL_RATIO));
        f.hp += amount;
        f.buff = 5;
        events.push({ type: 'heal', owner: i, amount });
        break;
      }
      case 'dash':
        f.attack = 'dash';
        f.attackHit = false;
        f.vx = f.facing * 1000 * f.setup.speed;
        this.setState(f, 'attack');
        break;
      case 'dive': {
        f.attack = 'dive';
        f.attackHit = false;
        f.vy = 1250;
        const dx = foe.x - f.x;
        f.vx = Math.sign(dx || f.facing) * Math.min(640, Math.max(160, Math.abs(dx) * 0.9));
        this.setState(f, 'attack');
        break;
      }
    }
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
    } else if (f.state === 'hit' || f.state === 'down' || f.state === 'ko') {
      f.vx *= Math.exp(-dt * 8);
    }
    f.x = Math.max(STAGE_LEFT, Math.min(STAGE_RIGHT, f.x + f.vx * dt));
  }

  private separate(): void {
    const [a, b] = this.fighters;
    if (a.y > 90 || b.y > 90) return;
    const dx = b.x - a.x;
    const overlap = PUSH_DIST - Math.abs(dx);
    if (overlap <= 0) return;
    const sign = dx === 0 ? a.facing : Math.sign(dx);
    a.x -= (sign * overlap) / 2;
    b.x += (sign * overlap) / 2;
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
    if (f.attack === 'dive' && f.vy > 0) return;
    const target = this.fighters[other(i)];
    if (target.state === 'ko') return;
    const dx = (target.x - f.x) * f.facing;
    const behindOk = f.attack === 'dive' ? -a.range : -10;
    if (dx < behindOk || dx > a.range + HURT_HALF) return;
    if (f.attack === 'dive' && f.y - target.y > 170) return;
    if ((f.attack === 'jab' || f.attack === 'hook') && target.y > 120) return;
    if (target.invuln > 0 || target.state === 'down') return;
    f.attackHit = true;
    if (f.attack === 'dash') f.vx = 0;
    const reach = Math.min(a.range, Math.abs(target.x - f.x) - 10);
    this.applyHit(i, fromAttack(f.attack), f.x + f.facing * Math.max(0, reach), events);
  }

  private moveProjectiles(dt: number, events: FightEvent[]): void {
    for (const p of this.projectiles) p.x += p.vx * dt;
    const p0 = this.projectiles.find((p) => p.owner === 0);
    const p1 = this.projectiles.find((p) => p.owner === 1);
    if (p0 && p1 && Math.abs(p0.x - p1.x) < PROJECTILE_HALF * 2) {
      events.push({ type: 'clash', x: (p0.x + p1.x) / 2 });
      this.projectiles.splice(this.projectiles.indexOf(p0), 1);
      this.projectiles.splice(this.projectiles.indexOf(p1), 1);
    }
    for (let k = this.projectiles.length - 1; k >= 0; k--) {
      const p = this.projectiles[k]!;
      const data = PROJECTILES[p.kind];
      const target = this.fighters[other(p.owner)];
      const hits =
        target.state !== 'ko' &&
        target.invuln <= 0 &&
        target.state !== 'down' &&
        Math.abs(target.x - p.x) < HURT_HALF + PROJECTILE_HALF &&
        target.y < 80;
      if (hits) {
        this.projectiles.splice(k, 1);
        this.applyHit(
          p.owner,
          {
            kind: p.kind,
            damage: data.damage,
            hitstun: data.hitstun,
            knockback: 200,
            freeze: data.freeze || undefined,
          },
          p.x,
          events,
        );
      } else if (p.x < STAGE_LEFT - 80 || p.x > STAGE_RIGHT + 80) this.projectiles.splice(k, 1);
    }
  }

  private updateStrikes(dt: number, events: FightEvent[]): void {
    for (let k = this.strikes.length - 1; k >= 0; k--) {
      const s = this.strikes[k]!;
      s.t -= dt;
      if (s.t > 0) continue;
      this.strikes.splice(k, 1);
      events.push({ type: 'strike', owner: s.owner, x: s.x });
      const target = this.fighters[other(s.owner)];
      if (target.state !== 'ko' && target.invuln <= 0 && Math.abs(target.x - s.x) < STRIKE_HALF)
        this.applyHit(
          s.owner,
          {
            kind: 'lightning',
            damage: 15,
            hitstun: 0.6,
            knockback: 160,
            knockdown: true,
            unblockable: true,
          },
          target.x,
          events,
        );
    }
  }

  private applyHit(i: 0 | 1, hit: HitSpec, x: number, events: FightEvent[]): void {
    const attacker = this.fighters[i];
    const target = this.fighters[other(i)];
    const push = Math.sign(target.x - x) || attacker.facing;
    const raw = hit.damage * attacker.setup.dmg * (attacker.buff > 0 ? 1.25 : 1);

    if (!hit.unblockable && target.state === 'guard') {
      if (target.guardT <= PARRY_WINDOW) {
        // Parry: the attacker is thrown off balance and the defender's power comes back sooner.
        attacker.attack = null;
        attacker.stun = 0.65;
        attacker.vx = -attacker.facing * 160;
        this.setState(attacker, 'hit');
        target.guard = guardMax(target);
        target.powerCd = Math.max(0, target.powerCd - 1.5);
        events.push({ type: 'parry', defender: other(i), x });
        return;
      }
      const chip = Math.max(1, Math.round(raw * 0.12));
      target.hp = Math.max(1, target.hp - chip);
      target.taken += chip;
      target.guard -= raw * 2;
      target.vx = push * hit.knockback * 0.5;
      events.push({
        type: 'hit',
        attacker: i,
        damage: chip,
        blocked: true,
        combo: 0,
        kind: hit.kind,
        knockdown: false,
        x,
        y: 120,
      });
      if (target.guard <= 0) {
        target.guard = 0;
        target.stun = 0.9;
        target.frozen = 0;
        this.setState(target, 'hit');
        events.push({ type: 'guardBreak', who: other(i) });
      }
      return;
    }

    attacker.combo = target.state === 'hit' ? attacker.combo + 1 : 1;
    const damage = Math.max(1, Math.round(raw * comboScale(attacker.combo)));
    target.hp = Math.max(0, target.hp - damage);
    target.taken += damage;
    target.attack = null;
    target.queued = false;
    target.vx = hit.freeze ? 0 : push * hit.knockback;
    target.frozen = hit.freeze ?? 0;
    const down = !!hit.knockdown && !hit.freeze;
    if (target.y > 0 || down) target.vy = Math.max(target.vy, down ? 420 : 300);
    target.stun = down ? 0.8 : hit.hitstun;
    this.setState(target, down ? 'down' : 'hit');
    // Hitting recharges the power; being hit helps a little too (comeback).
    attacker.powerCd = Math.max(0, attacker.powerCd - 0.5);
    target.powerCd = Math.max(0, target.powerCd - 0.3);
    if (attacker.setup.vamp > 0)
      attacker.hp = Math.min(attacker.setup.maxHp, attacker.hp + damage * attacker.setup.vamp);
    events.push({
      type: 'hit',
      attacker: i,
      damage,
      blocked: false,
      combo: attacker.combo,
      kind: hit.kind,
      knockdown: down,
      x,
      y: hit.kind === 'kick' || hit.kind === 'airKick' || hit.kind === 'dive' ? 130 : 115,
    });
  }
}
