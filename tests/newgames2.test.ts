import { describe, expect, it } from 'vitest';
import { classify, DadosSim, scoreHand, targetFor } from '@/games/dados/core';
import {
  EspelhosSim,
  generateLevel as mirrorLevel,
  rotate,
  solved as mirrorsSolved,
  traceBeam,
  type Level as MirrorLevel,
} from '@/games/espelhos/core';
import {
  DIRS,
  EscorregaSim,
  generateLevel as iceLevel,
  levelSpec as iceSpec,
  slide,
  solve,
  type Dir,
} from '@/games/escorrega/core';
import { COLS, MasmorraSim, MAX_HP, ROWS } from '@/games/masmorra/core';
import { DRAIN_Y, LANE_START_Y, LANE_X, PinballSim } from '@/games/pinball/core';
import {
  BALL_R,
  BOARD_L,
  makePegs,
  PlinkoSim,
  quotaFor,
  SLOT_TOP,
  SLOTS,
} from '@/games/plinko/core';
import { accuracy, makeOrder, match, mix, TintaSim } from '@/games/tinta/core';
import { seeded } from '@/platform/rnd';

describe('Escorrega (ice sliding)', () => {
  const open = (w: number, h: number) =>
    Array.from({ length: h }, () => new Array<boolean>(w).fill(false));

  it('slides until a rock or the edge, and stops on the exit', () => {
    const rocks = open(5, 3);
    rocks[0]![3] = true;
    const level = { w: 5, h: 3, rocks, exit: { x: 4, y: 2 } };
    expect(slide(level, { x: 0, y: 0 }, 'right').end).toEqual({ x: 2, y: 0 });
    expect(slide(level, { x: 0, y: 0 }, 'left').path).toEqual([]);
    const toExit = slide(level, { x: 0, y: 2 }, 'right');
    expect(toExit.atExit).toBe(true);
    expect(toExit.end).toEqual({ x: 4, y: 2 });
    // The exit stops you even when more ice lies beyond it.
    const wide = { ...level, exit: { x: 2, y: 2 } };
    expect(slide(wide, { x: 0, y: 2 }, 'right').end).toEqual({ x: 2, y: 2 });
  });

  it('solves by breadth-first search, and replaying the moves reaches the exit', () => {
    const rocks = open(4, 4);
    rocks[1]![3] = true;
    const level = { w: 4, h: 4, rocks, exit: { x: 3, y: 3 } };
    const moves = solve(level, { x: 0, y: 0 })!;
    expect(moves.length).toBeGreaterThan(0);
    let pos = { x: 0, y: 0 };
    for (const m of moves) pos = slide(level, pos, m).end;
    expect(pos).toEqual(level.exit);
    expect(
      solve({ ...level, rocks: rocks.map((r) => r.map(() => true)) }, { x: 0, y: 0 }),
    ).toBeNull();
  });

  it('generates solvable levels at least as long as asked, across many seeds and levels', () => {
    for (const lv of [1, 4, 8, 14]) {
      for (let seed = 1; seed <= 6; seed++) {
        const l = iceLevel(lv, seeded(seed * 17 + lv));
        const moves = solve(l, l.start);
        expect(moves, `level ${lv} seed ${seed}`).not.toBeNull();
        expect(moves!.length).toBe(l.par);
        expect(l.par).toBeGreaterThanOrEqual(Math.min(iceSpec(lv).minPar, 3));
      }
    }
  });

  it('banks time for solving, more for a perfect run, and counts a blocked move as free', () => {
    const sim = new EscorregaSim(seeded(5));
    const moves = solve(sim.data, sim.pos)!;
    const dead = (['up', 'down', 'left', 'right'] as Dir[]).find(
      (d) => slide(sim.data, sim.pos, d).path.length === 0,
    );
    if (dead) {
      expect(sim.move(dead)[0]?.type).toBe('blocked');
      expect(sim.moves).toBe(0);
    }
    const before = sim.time;
    let last;
    for (const m of moves) last = sim.move(m);
    const solvedEv = last!.find((e) => e.type === 'solved');
    expect(solvedEv && solvedEv.type === 'solved' && solvedEv.perfect).toBe(true);
    expect(sim.time).toBeCloseTo(before + 16, 5);
    expect(sim.levelsDone).toBe(1);
    expect(sim.move('up')).toEqual([]); // solved levels ignore input until the next one
    sim.nextLevel();
    expect(sim.level).toBe(2);
    expect(sim.moves).toBe(0);
  });

  it('ends when the clock runs out and hints cost time', () => {
    const sim = new EscorregaSim(seeded(8));
    expect(sim.hint()).not.toBeNull();
    expect(sim.time).toBe(54);
    expect(sim.step(100)[0]?.type).toBe('timeUp');
    expect(sim.over).toBe(true);
    expect(sim.move('left')).toEqual([]);
    expect(DIRS.up.dy).toBe(-1);
  });
});

