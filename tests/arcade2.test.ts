import { describe, expect, it } from 'vitest';
import { AlvoSim, FLIGHT_S, IMPACT, levelInfo } from '@/games/alvo/core';
import { COLS as CROSS_COLS, CrossSim } from '@/games/atravessa/core';
import { LenhaSim } from '@/games/lenha/core';
import { PianoSim, VISIBLE } from '@/games/piano/core';
import { MAX_GAP, PulaSim } from '@/games/pula/core';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
const DT = 1 / 60;

describe('lenhador', () => {
  it('scores a chop on the safe side and refills time', () => {
    const g = new LenhaSim(seeded(1));
    g.branches[0] = null;
    g.branches[1] = 'right';
    g.time = 0.5;
    expect(g.chop('left').some((e) => e.type === 'chop')).toBe(true);
    expect(g.score).toBe(1);
    expect(g.time).toBeGreaterThan(0.5);
    expect(g.over).toBeNull();
  });

  it('a branch coming down on the kid ends the run', () => {
    const g = new LenhaSim(seeded(2));
    g.branches[0] = null;
    g.branches[1] = 'left';
    g.chop('left');
    expect(g.over).toBe('branch');
  });

  it('walking into a branch ends the run', () => {
    const g = new LenhaSim(seeded(3));
    g.branches[0] = 'right';
    g.chop('right');
    expect(g.over).toBe('branch');
  });

  it('the timer runs out, faster with a higher score', () => {
    const g = new LenhaSim(seeded(4));
    const slow = g.drain;
    g.started = true;
    g.score = 100;
    expect(g.drain).toBeGreaterThan(slow);
    for (let i = 0; i < 600 && !g.over; i++) g.step(DT);
    expect(g.over).toBe('time');
  });

  it('a bot that reads the next branch never gets hit', () => {
    const g = new LenhaSim(seeded(5));
    for (let i = 0; i < 500; i++) {
      // Pick the side without a branch on the next segment (and not walking into one).
      const side = g.branches[1] === 'left' || g.branches[0] === 'left' ? 'right' : 'left';
      g.chop(side);
      expect(g.over).toBeNull();
    }
  });
});

describe('toque rápido', () => {
  it('taps the next tile in order, speeding up', () => {
    const g = new PianoSim(seeded(1));
    const first = g.next!;
    const speed = g.speed;
    expect(g.tap(first.col, first.y + 0.5)[0]).toMatchObject({ type: 'hit' });
    expect(g.started).toBe(true);
    for (let i = 0; i < 400 && g.score < 21; i++) {
      g.step(0.05);
      const n = g.next;
      if (n && n.y >= 0) g.tap(n.col, n.y + 0.5); // only tiles on screen, like a player
    }
    expect(g.over).toBeNull();
    expect(g.score).toBe(21);
    expect(g.speed).toBeGreaterThan(speed);
  });

  it('tapping an empty cell ends the run', () => {
    const g = new PianoSim(seeded(2));
    const n = g.next!;
    expect(g.tap((n.col + 1) % 4, n.y + 0.5)[0]).toMatchObject({ type: 'over', reason: 'wrong' });
  });

  it('letting a tile reach the bottom ends the run', () => {
    const g = new PianoSim(seeded(3));
    const n = g.next!;
    g.tap(n.col, n.y + 0.5);
    let over = false;
    for (let i = 0; i < 600 && !over; i++) over = g.step(DT).some((e) => e.type === 'over');
    expect(g.over).toBe('missed');
    expect(VISIBLE).toBe(4);
  });
});

