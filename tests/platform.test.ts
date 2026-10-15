import { describe, expect, it } from 'vitest';
import { BestScores } from '@/platform/bestScores';
import { fromFirestore, readFirebaseSettings, withTimeout } from '@/platform/firebaseLeaderboard';
import {
  LocalLeaderboard,
  parseEntry,
  placementFor,
  rankEntries,
  ResilientLeaderboard,
  sanitizeDetails,
  sanitizeName,
  type LeaderboardEntry,
  type RemoteLeaderboard,
} from '@/platform/leaderboard';
import { LocalTop } from '@/platform/localTop';
import { ProfileRepository } from '@/platform/profile';
import { autoSubmit, formatTime } from '@/platform/ranking';
import { MemoryStore, writeJson } from '@/platform/storage';
import type { Services } from '@/services';

const entry = (id: string, score: number, date = '2026-01-01T00:00:00.000Z'): LeaderboardEntry => ({
  id,
  name: id,
  score,
  details: {},
  date,
});

describe('names and details', () => {
  it('sanitizes names', () => {
    expect(sanitizeName('  <b>Ana</b>  ')).toBe('bAna/b');
    expect(sanitizeName('   ')).toBe('Anônimo');
    expect(sanitizeName('x'.repeat(40))).toHaveLength(16);
  });

  it('keeps only finite numeric details', () => {
    expect(sanitizeDetails({ a: 1, b: 'x', c: Infinity, d: 2.5 })).toEqual({ a: 1, d: 2.5 });
    expect(sanitizeDetails(null)).toEqual({});
  });

  it('rejects malformed entries', () => {
    expect(parseEntry({ id: 'a', name: 'A', score: 'nope', date: 'd' })).toBeNull();
    expect(parseEntry({ id: 'a', name: 'A', score: 3, date: 'd' })?.details).toEqual({});
  });
});

describe('ranking', () => {
  it('keeps one row per player, best score first', () => {
    const ranked = rankEntries([entry('a', 5), entry('b', 9), entry('a', 7)]);
    expect(ranked.map((e) => [e.id, e.score])).toEqual([
      ['b', 9],
      ['a', 7],
    ]);
  });

  it('keeps separate local boards per game', async () => {
    const board = new LocalLeaderboard(new MemoryStore());
    await board.submit('sudoku', entry('me', 20));
    await board.submit('blockblast', entry('me', 99));
    await board.submit('sudoku', entry('me', 30));
    expect(await board.list('sudoku', 10)).toEqual([entry('me', 30)]);
    expect((await board.list('blockblast', 10))[0]?.score).toBe(99);
  });

  it('uses the remote board and its player id when available', async () => {
    const saved: Array<[string, LeaderboardEntry]> = [];
    const remote: RemoteLeaderboard = {
      list: async () => [entry('uid-1', 50)],
      submit: async (game, e) => void saved.push([game, e]),
      playerId: async () => 'uid-1',
    };
    const board = new ResilientLeaderboard(
      new LocalLeaderboard(new MemoryStore()),
      remote,
      'local-1',
    );
    expect(await board.submit('sudoku', { name: 'Ana', score: 50, details: { level: 2 } })).toBe(
      'global',
    );
    expect(saved[0]?.[0]).toBe('sudoku');
    expect(saved[0]?.[1]).toMatchObject({ id: 'uid-1', name: 'Ana', score: 50 });
    const list = await board.list('sudoku');
    expect(board.online).toBe(true);
    expect(board.isMine(list[0]!)).toBe(true);
  });

  it('falls back to the local board when the remote fails', async () => {
    const failing: RemoteLeaderboard = {
      list: () => Promise.reject(new Error('offline')),
      submit: () => Promise.reject(new Error('offline')),
      playerId: () => Promise.reject(new Error('offline')),
    };
    const board = new ResilientLeaderboard(
      new LocalLeaderboard(new MemoryStore()),
      failing,
      'local-1',
    );
    expect(await board.submit('roadfighter', { name: 'Ana', score: 10, details: {} })).toBe(
      'local',
    );
    const list = await board.list('roadfighter');
    expect(board.online).toBe(false);
    expect(list.map((e) => e.id)).toEqual(['local-1']);
  });
});

describe('profile and best scores', () => {
  it('migrates the name and settings of the old single-game save', () => {
    const store = new MemoryStore();
    writeJson(store, 'sod.progress.v2', {
      version: 2,
      playerId: 'old',
      playerName: 'Bia',
      muted: true,
    });
    const p = new ProfileRepository(store).get();
    expect(p).toMatchObject({ playerId: 'old', name: 'Bia', muted: true });
    expect(new ProfileRepository(store).update({ name: 'Cris' }).name).toBe('Cris');
  });

  it('only stores better scores', () => {
    const best = new BestScores(new MemoryStore());
    expect(best.offer('bb', { score: 10, details: {} })).toBe(true);
    expect(best.offer('bb', { score: 5, details: {} })).toBe(false);
    expect(best.offer('bb', { score: 11, details: { lines: 2 } })).toBe(true);
    expect(best.get('bb')).toEqual({ score: 11, details: { lines: 2 } });
  });
});

