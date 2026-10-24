import { describe, expect, it } from 'vitest';
import { BubbleSim, COLS as BCOLS, LEFT, R, RIGHT, type Trace } from '@/games/bolhas/core';
import { pieceCells, ROWS as TROWS, COLS as TCOLS, Tetris } from '@/games/blocos/core';
import {
  COLS as MCOLS,
  generateMaze,
  HOME,
  MazeSim,
  ROWS as MROWS,
  START,
} from '@/games/comecome/core';
import { segDistance, SliceSim } from '@/games/corta/core';
import {
  COLS as GCOLS,
  generateIce,
  IceSim,
  ROWS as GROWS,
  slide,
  solveMoves,
} from '@/games/gelo/core';
import { COLS as CCOLS, Connect4 } from '@/games/ligue4/core';
import { boardSpec, Minefield, MinesSim } from '@/games/minas/core';
import { ShipSim } from '@/games/nave/core';
import { MoleSim } from '@/games/toupeira/core';
import { InfiniteTicTacToe } from '@/games/velha/core';
import { seeded } from '@/platform/rnd';

describe('toupeira', () => {
  it('scores hits with a combo bonus, bombs and escapes cost lives', () => {
    const sim = new MoleSim(seeded(1));
    expect(sim.hit(0)).toBeNull();
    sim.holes[0]!.kind = 'mole';
    expect(sim.hit(0)).toMatchObject({ type: 'hit', points: 1 });
    sim.combo = 4;
    sim.holes[1]!.kind = 'mole';
    expect(sim.hit(1)).toMatchObject({ type: 'hit', points: 2 });
    sim.holes[2]!.kind = 'gold';
    expect(sim.hit(2)).toMatchObject({ kind: 'gold' });
    sim.holes[3]!.kind = 'bomb';
    expect(sim.hit(3)).toEqual({ type: 'bombed', hole: 3 });
    expect(sim.lives).toBe(2);
    expect(sim.combo).toBe(0);
    sim.holes[4] = { kind: 'mole', ttl: 0.01 };
    expect(sim.step(0.05)).toContainEqual({ type: 'escaped', hole: 4 });
    expect(sim.lives).toBe(1);
  });
});

describe('corta frutas', () => {
  it('measures distance to a segment', () => {
    expect(segDistance(0, 0, 10, 0, 5, 3)).toBe(3);
    expect(segDistance(0, 0, 10, 0, 13, 4)).toBe(5);
  });

  it('slices fruit, ends on a bomb and rewards big swipes', () => {
    const fruit = (x: number) => ({
      x,
      y: 500,
      vx: 0,
      vy: 0,
      r: 60,
      kind: 'fruit' as const,
      variant: 0,
    });
    const sim = new SliceSim(seeded(2));
    sim.items = [fruit(100), fruit(250), fruit(400), fruit(650)];
    const res = sim.slice(0, 500, 450, 500);
    expect(res.fruits).toHaveLength(3);
    expect(sim.score).toBe(6); // 3 + 3 combo bonus
    expect(sim.items).toHaveLength(1);
    sim.items = [{ ...fruit(100), kind: 'bomb' }];
    sim.slice(0, 500, 200, 500);
    expect(sim.dead).toBe(true);
  });

  it('a fruit that falls off the screen costs a life, a bomb does not', () => {
    const sim = new SliceSim(seeded(3));
    sim.items = [
      { x: 100, y: 1400, vx: 0, vy: 300, r: 60, kind: 'fruit', variant: 0 },
      { x: 200, y: 1400, vx: 0, vy: 300, r: 60, kind: 'bomb', variant: 0 },
    ];
    expect(sim.step(0.01)).toHaveLength(1);
    expect(sim.lives).toBe(2);
  });
});

