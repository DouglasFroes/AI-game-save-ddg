import type { LeaderboardEntry } from '@/core/leaderboard';
import { computeScore } from '@/core/scoring';

const seed = (
  id: string,
  name: string,
  stars: number,
  deaths: number,
  inkSaved: number,
  date: string,
): LeaderboardEntry => ({
  id,
  name,
  stars,
  deaths,
  inkSaved,
  score: computeScore({ stars, deaths, inkSaved }),
  date,
});

/** Example rivals shown until real players submit scores. */
export const SEED_LEADERBOARD: readonly LeaderboardEntry[] = [
  seed('seed-1', 'DogeMaster', 52, 6, 51, '2026-09-02T18:20:00.000Z'),
  seed('seed-2', 'AbelhaZero', 44, 11, 47, '2026-09-05T21:04:00.000Z'),
  seed('seed-3', 'Rabisco', 36, 15, 40, '2026-09-11T12:47:00.000Z'),
  seed('seed-4', 'Mel_Ninja', 25, 9, 38, '2026-09-19T09:15:00.000Z'),
  seed('seed-5', 'Shiba_BR', 14, 4, 30, '2026-10-01T16:30:00.000Z'),
];
