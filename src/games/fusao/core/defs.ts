/**
 * FUSÃO INFINITA — game data and balance. Everything tunable lives here, so balancing never
 * means touching the simulation code. Units: pixels, seconds.
 */

export type Rarity = 'comum' | 'incomum' | 'rara' | 'epica' | 'fusao';

export const RARITY_INFO: Record<Rarity, { name: string; color: number; weight: number }> = {
  comum: { name: 'Comum', color: 0x9aa5b8, weight: 10 },
  incomum: { name: 'Incomum', color: 0x5bd46f, weight: 6 },
  rara: { name: 'Rara', color: 0x4cc9f0, weight: 3.5 },
  epica: { name: 'Épica', color: 0xc77dff, weight: 1.6 },
  fusao: { name: 'Fusão', color: 0xffd23f, weight: 0 },
};

// ── Arena and run ────────────────────────────────────────────────────────

export const ARENA = { w: 2600, h: 2600 } as const;
export const RUN_LENGTH_S = 720;
export const BOSS_TIMES = [180, 360, 540] as const;
export const MAX_SKILLS = 6;
export const MAX_SKILL_LEVEL = 5;
export const FUSION_MIN_LEVEL = 4;

/** Experience needed to go from `level` to `level + 1`: grows, but gently. */
export const xpToNext = (level: number): number =>
  Math.round(6 + 4 * (level - 1) + 0.35 * (level - 1) ** 2);

// ── Characters ───────────────────────────────────────────────────────────

export type CharacterId = 'condutor' | 'incendiario' | 'guardiao';

export interface CharacterDef {
  readonly id: CharacterId;
  readonly name: string;
  readonly title: string;
  readonly color: number;
  readonly maxHp: number;
  readonly speed: number;
  readonly might: number;
  readonly armor: number;
  readonly regen: number;
  readonly cooldown: number;
  readonly burn: number;
  readonly start: SkillId;
  readonly perk: string;
  /** How to unlock it (besides buying with essence). */
  readonly unlock: { text: string; price: number } | null;
}

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  condutor: {
    id: 'condutor',
    name: 'Condutor',
    title: 'Equilíbrio e reflexo',
    color: 0x4cc9f0,
    maxHp: 100,
    speed: 215,
    might: 1,
    armor: 0,
    regen: 0,
    cooldown: 0.92,
    burn: 1,
    start: 'faisca',
    perk: 'Recarga 8% mais rápida',
    unlock: null,
  },
  incendiario: {
    id: 'incendiario',
    name: 'Incendiário',
    title: 'Fogo que não apaga',
    color: 0xff7b00,
    maxHp: 90,
    speed: 205,
    might: 1.15,
    armor: 0,
    regen: 0,
    cooldown: 1,
    burn: 1.6,
    start: 'orbe',
    perk: 'Dano +15% e queimaduras 60% mais fortes',
    unlock: { text: 'Derrote o primeiro chefe', price: 400 },
  },
  guardiao: {
    id: 'guardiao',
    name: 'Guardião',
    title: 'Muralha viva',
    color: 0x5bd46f,
    maxHp: 140,
    speed: 185,
    might: 0.95,
    armor: 3,
    regen: 0.6,
    cooldown: 1,
    burn: 1,
    start: 'escudo',
    perk: 'Armadura 3 e regenera vida',
    unlock: { text: 'Sobreviva 8 minutos', price: 700 },
  },
};

export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];

// ── Skills ───────────────────────────────────────────────────────────────

export type SkillId =
  | 'faisca'
  | 'orbe'
  | 'escudo'
  | 'laminas'
  | 'explosao'
  | 'raio'
  | 'gravidade'
  | 'drones'
  | 'pulso'
  | 'nova';

export type FusionId = 'plasma' | 'ruptura' | 'enxame' | 'vortice' | 'dimensional' | 'colapso';

/** Per-level numbers; each skill reads the fields it uses. */
export interface SkillLevel {
  readonly damage: number;
  readonly cooldown: number;
  readonly count: number;
  readonly area: number;
  readonly duration: number;
  readonly pierce: number;
  readonly speed: number;
}

const lv = (o: Partial<SkillLevel>): SkillLevel => ({
  damage: 0,
  cooldown: 1,
  count: 1,
  area: 0,
  duration: 0,
  pierce: 0,
  speed: 0,
  ...o,
});

