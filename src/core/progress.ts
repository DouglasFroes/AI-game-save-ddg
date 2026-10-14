import { computeScore, type Stars } from './scoring';
import { createId, readJson, writeJson, type KeyValueStore } from './storage';

export interface LevelResult {
  readonly stars: Stars;
  /** Best (lowest) fraction of ink used. */
  readonly inkRatio: number;
}

export interface Progress {
  readonly version: 2;
  readonly playerId: string;
  readonly playerName: string;
  readonly deaths: number;
  readonly results: Readonly<Record<string, LevelResult>>;
  readonly muted: boolean;
}

export interface ProgressSummary {
  readonly stars: number;
  readonly deaths: number;
  readonly inkSaved: number;
  readonly completed: number;
  readonly score: number;
}

export const createProgress = (playerId = createId()): Progress => ({
  version: 2,
  playerId,
  playerName: '',
  deaths: 0,
  results: {},
  muted: false,
});

/** Keeps the best stars and the best ink usage independently. */
export function recordWin(p: Progress, levelId: number, stars: Stars, inkRatio: number): Progress {
  const prev = p.results[levelId];
  const best: LevelResult = prev
    ? {
        stars: Math.max(prev.stars, stars) as Stars,
        inkRatio: Math.min(prev.inkRatio, inkRatio),
      }
    : { stars, inkRatio };
  return { ...p, results: { ...p.results, [levelId]: best } };
}

export const recordDeath = (p: Progress): Progress => ({ ...p, deaths: p.deaths + 1 });

export const setPlayerName = (p: Progress, playerName: string): Progress => ({ ...p, playerName });

export const setMuted = (p: Progress, muted: boolean): Progress => ({ ...p, muted });

/** A level is open when it is the first one or the previous one (in play order) was won. */
export function isUnlocked(p: Progress, levelId: number, order: readonly number[]): boolean {
  const i = order.indexOf(levelId);
  if (i <= 0) return i === 0;
  return p.results[order[i - 1]!] !== undefined;
}

export function summarize(p: Progress): ProgressSummary {
  const results = Object.values(p.results);
  const stars = results.reduce((sum, r) => sum + r.stars, 0);
  const inkSaved = results.length
    ? results.reduce((sum, r) => sum + (1 - r.inkRatio) * 100, 0) / results.length
    : 0;
  const rounded = Math.round(inkSaved);
  return {
    stars,
    deaths: p.deaths,
    inkSaved: rounded,
    completed: results.length,
    score: computeScore({ stars, deaths: p.deaths, inkSaved: rounded }),
  };
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validates untrusted saved data; returns null when it cannot be used. */
export function parseProgress(raw: unknown): Progress | null {
  if (!isObject(raw) || raw.version !== 2 || typeof raw.playerId !== 'string') return null;
  const results: Record<string, LevelResult> = {};
  if (isObject(raw.results)) {
    for (const [id, r] of Object.entries(raw.results)) {
      if (!isObject(r)) continue;
      const stars = Number(r.stars);
      const inkRatio = Number(r.inkRatio);
      if ([1, 2, 3].includes(stars) && Number.isFinite(inkRatio)) {
        results[id] = { stars: stars as Stars, inkRatio: Math.min(1, Math.max(0, inkRatio)) };
      }
    }
  }
  const deaths = Number(raw.deaths);
  return {
    version: 2,
    playerId: raw.playerId,
    playerName: typeof raw.playerName === 'string' ? raw.playerName : '',
    deaths: Number.isInteger(deaths) && deaths >= 0 ? deaths : 0,
    results,
    muted: raw.muted === true,
  };
}

const PROGRESS_KEY = 'sod.progress.v2';

/** Repository: the only place that knows how progress is persisted. */
export class ProgressRepository {
  private current: Progress;

  constructor(private readonly store: KeyValueStore) {
    this.current = parseProgress(readJson(store, PROGRESS_KEY)) ?? createProgress();
  }

  get(): Progress {
    return this.current;
  }

  update(fn: (p: Progress) => Progress): Progress {
    this.current = fn(this.current);
    writeJson(this.store, PROGRESS_KEY, this.current);
    return this.current;
  }

  /** Starts over but keeps identity and settings. */
  reset(): Progress {
    const { playerId, playerName, muted } = this.current;
    return this.update(() => ({ ...createProgress(playerId), playerName, muted }));
  }
}
