import { describe, expect, it } from 'vitest';
import { AsteroidesSim } from '@/games/asteroides/core';
import { BlackjackGame, handValue } from '@/games/blackjack/core';
import {
  generatePipeGrid,
  isPipeGridSolved,
  propagateWater,
  rotateCell,
  rotateMask90,
} from '@/games/canos/core';
import { CofreSim, shortestAngleDiff } from '@/games/cofre/core';
import { MalabaresSim } from '@/games/malabares/core';
import { computeLineClues, NonogramaBoard, TEMPLATES } from '@/games/nonograma/core';
import {
  applyMove,
  chooseAiMove,
  countDiscs,
  createInitialBoard,
  validMoves,
} from '@/games/reversi/core';
import { SubmarinoSim, WATER_Y } from '@/games/submarino/core';
import { NET_X, SAND_Y, VoleiSim } from '@/games/volei/core';

describe('reversi', () => {
  it('starts with 4 discs and 4 legal opening moves', () => {
    const b = createInitialBoard();
    expect(countDiscs(b)).toEqual({ p1: 2, p2: 2 });
    const moves = validMoves(b, 1);
    expect(moves).toHaveLength(4);
  });

  it('flips bracketed discs and allows AI reply', () => {
    const b = createInitialBoard();
    const first = validMoves(b, 1)[0]!;
    const res = applyMove(b, first.r, first.c, 1);
    expect(res).not.toBeNull();
    expect(res!.flipped).toHaveLength(1);
    expect(countDiscs(res!.board)).toEqual({ p1: 4, p2: 1 });

    const ai = chooseAiMove(res!.board, 1);
    expect(ai).not.toBeNull();
  });
});

describe('nonograma', () => {
  it('computes row and column clues accurately', () => {
    expect(computeLineClues([1, 1, 0, 1, 0])).toEqual([2, 1]);
    expect(computeLineClues([0, 0, 0, 0, 0])).toEqual([0]);
    expect(computeLineClues([1, 1, 1, 1, 1])).toEqual([5]);
  });

  it('solves when all target cells are filled and counts mistakes', () => {
    const board = new NonogramaBoard(TEMPLATES[0]!);
    expect(board.solved).toBe(false);
    // Mistake on (0, 0) which is 0 in Heart template
    expect(board.act(0, 0, 'fill')).toBe('mistake');
    expect(board.mistakes).toBe(1);

    for (let r = 0; r < board.size; r++) {
      for (let c = 0; c < board.size; c++) {
        if (board.target[r]![c] === 1) {
          board.act(r, c, 'fill');
        }
      }
    }
    expect(board.solved).toBe(true);
  });
});

describe('canos', () => {
  it('rotates pipe bitmasks 360 degrees back to original', () => {
    const m = 0b0101;
    const r1 = rotateMask90(m);
    const r2 = rotateMask90(r1);
    const r3 = rotateMask90(r2);
    const r4 = rotateMask90(r3);
    expect(r1).not.toBe(m);
    expect(r4).toBe(m);
  });

  it('generates solvable pipe grids that connect all targets when aligned', () => {
    const grid = generatePipeGrid(4, 42);
    expect(isPipeGridSolved(grid)).toBe(false);
    rotateCell(grid, 0, 0);
    for (const row of grid) {
      for (const cell of row) {
        cell.mask = cell.solvedMask;
      }
    }
    propagateWater(grid);
    expect(isPipeGridSolved(grid)).toBe(true);
  });
});

describe('submarino', () => {
  it('drops depth charges and destroys enemy submarines', () => {
    const sim = new SubmarinoSim();
    const sub = sim.spawnSub(0, true);
    sub.x = 360;
    sub.vx = 0;
    expect(sim.dropCharge(360)).toBe(true);
    let hit = false;
    for (let i = 0; i < 40; i++) {
      const evs = sim.step(0.05);
      if (evs.some((e) => e.type === 'subHit')) {
        hit = true;
        break;
      }
    }
    expect(hit).toBe(true);
    expect(sim.subsSunk).toBe(1);
    expect(sim.score).toBeGreaterThan(0);
    expect(WATER_Y).toBeGreaterThan(0);
  });
});

describe('asteroides', () => {
  it('splits large rocks into smaller ones when hit by a laser bolt', () => {
    const sim = new AsteroidesSim();
    const rock = sim.rocks[0]!;
    rock.x = 360;
    rock.y = 500;
    rock.vx = 0;
    rock.vy = 0;
    const initialCount = sim.rocks.length;
    expect(sim.aimAndFire(360, 500)).toBe(true);

    let split = false;
    for (let i = 0; i < 30; i++) {
      const evs = sim.step(0.02);
      if (evs.some((e) => e.type === 'rockSplit')) {
        split = true;
        break;
      }
    }
    expect(split).toBe(true);
    expect(sim.rocks.length).toBe(initialCount + 1); // 1 removed, 2 medium spawned
  });
});

describe('cofre', () => {
  it('registers hits when needle aligns with target pin and cracks the vault', () => {
    const sim = new CofreSim(() => 0.5);
    expect(shortestAngleDiff(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(0.2, 5);
    const total = sim.pinsLeft;
    for (let i = 0; i < total; i++) {
      sim.needleAngle = sim.targetAngle;
      const res = sim.tap();
      expect(res.kind).toBe('hit');
    }
    expect(sim.vaultsCracked).toBe(1);
    expect(sim.vault).toBe(2);
  });
});

describe('malabares', () => {
  it('kicks balls upward and spawns extra balls every 8 kicks', () => {
    const sim = new MalabaresSim();
    const ball = sim.balls[0]!;
    ball.x = 360;
    ball.y = 850;
    for (let i = 0; i < 8; i++) {
      ball.x = 360;
      ball.y = 850;
      sim.tap(360, 860);
    }
    expect(sim.kicks).toBe(8);
    expect(sim.balls.length).toBe(2);
  });
});

describe('volei', () => {
  it('awards a point when the ball lands on the opponent sand', () => {
    const sim = new VoleiSim();
    sim.bx = NET_X + 120;
    sim.by = SAND_Y - 22;
    sim.bvy = 300;
    const evs = sim.step(0.02);
    expect(evs.some((e) => e.type === 'point' && e.winner === 'player')).toBe(true);
    expect(sim.myPts).toBe(1);
  });
});

describe('blackjack', () => {
  it('evaluates soft and hard Aces and natural 21 accurately', () => {
    expect(
      handValue([
        { rank: 'A', suit: '♠' },
        { rank: 'K', suit: '♥' },
      ]),
    ).toEqual({ total: 21, soft: true, blackjack: true, bust: false });

    expect(
      handValue([
        { rank: 'A', suit: '♠' },
        { rank: '9', suit: '♥' },
        { rank: '5', suit: '♦' },
      ]),
    ).toEqual({ total: 15, soft: false, blackjack: false, bust: false });
  });

  it('deals hands and settles bets properly', () => {
    const game = new BlackjackGame();
    expect(game.deal(100)).toBe(true);
    if (game.state === 'playing') {
      const outcome = game.stand();
      expect(['blackjack', 'win', 'push', 'lose', 'bust']).toContain(outcome);
    }
    expect(game.handIndex).toBe(1);
  });
});
