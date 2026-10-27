import { describe, expect, it } from 'vitest';
import { trendingGames } from '@/platform/trending';
import { GAMES } from '@/games/registry';
import {
  CATEGORY_LABELS,
  filterGames,
  GAME_CATEGORY,
  gameOfTheDay,
  greeting,
  type CategoryId,
} from '@/platform/hubCategories';
import { Recents } from '@/platform/recents';
import { MemoryStore } from '@/platform/storage';

describe('recents', () => {
  it('keeps the most recent game first, without duplicates', () => {
    const recents = new Recents(new MemoryStore());
    expect(recents.last()).toBeNull();
    recents.push('snake');
    recents.push('sudoku');
    recents.push('snake');
    expect(recents.list()).toEqual(['snake', 'sudoku']);
    expect(recents.last()).toBe('snake');
  });

  it('remembers only the last 8 games', () => {
    const recents = new Recents(new MemoryStore());
    for (let i = 0; i < 12; i++) recents.push(`g${i}`);
    expect(recents.list()).toHaveLength(8);
    expect(recents.last()).toBe('g11');
  });

  it('ignores corrupted storage', () => {
    const store = new MemoryStore();
    store.set('arcade.recents', '{"not":"a list"}');
    expect(new Recents(store).list()).toEqual([]);
    store.set('arcade.recents', '["ok", 3, null]');
    expect(new Recents(store).list()).toEqual(['ok']);
  });
});

describe('hub categories', () => {
  it('puts every game in exactly one known category', () => {
    const known = Object.keys(CATEGORY_LABELS);
    for (const game of GAMES) {
      expect(known, game.id).toContain(GAME_CATEGORY[game.id]);
    }
  });

  it('has no empty category chip', () => {
    const categories: CategoryId[] = ['acao', 'puzzle', 'mesa', 'reflexo', 'esporte'];
    for (const c of categories) {
      expect(filterGames(GAMES, c, []).length, c).toBeGreaterThan(3);
    }
  });

  it('filters: all, favorites and by category', () => {
    const games = GAMES.slice(0, 6);
    expect(filterGames(games, 'todos', [])).toHaveLength(6);
    expect(filterGames(games, 'favoritos', [])).toEqual([]);
    const picked = games.slice(1, 3).map((g) => g.id);
    expect(filterGames(games, 'favoritos', picked).map((g) => g.id)).toEqual(picked);
    for (const g of filterGames(GAMES, 'puzzle', [])) expect(GAME_CATEGORY[g.id]).toBe('puzzle');
  });

  it('greets by the hour of the day', () => {
    expect(greeting(5)).toBe('Bom dia');
    expect(greeting(11)).toBe('Bom dia');
    expect(greeting(12)).toBe('Boa tarde');
    expect(greeting(17)).toBe('Boa tarde');
    expect(greeting(18)).toBe('Boa noite');
    expect(greeting(0)).toBe('Boa noite');
    expect(greeting(4)).toBe('Boa noite');
  });

  it('picks the same game of the day all day and moves on the next day', () => {
    const morning = gameOfTheDay(GAMES, new Date('2026-10-24T06:00:00Z'));
    const night = gameOfTheDay(GAMES, new Date('2026-10-24T21:00:00Z'));
    const tomorrow = gameOfTheDay(GAMES, new Date('2026-10-25T06:00:00Z'));
    expect(morning).toBe(night);
    expect(tomorrow).not.toBe(morning);
    expect(gameOfTheDay([], new Date())).toBeUndefined();
  });
});

describe('hub: mais jogados', () => {
  const NOW = new Date('2026-10-26T12:00:00Z');
  const session = (
    gameId: string,
    durationSec: number,
    endedAt: string,
    id = Math.random().toString(),
  ) =>
    ({
      id,
      playerId: 'p',
      playerName: 'x',
      gameId,
      durationSec,
      score: 0,
      startedAt: endedAt,
      endedAt,
    }) as never;

  it('ranks by total time, then by sessions, and only counts the last 7 days', () => {
    const ranked = trendingGames(
      [
        session('snake', 100, '2026-10-26T10:00:00Z'),
        session('snake', 100, '2026-10-25T10:00:00Z'),
        session('sudoku', 300, '2026-10-24T10:00:00Z'),
        session('game2048', 200, '2026-10-26T09:00:00Z'),
        session('stack', 200, '2026-10-26T08:00:00Z'),
        session('stack', 0, '2026-10-26T08:30:00Z'),
        session('flappybee', 9999, '2026-10-10T10:00:00Z'), // too old
      ],
      NOW,
    );
    // snake and stack tie on time and sessions (id order); game2048 has fewer sessions.
    expect(ranked).toEqual(['sudoku', 'snake', 'stack', 'game2048']);
  });

  it('is empty without sessions and ignores broken dates; respects the limit', () => {
    expect(trendingGames([], NOW)).toEqual([]);
    expect(trendingGames([session('snake', 10, 'not a date')], NOW)).toEqual([]);
    const many = ['a', 'b', 'c', 'd'].map((g, i) => session(g, 10 + i, '2026-10-26T10:00:00Z'));
    expect(trendingGames(many, NOW, 7, 2)).toEqual(['d', 'c']);
  });
});
