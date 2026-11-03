import { describe, expect, it } from 'vitest';
import * as buraco from '@/games/buraco/core';
import * as corda from '@/games/corda/core';
import * as escudo from '@/games/escudo/core';
import * as esquiva from '@/games/esquiva/core';
import * as estilingue from '@/games/estilingue/core';
import * as gravidade from '@/games/gravidade/core';
import * as ninja from '@/games/ninja/core';
import * as pendulo from '@/games/pendulo/core';
import * as sumo from '@/games/sumo/core';

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
const DT = 1 / 60;

describe('gravidade', () => {
  it('an idle runner dies on the first spike on its wall', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const s = new gravidade.GravitySim(seeded(seed));
      for (let i = 0; i < 60 * 30 && s.alive; i++) s.step(DT);
      expect(s.alive).toBe(false);
    }
  });

  it('a bot that flips in time keeps going', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const s = new gravidade.GravitySim(seeded(seed));
      for (let i = 0; i < 60 * 60 && s.alive; i++) {
        s.botAct();
        s.step(DT);
      }
      expect(s.alive).toBe(true);
      expect(s.score).toBeGreaterThan(15);
    }
  });
});

describe('buraco negro', () => {
  it('swallows only what fits, and grows', () => {
    const s = new buraco.HoleSim(seeded(3));
    s.items = [
      { x: s.x, y: s.y, r: 10, kind: 0 },
      { x: s.x + 5, y: s.y, r: 200, kind: 1 },
    ];
    const eaten = s.step(DT, s.x, s.y);
    expect(eaten).toHaveLength(1);
    expect(eaten[0]!.r).toBe(10);
    expect(s.r).toBeGreaterThan(buraco.START_R);
    expect(s.items).toHaveLength(2);
  });

  it('chasing food beats standing still', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const bot = new buraco.HoleSim(seeded(seed));
      const idle = new buraco.HoleSim(seeded(seed));
      while (!bot.done) {
        const n = bot.nearestEdible();
        bot.step(DT, n?.x ?? 360, n?.y ?? 700);
        idle.step(DT, 360, 700);
      }
      expect(bot.r).toBeGreaterThan(buraco.START_R * 2.5);
      expect(bot.r).toBeLessThanOrEqual(buraco.MAX_R);
      expect(bot.score).toBeGreaterThan(idle.score * 5);
    }
  });
});

describe('estilingue', () => {
  it('a pig dies when the block under it breaks, and a weak hit bounces off', () => {
    const s = estilingue.newStage(1, seeded(4));
    expect(estilingue.pigsLeft(s)).toBeGreaterThan(0);
    const b = s.blocks[s.blocks.length - 1]!;
    const pig = s.pigs.find((p) => p.support === b.id)!;
    s.stone = { x: b.x + b.w / 2, y: b.y + 4, vx: 0, vy: 900, t: 0 };
    estilingue.step(s, DT);
    expect(pig.alive).toBe(false);
    expect(s.blocks.some((o) => o.id === b.id)).toBe(false);
    const slow = estilingue.newStage(1, seeded(4));
    const block = slow.blocks[0]!;
    slow.stone = { x: block.x - 10, y: block.y + 30, vx: 100, vy: 0, t: 0 };
    estilingue.step(slow, DT);
    expect(slow.blocks).toHaveLength(estilingue.newStage(1, seeded(4)).blocks.length);
    expect(slow.stone?.vx ?? 0).toBeLessThan(0);
  });

  it('every stage can be cleared by aiming well', () => {
    for (let seed = 1; seed <= 2; seed++) {
      for (let stage = 1; stage <= 5; stage++) {
        const s = estilingue.newStage(stage, seeded(seed * 10 + stage));
        while (estilingue.outcome(s) === 'playing') {
          const p = estilingue.bestPull(s);
          estilingue.launch(s, p.x, p.y);
          while (!estilingue.step(s, 1 / 120));
        }
        expect(estilingue.outcome(s)).toBe('clear');
      }
    }
  });

  it('refuses a tiny pull and a second shot while one is in flight', () => {
    const s = estilingue.newStage(1, seeded(5));
    expect(estilingue.launch(s, 5, 5)).toBe(false);
    expect(estilingue.launch(s, -100, 100)).toBe(true);
    expect(estilingue.launch(s, -100, 100)).toBe(false);
  });
});

