import { describe, expect, it } from 'vitest';
import { Brain } from '@/games/turma/ai';
import {
  FightSim,
  NO_INPUT,
  PARRY_WINDOW,
  type FightEvent,
  type FightInput,
} from '@/games/turma/core';
import {
  BASE_MODS,
  kidSetup,
  offerUpgrades,
  POWERS,
  roundBonus,
  turmaRival,
  UPGRADES,
} from '@/games/turma/ladder';
import { seeded } from '@/platform/rnd';

const press = (k: keyof FightInput): FightInput => ({ ...NO_INPUT, [k]: true });

/** Runs `seconds` of simulation; `inputs` may change by time. */
function run(
  sim: FightSim,
  seconds: number,
  a: (t: number) => FightInput = () => NO_INPUT,
  b: (t: number) => FightInput = () => NO_INPUT,
): FightEvent[] {
  const events: FightEvent[] = [];
  const dt = 1 / 120;
  let t = 0;
  for (let n = 0; n < seconds / dt; n++, t += dt) events.push(...sim.step(dt, [a(t), b(t)]));
  return events;
}

/** Fires an input only on the first sub-step of each `every` seconds. */
const tapEvery = (k: keyof FightInput, every: number, from = 0) => {
  let last = -1;
  return (t: number): FightInput => {
    const slot = Math.floor((t - from) / every);
    if (t >= from && slot !== last) {
      last = slot;
      return press(k);
    }
    return NO_INPUT;
  };
};

const close = (kidA = 1, kidB = 3): FightSim => {
  const sim = new FightSim(kidSetup(kidA), kidSetup(kidB));
  sim.fighters[0].x = 300;
  sim.fighters[1].x = 360;
  return sim;
};

describe('turma: ataque em cadeia', () => {
  it('três toques seguidos fazem jab, gancho e o chute que derruba', () => {
    const sim = close();
    const events = run(sim, 1.4, tapEvery('attack', 0.18));
    const hits = events.filter((e) => e.type === 'hit' && e.attacker === 0);
    expect(hits.map((h) => (h.type === 'hit' ? h.kind : ''))).toEqual(
      expect.arrayContaining(['jab', 'hook', 'kick']),
    );
    expect(hits.some((h) => h.type === 'hit' && h.knockdown)).toBe(true);
    expect(sim.fighters[1].hp).toBeLessThan(sim.fighters[1].setup.maxHp);
  });

  it('quem está caído não apanha mais até levantar', () => {
    const sim = close();
    sim.fighters[1].state = 'down';
    sim.fighters[1].stun = 0.8;
    sim.fighters[1].invuln = 0.4;
    const hp = sim.fighters[1].hp;
    run(sim, 0.3, tapEvery('attack', 0.1));
    expect(sim.fighters[1].hp).toBe(hp);
  });
});

describe('turma: defesa e defesa perfeita', () => {
  it('guarda segurada só leva dano de raspão e gasta energia', () => {
    const sim = close();
    const target = sim.fighters[1];
    // The guard has been up for a while, so this is a plain block.
    run(
      sim,
      0.5,
      () => NO_INPUT,
      () => press('guard'),
    );
    const hp = target.hp;
    const guard = target.guard;
    run(sim, 0.4, tapEvery('attack', 0.5), () => press('guard'));
    expect(target.state).toBe('guard');
    expect(hp - target.hp).toBeLessThanOrEqual(2);
    expect(target.guard).toBeLessThan(guard);
  });

  it('apertar a defesa na hora do golpe é defesa perfeita e deixa o atacante tonto', () => {
    const sim = close();
    const events: FightEvent[] = [];
    // Attacker starts at t=0; the hit lands ~0.06s later. Raise the guard just before.
    const guardAt = 0.02;
    events.push(
      ...run(sim, 0.4, tapEvery('attack', 1), (t) => (t >= guardAt ? press('guard') : NO_INPUT)),
    );
    expect(events.some((e) => e.type === 'parry')).toBe(true);
    expect(sim.fighters[0].state).toBe('hit');
    expect(sim.fighters[1].hp).toBe(sim.fighters[1].setup.maxHp);
    expect(PARRY_WINDOW).toBeGreaterThan(0.1);
  });

  it('guarda gasta tudo e quebra', () => {
    const sim = close();
    const target = sim.fighters[1];
    target.guard = 4;
    const events = run(sim, 1, tapEvery('attack', 0.2, 0.3), () => press('guard'));
    expect(events.some((e) => e.type === 'guardBreak')).toBe(true);
    expect(target.guard).toBeGreaterThanOrEqual(0);
  });
});