describe('gelo', () => {
  const open = new Array<boolean>(GCOLS * GROWS).fill(false);

  it('slides until a wall or the edge, and stops on the goal', () => {
    expect(slide(open, -1, 0, 'right').to).toBe(GCOLS - 1);
    expect(slide(open, -1, 0, 'up').path).toHaveLength(0);
    expect(slide(open, 3, 0, 'right').to).toBe(3);
    const walls = [...open];
    walls[5] = true;
    expect(slide(walls, -1, 0, 'right').to).toBe(4);
  });

  it('solves by breadth-first search', () => {
    expect(solveMoves(open, 0, GCOLS - 1)).toBe(1);
    // The flag stops a slide even in the middle of a run.
    expect(solveMoves(open, 0, 3)).toBe(1);
    // A flag walled in on both open sides can never be reached.
    const boxed = [...open];
    boxed[1] = boxed[GCOLS] = true;
    expect(solveMoves(boxed, GCOLS * 3 + 3, 0)).toBe(-1);
  });

  it('generates solvable boards whose "ótimo" is the real minimum', () => {
    const rnd = seeded(4);
    for (let level = 0; level < 12; level++) {
      const b = generateIce(level, rnd);
      expect(b.min).toBeGreaterThanOrEqual(1);
      expect(solveMoves(b.walls, b.start, b.goal)).toBe(b.min);
      expect(b.walls[b.start]).toBe(false);
      expect(b.walls[b.goal]).toBe(false);
    }
  });

  it('reaching the goal scores, adds time and waits for the next board', () => {
    const sim = new IceSim(seeded(5));
    sim.board = { walls: [...open], start: 0, goal: GCOLS - 1, min: 1 };
    sim.pos = 0;
    sim.step(20); // some time spent, so the bonus has room to show
    const t = sim.time;
    expect(sim.swipe('up')).toBeNull();
    expect(sim.swipe('right')?.reached).toBe(true);
    expect(sim.score).toBe(15); // level + perfect bonus
    expect(sim.time).toBeGreaterThan(t);
    expect(sim.swipe('down')).toBeNull(); // blocked until nextBoard()
    sim.nextBoard();
    expect(sim.solved).toBe(false);
  });
});

describe('velha infinita', () => {
  it('the 4th mark erases the oldest one', () => {
    const g = new InfiniteTicTacToe();
    for (const c of [0, 3, 1, 4, 5, 6]) g.play(c); // X: 0,1,5  O: 3,4,6
    expect(g.oldest(1)).toBe(0);
    g.play(8); // X's 4th
    expect(g.board[0]).toBe(0);
    expect(g.board[8]).toBe(1);
  });

  it('detects a win and refuses moves afterwards', () => {
    const g = new InfiniteTicTacToe();
    for (const c of [0, 3, 1, 4, 2]) g.play(c);
    expect(g.winner).toBe(1);
    expect(g.play(8)).toBe(false);
  });

  it('the robot takes a win and blocks a threat', () => {
    const win = new InfiniteTicTacToe();
    for (const c of [0, 3, 1, 4]) win.play(c);
    expect(win.bestMove(seeded(6), 1)).toBe(2);
    const block = new InfiniteTicTacToe();
    for (const c of [0, 3, 8, 4]) block.play(c);
    expect(block.bestMove(seeded(7), 1)).toBe(5);
  });
});

describe('ligue 4', () => {
  it('detects vertical, horizontal and diagonal fours', () => {
    const v = new Connect4();
    for (const c of [0, 1, 0, 1, 0, 1, 0]) v.drop(c);
    expect(v.winner).toBe(1);
    const h = new Connect4();
    for (const c of [0, 0, 1, 1, 2, 2, 3]) h.drop(c);
    expect(h.winner).toBe(1);
    expect(h.line).toHaveLength(4);
    const d = new Connect4();
    for (const c of [0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]) d.drop(c);
    expect(d.winner).toBe(1);
  });

  it('rejects drops into a full column and after the game ends', () => {
    const g = new Connect4();
    for (const c of [0, 0, 0, 0, 0, 0]) g.drop(c);
    expect(g.drop(0)).toBe(-1);
    expect(g.legalCols()).not.toContain(0);
    expect(g.drop(CCOLS)).toBe(-1);
  });

  it('the robot wins when it can and blocks when it must', () => {
    const win = new Connect4();
    for (const c of [0, 0, 1, 1, 2, 2]) win.drop(c);
    expect(win.bestMove(seeded(8), 3)).toBe(3);
    const block = new Connect4();
    for (const c of [0, 6, 1, 6, 2]) block.drop(c);
    expect(block.turn).toBe(2);
    expect(block.bestMove(seeded(9), 3)).toBe(3);
  });
});

