/** Minimal key/value port so persistence can be swapped (localStorage in the browser, memory in tests). */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export class MemoryStore implements KeyValueStore {
  private readonly map = new Map<string, string>();

  get(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.map.set(key, value);
  }
}

/** localStorage can throw (private mode, blocked storage) — never let that break the game. */
export class BrowserStore implements KeyValueStore {
  private readonly fallback = new MemoryStore();

  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key) ?? this.fallback.get(key);
    } catch {
      return this.fallback.get(key);
    }
  }

  set(key: string, value: string): void {
    this.fallback.set(key, value);
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* storage unavailable: memory fallback keeps the session working */
    }
  }
}

export function readJson<T>(store: KeyValueStore, key: string): T | null {
  const raw = store.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJson(store: KeyValueStore, key: string, value: unknown): void {
  store.set(key, JSON.stringify(value));
}

export const createId = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
