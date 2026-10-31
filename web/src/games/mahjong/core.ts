/**
 * "Mahjong" — pure rules of mahjong solitaire. Tiles sit on a few layers; a tile is free when
 * nothing lies on top of it and its left or right side is open. Match two free tiles with the same
 * face to remove them. Deals are built backwards (pairs are placed on tiles that would be free in
 * a removal order), so every board can be cleared.
 */
export interface Slot {
  /** Half-tile units: a tile spans x..x+2, y..y+2. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Tile extends Slot {
  readonly id: number;
  face: number;
  gone: boolean;
}

export const FACES = [
  '🍎',
  '🍊',
  '🍋',
  '🍇',
  '🍓',
  '🍒',
  '🍑',
  '🥝',
  '🍍',
  '🥥',
  '🌸',
  '🌻',
  '🍀',
  '🍁',
  '🐼',
  '🐸',
  '🐙',
  '🦋',
  '⭐',
  '🌙',
  '🌈',
  '❄️',
  '🔥',
  '💎',
  '🎈',
];

/** A pyramid that fits a portrait screen: 6×8, 4×6, 2×4 and a 2-tile cap (82 tiles). */
export function layout(): Slot[] {
  const slots: Slot[] = [];
  const layer = (cols: number, rows: number, ox: number, oy: number, z: number) => {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) slots.push({ x: ox + c * 2, y: oy + r * 2, z });
  };
  layer(6, 8, 0, 0, 0);
  layer(4, 6, 2, 2, 1);
  layer(2, 4, 4, 4, 2);
  slots.push({ x: 5, y: 6, z: 3 }, { x: 5, y: 8, z: 3 });
  return slots;
}

const overlaps = (a: Slot, b: Slot) => Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;

export function isFree(t: Slot, live: readonly Slot[]): boolean {
  let left = false;
  let right = false;
  for (const o of live) {
    if (o === t) continue;
    if (o.z === t.z + 1 && overlaps(o, t)) return false;
    if (o.z === t.z && Math.abs(o.y - t.y) < 2) {
      if (o.x === t.x - 2) left = true;
      if (o.x === t.x + 2) right = true;
    }
  }
  return !left || !right;
}

/** Assigns faces so the board can be cleared: repeatedly take two free slots, give them a pair. */
export function deal(slots: readonly Slot[], faceCount: number, rng: () => number): Tile[] | null {
  const live = [...slots];
  const faces: number[] = [];
  for (let i = 0; i < slots.length / 2; i++) faces.push(i % faceCount);
  faces.sort(() => rng() - 0.5);
  const assigned = new Map<Slot, number>();
  while (live.length) {
    const free = live.filter((s) => isFree(s, live));
    if (free.length < 2) return null;
    const a = free.splice(Math.floor(rng() * free.length), 1)[0]!;
    const b = free[Math.floor(rng() * free.length)]!;
    const face = faces.pop()!;
    assigned.set(a, face);
    assigned.set(b, face);
    live.splice(live.indexOf(a), 1);
    live.splice(live.indexOf(b), 1);
  }
  return slots.map((s, id) => ({ ...s, id, face: assigned.get(s)!, gone: false }));
}

export type PickResult =
  | { kind: 'select' }
  | { kind: 'deselect' }
  | { kind: 'blocked' }
  | { kind: 'match'; a: Tile; b: Tile; points: number; cleared: boolean }
  | { kind: 'mismatch' };

export class MahjongGame {
  tiles: Tile[] = [];
  selected: Tile | null = null;
  board = 1;
  score = 0;
  pairs = 0;
  combo = 0;
  timeLeft = 0;
  private sinceMatch = 99;

  constructor(private readonly rng: () => number = Math.random) {
    this.newBoard();
  }

  get faceCount(): number {
    return Math.min(FACES.length, 12 + this.board * 3);
  }

  newBoard(): void {
    let tiles: Tile[] | null = null;
    for (let i = 0; i < 50 && !tiles; i++) tiles = deal(layout(), this.faceCount, this.rng);
    this.tiles = tiles ?? [];
    this.selected = null;
    this.timeLeft = Math.max(120, 240 - (this.board - 1) * 20);
  }

  live(): Tile[] {
    return this.tiles.filter((t) => !t.gone);
  }

  free(t: Tile): boolean {
    return !t.gone && isFree(t, this.live());
  }

  /** Pairs of free tiles with the same face (for hints and "stuck" detection). */
  moves(): Array<[Tile, Tile]> {
    const free = this.live().filter((t) => this.free(t));
    const out: Array<[Tile, Tile]> = [];
    for (let i = 0; i < free.length; i++)
      for (let j = i + 1; j < free.length; j++)
        if (free[i]!.face === free[j]!.face) out.push([free[i]!, free[j]!]);
    return out;
  }

  tick(dt: number): void {
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    this.sinceMatch += dt;
    if (this.sinceMatch > 4) this.combo = 0;
  }

  pick(t: Tile): PickResult {
    if (t.gone) return { kind: 'blocked' };
    if (!this.free(t)) return { kind: 'blocked' };
    if (this.selected === t) {
      this.selected = null;
      return { kind: 'deselect' };
    }
    if (!this.selected) {
      this.selected = t;
      return { kind: 'select' };
    }
    const a = this.selected;
    if (a.face !== t.face) {
      this.selected = t;
      return { kind: 'mismatch' };
    }
    a.gone = true;
    t.gone = true;
    this.selected = null;
    this.pairs++;
    // Quick successive matches build a combo.
    this.combo = this.sinceMatch < 4 ? this.combo + 1 : 1;
    this.sinceMatch = 0;
    const points = 20 * this.board * this.combo;
    this.score += points;
    const cleared = this.live().length === 0;
    if (cleared) {
      this.score += Math.round(this.timeLeft) * 10 * this.board;
      this.board++;
      this.newBoard();
    }
    return { kind: 'match', a, b: t, points, cleared };
  }

  /** Reshuffles the faces of the remaining tiles until a match exists (costs time). */
  shuffle(): void {
    const live = this.live();
    // The same faces, re-paired along an order in which the rest can still be cleared.
    const faces = live.map((t) => t.face).sort((a, b) => a - b);
    for (let attempt = 0; attempt < 30; attempt++) {
      const pairFaces: number[] = [];
      for (let i = 0; i < faces.length; i += 2) pairFaces.push(faces[i]!);
      pairFaces.sort(() => this.rng() - 0.5);
      // With one face per pair, `deal` tells which tiles are paired together.
      const fresh = deal(live, live.length / 2, this.rng);
      if (!fresh) continue;
      fresh.forEach((f, i) => (live[i]!.face = pairFaces[f.face]!));
      this.selected = null;
      this.timeLeft = Math.max(0, this.timeLeft - 15);
      if (this.moves().length) return;
    }
  }
}
