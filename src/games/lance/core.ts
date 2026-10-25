/** "Lance Livre": ten shots from farther and farther; stop the bar in the green to score. */
import { type AttemptRules, type AttemptResult } from '@/games/olimpiadas/attempt';

export const SHOTS = 10;
/** Value of each shot: free throw, two-pointers, then three-pointers. */
export const SHOT_VALUE = [1, 1, 2, 2, 2, 2, 3, 3, 3, 3] as const;
const NAMES = { 1: 'Lance livre', 2: 'Bola de 2 pontos', 3: 'Bola de 3 pontos' } as const;
const HALF = { 1: 0.1, 2: 0.075, 3: 0.055 } as const;
const SPEED = { 1: 0.9, 2: 1.1, 3: 1.3 } as const;
const PERFECT = 0.02;

type Value = 1 | 2 | 3;
export const valueOf = (shot: number): Value => SHOT_VALUE[Math.min(shot, SHOTS - 1)]!;
/** Consecutive baskets ending at the last result. */
export const streakOf = (history: readonly AttemptResult[]): number => {
  let n = 0;
  for (let i = history.length - 1; i >= 0 && history[i]!.ok; i--) n++;
  return n;
};

export const freeThrows: AttemptRules<{ value: Value; streak: number }> = {
  attempts: SHOTS,
  begin: (shot, history) => {
    const value = valueOf(shot);
    const streak = streakOf(history);
    return {
      ctx: { value, streak },
      info: `${NAMES[value]}${streak >= 2 ? ` · 🔥 ${streak} seguidas` : ''}`,
      stages: [
        {
          kind: 'meter',
          label: 'ARREMESSO',
          hint: 'Toque com a barra no verde. No centro é cesta perfeita (+1)!',
          speed: SPEED[value],
          zone: [0.5 - HALF[value], 0.5 + HALF[value]],
        },
      ],
    };
  },
  resolve([v], { value, streak }): AttemptResult {
    const off = Math.abs(v! - 0.5);
    if (off > HALF[value])
      return {
        value: 0,
        points: 0,
        ok: false,
        text: v! < 0.5 ? 'Curta!' : 'Longa!',
        progress: 0.45,
      };
    const perfect = off <= PERFECT;
    // From the third basket in a row on, each one is worth a point more.
    const points = value + (perfect ? 1 : 0) + (streak >= 2 ? 1 : 0);
    return {
      value: points,
      points,
      ok: true,
      text: perfect ? `Perfeita! +${points}` : `Cesta! +${points}`,
      progress: 0.95,
    };
  },
  goesOn: () => true,
  summary: (history) => {
    const made = history.filter((r) => r.ok).length;
    return {
      score: history.reduce((n, r) => n + r.points, 0),
      title: `${made} cestas em ${history.length} arremessos`,
      lines: [`Aproveitamento: ${Math.round((made / Math.max(1, history.length)) * 100)}%`],
      details: { made },
    };
  },
};
