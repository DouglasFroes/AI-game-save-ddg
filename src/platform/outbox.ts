import { readJson, writeJson, type KeyValueStore } from './storage';

/**
 * A persistent queue of things that still have to reach the server (scores, play sessions).
 * It survives reloads, so what was played offline is sent the next time the device is online.
 */
export class Outbox<T> {
  private flushing: Promise<number> | null = null;

  constructor(
    private readonly store: KeyValueStore,
    private readonly key: string,
    /** Oldest items are dropped past this size so a long offline streak can't fill the storage. */
    private readonly max = 200,
  ) {}

  list(): T[] {
    const raw = readJson<unknown[]>(this.store, this.key);
    return Array.isArray(raw) ? (raw as T[]) : [];
  }

  get size(): number {
    return this.list().length;
  }

  /** `replaces` drops queued items the new one supersedes (e.g. a campaign total). */
  add(item: T, replaces?: (queued: T) => boolean): void {
    const kept = replaces ? this.list().filter((q) => !replaces(q)) : this.list();
    writeJson(this.store, this.key, [...kept, item].slice(-this.max));
  }

  /**
   * Sends the queued items in order, dropping each one once `send` resolves, and stops at the first
   * failure (the connection is probably gone). Concurrent calls share one run. Returns how many went.
   */
  drain(send: (item: T) => Promise<void>): Promise<number> {
    this.flushing ??= (async () => {
      let sent = 0;
      try {
        for (const item of this.list()) {
          await send(item);
          // Re-read and match by content: the queue may have changed while this one was in flight.
          const sentJson = JSON.stringify(item);
          const left = this.list();
          const at = left.findIndex((q) => JSON.stringify(q) === sentJson);
          if (at >= 0) left.splice(at, 1);
          writeJson(this.store, this.key, left);
          sent++;
        }
      } catch (err) {
        console.warn('Sincronização pendente: sem conexão, tentaremos de novo.', err);
      }
      return sent;
    })().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }
}
