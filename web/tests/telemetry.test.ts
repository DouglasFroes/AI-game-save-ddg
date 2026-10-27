import { describe, expect, it } from 'vitest';
import { PlaySessionTracker, SCENE_TO_GAME } from '@/platform/sessionTracker';
import { MemoryStore } from '@/platform/storage';
import {
  buildDashboardReport,
  clampDuration,
  formatDuration,
  LocalTelemetry,
  mergeSessions,
  parseSession,
  ResilientTelemetry,
  type PlaySession,
  type RemoteTelemetry,
} from '@/platform/telemetry';
import { GAMES, type GameId } from '@/games/registry';

const ALL_IDS: readonly GameId[] = GAMES.map((g) => g.id);
const isKnown = (id: string): id is GameId => ALL_IDS.includes(id as GameId);

const makeSession = (
  overrides: Partial<PlaySession> & Pick<PlaySession, 'id' | 'playerId' | 'gameId'>,
): PlaySession => ({
  playerName: 'Ana',
  durationSec: 60,
  score: 100,
  startedAt: '2026-10-20T10:00:00.000Z',
  endedAt: '2026-10-20T10:01:00.000Z',
  ...overrides,
});

describe('telemetry parsing & duration formatting', () => {
  it('validates and clamps sessions', () => {
    expect(clampDuration(NaN)).toBe(0);
    expect(clampDuration(-10)).toBe(0);
    expect(clampDuration(99_999)).toBe(43_200);
    expect(parseSession(null)).toBeNull();
    expect(
      parseSession(
        {
          id: 's1',
          playerId: 'u1',
          playerName: '  <b>Bia</b> ',
          gameId: 'sudoku',
          durationSec: 125.4,
          score: 500,
          startedAt: '2026-10-20T10:00:00Z',
          endedAt: '2026-10-20T10:02:05Z',
        },
        isKnown,
      ),
    ).toEqual({
      id: 's1',
      playerId: 'u1',
      playerName: 'bBia/b',
      gameId: 'sudoku',
      durationSec: 125,
      score: 500,
      startedAt: '2026-10-20T10:00:00Z',
      endedAt: '2026-10-20T10:02:05Z',
    });
    // Rejects sub-second sessions or unknown games
    expect(
      parseSession(
        {
          id: 's2',
          playerId: 'u1',
          playerName: 'A',
          gameId: 'sudoku',
          durationSec: 0,
          score: 0,
          startedAt: '2026-10-20T10:00:00Z',
          endedAt: '2026-10-20T10:00:00Z',
        },
        isKnown,
      ),
    ).toBeNull();
    expect(
      parseSession(
        {
          id: 's3',
          playerId: 'u1',
          playerName: 'A',
          gameId: 'unknown-game',
          durationSec: 30,
          score: 0,
          startedAt: '2026-10-20T10:00:00Z',
          endedAt: '2026-10-20T10:00:30Z',
        },
        isKnown,
      ),
    ).toBeNull();
  });

  it('formats durations in pt-BR', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(120)).toBe('2m');
    expect(formatDuration(135)).toBe('2m 15s');
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(7500)).toBe('2h 5m');
  });
});

describe('LocalTelemetry & ResilientTelemetry', () => {
  it('stores and merges local and remote sessions without duplicates', async () => {
    const store = new MemoryStore();
    const local = new LocalTelemetry(store, isKnown);
    const remoteSaved: PlaySession[] = [];
    const remote: RemoteTelemetry = {
      playerId: async () => 'api-player-1',
      record: async (s) => {
        remoteSaved.push(s);
      },
      listAll: async () => [
        ...remoteSaved,
        makeSession({
          id: 'remote-only',
          playerId: 'api-player-2',
          playerName: 'Duda',
          gameId: 'blockblast',
          durationSec: 300,
          endedAt: '2026-10-20T12:00:00.000Z',
        }),
      ],
    };

    const telemetry = new ResilientTelemetry(
      local,
      remote,
      () => ({ playerId: 'local-1', name: 'Ana' }),
      () => new Date('2026-10-20T10:05:00.000Z'),
    );

    const recorded = await telemetry.recordSession({
      id: 'sess-1',
      gameId: 'sudoku',
      durationSec: 180,
      score: 1200,
      startedAt: new Date('2026-10-20T10:02:00.000Z'),
    });

    expect(recorded?.playerId).toBe('api-player-1');
    const all = await telemetry.listAll();
    expect(all).toHaveLength(2);
    expect(all.map((s) => s.id)).toEqual(['remote-only', 'sess-1']);
  });

  it('merges sessions deduplicating by id', () => {
    const a = makeSession({ id: '1', playerId: 'u1', gameId: 'snake', durationSec: 50 });
    const b = makeSession({ id: '1', playerId: 'u1-remote', gameId: 'snake', durationSec: 50 });
    const merged = mergeSessions([b], [a]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.playerId).toBe('u1-remote');
  });
});

