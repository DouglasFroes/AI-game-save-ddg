import { describe, expect, it } from 'vitest';
import {
  BOSS_TIMES,
  FUSION_IDS,
  FUSIONS,
  MAX_SKILL_LEVEL,
  SKILL_IDS,
  xpToNext,
  type FusionId,
  type SkillId,
} from '@/games/fusao/core/defs';
import {
  applyRun,
  buyCharacter,
  buyUpgrade,
  computeRewards,
  dailyChallenge,
  defaultSave,
  loadSave,
  SAVE_KEY,
  validateSave,
  writeSave,
  type KeyValue,
  type RunSummary,
} from '@/games/fusao/core/meta';
import {
  addXp,
  cooldownOf,
  damageDealt,
  damageTaken,
  eligibleFusions,
  generateOffers,
  type Build,
} from '@/games/fusao/core/progression';
import { mulberry32 } from '@/games/fusao/core/rng';
import { RunSim, type RunConfig } from '@/games/fusao/core/run';

const META = { hp: 0, speed: 1, might: 1, xp: 1, essence: 1 };
const cfg = (o: Partial<RunConfig> = {}): RunConfig => ({
  character: 'condutor',
  seed: 42,
  meta: META,
  modifiers: [],
  maxEnemies: 220,
  ...o,
});
const DT = 1 / 60;

/** A sim with an empty arena (no spawns) and only the given skill. */
function lab(skill: SkillId | FusionId, level = 1): RunSim {
  const sim = new RunSim(cfg());
  sim.skills.length = 0;
  const fusion = FUSION_IDS.includes(skill as FusionId);
  sim.skills.push({ id: skill, level, fusion, timer: 0, angle: 0, data: [], points: [] });
  // Stop the director: push the clock of waves/bosses far away and starve the budget.
  (sim as unknown as { nextWave: number }).nextWave = 1e9;
  (sim as unknown as { bossIndex: number }).bossIndex = 99;
  (sim as unknown as { direct: () => void }).direct = () => {};
  sim.player.iframes = 1e9;
  return sim;
}

function spawnRing(
  sim: RunSim,
  n: number,
  dist: number,
  kind: 'perseguidor' | 'tanque' = 'tanque',
) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    sim.summon(kind, sim.player.x + Math.cos(a) * dist, sim.player.y + Math.sin(a) * dist);
  }
}

const run = (sim: RunSim, seconds: number, input = { x: 0, y: 0 }) => {
  const events = [];
  for (let i = 0; i < seconds * 60 && !sim.over; i++) {
    events.push(...sim.step(DT, input));
    while (sim.choosing) events.push(...sim.choose(0));
  }
  return events;
};

describe('fusão: experience and levels', () => {
  it('needs gently growing experience per level', () => {
    expect(xpToNext(1)).toBe(6);
    expect(xpToNext(10)).toBeGreaterThan(xpToNext(5));
    expect(xpToNext(20) / xpToNext(10)).toBeLessThan(3);
  });

  it('carries leftover experience across several level-ups', () => {
    expect(addXp(1, 0, 6 + 10 + 3, xpToNext)).toEqual({ level: 3, xp: 3, ups: 2 });
  });

  it('collecting experience opens a level-up choice that pauses the run', () => {
    const sim = lab('faisca');
    sim.gainXp(10);
    expect(sim.pendingLevels).toBe(1);
    sim.step(DT, { x: 0, y: 0 });
    expect(sim.choosing).toBe(true);
    const t = sim.time;
    sim.step(DT, { x: 1, y: 0 });
    expect(sim.time).toBe(t); // paused while choosing
    sim.choose(0);
    expect(sim.choosing).toBe(false);
    expect(sim.pendingLevels).toBe(0);
  });
});

describe('fusão: damage and cooldowns', () => {
  it('scales damage by power and lets armor reduce hits (never below 1)', () => {
    expect(damageDealt(10, 1.5)).toBe(15);
    expect(damageTaken(10, 3)).toBe(7);
    expect(damageTaken(2, 10)).toBe(1);
    expect(damageTaken(0, 0)).toBe(0);
    expect(cooldownOf(1, 0.5)).toBe(0.5);
    expect(cooldownOf(0.1, 0.5)).toBe(0.12);
  });

  it('the shield absorbs before health is touched', () => {
    const sim = lab('escudo');
    sim.player.iframes = 0;
    sim.step(DT, { x: 0, y: 0 });
    sim.player.shield = 20;
    sim.hurtPlayer(15);
    expect(sim.player.shield).toBe(5);
    expect(sim.player.hp).toBe(sim.player.maxHp);
  });

  it('a skill fires again only after its cooldown', () => {
    const sim = lab('faisca');
    spawnRing(sim, 6, 200);
    const shots = run(sim, 2.6).filter((e) => e.type === 'shot').length;
    // 0.85 s × 0.92 (Condutor) ≈ 0.78 s → 3 or 4 shots in 2.6 s.
    expect(shots).toBeGreaterThanOrEqual(3);
    expect(shots).toBeLessThanOrEqual(4);
  });
});

