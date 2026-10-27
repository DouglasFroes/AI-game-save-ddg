import { describe, expect, it } from 'vitest';
import { FENCE_CLEAR, RunSim, START_SPEED, type Obstacle } from '@/games/corre/core';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const DT = 1 / 60;
/** A course with nothing but `obstacles` (spawning pushed far away). */
function course(obstacles: Omit<Obstacle, 'id'>[]): RunSim {
  const sim = new RunSim(seeded(1));
  (sim as unknown as { nextRow: number }).nextRow = 1e9;
  obstacles.forEach((o, i) => sim.obstacles.push({ id: i + 1, ...o }));
  return sim;
}
const run = (sim: RunSim, s: number) => {
  for (let i = 0; i < s * 60 && !sim.crashed; i++) sim.step(DT);
};

describe('corre', () => {
  it('runs faster over time and scores distance plus coins', () => {
    const sim = course([]);
    run(sim, 5);
    expect(sim.speed).toBeGreaterThan(START_SPEED);
    expect(sim.meters).toBeGreaterThan(60);
    sim.coins = 3;
    expect(sim.score).toBe(Math.floor(sim.meters) + 30);
  });

  it('crashes into a bus in its lane and dodges it by changing lanes', () => {
    const hit = course([{ kind: 'onibus', lane: 0, z: 10, len: 9 }]);
    run(hit, 2);
    expect(hit.crashed).toBe('onibus');
    const dodge = course([{ kind: 'onibus', lane: 0, z: 10, len: 9 }]);
    dodge.move('left');
    run(dodge, 2);
    expect(dodge.crashed).toBeNull();
  });

  it('jumps over fences and slides under banners', () => {
    const fence = course([{ kind: 'cerca', lane: 0, z: 6, len: 0.6 }]);
    let jumped = false;
    for (let i = 0; i < 120 && !fence.crashed; i++) {
      if (!jumped && fence.obstacles[0]!.z < 3) {
        fence.move('up');
        jumped = true;
      }
      fence.step(DT);
    }
    expect(fence.crashed).toBeNull();
    expect(FENCE_CLEAR).toBeLessThan(1.5);

    const banner = course([{ kind: 'faixa', lane: 0, z: 6, len: 0.6 }]);
    let slid = false;
    for (let i = 0; i < 120 && !banner.crashed; i++) {
      if (!slid && banner.obstacles[0]!.z < 2) {
        banner.move('down');
        slid = true;
      }
      banner.step(DT);
    }
    expect(banner.crashed).toBeNull();

    const standing = course([{ kind: 'faixa', lane: 0, z: 6, len: 0.6 }]);
    run(standing, 2);
    expect(standing.crashed).toBe('faixa');
  });

  it('a shield takes one hit', () => {
    const sim = course([
      { kind: 'onibus', lane: 0, z: 8, len: 9 },
      { kind: 'cerca', lane: 0, z: 40, len: 0.6 },
    ]);
    sim.shield = true;
    run(sim, 4);
    expect(sim.shield).toBe(false);
    expect(sim.crashed).toBe('cerca');
  });

  it('the magnet pulls coins from other lanes', () => {
    const sim = course([]);
    sim.magnet = 5;
    for (let i = 0; i < 5; i++)
      sim.coinList.push({ id: 100 + i, lane: 1, z: 10 + i * 2, y: 0.6, pulled: false });
    run(sim, 2);
    expect(sim.coins).toBe(5);
  });

  it('always leaves a lane without a bus in every row', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const sim = new RunSim(seeded(seed));
      for (let i = 0; i < 60 * 120; i++) {
        sim.crashed = null; // keep running regardless
        sim.step(DT);
        const buses = sim.obstacles.filter((o) => o.kind === 'onibus');
        for (const b of buses) {
          const overlapping = new Set(
            buses.filter((o) => o.z < b.z + b.len && b.z < o.z + o.len).map((o) => o.lane),
          );
          if (overlapping.size === 3) expect.fail(`seed ${seed}: all lanes blocked`);
        }
      }
    }
  });
});
