import type { ScoreDetails, ScoreRecord } from './bestScores';
import { sanitizeDetails } from './leaderboard';
import { readJson, writeJson, type KeyValueStore } from './storage';

/** How many of the player's own best runs each game keeps on the device. */
export const LOCAL_TOP = 10;

export interface LocalRun {
  readonly score: number;
  readonly details: ScoreDetails;
  /** ISO-8601 date of the run. */
  readonly date: string;
}

const key = (gameId: string) => `arcade.top.${gameId}`;

function parseRun(raw: unknown): LocalRun | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.score !== 'number' || !Number.isFinite(r.score) || typeof r.date !== 'string')
    return null;
  return { score: r.score, details: sanitizeDetails(r.details), date: r.date };
}

/** The player's 10 best runs of each game, kept locally (best first, older wins ties). */
export class LocalTop {
  constructor(private readonly store: KeyValueStore) {}

  list(gameId: string): LocalRun[] {
    const raw = readJson<unknown[]>(this.store, key(gameId));
    if (!Array.isArray(raw)) return [];
    return raw
      .map(parseRun)
      .filter((r): r is LocalRun => !!r)
      .sort((a, b) => b.score - a.score || a.date.localeCompare(b.date))
      .slice(0, LOCAL_TOP);
  }

  /** Records a finished run. Returns its place among the player's best (1-based), or null. */
  add(gameId: string, record: ScoreRecord, now: Date = new Date()): number | null {
    const run: LocalRun = {
      score: record.score,
      details: sanitizeDetails(record.details),
      date: now.toISOString(),
    };
    const list = [...this.list(gameId), run].sort(
      (a, b) => b.score - a.score || a.date.localeCompare(b.date),
    );
    const place = list.indexOf(run);
    writeJson(this.store, key(gameId), list.slice(0, LOCAL_TOP));
    return place < LOCAL_TOP ? place + 1 : null;
  }
}
