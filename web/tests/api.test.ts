import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from '@/platform/api/client';
import { mergeMessages } from '@/platform/api/feed';
import { ApiLeaderboard } from '@/platform/api/leaderboard';
import { ApiSession } from '@/platform/api/session';
import { ChatSocket, type SocketLike } from '@/platform/api/socket';
import { parseApiMessage } from '@/platform/api/chat';
import type { ChatMessage } from '@/platform/chat/core';
import { MemoryStore } from '@/platform/storage';

const msg = (id: string, at: number, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  uid: 'u',
  name: 'N',
  text: id,
  at,
  ...extra,
});

describe('mergeMessages', () => {
  it('keeps messages oldest first and replaces the ones it already has', () => {
    const merged = mergeMessages(
      [msg('a', 1), msg('b', 2)],
      [msg('c', 3), msg('a', 1, { del: true })],
      10,
    );
    expect(merged.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(merged[0]!.del).toBe(true);
  });

  it('keeps only the newest `max`', () => {
    const merged = mergeMessages([msg('a', 1), msg('b', 2)], [msg('c', 3)], 2);
    expect(merged.map((m) => m.id)).toEqual(['b', 'c']);
  });
});

/** A fetch that answers from a script of [status, body] and records the requests. */
function fakeFetch(...replies: Array<[number, unknown]>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const [status, body] = replies.shift() ?? [500, null];
    return { ok: status < 400, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

const settings = { baseUrl: 'https://api.test', googleClientId: 'cid' };

describe('ApiClient', () => {
  it('sends JSON with the token and maps errors', async () => {
    const { fetcher, calls } = fakeFetch([200, { ok: 1 }], [403, { error: 'nope' }], [204, null]);
    const api = new ApiClient(settings, fetcher);
    await expect(
      api.request('/x', { method: 'POST', body: { a: 1 }, token: 't' }),
    ).resolves.toEqual({ ok: 1 });
    expect(calls[0]!.url).toBe('https://api.test/x');
    expect(calls[0]!.init.headers).toMatchObject({
      Authorization: 'Bearer t',
      'Content-Type': 'application/json',
    });
    await expect(api.request('/y')).rejects.toMatchObject({ status: 403, message: 'nope' });
    await expect(api.request('/z')).resolves.toBeUndefined();
  });

  it('reports an unreachable server as status 0', async () => {
    const api = new ApiClient(settings, (async () =>
      Promise.reject(new TypeError('offline'))) as typeof fetch);
    await expect(api.request('/x')).rejects.toBeInstanceOf(ApiError);
    await expect(api.request('/x')).rejects.toMatchObject({ status: 0 });
  });

  it('builds the WebSocket address from the base or the page origin', () => {
    expect(new ApiClient(settings).socketUrl('/ws')).toBe('wss://api.test/ws');
    expect(
      new ApiClient({ ...settings, baseUrl: '' }).socketUrl('/ws', 'http://localhost:5173'),
    ).toBe('ws://localhost:5173/ws');
  });
});

const session = (fetcher: typeof fetch) =>
  new ApiSession(new ApiClient(settings, fetcher), new MemoryStore() as never, 1000);
const SESSION = { token: 'T1', playerId: 'p1', google: false, account: null, moved: 0 };

describe('ApiSession', () => {
  beforeEach(() => vi.stubGlobal('window', {}));
  afterEach(() => vi.unstubAllGlobals());

  it('starts anonymous and remembers the token', async () => {
    const { fetcher, calls } = fakeFetch([200, SESSION]);
    const s = session(fetcher);
    expect(await s.token()).toBe('T1');
    expect(await s.canSubmit()).toBe(false);
    expect(s.account()).toBeNull();
    await s.uid();
    expect(calls).toHaveLength(1);
  });

  it('replaces a token the server refuses and retries once', async () => {
    const { fetcher, calls } = fakeFetch(
      [200, SESSION],
      [401, { error: 'sign in required' }],
      [200, { ...SESSION, token: 'T2' }],
      [200, { value: 7 }],
    );
    const s = session(fetcher);
    await expect(s.call('/api/thing')).resolves.toEqual({ value: 7 });
    expect(await s.token()).toBe('T2');
    expect(calls.map((c) => c.url.replace('https://api.test', ''))).toEqual([
      '/api/auth/anonymous',
      '/api/thing',
      '/api/auth/anonymous',
      '/api/thing',
    ]);
  });
});

describe('ApiLeaderboard', () => {
  it('reads a board and sends a run under its board id', async () => {
    const row = {
      id: 'e1',
      player: 'p',
      name: 'Ana',
      score: 90,
      details: { a: 1 },
      date: '2026-10-27T10:00:00.000Z',
    };
    const { fetcher, calls } = fakeFetch([200, [row]], [200, SESSION], [201, row]);
    const board = new ApiLeaderboard(session(fetcher));
    expect(await board.list('sudoku', 5)).toEqual([row]);
    await board.submit('sudoku', {
      id: 'x',
      player: 'p',
      name: 'Ana',
      score: 90.4,
      details: {},
      date: '',
    });
    expect(calls[0]!.url).toContain('/api/boards/sudoku2?limit=5');
    expect(calls[2]!.url).toContain('/api/boards/sudoku2/entries');
    expect(JSON.parse(String(calls[2]!.init.body))).toMatchObject({ name: 'Ana', score: 90 });
  });
});

class FakeSocket implements SocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: unknown[] = [];
  closed = false;
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
  }
}

describe('ChatSocket', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function setup() {
    const sockets: FakeSocket[] = [];
    const chat = new ChatSocket(async () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    }, parseApiMessage);
    return { chat, sockets };
  }

  it('subscribes to the followed rooms once connected and delivers their events', async () => {
    const { chat, sockets } = await setup();
    const got: string[] = [];
    chat.followRoom('geral', (m, kind) => got.push(`${kind}:${m.id}`));
    await vi.advanceTimersByTimeAsync(0);
    const ws = sockets[0]!;
    ws.onopen?.();
    expect(ws.sent).toEqual([{ op: 'sub', rooms: ['geral'], presence: false }]);

    const message = { id: 'm1', uid: 'u', name: 'N', text: 'oi', at: 1 };
    ws.onmessage?.({ data: JSON.stringify({ type: 'message', room: 'geral', message }) });
    ws.onmessage?.({ data: JSON.stringify({ type: 'update', room: 'stack', message }) });
    expect(got).toEqual(['message:m1']);
  });

  it('follows who is online and tells listeners to reload after a resync', async () => {
    const { chat, sockets } = await setup();
    const lists: number[] = [];
    let resyncs = 0;
    chat.followPresence((l) => lists.push(l.length));
    chat.onResync(() => resyncs++);
    await vi.advanceTimersByTimeAsync(0);
    const ws = sockets[0]!;
    ws.onopen?.();
    expect(ws.sent.at(-1)).toEqual({ op: 'sub', rooms: [], presence: true });
    ws.onmessage?.({
      data: JSON.stringify({
        type: 'presence',
        players: [{ uid: 'a', name: 'A', at: 1, g: '', typing: '' }],
      }),
    });
    ws.onmessage?.({ data: '{"type":"resync"}' });
    ws.onmessage?.({ data: 'not json' });
    expect(lists).toEqual([1]);
    expect(resyncs).toBe(2); // the open and the explicit resync
  });

  it('reconnects with backoff after a drop, and closes when nobody follows', async () => {
    const { chat, sockets } = await setup();
    const stop = chat.followRoom('geral', () => undefined);
    await vi.advanceTimersByTimeAsync(0);
    sockets[0]!.onopen?.();
    sockets[0]!.onclose?.();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sockets).toHaveLength(2);
    sockets[1]!.onopen?.();
    expect(sockets[1]!.sent).toEqual([{ op: 'sub', rooms: ['geral'], presence: false }]);
    stop();
    expect(sockets[1]!.closed).toBe(true);
  });

  it('updates the subscription when rooms change', async () => {
    const { chat, sockets } = await setup();
    chat.followRoom('geral', () => undefined);
    await vi.advanceTimersByTimeAsync(0);
    const ws = sockets[0]!;
    ws.onopen?.();
    chat.followRoom('stack', () => undefined);
    expect(ws.sent.at(-1)).toEqual({ op: 'sub', rooms: ['geral', 'stack'], presence: false });
  });
});
