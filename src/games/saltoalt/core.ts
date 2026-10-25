/** "Salto em Altura": the bar rises 5 cm at every height cleared; three misses in a row end it. */
import { type AttemptRules, type AttemptResult, zoneQuality } from '@/games/olimpiadas/attempt';

export const START_HEIGHT = 1.8;
export const RISE = 0.05;
export const MAX_TRIES = 3;
const TAKEOFF: readonly [number, number] = [0.44, 0.56];

/** Where the bar is and how many misses were made at it, after the given results. */
export function barState(history: readonly AttemptResult[]): { height: number; misses: number } {
  let height = START_HEIGHT;
  let misses = 0;
  for (const r of history) {
    if (r.ok) {
      height = Math.round((height + RISE) * 100) / 100;
      misses = 0;
    } else misses++;
  }
  return { height, misses };
}

/** The highest bar a jump can clear, from run-up speed and take-off timing (both 0–1). */
export const capacity = (speed: number, takeoff: number): number =>
  1.55 + 0.75 * (0.45 * speed + 0.55 * zoneQuality(takeoff, TAKEOFF, 0.3));

export const heightText = (h: number): string => `${h.toFixed(2).replace('.', ',')} m`;

export const highJump: AttemptRules<number> = {
  attempts: 40,
  begin: (_a, history) => {
    const { height, misses } = barState(history);
    return {
      ctx: height,
      info: `Barra a ${heightText(height)} · tentativa ${misses + 1} de ${MAX_TRIES}`,
      stages: [
        { kind: 'mash', label: 'CORRIDA', hint: 'Toque rápido para pegar embalo!', seconds: 1.8 },
        {
          kind: 'meter',
          label: 'IMPULSÃO',
          hint: 'Toque com a barra no verde, no ponto certo do salto',
          speed: 1.5,
          zone: TAKEOFF,
        },
      ],
    };
  },
  resolve([speed, takeoff], height): AttemptResult {
    const reach = capacity(speed!, takeoff!);
    if (reach >= height)
      return { value: height, points: 0, ok: true, text: heightText(height), progress: 0.9 };
    return { value: 0, points: 0, ok: false, text: 'Derrubou a barra!', progress: 0.35 };
  },
  goesOn: (history) => barState(history).misses < MAX_TRIES,
  summary: (history) => {
    const cleared = history.filter((r) => r.ok);
    const best = Math.max(0, ...cleared.map((r) => r.value));
    return {
      score: Math.round(best * 100),
      title: best > 0 ? `Altura máxima: ${heightText(best)}` : 'Não passou da primeira barra',
      lines: [`Alturas vencidas: ${cleared.length} · Saltos: ${history.length}`],
      details: { best: Math.round(best * 100), jumps: history.length },
    };
  },
};