describe('campo minado', () => {
  it('the first reveal is never a mine and opens an area', () => {
    for (let seed = 1; seed < 20; seed++) {
      const f = new Minefield(8, 10, 12, seeded(seed));
      const changed = f.reveal(35);
      expect(f.mine[35]).toBe(false);
      expect(f.mine.filter(Boolean)).toHaveLength(12);
      expect(f.exploded).toBe(false);
      expect(changed.length).toBeGreaterThan(1);
    }
  });

  it('counts neighbours, flags block reveals and a mine explodes', () => {
    const f = new Minefield(5, 5, 0, seeded(1));
    f.placed = true;
    f.mine[0] = true;
    f.mine[6] = true;
    for (let i = 0; i < 25; i++) f.count[i] = f.neighbors(i).filter((n) => f.mine[n]).length;
    expect(f.count[1]).toBe(2);
    f.toggleFlag(24);
    expect(f.reveal(24)).toEqual([]);
    f.toggleFlag(24);
    expect(f.reveal(6)).toEqual([6]);
    expect(f.exploded).toBe(true);
  });

  it('chording opens the neighbours of a satisfied number and a cleared board scores', () => {
    const f = new Minefield(3, 3, 0, seeded(1));
    f.placed = true;
    f.mine[0] = true;
    for (let i = 0; i < 9; i++) f.count[i] = f.neighbors(i).filter((n) => f.mine[n]).length;
    f.reveal(4);
    f.toggleFlag(0);
    expect(f.won).toBe(false);
    f.chord(4);
    expect(f.won).toBe(true);
  });

  it('boards grow and the sim scores a won board', () => {
    expect(boardSpec(6).mines).toBeGreaterThan(boardSpec(0).mines);
    const sim = new MinesSim(seeded(2));
    sim.field.reveal(0);
    for (let i = 0; i < sim.field.mine.length; i++) if (!sim.field.mine[i]) sim.field.reveal(i);
    expect(sim.checkWin()).toBe(true);
    expect(sim.score).toBeGreaterThanOrEqual(100);
    sim.nextBoard();
    expect(sim.field.placed).toBe(false);
  });
});

describe('atira bolhas', () => {
  const emptyRows = (rows: number[][]) =>
    rows.map((r) => [...r, ...new Array<number>(BCOLS - r.length).fill(-1)]);

  it('neighbours are symmetric on the hex grid', () => {
    const sim = new BubbleSim(seeded(1));
    for (let r = 1; r < 5; r++)
      for (let c = 0; c < BCOLS; c++)
        for (const n of sim.neighbors(r, c))
          expect(sim.neighbors(n.r, n.c)).toContainEqual({ r, c });
  });

  it('a shot bounces inside the walls and lands next to something', () => {
    const sim = new BubbleSim(seeded(2));
    const t = sim.trace(1.2);
    for (const p of t.path) {
      expect(p.x).toBeGreaterThanOrEqual(LEFT + R - 1);
      expect(p.x).toBeLessThanOrEqual(RIGHT - R + 1);
    }
    const { r, c } = t.cell;
    expect(sim.get(r, c)).toBe(-1);
    expect(r === 0 || sim.neighbors(r, c).some((n) => sim.get(n.r, n.c) >= 0)).toBe(true);
  });

  it('three of a colour pop and orphans fall', () => {
    const sim = new BubbleSim(seeded(3));
    sim.rows = emptyRows([[0, 0], [-1, 3], []]);
    sim.rows[0]![8] = 4;
    sim.current = 0;
    const t: Trace = { path: [], cell: { r: 0, c: 2 } };
    const res = sim.land(t);
    expect(res.popped).toHaveLength(3);
    expect(res.dropped).toEqual([{ r: 1, c: 1 }]);
    expect(sim.get(0, 8)).toBe(4);
    expect(res.points).toBe(3 * 10 + 25);
  });

  it('misses add a row on top after a few shots and a full board is refilled', () => {
    const sim = new BubbleSim(seeded(4));
    sim.rows = emptyRows([[0], [], []]);
    const before = sim.rows.length;
    sim.misses = 5;
    sim.current = 1; // different colour: no pop
    sim.land({ path: [], cell: { r: 0, c: 4 } });
    expect(before).toBe(3);
    expect(sim.parity).toBe(1);
    expect(sim.get(0, 0)).toBeGreaterThanOrEqual(0); // the new top row
    expect(sim.get(1, 4)).toBe(1); // the shot bubble was pushed down one row
    const lone = new BubbleSim(seeded(5));
    lone.rows = emptyRows([[0, 0], []]);
    lone.current = 0;
    const res = lone.land({ path: [], cell: { r: 0, c: 2 } });
    expect(res.cleared).toBe(true);
    expect(lone.count).toBeGreaterThan(0);
  });
});