describe('acerta o alvo', () => {
  it('sticks pencils and clears the level after all of them', () => {
    const g = new AlvoSim(seeded(1));
    const n = levelInfo(1).pencils;
    for (let i = 0; i < n && g.level === 1; i++) {
      g.throw();
      for (let t = 0; t < 20; t++) g.step(DT);
      // Space throws so they don't hit each other.
      for (let t = 0; t < 25; t++) g.step(DT);
    }
    expect(g.over).toBe(false);
    expect(g.level).toBe(2);
    expect(g.score).toBeGreaterThanOrEqual(n);
  });

  it('hitting a stuck pencil ends the run', () => {
    const g = new AlvoSim(seeded(2));
    g.stuck.push((IMPACT - g.angle + 100 * Math.PI) % (2 * Math.PI));
    // Freeze the spin for the throw.
    g.spin = () => 0;
    g.throw();
    for (let t = 0; t < 10; t++) g.step(FLIGHT_S / 2);
    expect(g.over).toBe(true);
  });

  it('later levels bring obstacles and apples', () => {
    expect(levelInfo(1).obstacles).toBe(0);
    expect(levelInfo(5).obstacles).toBeGreaterThan(0);
    expect(levelInfo(2).apples).toBe(1);
  });
});

describe('pula pula', () => {
  it('bounces on platforms and climbs', () => {
    const g = new PulaSim(seeded(1));
    for (let i = 0; i < 60 * 10 && !g.over; i++) {
      // Steer towards the nearest platform above-ish.
      const target = g.platforms
        .filter((p) => p.y > g.y - 50 && p.kind !== 'fragile')
        .sort((a, b) => a.y - b.y)[0];
      const dir = target ? Math.sign(target.x - g.x) : 0;
      g.step(DT, Math.abs((target?.x ?? g.x) - g.x) > 20 ? dir : 0);
    }
    expect(g.score).toBeGreaterThan(50);
  });

  it('always generates reachable gaps', () => {
    const g = new PulaSim(seeded(2));
    const ys = g.platforms
      .filter((p) => p.kind !== 'fragile')
      .map((p) => p.y)
      .sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++)
      expect(ys[i]! - ys[i - 1]!).toBeLessThanOrEqual(MAX_GAP + 1);
  });

  it('falling off the bottom ends the run', () => {
    const g = new PulaSim(seeded(3));
    g.platforms.length = 0;
    for (let i = 0; i < 300 && !g.over; i++) g.step(DT, 0);
    expect(g.over).toBe(true);
  });
});

describe('atravessa', () => {
  it('scores by going forward, blocked by trees', () => {
    const g = new CrossSim(seeded(1));
    expect(g.hop('up')[0]).toMatchObject({ type: 'hop', row: 1, best: true });
    expect(g.score).toBe(1);
    // Row 1 has trees on the edges: hopping left from the center works, into column 0 doesn't.
    g.x = 1;
    expect(g.hop('left')).toEqual([]);
    expect(CROSS_COLS).toBe(9);
  });

  it('a car on the kid ends the run', () => {
    const g = new CrossSim(seeded(2));
    let row = 3;
    while (g.lane(row).kind !== 'road') row++;
    g.row = row;
    g.x = 4;
    g.lane(row).movers.length = 0;
    g.lane(row).movers.push({ x: 4, len: 1 });
    expect(g.step(DT).some((e) => e.type === 'over')).toBe(true);
    expect(g.over).toBe('carro');
  });

  it('water without a log ends the run; a log carries the kid', () => {
    const g = new CrossSim(seeded(3));
    let row = 3;
    while (g.lane(row).kind !== 'river') row++;
    const lane = g.lane(row);
    g.row = row;
    lane.movers.length = 0;
    lane.movers.push({ x: 3, len: 3 });
    g.x = 4;
    const before = g.x;
    g.step(DT);
    expect(g.over).toBeNull();
    expect(g.x).not.toBe(before);
    lane.movers.length = 0;
    g.step(DT);
    expect(g.over).toBe('agua');
  });

  it('the eagle comes for a kid standing still', () => {
    const g = new CrossSim(seeded(4));
    for (let i = 0; i < 60 * 8 && !g.over; i++) g.step(DT);
    expect(g.over).toBe('aguia');
  });
});
