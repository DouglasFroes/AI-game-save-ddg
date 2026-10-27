import type { IconKind } from '@/platform/ui/icons';

export type NoticeKind = 'info' | 'success' | 'warn' | 'rival';
export type NoticeCategory = 'ranking' | 'chat' | 'system';

export interface NoticeAction {
  label: string;
  run: () => void;
}

/** An in-app notification: a card with an icon, a title, optional detail and tap actions. */
export interface AppNotice {
  /** Same key = same notice: a newer one replaces an older one that has not been shown yet. */
  key: string;
  title: string;
  body?: string;
  kind?: NoticeKind;
  /** Category for the notification center filter and banner pill. */
  category?: NoticeCategory;
  /** Optional game ID associated with this notice (enables "Jogar" / "Ver ranking" in the inbox). */
  gameId?: string;
  /** Optional chat room associated with this notice (enables "Abrir chat" in the inbox). */
  chatRoom?: string;
  /** True for short-lived toasts (e.g. "Link copiado") that should not be saved in history. */
  ephemeral?: boolean;
  /** Higher priority notices survive queue overflow ahead of lower priority ones. */
  priority?: number;
  /** Texture key of a game icon; takes priority over `glyph`. */
  texture?: string;
  glyph?: IconKind;
  /** Tapping the card runs the first action; each action also gets its own button. */
  actions?: NoticeAction[];
  /** Stays a little longer on screen (for things the player may want to act on). */
  sticky?: boolean;
  /** Runs when the card appears (e.g. a sound). */
  onShow?: () => void;
}

export interface NoticeHistoryItem {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly body?: string;
  readonly kind: NoticeKind;
  readonly category: NoticeCategory;
  readonly glyph?: IconKind;
  readonly gameId?: string;
  readonly chatRoom?: string;
  readonly at: number;
  readonly read: boolean;
}

/** FIFO of keyed items: pushing an existing key replaces it in place instead of repeating it. */
export class NoticeQueue<T extends { key: string; priority?: number }> {
  private items: T[] = [];

  constructor(private readonly max = 6) {}

  push(item: T): void {
    const at = this.items.findIndex((i) => i.key === item.key);
    if (at >= 0) this.items[at] = item;
    else this.items.push(item);
    while (this.items.length > this.max) {
      let dropIdx = 0;
      let minPriority = this.items[0]?.priority ?? 0;
      for (let i = 1; i < this.items.length; i++) {
        const p = this.items[i]?.priority ?? 0;
        if (p < minPriority) {
          minPriority = p;
          dropIdx = i;
        }
      }
      this.items.splice(dropIdx, 1);
    }
  }

  shift(): T | undefined {
    return this.items.shift();
  }

  remove(key: string): void {
    this.items = this.items.filter((i) => i.key !== key);
  }

  has(key: string): boolean {
    return this.items.some((i) => i.key === key);
  }

  get size(): number {
    return this.items.length;
  }
}

export function inferNoticeCategory(
  notice: Pick<AppNotice, 'category' | 'kind' | 'key' | 'gameId' | 'chatRoom' | 'glyph'>,
): NoticeCategory {
  if (notice.category) return notice.category;
  if (
    notice.kind === 'rival' ||
    notice.key.startsWith('rival:') ||
    notice.key === 'synced' ||
    Boolean(notice.gameId)
  ) {
    return 'ranking';
  }
  if (
    Boolean(notice.chatRoom) ||
    notice.key.startsWith('mention-') ||
    notice.key.startsWith('reply-') ||
    notice.glyph === 'chat'
  ) {
    return 'chat';
  }
  return 'system';
}

export function isEphemeralNotice(notice: Pick<AppNotice, 'key' | 'ephemeral'>): boolean {
  if (notice.ephemeral !== undefined) return notice.ephemeral;
  return (
    notice.key.startsWith('toast:') || notice.key === 'share' || notice.key === 'connection-online'
  );
}

// ── Persistent Notification History (Inbox) ───────────────────────────────

const HISTORY_KEY = 'arcade.notices.history.v1';
const BROWSER_NOTIFY_KEY = 'arcade.notices.browser.v1';
const MAX_HISTORY = 30;

let memoryHistory: NoticeHistoryItem[] | null = null;
const historyListeners = new Set<() => void>();

function loadHistory(): NoticeHistoryItem[] {
  if (memoryHistory) return memoryHistory;
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          memoryHistory = parsed.filter(
            (x): x is NoticeHistoryItem =>
              typeof x === 'object' &&
              x !== null &&
              typeof (x as NoticeHistoryItem).id === 'string' &&
              typeof (x as NoticeHistoryItem).key === 'string' &&
              typeof (x as NoticeHistoryItem).title === 'string',
          );
          return memoryHistory;
        }
      }
    }
  } catch {
    /* ignore storage errors */
  }
  memoryHistory = [];
  return memoryHistory;
}

function saveHistory(items: NoticeHistoryItem[]): void {
  memoryHistory = items.slice(0, MAX_HISTORY);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(memoryHistory));
    }
  } catch {
    /* ignore storage errors */
  }
  for (const fn of historyListeners) fn();
}

