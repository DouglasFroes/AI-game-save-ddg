import { describe, expect, it } from 'vitest';
import { seeded } from '@/platform/rnd';
import {
  diveSpot,
  flightTime,
  keeperAfter,
  KEEPER_HOME,
  outcome,
  Shootout,
  shotFromSwipe,
  STAGES,
  type Point,
} from '@/games/penalti/core';

const swipe = (pts: Array<[number, number]>, ms: number): Point[] =>
  pts.map(([x, y], i) => ({ x, y, t: (ms * i) / (pts.length - 1) }));

describe('pênalti: o chute', () => {
  it('turns a swipe into aim, height, power and curve', () => {
    const straight = shotFromSwipe(
      swipe(
        [
          [360, 1100],
          [360, 900],
          [360, 700],
        ],
        200,
      ),
    )!;
    expect(Math.abs(straight.u)).toBeLessThan(0.05);
    expect(straight.v).toBeGreaterThan(0.6);
    expect(Math.abs(straight.curve)).toBeLessThan(0.05);
    const right = shotFromSwipe(
      swipe(
        [
          [360, 1100],
          [420, 950],
          [480, 800],
        ],
        200,
      ),
    )!;
    expect(right.u).toBeGreaterThan(0.5);
    const slow = shotFromSwipe(
      swipe(
        [
          [360, 1100],
          [360, 900],
          [360, 700],
        ],
        900,
      ),
    )!;
    expect(slow.power).toBeLessThan(straight.power);
    const bent = shotFromSwipe(
      swipe(
        [
          [360, 1100],
          [440, 900],
          [360, 700],
        ],
        200,
      ),
    )!;
    expect(Math.abs(bent.curve)).toBeGreaterThan(0.3);
    expect(
      shotFromSwipe(
        swipe(
          [
            [360, 1100],
            [360, 1150],
          ],
          200,
        ),
      ),
    ).toBeNull(); // backwards
  });

  it('decides goal, save, post and wide', () => {
    const at = (u: number, v: number, power = 0.5) => ({ u, v, power, curve: 0 });
    expect(outcome(at(0, 0.5), KEEPER_HOME)).toBe('defesa');
    expect(outcome(at(0.85, 0.85), KEEPER_HOME)).toBe('gol');
    expect(outcome(at(1.0, 0.5), KEEPER_HOME)).toBe('trave');
    expect(outcome(at(0.5, 1.2), KEEPER_HOME)).toBe('fora');
    // A keeper who guessed the corner still can't reach a rocket in the top corner.
    expect(outcome(at(0.9, 0.9, 1), diveSpot(0.9, 0.9))).toBe('gol');
    expect(outcome(at(0.5, 0.3, 0.2), diveSpot(0.5, 0.3))).toBe('defesa');
  });

  it('the keeper only covers what his speed allows; harder shots arrive sooner', () => {
    const late = keeperAfter({ u: 0.66, v: 0.3 }, 0.05);
    const early = keeperAfter({ u: 0.66, v: 0.3 }, 1);
    expect(late.u).toBeLessThan(early.u);
    expect(early.u).toBeCloseTo(0.66);
    expect(flightTime(1)).toBeLessThan(flightTime(0));
  });
});

describe('pênalti: a disputa', () => {
  it('alternates kicks and ends early when it is decided', () => {
    const s = new Shootout(seeded(1));
    expect(s.turn).toBe('shoot');
    s.mine = [true, true, true];
    s.theirs = [false, false, false];
    expect(s.winner()).toBe('me'); // 3–0 with two each to go
    s.mine = [true, true, true, true, true];
    s.theirs = [true, true, true, true, true];
    expect(s.winner()).toBeNull();
    s.mine.push(true);
    expect(s.winner()).toBeNull(); // sudden death: they still kick
    s.theirs.push(false);
    expect(s.winner()).toBe('me');
  });

  it('winning a shootout moves on to the next round; winning the final is the cup', () => {
    const s = new Shootout(seeded(2));
    for (let stage = 0; stage < STAGES.length; stage++) {
      s.mine = [true, true, true];
      s.theirs = [false, false, false];
      s.finishShootout();
    }
    expect(s.champion).toBe(true);
    expect(s.over).toBe(true);
    expect(s.cups).toBe(STAGES.length);
    const lost = new Shootout(seeded(3));
    lost.mine = [false, false, false];
    lost.theirs = [true, true, true];
    lost.finishShootout();
    expect(lost.over).toBe(true);
    expect(lost.champion).toBe(false);
  });

  it('scores goals and saves; diving early lets the shooter switch sides', () => {
    const s = new Shootout(seeded(4));
    let goals = 0;
    for (let i = 0; i < 200; i++) {
      const k = s.shoot({ u: 0.85, v: 0.8, power: 0.6, curve: 0.5 });
      if (k.outcome === 'gol') goals++;
    }
    expect(goals).toBeGreaterThan(100); // good corners mostly go in
    const saver = new Shootout(seeded(5));
    let earlySaves = 0;
    let lateSaves = 0;
    for (let i = 0; i < 300; i++) {
      const shot = { u: 0.5, v: 0.4, power: 0.5, curve: 0 };
      if (saver.save(shot, { u: 0.5, v: 0.4 }, -0.3).outcome === 'defesa') earlySaves++;
      if (saver.save(shot, { u: 0.5, v: 0.4 }, 0.05).outcome === 'defesa') lateSaves++;
    }
    expect(lateSaves).toBeGreaterThan(earlySaves);
    expect(saver.saves).toBe(earlySaves + lateSaves);
  });
});