describe('turma: poderes rápidos', () => {
  it('o poder já fica pronto poucos segundos depois do início', () => {
    const sim = close();
    expect(sim.fighters[0].powerCd).toBeLessThanOrEqual(1.5);
    run(sim, 1.6);
    expect(sim.fighters[0].powerCd).toBe(0);
  });

  it('usar o poder inicia a recarga e acertar golpes recarrega mais rápido', () => {
    const sim = new FightSim(kidSetup(5), kidSetup(3)); // Kauã: fireball
    sim.fighters[0].x = 100;
    sim.fighters[1].x = 600;
    run(sim, 1.6);
    const events = run(sim, 0.3, tapEvery('power', 9));
    expect(events).toContainEqual({ type: 'power', owner: 0, kind: 'fireball' });
    expect(sim.fighters[0].powerCd).toBeGreaterThan(3);
    const cd = sim.fighters[0].powerCd;
    // Landing a hit shaves time off the cooldown.
    const near = close();
    near.fighters[0].powerCd = 4;
    run(near, 0.4, tapEvery('attack', 1));
    expect(near.fighters[0].powerCd).toBeLessThan(4 - 0.4);
    expect(cd).toBeGreaterThan(0);
  });

  it('a bola de fogo atravessa o palco e acerta; pular por cima desvia', () => {
    const hit = new FightSim(kidSetup(5), kidSetup(3));
    hit.fighters[0].x = 100;
    hit.fighters[1].x = 450;
    hit.fighters[0].powerCd = 0;
    const events = run(hit, 1, tapEvery('power', 9));
    expect(events.some((e) => e.type === 'hit' && e.kind === 'fireball')).toBe(true);
    const dodge = new FightSim(kidSetup(5), kidSetup(3));
    dodge.fighters[0].x = 100;
    dodge.fighters[1].x = 450;
    dodge.fighters[0].powerCd = 0;
    const ev = run(dodge, 1, tapEvery('power', 9), tapEvery('jump', 9, 0.3));
    expect(ev.some((e) => e.type === 'hit' && e.kind === 'fireball')).toBe(false);
  });

  it('o gelo congela, o coração cura e dá força, o terremoto só pega quem está no chão', () => {
    const ice = new FightSim(kidSetup(2), kidSetup(3));
    ice.fighters[0].x = 100;
    ice.fighters[1].x = 400;
    ice.fighters[0].powerCd = 0;
    run(ice, 0.8, tapEvery('power', 9));
    expect(ice.fighters[1].frozen).toBeGreaterThan(0);

    const heal = new FightSim(kidSetup(4), kidSetup(3));
    heal.fighters[0].hp = 50;
    heal.fighters[0].powerCd = 0;
    run(heal, 0.5, tapEvery('power', 9));
    expect(heal.fighters[0].hp).toBeGreaterThan(50);
    expect(heal.fighters[0].buff).toBeGreaterThan(0);

    const quake = close(3, 1);
    quake.fighters[0].powerCd = 0;
    const events = run(quake, 0.5, tapEvery('power', 9));
    expect(events.some((e) => e.type === 'hit' && e.kind === 'quake')).toBe(true);
    const airborne = close(3, 1);
    airborne.fighters[0].powerCd = 0;
    airborne.fighters[1].y = 120;
    airborne.fighters[1].vy = 200;
    const none = run(airborne, 0.2, tapEvery('power', 9));
    expect(none.some((e) => e.type === 'hit' && e.kind === 'quake')).toBe(false);
  });

  it('o raio avisa antes e erra quem sai de baixo', () => {
    const sim = new FightSim(kidSetup(1), kidSetup(3));
    sim.fighters[0].x = 100;
    sim.fighters[1].x = 400;
    sim.fighters[0].powerCd = 0;
    run(sim, 0.2, tapEvery('power', 9));
    expect(sim.strikes).toHaveLength(1);
    const hp = sim.fighters[1].hp;
    run(
      sim,
      1,
      () => NO_INPUT,
      () => ({ ...NO_INPUT, right: true }),
    );
    expect(sim.fighters[1].hp).toBe(hp);
  });

  it('um golpe que acertou pode ser cancelado no poder', () => {
    const sim = close(5, 3);
    sim.fighters[0].powerCd = 0;
    const events = run(sim, 0.4, (t) =>
      t < 0.01 ? press('attack') : t > 0.12 ? press('power') : NO_INPUT,
    );
    expect(events.some((e) => e.type === 'power')).toBe(true);
  });
});

