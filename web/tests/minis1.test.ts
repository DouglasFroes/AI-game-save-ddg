import { describe, expect, it } from 'vitest';
import { CaveSim } from '@/games/balao/core';
import { BasketSim, BASKET_Y } from '@/games/cesto/core';
import { makeQuestion, MathSim } from '@/games/conta/core';
import { INKS, StroopSim } from '@/games/corcerta/core';
import { FlipSim, PLAYER_X } from '@/games/inverte/core';
import { BridgeSim, MAX_STICK } from '@/games/ponte/core';
import { ReflexSim } from '@/games/relampago/core';
import { SimonSim } from '@/games/sequencia/core';
import { ZigueSim } from '@/games/zigue/core';
import { seeded } from '@/platform/rnd';

describe('zigue-zague', () => {
  it('builds a connected one-tile path', () => {
    const sim = new ZigueSim(seeded(4));
    expect(sim.tiles.length).toBeGreaterThanOrEqual(60);
    for (let i = 1; i < sim.tiles.length; i++) {
      const a = sim.tiles[i - 1]!;
      const b = sim.tiles[i]!;
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
    }
  });

  it('falls off when the player never turns', () => {
    const sim = new ZigueSim(seeded(5));
    let dead = false;
    for (let i = 0; i < 1000 && !dead; i++) dead = sim.step(0.05) === 'dead';
    expect(dead).toBe(true);
  });

  it('a bot that turns on every corner survives and scores', () => {
    const sim = new ZigueSim(seeded(6));
    for (let i = 0; i < 4000 && !sim.dead; i++) {
      const here = sim.tiles[sim.index]!;
      const next = sim.tiles[sim.index + 1]!;
      const want = next.x > here.x ? 0 : 1;
      const along = want === sim.dir ? 0 : sim.dir === 0 ? sim.x - here.x : sim.y - here.y;
      if (want !== sim.dir && Math.abs(along) < 0.08) sim.tap();
      sim.step(0.004);
    }
    expect(sim.dead).toBe(false);
    expect(sim.score).toBeGreaterThan(40);
  });
});

describe('ponte certa', () => {
  it('a stick that spans the gap onto the next platform is ok; perfect in the middle', () => {
    const sim = new BridgeSim(seeded(7));
    sim.gap = 100;
    sim.nextW = 60;
    sim.stick = 130;
    const r = sim.release();
    expect(r).toMatchObject({ ok: true, perfect: true });
    expect(sim.score).toBe(2);
    sim.stick = 90;
    expect(sim.release().ok).toBe(false);
    sim.stick = 161;
    expect(sim.release().ok).toBe(false);
    sim.stick = 110;
    expect(sim.release()).toMatchObject({ ok: true, perfect: false });
  });

  it('grows with a cap and advances to the next platform', () => {
    const sim = new BridgeSim(seeded(8));
    sim.grow(100);
    expect(sim.stick).toBe(MAX_STICK);
    const w = sim.nextW;
    sim.advance();
    expect(sim.curW).toBe(w);
    expect(sim.stick).toBe(0);
  });
});

describe('cor certa', () => {
  it('right answers score, wrong ones and timeouts cost lives', () => {
    const sim = new StroopSim(seeded(9));
    expect(sim.answer(sim.match)).toBe('right');
    expect(sim.score).toBe(1);
    expect(sim.answer(!sim.match)).toBe('wrong');
    expect(sim.lives).toBe(2);
    expect(sim.step(10)).toBe('timeout');
    expect(sim.lives).toBe(1);
    sim.answer(!sim.match);
    expect(sim.dead).toBe(true);
  });

  it('has 4 distinct inks and mixes matching and mismatching questions', () => {
    expect(new Set(INKS.map((i) => i.color)).size).toBe(4);
    const sim = new StroopSim(seeded(10));
    const seen = new Set<boolean>();
    for (let i = 0; i < 40; i++) {
      seen.add(sim.match);
      sim.answer(sim.match);
    }
    expect(seen.size).toBe(2);
  });
});

describe('conta rápida', () => {
  it('the marked choice is the real result, choices are distinct', () => {
    const rnd = seeded(11);
    for (let level = 0; level < 40; level++) {
      const q = makeQuestion(level, rnd);
      const [a, op, b] = q.text.split(' ') as [string, string, string];
      const x = Number(a);
      const y = Number(b);
      const answer = op === '+' ? x + y : op === '-' ? x - y : x * y;
      expect(q.choices[q.correct]).toBe(answer);
      expect(new Set(q.choices).size).toBe(3);
      expect(q.choices.every((c) => c >= 0)).toBe(true);
    }
  });

  it('right answers add time, wrong ones take it away', () => {
    const sim = new MathSim(seeded(12));
    const t0 = sim.time;
    sim.answer(sim.q.correct);
    expect(sim.time).toBeGreaterThan(t0);
    const t1 = sim.time;
    sim.answer((sim.q.correct + 1) % 3);
    expect(sim.time).toBeLessThan(t1);
    sim.step(100);
    expect(sim.dead).toBe(true);
  });
});

