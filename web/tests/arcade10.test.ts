import { describe, expect, it } from 'vitest';
import { DalgonaRound, roundSpec, shapePoints, SHAPES } from '@/games/dalgona/core';
import {
  cloneLot,
  generate as genLot,
  ParkingRun,
  slideRange,
  solve,
  solved,
} from '@/games/estaciona/core';
import {
  blocked,
  HexSim,
  pattern,
  PLAYER_R,
  SECTOR,
  sectorOf,
  SIDES,
  WALL_T,
} from '@/games/hexagono/core';
import {
  adjacent,
  FlowBoard,
  generate as genFlow,
  hamiltonian,
  levelSpec,
} from '@/games/ligapontos/core';
import { boardId } from '@/platform/boards';
import { groundAt, LunarSim, makeTerrain } from '@/games/lunar/core';
import { FACES, isFree, layout, MahjongGame } from '@/games/mahjong/core';
import { HiLoGame } from '@/games/maiormenor/core';
import { BATTERIES, CITIES, GROUND_Y, MissileSim } from '@/games/misseis/core';
import { COLS, ROWS, TronSim } from '@/games/motoluz/core';
import { FishingSim, lineLength } from '@/games/pescaria/core';
import { BALL_R, POCKETS, PoolSim, rack } from '@/games/sinuca/core';
import { evaluate, TermoRun, WORDS } from '@/games/termo/core';

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

describe('hexágono', () => {
  it('every ring of every pattern leaves a side open', () => {
    const rng = seeded(1);
    for (let i = 0; i < 300; i++)
      for (const mask of pattern(rng, 5)) expect(mask & 0b111111).not.toBe(0b111111);
  });

  it('a bot steering to the next gap survives past the first stages', () => {
    for (const seed of [2, 3, 4]) {
      const sim = new HexSim(seeded(seed));
      for (let t = 0; t < 25 && sim.alive; t += 1 / 60) {
        const next = sim.walls
          .filter((w) => w.dist + WALL_T >= PLAYER_R - 6)
          .sort((a, b) => a.dist - b.dist)[0];
        let input: -1 | 0 | 1 = 0;
        if (next) {
          const me = sectorOf(sim.angle);
          let best = me;
          let bestD = 99;
          for (let s = 0; s < SIDES; s++) {
            if (blocked(next.mask, s)) continue;
            const d = Math.min((s - me + SIDES) % SIDES, (me - s + SIDES) % SIDES);
            if (d < bestD) {
              bestD = d;
              best = s;
            }
          }
          const target = (best + 0.5) * SECTOR;
          let diff = target - sim.angle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          input = Math.abs(diff) < 0.12 ? 0 : diff > 0 ? 1 : -1;
        }
        sim.step(1 / 60, input);
      }
      expect(sim.time).toBeGreaterThan(20);
    }
  });

  it('standing still eventually hits a wall', () => {
    const sim = new HexSim(seeded(5));
    for (let i = 0; i < 60 * 60 && sim.alive; i++) sim.step(1 / 60, 0);
    expect(sim.alive).toBe(false);
    expect(sim.score).toBeGreaterThan(0);
  });
});

describe('palavra secreta', () => {
  it('has only unique five-letter words', () => {
    expect(WORDS.length).toBeGreaterThan(250);
    for (const w of WORDS) expect(w).toMatch(/^[A-Z]{5}$/);
    expect(new Set(WORDS).size).toBe(WORDS.length);
  });

  it('marks repeated letters like Wordle', () => {
    expect(evaluate('CARRO', 'CARTA')).toEqual(['hit', 'hit', 'hit', 'miss', 'miss']);
    expect(evaluate('ARARA', 'CARTA')).toEqual(['near', 'near', 'miss', 'miss', 'hit']);
    expect(evaluate('TERMO', 'TERMO').every((m) => m === 'hit')).toBe(true);
  });

  it('scores faster guesses higher and ends after three misses', () => {
    const run = new TermoRun(seeded(7));
    for (const ch of run.answer) run.type(ch);
    const res = run.submit();
    expect(res.kind).toBe('solved');
    expect(run.score).toBe(600);
    for (let w = 0; w < 3; w++) {
      run.nextWord();
      for (let t = 0; t < 6; t++) {
        for (const ch of 'XXXXX') run.type(ch);
        run.submit();
      }
    }
    expect(run.over).toBe(true);
    expect(run.words).toBe(1);
  });
});