import {
  AREA,
  BALL_R,
  GolfSim,
  HOLES,
  holeScore,
  MAX_STROKES,
  moverAt,
  type Hole,
} from '@/games/golfe/core';

describe('mini golfe', () => {
  const open = (extra: Partial<Hole> = {}): Hole => ({
    par: 3,
    tee: { x: 360, y: 1100 },
    cup: { x: 360, y: 300 },
    walls: [],
    ...extra,
  });
  const roll = (sim: GolfSim, seconds = 12) => {
    const events: string[] = [];
    for (let i = 0; i < seconds * 60 && (sim.moving || i === 0); i++)
      events.push(...sim.step(1 / 60));
    return events;
  };

  it('every hole fits the area and has its tee and cup on open ground', () => {
    expect(HOLES).toHaveLength(9);
    const inside = (p: { x: number; y: number }) =>
      p.x > AREA.x && p.x < AREA.x + AREA.w && p.y > AREA.y && p.y < AREA.y + AREA.h;
    for (const h of HOLES) {
      expect(inside(h.tee)).toBe(true);
      expect(inside(h.cup)).toBe(true);
      for (const w of [...h.walls, ...(h.water ?? [])])
        for (const p of [h.tee, h.cup])
          expect(p.x >= w.x && p.x <= w.x + w.w && p.y >= w.y && p.y <= w.y + w.h).toBe(false);
    }
  });

  it('a putt rolls, slows down with friction and stops', () => {
    const sim = new GolfSim([open()]);
    expect(sim.putt(0, 100)).toBe(true); // pull down → goes up
    expect(sim.vy).toBeLessThan(0);
    expect(sim.putt(0, 100)).toBe(false); // not while it moves
    roll(sim);
    expect(sim.moving).toBe(false);
    expect(sim.y).toBeLessThan(1100);
  });

  it('a gentle putt at the cup drops; a rocket lips out', () => {
    const sim = new GolfSim([open({ tee: { x: 360, y: 700 } })]);
    sim.putt(0, 90);
    expect(roll(sim)).toContain('sink');
    expect(sim.sunk).toBe(true);
    const fast = new GolfSim([open({ tee: { x: 360, y: 340 } })]);
    fast.putt(0, 400);
    const ev = roll(fast, 0.15);
    expect(ev).toContain('lip');
    expect(fast.sunk).toBe(false);
  });

  it('bounces off walls and the border, never leaving the area', () => {
    const sim = new GolfSim([open({ walls: [{ x: 200, y: 700, w: 320, h: 40 }] })]);
    sim.putt(0, 260);
    const ev = roll(sim);
    expect(ev).toContain('wall');
    expect(sim.y).toBeGreaterThan(740); // stayed below the wall
    for (const s of [new GolfSim([open()])]) {
      s.putt(-200, 150);
      roll(s);
      expect(s.x).toBeGreaterThanOrEqual(AREA.x + BALL_R - 0.01);
      expect(s.x).toBeLessThanOrEqual(AREA.x + AREA.w - BALL_R + 0.01);
    }
  });

  it('water costs a stroke and puts the ball back; sand slows it', () => {
    const sim = new GolfSim([open({ water: [{ x: 40, y: 600, w: 640, h: 80 }] })]);
    sim.putt(0, 200);
    expect(roll(sim)).toContain('water');
    expect(sim.strokes).toBe(2);
    expect(sim.y).toBe(1100);
    const free = new GolfSim([open()]);
    const sandy = new GolfSim([open({ sand: [{ x: 40, y: 200, w: 640, h: 1020 }] })]);
    free.putt(0, 120);
    sandy.putt(0, 120);
    roll(free);
    expect(roll(sandy)).toContain('sand');
    expect(sandy.y).toBeGreaterThan(free.y);
  });

  it('slopes push the ball; movers move', () => {
    const sim = new GolfSim([
      open({ slopes: [{ x: 40, y: 200, w: 640, h: 1020, ax: 300, ay: 0 }] }),
    ]);
    sim.putt(0, 120);
    roll(sim);
    expect(sim.x).toBeGreaterThan(380);
    const m = { x: 300, y: 500, w: 80, h: 40, axis: 'x' as const, range: 100, period: 2 };
    expect(moverAt(m, 0).x).toBe(300);
    expect(moverAt(m, 0.5).x).toBeCloseTo(400);
  });

  it('scores holes by par and cards them; the stroke limit ends a hole', () => {
    expect(holeScore(1, 3)).toEqual({ points: 800, name: 'Hole in one!' });
    expect(holeScore(2, 3).name).toBe('Birdie!');
    expect(holeScore(3, 3)).toEqual({ points: 300, name: 'Par' });
    expect(holeScore(4, 3).name).toBe('Bogey');
    expect(holeScore(8, 3).points).toBe(0);
    const sim = new GolfSim([open(), open()]);
    sim.strokes = MAX_STROKES;
    expect(sim.putt(0, 100)).toBe(false);
    sim.nextHole();
    expect(sim.cards).toEqual([MAX_STROKES]);
    expect(sim.hole).toBe(1);
    expect(sim.strokes).toBe(0);
  });
});

