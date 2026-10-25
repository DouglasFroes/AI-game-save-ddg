/** "Dardo": set the power, set the angle, mind the wind. Three throws, the distances add up. */
import {
  type AttemptRules,
  type AttemptResult,
  metres,
  zoneQuality,
} from '@/games/olimpiadas/attempt';

const POWER: readonly [number, number] = [0.86, 1];
const ANGLE: readonly [number, number] = [0.4, 0.6];

export const windText = (w: number): string =>
  Math.abs(w) < 0.5
    ? 'Sem vento'
    : `Vento ${w > 0 ? 'a favor' : 'contra'}: ${Math.abs(w).toFixed(1).replace('.', ',')} m/s`;

/** Distance in metres; `wind` > 0 helps. */
export function throwDistance(power: number, angle: number, wind: number): number {
  const air = zoneQuality(angle, ANGLE, 0.4);
  return Math.max(0, 22 + 66 * power ** 1.2 * (0.55 + 0.45 * air) + wind * 1.6);
}

export const javelin: AttemptRules<number> = {
  attempts: 3,
  begin: (_a, _h, rnd) => {
    const wind = Math.round((rnd() * 6 - 3) * 10) / 10;
    return {
      ctx: wind,
      info: windText(wind),
      stages: [
        {
          kind: 'meter',
          label: 'FORÇA',
          hint: 'Toque com a barra no alto: quanto mais força, mais longe',
          speed: 1.25,
          zone: POWER,
        },
        {
          kind: 'meter',
          label: 'ÂNGULO',
          hint: 'Toque com a barra no verde para o ângulo ideal',
          speed: 1,
          zone: ANGLE,
        },
      ],
    };
  },
  resolve([power, angle], wind): AttemptResult {
    const d = throwDistance(power!, angle!, wind);
    return { value: d, points: Math.round(d * 10), ok: true, text: metres(d, 1), progress: d / 92 };
  },
  goesOn: () => true,
  summary: (history) => {
    const best = Math.max(0, ...history.map((r) => r.value));
    return {
      score: history.reduce((n, r) => n + r.points, 0),
      title: `Melhor lançamento: ${metres(best, 1)}`,
      lines: [`Lançamentos: ${history.map((r) => metres(r.value, 1)).join(' · ')}`],
      details: { best: Math.round(best * 10) },
    };
  },
};