/** Records a non-ephemeral notice in the player's notification center history. */
export function recordNotice(notice: AppNotice, now = Date.now()): NoticeHistoryItem | null {
  if (isEphemeralNotice(notice)) return null;
  const current = loadHistory();
  const existingIdx = current.findIndex((item) => item.key === notice.key);
  if (existingIdx >= 0) {
    const prev = current[existingIdx]!;
    // Avoid duplicate re-recording when publishNotice -> showNotice happens right away.
    if (
      prev.title === notice.title &&
      prev.body === notice.body &&
      Math.abs(now - prev.at) < 2500
    ) {
      return prev;
    }
  }

  const gameId =
    notice.gameId ?? (notice.key.startsWith('rival:') ? notice.key.slice(6) : undefined);
  const entry: NoticeHistoryItem = {
    id: `${notice.key}:${now.toString(36)}`,
    key: notice.key,
    title: notice.title,
    body: notice.body,
    kind: notice.kind ?? 'info',
    category: inferNoticeCategory(notice),
    glyph: notice.glyph,
    gameId,
    chatRoom: notice.chatRoom,
    at: now,
    read: false,
  };

  const filtered = current.filter((item) => item.key !== notice.key);
  saveHistory([entry, ...filtered]);
  return entry;
}

export function listNoticeHistory(): NoticeHistoryItem[] {
  return [...loadHistory()];
}

export function unreadNoticeCount(): number {
  return loadHistory().reduce((acc, item) => acc + (item.read ? 0 : 1), 0);
}

export function markNoticeRead(id: string): void {
  const current = loadHistory();
  let changed = false;
  const next = current.map((item) => {
    if (item.id === id && !item.read) {
      changed = true;
      return { ...item, read: true };
    }
    return item;
  });
  if (changed) saveHistory(next);
}

export function markAllNoticesRead(): void {
  const current = loadHistory();
  if (!current.some((i) => !i.read)) return;
  saveHistory(current.map((item) => (item.read ? item : { ...item, read: true })));
}

export function removeNoticeHistory(id: string): void {
  const current = loadHistory();
  const next = current.filter((item) => item.id !== id);
  if (next.length !== current.length) saveHistory(next);
}

export function clearNoticeHistory(): void {
  saveHistory([]);
}

export function onNoticeHistoryChange(fn: () => void): () => void {
  historyListeners.add(fn);
  return () => historyListeners.delete(fn);
}

// ── Browser Web Notification API (Background Tab Alerts) ──────────────────

export function browserNotificationState(): 'unsupported' | 'default' | 'granted' | 'denied' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export function isBrowserNotifyEnabled(): boolean {
  if (browserNotificationState() !== 'granted') return false;
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(BROWSER_NOTIFY_KEY) === '1';
  } catch {
    return false;
  }
}

export async function setBrowserNotifyEnabled(on: boolean): Promise<boolean> {
  if (browserNotificationState() === 'unsupported') return false;
  if (!on) {
    try {
      localStorage.setItem(BROWSER_NOTIFY_KEY, '0');
    } catch {
      /* ignore */
    }
    for (const fn of historyListeners) fn();
    return false;
  }
  let perm = Notification.permission;
  if (perm === 'default') {
    try {
      perm = await Notification.requestPermission();
    } catch {
      return false;
    }
  }
  const granted = perm === 'granted';
  try {
    localStorage.setItem(BROWSER_NOTIFY_KEY, granted ? '1' : '0');
  } catch {
    /* ignore */
  }
  for (const fn of historyListeners) fn();
  return granted;
}

export function notifyBrowserIfHidden(notice: AppNotice): void {
  if (isEphemeralNotice(notice)) return;
  if (typeof document === 'undefined' || document.visibilityState !== 'hidden') return;
  if (!isBrowserNotifyEnabled()) return;
  try {
    const n = new Notification(notice.title, {
      body: notice.body ?? 'Toque para voltar ao Fliper.',
      tag: notice.key,
    });
    n.onclick = () => {
      window.focus();
      n.close();
      notice.actions?.[0]?.run();
    };
  } catch {
    /* ignore environments where Notification constructor is restricted */
  }
}

// ── App-wide bus ──────────────────────────────────────────────────────────
// Things that happen outside any scene (update ready, went offline, records synced) are published
// here. The hub shows them; while the player is inside a game they wait, so a match is never
// interrupted.

const pending = new NoticeQueue<AppNotice>(6);
let listener: ((notice: AppNotice) => void) | null = null;

export function publishNotice(notice: AppNotice): void {
  recordNotice(notice);
  notifyBrowserIfHidden(notice);
  if (listener) listener(notice);
  else pending.push(notice);
}

/** True when a notice with `key` is still waiting in the queue and has not been delivered yet. */
export function isNoticePending(key: string): boolean {
  return pending.has(key);
}

/** Drops a notice that was never shown (e.g. "offline" once the connection is back). */
export function retractNotice(key: string): void {
  const wasPending = pending.has(key);
  pending.remove(key);
  if (wasPending) {
    const current = loadHistory();
    const next = current.filter((item) => item.key !== key);
    if (next.length !== current.length) saveHistory(next);
  }
}

/** Starts receiving notices (waiting ones arrive first). Returns the unsubscribe function. */
export function subscribeNotices(fn: (notice: AppNotice) => void): () => void {
  listener = fn;
  for (let n = pending.shift(); n; n = pending.shift()) fn(n);
  return () => {
    if (listener === fn) listener = null;
  };
}