describe('mini golfe: todos os buracos têm solução', () => {
  it('a simple search sinks every hole within the stroke limit', () => {
    for (const [i, hole] of HOLES.entries()) {
      let pos = { ...hole.tee };
      let time = 0;
      let sunk = false;
      for (let stroke = 0; stroke < MAX_STROKES - 1 && !sunk; stroke++) {
        let best: { d: number; x: number; y: number; t: number; sunk: boolean } | null = null;
        for (let a = 0; a < 360; a += 4) {
          for (const pull of [40, 70, 100, 140, 190, 260]) {
            const s = new GolfSim([hole]);
            s.x = pos.x;
            s.y = pos.y;
            s.time = time;
            const rad = (a * Math.PI) / 180;
            s.putt(Math.cos(rad) * pull, Math.sin(rad) * pull);
            for (let k = 0; k < 20 * 60 && s.moving; k++) s.step(1 / 60);
            const d = s.sunk
              ? -1
              : Math.hypot(s.x - hole.cup.x, s.y - hole.cup.y) + (s.strokes > 1 ? 400 : 0);
            if (!best || d < best.d) best = { d, x: s.x, y: s.y, t: s.time, sunk: s.sunk };
          }
        }
        sunk = best!.sunk;
        pos = { x: best!.x, y: best!.y };
        time = best!.t;
      }
      expect(sunk, `buraco ${i + 1}`).toBe(true);
    }
  }, 120_000);
});

import {
  aimAt,
  heightAtNet,
  inCourt,
  LENGTH,
  NET_H,
  NET_Y,
  RIVALS,
  swingFromSwipe,
  TennisSim,
} from '@/games/tenis/core';

describe('tênis', () => {
  it('aims a ball to land exactly where asked, and reads swipes', () => {
    const b = aimAt({ x: 0, y: 0, z: 1, vx: 0, vy: 0, vz: 0 }, 2, 20, 20);
    const t = 20 / b.vy;
    expect(b.x + b.vx * t).toBeCloseTo(2);
    expect(b.z + b.vz * t - 0.5 * 9.8 * t * t).toBeCloseTo(0);
    expect(heightAtNet(b)!).toBeGreaterThan(0);
    const s = swingFromSwipe(80, -300, 150)!;
    expect(s.aim).toBeGreaterThan(0.3);
    expect(swingFromSwipe(0, 50, 100)).toBeNull();
    expect(swingFromSwipe(0, -500, 100)!.pace).toBeGreaterThan(swingFromSwipe(0, -500, 600)!.pace);
  });

  it('knows the court and the service box', () => {
    expect(inCourt(0, 20, 'them')).toBe(true);
    expect(inCourt(0, 25, 'them')).toBe(false);
    expect(inCourt(5, 20, 'them')).toBe(false);
    expect(inCourt(0, 20, 'them', true)).toBe(false); // past the service line
    expect(inCourt(0, NET_Y + 3, 'them', true)).toBe(true);
    expect(inCourt(0, 3, 'me')).toBe(true);
  });

  it('serve order follows the tie-break: 1, then 2 each', () => {
    const s = new TennisSim();
    expect([0, 1, 2, 3, 4, 5].map((n) => s.serverFor(n))).toEqual([
      'me',
      'them',
      'them',
      'me',
      'me',
      'them',
    ]);
  });

  it('a net-skimming rocket can find the net; a careful shot clears it', () => {
    const low = aimAt({ x: 0, y: -0.6, z: 0.4, vx: 0, vy: 0, vz: 0 }, 0, 14, 32);
    expect(heightAtNet(low)!).toBeLessThan(NET_H);
    const high = aimAt({ x: 0, y: -0.6, z: 1, vx: 0, vy: 0, vz: 0 }, 0, 20, 16);
    expect(heightAtNet(high)!).toBeGreaterThan(NET_H);
  });

  /** You return every ball you can reach with a safe shot; the rival plays as usual. */
  const playMatch = (seed: number, safe = true) => {
    const s = new TennisSim(seeded(seed));
    s.setupPoint();
    let guard = 0;
    while (!s.over && guard++ < 60 * 60 * 120) {
      if (!s.live && s.serving === 'me') s.serve({ aim: 0, depth: 0.6, pace: 0.3 });
      else if (!s.live && s.serving === 'them') s.rivalServe();
      if (
        safe &&
        s.live &&
        s.lastHit === 'them' &&
        s.inReach('me') &&
        Math.abs(s.timing('me')) < 0.3
      )
        s.swing({ aim: s.them.x > 0 ? -0.6 : 0.6, depth: 0.75, pace: 0.35 });
      for (const e of s.step(1 / 60)) if (e.type === 'point' && !s.over) s.setupPoint();
    }
    return s;
  };

  it('plays full tie-breaks to the end with a consistent score', () => {
    for (const seed of [1, 2, 3]) {
      const s = playMatch(seed);
      expect(s.over).toBe(true);
      expect(s.pointsWon).toBeGreaterThan(0);
      expect(s.score).toBe(s.pointsWon * 100 + s.matchesWon * 1000 + (s.winners + s.aces) * 50);
      expect(s.matchesWon).toBeLessThanOrEqual(RIVALS.length);
    }
  });

  it('never swinging loses the first match quickly', () => {
    const s = playMatch(4, false);
    expect(s.over).toBe(true);
    expect(s.matchesWon).toBe(0);
    expect(s.theirPoints).toBeGreaterThanOrEqual(7);
  });

  it('the ball never goes through the floor', () => {
    const s = new TennisSim(seeded(5));
    s.setupPoint();
    s.serve({ aim: 0.2, depth: 0.5, pace: 0.5 });
    for (let i = 0; i < 300; i++) {
      s.step(1 / 60);
      expect(s.ball.z).toBeGreaterThanOrEqual(-0.5);
      expect(s.ball.y).toBeLessThan(LENGTH + 20);
    }
  });
});

