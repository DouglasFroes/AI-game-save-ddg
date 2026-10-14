import type { ScoreDetails } from './bestScores';
import { readJson, writeJson, type KeyValueStore } from './storage';

export interface LeaderboardEntry {
  readonly id: string;
  readonly name: string;
  readonly score: number;
  /** Game-specific numbers shown as extra columns (stars, time, distance…). */
  readonly details: ScoreDetails;
  /** ISO-8601 date of the submission. */
  readonly date: string;
}

/** Port: any ranking backend (local, Firebase…) implements this. One board per game. */
export interface LeaderboardRepository {
  list(gameId: string, max: number): Promise<LeaderboardEntry[]>;
  submit(gameId: string, entry: LeaderboardEntry): Promise<void>;
}

/** A remote board that assigns its own player id (e.g. Firebase anonymous uid). */
export interface RemoteLeaderboard extends LeaderboardRepository {
  playerId(): Promise<string>;
}

export const MAX_NAME_LENGTH = 16;
export const MAX_DETAILS = 6;

export function sanitizeName(name: string): string {
  const clean = name
    .replace(/[\p{C}<>]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return clean || 'Anônimo';
}

export function sanitizeDetails(raw: unknown): ScoreDetails {
  const out: Record<string, number> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [k, v] of Object.entries(raw).slice(0, MAX_DETAILS)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/** One row per player (best score wins), sorted by score then oldest first. */
export function rankEntries(entries: readonly LeaderboardEntry[]): LeaderboardEntry[] {
  const best = new Map<string, LeaderboardEntry>();
  for (const e of entries) {
    const prev = best.get(e.id);
    if (!prev || e.score > prev.score) best.set(e.id, e);
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
}

export function parseEntry(raw: unknown): LeaderboardEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== 'string' || typeof e.name !== 'string' || typeof e.date !== 'string')
    return null;
  if (typeof e.score !== 'number' || !Number.isFinite(e.score)) return null;
  return {
    id: e.id,
    name: sanitizeName(e.name),
    score: e.score,
    details: sanitizeDetails(e.details),
    date: e.date,
  };
}

const boardKey = (gameId: string) => `arcade.board.${gameId}`;

export class LocalLeaderboard implements LeaderboardRepository {
  constructor(private readonly store: KeyValueStore) {}

  private read(gameId: string): LeaderboardEntry[] {
    const raw = readJson<unknown[]>(this.store, boardKey(gameId));
    return Array.isArray(raw) ? raw.map(parseEntry).filter((e): e is LeaderboardEntry => !!e) : [];
  }

  async list(gameId: string, max: number): Promise<LeaderboardEntry[]> {
    return rankEntries(this.read(gameId)).slice(0, max);
  }

  async submit(gameId: string, entry: LeaderboardEntry): Promise<void> {
    const others = this.read(gameId).filter((e) => e.id !== entry.id);
    writeJson(this.store, boardKey(gameId), [...others, entry]);
  }
}

export interface Submission {
  readonly name: string;
  readonly score: number;
  readonly details: ScoreDetails;
}

export type SubmitResult = 'global' | 'local';

/**
 * Uses the global (remote) board when it answers and always keeps a local copy as fallback.
 * Local entries use the device id; remote entries use the id the backend assigns.
 */
export class ResilientLeaderboard {
  /** True when the last list() came from the remote backend. */
  online = false;
  private remoteId: string | null = null;

  constructor(
    private readonly local: LeaderboardRepository,
    private readonly remote: RemoteLeaderboard | null,
    private readonly localId: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get hasRemote(): boolean {
    return this.remote !== null;
  }

  isMine(entry: LeaderboardEntry): boolean {
    return entry.id === this.localId || entry.id === this.remoteId;
  }

  async list(gameId: string, max = 10): Promise<LeaderboardEntry[]> {
    if (this.remote) {
      try {
        const [entries, id] = await Promise.all([
          this.remote.list(gameId, max),
          this.remote.playerId(),
        ]);
        this.remoteId = id;
        this.online = true;
        return entries;
      } catch (err) {
        console.warn('Ranking global indisponível, usando ranking local.', err);
      }
    }
    this.online = false;
    return this.local.list(gameId, max);
  }

  async submit(gameId: string, s: Submission): Promise<SubmitResult> {
    const base = {
      name: sanitizeName(s.name),
      score: s.score,
      details: sanitizeDetails(s.details),
      date: this.now().toISOString(),
    };
    await this.local.submit(gameId, { ...base, id: this.localId });
    if (!this.remote) return 'local';
    try {
      this.remoteId = await this.remote.playerId();
      await this.remote.submit(gameId, { ...base, id: this.remoteId });
      return 'global';
    } catch (err) {
      console.warn('Não foi possível enviar ao ranking global.', err);
      return 'local';
    }
  }
}