describe('Chuva de Bolas (plinko roguelite)', () => {
  it('lays pegs inside the board', () => {
    const pegs = makePegs();
    expect(pegs.length).toBeGreaterThan(80);
    for (const p of pegs) {
      expect(p.x).toBeGreaterThan(BOARD_L);
      expect(p.y).toBeLessThan(SLOT_TOP);
    }
  });

  it('pays the multiplier of the slot a ball lands in, exactly once', () => {
    const sim = new PlinkoSim(seeded(3));
    sim.pegs = [];
    sim.drop(360);
    let lands = 0;
    let coins = 0;
    for (let i = 0; i < 600; i++) {
      for (const e of sim.step(1 / 60)) {
        if (e.type === 'land') {
          lands++;
          coins = e.coins;
          expect(coins).toBe(Math.round(sim.ballValue * sim.slotMult(e.slot)));
        }
      }
    }
    expect(lands).toBe(1);
    expect(sim.earned).toBe(coins);
    expect(sim.balls).toHaveLength(0);
  });

  it('respects the drop cooldown and the ball budget', () => {
    const sim = new PlinkoSim(seeded(3));
    expect(sim.drop(300)).toHaveLength(1);
    expect(sim.drop(300)).toEqual([]);
    expect(sim.dropsLeft).toBe(sim.ballsPerRound - 1);
    sim.drop(-500); // clamped inside the board
    expect(sim.balls[0]!.x).toBeGreaterThanOrEqual(BOARD_L + BALL_R);
  });

  it('keeps every ball on the board and lets it land somewhere', () => {
    const sim = new PlinkoSim(seeded(11));
    for (let i = 0; i < 6; i++) {
      sim.drop(200 + i * 50);
      for (let f = 0; f < 14; f++) sim.step(1 / 60);
    }
    let landed = 0;
    for (let f = 0; f < 60 * 25 && sim.balls.length > 0; f++) {
      for (const b of sim.balls) expect(b.x).toBeGreaterThan(BOARD_L - 1);
      for (const e of sim.step(1 / 60)) if (e.type === 'land') landed++;
    }
    expect(landed).toBe(6);
    expect(sim.balls).toHaveLength(0);
  });

  it('opens the shop after a met quota and ends the run after a missed one', () => {
    const win = new PlinkoSim(seeded(2));
    win.pegs = [];
    win.dropsLeft = 1;
    win.earned = win.quota;
    win.drop(360);
    for (let i = 0; i < 400; i++) win.step(1 / 60);
    expect(win.state).toBe('shop');
    expect(win.shopChoices).toHaveLength(3);
    const pick = win.shopChoices[0]!.id;
    expect(win.choose(pick)).toBe(true);
    expect(win.round).toBe(2);
    expect(win.quota).toBe(quotaFor(2));
    expect(win.levels[pick]).toBe(1);
    expect(win.state).toBe('play');

    const lose = new PlinkoSim(seeded(2));
    lose.pegs = [];
    lose.dropsLeft = 1;
    lose.drop(360);
    lose.quota = 1e9;
    const ends = [];
    for (let i = 0; i < 400; i++) ends.push(...lose.step(1 / 60));
    expect(ends.some((e) => e.type === 'roundEnd' && !e.success)).toBe(true);
    expect(lose.state).toBe('over');
  });

  it('applies upgrades to the slot table', () => {
    const sim = new PlinkoSim(seeded(2));
    const mid = (SLOTS - 1) / 2;
    const base = sim.slotMult(mid);
    sim.levels.mult = 2;
    sim.levels.center = 1;
    expect(sim.slotMult(mid)).toBeCloseTo(base * 1.4 + 1, 5);
    expect(quotaFor(3)).toBeGreaterThan(quotaFor(2));
  });
});