import { BasketSim, hoopAt, launch, MAX_SPEED, START_TIME } from '@/games/basquete/core';

describe('basquete', () => {
  /** Tries pull-backs until one scores from the current spot (returns the events of it). */
  const findBasket = (make: () => BasketSim, swishOnly = false) => {
    for (let a = 200; a <= 300; a += 2)
      for (let len = 120; len <= 300; len += 6) {
        const s = make();
        const rad = (a * Math.PI) / 180;
        s.shoot(Math.cos(rad) * len, -Math.sin(rad) * len);
        const events = [];
        for (let i = 0; i < 400 && s.flying; i++) events.push(...s.step(1 / 120));
        const score = events.find((e) => e.type === 'score');
        if (score && (!swishOnly || (score.type === 'score' && score.swish)))
          return { s, events, score };
      }
    return null;
  };

  it('launch speed grows with the pull, capped', () => {
    expect(launch(5, 5)).toBeNull();
    const a = launch(-100, 100)!;
    expect(a.vx).toBeGreaterThan(0);
    expect(a.vy).toBeLessThan(0);
    const max = launch(-1000, 1000)!;
    expect(Math.hypot(max.vx, max.vy)).toBeCloseTo(MAX_SPEED);
  });

  it('a well aimed shot scores, and a swish is possible from the first spot', () => {
    const make = () => new BasketSim(seeded(1));
    const hit = findBasket(make);
    expect(hit).not.toBeNull();
    expect(hit!.s.baskets).toBe(1);
    const swish = findBasket(make, true);
    expect(swish).not.toBeNull();
    if (swish!.score.type === 'score') expect(swish!.score.points).toBe(swish!.s.isThree ? 4 : 3);
  });

  it('three swishes in a row set you on fire; a miss puts it out', () => {
    const s = new BasketSim(seeded(2));
    s.streak = 2;
    // Drop the ball straight through the hoop.
    const h = s.hoop;
    s.x = h.x;
    s.y = h.y - 200;
    s.vx = 0;
    s.vy = 0;
    s.flying = true;
    const events = [];
    for (let i = 0; i < 2000 && s.flying; i++) events.push(...s.step(1 / 120));
    expect(events.some((e) => e.type === 'score' && e.swish && e.fire)).toBe(true);
    expect(s.fire).toBe(true);
    s.shoot(0, -200); // straight into the floor
    for (let i = 0; i < 1000 && s.flying; i++) s.step(1 / 120);
    expect(s.fire).toBe(false);
    expect(s.streak).toBe(0);
  });

  it('the clock runs out and ends the game; baskets give time back', () => {
    const s = new BasketSim(seeded(3));
    expect(s.clock).toBe(START_TIME);
    let over = false;
    for (let i = 0; i < 61 * 60 && !over; i++) over = s.step(1 / 60).some((e) => e.type === 'over');
    expect(over).toBe(true);
    expect(hoopAt(0, 5)).toEqual(hoopAt(0, 0));
    expect(hoopAt(20, 1)).not.toEqual(hoopAt(20, 0));
  });
});

import {
  BowlingSim,
  frameOf,
  frameScores,
  freshRack,
  gameOver,
  pinSpots,
  rollFromSwipe,
} from '@/games/boliche/core';

describe('boliche: pontuação oficial', () => {
  it('scores perfect, all-spare, open and gutter games', () => {
    expect(frameScores(new Array(12).fill(10)).at(-1)).toBe(300);
    expect(frameScores(new Array(21).fill(5)).at(-1)).toBe(150);
    expect(frameScores(new Array(20).fill(0).map((_, i) => (i % 2 ? 0 : 9))).at(-1)).toBe(90);
    expect(frameScores(new Array(20).fill(0)).at(-1)).toBe(0);
    expect(frameScores([10, 7, 3, 9, 0])).toEqual([20, 39, 48]);
    expect(frameScores([10, 7])).toEqual([null]); // strike waiting for its bonus
  });

  it('knows frames, racks and the end of the game', () => {
    expect(frameOf([])).toEqual({ frame: 0, ball: 0 });
    expect(frameOf([7])).toEqual({ frame: 0, ball: 1 });
    expect(frameOf([10])).toEqual({ frame: 1, ball: 0 });
    expect(freshRack([7])).toBe(false);
    expect(freshRack([7, 2])).toBe(true);
    const nine = new Array(18).fill(4);
    expect(gameOver([...nine, 3, 4])).toBe(true);
    expect(gameOver([...nine, 6, 4])).toBe(false); // spare in the 10th: one more ball
    expect(gameOver([...nine, 6, 4, 5])).toBe(true);
    expect(freshRack([...nine, 10])).toBe(true);
    expect(freshRack([...nine, 10, 7])).toBe(false);
    expect(gameOver([...nine, 10, 10, 10])).toBe(true);
  });
});