describe('blocos', () => {
  it('the bag deals every piece once per 7', () => {
    const sim = new Tetris(seeded(1));
    const seen = new Set<number>([sim.piece.type]);
    for (let i = 0; i < 6; i++) {
      sim.hardDrop();
      seen.add(sim.piece.type);
    }
    expect(seen.size).toBe(7);
  });

  it('a piece rotated four times is back where it started', () => {
    const sim = new Tetris(seeded(2));
    sim.piece = { type: 2, rot: 0, x: 3, y: 5 };
    const start = pieceCells(sim.piece).join('|');
    for (let i = 0; i < 4; i++) expect(sim.rotate()).toBe(true);
    expect(pieceCells(sim.piece).join('|')).toBe(start);
  });

  it('kicks off the wall when rotating', () => {
    const sim = new Tetris(seeded(3));
    sim.piece = { type: 0, rot: 1, x: -2, y: 5 }; // vertical I against the left edge
    expect(sim.rotate()).toBe(true);
    expect(pieceCells(sim.piece).every(([x]) => x >= 0 && x < TCOLS)).toBe(true);
  });

  it('hard drop locks, clears full lines and scores', () => {
    const sim = new Tetris(seeded(4));
    for (const y of [TROWS - 1, TROWS - 2])
      sim.board[y] = sim.board[y]!.map((_, x) => (x === 4 || x === 5 ? 0 : 1));
    sim.piece = { type: 1, rot: 0, x: 4, y: 0 };
    expect(sim.hardDrop()).toBe(2);
    expect(sim.lines).toBe(2);
    expect(sim.board[TROWS - 1]!.every((v) => v === 0)).toBe(true);
    expect(sim.score).toBeGreaterThanOrEqual(300);
  });

  it('ends when a new piece has no room', () => {
    const sim = new Tetris(seeded(5));
    // Rows with a hole at column 0, so nothing is cleared and the spawn area stays blocked.
    sim.board[0] = sim.board[0]!.map((_, x) => (x === 0 ? 0 : 1));
    sim.board[1] = sim.board[1]!.map((_, x) => (x === 0 ? 0 : 1));
    sim.hardDrop();
    expect(sim.over).toBe(true);
  });

  it('gravity eventually locks an untouched piece', () => {
    const sim = new Tetris(seeded(6));
    let locked = false;
    for (let i = 0; i < 2000 && !locked; i++) locked = sim.step(0.05) !== null;
    expect(locked).toBe(true);
  });
});

