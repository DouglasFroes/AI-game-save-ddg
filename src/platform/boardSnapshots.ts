import type { LeaderboardEntry } from './leaderboard';
import { readJson, writeJson, type KeyValueStore } from './storage';

export interface BoardSnapshot {
  /** When the global board was read. */
  readonly at: number;
  readonly entries: readonly LeaderboardEntry[];
}

const key = (gameId: string): string => `arcade.board-snapshot.${gameId}`;

/**
 * The last global board read for each game, kept on the device. Screens that need many boards
 * (the Hall da Fama) paint from this right away and refresh in the background, instead of making
 * the player wait for every request.
 */
export class BoardSnapshots {
  constructor(
    private readonly store: KeyValueStore,
    private readonly now: () => number = Date.now,
  ) {}

  get(gameId: string): BoardSnapshot | null {
    const saved = readJson<BoardSnapshot>(this.store, key(gameId));
    return saved && Array.isArray(saved.entries) ? saved : null;
  }

  put(gameId: string, entries: readonly LeaderboardEntry[]): void {
    const kept = this.get(gameId);
    // A shorter read (e.g. top 10) must not shrink a longer one (top 20) saved before.
    if (kept && kept.entries.length > entries.length && kept.at > this.now() - 60_000) return;
    writeJson(this.store, key(gameId), { at: this.now(), entries } satisfies BoardSnapshot);
  }
}
