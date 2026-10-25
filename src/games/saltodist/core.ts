/** "Salto em Distância": mash for speed, stop the bar on the take-off board, set the angle. */
import {
  type AttemptRules,
  type AttemptResult,
  metres,
  zoneQuality,
} from '@/games/olimpiadas/attempt';

export const FOUL_AT = 0.95;
const BOARD: readonly [number, number] = [0.82, 0.94];
const ANGLE: readonly [number, number] = [0.42, 0.58];

/** Distance in metres from the three stage values (speed, take-off point on the bar, angle). */
export function jumpDistance(speed: number, takeoff: number, angle: number): number {
  if (takeoff > FOUL_AT) return 0;
  const board = zoneQuality(takeoff, BOARD, 0.5);
  const air = zoneQuality(angle, ANGLE, 0.35);
  return 3.2 + 5.8 * speed * (0.7 + 0.3 * board) * (0.65 + 0.35 * air);
}

export const longJump: AttemptRules<null> = {
  attempts: 3,
  begin: () => ({
    ctx: null,
    info: 'Acelere, pise na tábua e escolha o ângulo',
    stages: [
      { kind: 'mash', label: 'CORRIDA', hint: 'Toque o mais rápido que puder!', seconds: 3 },
      {
        kind: 'sweep',
        label: 'TÁBUA DE IMPULSÃO',
        hint: 'Toque quando a barra chegar na zona verde. Passou da linha: falta!',
        seconds: 1.3,
        zone: BOARD,
      },
      {
        kind: 'meter',
        label: 'ÂNGULO',
        hint: 'Toque com a barra no verde: o salto sai no ângulo ideal',
        speed: 1.1,
        zone: ANGLE,
      },
    ],
  }),
  resolve([speed, takeoff, angle]): AttemptResult {
    const d = jumpDistance(speed!, takeoff!, angle!);
    if (d === 0) return { value: 0, points: 0, ok: false, text: 'Falta!', progress: 0.05 };
    return { value: d, points: Math.round(d * 100), ok: true, text: metres(d), progress: d / 9.2 };
  },
  goesOn: () => true,
  summary: (history) => {
    const best = Math.max(0, ...history.map((r) => r.value));
    const score = history.reduce((n, r) => n + r.points, 0);
    return {
      score,
      title: best > 0 ? `Melhor salto: ${metres(best)}` : 'Três faltas!',
      lines: [`Saltos: ${history.map((r) => (r.ok ? metres(r.value) : 'falta')).join(' · ')}`],
      details: { best: Math.round(best * 100), fouls: history.filter((r) => !r.ok).length },
    };
  },
};
