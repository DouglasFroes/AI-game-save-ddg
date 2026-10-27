import type { GameId } from '@/games/registry';
import { sanitizeName } from './leaderboard';
import type { Outbox } from './outbox';
import { createId, readJson, writeJson, type KeyValueStore } from './storage';

/** Max local sessions retained on the device so localStorage never bloats. */
export const MAX_LOCAL_SESSIONS = 1000;
/** Cap on a single session duration (12 hours) to guard against stuck clocks. */
export const MAX_SESSION_SECONDS = 43_200;
/** Ignore accidental sub-second flashes when a scene starts and stops immediately. */
export const MIN_SESSION_SECONDS = 1;

export interface PlaySession {
  readonly id: string;
  readonly playerId: string;
  readonly playerName: string;
  readonly gameId: GameId;
  /** Active play time in seconds. */
  readonly durationSec: number;
  readonly score: number;
  /** ISO-8601 start timestamp. */
  readonly startedAt: string;
  /** ISO-8601 end timestamp. */
  readonly endedAt: string;
}

export interface GameStatsSummary {
  readonly gameId: GameId;
  readonly totalTimeSec: number;
  readonly sessionsCount: number;
  readonly uniquePlayers: number;
  readonly avgSessionSec: number;
  readonly bestScore: number;
  readonly lastPlayedAt: string | null;
}

export interface UserGameBreakdown {
  readonly gameId: GameId;
  readonly totalTimeSec: number;
  readonly sessionsCount: number;
  readonly bestScore: number;
  readonly lastPlayedAt: string;
}

export interface UserStatsSummary {
  readonly playerId: string;
  readonly playerName: string;
  readonly totalTimeSec: number;
  readonly sessionsCount: number;
  readonly favoriteGameId: GameId | null;
  readonly favoriteGameTimeSec: number;
  readonly gamesPlayedCount: number;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly games: readonly UserGameBreakdown[];
}

export interface DashboardReport {
  readonly totalUsers: number;
  readonly activeUsersToday: number;
  readonly activeUsers7d: number;
  readonly totalSessions: number;
  readonly totalPlayTimeSec: number;
  readonly avgTimePerUserSec: number;
  readonly avgSessionSec: number;
  readonly topGameByTime: GameStatsSummary | null;
  readonly topGameBySessions: GameStatsSummary | null;
  readonly games: readonly GameStatsSummary[];
  readonly users: readonly UserStatsSummary[];
  readonly recentSessions: readonly PlaySession[];
  readonly dailyActivity: readonly {
    date: string;
    sessions: number;
    totalTimeSec: number;
    activeUsers: number;
  }[];
}

export interface TelemetryRepository {
  record(session: PlaySession): Promise<void>;
  listAll(max?: number): Promise<PlaySession[]>;
}

const SESSIONS_KEY = 'arcade.telemetry.sessions.v1';

export function clampDuration(sec: number): number {
  if (!Number.isFinite(sec)) return 0;
  return Math.min(MAX_SESSION_SECONDS, Math.max(0, Math.round(sec)));
}

export function parseSession(
  raw: unknown,
  isGameId?: (id: string) => id is GameId,
): PlaySession | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.id !== 'string' ||
    !r.id ||
    typeof r.playerId !== 'string' ||
    !r.playerId ||
    typeof r.gameId !== 'string' ||
    !r.gameId ||
    typeof r.startedAt !== 'string' ||
    typeof r.endedAt !== 'string'
  ) {
    return null;
  }
  if (isGameId && !isGameId(r.gameId)) return null;
  const durationSec = clampDuration(typeof r.durationSec === 'number' ? r.durationSec : 0);
  if (durationSec < MIN_SESSION_SECONDS) return null;
  const score =
    typeof r.score === 'number' && Number.isFinite(r.score) && r.score >= 0
      ? Math.round(r.score)
      : 0;
  const playerName =
    typeof r.playerName === 'string' && r.playerName.trim()
      ? sanitizeName(r.playerName)
      : 'Anônimo';
  return {
    id: r.id,
    playerId: r.playerId,
    playerName,
    gameId: r.gameId as GameId,
    durationSec,
    score,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
  };
}

export class LocalTelemetry implements TelemetryRepository {
  constructor(
    private readonly store: KeyValueStore,
    private readonly isGameId?: (id: string) => id is GameId,
  ) {}

