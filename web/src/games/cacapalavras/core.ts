/**
 * "Caça-Palavras" — pure rules of a word search. Words are hidden in straight lines (across,
 * down, diagonally, and backwards on later boards); drag from the first to the last letter to
 * find one. The rest of the grid is filled with random letters.
 */
import { WORDS } from '@/games/termo/core';

export const SIZE = 9;
const LETTERS = 'AAAAABCDEEEEFGHIIIJLMNOOOOPQRRSSSTTUUUVXZ';

export interface Placed {
  readonly word: string;
  readonly cells: readonly number[];
}

export interface WordGrid {
  readonly letters: string[];
  readonly words: readonly Placed[];
}

/** Directions allowed on a board: across/down first, then diagonals, then backwards. */
export function directions(board: number): Array<[number, number]> {
  const dirs: Array<[number, number]> = [
    [0, 1],
    [1, 0],
  ];
  if (board >= 2) dirs.push([1, 1], [-1, 1]);
  if (board >= 4) dirs.push([0, -1], [-1, 0], [-1, -1], [1, -1]);
  return dirs;
}

export function generate(board: number, rng: () => number = Math.random): WordGrid {
  const count = Math.min(8, 5 + Math.floor(board / 2));
  const dirs = directions(board);
  for (;;) {
    const grid: string[] = new Array<string>(SIZE * SIZE).fill('');
    const placed: Placed[] = [];
    const pool = [...WORDS].sort(() => rng() - 0.5);
    for (const word of pool) {
      if (placed.length >= count) break;
      for (let tries = 0; tries < 40; tries++) {
        const [dr, dc] = dirs[Math.floor(rng() * dirs.length)]!;
        const r0 = Math.floor(rng() * SIZE);
        const c0 = Math.floor(rng() * SIZE);
        const cells: number[] = [];
        let ok = true;
        for (let k = 0; k < word.length; k++) {
          const r = r0 + dr * k;
          const c = c0 + dc * k;
          const at = r * SIZE + c;
          if (r < 0 || c < 0 || r >= SIZE || c >= SIZE || (grid[at] && grid[at] !== word[k])) {
            ok = false;
            break;
          }
          cells.push(at);
        }
        if (!ok) continue;
        cells.forEach((at, k) => (grid[at] = word[k]!));
        placed.push({ word, cells });
        break;
      }
    }
    if (placed.length < count) continue;
    const letters = grid.map((ch) => ch || LETTERS[Math.floor(rng() * LETTERS.length)]!);
    return { letters, words: placed };
  }
}

/** Cells on the straight line from `a` to `b`, or null when they are not in a line. */
export function lineCells(a: number, b: number): number[] | null {
  const [r0, c0] = [Math.floor(a / SIZE), a % SIZE];
  const [r1, c1] = [Math.floor(b / SIZE), b % SIZE];
  const dr = Math.sign(r1 - r0);
  const dc = Math.sign(c1 - c0);
  const len = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
  if (r1 - r0 !== dr * len || c1 - c0 !== dc * len) return null;
  return Array.from({ length: len + 1 }, (_, k) => (r0 + dr * k) * SIZE + c0 + dc * k);
}

/** Index of the hidden word covering exactly these cells (either way round), or -1. */
export function findWord(
  grid: WordGrid,
  cells: readonly number[],
  found: ReadonlySet<number>,
): number {
  return grid.words.findIndex((w, i) => {
    if (found.has(i) || w.cells.length !== cells.length) return false;
    const same = w.cells.every((c, k) => c === cells[k]);
    const back = w.cells.every((c, k) => c === cells[cells.length - 1 - k]);
    return same || back;
  });
}

/** Seconds for a board (shrinks as boards get busier). */
export const boardTime = (board: number): number => Math.max(35, 75 - board * 4);