export interface SkillDef {
  readonly id: SkillId;
  readonly name: string;
  readonly desc: string;
  readonly rarity: Rarity;
  readonly color: number;
  /** What reaching each level adds (index = level, 1-based; [0] and [1] unused). */
  readonly upgrades: readonly string[];
  readonly levels: readonly SkillLevel[];
}

export const SKILLS: Record<SkillId, SkillDef> = {
  faisca: {
    id: 'faisca',
    name: 'Projétil Elétrico',
    desc: 'Dispara faíscas contra os inimigos mais próximos.',
    rarity: 'comum',
    color: 0x4cc9f0,
    upgrades: ['', '', '+1 faísca', 'Dano +40%', 'Atravessa 1 inimigo', '+1 faísca e recarga −20%'],
    levels: [
      lv({ damage: 9, cooldown: 0.85, count: 1, speed: 620 }),
      lv({ damage: 9, cooldown: 0.85, count: 2, speed: 620 }),
      lv({ damage: 12.6, cooldown: 0.85, count: 2, speed: 640 }),
      lv({ damage: 12.6, cooldown: 0.85, count: 2, speed: 660, pierce: 1 }),
      lv({ damage: 14, cooldown: 0.68, count: 3, speed: 680, pierce: 1 }),
    ],
  },
  orbe: {
    id: 'orbe',
    name: 'Orbe de Fogo',
    desc: 'Lança um orbe que explode e deixa os inimigos queimando.',
    rarity: 'comum',
    color: 0xff7b00,
    upgrades: ['', '', 'Explosão maior', 'Queima mais forte', '+1 orbe', 'Dano +50%'],
    levels: [
      lv({ damage: 14, cooldown: 1.6, area: 60, duration: 2.5, speed: 380 }),
      lv({ damage: 14, cooldown: 1.6, area: 82, duration: 2.5, speed: 380 }),
      lv({ damage: 16, cooldown: 1.5, area: 82, duration: 3.5, speed: 400 }),
      lv({ damage: 16, cooldown: 1.5, area: 90, duration: 3.5, speed: 400, count: 2 }),
      lv({ damage: 24, cooldown: 1.4, area: 100, duration: 4, speed: 420, count: 2 }),
    ],
  },
  escudo: {
    id: 'escudo',
    name: 'Escudo de Energia',
    desc: 'Absorve dano. Se quebrar, recarrega depois de um tempo.',
    rarity: 'incomum',
    color: 0x5bd46f,
    upgrades: [
      '',
      '',
      'Absorve mais',
      'Recarga −25%',
      'Ao quebrar, empurra inimigos',
      'Absorve muito mais',
    ],
    levels: [
      lv({ damage: 20, cooldown: 9 }),
      lv({ damage: 32, cooldown: 9 }),
      lv({ damage: 32, cooldown: 6.8 }),
      lv({ damage: 40, cooldown: 6.8, area: 180 }),
      lv({ damage: 60, cooldown: 6, area: 220 }),
    ],
  },
  laminas: {
    id: 'laminas',
    name: 'Lâmina Orbital',
    desc: 'Lâminas giram ao seu redor cortando o que tocarem.',
    rarity: 'incomum',
    color: 0xe0e7ff,
    upgrades: ['', '', '+1 lâmina', 'Giro mais largo', '+1 lâmina', 'Dano +60% e giro mais rápido'],
    levels: [
      lv({ damage: 8, count: 2, area: 95, speed: 3.2, cooldown: 0.4 }),
      lv({ damage: 8, count: 3, area: 95, speed: 3.2, cooldown: 0.4 }),
      lv({ damage: 9, count: 3, area: 120, speed: 3.4, cooldown: 0.4 }),
      lv({ damage: 9, count: 4, area: 125, speed: 3.6, cooldown: 0.38 }),
      lv({ damage: 14.5, count: 4, area: 135, speed: 4.4, cooldown: 0.35 }),
    ],
  },
  explosao: {
    id: 'explosao',
    name: 'Explosão de Energia',
    desc: 'Detona energia no meio dos grupos de inimigos.',
    rarity: 'incomum',
    color: 0xff5d8f,
    upgrades: ['', '', 'Área maior', 'Recarga −20%', '+1 explosão', 'Dano +60%'],
    levels: [
      lv({ damage: 22, cooldown: 2.6, area: 90, count: 1 }),
      lv({ damage: 22, cooldown: 2.6, area: 120, count: 1 }),
      lv({ damage: 24, cooldown: 2.1, area: 120, count: 1 }),
      lv({ damage: 24, cooldown: 2.1, area: 125, count: 2 }),
      lv({ damage: 38, cooldown: 2, area: 135, count: 2 }),
    ],
  },
  raio: {
    id: 'raio',
    name: 'Raio Encadeado',
    desc: 'Um raio que salta de inimigo em inimigo.',
    rarity: 'rara',
    color: 0xc77dff,
    upgrades: ['', '', '+2 saltos', 'Dano +40%', 'Recarga −25%', '+3 saltos e 2 raios'],
    levels: [
      lv({ damage: 13, cooldown: 1.9, count: 1, pierce: 3, area: 170 }),
      lv({ damage: 13, cooldown: 1.9, count: 1, pierce: 5, area: 170 }),
      lv({ damage: 18, cooldown: 1.9, count: 1, pierce: 5, area: 180 }),
      lv({ damage: 18, cooldown: 1.42, count: 1, pierce: 5, area: 190 }),
      lv({ damage: 20, cooldown: 1.4, count: 2, pierce: 8, area: 200 }),
    ],
  },
  gravidade: {
    id: 'gravidade',
    name: 'Campo Gravitacional',
    desc: 'Uma aura que deixa os inimigos lentos perto de você.',
    rarity: 'rara',
    color: 0x7b6cff,
    upgrades: [
      '',
      '',
      'Raio maior',
      'Também causa dano',
      'Lentidão mais forte',
      'Raio e dano maiores',
    ],
    levels: [
      lv({ damage: 0, area: 150, duration: 0.45 }),
      lv({ damage: 0, area: 185, duration: 0.45 }),
      lv({ damage: 4, area: 185, duration: 0.45 }),
      lv({ damage: 5, area: 195, duration: 0.6 }),
      lv({ damage: 8, area: 230, duration: 0.62 }),
    ],
  },
  drones: {
    id: 'drones',
    name: 'Drones',
    desc: 'Pequenos drones que caçam e atiram nos inimigos.',
    rarity: 'rara',
    color: 0x06d6a0,
    upgrades: ['', '', '+1 drone', 'Tiro mais rápido', '+1 drone', 'Dano +50%'],
    levels: [
      lv({ damage: 7, cooldown: 1.1, count: 1, area: 340, speed: 560 }),
      lv({ damage: 7, cooldown: 1.1, count: 2, area: 340, speed: 560 }),
      lv({ damage: 7.5, cooldown: 0.8, count: 2, area: 360, speed: 600 }),
      lv({ damage: 7.5, cooldown: 0.8, count: 3, area: 360, speed: 600 }),
      lv({ damage: 11, cooldown: 0.75, count: 3, area: 380, speed: 640 }),
    ],
  },
  pulso: {
    id: 'pulso',
    name: 'Pulso de Velocidade',
    desc: 'De tempos em tempos você dispara em alta velocidade.',
    rarity: 'comum',
    color: 0xffd23f,
    upgrades: ['', '', 'Dura mais', 'Fica invulnerável no pulso', 'Mais rápido', 'Recarga −30%'],
    levels: [
      lv({ cooldown: 7, duration: 1.6, speed: 0.6 }),
      lv({ cooldown: 7, duration: 2.3, speed: 0.6 }),
      lv({ cooldown: 7, duration: 2.3, speed: 0.6, pierce: 1 }),
      lv({ cooldown: 6.5, duration: 2.4, speed: 0.85, pierce: 1 }),
      lv({ cooldown: 4.6, duration: 2.5, speed: 0.9, pierce: 1 }),
    ],
  },
  nova: {
    id: 'nova',
    name: 'Nova de Energia',
    desc: 'Explode em anel ao seu redor, empurrando os inimigos.',
    rarity: 'incomum',
    color: 0xffffff,
    upgrades: ['', '', 'Anel maior', 'Dano +40%', 'Recarga −25%', 'Anel duplo'],
    levels: [
      lv({ damage: 16, cooldown: 4, area: 150, count: 1 }),
      lv({ damage: 16, cooldown: 4, area: 190, count: 1 }),
      lv({ damage: 22, cooldown: 4, area: 190, count: 1 }),
      lv({ damage: 22, cooldown: 3, area: 200, count: 1 }),
      lv({ damage: 26, cooldown: 2.8, area: 210, count: 2 }),
    ],
  },
};

