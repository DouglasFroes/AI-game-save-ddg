import type { Services } from '@/services';
import type { ScoreRecord } from './bestScores';
import type { SubmitResult } from './leaderboard';

export interface AutoSubmit {
  readonly rank: number;
  readonly result: SubmitResult;
}

/** The run would enter the top 20, but the player has no name yet: nothing was sent. */
export interface NeedsName {
  readonly needsName: true;
  readonly rank: number;
}

/**
 * Sends the run automatically when it makes the top 20 — only for players with a name.
 * Without one nothing is sent; `needsName` tells the screen to ask for it.
 */
export async function autoSubmit(
  services: Services,
  gameId: string,
  record: ScoreRecord,
): Promise<AutoSubmit | NeedsName | null> {
  const name = services.profile.get().name;
  if (!name) {
    const rank = await services.leaderboard.qualify(gameId, record.score);
    return rank === null ? null : { needsName: true, rank };
  }
  return services.leaderboard.autoSubmit(gameId, { name, ...record });
}

export function rankMessage(r: AutoSubmit | null, online: boolean): string {
  if (!r) return online ? 'Fora do top 20 global desta vez' : 'Fora do top 20 deste aparelho';
  const where = r.result === 'global' ? 'global' : 'deste aparelho';
  return `Entrou no top 20 ${where}: ${r.rank}º lugar!`;
}

/** Sends a score to the game's ranking. Returns null when the player has no name yet. */
export async function submitScore(
  services: Services,
  gameId: string,
  record: ScoreRecord,
): Promise<SubmitResult | null> {
  const name = services.profile.get().name;
  if (!name) return null;
  return services.leaderboard.submit(gameId, { name, ...record });
}

export function submitMessage(result: SubmitResult | null): string {
  if (result === 'global') return 'Enviado ao ranking global!';
  if (result === 'local') return 'Salvo no ranking deste aparelho.';
  return '';
}

export const formatNumber = (n: number): string => Math.round(n).toLocaleString('pt-BR');

export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
