import { describe, expect, it } from 'vitest';
import {
  ago,
  csvCell,
  duration,
  esc,
  fillDailyTimeline,
  formatDetailPairs,
  pageRange,
  paginateSlice,
  parseHashRoute,
  percent,
} from '../src/format';
import { GAMES_CATALOG, getGameMeta } from '../src/games';
import { renderPagination } from '../src/ui';
import { gamesToCsv, playersToCsv, sessionsToCsv } from '../src/views';

describe('format', () => {
  it('escapes HTML so API text can never become markup', () => {
    expect(esc('<img src=x onerror="a">&\'')).toBe('&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;');
    expect(esc(null)).toBe('');
  });

  it('formats durations', () => {
    expect([45, 120, 135, 3600, 7500].map(duration)).toEqual(['45s', '2m', '2m 15s', '1h', '2h 5m']);
  });

  it('says how long ago', () => {
    const now = Date.parse('2026-10-27T12:00:00Z');
    expect(ago('2026-10-27T11:59:50Z', now)).toBe('agora');
    expect(ago('2026-10-27T11:30:00Z', now)).toBe('há 30 min');
    expect(ago('2026-10-27T09:00:00Z', now)).toBe('há 3 h');
    expect(ago('2026-10-25T12:00:00Z', now)).toBe('há 2 d');
  });

  it('quotes CSV cells that need it', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(5)).toBe('5');
  });

  it('exports sessions, players and games as CSV', () => {
    const csv = sessionsToCsv([
      { id: 's1', playerId: 'p', playerName: 'Ana, Jr', gameId: 'stack', durationSec: 9, score: 1, startedAt: 'a', endedAt: 'b' },
    ]);
    expect(csv.split('\n')[1]).toBe('s1,p,"Ana, Jr",stack,9,1,a,b');

    const pCsv = playersToCsv([
      {
        id: 'u1',
        name: 'Bia',
        email: 'bia@example.com',
        google: true,
        sessions: 4,
        play_seconds: 120,
        entries: 2,
        favorite_game: 'doguinho',
        created_at: '2026-10-01',
        last_seen_at: '2026-10-27',
      },
    ]);
    expect(pCsv.split('\n')[1]).toBe('u1,Bia,bia@example.com,true,4,120,2,doguinho,2026-10-01,2026-10-27');

    const gCsv = gamesToCsv([
      { game_id: 'doguinho', sessions: 10, play_seconds: 300, players: 5, best_score: 90, entries: 3, last_played_at: '2026-10-27' },
    ]);
    expect(gCsv.split('\n')[1]).toBe('doguinho,Salve o Doguinho,Puzzle,10,300,5,3,90,2026-10-27');
  });

  it('computes percentages safely', () => {
    expect(percent(25, 100, 0)).toBe('25%');
    expect(percent(1, 3, 1)).toBe('33,3%');
    expect(percent(5, 0)).toBe('0%');
  });

  it('computes pagination page ranges with ellipsis', () => {
    expect(pageRange(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageRange(1, 10)).toEqual([1, 2, '…', 10]);
    expect(pageRange(5, 10)).toEqual([1, '…', 4, 5, 6, '…', 10]);
    expect(pageRange(10, 10)).toEqual([1, '…', 9, 10]);
  });

  it('slices client arrays into paginated pages', () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    expect(paginateSlice(items, 1, 3)).toEqual({ items: [1, 2, 3], total: 7, page: 1, per_page: 3 });
    expect(paginateSlice(items, 3, 3)).toEqual({ items: [7], total: 7, page: 3, per_page: 3 });
    expect(paginateSlice(items, 99, 3)).toEqual({ items: [7], total: 7, page: 3, per_page: 3 });
  });

  it('renders pagination controls HTML', () => {
    const html = renderPagination({ total: 60, page: 2, per_page: 25, noun: 'partidas' });
    expect(html).toContain('26–50');
    expect(html).toContain('60');
    expect(html).toContain('partidas');
  });

  it('fills sparse daily timeline with zero-activity days', () => {
    const now = new Date('2026-10-27T15:00:00Z');
    const filled = fillDailyTimeline([{ day: '2026-10-26', sessions: 4, play_seconds: 80, players: 2 }], 3, now);
    expect(filled.map((d) => [d.day, d.sessions])).toEqual([
      ['2026-10-25', 0],
      ['2026-10-26', 4],
      ['2026-10-27', 0],
    ]);
  });

  it('parses hash routes with query parameters', () => {
    const r = parseHashRoute('#rankings?game=doguinho&sort=recent');
    expect(r.tab).toBe('rankings');
    expect(r.params.get('game')).toBe('doguinho');
    expect(r.params.get('sort')).toBe('recent');
  });

  it('formats ranking details and resolves game catalog metadata', () => {
    expect(formatDetailPairs({ wins: 3, accuracy: 95, place: 1 })).toEqual([
      { label: 'Vitórias', value: '3' },
      { label: 'Precisão', value: '95%' },
      { label: 'Lugar', value: '1º' },
    ]);
    expect(GAMES_CATALOG.length).toBeGreaterThanOrEqual(86);
    expect(getGameMeta('doguinho').title).toBe('Salve o Doguinho');
    expect(getGameMeta('unknown_game').title).toBe('Unknown_game');
  });
});
