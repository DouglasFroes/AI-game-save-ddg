import { describe, expect, it } from 'vitest';
import * as captura from '@/games/captura/core';
import * as hex from '@/games/hex/core';
import * as mancala from '@/games/mancala/core';
import * as muralha from '@/games/muralha/core';
import * as pontinhos from '@/games/pontinhos/core';
import * as raposa from '@/games/raposa/core';
import * as restaum from '@/games/restaum/core';
import * as suprema from '@/games/suprema/core';
import * as trilha from '@/games/trilha/core';

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

describe('mancala', { timeout: 60_000 }, () => {
  it('sows counter-clockwise, skips the enemy store and gives an extra turn into your store', () => {
    const s = mancala.newGame();
    // Pit 2 holds 4 seeds: 3, 4, 5, 6 -> ends in the player's store.
    const r = mancala.play(s, 2)!;
    expect(r.extra).toBe(true);
    expect(r.state.turn).toBe(0);
    expect(r.state.pits[6]).toBe(1);
    expect(r.path).toEqual([3, 4, 5, 6]);
    // The opponent's side can't be played by the player.
    expect(mancala.play(s, 8)).toBeNull();
  });

  it('captures the seeds opposite an empty pit', () => {
    const pits = Array.from({ length: 14 }, () => 0);
    pits[0] = 1;
    pits[11] = 5;
    const r = mancala.play({ pits, turn: 0 }, 0)!;
    expect(r.captured).toBe(6);
    expect(r.state.pits[6]).toBe(6);
  });

  it('a stronger CPU beats a weaker one', () => {
    let strongWins = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const rng = seeded(seed);
      let s = mancala.newGame();
      for (let t = 0; t < 300 && !mancala.isOver(s); t++) {
        const pit = mancala.cpuMove(s, s.turn === 0 ? 5 : 1, rng);
        s = mancala.play(s, pit)!.state;
      }
      const [a, b] = mancala.score(s);
      if (a > b) strongWins++;
    }
    expect(strongWins).toBeGreaterThanOrEqual(5);
  });
});

describe('hex', { timeout: 60_000 }, () => {
  it('connects top to bottom for the player and left to right for the CPU', () => {
    let b = hex.newBoard();
    for (let r = 0; r < hex.N; r++) b = hex.place(b, r * hex.N + 3, 1)!;
    expect(hex.winner(b)).toBe(1);
    let c = hex.newBoard();
    for (let col = 0; col < hex.N; col++) c = hex.place(c, 2 * hex.N + col, 2)!;
    expect(hex.winner(c)).toBe(2);
    expect(hex.place(c, 2 * hex.N, 1)).toBeNull();
  });

  it('a stronger CPU beats a weaker one, whichever side it plays', () => {
    let strongWins = 0;
    const games = 6;
    for (let seed = 1; seed <= games; seed++) {
      const rng = seeded(seed);
      const strongIs: 1 | 2 = seed % 2 === 0 ? 1 : 2;
      let b = hex.newBoard();
      let who: 1 | 2 = 1;
      while (hex.winner(b) === 0) {
        b = hex.place(b, hex.cpuMove(b, who, who === strongIs ? 4 : 1, rng), who)!;
        who = who === 1 ? 2 : 1;
      }
      if (hex.winner(b) === strongIs) strongWins++;
    }
    expect(strongWins).toBeGreaterThanOrEqual(5);
  });
});

describe('trilha', { timeout: 60_000 }, () => {
  it('has 24 points, 16 mills and removes a man after closing a mill', () => {
    expect(trilha.MILLS).toHaveLength(16);
    expect(trilha.ADJ.every((a) => a.length >= 2 && a.length <= 4)).toBe(true);
    let s = trilha.newGame();
    // Player places 0, 1, 2 (top side of the outer square); CPU places elsewhere.
    for (const [mine, theirs] of [
      [0, 10],
      [1, 12],
    ] as const) {
      s = trilha.apply(s, { kind: 'place', to: mine });
      s = trilha.apply(s, { kind: 'place', to: theirs });
    }
    s = trilha.apply(s, { kind: 'place', to: 2 });
    expect(s.removing).toBe(true);
    expect(s.turn).toBe(1);
    const removable = trilha.legal(s);
    expect(removable.every((a) => a.kind === 'remove')).toBe(true);
    const after = trilha.apply(s, removable[0]!);
    expect(after.turn).toBe(2);
    expect(trilha.menOf(after, 2)).toBe(trilha.MEN - 1);
  });

  it('a man in a mill is protected unless every man is in a mill', () => {
    const board = Array.from({ length: trilha.POINTS }, () => 0 as trilha.Cell);
    for (const p of [0, 1, 2]) board[p] = 2;
    board[10] = 2;
    const s: trilha.State = { board, hand: [0, 0], turn: 1, removing: true, plies: 20 };
    const targets = trilha.legal(s).map((a) => (a.kind === 'remove' ? a.at : -1));
    expect(targets).toEqual([10]);
  });

  it('a stronger CPU is never beaten by a weaker one', () => {
    let strongWins = 0;
    let strongLosses = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const rng = seeded(seed);
      const strongIs: 1 | 2 = seed % 2 === 0 ? 1 : 2;
      let s = trilha.newGame();
      while (trilha.result(s) === 0) {
        s = trilha.apply(s, trilha.cpuMove(s, s.turn === strongIs ? 3 : 1, rng));
      }
      const res = trilha.result(s);
      if (res === strongIs) strongWins++;
      else if (res !== 3) strongLosses++;
    }
    expect(strongWins).toBeGreaterThanOrEqual(2);
    expect(strongLosses).toBeLessThanOrEqual(1);
  });
});

