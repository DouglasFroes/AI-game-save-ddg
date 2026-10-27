import type { AccountService } from '@/platform/account';
import type { ProfileRepository } from '@/platform/profile';
import type { PlaySessionTracker } from '@/platform/sessionTracker';
import { readJson, writeJson, type KeyValueStore } from '@/platform/storage';
import type { ChatBackend } from './backend';
import { GENERAL_ROOM, mentions, pushRecent, SpamGuard, type ChatMessage } from './core';

const HEARTBEAT_MS = 60_000;
const TYPING_PING_MS = 3000;
const SEEN_KEY = 'arcade.chat.seen';
const MUTED_KEY = 'arcade.chat.muted';
const RECENT_EMOJI_KEY = 'arcade.chat.emoji';

export interface MentionEvent {
  readonly room: string;
  readonly msg: ChatMessage;
}

/**
 * The chat's long-lived side: who the player is, presence heartbeats, the unread badge and
 * mentions, muted players and what was last read. The overlay (the view) is created on demand.
 */
export class ChatService {
  private uid: string | null = null;
  private beat: ReturnType<typeof setInterval> | null = null;
  private stopUnread: (() => void) | null = null;
  private lastTypingPing = 0;
  private typingRoom = '';
  private unreadCount = 0;
  private readonly unreadListeners = new Set<(n: number) => void>();
  private readonly mentionListeners = new Set<(e: MentionEvent) => void>();
  private readonly notified = new Set<string>();
  /** Flood control, kept across openings of the chat window. */
  readonly guard = new SpamGuard();
  /** The room on screen right now (its messages are never "unread"). */
  openRoom: string | null = null;

  constructor(
    readonly backend: ChatBackend | null,
    readonly account: AccountService,
    readonly profile: ProfileRepository,
    private readonly store: KeyValueStore,
    private readonly tracker: Pick<PlaySessionTracker, 'activeGameId'>,
  ) {}

  /** The chat needs the global ranking's backend (Firebase). */
  get available(): boolean {
    return this.backend !== null && this.account.available;
  }

  get myUid(): string | null {
    return this.uid;
  }

  get name(): string {
    return this.profile.get().name || 'Jogador';
  }

  /** Starts heartbeats and the unread watch, and follows sign-ins and sign-outs. */
  start(): void {
    if (!this.available) return;
    const refresh = () => void this.refreshIdentity();
    this.account.onChange(refresh);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void this.ping();
      });
    }
    refresh();
  }

  private async refreshIdentity(): Promise<void> {
    const uid = this.backend ? await this.backend.uid().catch(() => null) : null;
    if (uid === this.uid) return;
    this.uid = uid;
    this.stopUnread?.();
    this.stopUnread = null;
    if (this.beat) clearInterval(this.beat);
    this.beat = null;
    this.setUnread(0);
    if (!uid) return;
    void this.ping();
    this.beat = setInterval(() => void this.ping(), HEARTBEAT_MS);
    this.watchUnread();
  }

  /** Presence heartbeat (skipped while the tab is hidden). */
  private async ping(typing = ''): Promise<void> {
    if (!this.uid || !this.backend) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    this.typingRoom = typing;
    await this.backend
      .heartbeat(this.name, this.tracker.activeGameId ?? '', typing)
      .catch(() => undefined);
  }

  /** Called on keystrokes: at most one "typing" ping every few seconds. */
  typing(room: string): void {
    const now = Date.now();
    if (now - this.lastTypingPing < TYPING_PING_MS) return;
    this.lastTypingPing = now;
    void this.ping(room);
  }

  stopTyping(): void {
    if (!this.typingRoom) return;
    this.lastTypingPing = 0;
    void this.ping('');
  }

  // ── Unread & mentions ───────────────────────────────────────────────────────

  private watchUnread(): void {
    if (!this.backend) return;
    const since = this.seen(GENERAL_ROOM) || Date.now() - 86_400_000;
    this.stopUnread = this.backend.watchSince(GENERAL_ROOM, since, (msgs) => {
      const fresh = msgs.filter(
        (m) => m.uid !== this.uid && m.at > this.seen(GENERAL_ROOM) && !this.isMuted(m.uid),
      );
      this.setUnread(this.openRoom === GENERAL_ROOM ? 0 : fresh.length);
      for (const m of fresh) this.checkMention(GENERAL_ROOM, m);
    });
  }

  /** Mentions of the player in any message they haven't seen yet. */
  checkMention(room: string, m: ChatMessage): void {
    if (this.notified.has(m.id) || m.uid === this.uid || m.del) return;
    if (!mentions(m.text, this.name) || m.at <= this.seen(room) || this.openRoom === room) return;
    this.notified.add(m.id);
    for (const l of this.mentionListeners) l({ room, msg: m });
  }

  get unread(): number {
    return this.unreadCount;
  }

  private setUnread(n: number): void {
    if (n === this.unreadCount) return;
    this.unreadCount = n;
    for (const l of this.unreadListeners) l(n);
  }

  onUnread(listener: (n: number) => void): () => void {
    this.unreadListeners.add(listener);
    return () => this.unreadListeners.delete(listener);
  }

  onMention(listener: (e: MentionEvent) => void): () => void {
    this.mentionListeners.add(listener);
    return () => this.mentionListeners.delete(listener);
  }

  // ── Local state ─────────────────────────────────────────────────────────────

  seen(room: string): number {
    return readJson<Record<string, number>>(this.store, SEEN_KEY)?.[room] ?? 0;
  }

  markSeen(room: string, at: number): void {
    const all = readJson<Record<string, number>>(this.store, SEEN_KEY) ?? {};
    if ((all[room] ?? 0) >= at) return;
    all[room] = at;
    writeJson(this.store, SEEN_KEY, all);
    if (room === GENERAL_ROOM) this.setUnread(0);
  }

  muted(): Record<string, string> {
    return readJson<Record<string, string>>(this.store, MUTED_KEY) ?? {};
  }

  isMuted(uid: string): boolean {
    return uid in this.muted();
  }

  mute(uid: string, name: string, on: boolean): void {
    const all = this.muted();
    if (on) all[uid] = name;
    else delete all[uid];
    writeJson(this.store, MUTED_KEY, all);
  }

  recentEmojis(): string[] {
    return readJson<string[]>(this.store, RECENT_EMOJI_KEY) ?? [];
  }

  useEmoji(e: string): void {
    writeJson(this.store, RECENT_EMOJI_KEY, pushRecent(this.recentEmojis(), e));
  }
}
