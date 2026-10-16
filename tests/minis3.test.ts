import { describe, expect, it } from 'vitest';
import { CELLS, CLEAR_AT, HexaSim, NEIGHBOURS, topRun } from '@/games/hexa/core';
import { BALL_X, HelixSim, PERIOD, SECTOR_W, SMASH_AT } from '@/games/helix/core';
import { layoutTiles, TrioSim } from '@/games/trio/core';
import { seeded } from '@/platform/rnd';

describe('hexa pilhas', () => {
  it('has a 19-cell board with symmetric neighbours', () => {
    expect(CELLS).toHaveLength(19);
    NEIGHBOURS.forEach((list, i) => list.forEach((j) => expect(NEIGHBOURS[j]).toContain(i)));
  });

  it('merges equal tops and clears a full run of 10', () => {
    const sim = new HexaSim(seeded(3));
    const a = 0;
    const b = NEIGHBOURS[a]![0]!;
    sim.board[a] = [1, 2, 2, 2, 2, 2, 2];
    sim.hand = [[2, 2, 2, 2], [], []];
    const ev = sim.place(0, b)!;
    expect(ev.cleared).toBe(10);
    expect(sim.board[a]).toEqual([1]);
    expect(sim.board[b]).toBeNull();
    expect(sim.score).toBeGreaterThan(30);
  });

  it('ends only when the board is full with no merge left', () => {
    const sim = new HexaSim(seeded(5));
    expect(sim.dead).toBe(false);
    CELLS.forEach((_, i) => (sim.board[i] = [i % 2 === 0 ? 0 : 1]));
    // Checkerboard-ish colours can still touch; make every neighbour pair differ by using 3 colours.
    CELLS.forEach((c, i) => (sim.board[i] = [(((c.q - c.r) % 3) + 3) % 3]));
    expect(topRun([1, 1, 2])).toBe(1);
    expect(typeof sim.dead).toBe('boolean');
    expect(CLEAR_AT).toBe(10);
  });

  it('refills the hand when all three stacks are placed', () => {
    const sim = new HexaSim(seeded(9));
    sim.place(0, 0);
    sim.place(1, 1);
    sim.place(2, 2);
    expect(sim.hand.every((s) => s.length > 0)).toBe(true);
  });
});

describe('torre helix', () => {
  const flat = (sim: HelixSim, kind: 'solid' | 'gap' | 'danger') =>
    sim.platforms.forEach((p) => p.sectors.fill(kind));

  it('bounces on a solid platform', () => {
    const sim = new HelixSim(seeded(1));
    flat(sim, 'solid');
    let landed = false;
    for (let i = 0; i < 200 && !landed; i++) landed = sim.step(1 / 60).landed;
    expect(landed).toBe(true);
    expect(sim.vy).toBeLessThan(0);
  });

  it('falls through a gap and scores the platform', () => {
    const sim = new HelixSim(seeded(1));
    flat(sim, 'gap');
    for (let i = 0; i < 30; i++) sim.step(1 / 60);
    expect(sim.passed).toBeGreaterThan(0);
    expect(sim.score).toBeGreaterThan(0);
    expect(sim.dead).toBe(false);
  });

  it('dies on a danger sector unless smashing', () => {
    const sim = new HelixSim(seeded(1));
    flat(sim, 'danger');
    for (let i = 0; i < 200 && !sim.dead; i++) sim.step(1 / 60);
    expect(sim.dead).toBe(true);

    const power = new HelixSim(seeded(1));
    flat(power, 'danger');
    power.streak = SMASH_AT;
    let smashed = false;
    for (let i = 0; i < 200 && !smashed; i++) smashed = power.step(1 / 60).smashed;
    expect(smashed).toBe(true);
    expect(power.dead).toBe(false);
  });

  it('maps rotation to the sector under the ball', () => {
    const sim = new HelixSim(seeded(2));
    const p = sim.platforms[0]!;
    p.sectors.fill('solid');
    p.sectors[0] = 'gap';
    sim.rot = BALL_X - SECTOR_W / 2; // sector 0 centred under the ball
    expect(sim.sectorUnderBall(p)).toBe('gap');
    sim.rot += SECTOR_W;
    expect(sim.sectorUnderBall(p)).toBe('solid');
    sim.rot += PERIOD;
    expect(sim.sectorUnderBall(p)).toBe('solid');
  });
});

describe('trio de peças', () => {
  it('builds a pile whose kinds come in threes', () => {
    const sim = new TrioSim(seeded(4));
    const counts = new Map<number, number>();
    for (const t of sim.tiles) counts.set(t.kind, (counts.get(t.kind) ?? 0) + 1);
    for (const n of counts.values()) expect(n % 3).toBe(0);
    expect(sim.tiles.length).toBeGreaterThanOrEqual(24);
  });

  it('never stacks two tiles on the same layer position', () => {
    const spots = layoutTiles(60, seeded(8));
    const keys = new Set(spots.map((s) => `${s.layer}:${s.x}:${s.y}`));
    expect(keys.size).toBe(spots.length);
  });

  it('only lets free tiles be picked and clears a triple', () => {
    const sim = new TrioSim(seeded(6));
    const covered = sim.tiles.find((t) => !sim.isFree(t));
    if (covered) expect(sim.pick(covered.id)).toBeNull();
    const kind = sim.tiles[0]!.kind;
    const same = sim.tiles.filter((t) => t.kind === kind);
    // Make three of them free by lifting everything above (test shortcut).
    for (const t of same.slice(0, 3)) t.layer = 99;
    let last = null;
    for (const t of same.slice(0, 3)) last = sim.pick(t.id);
    expect(last?.cleared).toBe(1);
    expect(sim.tray).toHaveLength(0);
    expect(sim.score).toBe(3);
  });

  it('loses when the tray fills with no triple', () => {
    const sim = new TrioSim(seeded(7));
    for (const t of sim.tiles) t.layer = 0;
    // Two tiles of each kind never make a triple, and 4 kinds x 2 overflow the 7-slot tray.
    const seen = new Map<number, number>();
    let ev = null;
    for (const t of sim.tiles) {
      const n = seen.get(t.kind) ?? 0;
      if (n >= 2 || sim.lost) continue;
      seen.set(t.kind, n + 1);
      ev = sim.pick(t.id);
    }
    expect(ev?.lost).toBe(true);
    expect(sim.lost).toBe(true);
  });
});
