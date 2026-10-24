import { describe, expect, it } from 'vitest';
import {
  LocalLeaderboard,
  ResilientLeaderboard,
  type LeaderboardEntry,
  type PendingScore,
  type RemoteLeaderboard,
} from '@/platform/leaderboard';
import type { GameId } from '@/games/registry';
import { Outbox } from '@/platform/outbox';
import { MemoryStore } from '@/platform/storage';
import { bindConnectivitySync } from '@/platform/sync';
import {
  LocalTelemetry,
  ResilientTelemetry,
  type PlaySession,
  type RemoteTelemetry,
} from '@/platform/telemetry';

/** A fake server that can be switched between offline and online. */
function fakeBoard() {
  const state = { online: false, saved: [] as Array<[string, LeaderboardEntry, boolean]> };
  const remote: RemoteLeaderboard = {
    list: async () => {
      if (!state.online) throw new Error('offline');
      return [];
    },
    submit: async (g, e, replace = false) => {
      if (!state.online) throw new Error('offline');
      state.saved.push([g, e, replace]);
    },
    playerId: async () => {
      if (!state.online) throw new Error('offline');
      return 'uid-9';
    },
  };
  return { state, remote };
}

const make = (remote: RemoteLeaderboard, store = new MemoryStore()) =>
  new ResilientLeaderboard(
    new LocalLeaderboard(store),
    remote,
    'dev-1',
    () => new Date('2026-01-01T00:00:00Z'),
    new Outbox<PendingScore>(store, 'arcade.outbox.scores'),
  );

describe('Outbox', () => {
  it('persists items and sends them in order, dropping each one that went', async () => {
    const store = new MemoryStore();
    const box = new Outbox<number>(store, 'k');
    box.add(1);
    box.add(2);
    box.add(3);
    expect(new Outbox<number>(store, 'k').list()).toEqual([1, 2, 3]); // survives a "reload"
    const sent: number[] = [];
    expect(await box.drain(async (n) => void sent.push(n))).toBe(3);
    expect(sent).toEqual([1, 2, 3]);
    expect(box.size).toBe(0);
  });

  it('stops at the first failure and keeps the rest for the next try', async () => {
    const box = new Outbox<number>(new MemoryStore(), 'k');
    [1, 2, 3].forEach((n) => box.add(n));
    let calls = 0;
    const sent = await box.drain(async (n) => {
      calls++;
      if (n === 2) throw new Error('offline');
    });
    expect(sent).toBe(1);
    expect(calls).toBe(2);
    expect(box.list()).toEqual([2, 3]);
  });

  it('shares one run between concurrent drains, so nothing is sent twice', async () => {
    const box = new Outbox<number>(new MemoryStore(), 'k');
    box.add(1);
    box.add(2);
    const sent: number[] = [];
    const send = async (n: number) => {
      await Promise.resolve();
      sent.push(n);
    };
    await Promise.all([box.drain(send), box.drain(send)]);
    expect(sent).toEqual([1, 2]);
  });

  it('keeps an item added while another was in flight', async () => {
    const box = new Outbox<number>(new MemoryStore(), 'k');
    box.add(1);
    await box.drain(async () => box.add(2));
    expect(box.list()).toEqual([2]);
  });

  it('caps the queue and can replace superseded items', () => {
    const box = new Outbox<{ g: string; n: number }>(new MemoryStore(), 'k', 3);
    for (let n = 1; n <= 5; n++) box.add({ g: 'a', n });
    expect(box.list().map((i) => i.n)).toEqual([3, 4, 5]);
    box.add({ g: 'a', n: 6 }, (q) => q.g === 'a');
    expect(box.list()).toEqual([{ g: 'a', n: 6 }]);
  });
});

