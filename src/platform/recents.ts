import { readJson, writeJson, type KeyValueStore } from './storage';

const KEY = 'arcade.recents';
const MAX = 8;

/** The games the player opened last, most recent first (feeds the hub's "continue playing"). */
export class Recents {
  constructor(private readonly store: KeyValueStore) {}

  list(): string[] {
    const raw = readJson<unknown[]>(this.store, KEY);
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
  }

  /** Moves the game to the front of the list. */
  push(gameId: string): void {
    const rest = this.list().filter((id) => id !== gameId);
    writeJson(this.store, KEY, [gameId, ...rest].slice(0, MAX));
  }

  last(): string | null {
    return this.list()[0] ?? null;
  }
}