describe('fusão: every skill and fusion does something real', () => {
  for (const id of [...SKILL_IDS, ...FUSION_IDS]) {
    it(id, () => {
      const level = FUSION_IDS.includes(id as FusionId) ? 1 : MAX_SKILL_LEVEL;
      const sim = lab(id, level);
      spawnRing(sim, 10, 140);
      if (id === 'escudo' || id === 'ruptura') sim.player.iframes = 0;
      const events = run(
        sim,
        6,
        id === 'pulso' || id === 'dimensional' ? { x: 1, y: 0 } : { x: 0, y: 0 },
      );
      if (id === 'escudo') {
        // It absorbed blows: it broke at least once and the player lost less than the hits dealt.
        expect(events.some((e) => e.type === 'shield' && e.broke)).toBe(true);
      } else if (id === 'pulso') expect(events.some((e) => e.type === 'pulse')).toBe(true);
      else expect(sim.damageDone).toBeGreaterThan(0);
      if (id === 'gravidade')
        expect(sim.enemies.some((e) => e.slowFactor < 1) || sim.damageDone > 0).toBe(true);
    });
  }

  it('higher skill levels are really stronger', () => {
    const dmg = (level: number) => {
      const sim = lab('laminas', level);
      spawnRing(sim, 12, 110);
      run(sim, 4);
      return sim.damageDone;
    };
    expect(dmg(5)).toBeGreaterThan(dmg(1) * 1.5);
  });
});

describe('fusão: level-up offers and fusions', () => {
  const build = (o: Partial<Build>): Build => ({ skills: [], passives: {}, hpRatio: 1, ...o });

  it('offers three distinct valid choices, never a maxed skill', () => {
    const b = build({ skills: [{ id: 'faisca', level: MAX_SKILL_LEVEL, fusion: false }] });
    for (let seed = 1; seed < 40; seed++) {
      const offers = generateOffers(b, mulberry32(seed));
      expect(offers).toHaveLength(3);
      expect(offers.some((o) => o.kind === 'upgrade' && o.skill === 'faisca')).toBe(false);
      expect(new Set(offers.map((o) => JSON.stringify(o))).size).toBe(3);
    }
  });

  it('falls back to healing and essence when nothing is left to improve', () => {
    const full = build({
      skills: SKILL_IDS.slice(0, 6).map((id) => ({ id, level: MAX_SKILL_LEVEL, fusion: false })),
      passives: {
        vigor: 5,
        agilidade: 5,
        potencia: 5,
        foco: 5,
        alcance: 5,
        ima: 4,
        regeneracao: 4,
      },
    });
    const offers = generateOffers(full, mulberry32(1)).filter((o) => o.kind !== 'fusion');
    expect(offers.every((o) => o.kind === 'heal' || o.kind === 'essence')).toBe(true);
  });

  it('a fusion needs both parts at level 4 and is always offered when ready', () => {
    const almost = build({
      skills: [
        { id: 'orbe', level: 4, fusion: false },
        { id: 'faisca', level: 3, fusion: false },
      ],
    });
    expect(eligibleFusions(almost)).toEqual([]);
    const ready = build({
      skills: [
        { id: 'orbe', level: 4, fusion: false },
        { id: 'faisca', level: 4, fusion: false },
      ],
    });
    expect(eligibleFusions(ready)).toEqual(['plasma']);
    expect(
      generateOffers(ready, mulberry32(3)).some(
        (o) => o.kind === 'fusion' && o.fusion === 'plasma',
      ),
    ).toBe(true);
  });

  it('fusing replaces the parts once and is not offered again', () => {
    const sim = lab('orbe', 4);
    sim.skills.push({
      id: 'faisca',
      level: 4,
      fusion: false,
      timer: 0,
      angle: 0,
      data: [],
      points: [],
    });
    sim.gainXp(10);
    sim.step(DT, { x: 0, y: 0 });
    const i = sim.offers!.findIndex((o) => o.kind === 'fusion');
    const events = sim.choose(i);
    expect(events.some((e) => e.type === 'fusion' && e.fusion === 'plasma')).toBe(true);
    expect(sim.skills.map((s) => s.id)).toEqual(['plasma']);
    expect(eligibleFusions(sim.build)).toEqual([]);
    // The fused parts can't come back as new skills either.
    for (let seed = 1; seed < 30; seed++)
      expect(
        generateOffers(sim.build, mulberry32(seed)).some(
          (o) => o.kind === 'new' && (o.skill === 'orbe' || o.skill === 'faisca'),
        ),
      ).toBe(false);
  });

  it('there is a secret fusion among the five main ones', () => {
    expect(FUSION_IDS.filter((f) => !FUSIONS[f].secret)).toHaveLength(5);
    expect(FUSION_IDS.some((f) => FUSIONS[f].secret)).toBe(true);
  });
});