export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];

export interface FusionDef {
  readonly id: FusionId;
  readonly name: string;
  readonly desc: string;
  readonly color: number;
  readonly requires: readonly [SkillId, SkillId];
  /** Hidden in the collection until discovered. */
  readonly secret: boolean;
  readonly stats: SkillLevel;
}

export const FUSIONS: Record<FusionId, FusionDef> = {
  plasma: {
    id: 'plasma',
    name: 'Tempestade de Plasma',
    desc: 'Orbes de plasma soltam arcos elétricos em quem estiver perto e explodem queimando tudo.',
    color: 0xff3df2,
    requires: ['orbe', 'faisca'],
    secret: false,
    stats: lv({ damage: 26, cooldown: 1.3, area: 120, duration: 3.5, speed: 300, count: 2 }),
  },
  ruptura: {
    id: 'ruptura',
    name: 'Ruptura Defensiva',
    desc: 'Cada golpe absorvido pelo escudo vira uma onda de choque. Quando ele volta, explode.',
    color: 0x9bf6ff,
    requires: ['escudo', 'explosao'],
    secret: false,
    stats: lv({ damage: 36, cooldown: 4.5, area: 210 }),
  },
  enxame: {
    id: 'enxame',
    name: 'Enxame Condutor',
    desc: 'Drones ligados por correntes elétricas e que disparam raios encadeados.',
    color: 0x00f5d4,
    requires: ['drones', 'raio'],
    secret: false,
    stats: lv({ damage: 16, cooldown: 0.9, count: 4, area: 420, pierce: 4, speed: 2 }),
  },
  vortice: {
    id: 'vortice',
    name: 'Vórtice Cortante',
    desc: 'Um redemoinho puxa os inimigos para dentro de um anel de lâminas.',
    color: 0xa0c4ff,
    requires: ['laminas', 'gravidade'],
    secret: false,
    stats: lv({ damage: 16, count: 6, area: 150, speed: 5, cooldown: 0.3, duration: 280 }),
  },
  dimensional: {
    id: 'dimensional',
    name: 'Ruptura Dimensional',
    desc: 'No pulso você fica intocável e deixa fendas que detonam como novas.',
    color: 0xffd6ff,
    requires: ['pulso', 'nova'],
    secret: false,
    stats: lv({ damage: 34, cooldown: 4, area: 130, duration: 2.6, speed: 0.9 }),
  },
  colapso: {
    id: 'colapso',
    name: 'Colapso Estelar',
    desc: 'Segredo: uma estrela anã puxa os inimigos e implode em um clarão.',
    color: 0xffb703,
    requires: ['nova', 'gravidade'],
    secret: true,
    stats: lv({ damage: 55, cooldown: 3.6, area: 260, duration: 1.1 }),
  },
};