  read(): PlaySession[] {
    const raw = readJson<unknown[]>(this.store, SESSIONS_KEY);
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item) => parseSession(item, this.isGameId))
      .filter((s): s is PlaySession => s !== null);
  }

  async record(session: PlaySession): Promise<void> {
    const parsed = parseSession(session, this.isGameId);
    if (!parsed) return;
    const existing = this.read().filter((s) => s.id !== parsed.id);
    const updated = [parsed, ...existing]
      .sort((a, b) => b.endedAt.localeCompare(a.endedAt))
      .slice(0, MAX_LOCAL_SESSIONS);
    writeJson(this.store, SESSIONS_KEY, updated);
  }

  async listAll(max = MAX_LOCAL_SESSIONS): Promise<PlaySession[]> {
    return this.read()
      .sort((a, b) => b.endedAt.localeCompare(a.endedAt))
      .slice(0, max);
  }
}

export interface RemoteTelemetry extends TelemetryRepository {
  playerId(): Promise<string>;
}

/**
 * Dual-write telemetry service: always saves locally and syncs to the API when configured.
 * When building the admin dashboard, merges remote + local sessions (deduplicating by id).
 */
export class ResilientTelemetry {
  online = false;

  constructor(
    private readonly local: LocalTelemetry,
    private readonly remote: RemoteTelemetry | null,
    private readonly getProfile: () => { playerId: string; name: string },
    private readonly now: () => Date = () => new Date(),
    /** Sessions the server hasn't received yet (played offline); sent by `flush()`. */
    private readonly outbox: Outbox<PlaySession> | null = null,
  ) {}

  get hasRemote(): boolean {
    return this.remote !== null;
  }

  /** Sends the sessions recorded while offline. Safe to call at any time; returns how many went. */
  async flush(): Promise<number> {
    const { remote, outbox } = this;
    if (!remote || !outbox || outbox.size === 0) return 0;
    try {
      const uid = await remote.playerId();
      // Sessions are stored by id on the server, so a retried one just overwrites itself.
      return await outbox.drain((s) => remote.record({ ...s, playerId: uid }));
    } catch (err) {
      console.warn('Telemetria ainda sem conexão.', err);
      return 0;
    }
  }

  async recordSession(input: {
    id?: string;
    gameId: GameId;
    durationSec: number;
    score?: number;
    startedAt: Date;
    endedAt?: Date;
  }): Promise<PlaySession | null> {
    const durationSec = clampDuration(input.durationSec);
    if (durationSec < MIN_SESSION_SECONDS) return null;
    const profile = this.getProfile();
    const ended = input.endedAt ?? this.now();
    const id = input.id ?? `${ended.toISOString()}-${createId()}`;
    const baseSession: PlaySession = {
      id,
      playerId: profile.playerId,
      playerName: profile.name.trim() ? sanitizeName(profile.name) : 'Anônimo',
      gameId: input.gameId,
      durationSec,
      score: Math.max(0, Math.round(input.score ?? 0)),
      startedAt: input.startedAt.toISOString(),
      endedAt: ended.toISOString(),
    };

    await this.local.record(baseSession);

    if (this.remote) {
      try {
        const uid = await this.remote.playerId();
        const remoteSession: PlaySession = { ...baseSession, playerId: uid };
        await this.remote.record(remoteSession);
        // Update local entry with the canonical remote playerId so merged views don't split the user.
        await this.local.record(remoteSession);
        this.online = true;
        void this.flush();
        return remoteSession;
      } catch (err) {
        console.warn('Telemetria remota indisponível, sessão salva localmente.', err);
        this.online = false;
        this.outbox?.add(baseSession);
      }
    }
    return baseSession;
  }

  async listAll(max = 2000): Promise<PlaySession[]> {
    const localSessions = await this.local.listAll(max);
    if (!this.remote) {
      this.online = false;
      return localSessions;
    }
    try {
      const remoteSessions = await this.remote.listAll(max);
      this.online = true;
      return mergeSessions(remoteSessions, localSessions).slice(0, max);
    } catch (err) {
      console.warn('Falha ao buscar sessões remotas, usando dados locais.', err);
      this.online = false;
      return localSessions;
    }
  }
}

