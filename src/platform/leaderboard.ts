import type { ScoreDetails } from './bestScores';
import { readJson, writeJson, type KeyValueStore } from './storage';

export interface LeaderboardEntry {
  /** Unique per entry: a player can hold several places on a board. */
  readonly id: string;
  /** Who made it (device id locally, Firebase uid globally). */
  readonly player: string;
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
  /** `replace`: the player's previous entry is replaced (campaign games keep one per player). */
  submit(gameId: string, entry: LeaderboardEntry, replace?: boolean): Promise<void>;
}

/**
 * Campaign games rank a running total (all levels together), so each player keeps a single
 * entry that grows; every other game ranks each run on its own.
 */
export const CAMPAIGN_GAMES: ReadonlySet<string> = new Set(['doguinho', 'memofases']);

/** A remote board that assigns its own player id (e.g. Firebase anonymous uid). */
export interface RemoteLeaderboard extends LeaderboardRepository {
  playerId(): Promise<string>;
}

export const MAX_NAME_LENGTH = 16;
/** Size of the global board scores are automatically sent to. */
export const GLOBAL_TOP = 20;

/**
 * Where `score` would land in a board (1-based; ties go after the older entries), or null when
 * it stays outside the top `size`. Every run counts on its own: the same player may hold several
 * places, and a worse run never replaces a better one.
 */
export function placementFor(
  entries: readonly LeaderboardEntry[],
  score: number,
  size = GLOBAL_TOP,
  tie: { gameId: string; details: ScoreDetails } | null = null,
): number | null {
  const mine = tie ? tieValue(tie.gameId, tie.details) : 0;
  const ahead = entries.filter(
    (e) =>
      e.score > score || (e.score === score && (!tie || tieValue(tie.gameId, e.details) >= mine)),
  ).length;
  const rank = ahead + 1;
  return rank <= size ? rank : null;
}

/**
 * Games where equal scores are settled by a second number (higher wins), e.g. Stack: the floors
 * tie, the one with more perfect drops ranks first. Games not listed tie by date only.
 */
export const TIEBREAK: Readonly<Record<string, string>> = { stack: 'perfects' };

/** The tiebreak number of a run (0 when the game has none or the run lacks it). */
export function tieValue(gameId: string, details: ScoreDetails): number {
  const key = TIEBREAK[gameId];
  return key ? (details[key] ?? 0) : 0;
}

/** Score first, then the game's tiebreak, then the older run. Shared by every board. */
export function compareRuns(
  gameId: string,
  a: { score: number; details: ScoreDetails; date: string },
  b: { score: number; details: ScoreDetails; date: string },
): number {
  return (
    b.score - a.score ||
    tieValue(gameId, b.details) - tieValue(gameId, a.details) ||
    a.date.localeCompare(b.date)
  );
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

/** Sorted by score, then the game's tiebreak, then oldest first (an earlier run keeps a tie). */
export function rankEntries(entries: readonly LeaderboardEntry[], gameId = ''): LeaderboardEntry[] {
  return [...entries].sort((a, b) => compareRuns(gameId, a, b));
}

export function parseEntry(raw: unknown): LeaderboardEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== 'string' || typeof e.name !== 'string' || typeof e.date !== 'string')
    return null;
  if (typeof e.score !== 'number' || !Number.isFinite(e.score)) return null;
  return {
    id: e.id,
    // Older entries (one per player) used the player id as their own id.
    player: typeof e.player === 'string' ? e.player : e.id,
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
    return rankEntries(this.read(gameId), gameId).slice(0, max);
  }

  /** Every run is its own row; only the best GLOBAL_TOP are kept (the rest is dropped). */
  async submit(gameId: string, entry: LeaderboardEntry, replace = false): Promise<void> {
    const others = this.read(gameId).filter((e) => !replace || e.player !== entry.player);
    const kept = rankEntries([...others, entry], gameId).slice(0, GLOBAL_TOP);
    writeJson(this.store, boardKey(gameId), kept);
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
    return entry.player === this.localId || entry.player === this.remoteId;
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
   * Sends the run only if it makes the top 20.
   * Returns its place and where it went, or null when it didn't qualify.
   */
  autoSubmit(
    gameId: string,
    s: Submission,
  ): Promise<{ rank: number; result: SubmitResult } | null> {
    // One at a time per game: a quick second run must see the first one already on the board,
    // or both would claim the same place.
    const prev = this.pending.get(gameId) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(() => this.qualifyAndSubmit(gameId, s));
    this.pending.set(gameId, next);
    return next;
  }

  /** Where a score would land in the top 20 (or null), without sending anything. */
  qualify(gameId: string, score: number, details: ScoreDetails = {}): Promise<number | null> {
    const prev = this.pending.get(gameId) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(async () =>
        this.placement(gameId, await this.list(gameId, GLOBAL_TOP), score, details),
      );
    this.pending.set(gameId, next);
    return next;
  }

  private async qualifyAndSubmit(
    gameId: string,
    s: Submission,
  ): Promise<{ rank: number; result: SubmitResult } | null> {
    const entries = await this.list(gameId, GLOBAL_TOP);
    const rank = this.placement(gameId, entries, s.score, s.details);
    if (rank === null) return null;
    return { rank, result: await this.submit(gameId, s) };
  }

  /** Campaign games: the player's own entry doesn't count, and a lower total is never sent. */
  private placement(
    gameId: string,
    entries: LeaderboardEntry[],
    score: number,
    details: ScoreDetails,
  ): number | null {
    const tie = { gameId, details };
    if (!CAMPAIGN_GAMES.has(gameId)) return placementFor(entries, score, GLOBAL_TOP, tie);
    const mine = entries.find((e) => this.isMine(e));
    if (mine && mine.score >= score) return null;
    return placementFor(
      entries.filter((e) => !this.isMine(e)),
      score,
      GLOBAL_TOP,
      tie,
    );
  }

  async submit(gameId: string, s: Submission): Promise<SubmitResult> {
    const replace = CAMPAIGN_GAMES.has(gameId);
    const base = {
      name: sanitizeName(s.name),
      score: s.score,
      details: sanitizeDetails(s.details),
      date: this.now().toISOString(),
    };
    const id = `${base.date}-${Math.random().toString(36).slice(2, 8)}`;
    await this.local.submit(gameId, { ...base, id, player: this.localId }, replace);
    if (!this.remote) return 'local';
    try {
      this.remoteId = await this.remote.playerId();
      await this.remote.submit(gameId, { ...base, id, player: this.remoteId }, replace);
      return 'global';
    } catch (err) {
      console.warn('Não foi possível enviar ao ranking global.', err);
      return 'local';
    }
  }
}