describe('estacionamento', () => {
  it('generates solvable lots with the reported minimum', () => {
    const rng = seeded(11);
    for (const level of [1, 4, 8]) {
      const { lot, par } = genLot(level, rng);
      expect(par).toBeGreaterThanOrEqual(2);
      expect(solve(cloneLot(lot))).toBe(par);
    }
  });

  it('cars only slide into free cells', () => {
    const run = new ParkingRun(seeded(12));
    for (const car of run.lot) {
      const [lo, hi] = slideRange(run.lot, car.id);
      expect(lo).toBeLessThanOrEqual(0);
      expect(hi).toBeGreaterThanOrEqual(0);
    }
  });

  it('a BFS bot clears levels and keeps fuel', () => {
    const run = new ParkingRun(seeded(13));
    for (let level = 0; level < 3; level++) {
      // Greedy: take any move that lowers the remaining minimum.
      while (!solved(run.lot)) {
        const now = solve(cloneLot(run.lot));
        let done = false;
        for (const car of run.lot) {
          const [lo, hi] = slideRange(run.lot, car.id);
          for (let d = lo; d <= hi && !done; d++) {
            if (!d) continue;
            const test = cloneLot(run.lot);
            const m = test.find((c) => c.id === car.id)!;
            if (m.horiz) m.c += d;
            else m.r += d;
            if (solve(test) === now - 1) {
              run.slide(car.id, d);
              done = true;
            }
          }
          if (done) break;
        }
        expect(done).toBe(true);
      }
      const res = run.complete();
      expect(res.perfect).toBe(true);
    }
    expect(run.level).toBe(4);
    expect(run.fuel).toBeGreaterThan(30);
  });
});

describe('liga pontos', () => {
  it('builds a path through every cell', () => {
    const path = hamiltonian(6, seeded(21));
    expect(new Set(path).size).toBe(36);
    for (let i = 1; i < path.length; i++) expect(adjacent(6, path[i - 1]!, path[i]!)).toBe(true);
  });

  it('drawing the hidden solution solves and fills the board', () => {
    const puzzle = genFlow(5, 4, seeded(22));
    const board = new FlowBoard(puzzle);
    expect(puzzle.pairs.length).toBe(4);
    // Walk each colour along the generator's own path (same seed, same path).
    const full = hamiltonian(5, seeded(22));
    for (let i = 0; i < puzzle.pairs.length; i++) {
      const [a, b] = puzzle.pairs[i]!;
      const from = full.indexOf(a);
      const to = full.indexOf(b);
      const seg = full.slice(Math.min(from, to), Math.max(from, to) + 1);
      if (full[from] !== seg[0]) seg.reverse();
      board.begin(seg[0]!);
      for (const c of seg.slice(1)) board.extend(i, c);
      expect(board.connected(i)).toBe(true);
    }
    expect(board.solved).toBe(true);
    expect(board.fill).toBe(1);
  });

  it('gets hard quickly: bigger boards early and a tighter clock', () => {
    expect(levelSpec(1)).toMatchObject({ size: 5 });
    expect(levelSpec(5).size).toBe(7);
    expect(levelSpec(9).size).toBe(9);
    expect(levelSpec(30).time).toBeLessThan(levelSpec(9).time);
    expect(levelSpec(60).time).toBe(20);
    expect(boardId('ligapontos')).toBe('ligapontos2');
  });

  it('drawing over another colour cuts it', () => {
    const board = new FlowBoard({
      size: 3,
      pairs: [
        [0, 2],
        [6, 8],
      ],
    });
    board.begin(0);
    board.extend(0, 1);
    board.begin(6);
    board.extend(1, 3);
    board.extend(1, 4);
    board.extend(1, 1);
    expect(board.paths[0]).toEqual([0]);
    expect(board.extend(1, 2)).toBe(false); // the other colour's dot
  });
});

