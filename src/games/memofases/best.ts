import type { ScoreRecord } from '@/platform/bestScores';
import type { Services } from '@/services';
import { summary } from './core';

/** Total score of the campaign, as sent to the ranking (null before the first win). */
export function memoBest(s: Services): ScoreRecord | null {
  const sum = summary(s.memoProgress.get());
  return sum.levels
    ? { score: sum.score, details: { stars: sum.stars, levels: sum.levels } }
    : null;
}
