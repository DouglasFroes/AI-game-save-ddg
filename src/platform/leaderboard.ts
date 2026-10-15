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
/** Size of the global board scores are automatically sent to. */
export const GLOBAL_TOP = 20;

/**
 * Where `score` would land in a board (1-based), counting every other player; null when it
 * stays outside the top `size`, or when the player already has an equal or better entry there
 * (a worse run must never overwrite their best).
 */
export function placementFor(
  entries: readonly LeaderboardEntry[],
  score: number,
  isMine: (e: LeaderboardEntry) => boolean,
  size = GLOBAL_TOP,
): number | null {
  const mine = entries.find(isMine);
  if (mine && mine.score >= score) return null;
  const rank = entries.filter((e) => !isMine(e) && e.score >= score).length + 1;
  return rank <= size ? rank : null;
}
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

  /** One row per player: a lower score never replaces their best (only their name changes). */
  async submit(gameId: string, entry: LeaderboardEntry): Promise<void> {
    const all = this.read(gameId);
    const prev = all.find((e) => e.id === entry.id);
    const keep = prev && prev.score > entry.score ? { ...prev, name: entry.name } : entry;
    writeJson(this.store, boardKey(gameId), [...all.filter((e) => e.id !== entry.id), keep]);
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
  private readonly pending = new Map<string, Promise<unknown>>();

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

  /**
   * Sends the run only if it makes the top 20 (and beats the player's own entry there).
   * Returns its place and where it went, or null when it didn't qualify.
   */
  autoSubmit(
    gameId: string,
    s: Submission,
  ): Promise<{ rank: number; result: SubmitResult } | null> {
    // One at a time per game: a quick second run must see the first one already on the board,
    // or a worse score could overwrite a better one.
    const prev = this.pending.get(gameId) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(() => this.qualifyAndSubmit(gameId, s));
    this.pending.set(gameId, next);
    return next;
  }

  /** Where a score would land in the top 20 (or null), without sending anything. */
  qualify(gameId: string, score: number): Promise<number | null> {
    const prev = this.pending.get(gameId) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(async () =>
        placementFor(await this.list(gameId, GLOBAL_TOP), score, (e) => this.isMine(e)),
      );
    this.pending.set(gameId, next);
    return next;
  }

  private async qualifyAndSubmit(
    gameId: string,
    s: Submission,
  ): Promise<{ rank: number; result: SubmitResult } | null> {
    const entries = await this.list(gameId, GLOBAL_TOP);
    const rank = placementFor(entries, s.score, (e) => this.isMine(e));
    if (rank === null) return null;
    return { rank, result: await this.submit(gameId, s) };
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