describe('boliche: física', () => {
  const play = (x: number, spin: number, angle = 0, speed = 950) => {
    const s = new BowlingSim();
    s.roll({ x, angle, speed, spin });
    const events = [];
    for (let i = 0; i < 60 * 12 && s.ball.rolling; i++) events.push(...s.step(1 / 60));
    return { s, events, knocked: s.rolls[0] ?? 0 };
  };

  it('has ten pins in a triangle inside the lane', () => {
    const spots = pinSpots();
    expect(spots).toHaveLength(10);
    expect(new Set(spots.map((p) => p.y)).size).toBe(4);
  });

  it('a straight ball down the middle knocks pins; a gutter ball knocks none', () => {
    expect(play(360, 0).knocked).toBeGreaterThan(3);
    const gutter = play(260, 0, -0.12, 900);
    expect(gutter.events.some((e) => e.type === 'gutter')).toBe(true);
    expect(gutter.knocked).toBe(0);
  });

  it('a hooking ball into the pocket can strike', () => {
    let best = 0;
    for (let x = 300; x <= 470; x += 10)
      for (const spin of [-1, -0.7, -0.4, 0, 0.4, 0.7, 1])
        best = Math.max(best, play(x, spin).knocked);
    expect(best).toBe(10);
  });

  it('reads a swipe as aim, speed and spin', () => {
    const pts = (xs: number[]) => xs.map((x, i) => ({ x, y: 1100 - i * 100, t: i * 60 }));
    const straight = rollFromSwipe(360, pts([360, 360, 360, 360]))!;
    expect(Math.abs(straight.angle)).toBeLessThan(0.01);
    expect(Math.abs(straight.spin)).toBeLessThan(0.05);
    const hook = rollFromSwipe(360, pts([360, 420, 420, 360]))!;
    expect(Math.abs(hook.spin)).toBeGreaterThan(0.3);
    expect(
      rollFromSwipe(
        360,
        pts([360, 360]).map((p, i) => ({ ...p, y: 1100 + i * 50 })),
      ),
    ).toBeNull();
  });
});

import {
  advance,
  BUTTON,
  CurlingSim,
  distToButton,
  endScore,
  ENDS,
  evaluate,
  HACK,
  HOG_Y,
  simulate,
  STONES_EACH,
  stopY,
  throwFromPull,
  type Stone,
} from '@/games/curling/core';

describe('curling', () => {
  const drawSpeed = Math.sqrt(2 * 150 * (HACK.y - BUTTON.y));
  const restOf = (t: { angle: number; speed: number; curl: -1 | 1 }, sweep = 0) => {
    const stones: Stone[] = [
      {
        id: 1,
        team: 'me',
        x: HACK.x,
        y: HACK.y,
        vx: Math.sin(t.angle) * t.speed,
        vy: -Math.cos(t.angle) * t.speed,
        curl: t.curl,
      },
    ];
    for (let i = 0; i < 2000 && (stones[0]!.vx || stones[0]!.vy); i++)
      advance(stones, 1 / 120, sweep, 1);
    return stones[0]!;
  };

  it('a draw-weight stone stops near the button; the turn makes it curl that way', () => {
    expect(stopY(drawSpeed)).toBeCloseTo(BUTTON.y, 0);
    const right = restOf({ angle: 0, speed: drawSpeed, curl: 1 });
    const left = restOf({ angle: 0, speed: drawSpeed, curl: -1 });
    expect(right.x).toBeGreaterThan(HACK.x + 20);
    expect(left.x).toBeLessThan(HACK.x - 20);
    expect(Math.abs(right.y - BUTTON.y)).toBeLessThan(60);
  });

  it('sweeping carries the stone farther', () => {
    const plain = restOf({ angle: 0, speed: drawSpeed, curl: 1 });
    const swept = restOf({ angle: 0, speed: drawSpeed, curl: 1 }, 1);
    expect(swept.y).toBeLessThan(plain.y - 50);
  });

  it('reads a pull-back as aim and weight', () => {
    expect(throwFromPull(0, 10, 1)).toBeNull();
    const soft = throwFromPull(0, 100, 1)!;
    const hard = throwFromPull(0, 300, 1)!;
    expect(hard.speed).toBeGreaterThan(soft.speed);
    expect(throwFromPull(-60, 200, 1)!.angle).toBeGreaterThan(0); // pull left → goes right
  });

  it('scores only the closest team, one per stone better than the other best', () => {
    const st = (team: 'me' | 'them', dx: number): Stone => ({
      id: Math.random(),
      team,
      x: BUTTON.x + dx,
      y: BUTTON.y,
      vx: 0,
      vy: 0,
      curl: 1,
    });
    expect(endScore([st('me', 10), st('me', 40), st('them', 60), st('me', 90)])).toEqual({
      team: 'me',
      points: 2,
    });
    expect(endScore([st('them', 5), st('me', 30)])).toEqual({ team: 'them', points: 1 });
    expect(endScore([st('me', 400)])).toBeNull();
    expect(evaluate([st('me', 10)], 'me')).toBeGreaterThan(evaluate([st('me', 10)], 'them'));
  });

  it('stones knock each other; short stones are removed at the hog line', () => {
    const target: Stone = { id: 5, team: 'them', x: BUTTON.x, y: BUTTON.y, vx: 0, vy: 0, curl: 1 };
    const after = simulate([target], 'me', { angle: 0, speed: 1000, curl: 1 });
    const moved = after.find((s) => s.id === 5);
    expect(!moved || distToButton(moved) > 40).toBe(true);
    const short = simulate([], 'me', { angle: 0, speed: 300, curl: 1 });
    expect(short.length).toBe(0); // never reached the hog line
    expect(stopY(300)).toBeGreaterThan(HOG_Y);
  });

  it('plays a full match: turns alternate, ends close, the computer plans sensible shots', () => {
    const sim = new CurlingSim(seeded(9));
    expect(sim.turn).toBe('them'); // you have the hammer in the first end
    let ends = 0;
    for (let guard = 0; guard < 200 && !sim.over; guard++) {
      const t =
        sim.turn === 'them' ? sim.plan() : { angle: 0.02, speed: drawSpeed, curl: -1 as const };
      sim.throwStone(t);
      const events = [];
      for (let i = 0; i < 60 * 30 && sim.inMotion; i++) events.push(...sim.step(1 / 60));
      if (events.some((e) => e.type === 'end')) {
        ends++;
        sim.nextEnd();
      }
    }
    expect(sim.over).toBe(true);
    expect(ends).toBe(ENDS);
    expect(sim.scores.me).toHaveLength(ENDS);
    expect(sim.thrownMe).toBe(0);
    expect(STONES_EACH).toBe(4);
    expect(sim.total.them).toBeGreaterThanOrEqual(0);
  });
});

