/**
 * Permanent progression: the save file (validated on load, corrupted data falls back to
 * defaults), rewards after a run, purchases, unlocks, achievements and the daily challenge.
 */
import {
  ACHIEVEMENT_IDS,
  BOSSES,
  BOSS_ORDER,
  CHARACTER_IDS,
  CHARACTERS,
  FUSION_IDS,
  FUSIONS,
  META_IDS,
  META_UPGRADES,
  MODIFIER_IDS,
  MODIFIERS,
  SKILL_IDS,
  type AchievementId,
  type BossKind,
  type CharacterId,
  type FusionId,
  type MetaUpgradeId,
  type ModifierId,
  type SkillId,
} from './defs';
import { hashSeed, mulberry32, pick } from './rng';

export const SAVE_KEY = 'fusao-infinita-save';
export const SAVE_VERSION = 1;

export type Quality = 'alta' | 'media' | 'baixa';

export interface Settings {
  volume: number;
  intenseFx: boolean;
  shake: boolean;
  quality: Quality;
}

export interface Stats {
  runs: number;
  victories: number;
  kills: number;
  seconds: number;
  bestSeconds: number;
  bestLevel: number;
  bestScore: number;
  bosses: number;
  essenceEarned: number;
}

export interface Save {
  version: number;
  essence: number;
  upgrades: Record<MetaUpgradeId, number>;
  characters: Record<CharacterId, boolean>;
  selected: CharacterId;
  skillsSeen: SkillId[];
  fusions: FusionId[];
  bossesDefeated: BossKind[];
  achievements: AchievementId[];
  stats: Stats;
  daily: { date: string; done: boolean };
  modifiers: ModifierId[];
  settings: Settings;
}

export function defaultSave(): Save {
  return {
    version: SAVE_VERSION,
    essence: 0,
    upgrades: { vitalidade: 0, mobilidade: 0, poder: 0, coleta: 0, fortuna: 0 },
    characters: { condutor: true, incendiario: false, guardiao: false },
    selected: 'condutor',
    skillsSeen: [],
    fusions: [],
    bossesDefeated: [],
    achievements: [],
    stats: {
      runs: 0,
      victories: 0,
      kills: 0,
      seconds: 0,
      bestSeconds: 0,
      bestLevel: 0,
      bestScore: 0,
      bosses: 0,
      essenceEarned: 0,
    },
    daily: { date: '', done: false },
    modifiers: [],
    settings: { volume: 0.8, intenseFx: true, shake: true, quality: 'alta' },
  };
}

const num = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const int = (v: unknown, min: number, max: number, fallback: number) =>
  Math.round(num(v, min, max, fallback));
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const listOf = <T extends string>(v: unknown, allowed: readonly T[]): T[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is T => allowed.includes(x as T)))] : [];

/** Turns anything (parsed JSON, garbage, an old version) into a valid save. Never throws. */
export function validateSave(raw: unknown): Save {
  const d = defaultSave();
  const r = obj(raw);
  const up = obj(r.upgrades);
  const ch = obj(r.characters);
  const st = obj(r.stats);
  const se = obj(r.settings);
  const da = obj(r.daily);
  const upgrades = { ...d.upgrades };
  for (const id of META_IDS) upgrades[id] = int(up[id], 0, META_UPGRADES[id].maxLevel, 0);
  const characters = { ...d.characters };
  for (const id of CHARACTER_IDS) characters[id] = id === 'condutor' || bool(ch[id], false);
  const selected =
    CHARACTER_IDS.includes(r.selected as CharacterId) && characters[r.selected as CharacterId]
      ? (r.selected as CharacterId)
      : 'condutor';
  const big = 1e9;
  return {
    version: SAVE_VERSION,
    essence: int(r.essence, 0, big, 0),
    upgrades,
    characters,
    selected,
    skillsSeen: listOf(r.skillsSeen, SKILL_IDS),
    fusions: listOf(r.fusions, FUSION_IDS),
    bossesDefeated: listOf(r.bossesDefeated, BOSS_ORDER),
    achievements: listOf(r.achievements, ACHIEVEMENT_IDS),
    stats: {
      runs: int(st.runs, 0, big, 0),
      victories: int(st.victories, 0, big, 0),
      kills: int(st.kills, 0, big, 0),
      seconds: num(st.seconds, 0, big, 0),
      bestSeconds: num(st.bestSeconds, 0, big, 0),
      bestLevel: int(st.bestLevel, 0, 999, 0),
      bestScore: int(st.bestScore, 0, big, 0),
      bosses: int(st.bosses, 0, big, 0),
      essenceEarned: int(st.essenceEarned, 0, big, 0),
    },
    daily: {
      date: typeof da.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(da.date) ? da.date : '',
      done: bool(da.done, false),
    },
    modifiers: listOf(r.modifiers, MODIFIER_IDS),
    settings: {
      volume: num(se.volume, 0, 1, d.settings.volume),
      intenseFx: bool(se.intenseFx, true),
      shake: bool(se.shake, true),
      quality: (['alta', 'media', 'baixa'] as const).includes(se.quality as Quality)
        ? (se.quality as Quality)
        : 'alta',
    },
  };
}