describe('firebase helpers', () => {
  it('reads settings only when the required keys exist', () => {
    expect(readFirebaseSettings({})).toBeNull();
    expect(
      readFirebaseSettings({
        VITE_FIREBASE_API_KEY: 'k',
        VITE_FIREBASE_AUTH_DOMAIN: 'x.firebaseapp.com',
        VITE_FIREBASE_PROJECT_ID: 'x',
        VITE_FIREBASE_APP_ID: '1:2:web:3',
      }),
    ).toMatchObject({ apiKey: 'k', projectId: 'x' });
  });

  it('converts Firestore documents', () => {
    const e = fromFirestore('uid', {
      name: 'Ana',
      score: 42,
      details: { level: 3 },
      date: { toDate: () => new Date('2026-10-14T12:00:00.000Z') },
    });
    expect(e).toEqual({
      id: 'uid',
      name: 'Ana',
      score: 42,
      details: { level: 3 },
      date: '2026-10-14T12:00:00.000Z',
    });
    expect(fromFirestore('uid', { name: 'x' })).toBeNull();
  });

  it('times out slow promises', async () => {
    await expect(withTimeout(new Promise(() => {}), 10)).rejects.toThrow('Tempo esgotado');
    await expect(withTimeout(Promise.resolve(1), 10)).resolves.toBe(1);
  });

  it('formats times', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(125)).toBe('2:05');
  });
});

describe('automatic ranking and local top 10', () => {
  const entry = (id: string, score: number): LeaderboardEntry => ({
    id,
    name: id,
    score,
    details: {},
    date: '2026-01-01T00:00:00.000Z',
  });

  it('places a score in the top 20, never over a better own entry', () => {
    const board = Array.from({ length: 20 }, (_, i) => entry(`p${i}`, 2000 - i * 100));
    const mine = (e: LeaderboardEntry) => e.id === 'me';
    expect(placementFor(board, 1850, mine)).toBe(3);
    expect(placementFor(board, 50, mine)).toBeNull(); // below the 20th
    expect(placementFor(board.slice(0, 5), 50, mine)).toBe(6); // board not full yet
    const withMe = [...board.slice(0, 19), entry('me', 1500)];
    expect(placementFor(withMe, 1400, mine)).toBeNull(); // worse than my own entry
    expect(placementFor(withMe, 1950, mine)).toBe(2);
  });

  it('auto-submits only qualifying runs', async () => {
    const local = new LocalLeaderboard(new MemoryStore());
    for (let i = 0; i < 20; i++) await local.submit('g', entry(`p${i}`, 1000 + i * 10));
    const auto = new ResilientLeaderboard(local, null, 'me');
    expect(await auto.autoSubmit('g', { name: 'Eu', score: 10, details: {} })).toBeNull();
    expect(await auto.autoSubmit('g', { name: 'Eu', score: 1185, details: {} })).toEqual({
      rank: 2,
      result: 'local',
    });
    expect((await local.list('g', 20)).some((e) => e.id === 'me' && e.score === 1185)).toBe(true);
    // A worse run later doesn't replace it.
    expect(await auto.autoSubmit('g', { name: 'Eu', score: 1100, details: {} })).toBeNull();
  });

  it('back-to-back runs never let a worse score overwrite a better one', async () => {
    // A slow remote board, like a real network.
    const rows: LeaderboardEntry[] = [];
    const slow: RemoteLeaderboard = {
      playerId: async () => 'me-remote',
      list: async (_g, max) => {
        await new Promise((r) => setTimeout(r, 20));
        return rankEntries(rows).slice(0, max);
      },
      submit: async (_g, e) => {
        await new Promise((r) => setTimeout(r, 30));
        const i = rows.findIndex((x) => x.id === e.id);
        if (i >= 0) rows.splice(i, 1);
        rows.push(e);
      },
    };
    const board = new ResilientLeaderboard(new LocalLeaderboard(new MemoryStore()), slow, 'me');
    const [first, second] = await Promise.all([
      board.autoSubmit('g', { name: 'Eu', score: 420, details: {} }),
      board.autoSubmit('g', { name: 'Eu', score: 150, details: {} }),
    ]);
    expect(first).toEqual({ rank: 1, result: 'global' });
    expect(second).toBeNull();
    expect(rows.map((r) => r.score)).toEqual([420]);
  });

  it('never sends without a name: it only says where the run would land', async () => {
    const store = new MemoryStore();
    const local = new LocalLeaderboard(store);
    const leaderboard = new ResilientLeaderboard(local, null, 'me');
    const profile = new ProfileRepository(store);
    const services = { leaderboard, profile } as unknown as Services;
    expect(await autoSubmit(services, 'g', { score: 300, details: {} })).toEqual({
      needsName: true,
      rank: 1,
    });
    expect(await local.list('g', 20)).toEqual([]);
    profile.update({ name: 'Ana' });
    expect(await autoSubmit(services, 'g', { score: 300, details: {} })).toEqual({
      rank: 1,
      result: 'local',
    });
    expect(await local.list('g', 20)).toMatchObject([{ name: 'Ana', score: 300 }]);
  });

  it('the device board keeps a player best even if a lower score is sent', async () => {
    const local = new LocalLeaderboard(new MemoryStore());
    await local.submit('g', entry('me', 500));
    await local.submit('g', { ...entry('me', 100), name: 'Novo nome' });
    expect(await local.list('g', 5)).toMatchObject([{ score: 500, name: 'Novo nome' }]);
  });

  it('keeps the 10 best local runs, best first', () => {
    const top = new LocalTop(new MemoryStore());
    const scores = [50, 300, 10, 999, 120, 70, 400, 5, 80, 60, 90, 1];
    const places = scores.map((s, i) =>
      top.add('g', { score: s, details: { lvl: i } }, new Date(2026, 0, i + 1)),
    );
    const list = top.list('g');
    expect(list).toHaveLength(10);
    expect(list.map((r) => r.score)).toEqual([999, 400, 300, 120, 90, 80, 70, 60, 50, 10]);
    expect(places[3]).toBe(1); // 999 was the best when added
    expect(places[11]).toBeNull(); // 1 didn't make it
  });
});
