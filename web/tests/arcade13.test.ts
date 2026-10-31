import { describe, expect, it } from 'vitest';
import { HELIPAD, RUNWAY, TowerSim, landingSpot } from '@/games/aeroporto/core';
import { ButtonMatch, FIELD } from '@/games/botao/core';
import { SprintRace } from '@/games/cem/core';
import { BOARD, DartsGame, scoreAt } from '@/games/dardos/core';
import { COLS, ROAD, ROWS, TowerDefense } from '@/games/defesa/core';
import { Diner } from '@/games/lanchonete/core';
import { MineRun, UPGRADES } from '@/games/mina/core';
import { evaluate, PokerSession, type Card } from '@/games/poquer/core';
import { SkiJump } from '@/games/saltoesqui/core';

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

describe('torre de controle', () => {
  it('an aircraft routed to its spot lands; unrouted ones do not', () => {
    const sim = new TowerSim(seeded(1));
    sim.crafts = [
      {
        id: 1,
        kind: 'plane',
        x: 250,
        y: 1000,
        heading: -Math.PI / 2,
        speed: 80,
        path: [],
        landing: false,
      },
      {
        id: 2,
        kind: 'heli',
        x: 560,
        y: 600,
        heading: -Math.PI / 2,
        speed: 60,
        path: [],
        landing: false,
      },
    ];
    sim.route(1, [{ x: RUNWAY.x, y: RUNWAY.y }]);
    let landed = 0;
    for (let i = 0; i < 60 * 5; i++)
      landed += sim.step(1 / 60).filter((e) => e.type === 'landed').length;
    expect(landed).toBe(1);
    expect(landingSpot('heli')).toBe(HELIPAD);
  });

  it('two aircraft meeting crash; a bot routing everyone keeps the sky safe for a while', () => {
    const crash = new TowerSim(seeded(2));
    crash.crafts = [
      { id: 1, kind: 'plane', x: 200, y: 700, heading: 0, speed: 80, path: [], landing: false },
      {
        id: 2,
        kind: 'plane',
        x: 400,
        y: 700,
        heading: Math.PI,
        speed: 80,
        path: [],
        landing: false,
      },
    ];
    let boom = false;
    for (let i = 0; i < 60 * 5 && !boom; i++)
      boom = crash.step(1 / 60).some((e) => e.type === 'crash');
    expect(boom).toBe(true);

    const sim = new TowerSim(seeded(3));
    for (let i = 0; i < 60 * 60 && sim.alive; i++) {
      for (const c of sim.crafts) if (!c.landing) sim.route(c.id, [landingSpot(c.kind)]);
      sim.step(1 / 60);
    }
    expect(sim.landed).toBeGreaterThan(5);
  });
});

describe('lanchonete', () => {
  it('building the order in sequence serves it; a wrong item spoils the burger', () => {
    const d = new Diner(seeded(4));
    const c = d.current!;
    expect(d.add(c.order[0] === 'carne' ? 'queijo' : 'carne')[0]).toEqual({ type: 'spoiled' });
    expect(d.plate).toEqual([]);
    let last;
    for (const ing of c.order) last = d.add(ing);
    expect(last![0]).toMatchObject({ type: 'served' });
    expect(d.served).toBe(1);
  });

  it('a fast cook keeps every customer happy; an idle one loses', () => {
    const d = new Diner(seeded(5));
    for (let i = 0; i < 60 * 90; i++) {
      d.step(1 / 60);
      const c = d.current;
      if (c && i % 12 === 0) d.add(c.order[d.plate.length]!);
    }
    expect(d.lives).toBe(3);
    expect(d.served).toBeGreaterThan(10);
    const idle = new Diner(seeded(6));
    for (let i = 0; i < 60 * 120 && !idle.over; i++) idle.step(1 / 60);
    expect(idle.over).toBe(true);
  });
});