describe('turma: rodada', () => {
  it('KO encerra a rodada com o vencedor', () => {
    const sim = close();
    sim.fighters[1].hp = 1;
    const events = run(sim, 0.5, tapEvery('attack', 0.1));
    expect(events).toContainEqual({ type: 'ko', winner: 0 });
    expect(sim.over).toBe(true);
  });

  it('no tempo vence quem tem mais vida', () => {
    const sim = close();
    sim.fighters[1].hp = 40;
    sim.time = 0.05;
    const events = run(sim, 0.2);
    expect(events).toContainEqual({ type: 'timeup', winner: 0 });
  });
});

describe('turma: CPU e evolução', () => {
  it('a CPU ataca, usa o poder e machuca quem fica parado', () => {
    const sim = close();
    const brain = new Brain(0.8, seeded(3));
    const powers: FightEvent[] = [];
    for (let n = 0; n < 120 * 25 && !sim.over; n++)
      powers.push(
        ...sim
          .step(1 / 120, [NO_INPUT, brain.think(sim, 1 / 120)])
          .filter((e) => e.type === 'power'),
      );
    expect(sim.fighters[0].hp).toBeLessThan(sim.fighters[0].setup.maxHp);
    expect(powers.length).toBeGreaterThan(0);
  });

  it('um rival nunca é o próprio jogador e fica mais forte a cada luta', () => {
    for (let kid = 0; kid < POWERS.length; kid++)
      for (let level = 1; level <= 8; level++) expect(turmaRival(level, kid).kid).not.toBe(kid);
    const a = turmaRival(1, 0);
    const b = turmaRival(8, 0);
    expect(b.skill).toBeGreaterThan(a.skill);
    expect(b.setup.dmg / kidSetup(b.kid).dmg).toBeGreaterThan(a.setup.dmg / kidSetup(a.kid).dmg);
  });

  it('reforços mudam os atributos e são oferecidos 3 diferentes', () => {
    const cards = offerUpgrades(seeded(5));
    expect(new Set(cards.map((c) => c.id)).size).toBe(3);
    const boosted = UPGRADES.reduce((m, u) => u.apply(m), BASE_MODS);
    const setup = kidSetup(1, boosted);
    expect(setup.maxHp).toBeGreaterThan(kidSetup(1).maxHp);
    expect(setup.cd).toBeLessThan(1);
    expect(setup.vamp).toBeGreaterThan(0);
  });

  it('rodada perfeita paga muito mais', () => {
    const w = { level: 2, hpLeft: 80, maxHp: 100, timeLeft: 20, perfect: false };
    expect(roundBonus({ ...w, perfect: true })).toBe(roundBonus(w) + 1500);
  });
});
