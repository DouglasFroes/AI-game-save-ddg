import { describe, expect, it } from 'vitest';
import { seeded } from '@/platform/rnd';
import { ArcherySim, launch, LIVES, targetFor } from '@/games/arqueiro/core';
import { GallerySim, MAGAZINE, RELOAD_TIME, START_TIME } from '@/games/galeria/core';
import { dropAt, driftPerWind, scoreImpact, SHOTS, SniperSim, STEADY, targetFor as sniperTarget, targetRadius } from '@/games/sniper/core';

describe('arqueiro infinito', () => {
  /** Finds a pull that hits the current target (simulating copies), or null. */
  const aimFor = (sim: ArcherySim) => {
    for (let len = 80; len <= 260; len += 6)
      for (let a = -1.2; a <= 0.4; a += 0.02) {
        const copy = Object.assign(Object.create(Object.getPrototypeOf(sim)), structuredClone({ ...sim, rnd: undefined })) as ArcherySim;
        (copy as unknown as { rnd: () => number }).rnd = () => 0.5;
        const pull = { x: -Math.cos(a) * len, y: -Math.sin(a) * len };
        copy.shoot(pull.x, pull.y);
        for (let i = 0; i < 600 && copy.arrow; i++) {
          const ev = copy.step(1 / 120);
          const hit = ev.find((e) => e.type === 'hit');
          if (hit && hit.type === 'hit' && hit.ring <= 1) return pull;
        }
      }
    return null;
  };

  it('launches away from the pull, faster the farther you pull', () => {
    expect(launch(10, 0)).toBeNull(); // pulling forwards does nothing
    const soft = launch(-80, 40)!;
    const hard = launch(-200, 100)!;
    expect(soft.vx).toBeGreaterThan(0);
    expect(soft.vy).toBeLessThan(0);
    expect(Math.hypot(hard.vx, hard.vy)).toBeGreaterThan(Math.hypot(soft.vx, soft.vy));
  });

  it('targets get smaller, farther, moving and windy as you go', () => {
    const first = targetFor(0, seeded(1));
    const later = targetFor(30, seeded(1));
    expect(later.r).toBeLessThan(first.r);
    expect(first.bob).toBe(0);
    expect(first.wind).toBe(0);
    expect(later.bob).toBeGreaterThan(0);
  });

  it('a good shot hits and scores, the next target appears; misses cost lives until it ends', () => {
    const sim = new ArcherySim(seeded(2));
    for (let i = 0; i < 4; i++) {
      const pull = aimFor(sim)!;
      expect(pull).not.toBeNull();
      sim.shoot(pull.x, pull.y);
      let hit = false;
      for (let k = 0; k < 600 && sim.arrow; k++) hit ||= sim.step(1 / 120).some((e) => e.type === 'hit');
      expect(hit).toBe(true);
    }
    expect(sim.hits).toBe(4);
    expect(sim.score).toBeGreaterThan(0);
    expect(sim.lives).toBe(LIVES);
    let over = false;
    for (let m = 0; m < LIVES; m++) {
      sim.shoot(-60, -60); // straight into the ground
      for (let k = 0; k < 600 && sim.arrow; k++) over ||= sim.step(1 / 120).some((e) => e.type === 'over');
    }
    expect(over).toBe(true);
    expect(sim.lives).toBe(0);
    expect(sim.shoot(-100, 50)).toBe(false);
  });

  it('streaks raise the multiplier; three bullseyes in a row give a life back', () => {
    const sim = new ArcherySim(seeded(3));
    sim.streak = 6;
    expect(sim.multiplier).toBe(2);
    sim.lives = 1;
    sim.eyeStreak = 2;
    sim.arrow = { x: sim.target.x - 5, y: sim.target.y, vx: 600, vy: 0 };
    const ev = sim.step(1 / 60);
    expect(ev.some((e) => e.type === 'hit' && e.ring === 0)).toBe(true);
    expect(ev.some((e) => e.type === 'life')).toBe(true);
    expect(sim.lives).toBe(2);
  });
});

