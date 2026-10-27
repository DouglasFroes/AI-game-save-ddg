import { boardId } from '../boards';
import type { LeaderboardEntry, RemoteLeaderboard } from '../leaderboard';
import { parseEntry, rankEntries, TIEBREAK } from '../leaderboard';
import { withTimeout } from './client';
import type { ApiSession } from './session';

/** Extra rows fetched on tiebreak boards so a tied entry just past the cut-off is not lost. */
const TIE_MARGIN = 20;

/** The global ranking, over the API. */
export class ApiLeaderboard implements RemoteLeaderboard {
  constructor(
    readonly session: ApiSession,
    private readonly timeoutMs = 8000,
  ) {}

  playerId(): Promise<string> {
    return withTimeout(this.session.uid(), this.timeoutMs);
  }

  canSubmit(): Promise<boolean> {
    return withTimeout(this.session.canSubmit(), this.timeoutMs);
  }

  async list(gameId: string, max: number): Promise<LeaderboardEntry[]> {
    const limit = TIEBREAK[gameId] ? max + TIE_MARGIN : max;
    const rows = await this.session.api.request<unknown[]>(
      `/api/boards/${boardId(gameId)}?limit=${limit}`,
      { timeoutMs: this.timeoutMs },
    );
    const entries = rows.map(parseEntry).filter((e): e is LeaderboardEntry => e !== null);
    // Equal scores are settled here (the game's tiebreak, then the older run).
    return rankEntries(entries, gameId).slice(0, max);
  }

  /** Campaign boards (one growing run per player) are replaced by the server itself. */
  async submit(gameId: string, entry: LeaderboardEntry): Promise<void> {
    await this.session.call(`/api/boards/${boardId(gameId)}/entries`, {
      method: 'POST',
      body: { name: entry.name, score: Math.round(entry.score), details: entry.details },
    });
  }
}
