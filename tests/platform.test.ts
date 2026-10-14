import { describe, expect, it } from 'vitest';
import { BestScores } from '@/platform/bestScores';
import { fromFirestore, readFirebaseSettings, withTimeout } from '@/platform/firebaseLeaderboard';
import {
  LocalLeaderboard,
  parseEntry,
  rankEntries,
  ResilientLeaderboard,
  sanitizeDetails,
  sanitizeName,
  type LeaderboardEntry,
  type RemoteLeaderboard,
} from '@/platform/leaderboard';
import { ProfileRepository } from '@/platform/profile';
import { formatTime } from '@/platform/ranking';
import { MemoryStore, writeJson } from '@/platform/storage';

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