export const FUSION_IDS = Object.keys(FUSIONS) as FusionId[];

// ── Passive upgrades (in-run) ────────────────────────────────────────────

export type PassiveId =
  'vigor' | 'agilidade' | 'potencia' | 'foco' | 'alcance' | 'ima' | 'regeneracao';

export interface PassiveDef {
  readonly id: PassiveId;
  readonly name: string;
  readonly desc: string;
  readonly rarity: Rarity;
  readonly maxLevel: number;
}

export const PASSIVES: Record<PassiveId, PassiveDef> = {
  vigor: { id: 'vigor', name: 'Vigor', desc: 'Vida máxima +20', rarity: 'comum', maxLevel: 5 },
  agilidade: {
    id: 'agilidade',
    name: 'Agilidade',
    desc: 'Velocidade +8%',
    rarity: 'comum',
    maxLevel: 5,
  },
  potencia: { id: 'potencia', name: 'Potência', desc: 'Dano +10%', rarity: 'incomum', maxLevel: 5 },
  foco: { id: 'foco', name: 'Foco', desc: 'Recarga −7%', rarity: 'incomum', maxLevel: 5 },
  alcance: {
    id: 'alcance',
    name: 'Alcance',
    desc: 'Área das habilidades +10%',
    rarity: 'incomum',
    maxLevel: 5,
  },
  ima: {
    id: 'ima',
    name: 'Ímã',
    desc: 'Coleta energia de mais longe (+35%)',
    rarity: 'comum',
    maxLevel: 4,
  },
  regeneracao: {
    id: 'regeneracao',
    name: 'Regeneração',
    desc: 'Recupera 0,5 de vida por segundo',
    rarity: 'rara',
    maxLevel: 4,
  },
};

