import type { ScoreDetails } from './bestScores';
import { boardId } from './boards';
import type { Outbox } from './outbox';
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
  /** False while the player isn't signed in (only signed-in players reach the global board). */
  canSubmit?(): Promise<boolean>;
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
  const ahead = entries.filter(
    (e) =>
      e.score > score ||
      (e.score === score && (!tie || compareTies(tie.gameId, e.details, tie.details) <= 0)),
  ).length;
  const rank = ahead + 1;
  return rank <= size ? rank : null;
}

/**
 * Games where equal scores are settled by extra numbers, in order. `desc`: higher wins (Stack:
 * more perfect drops); `asc`: lower wins (Jogo do Milhão: fewer helps used, then less time).
 * Games not listed tie by date only.
 */
export const TIEBREAK: Readonly<
  Record<string, ReadonlyArray<{ key: string; order: 'asc' | 'desc'; zeroIsWorst?: boolean }>>
> = {
  stack: [{ key: 'perfects', order: 'desc' }],
  // Same points: the faster best reaction wins.
  relampago: [{ key: 'best', order: 'asc', zeroIsWorst: true }],
  // Same points: fewer re-rolls, then the better squad.
  brasileirao: [
    { key: 'rerolls', order: 'asc' },
    { key: 'ovr', order: 'desc' },
  ],
  timesbr: [
    { key: 'rerolls', order: 'asc' },
    { key: 'ovr', order: 'desc' },
  ],
  selecao: [
    { key: 'rerolls', order: 'asc' },
    { key: 'ovr', order: 'desc' },
  ],
  milhao: [
    { key: 'helps', order: 'asc' },
    { key: 'time', order: 'asc' },
  ],
  arqueiro: [{ key: 'bullseyes', order: 'desc' }],
  galeria: [{ key: 'accuracy', order: 'desc' }],
  sniper: [
    { key: 'xs', order: 'desc' },
    { key: 'tens', order: 'desc' },
  ],
};

/** Negative when `a` ranks ahead of `b` on the game's tiebreaks, positive when behind, 0 if equal. */
export function compareTies(gameId: string, a: ScoreDetails, b: ScoreDetails): number {
  for (const { key, order, zeroIsWorst } of TIEBREAK[gameId] ?? []) {
    // A run lacking the number counts as the worst possible.
    const worst = order === 'asc' ? Infinity : -Infinity;
    // `zeroIsWorst`: older runs stored 0 for "no value yet" (e.g. no reaction time).
    const val = (d: ScoreDetails) => (zeroIsWorst && !d[key] ? worst : (d[key] ?? worst));
    const x = val(a);
    const y = val(b);
    if (x === y) continue;
    return (order === 'asc' ? x < y : x > y) ? -1 : 1;
  }
  return 0;
}

/** Score first, then the game's tiebreaks, then the older run. Shared by every board. */
export function compareRuns(
  gameId: string,
  a: { score: number; details: ScoreDetails; date: string },
  b: { score: number; details: ScoreDetails; date: string },
): number {
  return (
    b.score - a.score || compareTies(gameId, a.details, b.details) || a.date.localeCompare(b.date)
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

const boardKey = (gameId: string) => `arcade.board.${boardId(gameId)}`;

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

/** `login`: kept on the device and queued; it goes global once the player signs in. */
export type SubmitResult = 'global' | 'local' | 'login';

/** A run saved on the device while the global board was out of reach. */
export interface PendingScore {
  readonly gameId: string;
  /** Carries the device's player id; the real (Firebase) id is filled in when it is sent. */
  readonly entry: LeaderboardEntry;
  readonly replace: boolean;
}

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
    /** Runs that couldn't reach the global board yet; sent by `flush()` once the device is online. */
    private readonly outbox: Outbox<PendingScore> | null = null,
  ) {}

  get hasRemote(): boolean {
    return this.remote !== null;
  }

  /** Runs saved on the device that are still waiting to be sent to the global board. */
  get pendingCount(): number {
    return this.outbox?.size ?? 0;
  }

  /** Sends the runs that were played offline. Safe to call at any time; returns how many went. */
  async flush(): Promise<number> {
    const { remote, outbox } = this;
    if (!remote || !outbox || outbox.size === 0) return 0;
    try {
      if (!(await this.signedIn())) return 0;
      const uid = await remote.playerId();
      this.remoteId = uid;
      return await outbox.drain((p) =>
        remote.submit(p.gameId, { ...p.entry, player: uid }, p.replace),
      );
    } catch (err) {
      console.warn('Ainda sem conexão com o ranking global.', err);
      return 0;
    }
  }

  /** Whether runs can go to the global board now (always, for backends without accounts). */
  async signedIn(): Promise<boolean> {
    if (!this.remote?.canSubmit) return this.remote !== null;
    return this.remote.canSubmit().catch(() => false);
  }

  /** Re-reads the remote player id (after signing in or out). */
  async refreshIdentity(): Promise<void> {
    if (!this.remote) return;
    this.remoteId = await this.remote.playerId().catch(() => this.remoteId);
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

  /** The board saved on this device only (no network). */
  listLocal(gameId: string, max = 10): Promise<LeaderboardEntry[]> {
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
    const entry = { ...base, id, player: this.localId };
    await this.local.submit(gameId, entry, replace);
    if (!this.remote) return 'local';
    if (this.remote.canSubmit && !(await this.signedIn())) {
      // Not signed in: the run waits on the device and is sent right after signing in.
      this.queue({ gameId, entry, replace });
      return 'login';
    }
    try {
      this.remoteId = await this.remote.playerId();
      await this.remote.submit(gameId, { ...base, id, player: this.remoteId }, replace);
      // The connection works: this is also a good moment to send anything left from offline play.
      void this.flush();
      return 'global';
    } catch (err) {
      console.warn(
        'Não foi possível enviar ao ranking global; fica para quando voltar a conexão.',
        err,
      );
      this.queue({ gameId, entry, replace });
      return 'local';
    }
  }

  /** A campaign total supersedes the older queued ones; every other run is kept on its own. */
  private queue(p: PendingScore): void {
    this.outbox?.add(p, p.replace ? (q) => q.gameId === p.gameId : undefined);
  }
}