describe('PlaySessionTracker', () => {
  it('maps every registered game to a gameplay scene', () => {
    const trackedGames = new Set(Object.values(SCENE_TO_GAME));
    for (const id of ALL_IDS) {
      expect(trackedGames.has(id)).toBe(true);
    }
  });

  it('tracks active time, pauses when hidden, and flushes once per run', async () => {
    let now = 1_000_000;
    const store = new MemoryStore();
    const telemetry = new ResilientTelemetry(
      new LocalTelemetry(store, isKnown),
      null,
      () => ({ playerId: 'u1', name: 'Leo' }),
      () => new Date(now),
    );
    const tracker = new PlaySessionTracker(telemetry, () => now);

    // Start Snake
    tracker.startScene('Snake', true);
    now += 10_000; // 10s active
    tracker.setVisible(false);
    now += 50_000; // 50s in background (must be ignored)
    tracker.setVisible(true);
    now += 15_000; // +15s active = 25s total

    tracker.completeRun('snake', 340);
    // Subsequent stopScene when leaving GameOver must not double-record
    tracker.stopScene('Snake');

    const sessions = await telemetry.listAll();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      playerId: 'u1',
      playerName: 'Leo',
      gameId: 'snake',
      durationSec: 25,
      score: 340,
    });
  });
});

describe('buildDashboardReport & /ch route helpers', () => {
  it('computes per-user play time, favorite game, and most played games ranking', () => {
    const now = new Date('2026-10-20T15:00:00.000Z');
    const sessions: PlaySession[] = [
      makeSession({
        id: 's1',
        playerId: 'u1',
        playerName: 'Ana',
        gameId: 'sudoku',
        durationSec: 400,
        score: 1200,
        startedAt: '2026-10-20T10:00:00.000Z',
        endedAt: '2026-10-20T10:06:40.000Z',
      }),
      makeSession({
        id: 's2',
        playerId: 'u1',
        playerName: 'Ana',
        gameId: 'snake',
        durationSec: 100,
        score: 40,
        startedAt: '2026-10-20T11:00:00.000Z',
        endedAt: '2026-10-20T11:01:40.000Z',
      }),
      makeSession({
        id: 's3',
        playerId: 'u2',
        playerName: 'Beto',
        gameId: 'snake',
        durationSec: 600,
        score: 85,
        startedAt: '2026-10-18T14:00:00.000Z',
        endedAt: '2026-10-18T14:10:00.000Z',
      }),
    ];

    const report = buildDashboardReport(sessions, ALL_IDS, now);
    expect(report.totalUsers).toBe(2);
    expect(report.activeUsersToday).toBe(1); // Ana played on 2026-10-20
    expect(report.activeUsers7d).toBe(2); // Both played within 7 days
    expect(report.totalSessions).toBe(3);
    expect(report.totalPlayTimeSec).toBe(1100);
    expect(report.topGameByTime?.gameId).toBe('snake'); // 700s vs 400s
    expect(report.topGameByTime?.totalTimeSec).toBe(700);
    expect(report.topGameByTime?.uniquePlayers).toBe(2);

    // Users sorted by total play time desc: Beto (600s), Ana (500s)
    expect(report.users.map((u) => [u.playerName, u.totalTimeSec, u.favoriteGameId])).toEqual([
      ['Beto', 600, 'snake'],
      ['Ana', 500, 'sudoku'],
    ]);
    expect(report.users[1]?.games.map((g) => [g.gameId, g.totalTimeSec])).toEqual([
      ['sudoku', 400],
      ['snake', 100],
    ]);
  });
});