describe('come-come', () => {
  it('every floor tile is reachable and the ghost room is open', () => {
    for (let seed = 1; seed < 15; seed++) {
      const walls = generateMaze(seeded(seed));
      const seen = new Set<number>([START.y * MCOLS + START.x]);
      const queue = [START.y * MCOLS + START.x];
      for (let i = 0; i < queue.length; i++) {
        const cur = queue[i]!;
        const x = cur % MCOLS;
        const y = Math.floor(cur / MCOLS);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const n = (y + dy) * MCOLS + x + dx;
          if (x + dx < 0 || x + dx >= MCOLS || y + dy < 0 || y + dy >= MROWS) continue;
          if (!walls[n] && !seen.has(n)) {
            seen.add(n);
            queue.push(n);
          }
        }
      }
      expect(seen.size).toBe(walls.filter((w) => !w).length);
      expect(walls[HOME.y * MCOLS + HOME.x]).toBe(false);
      expect(walls.slice(0, MCOLS).every(Boolean)).toBe(true);
    }
  });

  it('the player moves, eats pellets and stops at walls', () => {
    const sim = new MazeSim(seeded(2));
    sim.freeze = 0;
    sim.ghosts = [];
    const dir = [
      [1, 0],
      [-1, 0],
      [0, -1],
      [0, 1],
    ].find(([dx, dy]) => !sim.isWall(START.x + dx!, START.y + dy!))!;
    sim.setWant(dir[0]!, dir[1]!);
    for (let i = 0; i < 60; i++) sim.step(0.05);
    expect(sim.score).toBeGreaterThan(0);
    expect(sim.isWall(sim.player.tx, sim.player.ty)).toBe(false);
  });

  it('a ghost touching the player costs a life; when afraid it is eaten instead', () => {
    const sim = new MazeSim(seeded(3));
    sim.freeze = 0;
    const g = sim.ghosts[0]!;
    g.mode = 'chase';
    g.tx = sim.player.tx;
    g.ty = sim.player.ty;
    expect(sim.step(0.01)).toContainEqual({ type: 'died' });
    expect(sim.lives).toBe(2);
    sim.freeze = 0;
    const g2 = sim.ghosts[0]!;
    g2.mode = 'afraid';
    g2.tx = sim.player.tx;
    g2.ty = sim.player.ty;
    sim.fear = 5;
    const ev = sim.step(0.01);
    expect(ev).toContainEqual({ type: 'eat', points: 200 });
    expect(g2.mode).toBe('eaten');
  });
});

describe('nave', () => {
  it('bullets kill a grunt for points', () => {
    const sim = new ShipSim(seeded(1));
    sim.waveIn = 99;
    sim.enemies = [{ kind: 'grunt', x: 360, x0: 360, y: 500, hp: 1, r: 34, phase: 0, fireIn: 0 }];
    sim.bullets = [{ x: 360, y: 520, vx: 0, vy: -1200 }];
    const ev = sim.step(0.01);
    expect(ev).toContainEqual({
      type: 'kill',
      kind: 'grunt',
      x: expect.any(Number),
      y: expect.any(Number),
    });
    expect(sim.score).toBe(10);
    expect(sim.enemies).toHaveLength(0);
  });

  it('enemy fire hurts, the shield absorbs one hit, three hits end the run', () => {
    const sim = new ShipSim(seeded(2));
    sim.waveIn = 99;
    sim.shieldLeft = 5;
    sim.enemyShots = [{ x: sim.x, y: 1110, vx: 0, vy: 0 }];
    expect(sim.step(0.01)).toContainEqual({ type: 'shield' });
    expect(sim.lives).toBe(3);
    for (let i = 0; i < 3; i++) {
      sim.invuln = 0;
      sim.enemyShots = [{ x: sim.x, y: 1110, vx: 0, vy: 0 }];
      sim.step(0.01);
    }
    expect(sim.dead).toBe(true);
  });

  it('power-ups apply and waves spawn enemies on their own', () => {
    const sim = new ShipSim(seeded(3));
    sim.powers = [{ x: sim.x, y: 1110, kind: 'double' }];
    sim.step(0.01);
    expect(sim.doubleLeft).toBeGreaterThan(0);
    for (let i = 0; i < 100; i++) sim.step(0.05);
    expect(sim.wave).toBeGreaterThan(0);
  });
});