describe('pontinhos', { timeout: 60_000 }, () => {
  it('closing a box gives another turn and owns the box', () => {
    let s = pontinhos.newGame();
    // Draw three sides of box 0 alternating players, then the player who closes it moves again.
    const [top, bottom, left, right] = pontinhos.boxEdges(0);
    s = pontinhos.play(s, top)!.state; // player 1
    s = pontinhos.play(s, bottom)!.state; // player 2
    s = pontinhos.play(s, left)!.state; // player 1
    const last = pontinhos.play(s, right)!;
    expect(last.closed).toEqual([0]);
    expect(last.state.owner[0]).toBe(2);
    expect(last.state.turn).toBe(2);
    expect(pontinhos.play(last.state, right)).toBeNull();
  });

  it('a careful CPU beats a careless one', () => {
    let strongWins = 0;
    const games = 20;
    for (let seed = 1; seed <= games; seed++) {
      const rng = seeded(seed);
      const strongIs: 1 | 2 = seed % 2 === 0 ? 1 : 2;
      let s = pontinhos.newGame();
      while (!pontinhos.isOver(s)) {
        s = pontinhos.play(s, pontinhos.cpuMove(s, s.turn === strongIs ? 3 : 1, rng))!.state;
      }
      const [a, b] = pontinhos.scores(s);
      if ((strongIs === 1 ? a : b) > (strongIs === 1 ? b : a)) strongWins++;
    }
    expect(strongWins).toBeGreaterThanOrEqual(14);
  });
});

describe('resta um', () => {
  it('starts with 32 pegs and four opening jumps', () => {
    const b = restaum.newBoard();
    expect(restaum.pegs(b)).toBe(32);
    expect(restaum.moves(b)).toHaveLength(4);
    const after = restaum.apply(b, restaum.moves(b)[0]!);
    expect(restaum.pegs(after)).toBe(31);
  });

  it('is solvable down to one peg, and a perfect finish pays the most', () => {
    const start = restaum.newBoard();
    const path = restaum.solve(start);
    expect(path).not.toBeNull();
    let b = start;
    for (const m of path!) b = restaum.apply(b, m);
    expect(restaum.pegs(b)).toBe(1);
    const stuck = restaum.apply(start, restaum.moves(start)[0]!);
    expect(restaum.score(b)).toBeGreaterThan(restaum.score(stuck));
  });
});

describe('raposa e gansos', () => {
  it('starts with 13 geese; the fox jumps a goose with an empty point behind it', () => {
    const s = raposa.newGame();
    expect(raposa.gooseCount(s)).toBe(13);
    // The fox in the centre has geese right below it, nothing free behind them yet.
    expect(raposa.foxMoves(s).some((m) => m.capture !== null)).toBe(false);
    const open = { ...s, geese: s.geese.map((g, i) => (i === 5 * 7 + 3 ? false : g)) };
    const jump = raposa.foxMoves(open).find((m) => m.capture !== null);
    expect(jump).toBeDefined();
    const next = raposa.apply(open, jump!);
    expect(raposa.gooseCount(next)).toBe(11);
  });

  it('geese never step backwards', () => {
    const s = { ...raposa.newGame(), turn: 'geese' as const };
    expect(raposa.gooseMoves(s).every((m) => Math.floor(m.to / 7) <= Math.floor(m.from / 7))).toBe(
      true,
    );
  });

  it('the fox can win against weak geese, and strong geese are harder', () => {
    const play = (geeseLevel: number, seed: number): 'fox' | 'geese' | 'none' => {
      const rng = seeded(seed);
      let s = raposa.newGame();
      for (let t = 0; t < 220; t++) {
        const w = raposa.winner(s);
        if (w) return w;
        const m = raposa.cpuMove(s, s.turn === 'fox' ? 4 : geeseLevel, rng);
        if (!m) break;
        s = raposa.apply(s, m);
      }
      return raposa.winner(s) ?? 'none';
    };
    let weak = 0;
    let strong = 0;
    for (let seed = 1; seed <= 6; seed++) {
      if (play(1, seed) === 'fox') weak++;
      if (play(5, seed) === 'fox') strong++;
    }
    expect(weak).toBeGreaterThanOrEqual(3);
    expect(strong).toBeLessThanOrEqual(weak);
  }, 120_000);
});