describe('defesa da torre', () => {
  it('the road is a connected strip and towers cannot be built on it', () => {
    expect(ROAD.size).toBeGreaterThan(20);
    const td = new TowerDefense();
    const road = [...ROAD][0]!;
    expect(td.build('arco', road)).toBe(false);
    const grass = [...Array(COLS * ROWS).keys()].find((c) => !ROAD.has(c))!;
    expect(td.build('arco', grass)).toBe(true);
    expect(td.build('arco', grass)).toBe(false);
  });

  it('no towers: enemies leak and the castle falls', () => {
    const td = new TowerDefense();
    for (let i = 0; i < 60 * 300 && !td.over; i++) td.step(1 / 60);
    expect(td.over).toBe(true);
  });

  it('a builder that spends its gold holds out past wave 8', () => {
    const td = new TowerDefense();
    // Grass cells next to the road, best first.
    const near = [...Array(COLS * ROWS).keys()]
      .filter((c) => !ROAD.has(c))
      .sort((a, b) => {
        const n = (c: number) =>
          [c - 1, c + 1, c - COLS, c + COLS].filter((k) => ROAD.has(k)).length;
        return n(b) - n(a);
      });
    let k = 0;
    for (let i = 0; i < 60 * 600 && !td.over && td.wave < 9; i++) {
      if (i % 30 === 0) {
        const kind = k % 3 === 2 ? 'canhao' : k % 4 === 3 ? 'gelo' : 'arco';
        if (k < near.length && td.build(kind, near[k]!)) k++;
        else for (const t of td.towers) td.upgrade(t.cell);
      }
      td.step(1 / 60);
    }
    expect(td.wave).toBeGreaterThanOrEqual(9);
    expect(td.lives).toBeGreaterThan(0);
  });
});

describe('mina de ouro', () => {
  it('prices grow with each purchase and helpers produce gold every second', () => {
    const run = new MineRun();
    for (let i = 0; i < 40; i++) run.tap();
    expect(run.total).toBe(40);
    expect(run.buy('mineiro')).toBe(true);
    expect(run.price('mineiro')).toBeGreaterThan(UPGRADES[1]!.base);
    run.tick(10);
    expect(run.total).toBe(60);
  });

  it('investing beats only tapping', () => {
    const tapper = new MineRun();
    const investor = new MineRun();
    for (let i = 0; i < 90 * 6; i++) {
      tapper.tap();
      investor.tap();
      for (const u of ['broca', 'carrinho', 'mineiro', 'picareta'] as const) investor.buy(u);
      tapper.tick(1 / 6);
      investor.tick(1 / 6);
    }
    expect(investor.total).toBeGreaterThan(tapper.total * 2);
  });
});

describe('pôquer', () => {
  const hand = (s: string): Card[] =>
    s.split(' ').map((t) => ({
      rank: '23456789TJQKA'.indexOf(t[0]!) + 2,
      suit: ({ s: '♠', h: '♥', d: '♦', c: '♣' } as const)[t[1] as 's' | 'h' | 'd' | 'c'],
    }));
  it('ranks hands like Jacks or Better', () => {
    expect(evaluate(hand('Ts Js Qs Ks As'))).toBe('royal');
    expect(evaluate(hand('9h Th Jh Qh Kh'))).toBe('straightFlush');
    expect(evaluate(hand('As 2d 3c 4h 5s'))).toBe('straight');
    expect(evaluate(hand('Kc Kd Ks 2h 2s'))).toBe('fullHouse');
    expect(evaluate(hand('Jc Jd 4s 7h 9s'))).toBe('jacks');
    expect(evaluate(hand('Tc Td 4s 7h 9s'))).toBe('nothing');
    expect(evaluate(hand('Tc Td 4s 4h 9s'))).toBe('twoPair');
  });

  it('a session lasts 25 hands unless chips run out', () => {
    const s = new PokerSession(seeded(7));
    let hands = 0;
    while (!s.over && hands < 40) {
      s.deal();
      // Hold pairs and high cards: a simple strategy.
      s.hand.forEach((c, i) => {
        if (c.rank >= 11 || s.hand.filter((d) => d.rank === c.rank).length > 1) s.toggle(i);
      });
      s.draw();
      hands++;
    }
    expect(hands).toBeLessThanOrEqual(25);
    expect(s.over).toBe(true);
  });
});

