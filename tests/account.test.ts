import { describe, expect, it } from 'vitest';
import { nicknameFrom } from '@/platform/account';
import { signInErrorMessage } from '@/platform/firebaseSession';
import {
  LocalLeaderboard,
  ResilientLeaderboard,
  type LeaderboardEntry,
  type PendingScore,
  type RemoteLeaderboard,
} from '@/platform/leaderboard';
import { Outbox } from '@/platform/outbox';
import { rankMessage } from '@/platform/ranking';
import { MemoryStore } from '@/platform/storage';

/** A global board that only accepts runs from signed-in players. */
function accountBoard() {
  const state = { signedIn: false, uid: 'anon-1', saved: [] as LeaderboardEntry[] };
  const remote: RemoteLeaderboard = {
    list: async () => state.saved,
    submit: async (_g, e) => {
      if (!state.signedIn) throw new Error('permission-denied');
      state.saved.push(e);
    },
    playerId: async () => state.uid,
    canSubmit: async () => state.signedIn,
  };
  const store = new MemoryStore();
  const board = new ResilientLeaderboard(
    new LocalLeaderboard(store),
    remote,
    'dev-1',
    () => new Date('2026-01-01T00:00:00Z'),
    new Outbox<PendingScore>(store, 'arcade.outbox.scores'),
  );
  return { state, board };
}

describe('conta Google', () => {
  it('signed out: the run stays on the device and waits for the sign-in', async () => {
    const { state, board } = accountBoard();
    expect(await board.submit('snake', { name: 'Ana', score: 120, details: {} })).toBe('login');
    expect(state.saved).toHaveLength(0);
    expect(board.pendingCount).toBe(1);
    expect(await board.listLocal('snake')).toHaveLength(1);
    // Nothing goes while still signed out.
    expect(await board.flush()).toBe(0);
    expect(board.pendingCount).toBe(1);
  });

  it('after signing in, waiting runs go global under the Google uid', async () => {
    const { state, board } = accountBoard();
    await board.submit('snake', { name: 'Ana', score: 120, details: {} });
    await board.submit('stack', { name: 'Ana', score: 30, details: {} });
    state.signedIn = true;
    state.uid = 'google-7';
    await board.refreshIdentity();
    expect(await board.flush()).toBe(2);
    expect(state.saved.map((e) => e.player)).toEqual(['google-7', 'google-7']);
    expect(board.isMine(state.saved[0]!)).toBe(true);
    expect(await board.submit('snake', { name: 'Ana', score: 200, details: {} })).toBe('global');
  });

  it('autoSubmit reports the place and asks for the sign-in', async () => {
    const { board } = accountBoard();
    const r = await board.autoSubmit('snake', { name: 'Ana', score: 10, details: {} });
    expect(r).toEqual({ rank: 1, result: 'login' });
    expect(rankMessage(r, true)).toContain('Entre com Google');
  });

  it('nickname from the Google name, and friendly errors', () => {
    expect(nicknameFrom('Douglas Santos Froes')).toBe('Douglas');
    expect(nicknameFrom('   ')).toBe('');
    expect(signInErrorMessage('auth/popup-blocked')).toContain('pop-ups');
    expect(signInErrorMessage('auth/whatever')).toContain('Tente de novo');
  });
});
