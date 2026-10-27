import { describe, expect, it } from 'vitest';
import { BoardSnapshots } from '@/platform/boardSnapshots';
import {
  LocalLeaderboard,
  ResilientLeaderboard,
  type LeaderboardEntry,
} from '@/platform/leaderboard';
import { MemoryStore } from '@/platform/storage';

const entry = (player: string, score: number): LeaderboardEntry => ({
  id: `${player}-${score}`,
  player,
  name: player,
  score,
  details: {},
  date: '2026-01-01T00:00:00.000Z',
});

describe('BoardSnapshots', () => {
  it('remembers the last board of a game, and nothing for unseen games', () => {
    const snaps = new BoardSnapshots(new MemoryStore());
    expect(snaps.get('snake')).toBeNull();
    snaps.put('snake', [entry('a', 10)]);
    expect(snaps.get('snake')?.entries.map((e) => e.player)).toEqual(['a']);
    expect(snaps.get('stack')).toBeNull();
  });

  it('does not let a shorter, newer read shrink a longer one', () => {
    let now = 1_000_000;
    const snaps = new BoardSnapshots(new MemoryStore(), () => now);
    snaps.put('snake', [entry('a', 3), entry('b', 2), entry('c', 1)]);
    now += 5_000;
    snaps.put('snake', [entry('a', 3)]);
    expect(snaps.get('snake')?.entries).toHaveLength(3);
    now += 120_000;
    snaps.put('snake', [entry('a', 3)]);
    expect(snaps.get('snake')?.entries).toHaveLength(1);
  });
});

describe('ResilientLeaderboard snapshots', () => {
  it('saves the global board it reads, and not the local fallback', async () => {
    const store = new MemoryStore();
    const snaps = new BoardSnapshots(store);
    const remote = {
      list: async () => [entry('world', 99)],
      submit: async () => undefined,
      playerId: async () => 'uid',
    };
    const online = new ResilientLeaderboard(
      new LocalLeaderboard(store),
      remote,
      'me',
      undefined,
      null,
      snaps,
    );
    await online.list('snake');
    expect(online.snapshot('snake')?.map((e) => e.player)).toEqual(['world']);

    const broken = { ...remote, list: async () => Promise.reject(new Error('down')) };
    const offline = new ResilientLeaderboard(
      new LocalLeaderboard(store),
      broken,
      'me',
      undefined,
      null,
      snaps,
    );
    await offline.list('stack');
    expect(offline.snapshot('stack')).toBeNull();
  });
});
