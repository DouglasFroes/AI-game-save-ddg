import type { AccountInfo, ApiSession, SignInOutcome } from './api/session';
import { sanitizeName, type ResilientLeaderboard } from './leaderboard';
import type { ProfileRepository } from './profile';

export type { AccountInfo, SignInOutcome } from './api/session';

/** The player's Google account, which the global ranking requires. */
export interface AccountService {
  /** False without a global ranking (no API configured): there is nothing to sign in to. */
  readonly available: boolean;
  current(): AccountInfo | null;
  /** True when a tap can open the Google popup right away (see `prepare`). */
  readonly isReady: boolean;
  /** Connects ahead of time, so the sign-in popup can open straight from the player's tap. */
  prepare(): Promise<boolean>;
  /** Call directly from a tap. */
  signIn(): Promise<SignInOutcome>;
  signOut(): Promise<void>;
  onChange(listener: () => void): () => void;
}

export const NO_ACCOUNT: AccountService = {
  available: false,
  current: () => null,
  isReady: false,
  prepare: async () => false,
  signIn: async () => ({ type: 'error', message: 'Ranking global indisponível.' }),
  signOut: async () => undefined,
  onChange: () => () => undefined,
};

/** First word of the Google name, as a ranking nickname. */
export function nicknameFrom(googleName: string): string {
  const first = googleName.trim().split(/\s+/)[0] ?? '';
  return first ? sanitizeName(first) : '';
}

export class GoogleAccount implements AccountService {
  readonly available = true;

  constructor(
    private readonly session: ApiSession,
    private readonly leaderboard: ResilientLeaderboard,
    private readonly profile: ProfileRepository,
  ) {}

  current(): AccountInfo | null {
    return this.session.account();
  }

  get isReady(): boolean {
    return this.session.isReady;
  }

  prepare(): Promise<boolean> {
    return this.session.connect().then(
      () => this.session.isReady,
      () => false,
    );
  }

  signIn(): Promise<SignInOutcome> {
    return this.session.signInWithGoogle().then(async (outcome) => {
      if (outcome.type !== 'signed-in') return outcome;
      const name = this.session.account()?.name ?? '';
      if (!this.profile.get().name && nicknameFrom(name))
        this.profile.update({ name: nicknameFrom(name) });
      await this.leaderboard.refreshIdentity();
      // Runs played while signed out were kept for this moment.
      await this.leaderboard.flush();
      return outcome;
    });
  }

  async signOut(): Promise<void> {
    await this.session.signOut();
    await this.leaderboard.refreshIdentity();
  }

  onChange(listener: () => void): () => void {
    return this.session.onChange(listener);
  }
}