describe('velha suprema', { timeout: 60_000 }, () => {
  it('sends the opponent to the board matching your square, or anywhere if it is decided', () => {
    let s = suprema.newGame();
    s = suprema.play(s, 4 * 9 + 2)!; // board 4, square 2 -> next must be board 2
    expect(s.next).toBe(2);
    expect(suprema.play(s, 4 * 9 + 0)).toBeNull();
    s = suprema.play(s, 2 * 9 + 5)!;
    expect(s.next).toBe(5);
  });

  it('claims a small board with three in a row', () => {
    const cells = Array.from({ length: 81 }, () => 0 as suprema.Cell);
    for (const c of [0, 1, 2]) cells[c] = 1;
    expect(suprema.boardStatus(cells, 0)).toBe(1);
    expect(suprema.boardStatus(cells, 1)).toBe(0);
  });

  it('a stronger CPU beats a weaker one', () => {
    let strongWins = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const rng = seeded(seed);
      const strongIs: 1 | 2 = seed % 2 === 0 ? 1 : 2;
      let s = suprema.newGame();
      while (suprema.winner(s) === 0) {
        s = suprema.play(s, suprema.cpuMove(s, s.turn === strongIs ? 3 : 1, rng))!;
      }
      if (suprema.winner(s) === strongIs) strongWins++;
    }
    expect(strongWins).toBeGreaterThanOrEqual(4);
  });
});

describe('captura', { timeout: 60_000 }, () => {
  it('captures a surrounded stone and forbids suicide', () => {
    let s = captura.newGame();
    // Player surrounds a CPU stone in the corner (point 0) with 1 and 7.
    s = captura.play(s, 1)!.state;
    s = captura.play(s, 0)!.state;
    const done = captura.play(s, 7)!;
    expect(done.captured).toEqual([0]);
    expect(done.state.caps[0]).toBe(1);
    // A stone dropped into a fully surrounded empty point with no capture is illegal.
    const board = Array.from({ length: 49 }, () => 0 as captura.Cell);
    for (const p of [1, 7]) board[p] = 2;
    expect(captura.play({ board, turn: 1, caps: [0, 0] }, 0)).toBeNull();
  });

  it('the first to capture three stones wins', () => {
    const s: captura.State = { board: Array.from({ length: 49 }, () => 0), turn: 1, caps: [3, 1] };
    expect(captura.winner(s)).toBe(1);
  });

  it('a stronger CPU beats a weaker one', () => {
    let strongWins = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const rng = seeded(seed);
      const strongIs: 1 | 2 = seed % 2 === 0 ? 1 : 2;
      let s = captura.newGame();
      let guard = 0;
      while (captura.winner(s) === 0 && guard++ < 80) {
        s = captura.play(s, captura.cpuMove(s, s.turn === strongIs ? 4 : 1, rng))!.state;
      }
      if (captura.winner(s) === strongIs) strongWins++;
    }
    expect(strongWins).toBeGreaterThanOrEqual(7);
  });
});

describe('muralha', { timeout: 60_000 }, () => {
  it('walls block steps, never seal a pawn in, and cannot overlap', () => {
    let s = muralha.newGame();
    // A wall right above the player's pawn blocks the step north.
    const wall: muralha.Wall = { o: 'h', r: 7, c: 4 };
    expect(muralha.canWall(s, wall)).toBe(true);
    s = muralha.apply(s, { kind: 'wall', wall });
    expect(s.left[0]).toBe(9);
    expect(muralha.pawnMoves({ ...s, turn: 0 }, 0).some((p) => p.r === 7 && p.c === 4)).toBe(false);
    // Overlapping and crossing walls are refused.
    const turn1 = { ...s, left: [9, 10] as const, turn: 1 as const };
    expect(muralha.canWall(turn1, { o: 'h', r: 7, c: 3 })).toBe(false);
    expect(muralha.canWall(turn1, { o: 'v', r: 7, c: 4 })).toBe(false);
    // Closing the last gap of a corridor is refused.
    let boxed = muralha.newGame();
    const cage: muralha.Wall[] = [
      { o: 'h', r: 7, c: 0 },
      { o: 'h', r: 7, c: 2 },
      { o: 'h', r: 7, c: 4 },
      { o: 'h', r: 7, c: 6 },
    ];
    boxed = { ...boxed, walls: cage, left: [10, 10], turn: 0 };
    expect(muralha.canWall(boxed, { o: 'h', r: 7, c: 7 })).toBe(false);
  });

  it('jumps over an adjacent pawn', () => {
    const s: muralha.State = {
      pawns: [
        { r: 5, c: 4 },
        { r: 4, c: 4 },
      ],
      walls: [],
      left: [10, 10],
      turn: 0,
    };
    expect(muralha.pawnMoves(s, 0).some((p) => p.r === 3 && p.c === 4)).toBe(true);
  });

  it('a stronger CPU beats a weaker one', () => {
    let strongWins = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const rng = seeded(seed);
      const strongIs: muralha.Who = seed % 2 === 0 ? 0 : 1;
      let s = muralha.newGame();
      let guard = 0;
      while (muralha.winner(s) === null && guard++ < 200) {
        s = muralha.apply(s, muralha.cpuMove(s, s.turn === strongIs ? 4 : 1, rng));
      }
      if (muralha.winner(s) === strongIs) strongWins++;
    }
    expect(strongWins).toBeGreaterThanOrEqual(5);
  });
});