import { LENGTH as PIPE_L, LIP_Y, rampAt, SkateSim, slopeAt, TRICKS } from '@/games/skate/core';

describe('skate na rampa', () => {
  it('the ramp is continuous: lips up high, flat at the bottom', () => {
    for (let s = 0; s < PIPE_L; s += 5) {
      const a = rampAt(s);
      const b = rampAt(s + 5);
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(5.5);
    }
    expect(rampAt(0).y).toBeCloseTo(LIP_Y);
    expect(rampAt(PIPE_L).y).toBeCloseTo(LIP_Y);
    expect(slopeAt(10)).toBeLessThan(-0.9); // left wall: going right goes down
    expect(slopeAt(PIPE_L - 10)).toBeGreaterThan(0.9);
    expect(slopeAt(PIPE_L / 2)).toBe(0);
  });

  /** Pumps whenever it is the right moment: speed builds up until he flies. */
  const pumpBot = (sim: SkateSim, seconds: number, trick?: (s: SkateSim) => void) => {
    const events = [];
    for (let i = 0; i < seconds * 60 && !sim.over; i++) {
      if (!sim.air && sim.pumpWindow && Math.abs(slopeAt(sim.s)) < 0.6) sim.pump();
      if (sim.air && trick) trick(sim);
      events.push(...sim.step(1 / 60));
    }
    return events;
  };

  it('pumping on the way down builds speed until he gets air; a bad pump brakes', () => {
    const sim = new SkateSim();
    const events = pumpBot(sim, 20);
    expect(events.some((e) => e.type === 'air')).toBe(true);
    expect(events.some((e) => e.type === 'land')).toBe(true);
    const lazy = new SkateSim();
    const v = Math.abs(lazy.v);
    lazy.s = PIPE_L / 2;
    expect(lazy.pump()).toEqual({ type: 'pump', good: false }); // flat: not going down
    expect(Math.abs(lazy.v)).toBeLessThan(v);
  });

  it('tricks finished in the air score (more with variety); unfinished ones are a fall', () => {
    const clean = new SkateSim();
    const ev = pumpBot(clean, 40, (s) => {
      // Right after take-off on a big air: two tricks that fit in the flight.
      const a = s.air!;
      if (a.vy > 600 && a.h < 30 && !s.doing && !s.queue.length && !s.combo.length) {
        s.trick('kickflip');
        s.trick('spinL');
      }
    });
    const land = ev.find((e) => e.type === 'land' && e.tricks.includes('Kickflip'));
    expect(land).toBeDefined();
    if (land?.type === 'land')
      expect(land.points).toBeGreaterThan(TRICKS.kickflip.points + TRICKS.spinL.points);
    const greedy = new SkateSim();
    const ev2 = pumpBot(greedy, 40, (s) => {
      while (s.trick('grab'));
    });
    expect(ev2.some((e) => e.type === 'bail')).toBe(true);
    expect(greedy.lives).toBeLessThan(3);
  });

  it('the session ends after three falls or when time runs out', () => {
    const s = new SkateSim();
    s.lives = 1;
    s.air = { side: 'L', h: 1, vy: -10, peak: 50 };
    s.doing = { kind: 'grab', t: 0 };
    const ev = s.step(1 / 30);
    expect(ev.map((e) => e.type)).toEqual(['bail', 'over']);
    const t = new SkateSim();
    const ev2 = pumpBot(t, 120);
    expect(ev2.at(-1)!.type).toBe('over');
    expect(t.clock).toBe(0);
  });
});

