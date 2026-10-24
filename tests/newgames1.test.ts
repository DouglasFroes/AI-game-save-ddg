import { describe, expect, it } from 'vitest';
import { BLAST_R, CadeiaSim, FIELD, levelSpec, type Atom } from '@/games/cadeia/core';
import { FLOOR_Y, GanchoSim } from '@/games/gancho/core';
import { OrbitaSim } from '@/games/orbita/core';
import { seeded } from '@/platform/rnd';

describe('Gancho Elástico (rope swing)', () => {
  it('lays anchors ahead of the player, in order', () => {
    const sim = new GanchoSim(seeded(1));
    expect(sim.anchors.length).toBeGreaterThan(5);
    for (let i = 1; i < sim.anchors.length; i++) {
      expect(sim.anchors[i]!.x).toBeGreaterThan(sim.anchors[i - 1]!.x);
    }
    for (const a of sim.anchors) expect(a.y).toBeLessThan(FLOOR_Y - 400);
  });

  it('grabs an anchor above and keeps the ball on a rope no longer than it was thrown', () => {
    const sim = new GanchoSim(seeded(3));
    const ev = sim.attach();
    expect(ev[0]?.type).toBe('attach');
    const a = sim.anchor!;
    for (let i = 0; i < 90 && !sim.dead; i++) {
      sim.step(1 / 60);
      expect(Math.hypot(sim.x - a.x, sim.y - a.y)).toBeLessThanOrEqual(sim.ropeLen + 0.5);
    }
  });

  it('releases the rope and keeps flying', () => {
    const sim = new GanchoSim(seeded(3));
    sim.attach();
    sim.step(0.2);
    expect(sim.release()[0]?.type).toBe('release');
    expect(sim.anchor).toBeNull();
    expect(sim.release()).toEqual([]);
  });

  it('burns in the lava if you never throw the rope', () => {
    const sim = new GanchoSim(seeded(5));
    let dead = false;
    for (let i = 0; i < 400 && !dead; i++) {
      dead = sim.step(1 / 60).some((e) => e.type === 'dead');
    }
    expect(dead).toBe(true);
    expect(sim.dead).toBe(true);
    expect(sim.step(1 / 60)).toEqual([]);
  });

  it('collects stars and rewards quick pickups with a combo', () => {
    const sim = new GanchoSim(seeded(7));
    sim.starList = [
      { x: sim.x, y: sim.y, taken: false },
      { x: sim.x, y: sim.y, taken: false },
    ];
    const stars = sim.step(0.001).filter((e) => e.type === 'star');
    expect(stars).toHaveLength(2);
    expect(sim.stars).toBe(2);
    expect(sim.bonus).toBe(10 + 20);
    expect(sim.score).toBe(sim.meters + 30);
  });

  it('scrolls faster over time and refuses to throw with nothing in reach', () => {
    const sim = new GanchoSim(seeded(9));
    const early = sim.scrollSpeed;
    sim.time = 60;
    expect(sim.scrollSpeed).toBeGreaterThan(early);
    sim.anchors = [];
    expect(sim.attach()).toEqual([]);
  });
});

describe('Órbita (planet hopping)', () => {
  it('starts on a circular orbit that keeps its radius', () => {
    const sim = new OrbitaSim(seeded(2));
    expect(sim.mode).toBe('orbit');
    for (let i = 0; i < 120; i++) sim.step(1 / 60);
    const d = Math.hypot(sim.x - sim.cur.x, sim.y - sim.cur.y);
    expect(d).toBeCloseTo(sim.orbitR, 5);
  });

  it('launches along the tangent at fly speed', () => {
    const sim = new OrbitaSim(seeded(2));
    expect(sim.launch()[0]?.type).toBe('launch');
    expect(sim.mode).toBe('fly');
    expect(Math.hypot(sim.vx, sim.vy)).toBeCloseTo(sim.flySpeed, 5);
    expect(sim.launch()).toEqual([]);
  });

  it('captures a planet it flies straight at, and calls it an aimed shot', () => {
    const sim = new OrbitaSim(seeded(2));
    const target = { id: 99, x: 238, y: 500, r: 50, hot: false, gem: null };
    sim.planets = [sim.cur, target];
    sim.angle = Math.PI; // left side of the ring, moving up
    sim.step(0.0001);
    sim.launch();
    let captured = false;
    for (let i = 0; i < 200 && !captured; i++) {
      for (const e of sim.step(1 / 60)) {
        if (e.type === 'capture') {
          captured = true;
          expect(e.planet.id).toBe(99);
          expect(e.aimed).toBe(true);
        }
      }
    }
    expect(captured).toBe(true);
    expect(sim.mode).toBe('orbit');
    expect(sim.visited).toBe(1);
    expect(sim.score).toBe(10 + 5);
  });

  it('burns up when it touches a red giant', () => {
    const sim = new OrbitaSim(seeded(2));
    // A far-off planet keeps the generator from adding ones that would capture us first.
    sim.planets = [
      sim.cur,
      { id: 50, x: 238, y: 700, r: 50, hot: true, gem: null },
      { id: 51, x: 238, y: -4000, r: 50, hot: false, gem: null },
    ];
    sim.angle = Math.PI;
    sim.step(0.0001);
    sim.launch();
    let reason = '';
    for (let i = 0; i < 200 && !sim.dead; i++) {
      for (const e of sim.step(1 / 60)) if (e.type === 'dead') reason = e.reason;
    }
    expect(reason).toBe('burn');
  });

  it('is lost once it leaves the screen', () => {
    const sim = new OrbitaSim(seeded(2));
    sim.mode = 'fly';
    sim.vx = 0;
    sim.vy = 0;
    sim.x = 5000;
    expect(sim.step(0.016).some((e) => e.type === 'dead')).toBe(true);
  });

  it('collects a gem it passes through', () => {
    const sim = new OrbitaSim(seeded(2));
    sim.cur.gem = sim.angle + 0.05;
    const events = sim.step(1 / 60);
    expect(events.some((e) => e.type === 'gem')).toBe(true);
    expect(sim.gems).toBe(1);
    expect(sim.cur.gem).toBeNull();
  });
});

