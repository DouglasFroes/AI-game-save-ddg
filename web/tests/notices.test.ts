import { afterEach, describe, expect, it } from 'vitest';
import { isReplyToMe } from '@/platform/chat/core';
import { bindConnectivityNotices } from '@/platform/connectivityNotices';
import {
  clearNoticeHistory,
  inferNoticeCategory,
  listNoticeHistory,
  markAllNoticesRead,
  markNoticeRead,
  NoticeQueue,
  publishNotice,
  recordNotice,
  removeNoticeHistory,
  retractNotice,
  subscribeNotices,
  unreadNoticeCount,
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

  it('keeps higher-priority notices when overflowing', () => {
    const q = new NoticeQueue<AppNotice>(2);
    q.push({ key: 'rival:snake', title: 'Rival!', priority: 2 });
    q.push({ key: 'low', title: 'Low', priority: 0 });
    q.push({ key: 'mid', title: 'Mid', priority: 1 });
    expect(q.shift()?.key).toBe('rival:snake');
    expect(q.shift()?.key).toBe('mid');
  });

  it('removes by key', () => {
    const q = new NoticeQueue<AppNotice>();
    q.push(notice('a'));
    q.remove('a');
    expect(q.size).toBe(0);
  });
});

describe('notice bus & history inbox', () => {
  let off: (() => void) | null = null;
  afterEach(() => {
    off?.();
    off = null;
    // Drain anything a test left waiting.
    subscribeNotices(() => undefined)();
    clearNoticeHistory();
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

  it('can withdraw a notice that was never shown and removes it from history', () => {
    publishNotice(notice('connection'));
    expect(listNoticeHistory().map((i) => i.key)).toEqual(['connection']);
    retractNotice('connection');
    const got: string[] = [];
    off = subscribeNotices((n) => got.push(n.key));
    expect(got).toEqual([]);
    expect(listNoticeHistory()).toEqual([]);
  });

  it('records non-ephemeral notices in history, tracks unread count, and marks read', () => {
    recordNotice(
      {
        key: 'rival:snake',
        kind: 'rival',
        title: 'Ana passou você na Cobrinha!',
        body: 'Você caiu de 1º para 2º',
      },
      1000,
    );
    recordNotice(
      {
        key: 'mention-m1',
        kind: 'info',
        glyph: 'chat',
        chatRoom: 'geral',
        title: 'Leo mencionou você',
        body: '@voce bora jogar!',
      },
      2000,
    );
    // Ephemeral toasts are ignored by history
    recordNotice({ key: 'toast:copied', title: 'Link copiado!' }, 3000);
    recordNotice({ key: 'share', title: 'Link copiado!' }, 3500);

    const list = listNoticeHistory();
    expect(list).toHaveLength(2);
    expect(list[0]?.key).toBe('mention-m1');
    expect(list[0]?.category).toBe('chat');
    expect(list[1]?.key).toBe('rival:snake');
    expect(list[1]?.category).toBe('ranking');
    expect(list[1]?.gameId).toBe('snake');
    expect(unreadNoticeCount()).toBe(2);

    markNoticeRead(list[0]!.id);
    expect(unreadNoticeCount()).toBe(1);

    markAllNoticesRead();
    expect(unreadNoticeCount()).toBe(0);

    removeNoticeHistory(list[0]!.id);
    expect(listNoticeHistory()).toHaveLength(1);

    clearNoticeHistory();
    expect(listNoticeHistory()).toHaveLength(0);
  });

  it('infers categories accurately', () => {
    expect(inferNoticeCategory({ key: 'rival:tetris', kind: 'rival' })).toBe('ranking');
    expect(inferNoticeCategory({ key: 'synced', kind: 'success' })).toBe('ranking');
    expect(inferNoticeCategory({ key: 'reply-99', glyph: 'chat' })).toBe('chat');
    expect(inferNoticeCategory({ key: 'update', kind: 'info' })).toBe('system');
  });
});

describe('connectivity notices', () => {
  afterEach(() => {
    subscribeNotices(() => undefined)();
    clearNoticeHistory();
  });

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

  it('notifies when connection is restored after the offline warning was already shown', () => {
    const t = setup(true);
    bindConnectivityNotices(t.env);
    const live = collect();
    t.handlers.offline!();
    expect(live.got.map((n) => n.key)).toEqual(['connection']);
    t.handlers.online!();
    live.off();
    expect(live.got.map((n) => n.key)).toEqual(['connection', 'connection-online']);
    expect(live.got.at(-1)?.kind).toBe('success');
  });

  it('warns right away when the app starts offline', () => {
    bindConnectivityNotices(setup(false).env);
    const { got, off } = collect();
    off();
    expect(got.map((n) => n.key)).toEqual(['connection']);
  });
});

describe('chat reply detection', () => {
  it('detects direct replies case- and accent-insensitively', () => {
    expect(isReplyToMe({ re: { id: '1', name: 'João', text: 'oi' } }, 'joao')).toBe(true);
    expect(isReplyToMe({ re: { id: '1', name: 'Maria', text: 'oi' } }, 'João')).toBe(false);
    expect(isReplyToMe({}, 'João')).toBe(false);
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
