import type { LeaderboardEntry } from './leaderboard';
import { readJson, writeJson, type KeyValueStore } from './storage';

/** The player's best place on a global board, as last seen. */
export interface Watched {
  readonly rank: number;
  readonly score: number;
  /** Ids of the entries that were above it, to tell newcomers apart. */
  readonly above: readonly string[];
}

/** Someone passed the player on a board. */
export interface Overtake {
  readonly by: string;
  readonly from: number;
  /** New place, or null when the player left the top 20. */
  readonly to: number | null;
}

/** Where the player's best entry is on a (sorted) board, or null when they aren't on it. */
export function snapshot(
  entries: readonly LeaderboardEntry[],
  isMine: (e: LeaderboardEntry) => boolean,
): Watched | null {
  const i = entries.findIndex(isMine);
  if (i < 0) return null;
  return { rank: i + 1, score: entries[i]!.score, above: entries.slice(0, i).map((e) => e.id) };
}

/** Compares the board now with what the player saw before; null when nobody passed them. */
export function findOvertake(
  prev: Watched,
  entries: readonly LeaderboardEntry[],
  isMine: (e: LeaderboardEntry) => boolean,
): Overtake | null {
  const now = snapshot(entries, isMine);
  if (now && now.rank <= prev.rank) return null;
  const known = new Set(prev.above);
  const limit = now ? now.rank - 1 : entries.length;
  const newcomer = entries
    .slice(0, limit)
    .find((e) => !isMine(e) && !known.has(e.id) && e.score >= prev.score);
  return { by: newcomer?.name ?? 'Alguém', from: prev.rank, to: now?.rank ?? null };
}

const KEY = 'arcade.watch';

/** Remembers the player's place on each global board, to warn them when someone passes them. */
export class RankWatch {
  constructor(private readonly store: KeyValueStore) {}

  private all(): Record<string, Watched> {
    const raw = readJson<Record<string, Watched>>(this.store, KEY);
    return raw && typeof raw === 'object' ? raw : {};
  }

  games(): string[] {
    return Object.keys(this.all());
  }

  get(gameId: string): Watched | null {
    return this.all()[gameId] ?? null;
  }

  /** Stores what the player sees now (forgets the game when they are off the board). */
  see(gameId: string, now: Watched | null): void {
    const all = this.all();
    if (now) all[gameId] = now;
    else delete all[gameId];
    writeJson(this.store, KEY, all);
  }

  /** Looks at a fresh board: returns who passed the player (if anyone) and updates the memory. */
  check(
    gameId: string,
    entries: readonly LeaderboardEntry[],
    isMine: (e: LeaderboardEntry) => boolean,
  ): Overtake | null {
    const prev = this.get(gameId);
    const result = prev ? findOvertake(prev, entries, isMine) : null;
    this.see(gameId, snapshot(entries, isMine));
    return result;
  }
}
