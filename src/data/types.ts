import type { StarThresholds } from '@/core/scoring';

export type Direction = 'up' | 'down' | 'left' | 'right';

/** Solid static rectangle; x/y is the center, angle in degrees. */
export interface BlockDef {
  readonly type: 'block';
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly angle?: number;
}

/** Row of spikes whose base runs along a line centered at x/y, pointing to `dir`. */
export interface SpikesDef {
  readonly type: 'spikes';
  readonly x: number;
  readonly y: number;
  readonly length: number;
  readonly dir: Direction;
}

export type TerrainDef = BlockDef | SpikesDef;

export interface HiveDef {
  readonly x: number;
  readonly y: number;
  readonly bees: number;
}

export interface BeeTuning {
  /** Max speed in px per physics step (60 steps/s). */
  readonly speed: number;
  /** 0..1 — how fast bees turn toward their target. */
  readonly agility: number;
  /** Milliseconds between two bees leaving the same hive. */
  readonly interval: number;
}

export interface LevelDef {
  readonly id: number;
  readonly name: string;
  readonly tip: string;
  /** Ink budget in world pixels. */
  readonly ink: number;
  readonly stars: StarThresholds;
  /** Seconds the dog has to survive. */
  readonly survive: number;
  readonly dog: { readonly x: number; readonly y: number };
  readonly hives: readonly HiveDef[];
  readonly bees: BeeTuning;
  readonly terrain: readonly TerrainDef[];
}