describe('galeria de tiro', () => {
  const place = (sim: GallerySim, kind: 'duck' | 'gold' | 'bunny' | 'target', x = 300, y = 690) => {
    const it = { id: 999 + sim.items.length, kind, x, y, vx: 0, life: 0, hit: false };
    sim.items.push(it);
    return it;
  };

  it('hits items under the tap and empties the magazine', () => {
    const sim = new GallerySim(seeded(1));
    sim.items = [];
    place(sim, 'duck');
    expect(sim.shoot(300, 700)[0]!.type).toBe('hit');
    expect(sim.score).toBe(10);
    for (let i = 1; i < MAGAZINE; i++) expect(sim.shoot(10, 10)[0]!.type).toBe('miss');
    expect(sim.ammo).toBe(0);
    expect(sim.shoot(300, 700)[0]!.type).toBe('empty');
    expect(sim.combo).toBe(0);
  });

  it('reloads after a short delay, without shooting meanwhile', () => {
    const sim = new GallerySim(seeded(2));
    sim.shoot(10, 10);
    expect(sim.reload()).toBe(true);
    expect(sim.shoot(10, 10)).toEqual([]);
    let reloaded = false;
    for (let t = 0; t <= RELOAD_TIME + 0.05; t += 0.05) reloaded ||= sim.step(0.05).some((e) => e.type === 'reloaded');
    expect(reloaded).toBe(true);
    expect(sim.ammo).toBe(MAGAZINE);
  });

  it('bunnies cost points and time; golden ducks add time', () => {
    const sim = new GallerySim(seeded(3));
    sim.items = [];
    sim.score = 100;
    place(sim, 'bunny');
    expect(sim.shoot(300, 690)[0]!.type).toBe('friend');
    expect(sim.score).toBe(50);
    expect(sim.clock).toBe(START_TIME - 3);
    place(sim, 'gold', 500);
    sim.shoot(500, 690);
    expect(sim.clock).toBe(START_TIME);
    expect(sim.score).toBe(100);
  });

  it('the combo builds a multiplier', () => {
    const sim = new GallerySim(seeded(4));
    sim.items = [];
    let total = 0;
    for (let i = 0; i < 10; i++) {
      if (sim.ammo === 0) sim.ammo = MAGAZINE;
      place(sim, 'duck', 100 + i * 50);
      const e = sim.shoot(100 + i * 50, 690)[0]!;
      if (e.type === 'hit') total += e.points;
    }
    expect(sim.combo).toBe(10);
    expect(sim.multiplier).toBe(2);
    expect(total).toBe(4 * 10 + 5 * 15 + 20);
  });

  it('the clock ends the round and items keep flowing', () => {
    const sim = new GallerySim(seeded(5));
    let over = false;
    let maxItems = 0;
    for (let i = 0; i < 70 * 20 && !over; i++) {
      over = sim.step(0.05).some((e) => e.type === 'over');
      maxItems = Math.max(maxItems, sim.items.length);
    }
    expect(over).toBe(true);
    expect(sim.time).toBeCloseTo(START_TIME, 0);
    expect(maxItems).toBeGreaterThan(5);
  });
});

describe('tiro de precisão', () => {
  /** Plays a whole match holding over by the ballistic table (perfect shooter, or a careless one). */
  const play = (seed: number, careful: boolean) => {
    const sim = new SniperSim(seeded(seed));
    let guard = 0;
    while (!sim.over && guard++ < 100000) {
      if (sim.ready) {
        const tg = sim.target;
        const lead = careful ? ((tg.speed * 1000) / tg.distance) * sim.timeOfFlight : 0;
        const goingOut = careful && tg.speed && Math.abs(tg.x + lead * 3) > 4;
        sim.aimX = careful ? tg.x + lead - sim.wind * driftPerWind(tg.distance) : tg.x;
        sim.aimY = careful ? -dropAt(tg.distance) : 0;
        if (!sim.holding) sim.hold(true);
        // Fire inside the steady window, at a moment the walker isn't about to turn.
        if (sim.breath > (careful ? 1 : 4.5) && !goingOut) sim.fire();
      }
      sim.step(1 / 60);
    }
    return sim;
  };

  it('scores rings by distance from the centre', () => {
    const r = targetRadius(300);
    expect(scoreImpact(0, 0, 300)).toMatchObject({ ring: 10, x: true, points: 105 });
    expect(scoreImpact(r * 0.55, 0, 300).ring).toBe(5);
    expect(scoreImpact(r * 1.01, 0, 300)).toMatchObject({ ring: 0, points: 0 });
    expect(scoreImpact(0, 0, 600).points).toBe(210);
  });

  it('the bullet drops and drifts with the wind', () => {
    expect(dropAt(600)).toBeGreaterThan(dropAt(300) * 3.9);
    expect(driftPerWind(500)).toBeCloseTo(0.45);
  });

  it('holding the breath steadies the rifle, then it shakes', () => {
    const sim = new SniperSim(seeded(1));
    const calm = sim.swayAmp;
    sim.hold(true);
    for (let i = 0; i < 60; i++) sim.step(1 / 60);
    expect(sim.swayAmp).toBeLessThan(calm / 3);
    for (let i = 0; i < 60 * (STEADY + 1); i++) sim.step(1 / 60);
    expect(sim.swayAmp).toBeGreaterThan(calm);
  });

  it('a careful shooter scores high, aiming dead centre misses at range', () => {
    for (const seed of [1, 2, 3]) {
      const good = play(seed, true);
      const bad = play(seed, false);
      expect(good.over).toBe(true);
      expect(good.impacts).toHaveLength(SHOTS);
      expect(good.impacts.filter((i) => i.ring >= 8).length).toBeGreaterThanOrEqual(7);
      expect(bad.score).toBeLessThan(good.score / 2);
    }
  });

  it('targets get farther and start walking', () => {
    const rnd = seeded(9);
    const ts = Array.from({ length: SHOTS }, (_, n) => sniperTarget(n, rnd));
    expect(ts[0]!.distance).toBeLessThan(260);
    expect(ts[SHOTS - 1]!.distance).toBeGreaterThan(680);
    expect(ts.slice(0, 5).every((t) => t.speed === 0)).toBe(true);
    expect(ts.slice(5).every((t) => t.speed !== 0)).toBe(true);
  });
});
