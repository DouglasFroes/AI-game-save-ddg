import type { GameId } from '@/games/registry';
import { parseSession, type PlaySession, type RemoteTelemetry } from '../telemetry';
import { withTimeout } from './client';
import type { ApiSession } from './session';

/** Play analytics over the API. */
export class ApiTelemetry implements RemoteTelemetry {
  constructor(
    private readonly session: ApiSession,
    private readonly isGameId?: (id: string) => id is GameId,
    private readonly timeoutMs = 8000,
  ) {}

  playerId(): Promise<string> {
    return withTimeout(this.session.uid(), this.timeoutMs);
  }

  async record(s: PlaySession): Promise<void> {
    await this.session.call('/api/telemetry/sessions', {
      method: 'POST',
      body: {
        id: s.id,
        name: s.playerName,
        gameId: s.gameId,
        durationSec: Math.round(s.durationSec),
        score: Math.max(0, Math.round(s.score)),
        startedAt: s.startedAt,
      },
    });
  }

  /** The last week of play across all players (anonymised), for the "most played" shelf. */
  async listAll(max = 2000): Promise<PlaySession[]> {
    const rows = await this.session.api.request<unknown[]>('/api/telemetry/recent', {
      timeoutMs: this.timeoutMs,
    });
    return rows
      .map((r) => parseSession(r, this.isGameId))
      .filter((s): s is PlaySession => s !== null)
      .slice(0, max);
  }
}
