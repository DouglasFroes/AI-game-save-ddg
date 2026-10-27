import { describe, expect, it } from 'vitest';
import { HordaSim } from '@/games/horda/core';
import {
  generateTubes,
  isLevelSolved,
  isTubeComplete,
  LiquidosSim,
  pourableCount,
  TUBE_CAPACITY,
} from '@/games/liquidos/core';
import { clampAimAngle, LAUNCH_Y, PLAY_TOP, RicocheteSim } from '@/games/ricochete/core';
import { seeded } from '@/platform/rnd';

describe('Líquidos Mágicos (water sort)', () => {
  it('generates valid tubes with 2 empty helper tubes', () => {
    const tubes = generateTubes(1, seeded(42));
    expect(tubes).toHaveLength(5); // 3 colors + 2 empty
    expect(tubes[3]).toEqual([]);
    expect(tubes[4]).toEqual([]);
    expect(isLevelSolved(tubes)).toBe(false);
  });

  it('pours matching colors, supports undo and extra tube, and advances levels', () => {
    const sim = new LiquidosSim(seeded(10));
    sim.tubes = [[0, 0, 0], [0], [1, 1, 1, 1]];
    expect(pourableCount(sim.tubes[1]!, sim.tubes[0]!)).toBe(1);
    expect(pourableCount(sim.tubes[2]!, sim.tubes[0]!)).toBe(0);

    // Select tube 1 and pour into tube 0 -> solves the level
    expect(sim.tapTube(1)).toEqual([{ type: 'select', index: 1 }]);
    const ev = sim.tapTube(0);
    expect(ev.some((e) => e.type === 'pour' && e.tubeCompleted)).toBe(true);
    expect(ev.some((e) => e.type === 'levelClear')).toBe(true);
    expect(isTubeComplete(sim.tubes[0]!)).toBe(true);
    expect(sim.canUndo()).toBe(true);
    expect(sim.undo()).toBe(true);
    expect(sim.tubes[0]).toHaveLength(3);
    expect(sim.addExtraTube()).toBe(true);
    expect(sim.addExtraTube()).toBe(false); // once per level
    expect(TUBE_CAPACITY).toBe(4);
  });
});

describe('Ricochete Infinito (Ballz)', () => {
  it('clamps horizontal aim angles and fires a volley that damages bricks and collects orbs', () => {
    expect(clampAimAngle(-0.01)).toBeCloseTo(-0.22);
    expect(clampAimAngle(-Math.PI / 2)).toBeCloseTo(-Math.PI / 2);

    const sim = new RicocheteSim(seeded(7));
    sim.bricks = [{ id: 1, col: 3, row: 4, hp: 1, maxHp: 1 }];
    sim.orbs = [{ id: 2, col: 3, row: 6 }];

    const launchEv = sim.shoot(-Math.PI / 2);
    expect(launchEv).toEqual([{ type: 'launch', balls: 1 }]);
    expect(sim.phase).toBe('firing');

    let broke = false;
    let gotOrb = false;
    for (let i = 0; i < 240 && sim.phase === 'firing'; i++) {
      for (const e of sim.step(1 / 60)) {
        if (e.type === 'break') broke = true;
        if (e.type === 'extraBall') gotOrb = true;
      }
    }
    expect(broke).toBe(true);
    expect(gotOrb).toBe(true);
    expect(sim.phase).toBe('aim');
    expect(sim.ballCount).toBe(2);
    expect(sim.turn).toBe(2);
  });

  it('ends the game when a brick reaches the danger line', () => {
    const sim = new RicocheteSim(seeded(3));
    sim.bricks = [{ id: 99, col: 0, row: 11, hp: 5, maxHp: 5 }];
    sim.shoot(-0.5);
    const ev = sim.recallBalls();
    expect(ev.some((e) => e.type === 'gameOver')).toBe(true);
    expect(sim.dead).toBe(true);
    expect(LAUNCH_Y).toBeGreaterThan(PLAY_TOP);
  });
});

describe('Sobrevivente da Horda (survivor arena)', () => {
  it('auto-fires at enemies, drops XP gems, levels up, and applies upgrades', () => {
    const sim = new HordaSim(seeded(15));
    // Place a weak enemy right next to the hero
    sim.enemies.push({
      id: 500,
      type: 'bat',
      x: sim.x + 80,
      y: sim.y,
      hp: 10,
      maxHp: 10,
      speed: 50,
      r: 22,
      xpValue: 30,
    });

    let killed = false;
    let leveledUp = false;
    for (let i = 0; i < 120 && !leveledUp; i++) {
      for (const ev of sim.step(1 / 60)) {
        if (ev.type === 'kill') killed = true;
        if (ev.type === 'gem' && ev.levelUp) leveledUp = true;
      }
    }

    expect(killed).toBe(true);
    expect(leveledUp).toBe(true);
    expect(sim.level).toBe(2);
    expect(sim.choices).toHaveLength(3);

    const prevCount = sim.projectileCount;
    expect(sim.chooseUpgrade('multiShot')).toBe(true);
    expect(sim.projectileCount).toBe(prevCount + 1);
    expect(sim.choices).toBeNull();
  });
});