/** Deduplicates sessions by `id`, preferring remote records, sorted newest first. */
export function mergeSessions(
  primary: readonly PlaySession[],
  secondary: readonly PlaySession[],
): PlaySession[] {
  const map = new Map<string, PlaySession>();
  for (const s of secondary) map.set(s.id, s);
  for (const s of primary) map.set(s.id, s);
  return [...map.values()].sort((a, b) => b.endedAt.localeCompare(a.endedAt));
}

/**
 * Pure aggregation engine: computes every metric for the Admin Dashboard from a list of sessions
 * and the list of registered game ids.
 */
export function buildDashboardReport(
  sessions: readonly PlaySession[],
  allGameIds: readonly GameId[],
  now: Date = new Date(),
): DashboardReport {
  const todayPrefix = now.toISOString().slice(0, 10);
  const sevenDaysAgoMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  // 1. Per-game aggregation
  const gameMap = new Map<
    GameId,
    {
      totalTimeSec: number;
      sessionsCount: number;
      players: Set<string>;
      bestScore: number;
      lastPlayedAt: string | null;
    }
  >();

  for (const gid of allGameIds) {
    gameMap.set(gid, {
      totalTimeSec: 0,
      sessionsCount: 0,
      players: new Set(),
      bestScore: 0,
      lastPlayedAt: null,
    });
  }

  // 2. Per-user aggregation
  const userMap = new Map<
    string,
    {
      playerId: string;
      playerName: string;
      latestNameDate: string;
      totalTimeSec: number;
      sessionsCount: number;
      firstSeenAt: string;
      lastSeenAt: string;
      byGame: Map<
        GameId,
        {
          totalTimeSec: number;
          sessionsCount: number;
          bestScore: number;
          lastPlayedAt: string;
        }
      >;
    }
  >();

  const usersToday = new Set<string>();
  const users7d = new Set<string>();
  let totalPlayTimeSec = 0;

  // 3. Last 14 days daily buckets
  const dailyMap = new Map<
    string,
    { sessions: number; totalTimeSec: number; users: Set<string> }
  >();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    dailyMap.set(d, { sessions: 0, totalTimeSec: 0, users: new Set() });
  }

  for (const s of sessions) {
    totalPlayTimeSec += s.durationSec;

    const day = s.endedAt.slice(0, 10);
    if (day === todayPrefix) usersToday.add(s.playerId);
    const endedMs = Date.parse(s.endedAt);
    if (!Number.isNaN(endedMs) && endedMs >= sevenDaysAgoMs) {
      users7d.add(s.playerId);
    }

    const dailyBucket = dailyMap.get(day);
    if (dailyBucket) {
      dailyBucket.sessions += 1;
      dailyBucket.totalTimeSec += s.durationSec;
      dailyBucket.users.add(s.playerId);
    }

    // Game bucket
    let g = gameMap.get(s.gameId);
    if (!g) {
      g = {
        totalTimeSec: 0,
        sessionsCount: 0,
        players: new Set(),
        bestScore: 0,
        lastPlayedAt: null,
      };
      gameMap.set(s.gameId, g);
    }
    g.totalTimeSec += s.durationSec;
    g.sessionsCount += 1;
    g.players.add(s.playerId);
    if (s.score > g.bestScore) g.bestScore = s.score;
    if (!g.lastPlayedAt || s.endedAt > g.lastPlayedAt) g.lastPlayedAt = s.endedAt;

    // User bucket
    let u = userMap.get(s.playerId);
    if (!u) {
      u = {
        playerId: s.playerId,
        playerName: s.playerName,
        latestNameDate: s.endedAt,
        totalTimeSec: 0,
        sessionsCount: 0,
        firstSeenAt: s.startedAt,
        lastSeenAt: s.endedAt,
        byGame: new Map(),
      };
      userMap.set(s.playerId, u);
    }
    u.totalTimeSec += s.durationSec;
    u.sessionsCount += 1;
    if (s.startedAt < u.firstSeenAt) u.firstSeenAt = s.startedAt;
    if (s.endedAt > u.lastSeenAt) u.lastSeenAt = s.endedAt;
    // Prefer the most recent non-anonymous name if available
    if (
      (s.playerName !== 'Anônimo' && u.playerName === 'Anônimo') ||
      (s.playerName !== 'Anônimo' && s.endedAt >= u.latestNameDate)
    ) {
      u.playerName = s.playerName;
      u.latestNameDate = s.endedAt;
    }

    let ug = u.byGame.get(s.gameId);
    if (!ug) {
      ug = {
        totalTimeSec: 0,
        sessionsCount: 0,
        bestScore: 0,
        lastPlayedAt: s.endedAt,
      };
      u.byGame.set(s.gameId, ug);
    }
    ug.totalTimeSec += s.durationSec;
    ug.sessionsCount += 1;
    if (s.score > ug.bestScore) ug.bestScore = s.score;
    if (s.endedAt > ug.lastPlayedAt) ug.lastPlayedAt = s.endedAt;
  }

  const games: GameStatsSummary[] = [...gameMap.entries()]
    .map(([gameId, g]) => ({
      gameId,
      totalTimeSec: g.totalTimeSec,
      sessionsCount: g.sessionsCount,
      uniquePlayers: g.players.size,
      avgSessionSec: g.sessionsCount > 0 ? Math.round(g.totalTimeSec / g.sessionsCount) : 0,
      bestScore: g.bestScore,
      lastPlayedAt: g.lastPlayedAt,
    }))
    .sort(
      (a, b) =>
        b.totalTimeSec - a.totalTimeSec ||
        b.sessionsCount - a.sessionsCount ||
        a.gameId.localeCompare(b.gameId),
    );

  const users: UserStatsSummary[] = [...userMap.values()]
    .map((u) => {
      const gameBreakdowns: UserGameBreakdown[] = [...u.byGame.entries()]
        .map(([gameId, ug]) => ({
          gameId,
          totalTimeSec: ug.totalTimeSec,
          sessionsCount: ug.sessionsCount,
          bestScore: ug.bestScore,
          lastPlayedAt: ug.lastPlayedAt,
        }))
        .sort(
          (a, b) =>
            b.totalTimeSec - a.totalTimeSec ||
            b.sessionsCount - a.sessionsCount ||
            a.gameId.localeCompare(b.gameId),
        );
      const fav = gameBreakdowns[0] ?? null;
      return {
        playerId: u.playerId,
        playerName: u.playerName,
        totalTimeSec: u.totalTimeSec,
        sessionsCount: u.sessionsCount,
        favoriteGameId: fav ? fav.gameId : null,
        favoriteGameTimeSec: fav ? fav.totalTimeSec : 0,
        gamesPlayedCount: gameBreakdowns.length,
        firstSeenAt: u.firstSeenAt,
        lastSeenAt: u.lastSeenAt,
        games: gameBreakdowns,
      };
    })
    .sort(
      (a, b) =>
        b.totalTimeSec - a.totalTimeSec ||
        b.sessionsCount - a.sessionsCount ||
        b.lastSeenAt.localeCompare(a.lastSeenAt),
    );

  const playedGames = games.filter((g) => g.sessionsCount > 0);
  const topGameByTime = playedGames[0] ?? null;
  const topGameBySessions =
    [...playedGames].sort(
      (a, b) => b.sessionsCount - a.sessionsCount || b.totalTimeSec - a.totalTimeSec,
    )[0] ?? null;

  const recentSessions = [...sessions].sort((a, b) => b.endedAt.localeCompare(a.endedAt));

  const dailyActivity = [...dailyMap.entries()].map(([date, d]) => ({
    date,
    sessions: d.sessions,
    totalTimeSec: d.totalTimeSec,
    activeUsers: d.users.size,
  }));

  return {
    totalUsers: users.length,
    activeUsersToday: usersToday.size,
    activeUsers7d: users7d.size,
    totalSessions: sessions.length,
    totalPlayTimeSec,
    avgTimePerUserSec: users.length > 0 ? Math.round(totalPlayTimeSec / users.length) : 0,
    avgSessionSec: sessions.length > 0 ? Math.round(totalPlayTimeSec / sessions.length) : 0,
    topGameByTime,
    topGameBySessions,
    games,
    users,
    recentSessions,
    dailyActivity,
  };
}

/** Human-friendly duration in pt-BR (e.g. "2h 14m", "18m 30s", "45s"). */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const hours = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hours > 0) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}
