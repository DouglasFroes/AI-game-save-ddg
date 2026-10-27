import type { ChatMessage, Presence, Quote } from './core';

type Unsubscribe = () => void;

/** Where the chat lives. `api/chat.ts` is the real one; tests use fakes. */
export interface ChatBackend {
  /** The signed-in (Google) player's uid, or null: only they may use the chat. */
  uid(): Promise<string | null>;
  /** The latest messages of a room, live (oldest first). */
  watchRoom(
    room: string,
    onMessages: (msgs: ChatMessage[]) => void,
    onError: (err: unknown) => void,
  ): Unsubscribe;
  /** A page of messages older than `beforeAt` (oldest first). */
  loadOlder(room: string, beforeAt: number): Promise<ChatMessage[]>;
  send(room: string, name: string, text: string, re?: Quote): Promise<void>;
  /** Sets (or with null removes) the player's reaction on a message. */
  react(room: string, id: string, emoji: string | null): Promise<void>;
  /** Clears the text of one of the player's own messages. */
  remove(room: string, id: string): Promise<void>;
  report(room: string, msg: ChatMessage): Promise<void>;
  /** Players seen in the last few minutes, live. */
  watchPresence(onList: (list: Presence[]) => void): Unsubscribe;
  heartbeat(name: string, game: string, typing: string): Promise<void>;
  /** Live count of messages newer than `sinceMs` in a room (for the unread badge). */
  watchSince(room: string, sinceMs: number, onNew: (msgs: ChatMessage[]) => void): Unsubscribe;
}
