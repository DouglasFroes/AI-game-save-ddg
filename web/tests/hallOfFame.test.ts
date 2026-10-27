import { describe, expect, it } from 'vitest';
import { loadBoards, medalTable, placesOf, podiumOf } from '@/platform/hallOfFame';
import type { LeaderboardEntry } from '@/platform/leaderboard';

let n = 0;
const run = (
  player: string,
  score: number,
  date = '2026-01-01',
  name = player,
): LeaderboardEntry => ({
  id: `e${n++}`,
  player,
  name,
  score,
  details: {},
  date,
});

describe('hall da fama', () => {
  it('a player takes only one medal per board', () => {
    const podium = podiumOf([
      run('a', 90),
      run('a', 80),
      run('b', 70),
      run('a', 60),
      run('c', 50),
      run('d', 40),
    ]);
    expect(podium.map((e) => e.player)).toEqual(['a', 'b', 'c']);
    expect(podium[0]!.score).toBe(90);
  });

  it('ranks by golds, then silvers, then bronzes', () => {
    const table = medalTable([
      { gameId: 'snake', entries: [run('ana', 10), run('bia', 9), run('caio', 8)] },
      { gameId: 'stack', entries: [run('bia', 10), run('caio', 9), run('ana', 8)] },
      { gameId: 'sudoku', entries: [run('caio', 10), run('bia', 9)] },
      { gameId: 'tenis', entries: [] },
    ]);
    expect(table.map((m) => [m.player, m.gold, m.silver, m.bronze])).toEqual([
      ['bia', 1, 2, 0],
      ['caio', 1, 1, 1],
      ['ana', 1, 0, 1],
    ]);
    expect(table[0]!.wins.map((w) => [w.gameId, w.medal])).toEqual([
      ['stack', 1],
      ['snake', 2],
      ['sudoku', 2],
    ]);
  });

  it('uses the most recent name and shares places on equal medals', () => {
    const table = medalTable([
      { gameId: 'snake', entries: [run('x', 10, '2026-01-01', 'Velho')] },
      { gameId: 'stack', entries: [run('x', 10, '2026-03-01', 'Novo')] },
      { gameId: 'grau', entries: [run('y', 10)] },
      { gameId: 'luta', entries: [run('z', 10)] },
    ]);
    expect(table[0]!.name).toBe('Novo');
    expect(placesOf(table)).toEqual([1, 2, 2]);
  });

  it('loads every board in order and survives failures', async () => {
    const boards = await loadBoards(
      ['a', 'b', 'c', 'd'],
      async (id) => {
        if (id === 'c') throw new Error('offline');
        await new Promise((r) => setTimeout(r, id === 'a' ? 20 : 1));
        return [run(id, 1)];
      },
      2,
    );
    expect(boards.map((b) => [b.gameId, b.entries.length])).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 0],
      ['d', 1],
    ]);
  });
});