import {
  ANSWER,
  BoxSim,
  lands,
  MY_HP,
  RIVALS as BOXERS,
  ROUNDS,
  type BoxEvent,
} from '@/games/boxe/core';

describe('boxe', () => {
  it('jabs only land where the guard is open', () => {
    expect(lands('aberta', 'L')).toBe(true);
    expect(lands('alta', 'R')).toBe(false);
    expect(lands('esquerda', 'R')).toBe(true);
    expect(lands('esquerda', 'L')).toBe(false);
  });

  /** Runs until his punch is wound up; returns its kind. */
  const untilWindup = (s: BoxSim) => {
    for (let i = 0; i < 600; i++) {
      const ev = s.step(1 / 60).find((e) => e.type === 'windup');
      if (ev && ev.type === 'windup') return ev.kind;
    }
    throw new Error('no attack');
  };

  it('the right dodge leaves him open for a double-damage counter; the wrong one hurts', () => {
    const s = new BoxSim(seeded(1));
    const kind = untilWindup(s);
    while (s.attack && s.attack.t < s.attack.wind - 0.1) s.step(1 / 60);
    s.slip(ANSWER[kind]);
    const events: BoxEvent[] = [];
    for (let i = 0; i < 90 && !events.some((e) => e.type === 'dodged'); i++)
      events.push(...s.step(1 / 60));
    expect(events.some((e) => e.type === 'dodged')).toBe(true);
    expect(s.exposed).toBeGreaterThan(0);
    const hit = s.punch('L').find((e) => e.type === 'hit');
    expect(hit && hit.type === 'hit' && hit.counter && hit.damage >= 12).toBe(true);

    const t = new BoxSim(seeded(2));
    const k2 = untilWindup(t);
    while (t.attack && t.attack.t < t.attack.wind - 0.1) t.step(1 / 60);
    t.slip(ANSWER[k2] === 'left' ? 'right' : 'left');
    const ev2 = [];
    for (let i = 0; i < 90; i++) ev2.push(...t.step(1 / 60));
    expect(ev2.some((e) => e.type === 'hurt')).toBe(true);
    expect(t.myHp).toBeLessThan(MY_HP);
  });

  it('a closed guard blocks and punching costs stamina until you tire', () => {
    const s = new BoxSim(seeded(3));
    s.guard = 'alta';
    expect(s.punch('R')).toEqual([{ type: 'blocked', side: 'R' }]);
    let tired = false;
    for (let i = 0; i < 20 && !tired; i++) {
      s.step(0.25);
      s.guard = 'aberta';
      tired = s.punch('L').some((e) => e.type === 'tired');
      s.punch('L');
      s.punch('R');
    }
    expect(s.stamina).toBeLessThan(100);
  });

  it('a knockout moves on to the next boxer; three rounds without one go to the judges', () => {
    const s = new BoxSim(seeded(4));
    s.hp = 1;
    s.guard = 'aberta';
    const ev = s.punch('L');
    expect(ev.some((e) => e.type === 'ko' && e.winner === 'me')).toBe(true);
    s.nextRival();
    expect(s.rival).toBe(1);
    expect(s.hp).toBe(BOXERS[1].hp);
    const d = new BoxSim(seeded(5));
    d.dealt = 50;
    d.taken = 10;
    d.round = ROUNDS;
    d.clock = 0.01;
    const end = d.step(0.05);
    expect(end.some((e) => e.type === 'decision' && e.winner === 'me')).toBe(true);
  });

  it('a boxer who reads every punch and counters beats the whole ladder', () => {
    const s = new BoxSim(seeded(6));
    for (let i = 0; i < 60 * 60 * 20 && !s.over; i++) {
      if (s.attack && !s.attack.feint && s.attack.t > s.attack.wind - 0.15)
        s.slip(ANSWER[s.attack.kind]);
      const punches = s.exposed > 0 ? s.punch(i % 2 ? 'L' : 'R') : [];
      for (const e of [...punches, ...s.step(1 / 60)]) {
        if (e.type === 'round') s.nextRound();
        if ((e.type === 'ko' || e.type === 'decision') && e.winner === 'me' && !s.over)
          s.nextRival();
      }
    }
    expect(s.over).toBe(true);
    expect(s.kos).toBeGreaterThanOrEqual(3);
    expect(s.score).toBeGreaterThan(5000);
  });

  it('standing still loses the first fight', () => {
    const s = new BoxSim(seeded(7));
    const events = [];
    for (let i = 0; i < 60 * 60 * 5 && !s.over; i++) {
      for (const e of s.step(1 / 60)) {
        events.push(e);
        if (e.type === 'round') s.nextRound();
      }
    }
    expect(s.over).toBe(true);
    expect(s.kos).toBe(0);
  });
});