describe('pêndulo', () => {
  it('stays on the rope: the distance to the hook never exceeds its length', () => {
    const s = new pendulo.SwingSim(seeded(6));
    for (let i = 0; i < 300; i++) {
      s.step(DT);
      const h = s.hook!;
      expect(Math.hypot(s.x - h.x, s.y - h.y)).toBeLessThanOrEqual(s.len + 0.5);
    }
  });

  it('falls into the lava in free flight', () => {
    const s = new pendulo.SwingSim(seeded(7));
    s.release();
    for (let i = 0; i < 300 && s.alive; i++) s.step(DT);
    expect(s.alive).toBe(false);
  });

  it('a timing bot swings far; one that never lets go gets nowhere', () => {
    let far = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const s = new pendulo.SwingSim(seeded(seed));
      for (let i = 0; i < 60 * 40 && s.alive; i++) {
        pendulo.botAct(s);
        s.step(DT);
      }
      if (s.score >= 100) far++;
      const idle = new pendulo.SwingSim(seeded(seed));
      for (let i = 0; i < 60 * 20; i++) idle.step(DT);
      expect(idle.score).toBeLessThan(40);
    }
    expect(far).toBeGreaterThanOrEqual(3);
  });
});

describe('ninja', () => {
  it('a spike on your wall kills; leaping dodges it', () => {
    const s = new ninja.NinjaSim(seeded(8));
    s.hazards = [{ kind: 'spike', side: 0, d: s.dist + 300 }];
    for (let i = 0; i < 120 && s.alive; i++) s.step(DT);
    expect(s.alive).toBe(false);
    const t = new ninja.NinjaSim(seeded(8));
    t.hazards = [{ kind: 'spike', side: 0, d: t.dist + 300 }];
    t.tap();
    for (let i = 0; i < 120 && t.alive; i++) t.step(DT);
    expect(t.alive).toBe(true);
    expect(t.side).toBe(1);
  });

  it('a shuriken hits you mid-leap but not on a wall', () => {
    const s = new ninja.NinjaSim(seeded(9));
    s.hazards = [{ kind: 'shuriken', side: 0, d: 40 }];
    s.dist = 0;
    s.cross = 0.5;
    s.step(0.001);
    expect(s.alive).toBe(false);
    const t = new ninja.NinjaSim(seeded(9));
    t.hazards = [{ kind: 'shuriken', side: 0, d: 40 }];
    for (let i = 0; i < 30; i++) t.step(DT);
    expect(t.alive).toBe(true);
  });

  it('a bot survives a long run; standing still does not', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const bot = new ninja.NinjaSim(seeded(seed));
      for (let i = 0; i < 60 * 80 && bot.alive; i++) {
        ninja.botAct(bot);
        bot.step(DT);
      }
      expect(bot.alive).toBe(true);
      const idle = new ninja.NinjaSim(seeded(seed));
      for (let i = 0; i < 60 * 30 && idle.alive; i++) idle.step(DT);
      expect(idle.alive).toBe(false);
    }
  });
});

describe('sumô', () => {
  it('dashing pushes a rival off the ring', () => {
    const s = new sumo.SumoSim(seeded(10));
    const e = s.enemies[0]!;
    e.x = sumo.CENTER.x + s.ring - 10;
    e.y = sumo.CENTER.y;
    e.cd = 99;
    s.enemies.length = 1;
    s.player.x = e.x - 90;
    s.player.y = e.y;
    expect(s.dash(1, 0)).toBe(true);
    expect(s.dash(1, 0)).toBe(false);
    for (let i = 0; i < 60 && e.alive; i++) s.step(DT);
    expect(s.knocked).toBeGreaterThanOrEqual(1);
  });

  it('a fighter bot gets further than doing nothing', () => {
    let better = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const bot = new sumo.SumoSim(seeded(seed));
      const idle = new sumo.SumoSim(seeded(seed));
      for (let i = 0; i < 60 * 90; i++) {
        if (bot.alive) {
          sumo.botAct(bot);
          bot.step(DT);
        }
        if (idle.alive) idle.step(DT);
      }
      if (bot.score > idle.score) better++;
      expect(idle.wave).toBeLessThanOrEqual(2);
    }
    expect(better).toBeGreaterThanOrEqual(4);
  });
});