describe('cesto maluco', () => {
  it('catches fruit in the basket, loses a life on a missed fruit or a caught bomb', () => {
    const sim = new BasketSim(seeded(13));
    sim.moveTo(300);
    sim.items = [{ x: 300, y: BASKET_Y, vy: 0, kind: 'fruit', variant: 0 }];
    expect(sim.step(0.01)).toEqual([{ type: 'catch', kind: 'fruit', x: 300 }]);
    expect(sim.score).toBe(1);
    sim.items = [{ x: 600, y: 1300, vy: 100, kind: 'fruit', variant: 0 }];
    expect(sim.step(0.01)).toEqual([{ type: 'miss', x: 600 }]);
    expect(sim.lives).toBe(2);
    sim.items = [{ x: 300, y: BASKET_Y, vy: 0, kind: 'bomb', variant: 0 }];
    expect(sim.step(0.01)).toEqual([{ type: 'boom', x: 300 }]);
    expect(sim.lives).toBe(1);
    sim.items = [{ x: 300, y: BASKET_Y, vy: 0, kind: 'gold', variant: 0 }];
    sim.step(0.01);
    expect(sim.score).toBe(6);
  });

  it('keeps the basket inside the field', () => {
    const sim = new BasketSim(seeded(14));
    sim.moveTo(-50);
    expect(sim.x).toBeGreaterThan(0);
    sim.moveTo(9999);
    expect(sim.x).toBeLessThan(720);
  });
});

describe('sequência', () => {
  it('grows by one each round and fails on a wrong pad', () => {
    const sim = new SimonSim(seeded(15));
    expect(sim.seq).toHaveLength(1);
    expect(sim.press(sim.seq[0]!)).toBe('fail'); // still showing
    sim.doneShowing();
    expect(sim.press(sim.seq[0]!)).toBe('round');
    expect(sim.seq).toHaveLength(2);
    expect(sim.score).toBe(1);
    sim.doneShowing();
    expect(sim.press(sim.seq[0]!)).toBe('ok');
    const wrong = (sim.seq[1]! + 1) % 4;
    expect(sim.press(wrong)).toBe('fail');
    expect(sim.phase).toBe('over');
  });
});

describe('relâmpago', () => {
  it('tapping before green fails', () => {
    const sim = new ReflexSim(seeded(16));
    expect(sim.tap()).toEqual({ type: 'fail', reason: 'early' });
  });

  it('measures the reaction after the green flash and gives a speed bonus', () => {
    const sim = new ReflexSim(seeded(17));
    let ev = sim.step(5);
    expect(ev).toEqual({ type: 'go' });
    sim.step(0.1);
    ev = sim.tap();
    expect(ev?.type).toBe('hit');
    if (ev?.type === 'hit') {
      expect(ev.ms).toBe(100);
      expect(ev.points).toBe(3);
    }
    expect(sim.bestMs).toBe(100);
    expect(sim.round).toBe(2);
  });

  it('reacting too slowly ends the run', () => {
    const sim = new ReflexSim(seeded(18));
    sim.step(5);
    expect(sim.step(5)).toEqual({ type: 'fail', reason: 'late' });
    expect(sim.phase).toBe('over');
  });
});

describe('inverte', () => {
  it('a floor spike kills on the floor but not after flipping', () => {
    const a = new FlipSim(seeded(21));
    a.spikes = [{ x: PLAYER_X - 20, w: 60, lane: 0 }];
    expect(a.step(0.001)).toBe(true);
    const b = new FlipSim(seeded(21));
    b.p = 1;
    b.target = 1;
    b.spikes = [{ x: PLAYER_X - 20, w: 60, lane: 0 }];
    expect(b.step(0.001)).toBe(false);
  });

  it('leaves room to flip between spikes on opposite lanes', () => {
    const sim = new FlipSim(seeded(22));
    for (let i = 1; i < sim.spikes.length; i++) {
      const a = sim.spikes[i - 1]!;
      const b = sim.spikes[i]!;
      if (a.lane !== b.lane) expect(b.x - (a.x + a.w)).toBeGreaterThanOrEqual(190);
    }
  });
});

describe('balão', () => {
  it('holding rises, letting go sinks, and the cave keeps a flyable gap', () => {
    const up = new CaveSim(seeded(23));
    const y0 = up.y;
    up.holding = true;
    up.step(0.1);
    expect(up.y).toBeLessThan(y0);
    const down = new CaveSim(seeded(23));
    down.step(0.2);
    expect(down.y).toBeGreaterThan(y0);
    for (let i = 1; i < up.cols.length; i++) {
      const c = up.cols[i]!;
      expect(c.bottom - c.top).toBeGreaterThanOrEqual(300);
      const prev = up.cols[i - 1]!;
      expect(Math.abs(c.top - prev.top)).toBeLessThanOrEqual(10);
    }
  });

  it('crashes if the player does nothing', () => {
    const sim = new CaveSim(seeded(24));
    let dead = false;
    for (let i = 0; i < 400 && !dead; i++) dead = sim.step(0.02);
    expect(dead).toBe(true);
  });
});