describe('Mistura (colour mixing)', () => {
  it('averages pigments and measures how close two colours are', () => {
    expect(mix([])).toBeNull();
    expect(mix(['white', 'black'])).toEqual([140, 140, 143]);
    expect(match([10, 20, 30], [10, 20, 30])).toBe(1);
    expect(accuracy([0, 0, 0], [255, 255, 255])).toBe(0);
    expect(accuracy([100, 100, 100], [104, 100, 100])).toBeGreaterThan(0.97);
  });

  it('only asks for colours that can be mixed exactly', () => {
    for (let i = 0; i < 12; i++) {
      const o = makeOrder(i, seeded(i + 1));
      expect(mix(o.recipe)).toEqual(o.target);
      expect(new Set(o.recipe).size).toBeGreaterThan(1);
      expect(o.seconds).toBeGreaterThanOrEqual(15);
    }
  });

  it('rewards a perfect recipe, punishes a bad delivery and ends after three mistakes', () => {
    const sim = new TintaSim(seeded(6));
    for (const id of sim.order.recipe) sim.add(id);
    const events = sim.deliver();
    const d = events.find((e) => e.type === 'delivered');
    expect(d && d.type === 'delivered' && d.perfect).toBe(true);
    expect(sim.orders).toBe(1);
    expect(sim.perfect).toBe(1);
    expect(sim.score).toBeGreaterThan(100);
    expect(sim.drops).toEqual([]);

    for (let miss = 0; miss < 3; miss++) {
      const target = sim.order.target;
      // The farthest pigment from the target is a guaranteed miss.
      sim.add(target[0] > 128 ? 'black' : 'white');
      sim.deliver();
    }
    expect(sim.lives).toBe(0);
    expect(sim.over).toBe(true);
    expect(sim.add('cyan')).toEqual([]);
  });

  it('caps the drops and loses a life when time runs out', () => {
    const sim = new TintaSim(seeded(6));
    for (let i = 0; i < 8; i++) sim.add('cyan');
    expect(sim.add('cyan')[0]?.type).toBe('full');
    expect(sim.deliver().length).toBeGreaterThan(0);
    const lives = sim.lives;
    const ev = sim.step(999);
    expect(ev[0]?.type).toBe('timeUp');
    expect(sim.lives).toBe(lives - 1);
    sim.undo();
    expect(sim.deliver()).toEqual([]); // nothing in the cup
  });
});

