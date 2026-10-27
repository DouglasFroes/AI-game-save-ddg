import { describe, expect, it } from 'vitest';
import { CELLS, FLEET, Fleet, Hunter, hunterSkill, winPoints } from '@/games/naval/core';
import { seeded } from '@/platform/rnd';

describe('naval fleet', () => {
  it('places every ship inside the grid without overlap', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const f = Fleet.random(seeded(seed));
      const all = f.ships.flatMap((s) => [...s.cells]);
      expect(f.ships.map((s) => s.size)).toEqual([...FLEET]);
      expect(new Set(all).size).toBe(all.length);
      for (const s of f.ships) {
        const rows = new Set(s.cells.map((i) => Math.floor(i / 10)));
        const cols = new Set(s.cells.map((i) => i % 10));
        expect(s.horizontal ? rows.size === 1 : cols.size === 1).toBe(true);
        expect(s.cells.every((i) => i >= 0 && i < CELLS)).toBe(true);
      }
    }
  });

  it('reports hits, misses, repeats and sunk ships', () => {
    const f = Fleet.random(seeded(3));
    const ship = f.ships[4]!; // the 2-cell destroyer
    const water = [...Array(CELLS).keys()].find((i) => f.shipIndexAt(i) < 0)!;
    expect(f.shoot(water)).toEqual({ repeat: false, hit: false, sunk: null });
    expect(f.shoot(water).repeat).toBe(true);
    expect(f.shoot(ship.cells[0]!).sunk).toBeNull();
    const last = f.shoot(ship.cells[1]!);
    expect(last.hit && last.sunk === ship).toBe(true);
    expect(f.sunkCount).toBe(1);
    expect(f.allSunk).toBe(false);
  });
});

describe('naval hunter', () => {
  const clear = (skill: number, seed: number): number => {
    const rnd = seeded(seed);
    const f = Fleet.random(rnd);
    const h = new Hunter(skill);
    let shots = 0;
    while (!f.allSunk && shots < CELLS) {
      const i = h.nextShot(rnd);
      const r = f.shoot(i);
      expect(r.repeat).toBe(false); // never fires twice at a cell
      h.observe(i, r);
      shots++;
    }
    return shots;
  };
  const average = (skill: number) => {
    let n = 0;
    for (let s = 1; s <= 30; s++) n += clear(skill, s);
    return n / 30;
  };

  it('sinks the fleet well before covering the whole grid', () => {
    expect(average(1)).toBeLessThan(65);
  });

  it('is much better than shooting blind', () => {
    expect(average(1)).toBeLessThan(average(0) - 15);
  });

  it('gets more accurate with each win, and pays more for speed', () => {
    expect(hunterSkill(0)).toBeLessThan(hunterSkill(3));
    expect(hunterSkill(20)).toBe(1);
    expect(winPoints(0, 40, 3)).toBeGreaterThan(winPoints(0, 80, 3));
  });
});
