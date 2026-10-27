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

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
}

export interface Totals {
  players: number;
  google_players: number;
  active_today: number;
  active_7d: number;
  active_30d?: number;
  sessions: number;
  play_seconds: number;
  entries: number;
  messages: number;
  open_reports: number;
  games_played?: number;
}

export interface GameStats {
  game_id: string;
  sessions: number;
  play_seconds: number;
  players: number;
  best_score: number;
  entries?: number;
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
  top_players?: PlayerSummary[];
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

export interface SessionsPage extends Page<PlaySession> {
  total_seconds: number;
  unique_players: number;
}

export interface PlayerSummary {
  id: string;
  name: string | null;
  email: string | null;
  google: boolean;
  sessions: number;
  play_seconds: number;
  entries: number;
  messages?: number;
  favorite_game?: string | null;
  created_at: string;
  last_seen_at: string;
}

export interface PlayerGameStats {
  game_id: string;
  sessions: number;
  play_seconds: number;
  best_score: number;
  last_played_at: string;
}

export interface Entry {
  id: string;
  game_id?: string;
  player: string;
  name: string;
  score: number;
  details: Record<string, number>;
  date: string;
  rank?: number;
}

export interface AdminMessage {
  id: string;
  room: string;
  player_id: string;
  name: string;
  text: string;
  deleted: boolean;
  reports: number;
  created_at: string;
}

export interface PlayerDetail {
  player: PlayerSummary;
  games: PlayerGameStats[];
  recent_sessions: PlaySession[];
  entries: Entry[];
  recent_messages: AdminMessage[];
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

export interface Presence {
  uid: string;
  name: string;
  at: number;
  g: string;
  typing: string;
}

export interface LivePulse {
  sessions_5m: number;
  sessions_15m: number;
  sessions_60m: number;
  active_players_15m: number;
  active_players_60m: number;
  entries_60m: number;
  messages_60m: number;
  errors_24h: number;
}

export interface FunnelStats {
  total_players: number;
  played_1: number;
  played_5: number;
  google_linked: number;
  ranked: number;
  chatted: number;
}

export interface RetentionStats {
  returning_players: number;
  multi_session_players: number;
  d1_eligible: number;
  d1_retained: number;
  d7_eligible: number;
  d7_retained: number;
  d30_eligible: number;
  d30_retained: number;
}

export interface HourlyCell {
  dow: number;
  hour: number;
  sessions: number;
  players: number;
}

export interface GameHealthRow {
  game_id: string;
  sessions: number;
  short_sessions: number;
  avg_duration_sec: number;
  max_duration_sec: number;
  avg_score: number;
  max_score: number;
}

export interface AnomalyRow {
  entry_id: string;
  game_id: string;
  player_id: string;
  player_name: string;
  score: number;
  max_session_score: number | null;
  session_count: number;
  min_duration_sec: number | null;
  reason: string;
  severity: string;
  created_at: string;
}

export interface ServerMetrics {
  started_at: string;
  uptime_sec: number;
  ws_subscribers: number;
  online_players: number;
  requests_total: number;
  requests_api: number;
  status_2xx: number;
  status_4xx: number;
  status_429: number;
  status_5xx: number;
  avg_latency_ms: number;
  max_latency_ms: number;
}

export interface TableStat {
  table_name: string;
  rows: number;
  size_bytes: number;
}

export interface DbHealth {
  database_size_bytes: number;
  pool_size: number;
  pool_idle: number;
  tables: TableStat[];
}

export interface ErrorGroupRow {
  kind: string;
  message: string;
  game_id: string;
  occurrences: number;
  affected_players: number;
  last_seen_at: string;
}

export interface ClientErrorRow {
  id: number;
  player_id: string | null;
  kind: string;
  message: string;
  stack: string;
  game_id: string;
  url: string;
  user_agent: string;
  created_at: string;
}

export interface MonitoringSnapshot {
  live: LivePulse;
  online_players: Presence[];
  recent_sessions: PlaySession[];
  funnel: FunnelStats;
  retention: RetentionStats;
  heatmap: HourlyCell[];
  game_health: GameHealthRow[];
  anomalies: AnomalyRow[];
  server: ServerMetrics;
  db: DbHealth;
  error_groups: ErrorGroupRow[];
}

export interface Session {
  token: string;
  playerId?: string;
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
