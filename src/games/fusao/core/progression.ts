import {
  FUSION_IDS,
  FUSION_MIN_LEVEL,
  FUSIONS,
  MAX_SKILL_LEVEL,
  MAX_SKILLS,
  PASSIVE_IDS,
  PASSIVES,
  RARITY_INFO,
  SKILL_IDS,
  SKILLS,
  type FusionId,
  type PassiveId,
  type Rarity,
  type SkillId,
} from './defs';
import { weighted, type Rng } from './rng';

/** A skill the player owns during a run (a fusion replaces its two parts). */
export interface OwnedSkill {
  readonly id: SkillId | FusionId;
  level: number;
  readonly fusion: boolean;
}

export interface Build {
  readonly skills: readonly OwnedSkill[];
  readonly passives: Readonly<Partial<Record<PassiveId, number>>>;
  /** 0..1 */
  readonly hpRatio: number;
}

export type Offer =
  | { kind: 'new'; skill: SkillId; rarity: Rarity }
  | { kind: 'upgrade'; skill: SkillId; level: number; rarity: Rarity }
  | { kind: 'passive'; passive: PassiveId; level: number; rarity: Rarity }
  | { kind: 'fusion'; fusion: FusionId; rarity: 'fusao' }
  | { kind: 'heal'; rarity: Rarity }
  | { kind: 'essence'; amount: number; rarity: Rarity };

const owned = (b: Build, id: SkillId | FusionId) => b.skills.find((s) => s.id === id);

/** Fusions whose two parts are owned at the required level and not fused yet. */
export function eligibleFusions(b: Build): FusionId[] {
  return FUSION_IDS.filter((f) => {
    if (owned(b, f)) return false;
    return FUSIONS[f].requires.every((part) => {
      const s = owned(b, part);
      return !!s && !s.fusion && s.level >= FUSION_MIN_LEVEL;
    });
  });
}

/**
 * Three distinct, valid choices for a level-up. An available fusion is always among them;
 * maxed skills and passives are never offered; when nothing is left, heal/essence fill in.
 * `boost` (boss chests) favours rarer options.
 */
export function generateOffers(b: Build, rng: Rng, count = 3, boost = false): Offer[] {
  const offers: Offer[] = [];
  const fusions = eligibleFusions(b);
  if (fusions.length)
    offers.push({
      kind: 'fusion',
      fusion: fusions[Math.floor(rng() * fusions.length)]!,
      rarity: 'fusao',
    });

  const weightOf = (r: Rarity) => RARITY_INFO[r].weight * (boost && r !== 'comum' ? 2.2 : 1);
  const pool: { w: number; v: Offer }[] = [];
  const slotsFree = b.skills.length < MAX_SKILLS;
  for (const id of SKILL_IDS) {
    const s = owned(b, id);
    const rarity = SKILLS[id].rarity;
    if (s && s.level < MAX_SKILL_LEVEL)
      pool.push({
        w: weightOf(rarity) * 1.4,
        v: { kind: 'upgrade', skill: id, level: s.level + 1, rarity },
      });
    // A skill already used in a fusion can't come back.
    const fusedAway = b.skills.some(
      (o) => o.fusion && FUSIONS[o.id as FusionId].requires.includes(id),
    );
    if (!s && slotsFree && !fusedAway)
      pool.push({ w: weightOf(rarity), v: { kind: 'new', skill: id, rarity } });
  }
  for (const id of PASSIVE_IDS) {
    const level = b.passives[id] ?? 0;
    if (level < PASSIVES[id].maxLevel)
      pool.push({
        w: weightOf(PASSIVES[id].rarity) * 0.8,
        v: { kind: 'passive', passive: id, level: level + 1, rarity: PASSIVES[id].rarity },
      });
  }
  if (b.hpRatio < 0.7) pool.push({ w: 6, v: { kind: 'heal', rarity: 'comum' } });

  while (offers.length < count && pool.length) {
    const choice = weighted(rng, pool);
    if (!choice) break;
    offers.push(choice);
    pool.splice(
      pool.findIndex((p) => p.v === choice),
      1,
    );
  }
  // Nothing left to improve: still three valid choices.
  if (offers.length < count && !offers.some((o) => o.kind === 'heal'))
    offers.push({ kind: 'heal', rarity: 'comum' });
  while (offers.length < count)
    offers.push({ kind: 'essence', amount: 15 + offers.length * 5, rarity: 'comum' });
  return offers;
}

/** Damage a hit deals: base × the player's power, never negative. */
export const damageDealt = (base: number, might: number, mult = 1): number =>
  Math.max(0, base * might * mult);

/** Damage the player takes after armor (a hit always hurts at least 1). */
export const damageTaken = (raw: number, armor: number): number =>
  raw <= 0 ? 0 : Math.max(1, raw - armor);

/** Effective cooldown with the player's reduction, with a floor so nothing fires every frame. */
export const cooldownOf = (base: number, mult: number): number => Math.max(0.12, base * mult);

/** Experience after a gain: how many level-ups it produced and what is left. */
export function addXp(level: number, xp: number, gain: number, toNext: (l: number) => number) {
  let l = level;
  let x = xp + gain;
  let ups = 0;
  while (x >= toNext(l)) {
    x -= toNext(l);
    l++;
    ups++;
  }
  return { level: l, xp: x, ups };
}