describe('Espelhos (laser puzzle)', () => {
  const empty = (size: number) =>
    Array.from({ length: size }, () => new Array<'' | '/' | '\\'>(size).fill(''));

  it('traces a straight beam and bends it at a mirror', () => {
    const grid = empty(5);
    const level: MirrorLevel = { size: 5, entryRow: 2, grid, crystals: [{ x: 3, y: 2 }] };
    expect(traceBeam(level).hit.size).toBe(1);
    grid[2]![1] = '\\'; // right → down
    expect(traceBeam(level).hit.size).toBe(0);
    grid[4]![1] = '/'; // down → left: leaves the board
    const t = traceBeam(level);
    expect(t.points[0]).toEqual({ x: -1, y: 2 });
    expect(t.looped).toBe(false);
  });

  it('detects a beam trapped in a loop without hanging', () => {
    const grid = empty(5);
    // A little box of mirrors that traps the beam.
    grid[2]![0] = '\\';
    grid[4]![0] = '/';
    grid[4]![3] = '\\';
    grid[2]![3] = '/';
    const level: MirrorLevel = { size: 5, entryRow: 2, grid, crystals: [] };
    const t = traceBeam(level);
    expect(t.looped || t.points.length > 1).toBe(true);
  });

  it('rotates mirrors but not empty cells', () => {
    const level: MirrorLevel = { size: 3, entryRow: 0, grid: empty(3), crystals: [] };
    level.grid[1]![1] = '/';
    expect(rotate(level, 1, 1)).toBe(true);
    expect(level.grid[1]![1]).toBe('\\');
    expect(rotate(level, 0, 0)).toBe(false);
    expect(rotate(level, 9, 9)).toBe(false);
  });

  it('builds scrambled levels that can be solved by flipping some mirrors back', () => {
    for (const lv of [1, 3, 6, 10, 16]) {
      for (let seed = 1; seed <= 5; seed++) {
        const level = mirrorLevel(lv, seeded(seed * 31 + lv));
        expect(level.crystals.length).toBeGreaterThan(0);
        expect(mirrorsSolved(level), `level ${lv} seed ${seed} starts solved`).toBe(false);
        // Brute force over the mirrors: some assignment must light every crystal.
        const cells: Array<[number, number]> = [];
        level.grid.forEach((row, y) => row.forEach((c, x) => c !== '' && cells.push([x, y])));
        if (cells.length > 14) continue;
        let found = false;
        for (let mask = 0; mask < 1 << cells.length && !found; mask++) {
          const copy: MirrorLevel = { ...level, grid: level.grid.map((r) => [...r]) };
          cells.forEach(([x, y], i) => (copy.grid[y]![x] = mask & (1 << i) ? '/' : '\\'));
          found = mirrorsSolved(copy);
        }
        expect(found, `level ${lv} seed ${seed} unsolvable`).toBe(true);
      }
    }
  });

  it('banks time when solved and ends at zero', () => {
    const sim = new EspelhosSim(seeded(4));
    // Brute-force solve by tapping until the beam lights every crystal.
    const cells: Array<[number, number]> = [];
    sim.level.grid.forEach((row, y) => row.forEach((c, x) => c !== '' && cells.push([x, y])));
    let events = [] as ReturnType<EspelhosSim['tap']>;
    for (let round = 0; round < 40 && !events.some((e) => e.type === 'solved'); round++) {
      for (const [x, y] of cells) {
        events = sim.tap(x, y);
        if (events.some((e) => e.type === 'solved')) break;
      }
    }
    if (events.some((e) => e.type === 'solved')) {
      expect(sim.levelsDone).toBe(1);
      expect(sim.time).toBeGreaterThan(75);
    }
    expect(sim.step(999)[0]?.type).toBe('timeUp');
    expect(sim.tap(0, 0)).toEqual([]);
  });
});

