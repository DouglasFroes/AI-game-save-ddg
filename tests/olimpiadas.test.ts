import { describe, expect, it } from 'vitest';
import {
  pingPong,
  zoneQuality,
  type AttemptResult,
  type AttemptRules,
} from '@/games/olimpiadas/attempt';
import { jumpDistance, longJump } from '@/games/saltodist/core';
import { javelin, throwDistance } from '@/games/dardo/core';
import { barKg, holdZone, strengthNeeded, weightlifting } from '@/games/pesos/core';
import { barState, capacity, highJump } from '@/games/saltoalt/core';
import { freeThrows, SHOTS, streakOf } from '@/games/lance/core';
import { SprintSim, rivalAt, TRACK_M as SPRINT_M } from '@/games/cem/core';
import { ARROWS, ArcherySim, ringOf } from '@/games/arco/core';
import { POOL_M, SwimSim } from '@/games/natacao/core';
import { CLAYS, SkeetSim, clayPos } from '@/games/skeet/core';
import { HURDLES, HurdleSim, hurdleAt, JUMP_S } from '@/games/barreiras/core';
import { seeded } from '@/platform/rnd';

const ok = (value = 1, points = 0): AttemptResult => ({
  value,
  points,
  ok: true,
  text: '',
  progress: 1,
});
const bad: AttemptResult = { value: 0, points: 0, ok: false, text: '', progress: 0 };

describe('olimpíadas: peças comuns', () => {
  it('pingPong sweeps 0→1→0 and zoneQuality is 1 inside the zone', () => {
    expect(pingPong(0, 1)).toBe(0);
    expect(pingPong(0.5, 1)).toBeCloseTo(0.5);
    expect(pingPong(1, 1)).toBeCloseTo(1);
    expect(pingPong(1.5, 1)).toBeCloseTo(0.5);
    expect(pingPong(2, 1)).toBeCloseTo(0);
    expect(zoneQuality(0.5, [0.4, 0.6])).toBe(1);
    expect(zoneQuality(0.9, [0.4, 0.6])).toBeLessThan(zoneQuality(0.7, [0.4, 0.6]));
    expect(zoneQuality(2, [0.4, 0.6])).toBe(0);
  });

  const everyRule: Array<[string, AttemptRules<never>]> = [
    ['salto em distância', longJump as never],
    ['dardo', javelin as never],
    ['peso', weightlifting as never],
    ['salto em altura', highJump as never],
    ['lance livre', freeThrows as never],
  ];
  it.each(everyRule)('%s: every attempt has valid stages and a sane summary', (_n, rules) => {
    const rnd = seeded(3);
    const history: AttemptResult[] = [];
    for (let a = 0; a < Math.min(rules.attempts, 6); a++) {
      const start = rules.begin(a, history, rnd);
      expect(start.stages.length).toBeGreaterThan(0);
      for (const s of start.stages) {
        expect(s.label.length).toBeGreaterThan(0);
        if (s.kind !== 'mash') expect(s.zone[0]).toBeLessThan(s.zone[1]);
      }
      const r = rules.resolve(
        start.stages.map(() => 0.5),
        start.ctx,
        a,
      );
      expect(r.progress).toBeGreaterThanOrEqual(0);
      expect(r.progress).toBeLessThanOrEqual(1);
      history.push(r);
    }
    const sum = rules.summary(history);
    expect(sum.score).toBeGreaterThanOrEqual(0);
    expect(sum.title.length).toBeGreaterThan(0);
  });
});

describe('salto em distância', () => {
  it('more speed jumps farther, a foul gives nothing, the angle matters', () => {
    expect(jumpDistance(1, 0.88, 0.5)).toBeGreaterThan(jumpDistance(0.4, 0.88, 0.5));
    expect(jumpDistance(1, 0.99, 0.5)).toBe(0);
    expect(jumpDistance(1, 0.88, 0.5)).toBeGreaterThan(jumpDistance(1, 0.88, 0.05));
    expect(jumpDistance(1, 0.5, 0.5)).toBeLessThan(jumpDistance(1, 0.88, 0.5));
    expect(jumpDistance(1, 0.88, 0.5)).toBeLessThan(9.3);
    const foul = longJump.resolve([1, 1, 0.5], null, 0);
    expect(foul.ok).toBe(false);
    expect(longJump.summary([foul, foul, foul]).score).toBe(0);
  });
});

describe('dardo', () => {
  it('power, angle and wind change the distance', () => {
    expect(throwDistance(1, 0.5, 0)).toBeGreaterThan(throwDistance(0.5, 0.5, 0));
    expect(throwDistance(1, 0.5, 0)).toBeGreaterThan(throwDistance(1, 0.05, 0));
    expect(throwDistance(1, 0.5, 3)).toBeGreaterThan(throwDistance(1, 0.5, -3));
    expect(throwDistance(1, 0.5, 0)).toBeLessThan(100);
    expect(throwDistance(0, 0, -3)).toBeGreaterThanOrEqual(0);
  });
});

