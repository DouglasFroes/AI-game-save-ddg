import { describe, expect, it } from 'vitest';
import { BlastSim, FLOOR } from '@/games/canhao/core';
import { BirdSim, groundY } from '@/games/colinas/core';
import { CubeSim, type Obstacle } from '@/games/cubo/core';
import { correctWire, DefuseRun, makeBomb, RULES } from '@/games/desarme/core';
import { BalanceSim } from '@/games/equilibrio/core';
import { LetterRain } from '@/games/letras/core';
import { SkySim, START_ALT } from '@/games/paraquedas/core';
import { RhythmSim } from '@/games/ritmo/core';
import { TrafficSim, type Dir } from '@/games/trafego/core';

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

describe('círculos do ritmo', () => {
  it('a perfect player survives and the tempo rises', () => {
    const sim = new RhythmSim(seeded(1));
    for (let i = 0; i < 60 * 60 && sim.alive; i++) {
      sim.step(1 / 60);
      for (const n of [...sim.notes]) if (Math.abs(sim.time - n.at) < 1 / 120) sim.tap(n.x, n.y);
    }
    expect(sim.alive).toBe(true);
    expect(sim.perfects).toBeGreaterThan(50);
    expect(sim.bpm).toBeGreaterThan(150);
  });

  it('an idle player loses all health', () => {
    const sim = new RhythmSim(seeded(2));
    for (let i = 0; i < 60 * 30 && sim.alive; i++) sim.step(1 / 60);
    expect(sim.alive).toBe(false);
  });

  it('a tap far too early is ignored', () => {
    const sim = new RhythmSim(seeded(3));
    while (!sim.notes.length) sim.step(1 / 60);
    const n = sim.notes[0]!;
    expect(sim.tap(n.x, n.y)).toEqual([]);
    expect(sim.notes).toContain(n);
  });
});

describe('paraquedas', () => {
  it('opening late pays more; landing starts the next jump', () => {
    const sim = new SkySim(seeded(4));
    sim.things = [];
    while (sim.alt > 200) sim.step(1 / 60);
    const ev = sim.open();
    expect(ev[0]).toMatchObject({ type: 'opened' });
    expect(sim.score).toBeGreaterThan(500);
    while (sim.state === 'open') sim.step(1 / 60);
    expect(sim.state).toBe('landed');
    sim.next();
    expect(sim.alt).toBe(START_ALT);
    expect(sim.jump).toBe(2);
  });

  it('never opening is a crash', () => {
    const sim = new SkySim(seeded(5));
    sim.things = [];
    for (let i = 0; i < 60 * 30 && sim.state === 'fall'; i++) sim.step(1 / 60);
    expect(sim.state).toBe('dead');
  });

  it('a bot steering to rings and away from hazards keeps its lives', () => {
    const sim = new SkySim(seeded(6));
    while (sim.alt > 120 && sim.state === 'fall') {
      const ahead = sim.things.filter((t) => !t.done && t.alt < sim.alt && t.alt > sim.alt - 400);
      const ring = ahead.find((t) => t.kind === 'ring');
      const danger = ahead.filter((t) => t.kind !== 'ring');
      let x = ring ? ring.x : sim.x;
      for (const d of danger) if (Math.abs(d.x - x) < 130) x = d.x < 360 ? d.x + 200 : d.x - 200;
      sim.aim(x);
      sim.step(1 / 60);
    }
    sim.open();
    while (sim.state === 'open') sim.step(1 / 60);
    expect(sim.state).toBe('landed');
    expect(sim.rings).toBeGreaterThan(3);
  });
});

describe('chuva de letras', () => {
  it('zaps the lowest copy of a letter; wrong keys break the combo', () => {
    const rain = new LetterRain(seeded(7));
    rain.drops = [
      { id: 1, ch: 'A', x: 100, y: 300, speed: 0 },
      { id: 2, ch: 'A', x: 200, y: 700, speed: 0 },
    ];
    expect(rain.press('A')[0]).toMatchObject({ type: 'zap', drop: { id: 2 } });
    expect(rain.press('Z')[0]).toEqual({ type: 'wrong' });
    expect(rain.combo).toBe(0);
  });

  it('a perfect typist keeps all lives for a minute; an idle one loses', () => {
    const rain = new LetterRain(seeded(8));
    for (let i = 0; i < 60 * 60; i++) {
      rain.step(1 / 60);
      const low = rain.drops.filter((d) => d.y > 700)[0];
      if (low) rain.press(low.ch);
    }
    expect(rain.lives).toBe(5);
    const idle = new LetterRain(seeded(9));
    for (let i = 0; i < 60 * 60 && !idle.over; i++) idle.step(1 / 60);
    expect(idle.over).toBe(true);
  });
});

