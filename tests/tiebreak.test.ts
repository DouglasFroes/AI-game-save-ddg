import { describe, expect, it } from 'vitest';
import { placementFor, rankEntries, type LeaderboardEntry } from '@/platform/leaderboard';

const entry = (name: string, score: number, perfects: number, date: string): LeaderboardEntry => ({
  id: `${name}-${date}`,
  player: name,
  name,
  score,
  details: { perfects },
  date,
});

describe('desempate no ranking (Stack: perfeitos)', () => {
  const andre = entry('André', 55, 28, '2026-10-01T10:00:00Z');
  const douglas = entry('DouglasSF', 55, 29, '2026-10-02T10:00:00Z');

  it('same floors: more perfects ranks first, even if the run is newer', () => {
    expect(rankEntries([andre, douglas], 'stack').map((e) => e.name)).toEqual([
      'DouglasSF',
      'André',
    ]);
  });

  it('still falls back to the older run when perfects tie too', () => {
    const a = entry('A', 55, 29, '2026-10-01T10:00:00Z');
    const b = entry('B', 55, 29, '2026-10-02T10:00:00Z');
    expect(rankEntries([b, a], 'stack').map((e) => e.name)).toEqual(['A', 'B']);
  });

  it('games without a tiebreak keep ordering ties by date', () => {
    expect(rankEntries([douglas, andre], 'snake').map((e) => e.name)).toEqual([
      'André',
      'DouglasSF',
    ]);
  });

  it('placement counts a tied run with fewer perfects as behind', () => {
    const board = [andre];
    expect(placementFor(board, 55, 20, { gameId: 'stack', details: { perfects: 29 } })).toBe(1);
    expect(placementFor(board, 55, 20, { gameId: 'stack', details: { perfects: 28 } })).toBe(2);
    expect(placementFor(board, 55, 20, { gameId: 'stack', details: { perfects: 10 } })).toBe(2);
  });
});