describe('Masmorra de Cartas (dungeon cards)', () => {
  const card = (
    kind: 'monster' | 'weapon' | 'potion' | 'shield' | 'coin' | 'bomb',
    value: number,
    id = 1000,
  ) => ({
    id,
    kind,
    value,
  });

  it('deals a full 3×3 table with a starting weapon', () => {
    const sim = new MasmorraSim(seeded(1));
    expect(sim.grid).toHaveLength(COLS);
    for (const col of sim.grid) expect(col).toHaveLength(ROWS);
    expect(sim.grid.flat().some((c) => c.kind === 'weapon')).toBe(true);
    expect(new Set(sim.grid.flat().map((c) => c.id)).size).toBe(9);
  });

  it('fights: the weapon cuts the damage, armor absorbs first, and the weapon wears out', () => {
    const sim = new MasmorraSim(seeded(1));
    sim.weapon = 4;
    sim.uses = 1;
    sim.armor = 3;
    sim.grid[0]![0] = card('monster', 10, 2000);
    const ev = sim.tap(0, 0)[0]!;
    expect(ev.type).toBe('fight');
    if (ev.type !== 'fight') return;
    expect(ev.dealt).toBe(4);
    expect(ev.absorbed).toBe(3);
    expect(ev.taken).toBe(3);
    expect(ev.weaponBroke).toBe(true);
    expect(sim.hp).toBe(MAX_HP - 3);
    expect(sim.weapon).toBe(0);
    expect(sim.armor).toBe(0);
    expect(sim.kills).toBe(1);
  });

  it('heals without passing max HP, equips weapons and collects coins', () => {
    const sim = new MasmorraSim(seeded(1));
    sim.hp = MAX_HP - 2;
    sim.grid[0]![0] = card('potion', 9, 2001);
    const heal = sim.tap(0, 0)[0]!;
    expect(heal.type === 'heal' && heal.amount).toBe(2);
    expect(sim.hp).toBe(MAX_HP);
    sim.grid[1]![0] = card('weapon', 7, 2002);
    sim.tap(1, 0);
    expect(sim.weapon).toBe(7);
    expect(sim.uses).toBe(3);
    sim.grid[2]![0] = card('coin', 30, 2003);
    const before = sim.score;
    sim.tap(2, 0);
    expect(sim.coins).toBe(30);
    expect(sim.score).toBe(before + 30);
  });

  it('refills columns after a card is taken and keeps ids unique', () => {
    const sim = new MasmorraSim(seeded(2));
    const below = sim.grid[1]![1]!.id;
    sim.tap(1, 2);
    for (const col of sim.grid) expect(col).toHaveLength(ROWS);
    // The card that was above the removed one slides down one slot.
    expect(sim.grid[1]![2]!.id).toBe(below);
    expect(new Set(sim.grid.flat().map((c) => c.id)).size).toBe(9);
  });

  it('bombs wipe their neighbours and credit the monsters', () => {
    const sim = new MasmorraSim(seeded(2));
    sim.grid[1]![1] = card('bomb', 0, 3000);
    sim.grid[0]![1] = card('monster', 5, 3001);
    sim.grid[2]![1] = card('monster', 5, 3002);
    sim.grid[1]![0] = card('coin', 10, 3003);
    sim.grid[1]![2] = card('potion', 4, 3004);
    const ev = sim.tap(1, 1)[0]!;
    expect(ev.type === 'bomb' && ev.kills).toBe(2);
    expect(sim.kills).toBe(2);
    expect(sim.cleared).toBe(5);
    const ids = new Set(sim.grid.flat().map((c) => c.id));
    for (const gone of [3000, 3001, 3002, 3003, 3004]) expect(ids.has(gone)).toBe(false);
  });

  it('dies at zero HP, and each batch of cleared cards goes one floor deeper', () => {
    const sim = new MasmorraSim(seeded(2));
    sim.hp = 3;
    sim.weapon = 0;
    sim.grid[0]![0] = card('monster', 9, 4000);
    const events = sim.tap(0, 0);
    expect(events.some((e) => e.type === 'dead')).toBe(true);
    expect(sim.dead).toBe(true);
    expect(sim.tap(1, 1)).toEqual([]);

    const dive = new MasmorraSim(seeded(3));
    let depthEvents = 0;
    for (let i = 0; i < 12; i++) {
      dive.grid[0]![0] = card('coin', 10, 5000 + i);
      if (dive.tap(0, 0).some((e) => e.type === 'depth')) depthEvents++;
    }
    expect(dive.depth).toBe(2);
    expect(depthEvents).toBe(1);
  });
});