describe('scores played offline', () => {
  it('saves locally while offline, then sends once the connection is back', async () => {
    const { state, remote } = fakeBoard();
    const board = make(remote);
    expect(await board.submit('gancho', { name: 'Ana', score: 120, details: { meters: 80 } })).toBe(
      'local',
    );
    expect(await board.submit('gancho', { name: 'Ana', score: 90, details: {} })).toBe('local');
    expect(board.pendingCount).toBe(2);
    expect(state.saved).toEqual([]);
    // Still visible on the device's own board while offline.
    expect((await board.list('gancho')).map((e) => e.score)).toEqual([120, 90]);

    expect(await board.flush()).toBe(0); // still offline: nothing lost, nothing sent

    state.online = true;
    expect(await board.flush()).toBe(2);
    expect(board.pendingCount).toBe(0);
    expect(state.saved.map(([g, e]) => [g, e.score, e.player])).toEqual([
      ['gancho', 120, 'uid-9'],
      ['gancho', 90, 'uid-9'],
    ]);
    expect(await board.flush()).toBe(0); // nothing is ever sent twice
  });

  it('survives closing the app: a new session sends the old queue', async () => {
    const { state, remote } = fakeBoard();
    const store = new MemoryStore();
    await make(remote, store).submit('orbita', { name: 'Ana', score: 50, details: {} });

    state.online = true;
    const next = make(remote, store); // "reopened" app, same storage
    expect(next.pendingCount).toBe(1);
    expect(await next.flush()).toBe(1);
    expect(state.saved[0]?.[1]).toMatchObject({ score: 50, player: 'uid-9', name: 'Ana' });
  });

  it('flushes the backlog after the next successful online submit', async () => {
    const { state, remote } = fakeBoard();
    const board = make(remote);
    await board.submit('plinko', { name: 'Ana', score: 10, details: {} });
    state.online = true;
    expect(await board.submit('plinko', { name: 'Ana', score: 30, details: {} })).toBe('global');
    await board.flush(); // joins the background flush that the submit started
    expect(state.saved.map(([, e]) => e.score).sort()).toEqual([10, 30]);
    expect(board.pendingCount).toBe(0);
  });

  it('queues only the latest total of a campaign game, replacing the old one', async () => {
    const { state, remote } = fakeBoard();
    const board = make(remote);
    await board.submit('doguinho', { name: 'Ana', score: 100, details: {} });
    await board.submit('doguinho', { name: 'Ana', score: 250, details: {} });
    expect(board.pendingCount).toBe(1);
    state.online = true;
    await board.flush();
    expect(state.saved).toHaveLength(1);
    expect(state.saved[0]).toMatchObject(['doguinho', { score: 250 }, true]);
  });

  it('queues nothing when there is no global board at all', async () => {
    const store = new MemoryStore();
    const board = new ResilientLeaderboard(
      new LocalLeaderboard(store),
      null,
      'dev-1',
      undefined,
      new Outbox<PendingScore>(store, 'arcade.outbox.scores'),
    );
    expect(await board.submit('gancho', { name: 'Ana', score: 1, details: {} })).toBe('local');
    expect(board.pendingCount).toBe(0);
    expect(await board.flush()).toBe(0);
  });
});

describe('play sessions played offline', () => {
  it('queues the session and sends it, with the server player id, when back online', async () => {
    const state = { online: false, recorded: [] as PlaySession[] };
    const remote: RemoteTelemetry = {
      playerId: async () => {
        if (!state.online) throw new Error('offline');
        return 'uid-9';
      },
      record: async (s) => {
        if (!state.online) throw new Error('offline');
        state.recorded.push(s);
      },
      listAll: async () => [],
    };
    const store = new MemoryStore();
    const tel = new ResilientTelemetry(
      new LocalTelemetry(store, (id): id is GameId => !!id),
      remote,
      () => ({ playerId: 'dev-1', name: 'Ana' }),
      undefined,
      new Outbox<PlaySession>(store, 'arcade.outbox.sessions'),
    );
    const s = await tel.recordSession({
      gameId: 'gancho',
      durationSec: 42,
      score: 7,
      startedAt: new Date('2026-01-01T00:00:00Z'),
      endedAt: new Date('2026-01-01T00:00:42Z'),
    });
    expect(s?.playerId).toBe('dev-1');
    expect(state.recorded).toEqual([]);
    expect(await tel.flush()).toBe(0);

    state.online = true;
    expect(await tel.flush()).toBe(1);
    expect(state.recorded[0]).toMatchObject({
      gameId: 'gancho',
      durationSec: 42,
      playerId: 'uid-9',
    });
    expect(await tel.flush()).toBe(0);
  });
});

describe('bindConnectivitySync', () => {
  const setup = (onLine: boolean) => {
    const handlers: Record<string, () => void> = {};
    const flushed = { scores: 0, sessions: 0 };
    const env = {
      addEventListener: (t: string, l: () => void) => void (handlers[t] = l),
      setInterval: () => 0,
      navigator: { onLine },
    };
    const doc = {
      visibilityState: 'visible',
      addEventListener: (t: string, l: () => void) => void (handlers[t] = l),
    };
    const services = {
      leaderboard: { flush: async () => ++flushed.scores },
      telemetry: { flush: async () => ++flushed.sessions },
    };
    return { handlers, flushed, env, doc, services };
  };

  it('syncs at startup and again when the browser comes back online', async () => {
    const t = setup(true);
    bindConnectivitySync(t.services as never, t.env, t.doc);
    await new Promise((r) => setTimeout(r, 0));
    expect(t.flushed.scores).toBe(1);
    t.handlers.online!();
    await new Promise((r) => setTimeout(r, 0));
    expect(t.flushed.scores).toBe(2);
    expect(t.flushed.sessions).toBe(2);
  });

  it('does not try while the browser says it is offline', async () => {
    const t = setup(false);
    const sync = bindConnectivitySync(t.services as never, t.env, t.doc);
    expect(await sync()).toBe(0);
    expect(t.flushed.scores).toBe(0);
  });
});
