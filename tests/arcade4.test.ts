import { describe, expect, it } from 'vitest';
import { BolhaSim, EAT_RATIO, radiusOf, speedOf } from '@/games/bolha/core';
import {
  BOMB,
  isUnlocked,
  LEVELS,
  MemoLevelSim,
  pairsOf,
  parseProgress,
  recordWin,
  starsFor,
  summary,
} from '@/games/memofases/core';
import { LADDER, MilhaoGame, QUESTION_COUNT, tierOf } from '@/games/milhao/core';
import { QUESTIONS } from '@/games/milhao/questions';
import { LocalLeaderboard, ResilientLeaderboard } from '@/platform/leaderboard';
import { MemoryStore } from '@/platform/storage';

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('jogo do milhão', () => {
  it('has a valid question bank for every level', () => {
    for (const tier of [1, 2, 3, 4] as const)
      expect(QUESTIONS.filter((q) => q.tier === tier).length).toBeGreaterThanOrEqual(15);
    for (const q of QUESTIONS) {
      expect(new Set(q.options).size).toBe(4);
      expect(q.options[q.answer]).toBeTruthy();
    }
    expect(new Set(QUESTIONS.map((q) => q.text)).size).toBe(QUESTIONS.length);
  });

  it('climbs the ladder to the million without repeating questions', () => {
    const g = new MilhaoGame(seeded(1));
    const seen = new Set<string>();
    for (let i = 0; i < QUESTION_COUNT; i++) {
      expect(g.question.tier).toBe(tierOf(i));
      expect(seen.has(g.question.text)).toBe(false);
      seen.add(g.question.text);
      expect(g.answer(g.rightPosition)).toBe(true);
    }
    expect(g.over).toBe(true);
    expect(g.end).toBe('won');
    expect(g.prize).toBe(1_000_000);
  });

  it('stopping keeps the money, a wrong answer leaves half, the final one loses all', () => {
    const g = new MilhaoGame(seeded(2));
    for (let i = 0; i < 5; i++) g.answer(g.rightPosition);
    expect(g.prizes).toEqual({ right: 10_000, stop: 5_000, wrong: 2_500 });
    const wrong = new MilhaoGame(seeded(2));
    for (let i = 0; i < 5; i++) wrong.answer(wrong.rightPosition);
    wrong.answer((wrong.rightPosition + 1) % 4);
    expect([wrong.end, wrong.prize]).toEqual(['wrong', 2_500]);
    g.stop();
    expect([g.end, g.prize]).toEqual(['stopped', 5_000]);

    const final = new MilhaoGame(seeded(3));
    for (let i = 0; i < QUESTION_COUNT - 1; i++) final.answer(final.rightPosition);
    expect(final.prizes).toEqual({ right: 1_000_000, stop: 500_000, wrong: 0 });
    expect(LADDER).toHaveLength(16);
  });

  it('helps: cards remove only wrong answers, skips are limited, each help once', () => {
    for (let seed = 1; seed < 30; seed++) {
      const g = new MilhaoGame(seeded(seed));
      const n = g.cartas();
      expect(g.removed.size).toBe(n);
      expect(g.removed.has(g.rightPosition)).toBe(false);
      expect(g.cartas()).toBe(-1);
      const pct = g.placas();
      expect(pct.reduce((a, b) => a + b, 0)).toBe(100);
      for (const p of g.removed) expect(pct[p]).toBe(0);
      expect(g.universitarios()).toHaveLength(3);
      expect(g.universitarios()).toEqual([]);
    }
    const g = new MilhaoGame(seeded(5));
    expect([g.skip(), g.skip(), g.skip(), g.skip()]).toEqual([true, true, true, false]);
    expect(g.step).toBe(0);
  });

  it('running out of time counts as a wrong answer', () => {
    const g = new MilhaoGame(seeded(6));
    for (let i = 0; i < 3; i++) g.answer(g.rightPosition);
    expect(g.tick(100)).toBe(true);
    expect([g.end, g.prize]).toEqual(['timeout', 1_500]);
  });
});