describe('cubo saltitante', () => {
  const clone = (s: CubeSim): CubeSim =>
    Object.assign(Object.create(CubeSim.prototype) as CubeSim, s, {
      obstacles: s.obstacles.map((o: Obstacle) => ({ ...o })),
      rng: () => 0.5,
    });
  const survives = (s: CubeSim, jumpNow: boolean): boolean => {
    const c = clone(s);
    if (jumpNow) c.jump();
    for (let i = 0; i < 50; i++) if (c.step(1 / 60) === 'dead') return false;
    return true;
  };

  it('running into a spike ends the run', () => {
    const sim = new CubeSim(seeded(10));
    let dead = false;
    for (let i = 0; i < 60 * 20 && !dead; i++) dead = sim.step(1 / 60) === 'dead';
    expect(dead).toBe(true);
  });

  it('a look-ahead bot runs over 1000 m through every pattern', () => {
    const sim = new CubeSim(seeded(11));
    for (let i = 0; i < 60 * 60 && sim.alive; i++) {
      if (sim.onGround && !survives(sim, false) && survives(sim, true)) sim.jump();
      sim.step(1 / 60);
    }
    expect(sim.score).toBeGreaterThan(1000);
  });
});

describe('pássaro das colinas', () => {
  it('hills are smooth and the bird always moves forward', () => {
    for (let x = 0; x < 3000; x += 10)
      expect(Math.abs(groundY(x + 1) - groundY(x))).toBeLessThan(5);
    const sim = new BirdSim();
    for (let i = 0; i < 60 * 10; i++) sim.step(1 / 60);
    expect(sim.x).toBeGreaterThan(1500);
  });

  it('diving on downhills (release uphill) goes further than never diving', () => {
    const lazy = new BirdSim();
    const smart = new BirdSim();
    for (let i = 0; i < 60 * 30; i++) {
      lazy.step(1 / 60);
      const s = groundY(smart.x + 2) - groundY(smart.x);
      smart.holding = s > 0; // ground falling ahead: dive
      smart.step(1 / 60);
    }
    expect(smart.x).toBeGreaterThan(lazy.x);
  });

  it('the run ends at dusk', () => {
    const sim = new BirdSim();
    let dusk = false;
    for (let i = 0; i < 60 * 120 && !dusk; i++)
      dusk = sim.step(1 / 60).some((e) => e.type === 'dusk');
    expect(dusk).toBe(true);
  });
});

describe('canhão', () => {
  it('bullets wear rocks down and big rocks split', () => {
    const sim = new BlastSim(seeded(12));
    sim.rocks = [{ id: 99, x: 360, y: 500, vx: 0, vy: 0, hp: 3, size: 2 }];
    let split = false;
    for (let i = 0; i < 120 && !split; i++)
      split = sim.step(1 / 60).some((e) => e.type === 'split');
    expect(split).toBe(true);
    expect(sim.rocks.filter((r) => r.size === 1)).toHaveLength(2);
  });

  it('a look-ahead bot clears several waves', () => {
    const clone = (s: BlastSim): BlastSim =>
      Object.assign(Object.create(BlastSim.prototype) as BlastSim, s, {
        rocks: s.rocks.map((r) => ({ ...r })),
        bullets: s.bullets.map((b) => ({ ...b })),
        rng: () => 0.5,
      });
    const safe = (s: BlastSim, x: number): boolean => {
      const c = clone(s);
      c.aim(x);
      for (let i = 0; i < 60; i++) if (c.step(1 / 60).some((e) => e.type === 'dead')) return false;
      return true;
    };
    const sim = new BlastSim(seeded(13));
    for (let i = 0; i < 60 * 120 && sim.alive; i++) {
      if (i % 6 === 0) {
        // Prefer standing under the toughest rock; move only to places that stay safe.
        const goal = [...sim.rocks].sort((a, b) => b.hp - a.hp)[0]?.x ?? 360;
        const xs = Array.from({ length: 21 }, (_, k) => 85 + k * 27.5).sort(
          (a, b) => Math.abs(a - goal) - Math.abs(b - goal),
        );
        const pick = xs.find((x) => safe(sim, x));
        if (pick !== undefined) sim.aim(pick);
      }
      sim.step(1 / 60);
    }
    expect(sim.wave).toBeGreaterThan(3);
    expect(FLOOR).toBeGreaterThan(1000);
  });
});

