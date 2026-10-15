import { describe, expect, it } from 'vitest';
import { CpuBrain } from '@/games/luta/ai';
import {
  ATTACKS,
  comboScale,
  FightSim,
  MAX_METER,
  NO_INPUT,
  STAGE_LEFT,
  STAGE_RIGHT,
  type FightEvent,
  type SpecialKind,
  type FightInput,
} from '@/games/luta/core';
import { healBetweenFights, PLAYER_STATS, rivalFor, winBonus } from '@/games/luta/ladder';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const DT = 1 / 60;
const EVEN = { maxHp: 100, power: 1, speed: 1 };
const press = (k: Partial<FightInput>): FightInput => ({ ...NO_INPUT, ...k });

function run(
  sim: FightSim,
  seconds: number,
  p0: (t: number) => FightInput,
  p1: (t: number) => FightInput = () => NO_INPUT,
) {
  const events: FightEvent[] = [];
  for (let i = 0; i < seconds * 60 && !sim.over; i++) events.push(...sim.step(DT, [p0(i), p1(i)]));
  return events;
}

/** Puts the fighters face to face at `gap` pixels. */
function closeIn(sim: FightSim, gap: number) {
  sim.fighters[0].x = 300;
  sim.fighters[1].x = 300 + gap;
}

describe('luta', () => {
  it('lands a punch in range and deals its damage', () => {
    const sim = new FightSim(EVEN, EVEN);
    closeIn(sim, 90);
    const events = run(sim, 0.5, (i) => press({ punch: i === 0 }));
    const hit = events.find((e) => e.type === 'hit');
    expect(hit).toMatchObject({
      attacker: 0,
      blocked: false,
      damage: ATTACKS.punch.damage,
      combo: 1,
    });
    expect(sim.fighters[1].hp).toBe(100 - ATTACKS.punch.damage);
  });

  it('whiffs out of range', () => {
    const sim = new FightSim(EVEN, EVEN);
    closeIn(sim, 300);
    const events = run(sim, 0.5, (i) => press({ punch: i === 0 }));
    expect(events.some((e) => e.type === 'hit')).toBe(false);
    expect(events.some((e) => e.type === 'whiff')).toBe(true);
  });

  it('blocks when holding away from the attacker, taking only chip damage', () => {
    const sim = new FightSim(EVEN, EVEN);
    closeIn(sim, 110);
    // Fighter 1 faces left, so "back" is right.
    const events = run(
      sim,
      0.6,
      (i) => press({ kick: i === 0 }),
      () => press({ right: true }),
    );
    const hit = events.find((e) => e.type === 'hit');
    expect(hit).toMatchObject({ blocked: true });
    expect(sim.fighters[1].hp).toBeGreaterThan(100 - ATTACKS.kick.damage);
  });

  it('chains a combo with scaled damage while the foe is in hitstun', () => {
    const sim = new FightSim(EVEN, EVEN);
    closeIn(sim, 80);
    // Press punch as soon as each one recovers.
    const events = run(sim, 1.4, () => press({ punch: true }));
    const combos = events
      .filter((e) => e.type === 'hit')
      .map((e) => (e.type === 'hit' ? e.combo : 0));
    expect(Math.max(...combos)).toBeGreaterThanOrEqual(3);
    expect(comboScale(1)).toBe(1);
    expect(comboScale(20)).toBe(0.5);
  });

  it('throws a fireball only with a full meter', () => {
    const sim = new FightSim(EVEN, EVEN);
    closeIn(sim, 300);
    let events = run(sim, 0.5, (i) => press({ special: i === 0 }));
    expect(events.some((e) => e.type === 'special')).toBe(false);

    sim.fighters[0].meter = MAX_METER;
    events = run(sim, 1.5, (i) => press({ special: i === 0 }));
    expect(events.some((e) => e.type === 'special')).toBe(true);
    expect(events.find((e) => e.type === 'hit')).toMatchObject({
      kind: 'fireball',
      blocked: false,
    });
    expect(sim.fighters[0].meter).toBeLessThan(MAX_METER);
  });

  it('jumps over a fireball', () => {
    const sim = new FightSim(EVEN, EVEN);
    closeIn(sim, 400);
    sim.fighters[1].meter = MAX_METER;
    // CPU throws; player jumps when it gets close.
    const events = run(
      sim,
      1.6,
      () => {
        const p = sim.projectiles[0];
        return press({ jump: !!p && Math.abs(p.x - sim.fighters[0].x) < 170 });
      },
      (i) => press({ special: i === 0 }),
    );
    expect(events.some((e) => e.type === 'special')).toBe(true);
    expect(sim.fighters[0].hp).toBe(100);
  });

  it('keeps fighters apart and inside the stage', () => {
    const sim = new FightSim(EVEN, EVEN);
    run(
      sim,
      3,
      () => press({ left: true }),
      () => press({ left: true }),
    );
    const [a, b] = sim.fighters;
    expect(a.x).toBeGreaterThanOrEqual(STAGE_LEFT);
    expect(b.x - a.x).toBeGreaterThanOrEqual(63.9);
  });

  it('ends with a KO and a winner', () => {
    const sim = new FightSim(EVEN, { maxHp: 5, power: 1, speed: 1 });
    closeIn(sim, 90);
    const events = run(sim, 1, (i) => press({ punch: i === 0 }));
    expect(events.at(-1)).toEqual({ type: 'ko', winner: 0 });
    expect(sim.fighters[1].state).toBe('ko');
  });

  it('decides time-ups by remaining life', () => {
    const sim = new FightSim(EVEN, EVEN);
    sim.fighters[1].hp = 40;
    sim.time = 0.05;
    const events = run(sim, 1, () => NO_INPUT);
    expect(events.at(-1)).toEqual({ type: 'timeup', winner: 0 });
  });

  it('CPU fights back and tougher CPUs beat a passive player faster', () => {
    const timeToKo = (level: number) => {
      const sim = new FightSim(PLAYER_STATS, rivalFor(level).stats);
      const cpu = new CpuBrain(level, seeded(level));
      let t = 0;
      while (!sim.over && t < 60) {
        sim.step(DT, [NO_INPUT, cpu.think(sim, 1, DT)]);
        t += DT;
      }
      return { t, winner: sim.winner };
    };
    const easy = timeToKo(1);
    const hard = timeToKo(8);
    expect(easy.winner).toBe(1);
    expect(hard.winner).toBe(1);
    expect(hard.t).toBeLessThan(easy.t);
  });

  it('scales rivals, healing and the win bonus', () => {
    expect(rivalFor(6).look.name).toContain('II');
    expect(rivalFor(10).stats.power).toBeGreaterThan(rivalFor(1).stats.power);
    expect(healBetweenFights(20, 100)).toBe(60);
    const base = { level: 2, hpLeft: 50, maxHp: 100, timeLeft: 30, perfect: false };
    expect(winBonus({ ...base, perfect: true })).toBe(winBonus(base) + 3000);
    expect(winBonus({ ...base, level: 3 })).toBeGreaterThan(winBonus(base));
  });

  describe('powers', () => {
    const withPower = (special: SpecialKind, gap = 300) => {
      const sim = new FightSim({ ...EVEN, special }, EVEN);
      closeIn(sim, gap);
      sim.fighters[0].meter = MAX_METER;
      return sim;
    };
    const cast = (i: number) => press({ special: i === 0 });

    it('ice freezes the foe for a long time', () => {
      const sim = withPower('ice');
      const events = run(sim, 1.2, cast);
      expect(events.find((e) => e.type === 'hit')).toMatchObject({ kind: 'ice' });
      expect(sim.fighters[1].frozen).toBeGreaterThan(0.5);
      expect(sim.fighters[1].state).toBe('hit');
    });

    it('the ground wave hits standing foes but not jumping ones', () => {
      const sim = withPower('wave');
      expect(run(sim, 1.2, cast).some((e) => e.type === 'hit')).toBe(true);
      const jumper = withPower('wave');
      const events = run(jumper, 1.2, cast, () => {
        const p = jumper.projectiles[0];
        return press({ jump: !!p && Math.abs(p.x - jumper.fighters[1].x) < 160 });
      });
      expect(events.some((e) => e.type === 'hit')).toBe(false);
    });

    it('lightning falls where the foe was: standing still gets hit, moving away dodges', () => {
      const still = withPower('lightning');
      const hit = run(still, 1.5, cast);
      expect(hit.some((e) => e.type === 'strike')).toBe(true);
      expect(hit.find((e) => e.type === 'hit')).toMatchObject({ kind: 'lightning' });
      const runner = withPower('lightning');
      const dodge = run(runner, 1.5, cast, () => press({ left: true }));
      expect(dodge.some((e) => e.type === 'hit')).toBe(false);
    });

    it('lightning cannot be blocked', () => {
      const sim = withPower('lightning');
      sim.fighters[1].x = STAGE_RIGHT; // pinned: holding back guards without moving away
      const events = run(sim, 1.5, cast, () => press({ right: true }));
      expect(events.find((e) => e.type === 'hit')).toMatchObject({
        kind: 'lightning',
        blocked: false,
      });
    });

    it('heal restores life', () => {
      const sim = withPower('heal');
      sim.fighters[0].hp = 40;
      const events = run(sim, 0.8, cast);
      expect(events.find((e) => e.type === 'heal')).toMatchObject({ amount: 25 });
      expect(sim.fighters[0].hp).toBe(65);
    });

    it('dash rushes across the stage into the foe', () => {
      const sim = withPower('dash', 280);
      const events = run(sim, 1, cast);
      expect(events.find((e) => e.type === 'hit')).toMatchObject({ kind: 'dash', blocked: false });
    });

    it('dive leaps and crashes down on the foe', () => {
      const sim = withPower('dive', 260);
      let maxY = 0;
      const events = run(sim, 1.6, (i) => {
        maxY = Math.max(maxY, sim.fighters[0].y);
        return cast(i);
      });
      expect(maxY).toBeGreaterThan(200);
      expect(events.find((e) => e.type === 'hit')).toMatchObject({ kind: 'dive' });
    });
  });
});