describe('levantamento de peso', () => {
  it('needs more strength and a narrower zone as the bar gets heavier', () => {
    expect(barKg(0)).toBe(80);
    expect(barKg(3)).toBe(110);
    expect(strengthNeeded(5)).toBeGreaterThan(strengthNeeded(0));
    const wide = holdZone(0);
    const narrow = holdZone(6);
    expect(narrow[1] - narrow[0]).toBeLessThan(wide[1] - wide[0]);
  });

  it('a weak lift fails, a good one counts, two fails in a row end it', () => {
    expect(weightlifting.resolve([0.1, 0.5], 3, 3).ok).toBe(false);
    expect(weightlifting.resolve([1, 0.95], 3, 3).ok).toBe(false);
    const lift = weightlifting.resolve([1, 0.5], 3, 3);
    expect(lift).toMatchObject({ ok: true, value: 110, points: 110 });
    expect(weightlifting.goesOn([ok(), bad])).toBe(true);
    expect(weightlifting.goesOn([ok(), bad, bad])).toBe(false);
    expect(weightlifting.goesOn([bad])).toBe(true);
    expect(weightlifting.summary([ok(80, 80), ok(90, 90), bad, bad]).score).toBe(170);
  });
});

describe('salto em altura', () => {
  it('raises the bar by 5 cm per cleared height and ends after three misses in a row', () => {
    expect(barState([])).toEqual({ height: 1.8, misses: 0 });
    expect(barState([ok(1.8)])).toEqual({ height: 1.85, misses: 0 });
    expect(barState([ok(1.8), bad, bad])).toEqual({ height: 1.85, misses: 2 });
    expect(highJump.goesOn([ok(1.8), bad, bad])).toBe(true);
    expect(highJump.goesOn([ok(1.8), bad, bad, bad])).toBe(false);
    expect(barState([bad, bad, ok(1.8)]).misses).toBe(0);
  });

  it('a better run-up and take-off clear higher bars', () => {
    expect(capacity(1, 0.5)).toBeGreaterThan(capacity(0.3, 0.5));
    expect(capacity(1, 0.5)).toBeGreaterThan(capacity(1, 0.95));
    expect(capacity(0, 0)).toBeLessThan(1.8);
    expect(capacity(1, 0.5)).toBeGreaterThan(2.2);
    expect(highJump.summary([ok(1.8), ok(1.85), bad]).score).toBe(185);
  });
});

describe('lance livre', () => {
  it('scores by distance, rewards the centre and a streak, and counts streaks', () => {
    const a = freeThrows.begin(0, [], seeded(1));
    const b = freeThrows.begin(8, [], seeded(1));
    const zone = (x: { stages: readonly { kind: string }[] }) =>
      (x.stages[0] as unknown as { zone: [number, number] }).zone;
    expect(zone(b)[1] - zone(b)[0]).toBeLessThan(zone(a)[1] - zone(a)[0]);
    const free = freeThrows.resolve([0.55], a.ctx, 0);
    expect(free).toMatchObject({ ok: true, points: 1 });
    expect(freeThrows.resolve([0.5], a.ctx, 0).points).toBe(2); // perfect
    expect(freeThrows.resolve([0.9], a.ctx, 0).ok).toBe(false);
    expect(freeThrows.resolve([0.5], { value: 3, streak: 2 }, 8).points).toBe(5);
    expect(streakOf([ok(), bad, ok(), ok()])).toBe(2);
    expect(SHOTS).toBe(10);
  });
});

describe('100 metros', () => {
  it('false start when tapping before the gun; alternating taps run, the same side stumbles', () => {
    const early = new SprintSim(seeded(1));
    early.tap('L');
    expect(early.phase).toBe('false');
    const sim = new SprintSim(seeded(2));
    while (sim.phase === 'wait') sim.step(0.05);
    expect(sim.phase).toBe('run');
    sim.tap('L');
    const v1 = sim.v;
    sim.tap('R');
    expect(sim.v).toBeGreaterThan(v1);
    const v2 = sim.v;
    sim.tap('R');
    expect(sim.v).toBeLessThan(v2);
    expect(sim.stumbles).toBe(1);
  });

  it('a fast tapper finishes 100 m in a decent time and gets a place and score', () => {
    const sim = new SprintSim(seeded(4));
    let side = false;
    for (let t = 0; t < 40 * 60 && sim.phase !== 'done'; t++) {
      sim.step(1 / 60);
      if (t % 8 === 0 && sim.phase === 'run') {
        side = !side;
        sim.tap(side ? 'L' : 'R');
      }
    }
    expect(sim.phase).toBe('done');
    expect(sim.finish).toBeGreaterThan(8);
    expect(sim.finish).toBeLessThan(20);
    expect(sim.place).toBeGreaterThanOrEqual(1);
    expect(sim.score).toBeGreaterThan(0);
    expect(rivalAt(sim.rivals[0]!, sim.rivals[0]!.time)).toBeCloseTo(SPRINT_M);
  });
});