import { BikeSim, heightAt, RACE_M, slopeAt as roadSlope } from '@/games/ciclismo/core';

describe('ciclismo', () => {
  it('the road is smooth and has a real climb', () => {
    let maxH = -Infinity;
    for (let x = 0; x < RACE_M; x += 2) {
      expect(Math.abs(heightAt(x + 2) - heightAt(x))).toBeLessThan(1);
      maxH = Math.max(maxH, heightAt(x));
    }
    expect(maxH - heightAt(0)).toBeGreaterThan(10);
  });

  it('pedalling is faster but burns energy; coasting recovers it', () => {
    const a = new BikeSim(1, seeded(1));
    const b = new BikeSim(1, seeded(1));
    for (let i = 0; i < 300; i++) {
      a.step(1 / 60, true);
      b.step(1 / 60, false);
    }
    expect(a.me.x).toBeGreaterThan(b.me.x);
    expect(a.me.energy).toBeLessThan(100);
    const e = a.me.energy;
    for (let i = 0; i < 60; i++) a.step(1 / 60, false);
    expect(a.me.energy).toBeGreaterThan(e);
  });

  it('riding right behind someone is drafting; an empty tank is a bonk', () => {
    const s = new BikeSim(2, seeded(2));
    s.riders[1]!.x = s.me.x + 1.5;
    const ev = s.step(1 / 60, false);
    expect(s.me.drafting).toBe(true);
    expect(ev.some((e) => e.type === 'draft' && e.on)).toBe(true);
    s.me.energy = 0.01;
    let bonk = false;
    for (let i = 0; i < 60 && !bonk; i++)
      bonk = s.step(1 / 60, true).some((e) => e.type === 'bonk');
    expect(bonk).toBe(true);
  });

  it('a sensible race — pedal, coast downhill, save energy, sprint — gets on the podium; full gas bonks', () => {
    const race = (seed: number, smart: boolean) => {
      const s = new BikeSim(seed, seeded(seed));
      const events = [];
      for (let i = 0; i < 60 * 600 && !s.over; i++) {
        const m = s.me;
        const slope = roadSlope(m.x, seed);
        const hold =
          !smart || s.inSprint || (!m.bonked && slope > -0.03 && (m.energy > 30 || slope > 0.03));
        events.push(...s.step(1 / 60, hold));
      }
      return { s, events, over: events.find((e) => e.type === 'over') };
    };
    let podiums = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = race(seed, true);
      expect(r.over).toBeDefined();
      if (r.over?.type === 'over' && r.over.place <= 3) podiums++;
      expect(r.events.some((e) => e.type === 'sprint')).toBe(true);
    }
    expect(podiums).toBeGreaterThanOrEqual(4);
    const greedy = race(1, false);
    expect(greedy.events.some((e) => e.type === 'bonk')).toBe(true);
    expect(greedy.over?.type === 'over' && greedy.over.place).toBe(4);
    const s = greedy.s;
    expect(s.score(1, 100)).toBeGreaterThan(s.score(4, 100));
  });
});

import { GATES, makeCourse, SkiSim } from '@/games/esqui/core';

describe('slalom', () => {
  const run = (seed: number, steerToGates: boolean) => {
    const s = new SkiSim(seeded(seed));
    const events = [];
    for (let i = 0; i < 60 * 180 && !s.done; i++) {
      const g = s.nextGate;
      if (steerToGates && g) s.steer(Math.atan2(g.x - s.x, Math.max(60, g.y - s.y)) * 1.15);
      else if (steerToGates) s.steer(0);
      events.push(...s.step(1 / 60));
    }
    return { s, events };
  };

  it('builds a course of alternating gates with trees around it', () => {
    const c = makeCourse(seeded(1));
    expect(c.gates).toHaveLength(GATES);
    expect(c.gates[0]!.color).not.toBe(c.gates[1]!.color);
    for (let i = 1; i < c.gates.length; i++)
      expect(c.gates[i]!.y).toBeGreaterThan(c.gates[i - 1]!.y + 250);
    expect(c.trees.length).toBeGreaterThan(20);
    expect(c.finishY).toBeGreaterThan(c.gates.at(-1)!.y);
  });

  it('straight down is fast, carving across slows down', () => {
    const a = new SkiSim(seeded(2));
    const b = new SkiSim(seeded(2));
    a.steer(0);
    b.steer(1.3);
    for (let i = 0; i < 60; i++) {
      a.step(1 / 60);
      b.step(1 / 60);
    }
    expect(a.v).toBeGreaterThan(b.v);
  });

  it('a skier who aims at each gate passes nearly all of them and finishes in good time', () => {
    for (const seed of [1, 2, 3]) {
      const { s, events } = run(seed, true);
      expect(s.done).toBe(true);
      expect(s.passed).toBeGreaterThanOrEqual(GATES - 3);
      expect(events.at(-1)!.type).toBe('finish');
      expect(s.total).toBeLessThan(80);
      expect(s.score).toBeGreaterThan(3000);
    }
  });

  it('going straight misses gates and pays for them', () => {
    const { s } = run(4, false);
    expect(s.done).toBe(true);
    expect(s.missed).toBeGreaterThan(5);
    expect(s.total).toBeGreaterThan(s.time);
  });
});
