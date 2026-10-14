import { readJson, writeJson, type KeyValueStore } from './storage';

export interface LeaderboardEntry {
  readonly id: string;
  readonly name: string;
  readonly stars: number;
  readonly deaths: number;
  readonly inkSaved: number;
  readonly score: number;
  /** ISO-8601 date of the submission. */
  readonly date: string;
}

/** Port: any ranking backend (local, REST, Supabase…) implements this. */
export interface LeaderboardRepository {
  list(): Promise<LeaderboardEntry[]>;
  submit(entry: LeaderboardEntry): Promise<void>;
}

export const MAX_NAME_LENGTH = 16;

export function sanitizeName(name: string): string {
  const clean = name
    .replace(/[\p{C}<>]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return clean || 'Anônimo';
}

/** One row per player (best score wins), sorted by score then oldest first. */
export function rankEntries(entries: readonly LeaderboardEntry[]): LeaderboardEntry[] {
  const best = new Map<string, LeaderboardEntry>();
  for (const e of entries) {
    const prev = best.get(e.id);
    if (!prev || e.score > prev.score || (e.score === prev.score && e.date > prev.date)) {
      best.set(e.id, e);
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
}

function isEntry(v: unknown): v is LeaderboardEntry {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.name === 'string' &&
    typeof e.date === 'string' &&
    ['stars', 'deaths', 'inkSaved', 'score'].every((k) => Number.isFinite(e[k]))
  );
}

export function parseEntries(raw: unknown): LeaderboardEntry[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'object' && raw !== null) {
    const entries = (raw as { entries?: unknown }).entries;
    if (Array.isArray(entries)) list = entries;
  }
  return list.filter(isEntry).map((e) => ({ ...e, name: sanitizeName(e.name) }));
}

const BOARD_KEY = 'sod.leaderboard.v2';

export class LocalLeaderboard implements LeaderboardRepository {
  constructor(
    private readonly store: KeyValueStore,
    private readonly seed: readonly LeaderboardEntry[] = [],
  ) {}

  async list(): Promise<LeaderboardEntry[]> {
    return rankEntries([...this.seed, ...parseEntries(readJson(this.store, BOARD_KEY))]);
  }

  async submit(entry: LeaderboardEntry): Promise<void> {
    const saved = parseEntries(readJson(this.store, BOARD_KEY)).filter((e) => e.id !== entry.id);
    writeJson(this.store, BOARD_KEY, [...saved, entry]);
  }
}

/**
 * Generic REST backend: GET url → entries (array or {entries}), POST url ← entry JSON.
 * Configure with VITE_LEADERBOARD_URL.
 */
export class RemoteLeaderboard implements LeaderboardRepository {
  constructor(
    private readonly url: string,
    private readonly http: typeof fetch = (...args) => fetch(...args),
    private readonly timeoutMs = 5000,
  ) {}

  async list(): Promise<LeaderboardEntry[]> {
    const res = await this.http(this.url, {
      cache: 'no-cache',
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`Ranking HTTP ${res.status}`);
    return rankEntries(parseEntries(await res.json()));
  }

  async submit(entry: LeaderboardEntry): Promise<void> {
    const res = await this.http(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`Ranking HTTP ${res.status}`);
  }
}

/** Uses the remote ranking when it answers and always keeps a local copy as fallback. */
export class ResilientLeaderboard implements LeaderboardRepository {
  /** True when the last list() came from the remote backend. */
  online = false;

  constructor(
    private readonly local: LeaderboardRepository,
    private readonly remote: LeaderboardRepository | null,
  ) {}

  get hasRemote(): boolean {
    return this.remote !== null;
  }

  async list(): Promise<LeaderboardEntry[]> {
    if (this.remote) {
      try {
        const entries = await this.remote.list();
        this.online = true;
        return entries;
      } catch (err) {
        console.warn('Ranking global indisponível, usando ranking local.', err);
      }
    }
    this.online = false;
    return this.local.list();
  }

  /** Always saves locally; rejects only if a configured remote refuses the entry. */
  async submit(entry: LeaderboardEntry): Promise<void> {
    await this.local.submit(entry);
    if (this.remote) await this.remote.submit(entry);
  }
}