export const PASSIVE_IDS = Object.keys(PASSIVES) as PassiveId[];

// ── Enemies and bosses ───────────────────────────────────────────────────

export type EnemyKind = 'perseguidor' | 'corredor' | 'tanque' | 'atirador' | 'explosivo';
export type BossKind = 'colosso' | 'tecela' | 'eclipse';

export interface EnemyDef {
  readonly name: string;
  readonly hp: number;
  readonly speed: number;
  readonly damage: number;
  readonly radius: number;
  readonly xp: number;
  readonly color: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  perseguidor: {
    name: 'Perseguidor',
    hp: 14,
    speed: 82,
    damage: 8,
    radius: 16,
    xp: 1,
    color: 0xff4d6d,
  },
  corredor: { name: 'Corredor', hp: 7, speed: 158, damage: 6, radius: 12, xp: 1, color: 0xffd23f },
  tanque: { name: 'Tanque', hp: 78, speed: 48, damage: 15, radius: 28, xp: 5, color: 0x8338ec },
  atirador: { name: 'Atirador', hp: 20, speed: 74, damage: 7, radius: 16, xp: 3, color: 0x06d6a0 },
  explosivo: {
    name: 'Explosivo',
    hp: 16,
    speed: 104,
    damage: 24,
    radius: 15,
    xp: 2,
    color: 0xff7b00,
  },
};

export const BOSSES: Record<BossKind, EnemyDef & { title: string; essence: number }> = {
  colosso: {
    name: 'Colosso Prismático',
    title: 'O primeiro guardião',
    hp: 1400,
    speed: 70,
    damage: 22,
    radius: 62,
    xp: 60,
    color: 0x4cc9f0,
    essence: 60,
  },
  tecela: {
    name: 'Tecelã do Vazio',
    title: 'Mestra das espirais',
    hp: 3200,
    speed: 90,
    damage: 20,
    radius: 56,
    xp: 90,
    color: 0xc77dff,
    essence: 100,
  },
  eclipse: {
    name: 'Núcleo Eclipse',
    title: 'O fim da arena',
    hp: 6500,
    speed: 60,
    damage: 26,
    radius: 70,
    xp: 140,
    color: 0xffb703,
    essence: 160,
  },
};

export const BOSS_ORDER: readonly BossKind[] = ['colosso', 'tecela', 'eclipse'];

/** Enemy strength over time: more health and damage, a little faster (capped). */
export function scaling(seconds: number): { hp: number; damage: number; speed: number } {
  const m = seconds / 60;
  return {
    hp: 1 + 0.13 * m + 0.014 * m * m,
    damage: 1 + 0.06 * m,
    speed: 1 + Math.min(0.22, 0.02 * m),
  };
}

// ── Permanent progression ────────────────────────────────────────────────

export type MetaUpgradeId = 'vitalidade' | 'mobilidade' | 'poder' | 'coleta' | 'fortuna';

export interface MetaUpgradeDef {
  readonly id: MetaUpgradeId;
  readonly name: string;
  readonly desc: string;
  readonly maxLevel: number;
  readonly cost: (level: number) => number;
}

