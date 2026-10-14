import { describe, expect, it } from 'vitest';
import {
  candidates,
  countSolutions,
  DIFFICULTIES,
  isComplete,
  isValidPlacement,
  makePuzzle,
  PEERS,
  solve,
  sudokuScore,
} from '@/games/sudoku/core';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const isValidSolution = (g: readonly number[]) =>
  g.every((n, i) => n >= 1 && n <= 9 && PEERS[i]!.every((j) => g[j] !== n));

describe('sudoku core', () => {
  it('has 20 peers per cell', () => {
    expect(PEERS.every((p) => p.length === 20)).toBe(true);
  });

  it('solves an empty grid into a valid solution', () => {
    const g = solve(new Array(81).fill(0), seeded(7));
    expect(g).not.toBeNull();
    expect(isValidSolution(g!)).toBe(true);
  });

  it.each(['easy', 'medium', 'hard'] as const)('generates a unique %s puzzle', (d) => {
    const { puzzle, solution } = makePuzzle(d, seeded(42));
    expect(isValidSolution(solution)).toBe(true);
    expect(countSolutions(puzzle)).toBe(1);
    puzzle.forEach((n, i) => n && expect(n).toBe(solution[i]));
    const holes = puzzle.filter((n) => n === 0).length;
    expect(holes).toBeGreaterThan(DIFFICULTIES[d].holes - 8);
    expect(holes).toBeLessThanOrEqual(DIFFICULTIES[d].holes);
  });

  it('checks placements and candidates', () => {
    const { puzzle, solution } = makePuzzle('easy', seeded(3));
    const i = puzzle.findIndex((n) => n === 0);
    expect(candidates(puzzle, i)).toContain(solution[i]);
    expect(isValidPlacement(puzzle, i, solution[i]!)).toBe(true);
    expect(isComplete(puzzle, solution)).toBe(false);
    expect(isComplete(solution, solution)).toBe(true);
  });

  it('scores harder, faster and cleaner solves higher', () => {
    expect(sudokuScore('hard', 600, 0, 0)).toBeGreaterThan(sudokuScore('easy', 600, 0, 0));
    expect(sudokuScore('medium', 300, 0, 0)).toBeGreaterThan(sudokuScore('medium', 600, 0, 0));
    expect(sudokuScore('medium', 300, 2, 1)).toBeLessThan(sudokuScore('medium', 300, 0, 0));
    expect(sudokuScore('easy', 99999, 3, 9)).toBe(100);
  });
});
