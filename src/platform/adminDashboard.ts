import { GAMES, getGame, type GameId } from '@/games/registry';
import { formatNumber } from './ranking';
import {
  buildDashboardReport,
  formatDuration,
  type DashboardReport,
  type PlaySession,
  type ResilientTelemetry,
  type UserStatsSummary,
} from './telemetry';

const ADMIN_AUTH_KEY = 'arcade.admin.auth.v1';

/**
 * Checks whether the current URL requests the Admin Dashboard (`/ch`, `/ch/`, `?ch`, `#/ch`).
 */
export function isAdminRoute(
  loc: Pick<Location, 'pathname' | 'search' | 'hash'> = window.location,
): boolean {
  const path = loc.pathname.replace(/\/+$/, '');
  if (path === '/ch' || path.endsWith('/ch')) return true;
  const params = new URLSearchParams(loc.search);
  if (params.has('ch') || params.has('admin')) return true;
  const hash = loc.hash.replace(/^#\/?/, '').replace(/\/+$/, '');
  return hash === 'ch';
}

export function readAdminPassword(env: Record<string, unknown> = import.meta.env): string | null {
  const v = env.VITE_ADMIN_PASSWORD;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** Formats an ISO date into a concise pt-BR date/time string. */
export function formatDateTimePt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Converts sessions to CSV string for spreadsheet analysis. */
export function sessionsToCsv(sessions: readonly PlaySession[]): string {
  const header = [
    'id',
    'playerId',
    'playerName',
    'gameId',
    'gameTitle',
    'durationSec',
    'durationFormatted',
    'score',
    'startedAt',
    'endedAt',
  ];
  const escape = (val: string | number) => {
    const s = String(val).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const rows = sessions.map((s) => {
    const g = getGame(s.gameId);
    return [
      s.id,
      s.playerId,
      s.playerName,
      s.gameId,
      g.title,
      s.durationSec,
      formatDuration(s.durationSec),
      s.score,
      s.startedAt,
      s.endedAt,
    ]
      .map(escape)
      .join(',');
  });
  return [header.join(','), ...rows].join('\n');
}

type TabId = 'overview' | 'users' | 'games' | 'sessions';
type UserSortKey = 'time' | 'sessions' | 'recent' | 'name';
type GameSortKey = 'time' | 'sessions' | 'players' | 'avg';

interface DashboardState {
  tab: TabId;
  userSearch: string;
  userSort: UserSortKey;
  selectedUserId: string | null;
  gameSearch: string;
  gameSort: GameSortKey;
  sessionFilterGame: string;
  loading: boolean;
  sessions: PlaySession[];
  report: DashboardReport;
  lastUpdated: Date | null;
}

const ALL_GAME_IDS: readonly GameId[] = GAMES.map((g) => g.id);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hexColor(num: number): string {
  return `#${num.toString(16).padStart(6, '0')}`;
}

function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Renders the full-featured `/ch` Admin Dashboard into `#game`.
 */
export async function mountAdminDashboard(
  telemetry: ResilientTelemetry,
  env: Record<string, unknown> = import.meta.env,
): Promise<void> {
  injectAdminStyles();
  const root = document.getElementById('game') ?? document.body;
  document.body.style.overflow = 'auto';
  document.documentElement.style.overflow = 'auto';
  document.body.style.userSelect = 'text';
  document.body.style.webkitUserSelect = 'text';

  const requiredPassword = readAdminPassword(env);
  if (requiredPassword && sessionStorage.getItem(ADMIN_AUTH_KEY) !== requiredPassword) {
    const ok = await promptAdminPassword(root, requiredPassword);
    if (!ok) return;
    sessionStorage.setItem(ADMIN_AUTH_KEY, requiredPassword);
  }

  const state: DashboardState = {
    tab: 'overview',
    userSearch: '',
    userSort: 'time',
    selectedUserId: null,
    gameSearch: '',
    gameSort: 'time',
    sessionFilterGame: 'all',
    loading: true,
    sessions: [],
    report: buildDashboardReport([], ALL_GAME_IDS),
    lastUpdated: null,
  };

  const refreshData = async () => {
    state.loading = true;
    render();
    const sessions = await telemetry.listAll(3000);
    state.sessions = sessions;
    state.report = buildDashboardReport(sessions, ALL_GAME_IDS);
    state.lastUpdated = new Date();
    state.loading = false;
    render();
  };

  const render = () => {
    const r = state.report;
    const sourceBadge = telemetry.hasRemote
      ? telemetry.online
        ? '<span class="ch-badge ch-badge-online">🌎 Global (Firebase + Local)</span>'
        : '<span class="ch-badge ch-badge-warn">⚠️ Firebase offline (exibindo cache local)</span>'
      : '<span class="ch-badge ch-badge-local">📱 Dados locais deste aparelho</span>';

    const updatedText = state.lastUpdated
      ? `Atualizado às ${state.lastUpdated.toLocaleTimeString('pt-BR')}`
      : 'Carregando dados...';

    root.innerHTML = `
      <div class="ch-shell">
        <header class="ch-header">
          <div class="ch-brand">
            <div class="ch-logo">🕹️</div>
            <div>
              <h1>Fliper · Painel Admin <span class="ch-route-pill">/ch</span></h1>
              <div class="ch-sub">
                ${sourceBadge}
                <span class="ch-updated">${escapeHtml(updatedText)}</span>
              </div>
            </div>
          </div>
          <div class="ch-actions">
            <button class="ch-btn ch-btn-secondary" data-action="refresh" ${state.loading ? 'disabled' : ''}>
              ${state.loading ? '⏳ Carregando...' : '↻ Atualizar'}
            </button>
            <button class="ch-btn ch-btn-secondary" data-action="export-csv">📥 Exportar CSV</button>
            <button class="ch-btn ch-btn-secondary" data-action="export-json">📦 Exportar JSON</button>
            <a class="ch-btn ch-btn-primary" href="${escapeHtml(getArcadeHomeHref())}">🎮 Ir para o Jogo</a>
          </div>
        </header>

        <section class="ch-kpi-grid">
          <div class="ch-kpi-card">
            <div class="ch-kpi-label">👥 Total de Usuários</div>
            <div class="ch-kpi-value">${formatNumber(r.totalUsers)}</div>
            <div class="ch-kpi-foot">Ativos hoje: <strong>${formatNumber(r.activeUsersToday)}</strong> · 7 dias: <strong>${formatNumber(r.activeUsers7d)}</strong></div>
          </div>
          <div class="ch-kpi-card">
            <div class="ch-kpi-label">⏱️ Tempo Total Jogado</div>
            <div class="ch-kpi-value">${formatDuration(r.totalPlayTimeSec)}</div>
            <div class="ch-kpi-foot">Média de <strong>${formatDuration(r.avgTimePerUserSec)}</strong> por usuário</div>
          </div>
          <div class="ch-kpi-card">
            <div class="ch-kpi-label">🎮 Total de Partidas</div>
            <div class="ch-kpi-value">${formatNumber(r.totalSessions)}</div>
            <div class="ch-kpi-foot">Duração média: <strong>${formatDuration(r.avgSessionSec)}</strong> / partida</div>
          </div>
          <div class="ch-kpi-card ch-kpi-highlight">
            <div class="ch-kpi-label">🔥 Jogo Mais Jogado (Tempo)</div>
            <div class="ch-kpi-value">${r.topGameByTime ? escapeHtml(getGame(r.topGameByTime.gameId).title) : '—'}</div>
            <div class="ch-kpi-foot">
              ${
                r.topGameByTime
                  ? `<strong>${formatDuration(r.topGameByTime.totalTimeSec)}</strong> em ${formatNumber(r.topGameByTime.sessionsCount)} partidas (${formatNumber(r.topGameByTime.uniquePlayers)} jogadores)`
                  : 'Nenhuma partida registrada ainda'
              }
            </div>
          </div>
        </section>

        <nav class="ch-tabs">
          <button class="ch-tab ${state.tab === 'overview' ? 'active' : ''}" data-tab="overview">
            📊 Visão Geral
          </button>
          <button class="ch-tab ${state.tab === 'users' ? 'active' : ''}" data-tab="users">
            👥 Usuários (${formatNumber(r.totalUsers)})
          </button>
          <button class="ch-tab ${state.tab === 'games' ? 'active' : ''}" data-tab="games">
            🏆 Jogos Mais Jogados (${formatNumber(r.games.filter((g) => g.sessionsCount > 0).length)}/${ALL_GAME_IDS.length})
          </button>
          <button class="ch-tab ${state.tab === 'sessions' ? 'active' : ''}" data-tab="sessions">
            🕒 Histórico de Sessões (${formatNumber(r.totalSessions)})
          </button>
        </nav>

        <main class="ch-main">
          ${renderTabContent(state)}
        </main>

        ${renderUserModal(state)}
      </div>
    `;

    bindDashboardEvents(root, state, render, refreshData);
  };

  await refreshData();
}

function getArcadeHomeHref(): string {
  const path = window.location.pathname.replace(/\/ch\/?$/, '/') || '/';
  return path;
}

function renderTabContent(state: DashboardState): string {
  switch (state.tab) {
    case 'overview':
      return renderOverviewTab(state);
    case 'users':
      return renderUsersTab(state);
    case 'games':
      return renderGamesTab(state);
    case 'sessions':
      return renderSessionsTab(state);
  }
}

function renderOverviewTab(state: DashboardState): string {
  const r = state.report;
  const topGames = r.games.filter((g) => g.sessionsCount > 0).slice(0, 10);
  const maxGameTime = Math.max(1, topGames[0]?.totalTimeSec ?? 1);
  const topUsers = r.users.slice(0, 10);
  const maxDailyTime = Math.max(1, ...r.dailyActivity.map((d) => d.totalTimeSec));

  return `
    <div class="ch-grid-2">
      <div class="ch-panel">
        <div class="ch-panel-head">
          <h2>🏆 Top 10 Jogos por Tempo Jogado</h2>
          <button class="ch-link-btn" data-tab="games">Ver todos os ${ALL_GAME_IDS.length} jogos →</button>
        </div>
        ${
          topGames.length === 0
            ? '<div class="ch-empty">Nenhuma partida registrada ainda. Jogue qualquer jogo para ver as métricas!</div>'
            : `<div class="ch-bars">
                ${topGames
                  .map((g, i) => {
                    const def = getGame(g.gameId);
                    const pct = Math.max(4, Math.round((g.totalTimeSec / maxGameTime) * 100));
                    const share =
                      r.totalPlayTimeSec > 0
                        ? Math.round((g.totalTimeSec / r.totalPlayTimeSec) * 100)
                        : 0;
                    return `
                      <div class="ch-bar-row">
                        <div class="ch-bar-meta">
                          <span class="ch-rank-pill">${i + 1}º</span>
                          <span class="ch-game-dot" style="background:${hexColor(def.color)}"></span>
                          <strong class="ch-bar-title">${escapeHtml(def.title)}</strong>
                          <span class="ch-bar-stats">
                            <strong>${formatDuration(g.totalTimeSec)}</strong> (${share}%) · ${formatNumber(g.sessionsCount)} part. · ${formatNumber(g.uniquePlayers)} jog.
                          </span>
                        </div>
                        <div class="ch-bar-track">
                          <div class="ch-bar-fill" style="width:${pct}%;background:${hexColor(def.color)}"></div>
                        </div>
                      </div>
                    `;
                  })
                  .join('')}
              </div>`
        }
      </div>

      <div class="ch-panel">
        <div class="ch-panel-head">
          <h2>👤 Top 10 Usuários por Tempo Jogado</h2>
          <button class="ch-link-btn" data-tab="users">Ver todos (${formatNumber(r.totalUsers)}) →</button>
        </div>
        ${
          topUsers.length === 0
            ? '<div class="ch-empty">Nenhum usuário registrado ainda.</div>'
            : `<div class="ch-table-wrap">
                <table class="ch-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Usuário</th>
                      <th>Tempo Total</th>
                      <th>Partidas</th>
                      <th>Jogo Favorito</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${topUsers
                      .map((u, i) => {
                        const favTitle = u.favoriteGameId ? getGame(u.favoriteGameId).title : '—';
                        return `
                          <tr>
                            <td><span class="ch-rank-pill">${i + 1}º</span></td>
                            <td>
                              <div class="ch-user-cell">
                                <strong>${escapeHtml(u.playerName)}</strong>
                                <span class="ch-uid">${escapeHtml(u.playerId.slice(0, 10))}</span>
                              </div>
                            </td>
                            <td><strong class="ch-time-pill">${formatDuration(u.totalTimeSec)}</strong></td>
                            <td>${formatNumber(u.sessionsCount)}</td>
                            <td>${escapeHtml(favTitle)} <span class="ch-muted">(${formatDuration(u.favoriteGameTimeSec)})</span></td>
                            <td><button class="ch-btn-xs" data-user-id="${escapeHtml(u.playerId)}">Detalhes</button></td>
                          </tr>
                        `;
                      })
                      .join('')}
                  </tbody>
                </table>
              </div>`
        }
      </div>
    </div>

    <div class="ch-panel ch-mt">
      <div class="ch-panel-head">
        <h2>📈 Atividade nos Últimos 14 Dias</h2>
        <span class="ch-muted">Tempo total jogado e usuários ativos por dia</span>
      </div>
      <div class="ch-daily-chart">
        ${r.dailyActivity
          .map((d) => {
            const hPct =
              d.totalTimeSec > 0
                ? Math.max(8, Math.round((d.totalTimeSec / maxDailyTime) * 100))
                : 2;
            const label = `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}`;
            return `
              <div class="ch-day-col" title="${label}: ${formatDuration(d.totalTimeSec)} · ${d.sessions} partidas · ${d.activeUsers} usuários">
                <div class="ch-day-val">${d.totalTimeSec > 0 ? formatDuration(d.totalTimeSec) : ''}</div>
                <div class="ch-day-bar-wrap">
                  <div class="ch-day-bar ${d.totalTimeSec > 0 ? 'has-data' : ''}" style="height:${hPct}%"></div>
                </div>
                <div class="ch-day-date">${label}</div>
                <div class="ch-day-sub">${d.sessions}p · ${d.activeUsers}u</div>
              </div>
            `;
          })
          .join('')}
      </div>
    </div>
  `;
}

function renderUsersTab(state: DashboardState): string {
  const q = state.userSearch.trim().toLowerCase();
  const filtered = state.report.users
    .filter(
      (u) =>
        !q ||
        u.playerName.toLowerCase().includes(q) ||
        u.playerId.toLowerCase().includes(q) ||
        (u.favoriteGameId && getGame(u.favoriteGameId).title.toLowerCase().includes(q)),
    )
    .sort((a, b) => {
      switch (state.userSort) {
        case 'sessions':
          return b.sessionsCount - a.sessionsCount || b.totalTimeSec - a.totalTimeSec;
        case 'recent':
          return b.lastSeenAt.localeCompare(a.lastSeenAt);
        case 'name':
          return a.playerName.localeCompare(b.playerName, 'pt-BR');
        case 'time':
        default:
          return b.totalTimeSec - a.totalTimeSec || b.sessionsCount - a.sessionsCount;
      }
    });

  return `
    <div class="ch-panel">
      <div class="ch-toolbar">
        <input
          type="search"
          class="ch-input"
          placeholder="🔍 Buscar usuário por nome, ID ou jogo favorito..."
          value="${escapeHtml(state.userSearch)}"
          data-filter="user-search"
        />
        <div class="ch-sort-group">
          <span class="ch-muted">Ordenar por:</span>
          <select class="ch-select" data-filter="user-sort">
            <option value="time" ${state.userSort === 'time' ? 'selected' : ''}>Maior tempo jogado</option>
            <option value="sessions" ${state.userSort === 'sessions' ? 'selected' : ''}>Mais partidas</option>
            <option value="recent" ${state.userSort === 'recent' ? 'selected' : ''}>Atividade mais recente</option>
            <option value="name" ${state.userSort === 'name' ? 'selected' : ''}>Nome (A-Z)</option>
          </select>
        </div>
      </div>

      ${
        filtered.length === 0
          ? '<div class="ch-empty">Nenhum usuário encontrado.</div>'
          : `<div class="ch-table-wrap">
              <table class="ch-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Usuário</th>
                    <th>Tempo Jogando</th>
                    <th>Partidas</th>
                    <th>Média / Partida</th>
                    <th>Jogos Diferentes</th>
                    <th>Jogo Mais Jogado</th>
                    <th>Última Atividade</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  ${filtered
                    .map((u, i) => {
                      const fav = u.favoriteGameId ? getGame(u.favoriteGameId) : null;
                      const avg =
                        u.sessionsCount > 0 ? Math.round(u.totalTimeSec / u.sessionsCount) : 0;
                      return `
                        <tr>
                          <td><span class="ch-rank-pill">${i + 1}º</span></td>
                          <td>
                            <div class="ch-user-cell">
                              <strong>${escapeHtml(u.playerName)}</strong>
                              <span class="ch-uid">${escapeHtml(u.playerId)}</span>
                            </div>
                          </td>
                          <td><strong class="ch-time-pill">${formatDuration(u.totalTimeSec)}</strong></td>
                          <td>${formatNumber(u.sessionsCount)}</td>
                          <td>${formatDuration(avg)}</td>
                          <td>${u.gamesPlayedCount}</td>
                          <td>
                            ${
                              fav
                                ? `<span class="ch-game-dot" style="background:${hexColor(fav.color)}"></span> <strong>${escapeHtml(fav.title)}</strong> <span class="ch-muted">(${formatDuration(u.favoriteGameTimeSec)})</span>`
                                : '—'
                            }
                          </td>
                          <td>${formatDateTimePt(u.lastSeenAt)}</td>
                          <td>
                            <button class="ch-btn-xs" data-user-id="${escapeHtml(u.playerId)}">
                              Ver ficha completa
                            </button>
                          </td>
                        </tr>
                      `;
                    })
                    .join('')}
                </tbody>
              </table>
            </div>`
      }
    </div>
  `;
}

function renderGamesTab(state: DashboardState): string {
  const q = state.gameSearch.trim().toLowerCase();
  const totalPlayTime = Math.max(1, state.report.totalPlayTimeSec);
  const filtered = state.report.games
    .filter((g) => {
      if (!q) return true;
      const def = getGame(g.gameId);
      return def.title.toLowerCase().includes(q) || g.gameId.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      switch (state.gameSort) {
        case 'sessions':
          return b.sessionsCount - a.sessionsCount || b.totalTimeSec - a.totalTimeSec;
        case 'players':
          return b.uniquePlayers - a.uniquePlayers || b.totalTimeSec - a.totalTimeSec;
        case 'avg':
          return b.avgSessionSec - a.avgSessionSec || b.totalTimeSec - a.totalTimeSec;
        case 'time':
        default:
          return b.totalTimeSec - a.totalTimeSec || b.sessionsCount - a.sessionsCount;
      }
    });

  return `
    <div class="ch-panel">
      <div class="ch-toolbar">
        <input
          type="search"
          class="ch-input"
          placeholder="🔍 Buscar jogo por título ou ID..."
          value="${escapeHtml(state.gameSearch)}"
          data-filter="game-search"
        />
        <div class="ch-sort-group">
          <span class="ch-muted">Ordenar por:</span>
          <select class="ch-select" data-filter="game-sort">
            <option value="time" ${state.gameSort === 'time' ? 'selected' : ''}>Mais tempo jogado</option>
            <option value="sessions" ${state.gameSort === 'sessions' ? 'selected' : ''}>Mais partidas jogadas</option>
            <option value="players" ${state.gameSort === 'players' ? 'selected' : ''}>Mais jogadores únicos</option>
            <option value="avg" ${state.gameSort === 'avg' ? 'selected' : ''}>Maior tempo médio por partida</option>
          </select>
        </div>
      </div>

      <div class="ch-table-wrap">
        <table class="ch-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Jogo</th>
              <th>Tempo Total</th>
              <th>% do Tempo</th>
              <th>Partidas</th>
              <th>Jogadores Únicos</th>
              <th>Tempo Médio / Partida</th>
              <th>Maior Pontuação</th>
              <th>Última Partida</th>
            </tr>
          </thead>
          <tbody>
            ${filtered
              .map((g, i) => {
                const def = getGame(g.gameId);
                const pct =
                  state.report.totalPlayTimeSec > 0
                    ? ((g.totalTimeSec / totalPlayTime) * 100).toFixed(1)
                    : '0.0';
                return `
                  <tr class="${g.sessionsCount === 0 ? 'ch-row-dim' : ''}">
                    <td><span class="ch-rank-pill">${i + 1}º</span></td>
                    <td>
                      <span class="ch-game-dot" style="background:${hexColor(def.color)}"></span>
                      <strong>${escapeHtml(def.title)}</strong>
                      <span class="ch-uid">${escapeHtml(g.gameId)}</span>
                    </td>
                    <td><strong class="ch-time-pill">${formatDuration(g.totalTimeSec)}</strong></td>
                    <td>${pct}%</td>
                    <td>${formatNumber(g.sessionsCount)}</td>
                    <td>${formatNumber(g.uniquePlayers)}</td>
                    <td>${formatDuration(g.avgSessionSec)}</td>
                    <td>${g.bestScore > 0 ? formatNumber(g.bestScore) : '—'}</td>
                    <td>${formatDateTimePt(g.lastPlayedAt)}</td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderSessionsTab(state: DashboardState): string {
  const sessions = state.report.recentSessions
    .filter((s) => state.sessionFilterGame === 'all' || s.gameId === state.sessionFilterGame)
    .slice(0, 250);

  return `
    <div class="ch-panel">
      <div class="ch-toolbar">
        <div class="ch-sort-group">
          <span class="ch-muted">Filtrar por jogo:</span>
          <select class="ch-select" data-filter="session-game">
            <option value="all" ${state.sessionFilterGame === 'all' ? 'selected' : ''}>Todos os jogos (${state.report.recentSessions.length})</option>
            ${GAMES.map(
              (g) =>
                `<option value="${escapeHtml(g.id)}" ${state.sessionFilterGame === g.id ? 'selected' : ''}>${escapeHtml(g.title)}</option>`,
            ).join('')}
          </select>
        </div>
        <span class="ch-muted">Exibindo até 250 sessões mais recentes</span>
      </div>

      ${
        sessions.length === 0
          ? '<div class="ch-empty">Nenhuma sessão encontrada para este filtro.</div>'
          : `<div class="ch-table-wrap">
              <table class="ch-table">
                <thead>
                  <tr>
                    <th>Fim da Partida</th>
                    <th>Usuário</th>
                    <th>Jogo</th>
                    <th>Tempo Jogado</th>
                    <th>Pontuação</th>
                  </tr>
                </thead>
                <tbody>
                  ${sessions
                    .map((s) => {
                      const def = getGame(s.gameId);
                      return `
                        <tr>
                          <td>${formatDateTimePt(s.endedAt)}</td>
                          <td>
                            <button class="ch-link-btn" data-user-id="${escapeHtml(s.playerId)}">
                              ${escapeHtml(s.playerName)}
                            </button>
                            <span class="ch-uid">${escapeHtml(s.playerId.slice(0, 8))}</span>
                          </td>
                          <td>
                            <span class="ch-game-dot" style="background:${hexColor(def.color)}"></span>
                            <strong>${escapeHtml(def.title)}</strong>
                          </td>
                          <td><strong class="ch-time-pill">${formatDuration(s.durationSec)}</strong></td>
                          <td>${s.score > 0 ? formatNumber(s.score) : '—'}</td>
                        </tr>
                      `;
                    })
                    .join('')}
                </tbody>
              </table>
            </div>`
      }
    </div>
  `;
}

function renderUserModal(state: DashboardState): string {
  if (!state.selectedUserId) return '';
  const user: UserStatsSummary | undefined = state.report.users.find(
    (u) => u.playerId === state.selectedUserId,
  );
  if (!user) return '';

  const maxGameTime = Math.max(1, user.games[0]?.totalTimeSec ?? 1);
  const userSessions = state.report.recentSessions
    .filter((s) => s.playerId === user.playerId)
    .slice(0, 30);

  return `
    <div class="ch-modal-backdrop" data-action="close-modal">
      <div class="ch-modal" onclick="event.stopPropagation()">
        <div class="ch-modal-head">
          <div>
            <h2>👤 ${escapeHtml(user.playerName)}</h2>
            <div class="ch-uid">ID: ${escapeHtml(user.playerId)} · Visto de ${formatDateTimePt(user.firstSeenAt)} até ${formatDateTimePt(user.lastSeenAt)}</div>
          </div>
          <button class="ch-btn ch-btn-secondary" data-action="close-modal">✕ Fechar</button>
        </div>

        <div class="ch-kpi-grid ch-kpi-grid-sm">
          <div class="ch-kpi-card">
            <div class="ch-kpi-label">Tempo Total</div>
            <div class="ch-kpi-value">${formatDuration(user.totalTimeSec)}</div>
          </div>
          <div class="ch-kpi-card">
            <div class="ch-kpi-label">Partidas</div>
            <div class="ch-kpi-value">${formatNumber(user.sessionsCount)}</div>
          </div>
          <div class="ch-kpi-card">
            <div class="ch-kpi-label">Jogos Jogados</div>
            <div class="ch-kpi-value">${user.gamesPlayedCount}</div>
          </div>
          <div class="ch-kpi-card">
            <div class="ch-kpi-label">Jogo Favorito</div>
            <div class="ch-kpi-value">${user.favoriteGameId ? escapeHtml(getGame(user.favoriteGameId).title) : '—'}</div>
          </div>
        </div>

        <h3 class="ch-section-title">🎮 Tempo e Partidas por Jogo</h3>
        <div class="ch-bars">
          ${user.games
            .map((ug, idx) => {
              const def = getGame(ug.gameId);
              const pct = Math.max(5, Math.round((ug.totalTimeSec / maxGameTime) * 100));
              const share =
                user.totalTimeSec > 0 ? Math.round((ug.totalTimeSec / user.totalTimeSec) * 100) : 0;
              return `
                <div class="ch-bar-row">
                  <div class="ch-bar-meta">
                    <span class="ch-rank-pill">${idx + 1}º</span>
                    <span class="ch-game-dot" style="background:${hexColor(def.color)}"></span>
                    <strong class="ch-bar-title">${escapeHtml(def.title)}</strong>
                    <span class="ch-bar-stats">
                      <strong>${formatDuration(ug.totalTimeSec)}</strong> (${share}%) · ${ug.sessionsCount} part. · Recorde: ${formatNumber(ug.bestScore)}
                    </span>
                  </div>
                  <div class="ch-bar-track">
                    <div class="ch-bar-fill" style="width:${pct}%;background:${hexColor(def.color)}"></div>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>

        <h3 class="ch-section-title">🕒 Últimas Partidas deste Usuário</h3>
        <div class="ch-table-wrap">
          <table class="ch-table">
            <thead>
              <tr>
                <th>Data/Hora</th>
                <th>Jogo</th>
                <th>Duração</th>
                <th>Pontos</th>
              </tr>
            </thead>
            <tbody>
              ${userSessions
                .map((s) => {
                  const def = getGame(s.gameId);
                  return `
                    <tr>
                      <td>${formatDateTimePt(s.endedAt)}</td>
                      <td>
                        <span class="ch-game-dot" style="background:${hexColor(def.color)}"></span>
                        ${escapeHtml(def.title)}
                      </td>
                      <td><strong>${formatDuration(s.durationSec)}</strong></td>
                      <td>${s.score > 0 ? formatNumber(s.score) : '—'}</td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function bindDashboardEvents(
  root: HTMLElement,
  state: DashboardState,
  render: () => void,
  refreshData: () => Promise<void>,
): void {
  root.querySelectorAll<HTMLElement>('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab as TabId | undefined;
      if (tab) {
        state.tab = tab;
        render();
      }
    });
  });

  root.querySelectorAll<HTMLElement>('[data-user-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedUserId = btn.dataset.userId ?? null;
      render();
    });
  });

  root.querySelectorAll<HTMLElement>('[data-action="close-modal"]').forEach((el) => {
    el.addEventListener('click', () => {
      state.selectedUserId = null;
      render();
    });
  });

  root.querySelector<HTMLElement>('[data-action="refresh"]')?.addEventListener('click', () => {
    void refreshData();
  });

  root.querySelector<HTMLElement>('[data-action="export-csv"]')?.addEventListener('click', () => {
    const csv = sessionsToCsv(state.sessions);
    downloadFile(`fliperama-sessoes-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv');
  });

  root.querySelector<HTMLElement>('[data-action="export-json"]')?.addEventListener('click', () => {
    const json = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        summary: {
          totalUsers: state.report.totalUsers,
          totalSessions: state.report.totalSessions,
          totalPlayTimeSec: state.report.totalPlayTimeSec,
        },
        users: state.report.users,
        games: state.report.games,
        sessions: state.sessions,
      },
      null,
      2,
    );
    downloadFile(
      `fliperama-relatorio-${new Date().toISOString().slice(0, 10)}.json`,
      json,
      'application/json',
    );
  });

  const userSearch = root.querySelector<HTMLInputElement>('[data-filter="user-search"]');
  if (userSearch) {
    userSearch.addEventListener('input', () => {
      state.userSearch = userSearch.value;
      const pos = userSearch.selectionStart ?? userSearch.value.length;
      render();
      const next = root.querySelector<HTMLInputElement>('[data-filter="user-search"]');
      if (next) {
        next.focus();
        next.setSelectionRange(pos, pos);
      }
    });
  }

  const userSort = root.querySelector<HTMLSelectElement>('[data-filter="user-sort"]');
  if (userSort) {
    userSort.addEventListener('change', () => {
      state.userSort = userSort.value as UserSortKey;
      render();
    });
  }

  const gameSearch = root.querySelector<HTMLInputElement>('[data-filter="game-search"]');
  if (gameSearch) {
    gameSearch.addEventListener('input', () => {
      state.gameSearch = gameSearch.value;
      const pos = gameSearch.selectionStart ?? gameSearch.value.length;
      render();
      const next = root.querySelector<HTMLInputElement>('[data-filter="game-search"]');
      if (next) {
        next.focus();
        next.setSelectionRange(pos, pos);
      }
    });
  }

  const gameSort = root.querySelector<HTMLSelectElement>('[data-filter="game-sort"]');
  if (gameSort) {
    gameSort.addEventListener('change', () => {
      state.gameSort = gameSort.value as GameSortKey;
      render();
    });
  }

  const sessionGame = root.querySelector<HTMLSelectElement>('[data-filter="session-game"]');
  if (sessionGame) {
    sessionGame.addEventListener('change', () => {
      state.sessionFilterGame = sessionGame.value;
      render();
    });
  }
}

function promptAdminPassword(root: HTMLElement, expected: string): Promise<boolean> {
  return new Promise((resolve) => {
    root.innerHTML = `
      <div class="ch-auth-wrap">
        <form class="ch-auth-card" id="ch-auth-form">
          <div class="ch-logo">🔒</div>
          <h2>Acesso Restrito · /ch</h2>
          <p class="ch-muted">Digite a senha de administrador para abrir o painel.</p>
          <input type="password" class="ch-input" id="ch-pass" placeholder="Senha" autofocus />
          <div id="ch-auth-err" class="ch-auth-err"></div>
          <div class="ch-auth-actions">
            <a class="ch-btn ch-btn-secondary" href="${escapeHtml(getArcadeHomeHref())}">Voltar</a>
            <button type="submit" class="ch-btn ch-btn-primary">Entrar</button>
          </div>
        </form>
      </div>
    `;
    const form = root.querySelector<HTMLFormElement>('#ch-auth-form');
    const input = root.querySelector<HTMLInputElement>('#ch-pass');
    const err = root.querySelector<HTMLElement>('#ch-auth-err');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (input?.value === expected) {
        resolve(true);
      } else if (err) {
        err.textContent = 'Senha incorreta.';
      }
    });
  });
}

