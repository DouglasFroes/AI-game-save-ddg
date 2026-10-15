import { describe, expect, it } from 'vitest';
import {
  BEE_X,
  circleHitsRect,
  FlappySim,
  GROUND_Y,
  PIPE_W,
  speedFor as flappySpeed,
} from '@/games/flappy/core';
import {
  BOX,
  clampDropX,
  FRUITS,
  LAST_LEVEL,
  merge,
  nextFruitLevel,
  OverflowWatch,
  WATERMELON_BONUS,
} from '@/games/fruitmerge/core';
import { BONUS_EVERY, COLS, FOOD_POINTS, SnakeGame } from '@/games/snake/core';
import { dropLayer, GROW_STREAK, PERFECT_TOLERANCE, StackGame, START_W } from '@/games/stack/core';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

describe('flappy bee', () => {
  it('waits for the first flap, then falls with gravity', () => {
    const sim = new FlappySim(seeded(1));
    sim.step(0.5);
    expect(sim.started).toBe(false);
    sim.flap();
    const y = sim.y;
    sim.step(0.05);
    expect(sim.y).toBeLessThan(y);
    for (let i = 0; i < 120 && !sim.grounded; i++) sim.step(1 / 60);
    expect(sim.dead).toBe(true);
    expect(sim.y).toBe(GROUND_Y - 24);
  });

  it('scores when passing a pipe and dies when touching one', () => {
    const sim = new FlappySim(seeded(2));
    sim.flap();
    sim.pipes.push({ id: 1, x: BEE_X - PIPE_W, gapY: sim.y, gapH: 400, passed: false });
    expect(sim.step(1 / 60)).toContain('score');
    sim.pipes.push({ id: 2, x: BEE_X, gapY: sim.y + 600, gapH: 200, passed: false });
    expect(sim.step(1 / 60)).toContain('hit');
    expect(sim.flap()).toEqual([]);
  });

  it('gets faster with score and detects circle/rect overlap', () => {
    expect(flappySpeed(50)).toBeGreaterThan(flappySpeed(0));
    expect(circleHitsRect(0, 0, 10, 5, -5, 10, 10)).toBe(true);
    expect(circleHitsRect(0, 0, 10, 11, -5, 10, 10)).toBe(false);
  });
});

describe('snake', () => {
  it('moves, eats and grows', () => {
    const s = new SnakeGame(seeded(3));
    s.food = { x: s.head.x + 1, y: s.head.y };
    expect(s.tick()).toContain('eat');
    expect(s.score).toBe(FOOD_POINTS);
    s.tick();
    expect(s.body).toHaveLength(4);
  });

  it('ignores reversing and dies on walls', () => {
    const s = new SnakeGame(seeded(4));
    s.turn('left');
    s.tick();
    expect(s.dir).toBe('right');
    s.food = { x: 0, y: 0 };
    const events = [];
    for (let i = 0; i < COLS; i++) events.push(...s.tick());
    expect(events).toContain('die');
    expect(s.alive).toBe(false);
  });

  it('dies when biting itself', () => {
    const s = new SnakeGame(seeded(5));
    s.body = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 4, y: 6 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
    ];
    s.food = { x: 0, y: 0 };
    s.turn('down');
    expect(s.tick()).toEqual(['die']);
  });

  it('spawns a bonus every few foods and speeds up', () => {
    const s = new SnakeGame(seeded(6));
    const slow = s.interval;
    for (let i = 0; i < BONUS_EVERY; i++) {
      s.food = { x: s.head.x + 1, y: s.head.y };
      if (s.head.x >= COLS - 2) break;
      s.tick();
    }
    expect(s.bonus).not.toBeNull();
    expect(s.interval).toBeLessThan(slow);
  });
});

describe('stack', () => {
  it('trims the overhang and reports the falling piece', () => {
    const r = dropLayer({ x: 100, w: 200 }, { x: 150, w: 200 });
    expect(r.placed).toEqual({ x: 150, w: 150 });
    expect(r.cut).toEqual({ x: 300, w: 50 });
    const l = dropLayer({ x: 100, w: 200 }, { x: 60, w: 200 });
    expect(l.placed).toEqual({ x: 100, w: 160 });
    expect(l.cut).toEqual({ x: 60, w: 40 });
  });

  it('snaps perfect drops and misses when nothing overlaps', () => {
    expect(dropLayer({ x: 100, w: 200 }, { x: 100 + PERFECT_TOLERANCE, w: 200 })).toMatchObject({
      perfect: true,
      placed: { x: 100, w: 200 },
      cut: null,
    });
    expect(dropLayer({ x: 100, w: 200 }, { x: 400, w: 200 }).placed).toBeNull();
  });

  it('grows back after a perfect streak and ends on a miss', () => {
    const game = new StackGame();
    game.layers.push({ x: 200, w: 300 });
    for (let i = 0; i < GROW_STREAK; i++) {
      game.current = { x: game.top.x, w: game.top.w, dir: 1 };
      game.drop();
    }
    expect(game.top.w).toBeGreaterThan(300);
    expect(game.top.w).toBeLessThanOrEqual(START_W);
    expect(game.perfects).toBe(GROW_STREAK);
    game.current = { x: 2000, w: game.top.w, dir: 1 };
    expect(game.drop().placed).toBeNull();
    expect(game.over).toBe(true);
  });

  it('keeps the moving block bouncing inside its range', () => {
    const game = new StackGame();
    for (let i = 0; i < 600; i++) game.step(1 / 60);
    expect(game.current.x).toBeGreaterThanOrEqual(-game.current.w);
    expect(game.current.x).toBeLessThanOrEqual(720);
  });
});

describe('fruit merge', () => {
  it('only drops small fruits', () => {
    const rng = seeded(7);
    for (let i = 0; i < 200; i++) expect(nextFruitLevel(rng)).toBeLessThan(5);
  });

  it('merges into the next fruit and clears two of the biggest', () => {
    expect(merge(0)).toEqual({ level: 1, points: FRUITS[1]!.points });
    expect(merge(LAST_LEVEL)).toEqual({ level: null, points: WATERMELON_BONUS });
  });

  it('keeps the drop inside the box', () => {
    expect(clampDropX(0, 3)).toBe(BOX.left + FRUITS[3]!.radius);
    expect(clampDropX(9999, 0)).toBe(BOX.right - FRUITS[0]!.radius);
  });

  it('ends only after the pile stays over the line', () => {
    const w = new OverflowWatch();
    expect(w.update(true, 1)).toBe(false);
    expect(w.update(false, 0.1)).toBe(false);
    expect(w.danger).toBe(0);
    expect(w.update(true, 1.5)).toBe(false);
    expect(w.update(true, 0.6)).toBe(true);
  });

  it('has growing fruits that fit in the box', () => {
    FRUITS.forEach((f, i) => i && expect(f.radius).toBeGreaterThan(FRUITS[i - 1]!.radius));
    expect(FRUITS[LAST_LEVEL]!.radius * 2).toBeLessThan(BOX.right - BOX.left);
  });
});
