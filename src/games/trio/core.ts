import { shuffle, type Rnd } from '@/platform/rnd';

export const TRAY_SIZE = 7;
/** Tiles are 2 half-units wide, so neighbours on different layers overlap like a real pile. */
export const TILE_W = 2;
export const KINDS = 12;

export interface Tile {
  id: number;
  kind: number;
  /** Grid position in half-tile units (x grows right, y grows down). */
  x: number;
  y: number;
  layer: number;
  taken: boolean;
}

/** Number of triples in a level: starts easy, keeps growing. */
export function levelTriples(level: number): number {
  return Math.min(8 + level * 2, 30);
}

export function levelKinds(level: number): number {
  return Math.min(KINDS, 4 + level);
}

/** Spreads `count` spots over a few layers around the centre, one tile per layer position. */
export function layoutTiles(count: number, rnd: Rnd): { x: number; y: number; layer: number }[] {
  const out: { x: number; y: number; layer: number }[] = [];
  const used = new Set<string>();
  const layers = count > 36 ? 4 : count > 18 ? 3 : 2;
  let attempts = 0;
  while (out.length < count && attempts++ < 8000) {
    const layer = out.length % layers;
    // Same-layer tiles sit on a 2-unit lattice (no overlap); odd layers shift by 1 to overlap.
    const x = (Math.floor(rnd() * 5) - 2) * 2 + (layer % 2);
    const y = (Math.floor(rnd() * 7) - 3) * 2 + (layer % 2);
    const key = `${layer}:${x}:${y}`;
    if (used.has(key)) continue;
    used.add(key);
    out.push({ x, y, layer });
  }
  return out;
}

export interface TrioEvents {
  cleared: number;
  /** The tray filled up with no triple: game over. */
  lost: boolean;
  /** The pile is empty: a bigger level is ready. */
  won: boolean;
}

/** "Trio de Peças": tap free tiles into a 7-slot tray; three equal ones vanish. */
export class TrioSim {
  level = 0;
  score = 0;
  cleared = 0;
  tiles: Tile[] = [];
  tray: Tile[] = [];
  lost = false;

  constructor(private readonly rnd: Rnd = Math.random) {
    this.buildLevel();
  }

  private buildLevel(): void {
    const triples = levelTriples(this.level);
    const kinds = levelKinds(this.level);
    const kindList: number[] = [];
    for (let t = 0; t < triples; t++) {
      const kind = t % kinds;
      kindList.push(kind, kind, kind);
    }
    shuffle(this.rnd, kindList);
    const spots = layoutTiles(kindList.length, this.rnd);
    // Positions come in the same count as tiles unless the layout ran out of room.
    this.tiles = spots.slice(0, kindList.length).map((s, id) => ({
      id,
      kind: kindList[id]!,
      ...s,
      taken: false,
    }));
    this.tray = [];
  }

  /** A tile is free when no untaken tile on a higher layer overlaps it. */
  isFree(tile: Tile): boolean {
    if (tile.taken) return false;
    return !this.tiles.some(
      (o) =>
        !o.taken &&
        o.layer > tile.layer &&
        Math.abs(o.x - tile.x) < TILE_W &&
        Math.abs(o.y - tile.y) < TILE_W,
    );
  }

  get remaining(): number {
    return this.tiles.filter((t) => !t.taken).length;
  }

  /** Moves a free tile into the tray. Returns null if it cannot be picked. */
  pick(id: number): TrioEvents | null {
    const tile = this.tiles.find((t) => t.id === id);
    if (!tile || this.lost || !this.isFree(tile)) return null;
    tile.taken = true;
    // Keep equal kinds side by side so triples are easy to read.
    let at = this.tray.length;
    for (let i = this.tray.length - 1; i >= 0; i--) {
      if (this.tray[i]!.kind === tile.kind) {
        at = i + 1;
        break;
      }
    }
    this.tray.splice(at, 0, tile);
    const ev: TrioEvents = { cleared: 0, lost: false, won: false };
    const same = this.tray.filter((t) => t.kind === tile.kind);
    if (same.length >= 3) {
      const gone = new Set(same.slice(0, 3));
      this.tray = this.tray.filter((t) => !gone.has(t));
      ev.cleared = 1;
      this.cleared++;
      this.score += 3;
    } else if (this.tray.length >= TRAY_SIZE) {
      this.lost = true;
      ev.lost = true;
      return ev;
    }
    if (this.remaining === 0 && this.tray.length === 0) {
      this.score += 10 + this.level * 2;
      this.level++;
      this.buildLevel();
      ev.won = true;
    }
    return ev;
  }
}