describe('pescaria', () => {
  it('dives to the end of the line, then reels in and scores the catch', () => {
    const sim = new FishingSim(seeded(31));
    sim.fish = [];
    for (let i = 0; i < 2000 && sim.phase === 'down'; i++) sim.step(1 / 60);
    expect(sim.phase).toBe('up');
    expect(sim.depth).toBeGreaterThanOrEqual(lineLength(1));
    sim.fish = [
      {
        id: 1,
        kind: { name: 'Sardinha', emoji: '🐟', value: 10, r: 30, from: 0 },
        x: sim.hookX,
        y: 500,
        vx: 0,
        caught: false,
      },
    ];
    for (let i = 0; i < 2000 && sim.phase === 'up'; i++) sim.step(1 / 60);
    expect(sim.phase).toBe('done');
    expect(sim.score).toBe(11);
    sim.next();
    expect(sim.cast).toBe(2);
  });

  it('touching a fish on the way down stops the dive', () => {
    const sim = new FishingSim(seeded(32));
    sim.fish = [
      {
        id: 1,
        kind: { name: 'Sardinha', emoji: '🐟', value: 10, r: 30, from: 0 },
        x: sim.hookX,
        y: 300,
        vx: 0,
        caught: false,
      },
    ];
    const events = [];
    for (let i = 0; i < 300 && sim.phase === 'down'; i++) events.push(...sim.step(1 / 60));
    expect(events.some((e) => e.type === 'bump')).toBe(true);
    expect(sim.depth).toBeLessThan(400);
  });
});

describe('pouso lunar', () => {
  it('terrain spans the screen with three pads', () => {
    const t = makeTerrain(3, seeded(41));
    expect(t.pads).toHaveLength(3);
    for (let i = 1; i < t.points.length; i++)
      expect(t.points[i]!.x).toBeGreaterThanOrEqual(t.points[i - 1]!.x);
    for (const p of t.pads) expect(groundAt(t, (p.x0 + p.x1) / 2)).toBeCloseTo(p.y);
  });

  it('a hovering autopilot lands on a pad', () => {
    const sim = new LunarSim(seeded(42));
    const pad = sim.terrain.pads[0]!;
    const target = (pad.x0 + pad.x1) / 2;
    for (let i = 0; i < 60 * 40 && sim.state === 'flying'; i++) {
      const dx = target - sim.x;
      const wantVx = Math.max(-40, Math.min(40, dx * 0.8));
      // Sink faster high up, gently near the pad; hold height while far off to the side.
      const wantVy =
        Math.abs(dx) > 80 ? 10 : Math.max(30, Math.min(150, (pad.y - sim.y - 40) * 0.35));
      const up = sim.vy > wantVy;
      sim.left = up || sim.vx < wantVx - 5;
      sim.right = up || sim.vx > wantVx + 5;
      sim.step(1 / 60);
    }
    expect(sim.state).toBe('landed');
    expect(sim.score).toBeGreaterThan(0);
  });

  it('free fall crashes', () => {
    const sim = new LunarSim(seeded(43));
    let ev: ReturnType<LunarSim['step']> = [];
    for (let i = 0; i < 60 * 20 && sim.state === 'flying'; i++) ev = sim.step(1 / 60);
    expect(sim.state).toBe('crashed');
    expect(ev[0]?.type).toBe('crash');
  });
});

