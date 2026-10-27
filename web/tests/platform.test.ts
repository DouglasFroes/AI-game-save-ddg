import { describe, expect, it } from 'vitest';
import { BestScores } from '@/platform/bestScores';
import { readApiSettings, withTimeout } from '@/platform/api/client';
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
import { MIN_VOLUME, parseProfile, ProfileRepository } from '@/platform/profile';
import { autoSubmit, formatTime } from '@/platform/ranking';
import { MemoryStore, writeJson } from '@/platform/storage';
import {
  avatarColorFor,
  computeRunAchievements,
  computeRunStars,
  formatRunColumns,
  formatRunDate,
  parseStatLine,
} from '@/platform/ui/arcadeFormat';
import type { Services } from '@/services';

const entry = (id: string, score: number, date = '2026-01-01T00:00:00.000Z'): LeaderboardEntry => ({
  id: `${id}-${score}`,
  player: id,
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
  it('keeps every run, best first: a player can hold several places', () => {
    const ranked = rankEntries([entry('a', 5), entry('b', 9), entry('a', 7)]);
    expect(ranked.map((e) => [e.player, e.score])).toEqual([
      ['b', 9],
      ['a', 7],
      ['a', 5],
    ]);
  });

  it('old one-per-player entries read their owner from the id', () => {
    expect(parseEntry({ id: 'uid-9', name: 'A', score: 3, date: 'd' })?.player).toBe('uid-9');
  });

  it('keeps separate local boards per game', async () => {
    const board = new LocalLeaderboard(new MemoryStore());
    await board.submit('sudoku', entry('me', 20));
    await board.submit('blockblast', entry('me', 99));
    await board.submit('sudoku', entry('me', 30));
    expect(await board.list('sudoku', 10)).toEqual([entry('me', 30), entry('me', 20)]);
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
    expect(saved[0]?.[1]).toMatchObject({ player: 'uid-1', name: 'Ana', score: 50 });
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
    expect(list.map((e) => e.player)).toEqual(['local-1']);
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

  it('starts with every sound on and remembers each switch separately', () => {
    const store = new MemoryStore();
    expect(new ProfileRepository(store).get()).toMatchObject({
      muted: false,
      uiSounds: true,
      gameSounds: true,
      vibration: true,
      volume: 1,
    });
    new ProfileRepository(store).update({ gameSounds: false, volume: 0.4 });
    expect(new ProfileRepository(store).get()).toMatchObject({
      muted: false,
      uiSounds: true,
      gameSounds: false,
      volume: 0.4,
    });
  });

  it('keeps the volume inside its range', () => {
    expect(parseProfile({ playerId: 'a', volume: 7 })?.volume).toBe(1);
    expect(parseProfile({ playerId: 'a', volume: 0 })?.volume).toBe(MIN_VOLUME);
    expect(parseProfile({ playerId: 'a', volume: 'loud' })?.volume).toBe(1);
  });

  it('only stores better scores', () => {
    const best = new BestScores(new MemoryStore());
    expect(best.offer('bb', { score: 10, details: {} })).toBe(true);
    expect(best.offer('bb', { score: 5, details: {} })).toBe(false);
    expect(best.offer('bb', { score: 11, details: { lines: 2 } })).toBe(true);
    expect(best.get('bb')).toEqual({ score: 11, details: { lines: 2 } });
  });
});

describe('api helpers', () => {
  it('is on only when a Google client id is set', () => {
    expect(readApiSettings({})).toBeNull();
    expect(readApiSettings({ VITE_GOOGLE_CLIENT_ID: '  ' })).toBeNull();
    expect(readApiSettings({ VITE_GOOGLE_CLIENT_ID: 'abc' })).toEqual({
      baseUrl: '',
      googleClientId: 'abc',
    });
    expect(
      readApiSettings({ VITE_GOOGLE_CLIENT_ID: 'abc', VITE_API_URL: 'https://api.x.dev//' }),
    ).toMatchObject({ baseUrl: 'https://api.x.dev' });
  });

  it('takes the client id the server injected into the page when the build has none', () => {
    expect(readApiSettings({}, { googleClientId: 'from-server' })).toMatchObject({
      googleClientId: 'from-server',
    });
    expect(
      readApiSettings({ VITE_GOOGLE_CLIENT_ID: 'build' }, { googleClientId: 'x' }),
    ).toMatchObject({
      googleClientId: 'build',
    });
    expect(readApiSettings({}, { googleClientId: '' })).toBeNull();
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
    id: `${id}-${score}`,
    player: id,
    name: id,
    score,
    details: {},
    date: '2026-01-01T00:00:00.000Z',
  });

  it('places a score in the top 20, my own entries count like anyone else', () => {
    const board = Array.from({ length: 20 }, (_, i) => entry(`p${i}`, 2000 - i * 100));
    expect(placementFor(board, 1850)).toBe(3);
    expect(placementFor(board, 50)).toBeNull(); // below the 20th
    expect(placementFor(board.slice(0, 5), 50)).toBe(6); // board not full yet
    const withMe = [...board.slice(0, 10), entry('me', 1500)];
    expect(placementFor(withMe, 1400)).toBe(9); // a second place of mine, below my best
    expect(placementFor(board, 2000)).toBe(2); // a tie goes after the older entry
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
    // A worse run that still makes the top 20 takes another place; the first one stays.
    expect(await auto.autoSubmit('g', { name: 'Eu', score: 1100, details: {} })).toEqual({
      rank: 12,
      result: 'local',
    });
    const board = await local.list('g', 50);
    expect(board).toHaveLength(20); // the device keeps only the top 20
    expect(board.filter((e) => e.player === 'me').map((e) => e.score)).toEqual([1185, 1100]);
    expect(board.at(-1)!.score).toBe(1020); // the two lowest dropped out
  });

  it('back-to-back runs both keep their own place', async () => {
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
        rows.push(e);
      },
    };
    const board = new ResilientLeaderboard(new LocalLeaderboard(new MemoryStore()), slow, 'me');
    const [first, second] = await Promise.all([
      board.autoSubmit('g', { name: 'Eu', score: 420, details: {} }),
      board.autoSubmit('g', { name: 'Eu', score: 150, details: {} }),
    ]);
    expect(first).toEqual({ rank: 1, result: 'global' });
    expect(second).toEqual({ rank: 2, result: 'global' });
    expect(rankEntries(rows).map((r) => [r.player, r.score])).toEqual([
      ['me-remote', 420],
      ['me-remote', 150],
    ]);
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

describe('ranking and game-over UI formatting helpers', () => {
  it('parses stat lines into uppercase labels and values', () => {
    expect(parseStatLine('Distância: 1,2 km')).toEqual({
      label: 'DISTÂNCIA',
      value: '1,2 km',
    });
    expect(parseStatLine('Vitória impecável')).toEqual({
      label: 'DESTAQUE',
      value: 'Vitória impecável',
    });
  });

  it('separates primary score column and extra detail columns', () => {
    const cols = formatRunColumns(
      [
        { key: 'score', label: 'Pontos', x: 460 },
        { key: 'time', label: 'Tempo', x: 650, format: formatTime },
      ],
      1450,
      { time: 95 },
    );
    expect(cols.primary).toEqual({ label: 'PONTOS', value: (1450).toLocaleString('pt-BR') });
    expect(cols.extras).toEqual([{ label: 'Tempo', value: '1:35' }]);

    const dogCols = formatRunColumns(
      [
        { key: 'stars', label: '★', x: 450 },
        { key: 'inkSaved', label: 'Tinta', x: 640, format: (v) => `${v}%` },
      ],
      3000,
      { stars: 42, inkSaved: 81 },
    );
    expect(dogCols.primary).toEqual({ label: 'ESTRELAS', value: '★ 42' });
    expect(dogCols.extras).toEqual([{ label: 'Tinta', value: '81%' }]);
  });

  it('formats run dates safely', () => {
    expect(formatRunDate('not-a-date')).toEqual({ short: '-', full: '-' });
    const valid = formatRunDate('2026-10-24T14:05:00.000Z');
    expect(valid.short).toMatch(/^\d{2}\/\d{2}$/);
    expect(valid.full).toMatch(/^\d{2}\/\d{2} · \d{2}:\d{2}$/);
  });

  it('computes 0 to 3 performance stars and run achievements', () => {
    expect(computeRunStars(0, 100, false, null, false)).toBe(0);
    expect(computeRunStars(500, 400, true, 1, true)).toBe(3);
    expect(computeRunStars(300, 400, false, 4, true)).toBe(2);
    expect(computeRunStars(100, 400, false, 9, true)).toBe(1);

    const badges = computeRunAchievements({
      hasRecord: true,
      score: 1200,
      previousBest: 1000,
      newBest: true,
      localPlace: 1,
      globalRank: 2,
    });
    expect(badges.map((b) => b.id)).toEqual(['new-record', 'global-top', 'personal-podium']);

    const noRecordBadges = computeRunAchievements({
      hasRecord: false,
      score: 0,
      previousBest: 800,
      newBest: false,
      localPlace: null,
      globalRank: null,
    });
    expect(noRecordBadges).toHaveLength(2);
    expect(avatarColorFor('Ana')).toBeTypeOf('number');
    expect(avatarColorFor('')).toBeTypeOf('number');
  });
});