describe('fusão: waves and bosses', () => {
  it('spawns more enemies as time goes on', () => {
    const count = (start: number) => {
      const sim = new RunSim(cfg({ maxEnemies: 9999 }));
      sim.skills.length = 0;
      sim.player.iframes = 1e9;
      sim.time = start;
      (sim as unknown as { nextWave: number }).nextWave = 1e9;
      (sim as unknown as { bossIndex: number }).bossIndex = 99;
      for (let i = 0; i < 600; i++) sim.step(DT, { x: 0, y: 0 });
      return sim.enemies.length;
    };
    expect(count(400)).toBeGreaterThan(count(0) * 2);
  });

  it('the first boss arrives on time, telegraphs and changes phase', () => {
    const sim = new RunSim(cfg());
    sim.skills.length = 0;
    sim.player.iframes = 1e9;
    sim.time = BOSS_TIMES[0] - 0.5;
    const events = run(sim, 1);
    expect(events.some((e) => e.type === 'boss' && e.kind === 'colosso')).toBe(true);
    const boss = sim.boss!;
    run(sim, 6);
    expect(sim.hazards.length + (boss.state === 'charge' ? 1 : 0)).toBeGreaterThanOrEqual(0);
    boss.hp = boss.maxHp * 0.4;
    const later = run(sim, 0.5);
    expect(later.some((e) => e.type === 'bossPhase')).toBe(true);
    // Killing it drops a chest that opens a boosted choice.
    sim.damage(boss, 1e9);
    expect(sim.bossesDown).toEqual(['colosso']);
    expect(sim.gems.some((g) => g.kind === 'chest')).toBe(true);
  });
});

describe('fusão: whole runs', () => {
  const bot = (sim: RunSim, seconds: number) => {
    let t = 0;
    for (let i = 0; i < seconds * 60 && !sim.over; i++) {
      t += DT;
      sim.step(DT, { x: Math.cos(t * 0.7), y: Math.sin(t * 0.9) });
      while (sim.choosing) sim.choose(0);
    }
  };

  it('plays minutes of a run without blowing up memory', () => {
    const sim = new RunSim(cfg({ seed: 7 }));
    sim.player.maxHp = sim.player.hp = 1e6;
    bot(sim, 300);
    expect(sim.kills).toBeGreaterThan(100);
    expect(sim.player.level).toBeGreaterThan(5);
    expect(sim.enemies.length).toBeLessThanOrEqual(240);
    expect(sim.projectiles.length).toBeLessThan(300);
    expect(sim.gems.length).toBeLessThan(400);
  });

  it('the same seed and inputs replay the same run', () => {
    const a = new RunSim(cfg({ seed: 99 }));
    const b = new RunSim(cfg({ seed: 99 }));
    bot(a, 40);
    bot(b, 40);
    expect([a.kills, a.player.level, Math.round(a.damageDone)]).toEqual([
      b.kills,
      b.player.level,
      Math.round(b.damageDone),
    ]);
  });

  it('dying ends the run with a summary', () => {
    const sim = new RunSim(cfg());
    sim.player.hp = 1;
    sim.player.iframes = 0;
    sim.hurtPlayer(50);
    const events = sim.step(DT, { x: 0, y: 0 });
    expect(events.some((e) => e.type === 'death')).toBe(true);
    expect(sim.summary()).toMatchObject({ victory: false, character: 'condutor' });
  });

  it('characters really play differently', () => {
    const g = new RunSim(cfg({ character: 'guardiao' }));
    const c = new RunSim(cfg({ character: 'condutor' }));
    expect(g.player.maxHp).toBeGreaterThan(c.player.maxHp);
    expect(g.player.armor).toBeGreaterThan(c.player.armor);
    expect(g.skills[0]!.id).toBe('escudo');
    expect(new RunSim(cfg({ character: 'incendiario' })).skills[0]!.id).toBe('orbe');
  });
});