describe('esquiva', () => {
  it('a bullet that touches the ship ends the run; a star adds points', () => {
    const s = new esquiva.DodgeSim(seeded(11));
    s.bullets = [{ x: s.x, y: s.y, vx: 0, vy: 0 }];
    s.step(DT, s.x, s.y);
    expect(s.alive).toBe(false);
    const t = new esquiva.DodgeSim(seeded(11));
    t.stars = [{ x: t.x, y: t.y }];
    expect(t.step(DT, t.x, t.y)).toBe(1);
    expect(t.starsGot).toBe(1);
    expect(t.score).toBeGreaterThanOrEqual(50);
  });

  it('a dodging bot outlives a ship that stays put', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const bot = new esquiva.DodgeSim(seeded(seed));
      const idle = new esquiva.DodgeSim(seeded(seed));
      for (let i = 0; i < 60 * 40; i++) {
        if (bot.alive) {
          const t = esquiva.botTarget(bot);
          bot.step(DT, t.x, t.y);
        }
        if (idle.alive) idle.step(DT, idle.x, idle.y);
      }
      expect(idle.alive).toBe(false);
      expect(bot.t).toBeGreaterThan(idle.t * 2);
      expect(bot.t).toBeGreaterThan(12);
    }
  });
});

describe('escudo', () => {
  it('blocks shots inside the shield arc, lets others hit the core', () => {
    const s = new escudo.ShieldSim(seeded(12));
    s.shots = [
      { angle: s.angle, d: escudo.SHIELD_R + 1, speed: 120, past: false },
      { angle: s.angle + Math.PI, d: escudo.SHIELD_R + 1, speed: 120, past: false },
    ];
    let blocked = 0;
    for (let i = 0; i < 60; i++) blocked += s.step(DT).blocked;
    expect(blocked).toBe(1);
    expect(s.lives).toBe(2);
  });

  it('turns by the shortest way', () => {
    const s = new escudo.ShieldSim(seeded(13));
    s.angle = 0.1;
    s.target = Math.PI * 2 - 0.1;
    s.step(DT);
    expect(s.angle).toBeLessThan(0.1);
  });

  it('aiming at the closest shot blocks plenty; an idle shield dies young', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const bot = new escudo.ShieldSim(seeded(seed));
      const idle = new escudo.ShieldSim(seeded(seed));
      for (let i = 0; i < 60 * 60; i++) {
        if (bot.alive) {
          escudo.botAim(bot);
          bot.step(DT);
        }
        if (idle.alive) idle.step(DT);
      }
      expect(bot.blocked).toBeGreaterThanOrEqual(20);
      expect(idle.alive).toBe(false);
      expect(idle.blocked).toBeLessThan(5);
    }
  });
});

describe('pular corda', () => {
  it('standing on the ground when the rope sweeps ends the run', () => {
    const s = new corda.RopeSim(seeded(14));
    for (let i = 0; i < 60 * 3 && s.alive; i++) s.step(DT);
    expect(s.alive).toBe(false);
    expect(s.jumps).toBe(0);
  });

  it('jumping at the right time clears turn after turn, even as the rope changes speed', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const s = new corda.RopeSim(seeded(seed));
      for (let i = 0; i < 60 * 90 && s.alive; i++) {
        corda.botAct(s);
        s.step(DT);
      }
      expect(s.alive).toBe(true);
      expect(s.jumps).toBeGreaterThan(60);
    }
  });

  it('a jump cannot be repeated in mid-air', () => {
    const s = new corda.RopeSim(seeded(15));
    expect(s.jump()).toBe(true);
    s.step(DT);
    expect(s.jump()).toBe(false);
  });
});