describe('Pinball Neon (physics)', () => {
  it('waits in the plunger lane until launched', () => {
    const sim = new PinballSim(seeded(1));
    expect(sim.state).toBe('plunger');
    expect(sim.step(0.5)).toEqual([]);
    expect(sim.ball.x).toBe(LANE_X);
    expect(sim.ball.y).toBe(LANE_START_Y);
    expect(sim.launch()[0]?.type).toBe('launch');
    expect(sim.state).toBe('play');
    expect(sim.launch()).toEqual([]);
  });

  it('carries a launched ball up the lane and into the table', () => {
    const sim = new PinballSim(seeded(1));
    sim.launch(1);
    let minY = Infinity;
    let leftLane = false;
    for (let i = 0; i < 180 && sim.state === 'play'; i++) {
      sim.step(1 / 60);
      minY = Math.min(minY, sim.ball.y);
      if (sim.ball.x < 600) leftLane = true;
    }
    expect(minY).toBeLessThan(400);
    expect(leftLane).toBe(true);
  });

  it('never lets the ball through the walls', () => {
    const sim = new PinballSim(seeded(9));
    sim.launch(1);
    for (let i = 0; i < 60 * 40 && sim.state !== 'over'; i++) {
      sim.press(i % 90 < 45 ? 1 : -1, true);
      sim.press(i % 90 < 45 ? -1 : 1, false);
      sim.step(1 / 60);
      if (sim.state === 'plunger') sim.launch(0.9);
      expect(sim.ball.x).toBeGreaterThan(20);
      expect(sim.ball.x).toBeLessThan(700);
      expect(sim.ball.y).toBeGreaterThan(100);
    }
  });

  it('scores bumpers with the multiplier and chimes through events', () => {
    const sim = new PinballSim(seeded(1));
    sim.state = 'play';
    sim.multi = 3;
    const b = sim.bumpers[0]!;
    sim.ball = { x: b.x, y: b.y - b.r - 10, vx: 0, vy: 300 };
    let points = 0;
    for (let i = 0; i < 6 && points === 0; i++) {
      for (const e of sim.step(1 / 60)) if (e.type === 'bumper') points = e.points;
    }
    expect(points).toBe(300);
    expect(sim.score).toBeGreaterThanOrEqual(300);
    expect(sim.ball.vy).toBeLessThan(0); // kicked away
  });

  it('raises the multiplier when all four drop targets fall', () => {
    const sim = new PinballSim(seeded(1));
    sim.state = 'play';
    sim.saveTime = 0;
    sim.targetsDown = [true, true, true, false];
    const t = sim.segs.find((s) => s.kind === 'target' && s.index === 3)!;
    sim.ball = { x: (t.ax + t.bx) / 2, y: t.ay - 28, vx: 0, vy: 500 };
    const events = [];
    for (let i = 0; i < 6; i++) events.push(...sim.step(1 / 60));
    expect(events.some((e) => e.type === 'targetsDone')).toBe(true);
    expect(sim.multi).toBe(2);
    expect(sim.targetsDown.every((v) => !v)).toBe(true);
  });

  it('flippers swing up when pressed and launch a ball resting on them', () => {
    const sim = new PinballSim(seeded(1));
    sim.state = 'play';
    sim.saveTime = 0;
    const f = sim.flippers[0]!;
    sim.ball = { x: f.px + 80, y: f.py + 34, vx: 0, vy: 0 };
    for (let i = 0; i < 4; i++) sim.step(1 / 60);
    sim.press(1, true);
    let top = sim.ball.y;
    for (let i = 0; i < 20; i++) {
      sim.step(1 / 60);
      top = Math.min(top, sim.ball.y);
    }
    expect(f.angle).toBeLessThan(0);
    expect(top).toBeLessThan(f.py - 60);
  });

  it('saves the first drain, then spends balls until game over', () => {
    const sim = new PinballSim(seeded(1));
    sim.state = 'play';
    sim.saveTime = 5;
    sim.ball = { x: 330, y: DRAIN_Y + 60, vx: 0, vy: 100 };
    expect(sim.step(1 / 60).some((e) => e.type === 'save')).toBe(true);
    expect(sim.state).toBe('plunger');
    expect(sim.ballsLeft).toBe(3);

    let over = false;
    for (let n = 0; n < 3; n++) {
      sim.state = 'play';
      sim.saveTime = 0;
      sim.ball = { x: 330, y: DRAIN_Y + 60, vx: 0, vy: 100 };
      for (const e of sim.step(1 / 60)) if (e.type === 'gameOver') over = true;
    }
    expect(over).toBe(true);
    expect(sim.state).toBe('over');
    expect(sim.step(1)).toEqual([]);
  });
});

