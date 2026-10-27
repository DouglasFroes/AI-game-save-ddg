import type * as Firestore from 'firebase/firestore';
import type { FirebaseSession } from '@/platform/firebaseSession';
import { MAX_QUOTE, PAGE, type ChatMessage, type Presence, type Quote } from './core';

type Unsubscribe = () => void;

/** Where the chat lives. The Firestore implementation is the real one; tests use fakes. */
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

interface Conn {
  readonly fs: typeof Firestore;
  readonly db: Firestore.Firestore;
}

const PRESENCE_WINDOW_MS = 10 * 60_000;

function toMillis(v: unknown): number {
  if (v && typeof v === 'object' && 'toMillis' in v)
    return (v as { toMillis(): number }).toMillis();
  return Date.now();
}

export function parseMessage(
  id: string,
  d: Record<string, unknown>,
  pending = false,
): ChatMessage | null {
  if (typeof d.uid !== 'string' || typeof d.name !== 'string' || typeof d.text !== 'string')
    return null;
  const re = d.re as Record<string, unknown> | undefined;
  const r = d.r && typeof d.r === 'object' ? (d.r as Record<string, unknown>) : undefined;
  const reactions: Record<string, string> = {};
  if (r) for (const [k, v] of Object.entries(r)) if (typeof v === 'string') reactions[k] = v;
  return {
    id,
    uid: d.uid,
    name: d.name,
    text: d.text,
    at: toMillis(d.at),
    re:
      re && typeof re.id === 'string' && typeof re.name === 'string' && typeof re.text === 'string'
        ? { id: re.id, name: re.name, text: re.text }
        : undefined,
    r: r ? reactions : undefined,
    del: d.del === true,
    pending,
  };
}

/**
 * Firestore (full SDK, for live listeners) — loaded only when the chat is used:
 *   chat_rooms/{room}/messages/{id}   the messages
 *   chat_users/{uid}                  time of the player's last message (server-side flood limit)
 *   presence/{uid}                    heartbeat: who is online, what they play, who is typing
 *   chat_reports/{id}                 reports for moderation
 * firestore.rules let only players signed in with Google read or write any of it.
 */
export class FirestoreChat implements ChatBackend {
  private conn: Promise<Conn> | null = null;

  constructor(private readonly session: FirebaseSession) {}

  private connect(): Promise<Conn> {
    this.conn ??= (async () => {
      const [{ app }, fs] = await Promise.all([
        this.session.connect(),
        import('firebase/firestore'),
      ]);
      return { fs, db: fs.getFirestore(app) };
    })().catch((err: unknown) => {
      this.conn = null;
      throw err;
    });
    return this.conn;
  }

  async uid(): Promise<string | null> {
    const ok = await this.session.canSubmit().catch(() => false);
    return ok ? this.session.uid() : null;
  }

  /** Runs `start` once connected; the returned function stops it whenever it is called. */
  private live(start: (c: Conn) => Unsubscribe, onError?: (err: unknown) => void): Unsubscribe {
    let stop: Unsubscribe | null = null;
    let stopped = false;
    void this.connect().then(
      (c) => {
        if (!stopped) stop = start(c);
      },
      (err) => onError?.(err),
    );
    return () => {
      stopped = true;
      stop?.();
    };
  }

  private messages(c: Conn, room: string) {
    return c.fs.collection(c.db, 'chat_rooms', room, 'messages');
  }

  private parse(snap: Firestore.QuerySnapshot): ChatMessage[] {
    return snap.docs
      .map((d) =>
        parseMessage(d.id, d.data({ serverTimestamps: 'estimate' }), d.metadata.hasPendingWrites),
      )
      .filter((m): m is ChatMessage => m !== null)
      .reverse();
  }

  watchRoom(
    room: string,
    onMessages: (msgs: ChatMessage[]) => void,
    onError: (err: unknown) => void,
  ): Unsubscribe {
    return this.live((c) => {
      const q = c.fs.query(this.messages(c, room), c.fs.orderBy('at', 'desc'), c.fs.limit(PAGE));
      return c.fs.onSnapshot(
        q,
        { includeMetadataChanges: true },
        (s) => onMessages(this.parse(s)),
        onError,
      );
    }, onError);
  }

