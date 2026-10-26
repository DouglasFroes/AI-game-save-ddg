import type { LeaderboardEntry } from './leaderboard';

/**
 * "Hall da Fama": a medal table across every game's ranking. In each game the best three
 * different players take gold (the record), silver and bronze; players are ranked by golds, then
 * silvers, then bronzes. A player's own extra runs on a board never take a second medal there.
 */

export type Medal = 1 | 2 | 3;

export interface MedalWin {
  readonly gameId: string;
  readonly medal: Medal;
  /** The player's best run on that board. */
  readonly entry: LeaderboardEntry;
}

export interface Medalist {
  readonly player: string;
  /** Name used on the player's most recent medal run. */
  readonly name: string;
  readonly gold: number;
  readonly silver: number;
  readonly bronze: number;
  /** Every medal, golds first, then by most recent run. */
  readonly wins: readonly MedalWin[];
}

/** The first three different players of a ranked board (best run of each). */
export function podiumOf(entries: readonly LeaderboardEntry[]): LeaderboardEntry[] {
  const seen = new Set<string>();
  const out: LeaderboardEntry[] = [];
  for (const e of entries) {
    if (seen.has(e.player)) continue;
    seen.add(e.player);
    out.push(e);
    if (out.length === 3) break;
  }
  return out;
}

/** Builds the medal table from each game's ranked board (best first). */
export function medalTable(
  boards: ReadonlyArray<{ gameId: string; entries: readonly LeaderboardEntry[] }>,
): Medalist[] {
  const byPlayer = new Map<string, MedalWin[]>();
  for (const { gameId, entries } of boards) {
    podiumOf(entries).forEach((entry, i) => {
      const list = byPlayer.get(entry.player) ?? [];
      list.push({ gameId, medal: (i + 1) as Medal, entry });
      byPlayer.set(entry.player, list);
    });
  }
  const table: Medalist[] = [...byPlayer.entries()].map(([player, wins]) => {
    const sorted = [...wins].sort(
      (a, b) => a.medal - b.medal || b.entry.date.localeCompare(a.entry.date),
    );
    const latest = wins.reduce((a, b) => (b.entry.date > a.entry.date ? b : a));
    const count = (m: Medal) => wins.filter((w) => w.medal === m).length;
    return {
      player,
      name: latest.entry.name,
      gold: count(1),
      silver: count(2),
      bronze: count(3),
      wins: sorted,
    };
  });
  return table.sort(
    (a, b) =>
      b.gold - a.gold ||
      b.silver - a.silver ||
      b.bronze - a.bronze ||
      a.name.localeCompare(b.name, 'pt-BR') ||
      a.player.localeCompare(b.player),
  );
}

/** 1-based places: players with exactly the same medals share a place. */
export function placesOf(table: readonly Medalist[]): number[] {
  const places: number[] = [];
  table.forEach((m, i) => {
    const prev = table[i - 1];
    const tied =
      prev && prev.gold === m.gold && prev.silver === m.silver && prev.bronze === m.bronze;
    places.push(tied ? places[i - 1]! : i + 1);
  });
  return places;
}

/** Runs `load` for every id, a few at a time; a board that fails to load counts as empty. */
export async function loadBoards(
  ids: readonly string[],
  load: (id: string) => Promise<LeaderboardEntry[]>,
  concurrency = 8,
): Promise<Array<{ gameId: string; entries: LeaderboardEntry[] }>> {
  const out: Array<{ gameId: string; entries: LeaderboardEntry[] }> = [];
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const gameId = ids[next++]!;
      const entries = await load(gameId).catch(() => []);
      out.push({ gameId, entries });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
  // Keep the caller's order, whatever finished first.
  return ids.map((id) => out.find((b) => b.gameId === id)!);
}
