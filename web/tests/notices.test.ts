import { afterEach, describe, expect, it } from 'vitest';
import { bindConnectivityNotices } from '@/platform/connectivityNotices';
import {
  NoticeQueue,
  publishNotice,
  retractNotice,
  subscribeNotices,
  type AppNotice,
} from '@/platform/notices';
import { gameLaunchFromSearch } from '@/platform/shareLink';

const notice = (key: string, title = key): AppNotice => ({ key, title });

describe('NoticeQueue', () => {
  it('serves notices in order', () => {
    const q = new NoticeQueue<AppNotice>();
    q.push(notice('a'));
    q.push(notice('b'));
    expect(q.shift()?.key).toBe('a');
    expect(q.shift()?.key).toBe('b');
    expect(q.shift()).toBeUndefined();
  });

  it('replaces a waiting notice with the same key instead of repeating it', () => {
    const q = new NoticeQueue<AppNotice>();
    q.push(notice('rival:x', 'old'));
    q.push(notice('other'));
    q.push(notice('rival:x', 'new'));
    expect(q.size).toBe(2);
    expect(q.shift()?.title).toBe('new');
  });

  it('drops the oldest when it overflows', () => {
    const q = new NoticeQueue<AppNotice>(2);
    q.push(notice('a'));
    q.push(notice('b'));
    q.push(notice('c'));
    expect(q.shift()?.key).toBe('b');
  });

  it('removes by key', () => {
    const q = new NoticeQueue<AppNotice>();
    q.push(notice('a'));
    q.remove('a');
    expect(q.size).toBe(0);
  });
});

describe('notice bus', () => {
  let off: (() => void) | null = null;
  afterEach(() => {
    off?.();
    off = null;
    // Drain anything a test left waiting.
    subscribeNotices(() => undefined)();
  });

  it('holds notices until the hub subscribes, then delivers them in order', () => {
    publishNotice(notice('one'));
    publishNotice(notice('two'));
    const got: string[] = [];
    off = subscribeNotices((n) => got.push(n.key));
    expect(got).toEqual(['one', 'two']);
  });

  it('delivers straight away while subscribed', () => {
    const got: string[] = [];
    off = subscribeNotices((n) => got.push(n.key));
    publishNotice(notice('live'));
    expect(got).toEqual(['live']);
  });

  it('can withdraw a notice that was never shown', () => {
    publishNotice(notice('connection'));
    retractNotice('connection');
    const got: string[] = [];
    off = subscribeNotices((n) => got.push(n.key));
    expect(got).toEqual([]);
  });
});

describe('connectivity notices', () => {
  const setup = (onLine: boolean) => {
    const handlers: Record<string, () => void> = {};
    return {
      handlers,
      env: {
        addEventListener: (t: string, l: () => void) => void (handlers[t] = l),
        navigator: { onLine },
      },
    };
  };
  const collect = () => {
    const got: AppNotice[] = [];
    const off = subscribeNotices((n) => got.push(n));
    return { got, off };
  };

  it('warns when the connection drops, and not when it comes back first', () => {
    const t = setup(true);
    bindConnectivityNotices(t.env);
    t.handlers.offline!();
    t.handlers.online!();
    const { got, off } = collect();
    off();
    expect(got).toEqual([]);

    t.handlers.offline!();
    const live = collect();
    t.handlers.offline!();
    live.off();
    expect(live.got.at(-1)?.kind).toBe('warn');
  });

  it('warns right away when the app starts offline', () => {
    bindConnectivityNotices(setup(false).env);
    const { got, off } = collect();
    off();
    expect(got.map((n) => n.key)).toEqual(['connection']);
  });
});

describe('launch links', () => {
  const known = (id: string) => id === 'snake';

  it('opens the sheet by default and starts the game with jogar=1', () => {
    expect(gameLaunchFromSearch('?jogo=snake', known)).toEqual({ id: 'snake', play: false });
    expect(gameLaunchFromSearch('?jogo=snake&jogar=1', known)).toEqual({
      id: 'snake',
      play: true,
    });
  });

  it('ignores unknown games', () => {
    expect(gameLaunchFromSearch('?jogo=nada&jogar=1', known)).toBeNull();
  });
});
