import type { Rnd } from '@/platform/rnd';

export const COLS = 3;
export const ROWS = 3;
export const MAX_HP = 20;
export const WEAPON_USES = 3;
const CARDS_PER_DEPTH = 7;

export type CardKind = 'monster' | 'weapon' | 'potion' | 'shield' | 'coin' | 'bomb';

export interface Card {
  id: number;
  kind: CardKind;
  /** Monster hit points, weapon power, potion heal, shield points or coin value. */
  value: number;
}

export type MasmorraEvent =
  | {
      type: 'fight';
      col: number;
      row: number;
      monster: number;
      dealt: number;
      absorbed: number;
      taken: number;
      weaponBroke: boolean;
    }
  | { type: 'equip'; col: number; row: number; power: number }
  | { type: 'heal'; col: number; row: number; amount: number }
  | { type: 'armor'; col: number; row: number; amount: number }
  | { type: 'coin'; col: number; row: number; amount: number }
  | {
      type: 'bomb';
      col: number;
      row: number;
      kills: number;
      cells: Array<{ col: number; row: number }>;
    }
  | { type: 'depth'; depth: number }
  | { type: 'dead' };

export class MasmorraSim {
  /** grid[col][row], row 0 at the top; columns fall downwards. */
  grid: Card[][] = [];
  hp = MAX_HP;
  armor = 0;
  weapon = 0;
  uses = 0;
  depth = 1;
  kills = 0;
  coins = 0;
  score = 0;
  cleared = 0;
  dead = false;
  private nextId = 1;

  constructor(private readonly rnd: Rnd = Math.random) {
    for (let c = 0; c < COLS; c++) {
      const col: Card[] = [];
      for (let r = 0; r < ROWS; r++) col.push(this.draw());
      this.grid.push(col);
    }
    // Start with a weapon so the first turns aren't a coin flip with the HP bar.
    this.grid[1]![2] = { id: this.nextId++, kind: 'weapon', value: 4 };
  }

  /** Random card for the current depth, tuned so that danger rises while help stays available. */
  draw(): Card {
    const d = this.depth;
    const roll = this.rnd();
    const id = this.nextId++;
    const between = (lo: number, hi: number) => lo + Math.floor(this.rnd() * (hi - lo + 1));
    if (roll < 0.44) return { id, kind: 'monster', value: between(2, Math.min(4 + d, 14)) };
    if (roll < 0.58) return { id, kind: 'weapon', value: between(3, Math.min(5 + d, 11)) };
    if (roll < 0.7) return { id, kind: 'potion', value: 4 + Math.floor(d / 2) };
    if (roll < 0.79) return { id, kind: 'shield', value: between(3, 6) };
    if (roll < 0.94) return { id, kind: 'coin', value: 10 + d * 2 };
    return { id, kind: 'bomb', value: 0 };
  }

  card(col: number, row: number): Card | undefined {
    return this.grid[col]?.[row];
  }

  /** Plays the card at (col, row): fight, equip, heal… and then the column falls. */
  tap(col: number, row: number): MasmorraEvent[] {
    if (this.dead) return [];
    const card = this.card(col, row);
    if (!card) return [];
    const events: MasmorraEvent[] = [];
    const remove: Array<{ col: number; row: number }> = [{ col, row }];

    switch (card.kind) {
      case 'monster': {
        const power = this.weapon;
        const dealt = Math.min(power, card.value);
        const raw = Math.max(0, card.value - power);
        const absorbed = Math.min(this.armor, raw);
        const taken = raw - absorbed;
        this.armor -= absorbed;
        this.hp -= taken;
        let broke = false;
        if (power > 0) {
          this.uses--;
          if (this.uses <= 0) {
            this.weapon = 0;
            broke = true;
          }
        }
        this.kills++;
        this.score += 10 + this.depth * 3 + (taken === 0 ? 5 : 0);
        events.push({
          type: 'fight',
          col,
          row,
          monster: card.value,
          dealt,
          absorbed,
          taken,
          weaponBroke: broke,
        });
        break;
      }
      case 'weapon':
        this.weapon = card.value;
        this.uses = WEAPON_USES;
        events.push({ type: 'equip', col, row, power: card.value });
        break;
      case 'potion': {
        const amount = Math.min(card.value, MAX_HP - this.hp);
        this.hp += amount;
        this.score += 2;
        events.push({ type: 'heal', col, row, amount });
        break;
      }
      case 'shield':
        this.armor = Math.min(12, this.armor + card.value);
        events.push({ type: 'armor', col, row, amount: card.value });
        break;
      case 'coin':
        this.coins += card.value;
        this.score += card.value;
        events.push({ type: 'coin', col, row, amount: card.value });
        break;
      case 'bomb': {
        let kills = 0;
        for (const [dc, dr] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const n = this.card(col + dc, row + dr);
          if (!n) continue;
          remove.push({ col: col + dc, row: row + dr });
          if (n.kind === 'monster') {
            kills++;
            this.kills++;
            this.score += 8 + this.depth * 2;
          }
        }
        events.push({ type: 'bomb', col, row, kills, cells: remove.slice(1) });
        break;
      }
    }

    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      events.push({ type: 'dead' });
      return events;
    }

    this.removeAndRefill(remove);
    this.cleared += remove.length;
    const depth = 1 + Math.floor(this.cleared / CARDS_PER_DEPTH);
    if (depth > this.depth) {
      this.depth = depth;
      this.score += 25 * depth;
      events.push({ type: 'depth', depth });
    }
    return events;
  }

  private removeAndRefill(cells: Array<{ col: number; row: number }>): void {
    for (let c = 0; c < COLS; c++) {
      const gone = new Set(cells.filter((x) => x.col === c).map((x) => x.row));
      if (gone.size === 0) continue;
      const keep = this.grid[c]!.filter((_, r) => !gone.has(r));
      const fresh: Card[] = [];
      while (fresh.length + keep.length < ROWS) fresh.push(this.draw());
      this.grid[c] = [...fresh, ...keep];
    }
  }
}
