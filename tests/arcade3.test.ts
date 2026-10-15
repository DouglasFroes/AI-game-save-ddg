import { describe, expect, it } from 'vitest';
import { barColorAt, ColorSim, ringColorAt } from '@/games/cores/core';
import { MemorySim } from '@/games/memoria/core';
import { BALL_R, BrickSim, PADDLE_Y } from '@/games/tijolos/core';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
const DT = 1 / 60;

describe('quebra-tijolos', () => {
  it('launches from the paddle, breaks bricks and scores', () => {
    const g = new BrickSim(seeded(1));
    const total = g.bricks.length;
    g.launch();
    // Keep the paddle under the ball.
    for (let i = 0; i < 60 * 8 && !g.over; i++) {
      g.movePaddle(g.balls[0]?.x ?? 360);
      g.step(DT);
    }
    expect(g.bricks.length).toBeLessThan(total);
    expect(g.score).toBeGreaterThan(0);
  });

  it('the paddle angle depends on where the ball hits', () => {
    const g = new BrickSim(seeded(2));
    g.bricks = [];
    g.bricks.push({ id: 1, x: 40, y: 200, hp: 99, maxHp: 99, item: null });
    g.attached = false;
    g.balls = [{ x: g.paddleX + 60, y: PADDLE_Y - BALL_R - 20, vx: 0, vy: 600 }];
    g.step(0.05);
    expect(g.balls[0]!.vy).toBeLessThan(0);
    expect(g.balls[0]!.vx).toBeGreaterThan(0);
  });

  it('losing every ball costs a life; no lives is game over', () => {
    const g = new BrickSim(seeded(3));
    g.lives = 1;
    g.attached = false;
    g.balls = [{ x: 30, y: 1290, vx: 0, vy: 600 }];
    const events = g.step(DT);
    expect(events.some((e) => e.type === 'over')).toBe(true);
  });

  it('clearing the wall goes to a harder level', () => {
    const g = new BrickSim(seeded(4));
    const first = g.bricks.length;
    g.bricks = [];
    g.attached = false;
    g.balls[0]!.vy = -600;
    expect(g.step(DT).some((e) => e.type === 'level')).toBe(true);
    expect(g.level).toBe(2);
    expect(g.bricks.length).toBeGreaterThan(0);
    expect(first).toBeGreaterThan(0);
  });

  it('the multi-ball power-up splits the ball', () => {
    const g = new BrickSim(seeded(5));
    g.attached = false;
    g.balls = [{ x: 360, y: 600, vx: 0, vy: -600 }];
    g.items.push({ kind: 'multi', x: g.paddleX, y: PADDLE_Y - 10 });
    g.step(DT);
    expect(g.balls.length).toBe(3);
  });
});

describe('memória da turma', () => {
  const pairOf = (g: MemorySim, i: number) =>
    g.cards.findIndex((c, j) => j !== i && c.face === g.cards[i]!.face);

  it('a matching pair stays up and scores, with a growing combo', () => {
    const g = new MemorySim(seeded(1));
    g.flip(0);
    const events = g.flip(pairOf(g, 0));
    expect(events.find((e) => e.type === 'match')).toMatchObject({ combo: 1, points: 100 });
    const k = g.cards.findIndex((c) => !c.matched);
    g.flip(k);
    expect(g.flip(pairOf(g, k)).find((e) => e.type === 'match')).toMatchObject({
      combo: 2,
      points: 200,
    });
  });

  it('a mismatch turns back after a short look and resets the combo', () => {
    const g = new MemorySim(seeded(2));
    const other = g.cards.findIndex((c) => c.face !== g.cards[0]!.face);
    g.flip(0);
    expect(g.flip(other).some((e) => e.type === 'miss')).toBe(true);
    expect(g.flip(2)).toEqual([]); // locked while showing
    for (let i = 0; i < 60; i++) g.step(DT);
    expect(g.cards[0]!.up).toBe(false);
    expect(g.combo).toBe(0);
  });

  it('matching everything moves to a bigger level', () => {
    const g = new MemorySim(seeded(3));
    const n = g.cards.length;
    while (g.level === 1) {
      const i = g.cards.findIndex((c) => !c.matched);
      g.flip(i);
      g.flip(pairOf(g, i));
    }
    expect(g.cards.length).toBeGreaterThan(n);
  });

  it('the clock running out ends the game', () => {
    const g = new MemorySim(seeded(4));
    for (let i = 0; i < 60 * 120 && !g.over; i++) g.step(DT);
    expect(g.over).toBe(true);
  });
});

describe('pula cor', () => {
  it('maps ring and bar positions to colors', () => {
    expect(ringColorAt(0.1, 0)).toBe(0);
    expect(ringColorAt(0.1 + Math.PI, 0)).toBe(2);
    expect(ringColorAt(0.1, Math.PI / 2)).toBe(3);
    expect(barColorAt(10, 0)).toBe(0);
    expect(barColorAt(700, 0)).toBe(3);
  });

  it('hopping keeps the ball up; not hopping makes it fall out', () => {
    const g = new ColorSim(seeded(1));
    g.hop();
    for (let i = 0; i < 300 && !g.over; i++) g.step(DT);
    expect(g.over).toBe('fall');
  });

  it('crossing a band of another color ends the run; its own color passes', () => {
    const wrong = new ColorSim(seeded(2));
    const o = wrong.obstacles[0]!;
    wrong.started = true;
    wrong.color = (ringColorAt(Math.PI / 2, o.angle) + 1) % 4;
    for (const x of wrong.obstacles) x.speed = 0;
    wrong.y = o.y - o.r - 40;
    wrong.vy = 600;
    for (let i = 0; i < 20 && !wrong.over; i++) wrong.step(DT);
    expect(wrong.over).toBe('color');

    const right = new ColorSim(seeded(2));
    const r = right.obstacles[0]!;
    right.started = true;
    for (const x of right.obstacles) x.speed = 0;
    right.color = ringColorAt(Math.PI / 2, r.angle);
    right.y = r.y - r.r - 40;
    right.vy = 600;
    for (let i = 0; i < 12; i++) right.step(DT);
    expect(right.over).toBeNull();
  });

  it('stars score and switchers change the color', () => {
    const g = new ColorSim(seeded(3));
    const o = g.obstacles[0]!;
    g.started = true;
    for (const x of g.obstacles) x.speed = 0;
    const before = g.color;
    // Teleport onto the star, then onto the switcher.
    g.y = o.y;
    g.vy = 0;
    const s1 = g.step(0.001);
    expect(s1.some((e) => e.type === 'star')).toBe(true);
    g.y = o.y + o.r + 120;
    g.vy = 0;
    const s2 = g.step(0.001);
    expect(s2.some((e) => e.type === 'switch')).toBe(true);
    expect(g.color).not.toBe(before);
  });
});
