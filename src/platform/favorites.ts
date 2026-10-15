import { readJson, writeJson, type KeyValueStore } from './storage';

const KEY = 'arcade.favorites';

/** Games the player starred: they come first in the hub. */
export class Favorites {
  constructor(private readonly store: KeyValueStore) {}

  list(): string[] {
    const raw = readJson<unknown[]>(this.store, KEY);
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
  }

  has(gameId: string): boolean {
    return this.list().includes(gameId);
  }

  /** Stars or un-stars a game. Returns whether it is a favorite now. */
  toggle(gameId: string): boolean {
    const now = !this.has(gameId);
    const rest = this.list().filter((id) => id !== gameId);
    writeJson(this.store, KEY, now ? [...rest, gameId] : rest);
    return now;
  }

  /** Favorites first (in the order given), then the others, keeping their order. */
  sort<T extends { readonly id: string }>(items: readonly T[]): T[] {
    const favs = new Set(this.list());
    return [...items.filter((i) => favs.has(i.id)), ...items.filter((i) => !favs.has(i.id))];
  }
}
