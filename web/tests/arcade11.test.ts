import { describe, expect, it } from 'vitest';
import { AnagramRun, isAnagramOf, scramble } from '@/games/anagrama/core';
import { BinaryBoard, canPlace, generate as genBinary, solve } from '@/games/binario/core';
import { findWord, generate as genWords, lineCells, SIZE } from '@/games/cacapalavras/core';
import { generate as genSlide, SlideBoard } from '@/games/deslizante/core';
import { carve, Maze, WALL, type Dir } from '@/games/labirinto/core';
import { generate as genLights, levelSpec, LightsBoard } from '@/games/luzes/core';
import { CodeRun, feedback } from '@/games/senha/core';
import { COLS, ROWS, SumBoard } from '@/games/somadez/core';
import { distance, Island, N } from '@/games/tesouro/core';

/** Deterministic random numbers for reproducible tests. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('apaga luzes', () => {
  it('a press flips the cell and its neighbours, twice undoes it', () => {
    const b = new LightsBoard(3, 1);
    b.press(4);
    expect(b.cells.map(Number)).toEqual([0, 1, 0, 1, 1, 1, 0, 1, 0]);
    b.press(4);
    expect(b.solved).toBe(true);
  });

  it('pressing the generating cells again solves any board', () => {
    for (const level of [1, 4, 9]) {
      const spec = levelSpec(level);
      const rng = seeded(level);
      const presses = [...Array(spec.n * spec.n).keys()]
        .sort(() => rng() - 0.5)
        .slice(0, spec.presses);
      const b = genLights(spec, seeded(level));
      for (const i of presses) b.press(i);
      expect(b.solved).toBe(true);
      expect(b.moves).toBe(b.par);
    }
  });
});

describe('quebra-cabeça deslizante', () => {
  it('slides a whole line towards the blank', () => {
    const b = new SlideBoard(3); // 1 2 3 / 4 5 6 / 7 8 _
    expect(b.tap(6)).toBe(2);
    expect(b.tiles).toEqual([1, 2, 3, 4, 5, 6, 0, 7, 8]);
    expect(b.tap(0)).toBe(2); // same column as the blank: both tiles above slide down
    expect(b.tap(4)).toBe(0); // neither row nor column of the blank
  });

  it('shuffled boards are solvable (inversion parity)', () => {
    for (const level of [1, 3, 7]) {
      const b = genSlide(level, seeded(level));
      expect(b.solved).toBe(false);
      const t = b.tiles.filter((x) => x !== 0);
      let inv = 0;
      for (let i = 0; i < t.length; i++)
        for (let j = i + 1; j < t.length; j++) if (t[i]! > t[j]!) inv++;
      const blankRowFromBottom = b.n - Math.floor(b.blank / b.n);
      const ok = b.n % 2 === 1 ? inv % 2 === 0 : (inv + blankRowFromBottom) % 2 === 1;
      expect(ok).toBe(true);
    }
  });
});

describe('senha das cores', () => {
  it('scores black and white pegs, counting repeats once', () => {
    expect(feedback([0, 1, 2, 3], [0, 1, 2, 3])).toEqual({ exact: 4, near: 0 });
    expect(feedback([0, 0, 1, 1], [1, 1, 0, 0])).toEqual({ exact: 0, near: 4 });
    expect(feedback([0, 0, 0, 0], [0, 1, 2, 3])).toEqual({ exact: 1, near: 0 });
  });

  it('a solver that keeps only consistent codes cracks every code in time', () => {
    const run = new CodeRun(seeded(5));
    for (let code = 0; code < 6; code++) {
      const { len, colors } = run.spec;
      let pool: number[][] = [[]];
      for (let k = 0; k < len; k++)
        pool = pool.flatMap((p) => [...Array(colors).keys()].map((c) => [...p, c]));
      let res;
      do {
        for (const c of pool[0]!) run.pick(c);
        const guess = pool[0]!;
        res = run.submit();
        if (res.kind === 'guess') {
          const fb = res.fb;
          pool = pool.filter((p) => {
            const f = feedback(guess, p);
            return f.exact === fb.exact && f.near === fb.near;
          });
        }
      } while (res.kind === 'guess');
      expect(res.kind).toBe('cracked');
      run.newCode();
    }
    expect(run.cracked).toBe(6);
  });
});

describe('caça-palavras', () => {
  it('hides every word along a straight line', () => {
    for (const board of [1, 3, 6]) {
      const grid = genWords(board, seeded(board));
      for (const w of grid.words) {
        expect(w.cells.map((c) => grid.letters[c]).join('')).toBe(w.word);
        const line = lineCells(w.cells[0]!, w.cells.at(-1)!);
        expect(line).toEqual(w.cells);
      }
    }
  });

  it('accepts a word dragged either way and rejects bent lines', () => {
    const grid = genWords(4, seeded(9));
    const w = grid.words[0]!;
    expect(findWord(grid, [...w.cells].reverse(), new Set())).toBe(0);
    expect(findWord(grid, w.cells, new Set([0]))).toBe(-1);
    expect(lineCells(0, SIZE + 2)).toBeNull();
  });
});

describe('anagrama', () => {
  it('never shows the word itself and accepts any listed anagram', () => {
    const rng = seeded(3);
    for (const w of ['CARTA', 'PEDRA', 'MOLHO'])
      expect(isAnagramOf(scramble(w, rng).join(''), w)).toBe(false);
    expect(isAnagramOf('CARTA', 'CARTA')).toBe(true);
    expect(isAnagramOf('XXXXX', 'CARTA')).toBe(false);
  });

  it('solving adds time and points; a wrong word resets the streak', () => {
    const run = new AnagramRun(seeded(4));
    const target = run.word;
    for (const ch of target)
      run.pick(run.letters.findIndex((l, i) => l === ch && !run.picked.includes(i)));
    expect(run.solved).toBe(1);
    expect(run.timeLeft).toBeGreaterThan(60);
    const before = run.score;
    expect(before).toBeGreaterThan(0);
    run.skip();
    expect(run.streak).toBe(0);
  });
});

describe('binário', () => {
  it('rejects three in a row and uneven lines', () => {
    const g = [0, 0, null, null, null, null, ...new Array(30).fill(null)];
    expect(canPlace(g, 6, 0, 2, 0)).toBe(false);
    expect(canPlace(g, 6, 0, 2, 1)).toBe(true);
  });

  it('generates puzzles with exactly one solution', () => {
    for (const level of [1, 4]) {
      const p = genBinary(level, seeded(level + 10));
      const res = solve([...p.given], p.n, 2);
      expect(res.count).toBe(1);
      expect(res.first).toEqual([...p.solution]);
      const b = new BinaryBoard(p);
      p.solution.forEach((v, i) => {
        if (b.locked(i)) return;
        b.cycle(i);
        if (v === 1) b.cycle(i);
      });
      expect(b.solved).toBe(true);
      expect(b.conflicts().size).toBe(0);
    }
  });
});

describe('soma dez', () => {
  it('clears only boxes adding to ten, counting cleared cells as zero', () => {
    const b = new SumBoard(seeded(1));
    b.cells = new Array(COLS * ROWS).fill(9);
    b.cells[0] = 3;
    b.cells[1] = 7;
    expect(b.clear({ r0: 0, c0: 0, r1: 0, c1: 1 })).toBe(2);
    b.cells[2] = 4;
    b.cells[3] = 6;
    expect(b.clear({ r0: 0, c0: 0, r1: 0, c1: 3 })).toBe(2);
    expect(b.clear({ r0: 1, c0: 0, r1: 1, c1: 1 })).toBe(0);
    expect(b.score).toBe(4);
  });

  it('a greedy player keeps finding tens on a random board', () => {
    const b = new SumBoard(seeded(2));
    let cleared = 0;
    for (let k = 0; k < 40 && b.hasMove(); k++) {
      outer: for (let r0 = 0; r0 < ROWS; r0++)
        for (let c0 = 0; c0 < COLS; c0++)
          for (let r1 = r0; r1 < ROWS; r1++)
            for (let c1 = c0; c1 < COLS; c1++) {
              const n = b.clear({ r0, c0, r1, c1 });
              if (n) {
                cleared += n;
                break outer;
              }
            }
    }
    expect(cleared).toBeGreaterThan(40);
  });
});

describe('caça ao tesouro', () => {
  it('clues give the distance to the nearest buried treasure', () => {
    const is = new Island(3, seeded(7));
    const cell = [...Array(N * N).keys()].find((c) => !is.treasures.has(c))!;
    const res = is.dig(cell);
    expect(res).toEqual({
      kind: 'clue',
      distance: Math.min(...[...is.treasures].map((t) => distance(cell, t))),
    });
  });

  it('a bot that only digs cells consistent with every clue clears early islands', () => {
    for (const level of [1, 2, 3]) {
      const is = new Island(level, seeded(level * 3));
      let guard = 0;
      while (is.found.size < is.treasures.size && is.shovels > 0 && guard++ < 64) {
        // Candidates: undug cells that agree with every clue (as distance to a treasure set).
        const cands = [...Array(N * N).keys()].filter(
          (c) => !is.dug.has(c) && [...is.dug].every(([d, v]) => v < 0 || distance(c, d) >= v),
        );
        const exact = cands.filter((c) =>
          [...is.dug].some(([d, v]) => v > 0 && distance(c, d) === v),
        );
        is.dig((exact.length ? exact : cands)[0]!);
      }
      expect(is.found.size, `island ${level}`).toBe(is.treasures.size);
    }
  });
});

describe('labirinto no escuro', () => {
  it('carves a perfect maze: every cell reachable', () => {
    const size = 9;
    const walls = carve(size, seeded(1));
    const seen = new Set([0]);
    const queue = [0];
    const step: Record<Dir, [number, number]> = { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] };
    while (queue.length) {
      const c = queue.shift()!;
      for (const d of ['N', 'E', 'S', 'W'] as Dir[]) {
        if (walls[c]! & WALL[d]) continue;
        const next = c + step[d][0] * size + step[d][1];
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    expect(seen.size).toBe(size * size);
  });

  it('a wall-following bot reaches the exit', () => {
    const m = new Maze(10, seeded(2));
    const order: Dir[] = ['N', 'E', 'S', 'W'];
    let facing = 1;
    let exit = false;
    for (let i = 0; i < 2000 && !exit; i++) {
      // Right-hand rule: try right, straight, left, back.
      for (const turn of [1, 0, 3, 2]) {
        const d = order[(facing + turn) % 4]!;
        if (!m.open(m.pos, d)) continue;
        facing = (facing + turn) % 4;
        const res = m.move(d);
        exit = res.exit;
        const last = res.cells.length > 1 ? res.cells.at(-1)! - res.cells.at(-2)! : 0;
        if (last)
          facing = order.indexOf(
            last === -m.size ? 'N' : last === m.size ? 'S' : last === 1 ? 'E' : 'W',
          );
        break;
      }
    }
    expect(exit).toBe(true);
  });
});
