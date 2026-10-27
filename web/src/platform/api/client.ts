/** Where the Fliper API lives and who the player is, for every request. */
export interface ApiSettings {
  /** Base URL without a trailing slash; '' means the same origin that serves the game. */
  readonly baseUrl: string;
  /** OAuth client id of the Google sign-in. */
  readonly googleClientId: string;
}

/** The API is on when a Google client id is set (the ranking needs sign-in). */
export function readApiSettings(env: Record<string, unknown>): ApiSettings | null {
  const get = (k: string) => {
    const v = env[k];
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  };
  const googleClientId = get('VITE_GOOGLE_CLIENT_ID');
  if (!googleClientId) return null;
  return { baseUrl: (get('VITE_API_URL') ?? '').replace(/\/+$/, ''), googleClientId };
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Tempo esgotado (${ms}ms)`)), ms);
    promise.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e: unknown) => (clearTimeout(t), reject(e)),
    );
  });
}

/** A response the server refused. `status` 0 means it never answered (offline, timeout). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly body?: unknown;
  readonly token?: string | null;
  readonly timeoutMs?: number;
}

/** Thin typed wrapper over `fetch`: JSON in, JSON out, errors as `ApiError`. */
export class ApiClient {
  constructor(
    readonly settings: ApiSettings,
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}

  url(path: string): string {
    return `${this.settings.baseUrl}${path}`;
  }

  /** `ws://` / `wss://` address of an API path (the base may be relative to this page). */
  socketUrl(path: string, origin: string = globalThis.location?.origin ?? ''): string {
    const base = this.settings.baseUrl || origin;
    return `${base.replace(/^http/, 'ws')}${path}`;
  }

  async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
    try {
      const headers: Record<string, string> = {};
      if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
      if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
      const res = await this.fetcher(this.url(path), {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: controller.signal,
      });
      if (res.status === 204) return undefined as T;
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message = (data as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
        throw new ApiError(res.status, message);
      }
      return data as T;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(0, 'Sem conexão com o servidor.');
    } finally {
      clearTimeout(timer);
    }
  }
}
