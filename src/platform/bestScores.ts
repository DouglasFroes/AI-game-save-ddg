import { readJson, writeJson, type KeyValueStore } from './storage';

export type ScoreDetails = Readonly<Record<string, number>>;

export interface ScoreRecord {
  readonly score: number;
  readonly details: ScoreDetails;
}

const key = (gameId: string) => `arcade.best.${gameId}`;

function parseRecord(raw: unknown): ScoreRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as { score?: unknown; details?: unknown };
  if (typeof r.score !== 'number' || !Number.isFinite(r.score)) return null;
  const details: Record<string, number> = {};
  if (typeof r.details === 'object' && r.details !== null) {
    for (const [k, v] of Object.entries(r.details))
      if (Number.isFinite(v)) details[k] = v as number;
  }
  return { score: r.score, details };
}

/** Personal best per game, kept on the device. */
export class BestScores {
  constructor(private readonly store: KeyValueStore) {}

  get(gameId: string): ScoreRecord | null {
    return parseRecord(readJson(this.store, key(gameId)));
  }

  /** Stores the record if it beats the current best. Returns true when it is a new best. */
  offer(gameId: string, record: ScoreRecord): boolean {
    const prev = this.get(gameId);
    if (prev && prev.score >= record.score) return false;
    writeJson(this.store, key(gameId), record);
    return true;
  }
}
