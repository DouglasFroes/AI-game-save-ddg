import type { ChatMessage, Presence } from '../chat/core';

/** What the server pushes over the socket. */
export type ServerEvent =
  | { type: 'message' | 'update'; room: string; message: unknown }
  | {
      type: 'presence';
      players: Array<{ uid: string; name: string; at: number; g: string; typing: string }>;
    }
  | { type: 'resync' };

export interface SocketLike {
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
}

type Unsubscribe = () => void;

const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 30_000;

/**
 * One WebSocket shared by the whole chat. It opens when somebody follows a room (or who is
 * online), tells the server what is followed, and closes when nobody is. If the connection
 * drops it comes back on its own, and everybody is told to reload what they show.
 */
export class ChatSocket {
  private socket: SocketLike | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private delay = RETRY_MIN_MS;
  private readonly rooms = new Map<
    string,
    Set<(message: unknown, kind: 'message' | 'update') => void>
  >();
  private readonly presence = new Set<(list: Presence[]) => void>();
  private readonly resyncs = new Set<() => void>();
  private lastRooms = '';
  private lastPresence = false;

  constructor(
    private readonly open: () => Promise<SocketLike>,
    private readonly parse: (raw: unknown) => ChatMessage | null,
  ) {}

  /** Calls `fn` with every new or changed message of the room. */
  followRoom(
    room: string,
    fn: (message: ChatMessage, kind: 'message' | 'update') => void,
  ): Unsubscribe {
    const handler = (raw: unknown, kind: 'message' | 'update') => {
      const m = this.parse(raw);
      if (m) fn(m, kind);
    };
    let set = this.rooms.get(room);
    if (!set) this.rooms.set(room, (set = new Set()));
    set.add(handler);
    this.sync();
    return () => {
      set.delete(handler);
      if (!set.size) this.rooms.delete(room);
      this.sync();
    };
  }

  /** Delivers a message the server just confirmed to this client's own listeners, at once. */
  inject(room: string, message: unknown, kind: 'message' | 'update'): void {
    for (const fn of this.rooms.get(room) ?? []) fn(message, kind);
  }

  followPresence(fn: (list: Presence[]) => void): Unsubscribe {
    this.presence.add(fn);
    this.sync();
    return () => {
      this.presence.delete(fn);
      this.sync();
    };
  }

  /** Called when the connection came back (or the server fell behind): reload what you show. */
  onResync(fn: () => void): Unsubscribe {
    this.resyncs.add(fn);
    return () => this.resyncs.delete(fn);
  }

  private wanted(): boolean {
    return this.rooms.size > 0 || this.presence.size > 0;
  }

  /** Opens, closes or updates the subscription to match who follows what. */
  private sync(): void {
    if (!this.wanted()) {
      if (this.retry) clearTimeout(this.retry);
      this.retry = null;
      this.socket?.close();
      this.socket = null;
      this.lastRooms = '';
      this.lastPresence = false;
      return;
    }
    if (!this.socket) {
      if (!this.retry) void this.connect();
      return;
    }
    this.subscribe(this.socket);
  }

  private subscribe(socket: SocketLike): void {
    const rooms = [...this.rooms.keys()].sort();
    const key = rooms.join(',');
    const presence = this.presence.size > 0;
    if (key === this.lastRooms && presence === this.lastPresence) return;
    this.lastRooms = key;
    this.lastPresence = presence;
    socket.send(JSON.stringify({ op: 'sub', rooms, presence }));
  }

  private async connect(): Promise<void> {
    let socket: SocketLike;
    try {
      socket = await this.open();
    } catch {
      return this.scheduleRetry();
    }
    if (!this.wanted()) return socket.close();
    this.socket = socket;
    socket.onopen = () => {
      this.delay = RETRY_MIN_MS;
      this.lastRooms = '';
      this.lastPresence = false;
      this.subscribe(socket);
      for (const fn of this.resyncs) fn();
    };
    socket.onmessage = (e) => this.dispatch(e.data);
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (this.wanted()) this.scheduleRetry();
    };
  }

  private scheduleRetry(): void {
    if (this.retry) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      if (this.wanted() && !this.socket) void this.connect();
    }, this.delay);
    this.delay = Math.min(this.delay * 2, RETRY_MAX_MS);
  }

  private dispatch(raw: unknown): void {
    let event: ServerEvent;
    try {
      event = JSON.parse(String(raw)) as ServerEvent;
    } catch {
      return;
    }
    if (event.type === 'resync') {
      for (const fn of this.resyncs) fn();
    } else if (event.type === 'presence') {
      const list = event.players.map((p) => ({
        uid: p.uid,
        name: p.name,
        at: p.at,
        g: p.g,
        typing: p.typing,
      }));
      for (const fn of this.presence) fn(list);
    } else {
      for (const fn of this.rooms.get(event.room) ?? []) fn(event.message, event.type);
    }
  }
}