  async loadOlder(room: string, beforeAt: number): Promise<ChatMessage[]> {
    const c = await this.connect();
    const q = c.fs.query(
      this.messages(c, room),
      c.fs.orderBy('at', 'desc'),
      c.fs.where('at', '<', c.fs.Timestamp.fromMillis(beforeAt)),
      c.fs.limit(PAGE),
    );
    return this.parse(await c.fs.getDocs(q));
  }

  async send(room: string, name: string, text: string, re?: Quote): Promise<void> {
    const c = await this.connect();
    const uid = await this.session.uid();
    const { fs, db } = c;
    // One batch: the message and the sender's "last message" time, which the rules use to
    // refuse a second message within 2 seconds.
    const batch = fs.writeBatch(db);
    const msg: Record<string, unknown> = { uid, name, text, at: fs.serverTimestamp() };
    if (re) msg.re = { id: re.id, name: re.name, text: re.text.slice(0, MAX_QUOTE) };
    batch.set(fs.doc(this.messages(c, room)), msg);
    batch.set(fs.doc(db, 'chat_users', uid), { last: fs.serverTimestamp() });
    await batch.commit();
  }

  async react(room: string, id: string, emoji: string | null): Promise<void> {
    const c = await this.connect();
    const uid = await this.session.uid();
    const ref = c.fs.doc(this.messages(c, room), id);
    await c.fs.updateDoc(ref, new c.fs.FieldPath('r', uid), emoji ?? c.fs.deleteField());
  }

  async remove(room: string, id: string): Promise<void> {
    const c = await this.connect();
    await c.fs.updateDoc(c.fs.doc(this.messages(c, room), id), { text: '', del: true });
  }

  async report(room: string, msg: ChatMessage): Promise<void> {
    const c = await this.connect();
    const uid = await this.session.uid();
    await c.fs.setDoc(c.fs.doc(c.db, 'chat_reports', `${room}_${msg.id}_${uid}`), {
      by: uid,
      room,
      msg: msg.id,
      uid: msg.uid,
      at: c.fs.serverTimestamp(),
    });
  }

  watchPresence(onList: (list: Presence[]) => void): Unsubscribe {
    return this.live((c) => {
      const q = c.fs.query(
        c.fs.collection(c.db, 'presence'),
        c.fs.where('at', '>', c.fs.Timestamp.fromMillis(Date.now() - PRESENCE_WINDOW_MS)),
        c.fs.orderBy('at', 'desc'),
        c.fs.limit(60),
      );
      return c.fs.onSnapshot(
        q,
        (s) =>
          onList(
            s.docs.map((d) => {
              const v = d.data({ serverTimestamps: 'estimate' });
              return {
                uid: d.id,
                name: typeof v.name === 'string' ? v.name : '?',
                at: toMillis(v.at),
                g: typeof v.g === 'string' ? v.g : '',
                typing: typeof v.typing === 'string' ? v.typing : '',
              };
            }),
          ),
        () => onList([]),
      );
    });
  }

  async heartbeat(name: string, game: string, typing: string): Promise<void> {
    const c = await this.connect();
    const uid = await this.session.uid();
    await c.fs.setDoc(c.fs.doc(c.db, 'presence', uid), {
      name,
      g: game,
      typing,
      at: c.fs.serverTimestamp(),
    });
  }

  watchSince(room: string, sinceMs: number, onNew: (msgs: ChatMessage[]) => void): Unsubscribe {
    return this.live((c) => {
      const q = c.fs.query(
        this.messages(c, room),
        c.fs.where('at', '>', c.fs.Timestamp.fromMillis(sinceMs)),
        c.fs.orderBy('at', 'desc'),
        c.fs.limit(30),
      );
      return c.fs.onSnapshot(
        q,
        (s) => onNew(this.parse(s)),
        () => onNew([]),
      );
    });
  }
}
