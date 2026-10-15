import type { BossKind, EnemyKind, FusionId, SkillId } from './defs';

export interface Player {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  armor: number;
  regen: number;
  might: number;
  cdMult: number;
  areaMult: number;
  burnMult: number;
  pickup: number;
  xpMult: number;
  level: number;
  xp: number;
  iframes: number;
  shield: number;
  shieldMax: number;
  /** Seconds left of a speed pulse; `pulseInvuln` makes it untouchable. */
  pulse: number;
  pulseSpeed: number;
  pulseInvuln: boolean;
  facingX: number;
  facingY: number;
}

export interface Enemy {
  id: number;
  kind: EnemyKind | BossKind;
  boss: boolean;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  radius: number;
  xp: number;
  slow: number;
  slowFactor: number;
  burn: number;
  burnDps: number;
  flash: number;
  kbx: number;
  kby: number;
  /** Generic attack timer (shooters, exploders, bosses). */
  timer: number;
  /** Boss state machine. */
  state: string;
  phase: number;
  /** Boss intro: invulnerable and harmless while > 0. */
  entering: number;
  angle: number;
  dead: boolean;
  /** Boss scratch counters. */
  data?: number;
  teleports?: number;
  cycle?: number;
}

export type ProjectileKind = 'faisca' | 'orbe' | 'drone' | 'plasma';

export interface Projectile {
  id: number;
  kind: ProjectileKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  pierce: number;
  life: number;
  radius: number;
  area: number;
  burn: number;
  /** Seconds until the next arc (plasma). */
  tick: number;
  hits: number[];
  dead: boolean;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  life: number;
  dead: boolean;
}

export type GemKind = 'xp' | 'heal' | 'magnet' | 'chest';

export interface Gem {
  id: number;
  kind: GemKind;
  x: number;
  y: number;
  value: number;
  pulled: boolean;
  dead: boolean;
}

/** Boss telegraphs and hazards: a warning first, then damage. */
export interface Hazard {
  kind: 'line' | 'ring' | 'beam';
  x: number;
  y: number;
  angle: number;
  length: number;
  width: number;
  /** Ring radius (grows) / beam spin speed. */
  radius: number;
  spin: number;
  warn: number;
  active: number;
  damage: number;
  hit: boolean;
  ownerId: number;
}

/** Lasting effects the renderer draws (fields, rifts, the collapsing star). */
export interface Zone {
  kind: 'rift' | 'star';
  x: number;
  y: number;
  r: number;
  t: number;
  ttl: number;
  damage: number;
}

export type SimEvent =
  | { type: 'shot'; skill: SkillId | FusionId }
  | { type: 'hit'; x: number; y: number; amount: number; big: boolean }
  | { type: 'kill'; x: number; y: number; kind: EnemyKind | BossKind; color: number }
  | { type: 'explosion'; x: number; y: number; r: number; color: number }
  | { type: 'ring'; x: number; y: number; r: number; color: number }
  | { type: 'chain'; points: number[]; color: number }
  | { type: 'pickup'; kind: GemKind }
  | { type: 'levelup'; level: number }
  | { type: 'fusion'; fusion: FusionId }
  | { type: 'hurt'; amount: number }
  | { type: 'shield'; broke: boolean }
  | { type: 'pulse' }
  | { type: 'boss'; kind: BossKind }
  | { type: 'bossPhase'; kind: BossKind }
  | { type: 'bossDown'; kind: BossKind; x: number; y: number }
  | { type: 'wave' }
  | { type: 'mission'; text: string; reward: number }
  | { type: 'death' }
  | { type: 'victory' };
