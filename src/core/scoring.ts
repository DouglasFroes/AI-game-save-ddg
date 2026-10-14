export type Stars = 1 | 2 | 3;

/** Maximum fraction of the ink budget allowed for each star rating. */
export interface StarThresholds {
  readonly three: number;
  readonly two: number;
}

export function starsForInk(inkRatio: number, t: StarThresholds): Stars {
  if (inkRatio <= t.three) return 3;
  if (inkRatio <= t.two) return 2;
  return 1;
}

export interface ScoreInput {
  readonly stars: number;
  readonly deaths: number;
  /** Average ink saved, 0..100. */
  readonly inkSaved: number;
}

/** Stars dominate, then fewer deaths, then more ink saved. */
export function computeScore({ stars, deaths, inkSaved }: ScoreInput): number {
  const deathPart = Math.max(0, 9999 - deaths);
  const inkPart = Math.min(99, Math.max(0, Math.round(inkSaved)));
  return stars * 1_000_000 + deathPart * 100 + inkPart;
}