export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Loads the save; `recovered` is true when the stored data was unreadable and got reset. */
export function loadSave(store: KeyValue | null): { save: Save; recovered: boolean } {
  let raw: string | null;
  try {
    raw = store?.getItem(SAVE_KEY) ?? null;
  } catch {
    return { save: defaultSave(), recovered: false };
  }
  if (raw === null) return { save: defaultSave(), recovered: false };
  try {
    return { save: validateSave(JSON.parse(raw)), recovered: false };
  } catch {
    return { save: defaultSave(), recovered: true };
  }
}

export function writeSave(store: KeyValue | null, save: Save): boolean {
  try {
    store?.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

// ── Bonuses from the permanent tree ──────────────────────────────────────

export interface MetaBonuses {
  hp: number;
  speed: number;
  might: number;
  xp: number;
  essence: number;
}

export function metaBonuses(save: Save): MetaBonuses {
  const u = save.upgrades;
  return {
    hp: u.vitalidade * 8,
    speed: 1 + u.mobilidade * 0.03,
    might: 1 + u.poder * 0.04,
    xp: 1 + u.coleta * 0.06,
    essence: 1 + u.fortuna * 0.08,
  };
}

export function buyUpgrade(save: Save, id: MetaUpgradeId): Save | null {
  const level = save.upgrades[id];
  const def = META_UPGRADES[id];
  if (level >= def.maxLevel) return null;
  const cost = def.cost(level);
  if (save.essence < cost) return null;
  return { ...save, essence: save.essence - cost, upgrades: { ...save.upgrades, [id]: level + 1 } };
}

export function buyCharacter(save: Save, id: CharacterId): Save | null {
  const unlock = CHARACTERS[id].unlock;
  if (save.characters[id] || !unlock || save.essence < unlock.price) return null;
  return {
    ...save,
    essence: save.essence - unlock.price,
    characters: { ...save.characters, [id]: true },
  };
}

/** Modifiers become available after beating the second boss once. */
export const modifiersUnlocked = (save: Save): boolean => save.bossesDefeated.includes('tecela');

// ── Daily challenge ──────────────────────────────────────────────────────

export const dateKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Same challenge for everyone on a given (local) date: seed, character and one modifier. */
export function dailyChallenge(date: string): {
  seed: number;
  character: CharacterId;
  modifier: ModifierId;
} {
  const seed = hashSeed(`fusao-${date}`);
  const rng = mulberry32(seed);
  return { seed, character: pick(rng, CHARACTER_IDS), modifier: pick(rng, MODIFIER_IDS) };
}

// ── End of a run ─────────────────────────────────────────────────────────

export interface RunSummary {
  character: CharacterId;
  seconds: number;
  kills: number;
  level: number;
  damage: number;
  gems: number;
  bosses: BossKind[];
  fusions: FusionId[];
  skills: SkillId[];
  missionEssence: number;
  bonusEssence: number;
  victory: boolean;
  modifiers: ModifierId[];
  daily: boolean;
}

export interface Reward {
  essence: number;
  lines: { label: string; amount: number }[];
}

/** Essence earned by a run: survival, kills, level, bosses and missions, then multipliers. */
export function computeRewards(s: RunSummary, save: Save, today: string): Reward {
  const lines: { label: string; amount: number }[] = [
    { label: 'Tempo sobrevivido', amount: Math.floor(s.seconds / 6) },
    { label: 'Inimigos derrotados', amount: Math.floor(s.kills / 12) },
    { label: 'Nível alcançado', amount: s.level * 2 },
  ];
  const bosses = s.bosses.reduce((sum, b) => sum + BOSSES[b].essence, 0);
  if (bosses) lines.push({ label: 'Chefes', amount: bosses });
  if (s.missionEssence) lines.push({ label: 'Missões', amount: s.missionEssence });
  if (s.bonusEssence) lines.push({ label: 'Bônus', amount: s.bonusEssence });
  if (s.victory) lines.push({ label: 'Vitória', amount: 150 });
  const base = lines.reduce((sum, l) => sum + l.amount, 0);
  let mult = metaBonuses(save).essence;
  for (const m of s.modifiers) mult += MODIFIERS[m].essence;
  const firstDaily = s.daily && !(save.daily.date === today && save.daily.done);
  if (firstDaily) mult += 0.5;
  const essence = Math.round(base * mult);
  if (essence > base) lines.push({ label: 'Multiplicadores', amount: essence - base });
  return { essence, lines };
}

/** Score sent to the ranking: survival dominates, kills and level break ties. */
export const runScore = (s: RunSummary): number =>
  Math.round(
    s.seconds * 10 + s.kills * 2 + s.level * 25 + s.bosses.length * 500 + (s.victory ? 3000 : 0),
  );

export interface RunResult {
  save: Save;
  reward: Reward;
  newAchievements: AchievementId[];
  newFusions: FusionId[];
  newCharacters: CharacterId[];
  newBest: boolean;
}

/** Applies a finished run to the save (stats, discoveries, unlocks, achievements, essence). */
export function applyRun(prev: Save, s: RunSummary, today: string): RunResult {
  const reward = computeRewards(s, prev, today);
  const score = runScore(s);
  const fusions = [...new Set([...prev.fusions, ...s.fusions])];
  const bosses = [...new Set([...prev.bossesDefeated, ...s.bosses])];
  const stats: Stats = {
    runs: prev.stats.runs + 1,
    victories: prev.stats.victories + (s.victory ? 1 : 0),
    kills: prev.stats.kills + s.kills,
    seconds: prev.stats.seconds + s.seconds,
    bestSeconds: Math.max(prev.stats.bestSeconds, s.seconds),
    bestLevel: Math.max(prev.stats.bestLevel, s.level),
    bestScore: Math.max(prev.stats.bestScore, score),
    bosses: prev.stats.bosses + s.bosses.length,
    essenceEarned: prev.stats.essenceEarned + reward.essence,
  };
  const characters = { ...prev.characters };
  if (bosses.includes('colosso')) characters.incendiario = true;
  if (stats.bestSeconds >= 480) characters.guardiao = true;
  let save: Save = {
    ...prev,
    essence: prev.essence + reward.essence,
    fusions,
    bossesDefeated: bosses,
    skillsSeen: [...new Set([...prev.skillsSeen, ...s.skills])],
    characters,
    stats,
    daily: s.daily ? { date: today, done: true } : prev.daily,
  };
  const earned = new Set<AchievementId>(prev.achievements);
  const grant = (id: AchievementId, cond: boolean) => cond && earned.add(id);
  grant('primeira', true);
  grant('cem', s.kills >= 100);
  grant('mil', stats.kills >= 1000);
  grant('fusao1', fusions.length > 0);
  grant(
    'fusoes',
    FUSION_IDS.filter((f) => !FUSIONS[f].secret).every((f) => fusions.includes(f)),
  );
  grant(
    'secreta',
    fusions.some((f) => FUSIONS[f].secret),
  );
  grant('chefe1', bosses.includes('colosso'));
  grant('chefe2', bosses.includes('tecela'));
  grant('chefe3', bosses.includes('eclipse'));
  grant('vitoria', s.victory);
  grant('nivel20', s.level >= 20);
  grant(
    'todos',
    CHARACTER_IDS.every((c) => characters[c]),
  );
  grant('diario', s.daily);
  save = { ...save, achievements: ACHIEVEMENT_IDS.filter((a) => earned.has(a)) };
  return {
    save,
    reward,
    newAchievements: save.achievements.filter((a) => !prev.achievements.includes(a)),
    newFusions: fusions.filter((f) => !prev.fusions.includes(f)),
    newCharacters: CHARACTER_IDS.filter((c) => characters[c] && !prev.characters[c]),
    newBest: score > prev.stats.bestScore,
  };
}
