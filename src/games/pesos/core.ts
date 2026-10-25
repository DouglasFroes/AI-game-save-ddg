/** "Levantamento de Peso": mash for strength, then stop the bar in the zone to hold the lift. */
import { type AttemptRules, type AttemptResult } from '@/games/olimpiadas/attempt';

export const START_KG = 80;
export const STEP_KG = 10;
export const MAX_LIFTS = 8;

export const barKg = (attempt: number): number => START_KG + attempt * STEP_KG;
/** Strength (0–1) a lift needs. */
export const strengthNeeded = (attempt: number): number => 0.3 + 0.075 * attempt;
/** The sweet zone narrows with the weight. */
export const holdZone = (attempt: number): readonly [number, number] => {
  const half = Math.max(0.05, 0.17 - 0.015 * attempt);
  return [0.5 - half, 0.5 + half];
};

export const weightlifting: AttemptRules<number> = {
  attempts: MAX_LIFTS,
  begin: (attempt) => ({
    ctx: attempt,
    info: `Barra: ${barKg(attempt)} kg`,
    stages: [
      {
        kind: 'mash',
        label: 'FORÇA',
        hint: 'Toque rápido para encher a barra e ter força para o peso!',
        seconds: 2.6,
      },
      {
        kind: 'meter',
        label: 'EQUILÍBRIO',
        hint: 'Toque com a barra no verde para sustentar o peso no alto',
        speed: 1.3 + attempt * 0.12,
        zone: holdZone(attempt),
      },
    ],
  }),
  resolve([strength, hold], attempt): AttemptResult {
    const kg = barKg(attempt);
    if (strength! < strengthNeeded(attempt))
      return { value: 0, points: 0, ok: false, text: 'Sem força!', progress: 0.2 };
    const [lo, hi] = holdZone(attempt);
    if (hold! < lo || hold! > hi)
      return { value: 0, points: 0, ok: false, text: 'Perdeu o equilíbrio!', progress: 0.3 };
    return { value: kg, points: kg, ok: true, text: `${kg} kg`, progress: 0.7 };
  },
  // Two failed lifts in a row end the competition.
  goesOn: (history) => history.slice(-2).some((r) => r.ok) || history.length < 2,
  summary: (history) => {
    const lifted = history.filter((r) => r.ok);
    const best = Math.max(0, ...lifted.map((r) => r.value));
    return {
      score: lifted.reduce((n, r) => n + r.points, 0),
      title: best > 0 ? `Levantou até ${best} kg!` : 'Não levantou nada',
      lines: [`Levantamentos válidos: ${lifted.length} de ${history.length}`],
      details: { best, lifts: lifted.length },
    };
  },
};