describe('Reação em Cadeia (chain reaction)', () => {
  const still = (id: number, x: number, y: number): Atom => ({
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    r: 15,
    phase: 'idle',
    t: 0,
    hue: 0.5,
  });

  const run = (sim: CadeiaSim) => {
    const events = [];
    for (let i = 0; i < 600 && sim.state !== 'done'; i++) events.push(...sim.step(1 / 60));
    return events;
  };

  it('scales the level: more atoms, higher targets, always winnable', () => {
    let prev = levelSpec(1);
    for (let l = 2; l <= 30; l++) {
      const now = levelSpec(l);
      expect(now.count).toBeGreaterThanOrEqual(prev.count);
      expect(now.target).toBeGreaterThanOrEqual(prev.target);
      expect(now.target).toBeLessThan(now.count);
      prev = now;
    }
  });

  it('turns a line of atoms into a chain and pays more for each link', () => {
    const sim = new CadeiaSim(seeded(4));
    const x0 = FIELD.x + 120;
    const y = FIELD.y + 300;
    sim.atoms = [1, 2, 3, 4, 5].map((i) => still(i, x0 + i * 60, y));
    sim.target = 4;
    sim.tap(x0, y);
    const events = run(sim);
    const pops = events.filter((e) => e.type === 'pop');
    expect(pops).toHaveLength(5);
    expect(sim.popped).toBe(5);
    expect(sim.bestChain).toBe(5);
    expect(pops.map((p) => (p.type === 'pop' ? p.points : 0))).toEqual([10, 20, 30, 40, 50]);
    const end = events.find((e) => e.type === 'levelEnd');
    expect(end && end.type === 'levelEnd' && end.cleared).toBe(true);
    expect(sim.cleared).toBe(true);
    sim.advance();
    expect(sim.level).toBe(2);
    expect(sim.state).toBe('aim');
  });

  it('only allows one tap, inside the field', () => {
    const sim = new CadeiaSim(seeded(4));
    expect(sim.tap(0, 0)).toEqual([]);
    expect(sim.tap(FIELD.x + 100, FIELD.y + 100)).toHaveLength(1);
    expect(sim.tap(FIELD.x + 200, FIELD.y + 200)).toEqual([]);
  });

  it('costs a life on a miss, repeats the level, and ends after the third', () => {
    const sim = new CadeiaSim(seeded(4));
    for (let miss = 1; miss <= 3; miss++) {
      sim.atoms = [still(1, FIELD.x + 600, FIELD.y + 900)];
      sim.tap(FIELD.x + 20, FIELD.y + 20);
      run(sim);
      expect(sim.cleared).toBe(false);
      expect(sim.lives).toBe(3 - miss);
      if (miss < 3) {
        sim.advance();
        expect(sim.level).toBe(1);
      }
    }
    expect(sim.over).toBe(true);
    const level = sim.level;
    sim.advance();
    expect(sim.level).toBe(level);
  });

  it('grows blasts to the full radius, then fades them out', () => {
    const sim = new CadeiaSim(seeded(4));
    sim.atoms = [];
    sim.tap(FIELD.x + 300, FIELD.y + 300);
    for (let i = 0; i < 25; i++) sim.step(1 / 60);
    expect(sim.atoms[0]!.r).toBeCloseTo(BLAST_R, 0);
    run(sim);
    expect(sim.atoms[0]!.phase).toBe('gone');
  });
});