describe('defesa antimísseis', () => {
  it('fires from the nearest battery with ammo', () => {
    const sim = new MissileSim(seeded(51));
    const ev = sim.fire(BATTERIES[0]! + 5, 600);
    expect(ev[0]).toEqual({ type: 'fire', battery: 0 });
  });

  it('a blast destroys missiles inside it', () => {
    const sim = new MissileSim(seeded(52));
    sim.missiles = [
      {
        id: 99,
        x: 360,
        y: 600,
        sx: 360,
        sy: 240,
        tx: 360,
        ty: GROUND_Y,
        speed: 1,
        splitAt: 0,
        dead: false,
      },
    ];
    sim.blasts = [{ x: 360, y: 600, t: 0.5, friendly: true }];
    const ev = sim.step(1 / 60);
    expect(ev.some((e) => e.type === 'kill')).toBe(true);
    expect(sim.kills).toBe(1);
  });

  it('later waves are bigger and faster, on a fresh ranking', () => {
    const count = (wave: number) => {
      const sim = new MissileSim(seeded(54));
      sim.wave = wave;
      let launched = 0;
      for (let i = 0; i < 60 * 4; i++) {
        const before = sim.missiles.length;
        sim.step(1 / 60);
        launched += Math.max(0, sim.missiles.length - before);
      }
      return launched;
    };
    expect(count(6)).toBeGreaterThan(count(1));
    expect(boardId('misseis')).toBe('misseis2');
  });

  it('cities fall when nobody defends them', () => {
    const sim = new MissileSim(seeded(53));
    for (let i = 0; i < 60 * 600 && !sim.over; i++) sim.step(1 / 60);
    expect(sim.over).toBe(true);
    expect(sim.cities.every((c) => !c)).toBe(true);
    expect(CITIES).toHaveLength(6);
  });
});

describe('moto de luz', () => {
  it('cannot reverse, and going straight forever ends the run', () => {
    const sim = new TronSim(seeded(61));
    sim.steer(2); // reverse: ignored
    sim.step(sim.tickTime);
    expect(sim.bikes[0]!.dir).toBe(0);
    let over = false;
    for (let i = 0; i < 600 && !over; i++) over = sim.step(0.1).some((e) => e.type === 'over');
    expect(over).toBe(true);
    expect(sim.state).toBe('over');
  });

  it('CPU bikes avoid walls for a long time', () => {
    const sim = new TronSim(seeded(62));
    // Park the player in a safe loop by removing it from the grid's dangers: just watch rivals.
    let ticks = 0;
    const me = sim.bikes[0]!;
    for (; ticks < 60; ticks++) {
      // Keep the player circling in its own corner.
      const turn = [0, 1, 2, 3][Math.floor(ticks / 3) % 4] as 0 | 1 | 2 | 3;
      if (ticks < 4) sim.steer(turn);
      sim.step(sim.tickTime);
      if (!me.alive) break;
    }
    const rivalsAlive = sim.bikes.filter((b) => b.id !== 0 && b.alive).length;
    expect(rivalsAlive).toBeGreaterThan(0);
    expect(COLS * ROWS).toBe(1800);
  });
});

describe('sinuca', () => {
  it('racks fifteen balls plus the cue ball, none overlapping', () => {
    const balls = rack();
    expect(balls).toHaveLength(16);
    for (let i = 0; i < balls.length; i++)
      for (let j = i + 1; j < balls.length; j++)
        expect(
          Math.hypot(balls[i]!.x - balls[j]!.x, balls[i]!.y - balls[j]!.y),
        ).toBeGreaterThanOrEqual(BALL_R * 2);
  });

  it('pocketing a ball scores; missing costs a life', () => {
    const sim = new PoolSim();
    const pocket = POCKETS[0]!;
    // Leave one ball in front of the top-left pocket and aim the cue ball straight through it.
    sim.balls = sim.balls.slice(0, 2);
    const ball = sim.balls[1]!;
    ball.x = pocket.x + 80;
    ball.y = pocket.y + 80;
    const cue = sim.balls[0]!;
    cue.x = pocket.x + 240;
    cue.y = pocket.y + 240;
    expect(sim.shoot(-1, -1, 0.6)).toBe(true);
    const ev = [];
    for (let i = 0; i < 60 * 15 && sim.rolling; i++) ev.push(...sim.step(1 / 60));
    expect(ev.some((e) => e.type === 'pocket' && e.n === ball.n)).toBe(true);
    expect(sim.score).toBeGreaterThan(0);
    expect(ev.some((e) => e.type === 'rack')).toBe(true);

    const miss = new PoolSim();
    miss.shoot(0, 1, 0.1);
    for (let i = 0; i < 60 * 15 && miss.rolling; i++) miss.step(1 / 60);
    expect(miss.lives).toBe(2);
  });
});