describe('tiro com arco', () => {
  it('rings go from 10 in the middle to 0 outside, and ten arrows end the round', () => {
    expect(ringOf(0)).toBe(10);
    expect(ringOf(0.09)).toBe(10);
    expect(ringOf(0.55)).toBe(5);
    expect(ringOf(0.99)).toBe(1);
    expect(ringOf(1.2)).toBe(0);
    const sim = new ArcherySim(seeded(5));
    for (let i = 0; i < ARROWS; i++) {
      sim.step(0.37);
      expect(sim.shoot()).not.toBeNull();
    }
    expect(sim.done).toBe(true);
    expect(sim.shoot()).toBeNull();
    expect(sim.score).toBeGreaterThanOrEqual(0);
  });

  it('the sight sways within its range and the wind grows', () => {
    const sim = new ArcherySim(seeded(6));
    for (let t = 0; t < 5; t += 0.05) {
      const a = sim.aim(t);
      expect(Math.abs(a.x)).toBeLessThanOrEqual(sim.sway + 1e-9);
    }
    const first = sim.sway;
    sim.shoot();
    expect(sim.sway).toBeGreaterThan(first);
  });
});

describe('natação', () => {
  it('a perfect rhythm swims 50 m faster than a sloppy one, and finishes', () => {
    const swim = (taps: boolean) => {
      const s = new SwimSim();
      for (let i = 0; i < 60 * 300 && !s.done; i++) {
        s.step(1 / 60);
        // Tap right on the beat when asked to, or never.
        if (taps && s.ring > 0.995) s.tap();
      }
      return s;
    };
    const good = swim(true);
    const idle = swim(false);
    expect(good.done).toBe(true);
    expect(idle.done).toBe(true);
    expect(good.time).toBeLessThan(idle.time);
    expect(good.x).toBe(POOL_M);
    expect(good.score).toBeGreaterThan(idle.score);
  });
});

describe('skeet', () => {
  it('launches 25 clays, a tap on a clay breaks it, streaks pay extra', () => {
    const sim = new SkeetSim(seeded(7));
    let guard = 0;
    while (!sim.done && guard++ < 60 * 120) {
      sim.step(1 / 60);
      const c = sim.clays.find((x) => x.state === 'flying' && x.age > 0.4);
      if (c) {
        const p = clayPos(c);
        sim.tap(p.x, p.y);
      }
    }
    expect(sim.launched).toBe(CLAYS);
    expect(sim.hits).toBeGreaterThan(15);
    expect(sim.score).toBeGreaterThan(sim.hits * 100 - 1);
    expect(sim.bestStreak).toBeGreaterThan(2);
  });

  it('a miss breaks the streak', () => {
    const sim = new SkeetSim(seeded(8));
    while (sim.clays.length === 0) sim.step(0.1);
    sim.tap(-500, -500);
    expect(sim.streak).toBe(0);
    expect(sim.hits).toBe(0);
  });
});

describe('corrida com barreiras', () => {
  const run = (jumpEarly: number | null) => {
    const sim = new HurdleSim();
    for (let t = 0; t < 60 * 60 && !sim.done; t++) {
      const next = sim.next < HURDLES ? hurdleAt(sim.next) : Infinity;
      // Jump so that the hurdle comes at the top of the arc (or never).
      if (
        jumpEarly !== null &&
        sim.air < 0 &&
        sim.stumble === 0 &&
        next - sim.x <= sim.v * (JUMP_S / 2 + jumpEarly) &&
        next - sim.x > 0
      )
        sim.jump();
      sim.step(1 / 60);
    }
    return sim;
  };

  it('a well-timed jump clears every hurdle, never jumping hits them all', () => {
    const clean = run(0);
    expect(clean.done).toBe(true);
    expect(clean.hits).toBe(0);
    expect(clean.cleared).toBe(HURDLES);
    const lazy = run(null);
    expect(lazy.done).toBe(true);
    expect(lazy.hits).toBe(HURDLES);
    expect(lazy.time).toBeGreaterThan(clean.time);
    expect(clean.score).toBeGreaterThan(lazy.score);
  });

  it('cannot jump while in the air or stumbling', () => {
    const sim = new HurdleSim();
    sim.jump();
    expect(sim.air).toBe(0);
    sim.step(0.1);
    sim.jump();
    expect(sim.air).toBeCloseTo(0.1);
  });
});
