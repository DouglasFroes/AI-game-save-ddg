import { MAX_QUOTE, PAGE, type ChatMessage, type Presence, type Quote } from '../chat/core';
import type { ChatBackend } from '../chat/backend';
import { mergeMessages } from './feed';
import { ChatSocket, type SocketLike } from './socket';
import type { ApiSession } from './session';

type Unsubscribe = () => void;

/** Reads one message as the API sends it (`at` is epoch ms, `re` the quote, `r` the reactions). */
export function parseApiMessage(raw: unknown): ChatMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const d = raw as Record<string, unknown>;
  if (
    typeof d.id !== 'string' ||
    typeof d.uid !== 'string' ||
    typeof d.name !== 'string' ||
    typeof d.text !== 'string' ||
    typeof d.at !== 'number'
  )
    return null;
  const re = d.re as Record<string, unknown> | undefined;
  const r: Record<string, string> = {};
  if (d.r && typeof d.r === 'object')
    for (const [k, v] of Object.entries(d.r)) if (typeof v === 'string') r[k] = v;
  return {
    id: d.id,
    uid: d.uid,
    name: d.name,
    text: d.text,
    at: d.at,
    re:
      re && typeof re.id === 'string' && typeof re.name === 'string' && typeof re.text === 'string'
        ? { id: re.id, name: re.name, text: re.text }
        : undefined,
    r: Object.keys(r).length ? r : undefined,
    del: d.del === true,
  };
}

const parseList = (rows: unknown): ChatMessage[] =>
  (Array.isArray(rows) ? rows : [])
    .map(parseApiMessage)
    .filter((m): m is ChatMessage => m !== null);

/**
 * The chat over the API: REST to write and to load history, one WebSocket to hear about new
 * messages, reactions and who is online. Only players signed in with Google may use it.
 */
export class ApiChat implements ChatBackend {
  private readonly socket: ChatSocket;

  constructor(private readonly session: ApiSession) {
    this.socket = new ChatSocket(async () => {
      const token = await this.session.token();
      return new WebSocket(
        this.session.api.socketUrl(`/api/chat/ws?token=${encodeURIComponent(token)}`),
      ) as SocketLike;
    }, parseApiMessage);
  }

  async uid(): Promise<string | null> {
    const ok = await this.session.canSubmit().catch(() => false);
    return ok ? this.session.uid() : null;
  }

  private page(room: string, query: string): Promise<ChatMessage[]> {
    return this.session.call<unknown>(`/api/chat/rooms/${room}/messages?${query}`).then(parseList);
  }

  watchRoom(
    room: string,
    onMessages: (msgs: ChatMessage[]) => void,
    onError: (err: unknown) => void,
  ): Unsubscribe {
    let list: ChatMessage[] = [];
    let stopped = false;
    const apply = (incoming: ChatMessage[]) => {
      list = mergeMessages(list, incoming, PAGE);
      if (!stopped) onMessages(list);
    };
    const load = () => this.page(room, `limit=${PAGE}`).then((m) => !stopped && apply(m), onError);
    const stopFollow = this.socket.followRoom(room, (m) => apply([m]));
    const stopResync = this.socket.onResync(() => void load());
    void load();
    return () => {
      stopped = true;
      stopFollow();
      stopResync();
    };
  }

  loadOlder(room: string, beforeAt: number): Promise<ChatMessage[]> {
    return this.page(room, `limit=${PAGE}&before=${Math.floor(beforeAt)}`);
  }

  async send(room: string, name: string, text: string, re?: Quote): Promise<void> {
    const sent = await this.session.call<unknown>(`/api/chat/rooms/${room}/messages`, {
      method: 'POST',
      body: {
        name,
        text,
        re: re && { id: re.id, name: re.name, text: re.text.slice(0, MAX_QUOTE) },
      },
    });
    this.socket.inject(room, sent, 'message');
  }

  async react(room: string, id: string, emoji: string | null): Promise<void> {
    const updated = await this.session.call<unknown>(
      `/api/chat/rooms/${room}/messages/${id}/reaction`,
      {
        method: 'PUT',
        body: { emoji },
      },
    );
    this.socket.inject(room, updated, 'update');
  }

  async remove(room: string, id: string): Promise<void> {
    const updated = await this.session.call<unknown>(`/api/chat/rooms/${room}/messages/${id}`, {
      method: 'DELETE',
    });
    this.socket.inject(room, updated, 'update');
  }

  async report(room: string, msg: ChatMessage): Promise<void> {
    await this.session.call(`/api/chat/rooms/${room}/messages/${msg.id}/report`, {
      method: 'POST',
    });
  }

  watchPresence(onList: (list: Presence[]) => void): Unsubscribe {
    const stopFollow = this.socket.followPresence(onList);
    const load = () =>
      this.session.call<Presence[]>('/api/chat/presence').then(onList, () => onList([]));
    const stopResync = this.socket.onResync(() => void load());
    void load();
    return () => {
      stopFollow();
      stopResync();
    };
  }

  async heartbeat(name: string, game: string, typing: string): Promise<void> {
    await this.session.call('/api/chat/presence', {
      method: 'POST',
      body: { name, g: game, typing },
    });
  }

  watchSince(room: string, sinceMs: number, onNew: (msgs: ChatMessage[]) => void): Unsubscribe {
    let list: ChatMessage[] = [];
    let stopped = false;
    const apply = (incoming: ChatMessage[]) => {
      list = mergeMessages(
        list,
        incoming.filter((m) => m.at > sinceMs),
        30,
      );
      if (!stopped) onNew(list);
    };
    const load = () =>
      this.page(room, `limit=30&since=${Math.floor(sinceMs)}`).then(apply, () => onNew([]));
    const stopFollow = this.socket.followRoom(room, (m) => apply([m]));
    const stopResync = this.socket.onResync(() => void load());
    void load();
    return () => {
      stopped = true;
      stopFollow();
      stopResync();
    };
  }
}
