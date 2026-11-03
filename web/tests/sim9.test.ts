import { describe, expect, it } from 'vitest';
import * as aquario from '@/games/aquario/core';
import * as bichinho from '@/games/bichinho/core';
import * as bolsa from '@/games/bolsa/core';
import * as cidade from '@/games/cidade/core';
import * as fabrica from '@/games/fabrica/core';
import * as fazendinha from '@/games/fazendinha/core';
import * as pocoes from '@/games/pocoes/core';
import * as reino from '@/games/reino/core';
import * as usina from '@/games/usina/core';

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
const DT = 1 / 30;

describe('fábrica de biscoitos', () => {
  it('upgrades cost more each time, and cannot be bought without the biscuits', () => {
    const s = new fabrica.FactorySim(seeded(1));
    expect(s.buy('click')).toBe(false);
    for (let i = 0; i < 20; i++) s.click();
    const before = s.cost('click');
    expect(s.buy('click')).toBe(true);
    expect(s.cost('click')).toBeGreaterThan(before);
    expect(s.perClick).toBe(2);
  });

  it('the golden biscuit pays a bonus and then disappears', () => {
    const s = new fabrica.FactorySim(seeded(2));
    s.golden = { x: 300, y: 400, left: 5 };
    const bonus = s.tapGolden();
    expect(bonus).toBeGreaterThan(0);
    expect(s.golden).toBeNull();
    expect(s.tapGolden()).toBe(0);
  });

  it('investing beats just clicking', () => {
    const bot = new fabrica.FactorySim(seeded(3));
    const plain = new fabrica.FactorySim(seeded(3));
    let acc = 0;
    while (!bot.done) {
      acc += DT;
      while (acc >= 1 / 6) {
        acc -= 1 / 6;
        bot.click();
        plain.click();
      }
      fabrica.botAct(bot, 0);
      bot.step(DT);
      plain.step(DT);
    }
    expect(bot.score).toBeGreaterThan(plain.score * 2.5);
  });
});

describe('fazendinha', () => {
  it('crops ripen, can be harvested for coins, and rot if forgotten', () => {
    const s = new fazendinha.FarmSim(seeded(4));
    expect(s.plant(0, 0)).toBe(true);
    expect(s.plant(0, 0)).toBe(false);
    expect(s.harvest(0)).toBe(0);
    for (let i = 0; i < 30 * 7; i++) s.step(DT);
    expect(s.isRipe(0)).toBe(true);
    expect(s.harvest(0)).toBe(9);
    s.plant(1, 0);
    for (let i = 0; i < 30 * 20; i++) s.step(DT);
    expect(s.plots[1]).toBeNull();
    expect(s.rotted).toBe(1);
  });

  it('a farmer who tends the plots finishes far richer than one who does not', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const bot = new fazendinha.FarmSim(seeded(seed));
      const idle = new fazendinha.FarmSim(seeded(seed));
      for (let i = 0; i < 30 * 120; i++) {
        if (i % 9 === 0) fazendinha.botAct(bot);
        bot.step(DT);
        idle.step(DT);
      }
      expect(idle.score).toBe(25);
      expect(bot.score).toBeGreaterThan(1000);
    }
  });
});

describe('bolsa', () => {
  it('buying and selling move cash and shares at the current price', () => {
    const s = new bolsa.MarketSim(seeded(5));
    const bought = s.buy(1, 0.5);
    expect(bought).toBeCloseTo(500 / 100, 5);
    expect(s.cash).toBeCloseTo(500, 5);
    expect(s.netWorth()).toBeCloseTo(1000, 5);
    expect(s.sell(1)).toBeCloseTo(500, 5);
    expect(s.sell(1)).toBe(0);
  });

  it('a headline comes before the move', () => {
    const s = new bolsa.MarketSim(seeded(6));
    let seen = false;
    for (let i = 0; i < 30 * 10 && !seen; i++) {
      s.step(DT);
      seen = s.news !== null;
    }
    expect(seen).toBe(true);
    expect(s.news!.wait).toBeGreaterThan(0);
  });

  it('reading the news pays', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const s = new bolsa.MarketSim(seeded(seed));
      while (!s.done) {
        bolsa.botAct(s);
        s.step(DT);
      }
      expect(s.score).toBeGreaterThan(bolsa.START_CASH * 1.2);
    }
  });
});

