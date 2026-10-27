import { describe, expect, it } from 'vitest';
import {
  AirHockey,
  H,
  matchPoints,
  MAX_PUCK_SPEED,
  Opponent,
  opponentLevel,
  PUCK_R,
  W,
} from '@/games/hoquei/core';
import { seeded } from '@/platform/rnd';

const DT = 1 / 120;

describe('hoquei table', () => {
  it('keeps the puck on the table and under the speed limit', () => {
    const g = new AirHockey(0);
    const rnd = seeded(4);
    for (let i = 0; i < 120 * 90 && g.winner === null; i++) {
      g.step(DT, { x: rnd() * W, y: H / 2 + rnd() * H }, { x: rnd() * W, y: rnd() * H });
      const p = g.puck;
      expect(p.x).toBeGreaterThanOrEqual(PUCK_R - 0.001);
      expect(p.x).toBeLessThanOrEqual(W - PUCK_R + 0.001);
      expect(Math.hypot(p.vx, p.vy)).toBeLessThanOrEqual(MAX_PUCK_SPEED + 0.001);
    }
  });

  it('scores a goal when the puck crosses the line, and the loser serves', () => {
    const g = new AirHockey(0);
    g.freeze = 0;
    g.puck = { x: W / 2, y: 60, vx: 0, vy: -900 };
    for (let i = 0; i < 120 && g.score[0] === 0; i++) {
      g.step(DT, { x: W / 2, y: H - 100 }, { x: 60, y: 200 });
    }
    expect(g.score).toEqual([1, 0]);
    expect(g.puck.y).toBeLessThan(H / 2); // the CPU conceded, so the CPU serves
    expect(g.freeze).toBeGreaterThan(0);
  });

  it('sends the puck away from a mallet swung through it', () => {
    const g = new AirHockey(0);
    g.freeze = 0;
    g.puck = { x: 300, y: 600, vx: 0, vy: 0 };
    for (let i = 0; i < 40; i++) g.step(DT, { x: 300, y: 720 }, { x: 300, y: 100 });
    let hit = false;
    for (let i = 0; i < 80 && !hit; i++) {
      g.step(DT, { x: 300, y: 450 }, { x: 300, y: 100 });
      hit = g.events.includes('mallet');
    }
    expect(hit).toBe(true);
    expect(g.puck.vy).toBeLessThan(0);
  });

  it('keeps each mallet on its own half', () => {
    const g = new AirHockey(0);
    for (let i = 0; i < 100; i++) g.step(DT, { x: 300, y: 0 }, { x: 300, y: H });
    expect(g.mallets[0].y).toBeGreaterThan(H / 2);
    expect(g.mallets[1].y).toBeLessThan(H / 2);
  });
});

describe('hoquei opponent', () => {
  const duel = (
    levelYou: number | null,
    levelCpu: number,
    seed: number,
    seconds = 300,
  ): AirHockey => {
    const g = new AirHockey(0);
    const rnd = seeded(seed);
    const cpu = new Opponent(1, levelCpu, rnd);
    const you = levelYou === null ? null : new Opponent(0, levelYou, rnd);
    for (let i = 0; i < seconds * 120 && g.winner === null; i++) {
      const t = you ? you.target(g, DT) : { x: W / 2, y: H - 100 };
      g.step(DT, t, cpu.target(g, DT), you ? you.params.speed : 2200, cpu.params.speed);
    }
    return g;
  };

  /** Games the first side leads after 3 minutes, out of 5 seeds. */
  const leads = (levelYou: number, levelCpu: number, seat: 0 | 1): number => {
    let n = 0;
    for (let s = 1; s <= 5; s++) {
      const g = duel(levelYou, levelCpu, s, 180);
      if (g.score[seat] > g.score[seat === 0 ? 1 : 0]) n++;
    }
    return n;
  };

  it('can be beaten: a sharp player leads the first level in most games', () => {
    expect(leads(4, 0, 0)).toBeGreaterThanOrEqual(3);
  });

  it('gets harder with the level', () => {
    expect(opponentLevel(5).speed).toBeGreaterThan(opponentLevel(0).speed);
    expect(opponentLevel(5).error).toBeLessThan(opponentLevel(0).error);
    expect(leads(0, 5, 1)).toBeGreaterThanOrEqual(3);
  });

  it('keeps scoring on a weak player over time', () => {
    const g = duel(0, 5, 2, 400);
    expect(g.score[1]).toBeGreaterThanOrEqual(3);
  });

  it('pays more for later matches and bigger wins', () => {
    expect(matchPoints(2, 5, 1)).toBeGreaterThan(matchPoints(0, 5, 4));
  });
});