describe('equilíbrio', () => {
  it('a still finger lets the stick fall', () => {
    const sim = new BalanceSim(seeded(14));
    for (let i = 0; i < 60 * 20 && sim.alive; i++) sim.step(1 / 240, 360);
    expect(sim.alive).toBe(false);
  });

  it('a feedback-controlled finger keeps it up for 50 s, wind and all', () => {
    for (const seed of [15, 16, 17]) {
      const sim = new BalanceSim(seeded(seed));
      for (let i = 0; i < 240 * 50 && sim.alive; i++) {
        const target =
          sim.x + sim.angle * 300 + sim.omega * 60 + (sim.x - 360) * 0.1 + sim.vx * 0.2;
        sim.step(1 / 240, Math.max(60, Math.min(660, target)));
      }
      expect(sim.alive, `seed ${seed}`).toBe(true);
      expect(sim.length).toBeLessThanOrEqual(1.1);
    }
  });
});

describe('desarme a bomba', () => {
  it('follows the rule card', () => {
    expect(correctWire(['azul', 'azul', 'amarelo'], false)).toBe(1); // no red: 2nd
    expect(correctWire(['vermelho', 'azul', 'branco'], false)).toBe(2); // last is white
    expect(correctWire(['vermelho', 'azul', 'azul'], false)).toBe(2); // last blue
    expect(correctWire(['vermelho', 'vermelho', 'azul', 'branco'], true)).toBe(1); // last red, odd
    expect(correctWire(['vermelho', 'azul', 'branco', 'branco'], false)).toBe(0); // one blue
    expect(correctWire(['azul', 'azul', 'azul', 'azul', 'preto'], true)).toBe(3); // last black, odd
    expect(correctWire(['amarelo', 'azul', 'branco', 'branco', 'azul', 'vermelho'], false)).toBe(3);
    for (const n of [3, 4, 5, 6]) expect(RULES[n]!.length).toBeGreaterThan(3);
  });

  it('cutting the right wire defuses, a wrong one costs a life', () => {
    const run = new DefuseRun(seeded(16));
    const right = correctWire(run.bomb.wires, run.bomb.odd);
    expect(run.cut(right).kind).toBe('defused');
    run.next();
    const wrong = (correctWire(run.bomb.wires, run.bomb.odd) + 1) % run.bomb.wires.length;
    expect(run.cut(wrong)).toMatchObject({ kind: 'boom', livesLeft: 2 });
    expect(makeBomb(12, seeded(1)).fuse).toBeLessThan(makeBomb(1, seeded(1)).fuse);
  });
});

describe('controle de tráfego', () => {
  it('both roads green means a crash', () => {
    const sim = new TrafficSim(seeded(17));
    sim.green = { N: true, S: true, E: true, W: true };
    let crash = false;
    for (let i = 0; i < 60 * 30 && !crash; i++)
      crash = sim.step(1 / 60).some((e) => e.type === 'crash');
    expect(crash).toBe(true);
  });

  it('a controller that alternates safely lets traffic flow', () => {
    const sim = new TrafficSim(seeded(18));
    let phase: 'v' | 'h' = 'v';
    let clock = 0;
    for (let i = 0; i < 60 * 60 && sim.alive; i++) {
      clock += 1 / 60;
      const boxBusy = sim.cars.some((c) => TrafficSim.inBox(c));
      const waitingOther = (['N', 'S', 'E', 'W'] as Dir[])
        .filter((d) => (phase === 'v' ? d === 'E' || d === 'W' : d === 'N' || d === 'S'))
        .reduce((n, d) => n + sim.queue(d), 0);
      if (clock > 3 && waitingOther > 1) {
        // All red, wait for the box to clear, then switch.
        sim.green = { N: false, S: false, E: false, W: false };
        if (!boxBusy) {
          phase = phase === 'v' ? 'h' : 'v';
          sim.green = { N: phase === 'v', S: phase === 'v', E: phase === 'h', W: phase === 'h' };
          clock = 0;
        }
      }
      sim.step(1 / 60);
    }
    expect(sim.alive).toBe(true);
    expect(sim.passed).toBeGreaterThan(30);
  });
});
