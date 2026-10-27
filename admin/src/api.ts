const TOKEN_KEY = 'fliper.admin.token';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const token = {
  get: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (value: string | null): void => {
    try {
      if (value) localStorage.setItem(TOKEN_KEY, value);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private mode: the session lasts until the tab closes */
    }
  },
};

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const t = token.get();
  const res = await fetch(path, {
    method,
    headers: {
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    throw new ApiError(0, 'Sem conexão com o servidor.');
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `HTTP ${res.status}`);
  return data as T;
}

export interface Totals {
  players: number;
  google_players: number;
  active_today: number;
  active_7d: number;
  sessions: number;
  play_seconds: number;
  entries: number;
  messages: number;
  open_reports: number;
}
export interface GameStats {
  game_id: string;
  sessions: number;
  play_seconds: number;
  players: number;
  best_score: number;
  last_played_at: string | null;
}
export interface DayStats {
  day: string;
  sessions: number;
  play_seconds: number;
  players: number;
}
export interface Overview {
  totals: Totals;
  games: GameStats[];
  daily: DayStats[];
}
export interface PlaySession {
  id: string;
  playerId: string;
  playerName: string;
  gameId: string;
  durationSec: number;
  score: number;
  startedAt: string;
  endedAt: string;
}
export interface PlayerSummary {
  id: string;
  name: string | null;
  email: string | null;
  google: boolean;
  sessions: number;
  play_seconds: number;
  entries: number;
  created_at: string;
  last_seen_at: string;
}
export interface Entry {
  id: string;
  player: string;
  name: string;
  score: number;
  details: Record<string, number>;
  date: string;
}
export interface Report {
  id: number;
  room: string;
  message_id: string;
  author_id: string;
  author_name: string;
  text: string;
  deleted: boolean;
  reports: number;
  last_reported_at: string;
}

interface Session {
  token: string;
  google: boolean;
  account: { email: string; name: string } | null;
}

/** Google sign-in (Identity Services, loaded on demand): returns the API session. */
export async function signInWithGoogle(clientId: string): Promise<Session> {
  await new Promise<void>((resolve, reject) => {
    if (window.google) return resolve();
    const el = document.createElement('script');
    el.src = 'https://accounts.google.com/gsi/client';
    el.onload = () => resolve();
    el.onerror = () => reject(new ApiError(0, 'Não foi possível carregar o login do Google.'));
    document.head.append(el);
  });
  const accessToken = await new Promise<string>((resolve, reject) => {
    window
      .google!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'openid email profile',
        callback: (r) => (r.access_token ? resolve(r.access_token) : reject(new ApiError(0, 'Login cancelado.'))),
        error_callback: () => reject(new ApiError(0, 'Login cancelado.')),
      })
      .requestAccessToken({ prompt: 'select_account' });
  });
  const session = await api<Session>('/api/auth/google', 'POST', { accessToken });
  token.set(session.token);
  return session;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (r: { access_token?: string }) => void;
            error_callback: () => void;
          }): { requestAccessToken(o?: { prompt?: string }): void };
        };
      };
    };
  }
}
