import { describe, expect, it } from 'vitest';
import {
  CAR_H,
  CAR_W,
  laneX,
  MAX_SPEED,
  overlaps,
  PLAYER_Y,
  ROAD_LEFT,
  ROAD_RIGHT,
  RoadSim,
  speedFor,
  START_LIVES,
  START_SPEED,
} from '@/games/roadfighter/core';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const run = (sim: RoadSim, seconds: number, steer: number | null = null) => {
  const events = [];
  for (let t = 0; t < seconds * 60 && !sim.over; t++) events.push(...sim.step(1 / 60, steer));
  return events;
};

describe('road fighter', () => {
  it('speeds up with distance up to a cap', () => {
    expect(speedFor(0)).toBe(START_SPEED);
    expect(speedFor(1e9)).toBe(MAX_SPEED);
  });

  it('keeps the car on the road', () => {
    const sim = new RoadSim(seeded(1));
    sim.step(1, -500);
    expect(sim.playerX).toBe(ROAD_LEFT + CAR_W / 2);
    sim.step(1, 5000);
    expect(sim.playerX).toBe(ROAD_RIGHT - CAR_W / 2);
  });

  it('crashes, loses a life and becomes briefly invulnerable', () => {
    const sim = new RoadSim(seeded(2));
    sim.cars.push({
      id: 999,
      kind: 'blue',
      x: sim.playerX,
      y: PLAYER_Y,
      w: CAR_W,
      h: CAR_H,
      speed: 0,
      targetX: sim.playerX,
      swerved: false,
    });
    const events = sim.step(1 / 60, null);
    expect(events.some((e) => e.type === 'crash')).toBe(true);
    expect(sim.lives).toBe(START_LIVES - 1);
    expect(sim.invulnerable).toBeGreaterThan(0);
  });

  it('runs out of fuel eventually when nothing is collected', () => {
    const sim = new RoadSim(seeded(3));
    sim.step(0, null);
    sim.fuel = 0.01;
    const events = sim.step(1 / 60, null);
    expect(events.at(-1)).toEqual({ type: 'over', reason: 'fuel' });
    expect(sim.step(1, null)).toEqual([]);
  });

  it('spawns traffic, counts passed cars and scores distance', () => {
    const sim = new RoadSim(seeded(4));
    sim.lives = 999;
    sim.fuel = 1e9;
    run(sim, 30);
    expect(sim.passed).toBeGreaterThan(0);
    expect(sim.score).toBe(sim.meters + sim.passed * 10);
    for (const car of sim.cars) {
      expect(car.x).toBeGreaterThanOrEqual(laneX(0) - 1);
      expect(car.x).toBeLessThanOrEqual(laneX(3) + 1);
    }
  });

  it('uses forgiving hitboxes', () => {
    const a = { x: 0, y: 0, w: 60, h: 100 };
    expect(overlaps(a, { x: 56, y: 0, w: 60, h: 100 })).toBe(false);
    expect(overlaps(a, { x: 40, y: 0, w: 60, h: 100 })).toBe(true);
  });
});
