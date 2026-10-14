import type { Services } from '@/services';
import type { ScoreRecord } from './bestScores';
import type { SubmitResult } from './leaderboard';

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
