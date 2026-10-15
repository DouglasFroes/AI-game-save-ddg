import {
  ATTACKS,
  MAX_METER,
  NO_INPUT,
  type FightInput,
  type FightSim,
  type Rng,
  type SpecialKind,
} from './core';

/**
 * CPU opponent: re-decides a few times per second (faster at higher levels), so it reacts like a
 * player instead of reading inputs frame-perfectly. Pure: state lives in `CpuBrain`.
 */
export class CpuBrain {
  private held: FightInput = NO_INPUT;
  private wait = 0;

  constructor(
    readonly level: number,
    private readonly rng: Rng = Math.random,
  ) {}

  /** Seconds between decisions. */
  get reaction(): number {
    return Math.max(0.1, 0.34 - this.level * 0.03);
  }

  think(sim: FightSim, me: 0 | 1, dt: number): FightInput {
    this.wait -= dt;
    // Buttons are one-shot; directions stay held until the next decision.
    const out: FightInput = {
      ...this.held,
      jump: false,
      punch: false,
      kick: false,
      special: false,
    };
    if (this.wait > 0) return out;
    this.wait = this.reaction * (0.7 + this.rng() * 0.6);
    this.held = this.decide(sim, me);
    return this.held;
  }

  /** When each power is worth using. */
  private wantsPower(kind: SpecialKind, dist: number, life: number, r: number): boolean {
    switch (kind) {
      case 'heal':
        return life < 0.6;
      case 'dash':
        return dist > 110 && dist < 430 && r < 0.6;
      case 'dive':
        return dist > 140 && dist < 420 && r < 0.6;
      case 'lightning':
        return r < 0.5;
      default:
        return dist > 230 && r < 0.55;
    }
  }

  private decide(sim: FightSim, me: 0 | 1): FightInput {
    const f = sim.fighters[me];
    const foe = sim.fighters[me === 0 ? 1 : 0];
    const r = this.rng();
    const toward = foe.x >= f.x ? 1 : -1;
    const walk = (dir: number): FightInput => ({ ...NO_INPUT, left: dir < 0, right: dir > 0 });
    const dist = Math.abs(foe.x - f.x);
    const lvl = Math.min(this.level, 8);

    // A lightning bolt marked under us: get out of there.
    const bolt = sim.strikes.find((s) => s.owner !== me && Math.abs(s.x - f.x) < 80);
    if (bolt && r < 0.35 + lvl * 0.08) return walk(f.x < bolt.x ? -1 : 1);

    // Incoming projectile: jump it or block it (a ground wave can only be jumped).
    const fireball = sim.projectiles.find(
      (p) =>
        p.owner !== me && Math.sign(f.x - p.x) === Math.sign(p.vx) && Math.abs(f.x - p.x) < 300,
    );
    if (fireball) {
      if (r < 0.25 + lvl * 0.06)
        return { ...walk(0), jump: true, right: toward > 0, left: toward < 0 };
      if (fireball.kind !== 'wave' && r < 0.45 + lvl * 0.06) return walk(-toward);
    }

    // Foe is winding up an attack in range: block (better CPUs block more).
    if (foe.state === 'attack' && foe.attack && dist < ATTACKS[foe.attack].range + 60) {
      if (r < 0.2 + lvl * 0.08) return walk(-toward);
    }

    if (
      f.meter >= MAX_METER &&
      this.wantsPower(f.stats.special ?? 'fireball', dist, f.hp / f.stats.maxHp, r)
    )
      return { ...walk(0), special: true };

    if (dist > 150) {
      if (r < 0.1 + lvl * 0.015) return { ...walk(toward), jump: true };
      return r < 0.85 ? walk(toward) : walk(-toward);
    }

    // Close range: mostly attack, sometimes back off or jump in.
    const aggression = 0.45 + lvl * 0.05;
    if (r < aggression) {
      if (dist < 105) return { ...walk(0), punch: this.rng() < 0.6, kick: this.rng() >= 0.6 };
      return { ...walk(0), kick: true };
    }
    if (r < aggression + 0.12) return { ...walk(toward), jump: true };
    if (r < aggression + 0.3) return walk(-toward);
    return walk(0);
  }
}