describe('maior ou menor', () => {
  it('odds come from the cards left in the deck', () => {
    const g = new HiLoGame(seeded(71));
    const hi = g.odds('higher');
    const lo = g.odds('lower');
    expect(hi + lo).toBeLessThanOrEqual(1);
    expect(hi + lo).toBeGreaterThan(0.8);
  });

  it('right guesses grow the pot, a wrong one empties it, banking keeps it', () => {
    const g = new HiLoGame(seeded(72));
    let banked = 0;
    for (let i = 0; i < 200 && !g.over; i++) {
      const pick = g.odds('higher') >= g.odds('lower') ? 'higher' : 'lower';
      const res = g.guess(pick);
      if (res.kind === 'lose') expect(g.pot).toBe(0);
      if (g.pot > 300) banked += g.bank();
    }
    expect(g.score).toBe(banked);
    expect(g.bestStreak).toBeGreaterThan(2);
  });
});

describe('biscoito dalgona', () => {
  it('every shape is a dense outline', () => {
    for (const s of SHAPES) {
      const pts = shapePoints(s);
      expect(pts.length).toBeGreaterThan(60);
      for (let i = 1; i < pts.length; i++)
        expect(Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y)).toBeLessThan(40);
    }
  });

  it('tracing the line slowly completes the shape without cracks', () => {
    for (let level = 1; level <= SHAPES.length; level++) {
      const round = new DalgonaRound(roundSpec(level));
      let t = 0;
      for (const p of [...round.points, round.points[0]!]) {
        t += 0.02;
        round.trace(p.x, p.y, t);
        if (round.done) break;
      }
      expect(round.cracks).toBe(0);
      expect(round.done).toBe(true);
      expect(round.scoreFor(level)).toBeGreaterThan(1000);
    }
  });

  it('wandering off the line cracks it', () => {
    const round = new DalgonaRound(roundSpec(1));
    round.trace(360, 700, 0);
    round.trace(362, 702, 0.2);
    round.trace(364, 704, 0.4);
    expect(round.cracks).toBeGreaterThan(0);
  });
});

describe('mahjong', () => {
  it('the layout has an even number of tiles and blocked middles', () => {
    const slots = layout();
    expect(slots.length % 2).toBe(0);
    const mid = slots.find((s) => s.z === 0 && s.x === 4 && s.y === 0)!;
    expect(isFree(mid, slots)).toBe(false);
    const corner = slots.find((s) => s.z === 0 && s.x === 0 && s.y === 0)!;
    expect(isFree(corner, slots)).toBe(true);
  });

  it('a greedy player with reshuffles clears the first board', () => {
    const g = new MahjongGame(seeded(81));
    for (const t of g.tiles) expect(t.face).toBeLessThan(FACES.length);
    const counts = new Map<number, number>();
    for (const t of g.tiles) counts.set(t.face, (counts.get(t.face) ?? 0) + 1);
    for (const n of counts.values()) expect(n % 2).toBe(0);
    for (let i = 0; i < 200 && g.board === 1; i++) {
      const m = g.moves()[0];
      if (!m) {
        g.shuffle();
        continue;
      }
      g.pick(m[0]);
      g.pick(m[1]);
    }
    expect(g.board).toBe(2);
    expect(g.score).toBeGreaterThan(0);
  });
});
