/** Fruit Merge (Suika-style) rules — pure. Physics lives in the scene (Matter). */

export type Rng = () => number;

export interface FruitDef {
  readonly name: string;
  readonly radius: number;
  readonly color: number;
  /** Points earned when this fruit is created by a merge. */
  readonly points: number;
}

export const FRUITS: readonly FruitDef[] = [
  { name: 'Cereja', radius: 22, color: 0xe63946, points: 1 },
  { name: 'Morango', radius: 30, color: 0xff5d73, points: 3 },
  { name: 'Uva', radius: 40, color: 0x9b5de5, points: 6 },
  { name: 'Laranja', radius: 49, color: 0xffa62b, points: 10 },
  { name: 'Caqui', radius: 60, color: 0xff7b25, points: 15 },
  { name: 'Maçã', radius: 72, color: 0xd62828, points: 21 },
  { name: 'Pera', radius: 84, color: 0xc5e063, points: 28 },
  { name: 'Pêssego', radius: 97, color: 0xffb4a2, points: 36 },
  { name: 'Abacaxi', radius: 111, color: 0xffd23f, points: 45 },
  { name: 'Melão', radius: 126, color: 0x9be564, points: 55 },
  { name: 'Melancia', radius: 145, color: 0x2d9e46, points: 66 },
];

export const LAST_LEVEL = FRUITS.length - 1;
/** Merging two of the biggest fruit clears them for this bonus. */
export const WATERMELON_BONUS = 100;

export const BOX = { left: 50, right: 670, top: 330, bottom: 1210 } as const;
export const DROP_Y = 250;
/** Seconds a fruit may stay above the line before the game ends. */
export const OVERFLOW_SECONDS = 2;

const DROP_WEIGHTS = [0.32, 0.26, 0.2, 0.13, 0.09];

export function nextFruitLevel(rng: Rng = Math.random): number {
  let r = rng();
  for (let i = 0; i < DROP_WEIGHTS.length; i++) {
    r -= DROP_WEIGHTS[i]!;
    if (r <= 0) return i;
  }
  return 0;
}

/** Result of merging two fruits of `level`: the new level (null = both vanish) and points. */
export function merge(level: number): { level: number | null; points: number } {
  if (level >= LAST_LEVEL) return { level: null, points: WATERMELON_BONUS };
  const next = level + 1;
  return { level: next, points: FRUITS[next]!.points };
}

/** Keeps the dropped fruit inside the box. */
export function clampDropX(x: number, level: number): number {
  const r = FRUITS[level]!.radius;
  return Math.max(BOX.left + r, Math.min(BOX.right - r, x));
}

/** Tracks how long the pile has been over the line; true means game over. */
export class OverflowWatch {
  private time = 0;

  update(overflowing: boolean, dt: number): boolean {
    this.time = overflowing ? this.time + dt : 0;
    return this.time >= OVERFLOW_SECONDS;
  }

  /** 0..1 warning level for the UI. */
  get danger(): number {
    return Math.min(1, this.time / OVERFLOW_SECONDS);
  }
}