export const META_UPGRADES: Record<MetaUpgradeId, MetaUpgradeDef> = {
  vitalidade: {
    id: 'vitalidade',
    name: 'Vitalidade',
    desc: '+8 de vida máxima por nível',
    maxLevel: 5,
    cost: (l) => 60 + l * 50,
  },
  mobilidade: {
    id: 'mobilidade',
    name: 'Mobilidade',
    desc: '+3% de velocidade por nível',
    maxLevel: 5,
    cost: (l) => 60 + l * 50,
  },
  poder: {
    id: 'poder',
    name: 'Poder Inicial',
    desc: '+4% de dano por nível',
    maxLevel: 5,
    cost: (l) => 80 + l * 70,
  },
  coleta: {
    id: 'coleta',
    name: 'Coleta',
    desc: '+6% de experiência por nível',
    maxLevel: 5,
    cost: (l) => 70 + l * 60,
  },
  fortuna: {
    id: 'fortuna',
    name: 'Fortuna',
    desc: '+8% de Essência ganha por nível',
    maxLevel: 5,
    cost: (l) => 90 + l * 80,
  },
};

export const META_IDS = Object.keys(META_UPGRADES) as MetaUpgradeId[];

// ── Modifiers, missions and achievements ─────────────────────────────────

export type ModifierId = 'horda' | 'fragil' | 'turbo';

export const MODIFIERS: Record<ModifierId, { name: string; desc: string; essence: number }> = {
  horda: { name: 'Horda', desc: '+50% de inimigos', essence: 0.5 },
  fragil: { name: 'Frágil', desc: 'Vida máxima −40%', essence: 0.4 },
  turbo: { name: 'Turbo', desc: 'Inimigos 20% mais rápidos', essence: 0.3 },
};

export const MODIFIER_IDS = Object.keys(MODIFIERS) as ModifierId[];

export type MissionKind = 'kills' | 'level' | 'survive' | 'fusion' | 'boss' | 'gems';

export interface MissionDef {
  readonly kind: MissionKind;
  readonly target: number;
  readonly text: string;
  readonly reward: number;
}

export const MISSION_POOL: readonly MissionDef[] = [
  { kind: 'kills', target: 150, text: 'Derrote 150 inimigos', reward: 25 },
  { kind: 'kills', target: 400, text: 'Derrote 400 inimigos', reward: 50 },
  { kind: 'level', target: 10, text: 'Alcance o nível 10', reward: 25 },
  { kind: 'level', target: 18, text: 'Alcance o nível 18', reward: 55 },
  { kind: 'survive', target: 240, text: 'Sobreviva 4 minutos', reward: 30 },
  { kind: 'survive', target: 420, text: 'Sobreviva 7 minutos', reward: 60 },
  { kind: 'fusion', target: 1, text: 'Faça uma fusão', reward: 45 },
  { kind: 'boss', target: 1, text: 'Derrote um chefe', reward: 50 },
  { kind: 'gems', target: 250, text: 'Colete 250 partículas', reward: 30 },
];

export type AchievementId =
  | 'primeira'
  | 'cem'
  | 'mil'
  | 'fusao1'
  | 'fusoes'
  | 'secreta'
  | 'chefe1'
  | 'chefe2'
  | 'chefe3'
  | 'vitoria'
  | 'nivel20'
  | 'todos'
  | 'diario';

export const ACHIEVEMENTS: Record<AchievementId, { name: string; desc: string }> = {
  primeira: { name: 'Primeira Faísca', desc: 'Termine sua primeira partida' },
  cem: { name: 'Centena', desc: 'Derrote 100 inimigos em uma partida' },
  mil: { name: 'Mil Ecos', desc: 'Derrote 1.000 inimigos no total' },
  fusao1: { name: 'Alquimista', desc: 'Descubra uma fusão' },
  fusoes: { name: 'Mestre das Fusões', desc: 'Descubra as cinco fusões principais' },
  secreta: { name: 'Segredo Estelar', desc: 'Descubra a fusão secreta' },
  chefe1: { name: 'Quebra-Prisma', desc: 'Derrote o Colosso Prismático' },
  chefe2: { name: 'Corta-Fios', desc: 'Derrote a Tecelã do Vazio' },
  chefe3: { name: 'Fim do Eclipse', desc: 'Derrote o Núcleo Eclipse' },
  vitoria: { name: 'Infinito', desc: 'Sobreviva aos 12 minutos' },
  nivel20: { name: 'Sobrecarga', desc: 'Alcance o nível 20' },
  todos: { name: 'Equipe Completa', desc: 'Desbloqueie os três personagens' },
  diario: { name: 'Rotina Elétrica', desc: 'Complete um desafio diário' },
};

export const ACHIEVEMENT_IDS = Object.keys(ACHIEVEMENTS) as AchievementId[];