describe('memória: aventura', () => {
  it('has 30 levels that fit the faces, bombs only on odd boards', () => {
    expect(LEVELS).toHaveLength(30);
    for (const l of LEVELS) {
      expect(pairsOf(l)).toBeLessThanOrEqual(13);
      expect((l.cols * l.rows) % 2 === 1).toBe(l.bomb);
    }
  });

  const solve = (sim: MemoLevelSim) => {
    sim.step(sim.preview + 0.01);
    for (;;) {
      const open = sim.cards.findIndex((c) => !c.matched && c.face !== BOMB);
      if (open < 0) break;
      const pair = sim.cards.findIndex((c, i) => i !== open && c.face === sim.cards[open]!.face);
      sim.flip(open);
      const events = sim.flip(pair);
      if (events.some((e) => e.type === 'won')) return events.find((e) => e.type === 'won');
    }
    return null;
  };

  it('a perfect game earns 3 stars; the clock waits for the peek', () => {
    const sim = new MemoLevelSim(LEVELS[0]!, seeded(1));
    expect(sim.cards.every((c) => c.up)).toBe(true);
    expect(sim.flip(0)).toEqual([]); // no flipping during the peek
    const time = sim.time;
    sim.step(LEVELS[0]!.preview + 0.01);
    expect(sim.time).toBe(time);
    expect(sim.cards.some((c) => c.up)).toBe(false);
    expect(solve(sim)).toMatchObject({ type: 'won', stars: 3 });
  });

  it('the bomb costs time and counts as a miss; won without it', () => {
    const level = LEVELS.find((l) => l.bomb)!;
    const sim = new MemoLevelSim(level, seeded(2));
    sim.step(level.preview + 0.01);
    const t = sim.time;
    const events = sim.flip(sim.cards.findIndex((c) => c.face === BOMB));
    expect(events).toContainEqual({ type: 'bomb' });
    expect(sim.time).toBe(t - 5);
    expect(sim.misses).toBe(1);
    sim.step(1);
    expect(solve(sim)).toMatchObject({ type: 'won' });
  });

  it('shuffle levels swap two hidden cards after a miss', () => {
    const level = LEVELS.find((l) => l.shuffle && !l.bomb)!;
    const sim = new MemoLevelSim(level, seeded(3));
    sim.step(level.preview + 0.01);
    const a = 0;
    const b = sim.cards.findIndex((c) => c.face !== sim.cards[0]!.face);
    sim.flip(a);
    sim.flip(b);
    const events = sim.step(1);
    expect(events.map((e) => e.type)).toEqual(['hide', 'swap']);
  });

  it('stars, unlocking and the campaign total', () => {
    const l = LEVELS[1]!; // 6 pairs
    expect([starsFor(l, 0), starsFor(l, 3), starsFor(l, 4), starsFor(l, 9)]).toEqual([3, 3, 2, 1]);
    let p = recordWin({}, 1, 2, 2300);
    p = recordWin(p, 1, 1, 2600);
    expect(p[1]).toEqual({ stars: 2, points: 2600 });
    expect([isUnlocked(p, 1), isUnlocked(p, 2), isUnlocked(p, 3)]).toEqual([true, true, false]);
    expect(summary(p)).toEqual({ stars: 2, levels: 1, score: 2600 });
    expect(parseProgress(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(parseProgress({ 99: { stars: 3, points: 1 }, 2: { stars: 7 } })).toEqual({});
  });

  it('lost when the clock runs out', () => {
    const sim = new MemoLevelSim(LEVELS[3]!, seeded(4));
    expect(sim.step(999)).toContainEqual({ type: 'lost' });
  });
});

describe('bolha gulosa', () => {
  it('bigger is slower and wider', () => {
    expect(radiusOf(200)).toBeGreaterThan(radiusOf(20));
    expect(speedOf(200)).toBeLessThan(speedOf(20));
  });

  it('eats dots and smaller blobs, and gets eaten by bigger ones', () => {
    const sim = new BolhaSim('Eu', seeded(1));
    const me = sim.player;
    me.shield = 0;
    sim.blobs.forEach((b) => b.bot && (b.x = b.y = 50)); // bots away
    sim.dots.length = 0;
    sim.dots.push({ x: me.x + 5, y: me.y, color: 0 });
    const before = me.mass;
    sim.step(1 / 60, 0, 0);
    expect(me.mass).toBeGreaterThan(before);

    const prey = sim.blobs.find((b) => b.bot)!;
    prey.mass = 5;
    prey.shield = 0;
    prey.x = me.x + 3;
    prey.y = me.y;
    expect(sim.step(1 / 60, 0, 0)).toContainEqual(
      expect.objectContaining({ type: 'eat', who: me, prey }),
    );
    expect(sim.kills).toBe(1);

    const big = sim.blobs.find((b) => b.bot && b.alive)!;
    big.mass = me.mass * 4;
    big.x = me.x;
    big.y = me.y;
    expect(radiusOf(big.mass)).toBeGreaterThan(radiusOf(me.mass) * EAT_RATIO);
    expect(sim.step(1 / 60, 0, 0)).toContainEqual(
      expect.objectContaining({ type: 'over', by: big }),
    );
    expect(sim.over).toBe(true);
  });

  it('spawn shield protects, boost costs mass, bots keep coming', () => {
    const sim = new BolhaSim('Eu', seeded(2));
    const me = sim.player;
    const big = sim.blobs.find((b) => b.bot)!;
    big.mass = 2000;
    big.x = me.x;
    big.y = me.y;
    big.shield = 0;
    sim.step(1 / 60, 0, 0);
    expect(sim.over).toBe(false); // still shielded
    me.mass = 100;
    expect(sim.boost()).toBe(true);
    expect(me.mass).toBeCloseTo(92);
    expect(sim.boost()).toBe(false); // cooling down
    for (let i = 0; i < 600 && !sim.over; i++) sim.step(1 / 60, 1, 0);
    expect(sim.blobs.filter((b) => b.bot).length).toBe(14);
  });

  it('bots play on their own without errors for a long time', () => {
    const sim = new BolhaSim('Eu', seeded(3));
    sim.player.x = 10;
    sim.player.y = 10;
    for (let i = 0; i < 60 * 60; i++) sim.step(1 / 60, 0, 0);
    expect(sim.blobs.every((b) => Number.isFinite(b.x) && Number.isFinite(b.mass))).toBe(true);
  });
});

describe('campaign ranking', () => {
  it('campaign games keep one growing entry per player; others one per run', async () => {
    const local = new LocalLeaderboard(new MemoryStore());
    const board = new ResilientLeaderboard(local, null, 'me');
    await board.autoSubmit('memofases', { name: 'Eu', score: 3000, details: {} });
    expect(
      await board.autoSubmit('memofases', { name: 'Eu', score: 2000, details: {} }),
    ).toBeNull();
    await board.autoSubmit('memofases', { name: 'Eu', score: 5000, details: {} });
    expect((await local.list('memofases', 20)).map((e) => e.score)).toEqual([5000]);
    await board.autoSubmit('bolha', { name: 'Eu', score: 300, details: {} });
    await board.autoSubmit('bolha', { name: 'Eu', score: 200, details: {} });
    expect((await local.list('bolha', 20)).map((e) => e.score)).toEqual([300, 200]);
  });
});