describe('dardos', () => {
  it('scores the board like a real dartboard', () => {
    expect(scoreAt(BOARD.x, BOARD.y).points).toBe(50);
    expect(scoreAt(BOARD.x, BOARD.y - BOARD.r * 0.6)).toMatchObject({ points: 60, label: 'T20' });
    expect(scoreAt(BOARD.x, BOARD.y - BOARD.r * 0.97)).toMatchObject({ points: 40, label: 'D20' });
    expect(scoreAt(BOARD.x + BOARD.r * 0.3, BOARD.y).points).toBe(6);
    expect(scoreAt(BOARD.x, BOARD.y + BOARD.r * 1.2).points).toBe(0);
  });

  it('ten rounds of three darts; timing the throw near the centre pays', () => {
    const lucky = new DartsGame(seeded(8));
    const careless = new DartsGame(seeded(8));
    while (!lucky.over) {
      // Wait (up to 3 s) for the aim to pass close to the bull before throwing.
      for (let k = 0; k < 180; k++) {
        const a = lucky.aim();
        if (Math.hypot(a.x - BOARD.x, a.y - BOARD.y) < 20) break;
        lucky.tick(1 / 60);
      }
      lucky.throw();
      careless.throw();
      careless.tick(0.37);
    }
    expect(lucky.score).toBeGreaterThan(careless.score);
    expect(lucky.round).toBe(11);
  });
});

describe('futebol de botão', () => {
  it('a straight flick through the ball scores', () => {
    const m = new ButtonMatch(seeded(9));
    const ball = m.ball;
    ball.x = 360;
    ball.y = FIELD.y0 + 120;
    const me = m.discs.find((d) => d.team === 'me')!;
    me.x = 360;
    me.y = FIELD.y0 + 260;
    // Clear the robot's buttons out of the way.
    for (const d of m.discs.filter((k) => k.team === 'cpu')) d.x = FIELD.x0 + 40;
    expect(m.flick(me.id, 0, -1, 0.8)).toBe(true);
    let goal = false;
    for (let i = 0; i < 60 * 8 && !goal; i++)
      goal = m.step(1 / 60).some((e) => e.type === 'goal' && e.by === 'me');
    expect(goal).toBe(true);
    expect(m.goalsMe).toBe(1);
  });

  it('the robot always finds a shot at the ball', () => {
    const m = new ButtonMatch(seeded(10));
    m.turn = 'cpu';
    const s = m.cpuShot();
    expect(Math.hypot(s.dx, s.dy)).toBeCloseTo(1);
    expect(m.flick(s.id, s.dx, s.dy, s.power)).toBe(true);
  });
});

describe('salto de esqui', () => {
  it('a perfect take-off, balance and landing beats a sloppy jump', () => {
    const jump = (good: boolean) => {
      const s = new SkiJump(seeded(11));
      while (s.phase === 'inrun' && s.inrunProgress < (good ? 1 : 0.5)) s.step(1 / 120);
      s.tap();
      let res = null;
      while (!res) {
        if (s.phase === 'flight') s.holding = good ? s.needle < 0 : false;
        if (s.phase === 'landing' && good) res = s.tap();
        else res = s.step(1 / 120);
      }
      return res;
    };
    const good = jump(true);
    const bad = jump(false);
    expect(good.fell).toBe(false);
    expect(bad.fell).toBe(true);
    expect(good.points).toBeGreaterThan(bad.points);
  });
});

describe('corrida de 100 m', () => {
  const run = (rate: number, seed: number) => {
    const r = new SprintRace(seeded(seed));
    let side: 'L' | 'R' = 'L';
    let clock = 0;
    let result = null;
    while (!result) {
      for (const e of r.step(1 / 120)) if (e.type === 'finish') result = e;
      if (r.phase === 'run') {
        clock += 1 / 120;
        if (clock >= 1 / rate) {
          clock = 0;
          r.tap(side);
          side = side === 'L' ? 'R' : 'L';
        }
      }
    }
    return { result, race: r };
  };

  it('fast alternate tapping wins the first race; slow tapping loses', () => {
    expect(run(9, 12).result.place).toBe(1);
    expect(run(3, 12).result.place).toBeGreaterThan(1);
  });

  it('tapping before the gun is a false start', () => {
    const r = new SprintRace(seeded(13));
    expect(r.tap('L')[0]).toEqual({ type: 'false-start' });
    expect(r.tap('L').map((e) => e.type)).toEqual(['false-start', 'over']);
  });
});
