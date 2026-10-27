import type { GameId } from '@/games/registry';
import type { PlaySession } from './telemetry';

/** How far back the hub's "most played" looks. */
export const TREND_DAYS = 7;
const DAY_MS = 86_400_000;

/**
 * The games most played in the last `days` days, most first: by total play time, then by number
 * of sessions. Only games that were actually played show up, so the list can be short.
 */
export function trendingGames(
  sessions: readonly PlaySession[],
  now: Date = new Date(),
  days = TREND_DAYS,
  limit = 10,
): GameId[] {
  const since = now.getTime() - days * DAY_MS;
  const totals = new Map<GameId, { time: number; sessions: number }>();
  for (const s of sessions) {
    const at = Date.parse(s.endedAt);
    if (!Number.isFinite(at) || at < since || at > now.getTime() + DAY_MS) continue;
    const t = totals.get(s.gameId) ?? { time: 0, sessions: 0 };
    t.time += s.durationSec;
    t.sessions++;
    totals.set(s.gameId, t);
  }
  return [...totals.entries()]
    .sort(([ai, a], [bi, b]) => b.time - a.time || b.sessions - a.sessions || ai.localeCompare(bi))
    .slice(0, limit)
    .map(([id]) => id);
}
