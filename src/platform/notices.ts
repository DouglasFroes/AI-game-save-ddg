import type { IconKind } from '@/platform/ui/icons';

export type NoticeKind = 'info' | 'success' | 'warn' | 'rival';

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

/** FIFO of keyed items: pushing an existing key replaces it in place instead of repeating it. */
export class NoticeQueue<T extends { key: string }> {
  private items: T[] = [];

  constructor(private readonly max = 6) {}

  push(item: T): void {
    const at = this.items.findIndex((i) => i.key === item.key);
    if (at >= 0) this.items[at] = item;
    else this.items.push(item);
    while (this.items.length > this.max) this.items.shift();
  }

  shift(): T | undefined {
    return this.items.shift();
  }

  remove(key: string): void {
    this.items = this.items.filter((i) => i.key !== key);
  }

  get size(): number {
    return this.items.length;
  }
}

// ── App-wide bus ──────────────────────────────────────────────────────────
// Things that happen outside any scene (update ready, went offline, records synced) are published
// here. The hub shows them; while the player is inside a game they wait, so a match is never
// interrupted.

const pending = new NoticeQueue<AppNotice>(5);
let listener: ((notice: AppNotice) => void) | null = null;

export function publishNotice(notice: AppNotice): void {
  if (listener) listener(notice);
  else pending.push(notice);
}

/** Drops a notice that was never shown (e.g. "offline" once the connection is back). */
export function retractNotice(key: string): void {
  pending.remove(key);
}

/** Starts receiving notices (waiting ones arrive first). Returns the unsubscribe function. */
export function subscribeNotices(fn: (notice: AppNotice) => void): () => void {
  listener = fn;
  for (let n = pending.shift(); n; n = pending.shift()) fn(n);
  return () => {
    if (listener === fn) listener = null;
  };
}
