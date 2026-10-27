import { describe, expect, it } from 'vitest';
import {
  CAR_LEN,
  CAR_W,
  comboFor,
  GRAU_ALTO,
  GrauSim,
  LANE_W,
  MAX_COMBO,
  worldPos,
  WHEELIE_MIN,
  type GrauEvent,
  type Segment,
} from '@/games/grau/core';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const DT = 1 / 60;
const deg = (d: number) => (d * Math.PI) / 180;

/** Keeps a steady wheelie around `target` by pulsing the throttle, like a player would. */
const holdAround = (sim: GrauSim, target = deg(62)) => sim.pitch < target && sim.omega < 1.2;

function run(sim: GrauSim, seconds: number, throttle: (sim: GrauSim) => boolean, noTraffic = true) {
  const events: GrauEvent[] = [];
  for (let t = 0; t < seconds * 60 && !sim.crashed; t++) {
    if (noTraffic) sim.cars.length = 0;
    events.push(...sim.step(DT, throttle(sim)));
  }
  return events;
}

function flatSegment(sim: GrauSim, extra: Partial<Segment>): void {
  sim.segment = { ...sim.segment, potholes: [], bumps: [], length: 1000, ...extra };
}

describe('grau', () => {
  it('lifts the front while the throttle is held and drops it when released', () => {
    const sim = new GrauSim(seeded(1));
    run(sim, 1, () => true);
    expect(sim.pitch).toBeGreaterThan(WHEELIE_MIN);
    run(sim, 2, () => false);
    expect(sim.pitch).toBe(0);
    expect(sim.crashed).toBeNull();
  });

  it('flips over backwards when the throttle is held for too long', () => {
    const sim = new GrauSim(seeded(2));
    const events = run(sim, 5, () => true);
    expect(sim.crashed).toBe('loop');
    expect(events.at(-1)).toEqual({ type: 'crash', reason: 'loop' });
  });

  it('rewards a long controlled wheelie with a growing combo', () => {
    const sim = new GrauSim(seeded(3));
    flatSegment(sim, {});
    const plain = new GrauSim(seeded(3));
    flatSegment(plain, {});
    run(sim, 20, holdAround);
    run(plain, 20, () => false);
    expect(sim.crashed).toBeNull();
    expect(sim.combo).toBe(MAX_COMBO);
    expect(sim.bestWheelie).toBeGreaterThan(250);
    expect(sim.score).toBeGreaterThan(plain.score * 10);
    expect(sim.pitch).toBeGreaterThan(GRAU_ALTO);
  });

  it('caps the combo', () => {
    expect(comboFor(0)).toBe(1);
    expect(comboFor(1e6)).toBe(MAX_COMBO);
  });

  it('falls in a pothole with the front wheel down, clears it in a wheelie', () => {
    const down = new GrauSim(seeded(4));
    flatSegment(down, { potholes: [{ id: 99, s: 30, lane: 0 }] });
    run(down, 4, () => false);
    expect(down.crashed).toBe('pothole');

    const up = new GrauSim(seeded(4));
    flatSegment(up, { potholes: [{ id: 99, s: 30, lane: 0 }] });
    const events = run(up, 4, holdAround);
    expect(up.crashed).toBeNull();
    expect(events.some((e) => e.type === 'pothole' && e.bonus > 0)).toBe(true);
  });

  it('dodges a pothole by changing lanes', () => {
    const sim = new GrauSim(seeded(5));
    flatSegment(sim, { potholes: [{ id: 99, s: 30, lane: 0 }] });
    sim.steer(1);
    run(sim, 4, () => false);
    expect(sim.crashed).toBeNull();
  });

  it('crashes into a car in the same lane, passes one in another lane', () => {
    const sim = new GrauSim(seeded(6));
    flatSegment(sim, {});
    sim.cars.push({
      id: 1,
      s: 25,
      lane: 0,
      x: 0,
      speed: 5,
      cruise: 5,
      signal: 0,
      signalT: 0,
      paint: 0,
      passed: false,
    });
    run(sim, 5, () => false, false);
    expect(sim.crashed).toBe('car');

    const ok = new GrauSim(seeded(6));
    flatSegment(ok, {});
    ok.cars.push({
      id: 1,
      s: 25,
      lane: 1,
      x: LANE_W,
      speed: 5,
      cruise: 5,
      signal: 0,
      signalT: 0,
      paint: 0,
      passed: false,
    });
    const events = run(ok, 4.5, () => false, false);
    expect(ok.crashed).toBeNull();
    expect(events.some((e) => e.type === 'pass')).toBe(true);
  });

  it('always goes straight on into the next block, whatever the lane', () => {
    for (const lane of [-1, 0, 1] as const) {
      const sim = new GrauSim(seeded(7));
      flatSegment(sim, { length: 40 });
      if (lane !== 0) sim.steer(lane);
      const events = run(sim, 4, () => false);
      expect(events.find((e) => e.type === 'block')).toBeTruthy();
      expect(sim.segment.heading).toBe(0);
      expect(sim.segment.origin).toEqual({ x: 0, z: -40 });
    }
  });

  it('cars overtake slower ones by changing lanes', () => {
    const sim = new GrauSim(seeded(9));
    flatSegment(sim, {});
    const car = (id: number, s: number, cruise: number) => ({
      id,
      s,
      lane: 0,
      x: 0,
      speed: cruise,
      cruise,
      signal: 0 as const,
      signalT: 0,
      paint: 0,
      passed: false,
    });
    sim.cars.push(car(1, 90, 4), car(2, 70, 11));
    sim.x = -100; // bike far away
    const events: GrauEvent[] = [];
    for (let t = 0; t < 12 * 60; t++) {
      sim.x = -100;
      sim.speed = 0;
      events.push(...sim.step(DT, false));
    }
    const fast = sim.cars.find((c) => c.id === 2)!;
    const slow = sim.cars.find((c) => c.id === 1)!;
    expect(events.some((e) => e.type === 'overtake' && e.car.id === 2)).toBe(true);
    expect(fast.s).toBeGreaterThan(slow.s);
  });

  it('a car never cuts in right in front of the bike', () => {
    const sim = new GrauSim(seeded(10));
    flatSegment(sim, {});
    sim.steer(-1);
    run(sim, 0.5, () => false);
    const base = { lane: 0, x: 0, signal: 0 as const, signalT: 0, paint: 0, passed: false };
    sim.cars.push(
      { ...base, id: 1, s: sim.s + 22, speed: 3, cruise: 3 },
      { ...base, id: 2, s: sim.s + 12, speed: 12, cruise: 12 },
    );
    const events: GrauEvent[] = [];
    for (let t = 0; t < 60; t++) events.push(...sim.step(DT, false));
    expect(events.some((e) => e.type === 'overtake' && e.car.lane === -1)).toBe(false);
  });

  it('maps segment coordinates to the world', () => {
    const sim = new GrauSim(seeded(8));
    const seg = { ...sim.segment, heading: 1 as const, origin: { x: 10, z: 5 } };
    expect(worldPos(seg, 20, 2)).toEqual({ x: 30, z: 7 });
  });

  it('never lets traffic cars drive through each other', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const sim = new GrauSim(seeded(seed));
      for (let t = 0; t < 120 * 60 && !sim.crashed; t++) {
        sim.x = 100; // keep the bike out of the way so traffic runs freely
        sim.step(DT, false);
        const cars = sim.cars;
        for (let i = 0; i < cars.length; i++)
          for (let j = i + 1; j < cars.length; j++) {
            const [a, b] = [cars[i]!, cars[j]!];
            if (Math.abs(a.x - b.x) < CAR_W && Math.abs(a.s - b.s) < CAR_LEN)
              expect.fail(`seed ${seed}, frame ${t}: cars ${a.id} and ${b.id} overlap`);
          }
      }
      expect(sim.meters).toBeGreaterThan(1000);
    }
  });
});