describe('reino', () => {
  it('every card has two answers that pull the gauges in different ways', () => {
    for (const c of reino.CARDS) {
      expect(c.left.fx).not.toEqual(c.right.fx);
      expect(c.left.fx.some((v) => v !== 0)).toBe(true);
      expect(c.right.fx.some((v) => v !== 0)).toBe(true);
    }
  });

  it('a gauge at 0 or 100 ends the reign', () => {
    const s = new reino.KingdomSim(seeded(7));
    s.stats = [95, 50, 50, 50];
    s.card = { ...s.card, left: { label: 'x', fx: [10, 0, 0, 0] }, right: s.card.right };
    s.answer('left');
    expect(s.over).toEqual({ stat: 0, high: true });
    const years = s.years;
    s.answer('left');
    expect(s.years).toBe(years);
  });

  it('balancing the gauges lasts much longer than answering at random', () => {
    let random = 0;
    let bot = 0;
    for (let k = 1; k <= 20; k++) {
      const r = seeded(k);
      const a = new reino.KingdomSim(r);
      while (!a.over && a.years < 200) a.answer(r() < 0.5 ? 'left' : 'right');
      random += a.years;
      const b = new reino.KingdomSim(seeded(k));
      while (!b.over && b.years < 200) b.answer(reino.botChoose(b));
      bot += b.years;
    }
    expect(random / 20).toBeLessThan(70);
    expect(bot / 20).toBeGreaterThan(150);
  });
});

describe('cidade', () => {
  it('neighbours change what a building is worth', () => {
    const cells = Array.from(
      { length: cidade.SIZE * cidade.SIZE },
      () => null as cidade.Building | null,
    );
    cells[0] = 'casa';
    expect(cidade.worth(cells, 0)).toBe(3);
    cells[1] = 'parque';
    cells[cidade.SIZE] = 'fabrica';
    expect(cidade.worth(cells, 0)).toBe(3 + 2 - 2);
    expect(cidade.neighbours(0)).toHaveLength(2);
    expect(cidade.neighbours(cidade.SIZE + 1)).toHaveLength(4);
  });

  it('plays 24 turns and refuses occupied cells', () => {
    let s = cidade.newGame(seeded(8));
    const first = cidade.place(s, 0, 0, seeded(9))!;
    expect(first.turn).toBe(1);
    expect(cidade.place(first, 0, 0)).toBeNull();
    s = first;
    for (let i = 1; i < cidade.TURNS; i++) s = cidade.place(s, i, 0, seeded(i))!;
    expect(cidade.isOver(s)).toBe(true);
    expect(cidade.place(s, 30, 0)).toBeNull();
  });

  it('planning beats scattering buildings at random', () => {
    let greedy = 0;
    let random = 0;
    for (let k = 1; k <= 10; k++) {
      const r = seeded(k);
      let a = cidade.newGame(r);
      while (!cidade.isOver(a)) {
        const p = cidade.bestPlacement(a);
        a = cidade.place(a, p.cell, p.offer, r)!;
      }
      greedy += cidade.score(a.cells);
      const q = seeded(k + 100);
      let b = cidade.newGame(q);
      while (!cidade.isOver(b)) {
        const free = b.cells.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
        b = cidade.place(b, free[Math.floor(q() * free.length)]!, Math.floor(q() * 3), q)!;
      }
      random += cidade.score(b.cells);
    }
    expect(greedy).toBeGreaterThan(random * 1.5);
  });
});

describe('aquário', () => {
  it('pellets cost a coin, fish grow after eating, and only grown fish can be sold', () => {
    const s = new aquario.TankSim(seeded(10));
    const f = s.fish[0]!;
    expect(s.sell(f.id)).toBe(0);
    expect(s.drop(f.x)).toBe(true);
    expect(s.coins).toBe(29);
    f.stage = 3;
    expect(s.sell(f.id)).toBe(aquario.VALUE[3]);
    expect(s.fish.some((o) => o.id === f.id)).toBe(false);
  });

  it('fish that are never fed are lost', () => {
    const s = new aquario.TankSim(seeded(11));
    for (let i = 0; i < 30 * 20; i++) s.step(DT);
    expect(s.fish).toHaveLength(0);
    expect(s.lost).toBe(2);
  });

  it('feeding well grows and sells fish for a profit', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const s = new aquario.TankSim(seeded(seed));
      for (let i = 0; i < 30 * aquario.DURATION; i++) {
        if (i % 9 === 0) aquario.botAct(s);
        s.step(DT);
      }
      expect(s.sold).toBeGreaterThanOrEqual(8);
      expect(s.score).toBeGreaterThan(500);
    }
  });
});