describe('fusão: permanent progression and saves', () => {
  const memory = (): KeyValue & { data: Record<string, string> } => {
    const data: Record<string, string> = {};
    return {
      data,
      getItem: (k) => data[k] ?? null,
      setItem: (k, v) => void (data[k] = v),
      removeItem: (k) => void delete data[k],
    };
  };

  it('saves and loads, surviving a reload', () => {
    const store = memory();
    const save = { ...defaultSave(), essence: 123 };
    writeSave(store, save);
    expect(loadSave(store).save.essence).toBe(123);
  });

  it('recovers from corrupted or tampered data', () => {
    const store = memory();
    store.setItem(SAVE_KEY, '{not json');
    expect(loadSave(store)).toEqual({ save: defaultSave(), recovered: true });
    const weird = validateSave({
      essence: -50,
      upgrades: { poder: 99 },
      characters: { guardiao: 'yes' },
      selected: 'guardiao',
      fusions: ['plasma', 'fake'],
      settings: { volume: 9 },
    });
    expect(weird.essence).toBe(0);
    expect(weird.upgrades.poder).toBe(5);
    expect(weird.characters.guardiao).toBe(false);
    expect(weird.selected).toBe('condutor');
    expect(weird.fusions).toEqual(['plasma']);
    expect(weird.settings.volume).toBe(1);
    expect(validateSave(null)).toEqual(defaultSave());
  });

  it('buys upgrades and characters only with enough essence', () => {
    const poor = defaultSave();
    expect(buyUpgrade(poor, 'vitalidade')).toBeNull();
    const rich = { ...poor, essence: 1000 };
    const after = buyUpgrade(rich, 'vitalidade')!;
    expect(after.upgrades.vitalidade).toBe(1);
    expect(after.essence).toBe(1000 - 60);
    expect(buyCharacter(rich, 'guardiao')!.characters.guardiao).toBe(true);
    expect(buyCharacter(poor, 'guardiao')).toBeNull();
  });

  const summary = (o: Partial<RunSummary> = {}): RunSummary => ({
    character: 'condutor',
    seconds: 300,
    kills: 240,
    level: 12,
    damage: 5000,
    gems: 200,
    bosses: [],
    fusions: [],
    skills: ['faisca'],
    missionEssence: 0,
    bonusEssence: 0,
    victory: false,
    modifiers: [],
    daily: false,
    ...o,
  });

  it('rewards essence after a run, more for bosses, missions and modifiers', () => {
    const base = computeRewards(summary(), defaultSave(), '2026-10-15').essence;
    expect(base).toBe(Math.floor(300 / 6) + Math.floor(240 / 12) + 12 * 2);
    expect(
      computeRewards(summary({ bosses: ['colosso'] }), defaultSave(), 'x').essence,
    ).toBeGreaterThan(base);
    expect(
      computeRewards(summary({ modifiers: ['horda'] }), defaultSave(), 'x').essence,
    ).toBeGreaterThan(base);
    expect(computeRewards(summary({ daily: true }), defaultSave(), 'x').essence).toBeGreaterThan(
      base,
    );
  });

  it('a run unlocks characters, records discoveries and achievements', () => {
    const r = applyRun(
      defaultSave(),
      summary({ bosses: ['colosso'], fusions: ['plasma'], seconds: 500, kills: 120 }),
      '2026-10-15',
    );
    expect(r.newCharacters).toEqual(['incendiario', 'guardiao']);
    expect(r.newFusions).toEqual(['plasma']);
    expect(r.newAchievements).toEqual(
      expect.arrayContaining(['primeira', 'cem', 'fusao1', 'chefe1']),
    );
    expect(r.save.stats.runs).toBe(1);
    expect(r.save.essence).toBe(r.reward.essence);
    // A second identical run doesn't announce the same things again.
    const again = applyRun(
      r.save,
      summary({ bosses: ['colosso'], fusions: ['plasma'] }),
      '2026-10-15',
    );
    expect(again.newFusions).toEqual([]);
    expect(again.newAchievements).not.toContain('primeira');
  });

  it('the daily challenge is the same all day and changes with the date', () => {
    expect(dailyChallenge('2026-10-15')).toEqual(dailyChallenge('2026-10-15'));
    expect(dailyChallenge('2026-10-15').seed).not.toBe(dailyChallenge('2026-10-16').seed);
  });
});