function injectAdminStyles(): void {
  if (document.getElementById('ch-admin-styles')) return;
  const style = document.createElement('style');
  style.id = 'ch-admin-styles';
  style.textContent = `
    #game {
      position: static !important;
      inset: auto !important;
      touch-action: auto !important;
      min-height: 100vh;
      background: #0f172a;
      color: #f8fafc;
    }
    .ch-shell {
      max-width: 1280px;
      margin: 0 auto;
      padding: 24px 20px 64px;
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    }
    .ch-header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;
      background: #1e293b;
      padding: 20px 24px;
      border-radius: 20px;
      border: 1px solid #334155;
    }
    .ch-brand {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .ch-logo {
      font-size: 40px;
      line-height: 1;
    }
    .ch-brand h1 {
      margin: 0 0 6px;
      font-size: 24px;
      font-weight: 800;
      color: #ffd23f;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .ch-route-pill {
      font-size: 13px;
      background: #334155;
      color: #cbd5e1;
      padding: 2px 10px;
      border-radius: 99px;
      font-family: monospace;
    }
    .ch-sub {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      font-size: 13px;
      color: #94a3b8;
    }
    .ch-badge {
      padding: 3px 10px;
      border-radius: 99px;
      font-weight: 600;
      font-size: 12px;
    }
    .ch-badge-online { background: #065f46; color: #6ee7b7; }
    .ch-badge-warn { background: #78350f; color: #fcd34d; }
    .ch-badge-local { background: #1e3a8a; color: #93c5fd; }
    .ch-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .ch-btn {
      border: none;
      border-radius: 12px;
      padding: 10px 16px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: transform 0.1s, opacity 0.15s;
    }
    .ch-btn:active { transform: scale(0.97); }
    .ch-btn:disabled { opacity: 0.5; cursor: default; }
    .ch-btn-primary { background: #ffb703; color: #0f172a; }
    .ch-btn-secondary { background: #334155; color: #f8fafc; }
    .ch-btn-xs {
      background: #334155;
      color: #e2e8f0;
      border: 1px solid #475569;
      border-radius: 8px;
      padding: 5px 10px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .ch-btn-xs:hover { background: #475569; }
    .ch-link-btn {
      background: none;
      border: none;
      color: #38bdf8;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      padding: 0;
    }
    .ch-link-btn:hover { text-decoration: underline; }
    .ch-kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .ch-kpi-grid-sm {
      margin-top: 16px;
      margin-bottom: 20px;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    }
    .ch-kpi-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 18px;
      padding: 18px 20px;
    }
    .ch-kpi-highlight {
      border-color: #ffb703;
      background: linear-gradient(145deg, #1e293b, #27201c);
    }
    .ch-kpi-label {
      font-size: 13px;
      color: #94a3b8;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .ch-kpi-value {
      font-size: 30px;
      font-weight: 800;
      color: #f8fafc;
      margin-bottom: 6px;
    }
    .ch-kpi-foot {
      font-size: 13px;
      color: #94a3b8;
    }
    .ch-kpi-foot strong { color: #e2e8f0; }
    .ch-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 20px;
      border-bottom: 1px solid #334155;
      padding-bottom: 12px;
    }
    .ch-tab {
      background: #1e293b;
      color: #94a3b8;
      border: 1px solid #334155;
      padding: 10px 18px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
    }
    .ch-tab.active {
      background: #ffb703;
      color: #0f172a;
      border-color: #ffb703;
    }
    .ch-grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(460px, 1fr));
      gap: 20px;
    }
    @media (max-width: 600px) {
      .ch-grid-2 { grid-template-columns: 1fr; }
    }
    .ch-panel {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 18px;
      padding: 20px;
    }
    .ch-mt { margin-top: 20px; }
    .ch-panel-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    .ch-panel-head h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 800;
    }
    .ch-bars {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .ch-bar-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .ch-bar-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      font-size: 14px;
    }
    .ch-bar-title {
      margin-right: auto;
    }
    .ch-bar-stats {
      font-size: 13px;
      color: #cbd5e1;
    }
    .ch-bar-track {
      height: 10px;
      background: #0f172a;
      border-radius: 99px;
      overflow: hidden;
    }
    .ch-bar-fill {
      height: 100%;
      border-radius: 99px;
    }
    .ch-rank-pill {
      display: inline-block;
      min-width: 28px;
      text-align: center;
      background: #0f172a;
      color: #cbd5e1;
      padding: 2px 6px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
    }
    .ch-game-dot {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      vertical-align: middle;
      margin-right: 4px;
    }
    .ch-time-pill {
      color: #ffd23f;
    }
    .ch-toolbar {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    .ch-input {
      flex: 1;
      min-width: 240px;
      background: #0f172a;
      border: 1px solid #334155;
      color: #f8fafc;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 14px;
      outline: none;
    }
    .ch-input:focus { border-color: #ffb703; }
    .ch-select {
      background: #0f172a;
      border: 1px solid #334155;
      color: #f8fafc;
      padding: 9px 12px;
      border-radius: 12px;
      font-size: 14px;
    }
    .ch-sort-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ch-table-wrap {
      overflow-x: auto;
    }
    .ch-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
      text-align: left;
    }
    .ch-table th {
      color: #94a3b8;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      padding: 10px 12px;
      border-bottom: 1px solid #334155;
    }
    .ch-table td {
      padding: 12px;
      border-bottom: 1px solid #1e293b;
      vertical-align: middle;
    }
    .ch-table tbody tr:hover {
      background: #0f172a66;
    }
    .ch-row-dim {
      opacity: 0.48;
    }
    .ch-user-cell {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .ch-uid {
      font-size: 11px;
      color: #64748b;
      font-family: monospace;
      margin-left: 4px;
    }
    .ch-muted {
      color: #94a3b8;
      font-size: 13px;
    }
    .ch-empty {
      padding: 40px 20px;
      text-align: center;
      color: #94a3b8;
      font-size: 15px;
    }
    .ch-daily-chart {
      display: grid;
      grid-template-columns: repeat(14, minmax(44px, 1fr));
      gap: 8px;
      padding-top: 12px;
      overflow-x: auto;
    }
    .ch-day-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .ch-day-val {
      font-size: 11px;
      color: #cbd5e1;
      height: 16px;
      white-space: nowrap;
    }
    .ch-day-bar-wrap {
      width: 100%;
      height: 110px;
      background: #0f172a;
      border-radius: 8px;
      display: flex;
      align-items: flex-end;
      padding: 4px;
      box-sizing: border-box;
    }
    .ch-day-bar {
      width: 100%;
      background: #334155;
      border-radius: 5px;
      transition: height 0.2s;
    }
    .ch-day-bar.has-data {
      background: linear-gradient(180deg, #ffd23f, #ffb703);
    }
    .ch-day-date {
      font-size: 12px;
      font-weight: 700;
      color: #e2e8f0;
    }
    .ch-day-sub {
      font-size: 10px;
      color: #64748b;
    }
    .ch-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(2, 6, 23, 0.78);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      z-index: 1000;
    }
    .ch-modal {
      background: #1e293b;
      border: 1px solid #475569;
      border-radius: 22px;
      max-width: 820px;
      width: 100%;
      max-height: 88vh;
      overflow-y: auto;
      padding: 24px;
    }
    .ch-modal-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }
    .ch-modal-head h2 {
      margin: 0 0 4px;
      color: #ffd23f;
    }
    .ch-section-title {
      font-size: 16px;
      margin: 20px 0 12px;
      color: #e2e8f0;
    }
    .ch-auth-wrap {
      min-height: 90vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .ch-auth-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 20px;
      padding: 32px;
      max-width: 380px;
      width: 100%;
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .ch-auth-card h2 { margin: 0; color: #ffd23f; }
    .ch-auth-err { color: #f87171; font-size: 13px; min-height: 18px; }
    .ch-auth-actions { display: flex; gap: 10px; justify-content: center; }
  `;
  document.head.appendChild(style);
}