describe('poções', () => {
  it('mixes colours: red + blue is purple, in either order', () => {
    expect(pocoes.POTIONS[pocoes.potionOf(0, 1)]!.name).toBe('Roxa');
    expect(pocoes.potionOf(1, 0)).toBe(pocoes.potionOf(0, 1));
    expect(pocoes.potionOf(2, 2)).toBe(2);
  });

  it('serving the right potion pays; the wrong one costs patience', () => {
    const s = new pocoes.BrewSim(seeded(12));
    s.slots[0] = { potion: 3, patience: 20, max: 24 };
    s.add(0);
    s.add(2);
    expect(s.serve(0)).toBe('wrong');
    expect(s.slots[0]!.patience).toBe(15);
    expect(s.cauldron).toHaveLength(0);
    s.add(1);
    s.add(0);
    expect(s.serve(0)).toBe('ok');
    expect(s.score).toBeGreaterThanOrEqual(18);
    expect(s.slots[0]).toBeNull();
  });

  it('keeping up with orders lasts; ignoring them costs all three lives', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const bot = new pocoes.BrewSim(seeded(seed));
      for (let i = 0; i < 30 * 120; i++) {
        if (i % 10 === 0) pocoes.botAct(bot);
        bot.step(DT);
      }
      expect(bot.alive).toBe(true);
      expect(bot.served).toBeGreaterThan(15);
      const idle = new pocoes.BrewSim(seeded(seed));
      for (let i = 0; i < 30 * 120 && idle.alive; i++) idle.step(DT);
      expect(idle.alive).toBe(false);
      expect(idle.t).toBeLessThan(60);
    }
  });
});

describe('usina', () => {
  it('hotter reactors make more power, and a reactor at 100° explodes', () => {
    expect(usina.PlantSim.power(20)).toBeLessThan(usina.PlantSim.power(70));
    expect(usina.PlantSim.power(70)).toBeLessThan(usina.PlantSim.power(95));
    const s = new usina.PlantSim(seeded(13));
    s.temps = [99.9, 40, 40];
    s.step(0.1);
    expect(s.alive).toBe(false);
    expect(s.exploded).toBe(0);
  });

  it('cooling drops the temperature, then needs a moment to recharge', () => {
    const s = new usina.PlantSim(seeded(14));
    s.temps = [80, 80, 80];
    expect(s.cool(1)).toBe(true);
    expect(s.temps[1]).toBe(80 - usina.COOL);
    expect(s.cool(1)).toBe(false);
    s.step(0.6);
    expect(s.cool(1)).toBe(true);
  });

  it('an attentive operator lasts; an absent one blows up fast', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const bot = new usina.PlantSim(seeded(seed));
      const idle = new usina.PlantSim(seeded(seed));
      for (let i = 0; i < 30 * 90; i++) {
        if (i % 7 === 0) usina.botAct(bot);
        bot.step(DT);
        if (idle.alive) idle.step(DT);
      }
      expect(bot.alive).toBe(true);
      expect(idle.alive).toBe(false);
      expect(idle.t).toBeLessThan(30);
      expect(bot.score).toBeGreaterThan(idle.score * 5);
    }
  });
});

describe('bichinho', () => {
  it('feeding, playing and washing raise the right need', () => {
    const p = new bichinho.PetSim();
    p.needs.fome = 30;
    expect(p.feed()).toBe(true);
    expect(p.needs.fome).toBe(70);
    expect(p.feed()).toBe(false);
    p.step(1);
    p.needs.diversao = 20;
    expect(p.play()).toBe(true);
    expect(p.needs.diversao).toBeGreaterThan(40);
    p.step(1);
    p.needs.limpeza = 10;
    expect(p.wash()).toBe(true);
    expect(p.needs.limpeza).toBeGreaterThan(60);
  });

  it('sleeping restores energy and blocks the other actions', () => {
    const p = new bichinho.PetSim();
    p.needs.energia = 20;
    p.toggleSleep();
    for (let i = 0; i < 30 * 5; i++) p.step(DT);
    expect(p.needs.energia).toBeGreaterThan(40);
    expect(p.feed()).toBe(false);
  });

  it('a pet that is looked after lives and grows happy; a neglected one does not', () => {
    const bot = new bichinho.PetSim();
    const idle = new bichinho.PetSim();
    for (let i = 0; i < 30 * 240; i++) {
      if (i % 12 === 0) bichinho.botAct(bot);
      bot.step(DT);
      if (idle.alive) idle.step(DT);
    }
    expect(bot.alive).toBe(true);
    expect(idle.alive).toBe(false);
    expect(idle.age).toBeLessThan(90);
    expect(bot.score).toBeGreaterThan(idle.score * 3);
  });
});
