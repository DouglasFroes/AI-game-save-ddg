import { describe, expect, it } from 'vitest';
import {
  choosePlay,
  cpuLevel,
  DominoRound,
  fullSet,
  handPips,
  matchPoints,
  type Seat,
} from '@/games/domino/core';
import { seeded } from '@/platform/rnd';

describe('domino setup', () => {
  it('has 28 distinct tiles', () => {
    const keys = new Set(fullSet().map((t) => t.join('-')));
    expect(keys.size).toBe(28);
  });

  it('deals 7 each, keeps 14 in the boneyard and opens with the best tile', () => {
    const r = new DominoRound(seeded(5));
    expect(r.hands[0].length + r.hands[1].length + r.pile.length + r.chain.length).toBe(28);
    expect(r.chain).toHaveLength(1);
    expect(r.chain[0]).toBe(r.opener.tile);
    expect(r.turn).toBe(r.opener.seat === 0 ? 1 : 0);
    expect(r.hands[r.opener.seat]).toHaveLength(6);
  });
});

describe('domino play', () => {
  it('only offers tiles that match an open end, and orients them', () => {
    const r = new DominoRound(seeded(11));
    const seat = r.turn;
    const [l, rt] = r.ends;
    for (const p of r.legal(seat)) {
      const t = r.hands[seat][p.index]!;
      const n = p.end === 'L' ? l : rt;
      expect(t[0] === n || t[1] === n).toBe(true);
    }
    const play = r.legal(seat)[0];
    if (play) {
      r.play(seat, play);
      const c = r.chain;
      for (let i = 0; i + 1 < c.length; i++) expect(c[i]![1]).toBe(c[i + 1]![0]);
    }
  });

  it('records the numbers a player lacked when drawing or passing', () => {
    const r = new DominoRound(seeded(2));
    const seat = r.turn;
    const [l, rt] = r.ends;
    r.draw(seat);
    expect(r.lacks[seat].has(l) && r.lacks[seat].has(rt)).toBe(true);
  });

  const playOut = (seed: number, levels: readonly [number, number]) => {
    const rnd = seeded(seed);
    const r = new DominoRound(rnd);
    for (let guard = 0; guard < 400 && !r.result; guard++) {
      const seat: Seat = r.turn;
      let options = r.legal(seat);
      while (options.length === 0 && r.pile.length > 0) {
        r.draw(seat);
        options = r.legal(seat);
      }
      if (options.length === 0) r.pass(seat);
      else r.play(seat, choosePlay(r, seat, levels[seat], rnd));
    }
    return r;
  };

  it('always ends, by emptying a hand or by a block', () => {
    for (let s = 1; s <= 60; s++) {
      const r = playOut(s, [1, 2]);
      expect(r.result).not.toBeNull();
      const res = r.result!;
      if (!res.blocked) {
        expect(r.hands[res.winner!]).toHaveLength(0);
        const loser = res.winner === 0 ? 1 : 0;
        expect(res.points).toBe(handPips(r.hands[loser]));
      }
    }
  });

  it('the planning CPU beats the random one most of the time', () => {
    let smart = 0;
    let dumb = 0;
    for (let s = 1; s <= 120; s++) {
      const r = playOut(s, [0, 2]);
      if (r.result!.winner === 1) smart++;
      else if (r.result!.winner === 0) dumb++;
    }
    expect(smart).toBeGreaterThan(dumb * 1.2);
  });

  it('gets stronger after the first win and pays more for later matches', () => {
    expect(cpuLevel(0)).toBeLessThan(cpuLevel(1));
    expect(matchPoints(2, 55, 20)).toBeGreaterThan(matchPoints(0, 55, 20));
  });
});
