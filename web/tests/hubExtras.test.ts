import { describe, expect, it } from 'vitest';
import { Favorites } from '@/platform/favorites';
import type { LeaderboardEntry } from '@/platform/leaderboard';
import { findOvertake, RankWatch, snapshot } from '@/platform/rankWatch';
import { MemoryStore } from '@/platform/storage';

const e = (id: string, player: string, score: number): LeaderboardEntry => ({
  id,
  player,
  name: player,
  score,
  details: {},
  date: '2026-10-15T00:00:00.000Z',
});
const mine = (x: LeaderboardEntry) => x.player === 'Eu';

describe('favorites', () => {
  it('stars and un-stars games, favorites first in the hub', () => {
    const favs = new Favorites(new MemoryStore());
    const games = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    expect(favs.sort(games).map((g) => g.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(favs.toggle('c')).toBe(true);
    expect(favs.toggle('a')).toBe(true);
    expect(favs.sort(games).map((g) => g.id)).toEqual(['a', 'c', 'b', 'd']);
    expect(favs.toggle('c')).toBe(false);
    expect(favs.has('c')).toBe(false);
    expect(favs.sort(games).map((g) => g.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('someone passed you', () => {
  const before = [e('1', 'Bia', 900), e('2', 'Eu', 800), e('3', 'Eu', 500), e('4', 'Caio', 400)];

  it('finds the player best place and who is above it', () => {
    expect(snapshot(before, mine)).toEqual({ rank: 2, score: 800, above: ['1'] });
    expect(snapshot([e('1', 'Bia', 9)], mine)).toBeNull();
  });

  it('names the newcomer that passed the player', () => {
    const prev = snapshot(before, mine)!;
    const after = [e('1', 'Bia', 900), e('9', 'Ana', 850), ...before.slice(1)];
    expect(findOvertake(prev, after, mine)).toEqual({ by: 'Ana', from: 2, to: 3 });
  });

  it('stays quiet when nobody passed (or the player went up)', () => {
    const prev = snapshot(before, mine)!;
    expect(findOvertake(prev, before, mine)).toBeNull();
    // Someone new below the player doesn't count.
    expect(findOvertake(prev, [...before, e('8', 'Ana', 450)], mine)).toBeNull();
    // A better run of the player's own.
    expect(findOvertake(prev, [e('7', 'Eu', 999), ...before], mine)).toBeNull();
  });

  it('warns when the player was pushed off the board', () => {
    const prev = snapshot(before, mine)!;
    const after = [e('1', 'Bia', 900), e('9', 'Ana', 880)];
    expect(findOvertake(prev, after, mine)).toEqual({ by: 'Ana', from: 2, to: null });
  });

  it('warns only once: the new place becomes the baseline', () => {
    const watch = new RankWatch(new MemoryStore());
    expect(watch.check('snake', before, mine)).toBeNull(); // first look: just remembers
    const after = [e('9', 'Ana', 950), ...before];
    expect(watch.check('snake', after, mine)).toEqual({ by: 'Ana', from: 2, to: 3 });
    expect(watch.check('snake', after, mine)).toBeNull();
    expect(watch.games()).toEqual(['snake']);
    watch.check('snake', [e('1', 'Bia', 9)], mine); // off the board: forgotten
    expect(watch.games()).toEqual([]);
  });
});