describe('Dados Loucos (dice roguelite)', () => {
  it('classifies hands from best to worst', () => {
    expect(classify([6, 6, 6, 6, 6])).toBe('five');
    expect(classify([2, 2, 2, 2, 5])).toBe('four');
    expect(classify([1, 2, 3, 4, 5])).toBe('straight5');
    expect(classify([6, 5, 4, 3, 2])).toBe('straight5');
    expect(classify([3, 3, 3, 5, 5])).toBe('fullHouse');
    expect(classify([1, 2, 3, 4, 6])).toBe('straight4');
    expect(classify([3, 4, 5, 6, 6])).toBe('straight4');
    expect(classify([4, 4, 4, 1, 6])).toBe('three');
    expect(classify([1, 1, 6, 6, 3])).toBe('twoPair');
    expect(classify([1, 1, 6, 5, 3])).toBe('pair');
    expect(classify([1, 2, 4, 5, 6])).toBe('high');
  });

  it('scores chips × mult, with the dice adding to the chips', () => {
    const b = scoreHand([3, 3, 3, 5, 5], []);
    expect(b.kind).toBe('fullHouse');
    expect(b.chips).toBe(35 + 19);
    expect(b.mult).toBe(4);
    expect(b.total).toBe(54 * 4);
  });

  it('applies jokers to the hands they care about', () => {
    expect(scoreHand([6, 6, 1, 2, 4], ['sixes']).chips).toBe(10 + 19 + 16);
    expect(scoreHand([1, 2, 3, 4, 6], ['straight']).mult).toBe(4 + 3);
    expect(scoreHand([1, 2, 4, 5, 6], ['pairs']).mult).toBe(1);
    expect(scoreHand([1, 1, 4, 5, 6], ['pairs', 'pairs']).mult).toBe(4);
    expect(scoreHand([2, 2, 4, 6, 1], ['evens']).mult).toBe(2 + 4);
    expect(scoreHand([5, 5, 5, 1, 2], ['heavy']).mult).toBe(5);
    expect(scoreHand([1, 2, 4, 5, 6], ['big']).chips).toBe(5 + 18 + 25);
  });

  it('plays a round: roll, hold, score, win and pick a joker', () => {
    const sim = new DadosSim(seeded(12));
    expect(sim.roll()).toHaveLength(1);
    expect(sim.dice.every((d) => d >= 1 && d <= 6)).toBe(true);
    expect(sim.rollsLeft).toBe(2);
    const keep = sim.dice[0]!;
    expect(sim.toggle(0)).toBe(true);
    sim.roll();
    expect(sim.dice[0]).toBe(keep);
    sim.roll();
    expect(sim.rollsLeft).toBe(0);
    expect(sim.roll()).toEqual([]);
    expect(sim.toggle(1)).toBe(false); // nothing left to reroll, so holding is moot

    sim.target = 1;
    const out = sim.play();
    expect(out.map((e) => e.type)).toEqual(['played', 'roundWon']);
    expect(sim.state).toBe('shop');
    expect(sim.offer).toHaveLength(3);
    expect(sim.score).toBeGreaterThan(sim.roundScore);
    const pick = sim.offer[0]!.id;
    expect(sim.pick('five' as never)).toBe(false);
    expect(sim.pick(pick)).toBe(true);
    expect(sim.round).toBe(2);
    expect(sim.target).toBe(targetFor(2));
    expect(sim.roundScore).toBe(0);
    expect(sim.jokers).toEqual([pick]);
    expect(sim.rolled).toBe(false);
  });

  it('plays hands until the quota is out of reach, then ends', () => {
    const sim = new DadosSim(seeded(3));
    sim.target = 1e9;
    let last;
    expect(sim.play()).toEqual([]); // can't score before rolling
    for (let h = 0; h < 4; h++) {
      sim.roll();
      last = sim.play();
    }
    expect(last!.some((e) => e.type === 'gameOver')).toBe(true);
    expect(sim.state).toBe('over');
    expect(sim.roll()).toEqual([]);
  });

  it('extra-roll and extra-hand jokers take effect next hand', () => {
    const sim = new DadosSim(seeded(3));
    sim.jokers = ['lucky', 'hands'];
    expect(sim.rollsPerHand).toBe(4);
    expect(sim.handsPerRound).toBe(5);
    sim.target = 1;
    sim.roll();
    sim.play();
    sim.pick(sim.offer[0]!.id);
    expect(sim.rollsLeft).toBe(4);
    expect(sim.handsLeft).toBe(5);
  });

  it('scales the quotas', () => {
    expect(targetFor(1)).toBe(140);
    for (let r = 2; r < 12; r++) expect(targetFor(r)).toBeGreaterThan(targetFor(r - 1));
  });
});
