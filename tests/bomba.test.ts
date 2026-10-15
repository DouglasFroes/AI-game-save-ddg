import { describe, expect, it } from 'vitest';
import {
  BombGame,
  COLS,
  ENEMY_POINTS,
  FUSE_S,
  levelPlan,
  ROWS,
  START_LIVES,
  type BombEvent,
  type Dir,
  type Input,
} from '@/games/bomba/core';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const DT = 1 / 60;
const idle: Input = { dir: null, bomb: false };

/** Empty board (walls and pillars only), no monsters. */
function emptyGame(level = 1): BombGame {
  const g = new BombGame(level, seeded(1));
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) if (g.grid[y]![x] === 'brick') g.grid[y]![x] = 'floor';
  g.enemies.length = 0;
  return g;
}

function run(g: BombGame, seconds: number, input: (t: number) => Input = () => idle) {
  const events: BombEvent[] = [];
  for (let i = 0; i < seconds * 60; i++) events.push(...g.step(DT, input(i)));
  return events;
}

const walk =
  (dir: Dir, frames: number) =>
  (t: number): Input => ({ dir: t < frames ? dir : null, bomb: false });

describe('bomba', () => {
  it('builds a classic board: border, pillars, a free start corner', () => {
    const g = new BombGame(1, seeded(3));
    expect(g.tile(0, 5)).toBe('wall');
    expect(g.tile(2, 2)).toBe('wall');
    expect(g.tile(1, 1)).toBe('floor');
    expect(g.tile(2, 1)).toBe('floor');
    expect(g.tile(1, 2)).toBe('floor');
    expect(g.enemies.length).toBe(levelPlan(1).enemies.length);
    expect(g.player.lives).toBe(START_LIVES);
  });

  it('walks tile by tile and stops at walls', () => {
    const g = emptyGame();
    run(g, 1.5, walk('right', 60));
    expect(g.player.p).toBe(0);
    expect(g.player.tx).toBeGreaterThan(2);
    run(g, 3, walk('up', 200));
    expect(g.player.ty).toBe(1); // row 0 is the border
  });

  it('explodes in a cross, stopping at walls and at the first brick', () => {
    const g = emptyGame();
    g.grid[1]![4] = 'brick';
    g.grid[1]![5] = 'brick';
    g.player.fire = 4;
    const events = run(g, FUSE_S + 0.1, (t) => ({ dir: null, bomb: t === 0 }));
    const boom = events.find((e) => e.type === 'explode');
    expect(boom).toBeTruthy();
    const cells = boom!.type === 'explode' ? boom!.cells : [];
    expect(cells.some((c) => c.x === 3 && c.y === 1)).toBe(true);
    expect(cells.some((c) => c.x === 0)).toBe(false); // border wall
    expect(g.tile(4, 1)).toBe('floor'); // first brick broke…
    expect(g.tile(5, 1)).toBe('brick'); // …and shielded the second
  });

  it('kills a player standing in the flames', () => {
    const g = emptyGame();
    const events = run(g, FUSE_S + 0.2, (t) => ({ dir: null, bomb: t === 0 }));
    expect(events.some((e) => e.type === 'die')).toBe(true);
    expect(g.player.lives).toBe(START_LIVES - 1);
  });

  it('can walk off its own bomb but not back onto it', () => {
    const g = emptyGame();
    run(g, 0.05, (t) => ({ dir: null, bomb: t === 0 }));
    run(g, 0.6, walk('right', 40));
    expect(g.player.tx).toBeGreaterThan(1);
    const before = g.player.tx;
    run(g, 0.4, walk('left', 30));
    expect(g.player.tx).toBe(2); // blocked by the bomb at (1,1)
    expect(before).toBeGreaterThanOrEqual(2);
  });

  it('chains bombs and scores monsters, doubling within one blast', () => {
    const g = emptyGame();
    g.player.bombs = 2;
    g.player.fire = 3;
    const a = g.addEnemy('bolha', 5, 1);
    const b = g.addEnemy('bolha', 6, 1);
    a.speed = b.speed = 0;
    // Bomb at (1,1); walk to (3,1) and drop a second one; flee down the (1,*) column? walls at (2,2)
    // keep it simple: second bomb right next to the first, both reach the monsters' row.
    g.player.tx = g.player.nx = 3;
    let events = run(g, 0.05, (t) => ({ dir: null, bomb: t === 0 }));
    g.player.tx = g.player.nx = 1;
    g.player.ty = g.player.ny = 3; // out of the blast row
    events = events.concat(run(g, FUSE_S + 0.3));
    const kills = events.filter((e) => e.type === 'enemy');
    expect(kills.length).toBe(2);
    const pts = kills.map((e) => (e.type === 'enemy' ? e.points : 0));
    expect(pts).toEqual([ENEMY_POINTS.bolha, ENEMY_POINTS.bolha * 2]);

    // Chain: a bomb in another's flame goes off at once.
    const c = emptyGame();
    c.player.bombs = 2;
    c.bombs.push({ id: 900, x: 3, y: 1, fuse: 99, range: 2 });
    c.player.ty = c.player.ny = 3;
    c.bombs.push({ id: 901, x: 1, y: 1, fuse: 0.01, range: 2 });
    const chain = run(c, 0.1).filter((e) => e.type === 'explode');
    expect(chain.length).toBe(2);
  });

  it('picks up items revealed by bricks', () => {
    const g = emptyGame();
    g.player.tx = g.player.nx = 3;
    g.player.ty = g.player.ny = 1;
    g.items.push(
      { x: 4, y: 1, kind: 'fire' },
      { x: 5, y: 1, kind: 'bomb' },
      { x: 6, y: 1, kind: 'speed' },
    );
    const speed = g.player.speed;
    run(g, 2, walk('right', 120));
    expect(g.player.fire).toBe(3);
    expect(g.player.bombs).toBe(2);
    expect(g.player.speed).toBeGreaterThan(speed);
  });

  it('opens the exit once found and every monster is gone, then clears the level', () => {
    const g = emptyGame(2);
    g.door = { x: 3, y: 1, open: false, found: true };
    const events = run(g, 1.5, walk('right', 90));
    expect(events.some((e) => e.type === 'door')).toBe(true);
    expect(events.find((e) => e.type === 'clear')).toMatchObject({ type: 'clear' });
    expect(g.cleared).toBe(true);
    expect(g.score).toBeGreaterThanOrEqual(2000);
  });

  it('loses a life touching a monster, game over at zero', () => {
    const g = emptyGame();
    g.player.lives = 1;
    const m = g.addEnemy('bolha', 3, 1);
    m.speed = 0;
    const events = run(g, 1.5, walk('right', 90));
    expect(events.some((e) => e.type === 'over')).toBe(true);
    expect(g.over).toBe(true);
  });

  it('gets harder: more monsters, fast and ghost ones later', () => {
    expect(levelPlan(1).enemies.every((k) => k === 'bolha')).toBe(true);
    expect(levelPlan(3).enemies).toContain('rapido');
    expect(levelPlan(5).enemies).toContain('fantasma');
    expect(levelPlan(8).enemies.length).toBeGreaterThan(levelPlan(1).enemies.length);
  });

  it('keeps walking while a wanted turn is blocked, and turns at the next opening', () => {
    const g = emptyGame();
    // Walking right along row 1; "down" is blocked by pillars at even columns.
    run(g, 0.2, walk('right', 12));
    const down = (): Input => ({ dir: 'down', bomb: false });
    run(g, 1.2, down);
    expect(g.player.ty).toBeGreaterThan(1); // turned down at an odd column
    expect(g.player.tx % 2).toBe(1);
  });

  it('a diagonal input takes whichever direction is open', () => {
    const g = emptyGame();
    // At (1,1): up is a wall, right is free.
    run(g, 0.5, () => ({ dir: 'up', alt: 'right', bomb: false }));
    expect(g.player.tx).toBeGreaterThan(1);
  });
});
