import {
  api,
  type AdminMessage,
  type ClientErrorRow,
  type DayStats,
  type Entry,
  type GameStats,
  type HourlyCell,
  type MonitoringSnapshot,
  type Overview,
  type Page,
  type PlayerSummary,
  type PlaySession,
  type Report,
  type SessionsPage,
} from './api';
import {
  ago,
  anomalyReasonLabel,
  bytes,
  csvCell,
  dateTime,
  duration,
  esc,
  fillDailyTimeline,
  formatDetailPairs,
  number,
  paginateSlice,
  parseHashRoute,
  percent,
} from './format';
import { CATEGORY_LABELS, GAMES_CATALOG, getGameMeta, type GameCategory } from './games';
import {
  bindPagination,
  confirmDialog,
  downloadFile,
  openPlayerModal,
  renderGameBadge,
  renderPagination,
  renderPlayerCell,
  renderRankBadge,
  renderRoomBadge,
  toast,
} from './ui';

/** A screen: fills `root` and returns when it is drawn. Errors are shown by the caller. */
export type View = (root: HTMLElement, onBadgeUpdate?: (reports: number) => void) => Promise<void>;

const sortedCatalog = [...GAMES_CATALOG].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));

function bindPlayerTriggers(root: HTMLElement, onChanged?: () => void): void {
  root.querySelectorAll<HTMLElement>('[data-player-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.playerModal;
      if (id) void openPlayerModal(id, onChanged);
    });
  });
}

const kpiCard = (
  icon: string,
  label: string,
  value: string,
  hint = '',
  accentClass = '',
): string => `
  <div class="stat ${accentClass}">
    <div class="stat-top">
      <span class="stat-label">${esc(label)}</span>
      <span class="stat-icon">${icon}</span>
    </div>
    <strong class="stat-value">${esc(value)}</strong>
    ${hint ? `<small class="stat-hint">${hint}</small>` : ''}
  </div>
`;

type ChartMetric = 'sessions' | 'play_seconds' | 'players';

function renderDailyChart(days: DayStats[], metric: ChartMetric): string {
  const values = days.map((d) => d[metric]);
  const max = Math.max(1, ...values);
  const formatVal = (v: number) => (metric === 'play_seconds' ? duration(v) : number(v));

  return `
    <div class="daily-chart" style="--cols:${days.length}">
      ${days
        .map((d) => {
          const val = d[metric];
          const pct = val > 0 ? Math.max(6, Math.round((val / max) * 100)) : 2;
          const dateLabel = `${d.day.slice(8, 10)}/${d.day.slice(5, 7)}`;
          const tip = `${dateLabel}/${d.day.slice(0, 4)}: ${number(d.sessions)} partidas · ${duration(d.play_seconds)} · ${number(d.players)} jogadores`;
          return `
            <div class="day-col" title="${esc(tip)}">
              <span class="day-val">${val > 0 ? esc(formatVal(val)) : ''}</span>
              <div class="day-bar-wrap">
                <div class="day-bar ${val > 0 ? 'has-data' : ''}" style="height:${pct}%"></div>
              </div>
              <span class="day-date">${esc(dateLabel)}</span>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

export const overview: View = async (root, onBadgeUpdate) => {
  let daysCount = 14;
  let metric: ChartMetric = 'sessions';
  let data = await api<Overview>(`/api/admin/overview?days=${daysCount}`);
  onBadgeUpdate?.(data.totals.open_reports);

  const draw = () => {
    const t = data.totals;
    const timeline = fillDailyTimeline(data.daily, daysCount);
    const periodSessions = timeline.reduce((acc, d) => acc + d.sessions, 0);
    const periodSeconds = timeline.reduce((acc, d) => acc + d.play_seconds, 0);
    const avgSessionSec = t.sessions > 0 ? Math.round(t.play_seconds / t.sessions) : 0;
    const avgPlayerSec = t.players > 0 ? Math.round(t.play_seconds / t.players) : 0;
    const googlePct = percent(t.google_players, t.players, 0);
    const gamesPlayed = t.games_played ?? data.games.filter((g) => g.sessions > 0).length;

    const topGames = data.games.slice(0, 10);
    const maxGameTime = Math.max(1, topGames[0]?.play_seconds ?? 1);
    const topPlayers = data.top_players ?? [];

    root.innerHTML = `
      <div class="stats">
        ${kpiCard(
          '👥',
          'Jogadores',
          number(t.players),
          `<strong>${number(t.google_players)}</strong> com Google (${esc(googlePct)})`,
        )}
        ${kpiCard(
          '🟢',
          'Ativos Hoje',
          number(t.active_today),
          `7d: <strong>${number(t.active_7d)}</strong>${t.active_30d !== undefined ? ` · 30d: <strong>${number(t.active_30d)}</strong>` : ''}`,
        )}
        ${kpiCard(
          '🕹️',
          'Partidas',
          number(t.sessions),
          `Média de <strong>${esc(duration(avgSessionSec))}</strong> / partida`,
        )}
        ${kpiCard(
          '⏱️',
          'Tempo Jogado',
          duration(t.play_seconds),
          `Média de <strong>${esc(duration(avgPlayerSec))}</strong> / jogador`,
          'stat-highlight',
        )}
        ${kpiCard(
          '🏆',
          'Recordes',
          number(t.entries),
          `<strong>${number(gamesPlayed)}</strong> de ${GAMES_CATALOG.length} jogos jogados`,
        )}
        ${kpiCard(
          '💬',
          'Mensagens no Chat',
          number(t.messages),
          t.open_reports > 0
            ? `<a href="#denuncias" class="stat-alert">🚨 ${number(t.open_reports)} denúncia(s) aberta(s)</a>`
            : `<span class="text-success">✓ Nenhuma denúncia aberta</span>`,
          t.open_reports > 0 ? 'stat-danger' : '',
        )}
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h2>📈 Atividade Diária (${daysCount} dias)</h2>
            <p class="panel-sub">
              No período: <strong>${number(periodSessions)}</strong> partidas ·
              <strong>${duration(periodSeconds)}</strong> jogados
            </p>
          </div>
          <div class="toolbar-group">
            <div class="seg-group" role="group" aria-label="Métrica">
              <button type="button" class="seg-btn ${metric === 'sessions' ? 'active' : ''}" data-metric="sessions">Partidas</button>
              <button type="button" class="seg-btn ${metric === 'play_seconds' ? 'active' : ''}" data-metric="play_seconds">Tempo</button>
              <button type="button" class="seg-btn ${metric === 'players' ? 'active' : ''}" data-metric="players">Jogadores</button>
            </div>
            <div class="seg-group" role="group" aria-label="Período">
              ${[7, 14, 30]
                .map(
                  (d) =>
                    `<button type="button" class="seg-btn ${daysCount === d ? 'active' : ''}" data-days="${d}">${d}d</button>`,
                )
                .join('')}
            </div>
          </div>
        </div>
        ${renderDailyChart(timeline, metric)}
      </div>

      <div class="grid-2">
        <div class="panel">
          <div class="panel-head">
            <div>
              <h2>🔥 Top 10 Jogos por Tempo</h2>
              <p class="panel-sub">Jogos com maior engajamento acumulado</p>
            </div>
            <a href="#jogos" class="btn btn-xs btn-ghost">Ver todos (${GAMES_CATALOG.length}) →</a>
          </div>
          ${
            topGames.length === 0
              ? `<div class="empty-state">Nenhuma partida registrada ainda.</div>`
              : `<div class="progress-list">
                  ${topGames
                    .map((g, i) => {
                      const meta = getGameMeta(g.game_id);
                      const pct = Math.max(4, Math.round((g.play_seconds / maxGameTime) * 100));
                      const share = percent(g.play_seconds, t.play_seconds, 0);
                      return `
                        <div class="progress-row">
                          <div class="progress-meta">
                            ${renderRankBadge(i + 1)}
                            ${renderGameBadge(g.game_id, { linkTab: 'sessoes' })}
                            <span class="progress-stats">
                              <strong class="text-accent">${duration(g.play_seconds)}</strong> (${share}) ·
                              ${number(g.sessions)} part. · ${number(g.players)} jog.
                            </span>
                          </div>
                          <div class="progress-track">
                            <div class="progress-fill" style="width:${pct}%;background:${esc(meta.color)}"></div>
                          </div>
                        </div>
                      `;
                    })
                    .join('')}
                </div>`
          }
        </div>

        <div class="panel">
          <div class="panel-head">
            <div>
              <h2>👑 Top 10 Jogadores</h2>
              <p class="panel-sub">Usuários com mais tempo de jogo</p>
            </div>
            <a href="#jogadores" class="btn btn-xs btn-ghost">Ver todos (${number(t.players)}) →</a>
          </div>
          ${
            topPlayers.length === 0
              ? `<div class="empty-state">Nenhum jogador ativo ainda.</div>`
              : `<div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Jogador</th>
                        <th>Tempo</th>
                        <th>Partidas</th>
                        <th>Favorito</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      ${topPlayers
                        .map(
                          (p, i) => `
                        <tr>
                          <td>${renderRankBadge(i + 1)}</td>
                          <td>${renderPlayerCell(p)}</td>
                          <td><span class="pill-duration">${duration(p.play_seconds)}</span></td>
                          <td>${number(p.sessions)}</td>
                          <td>${p.favorite_game ? renderGameBadge(p.favorite_game) : '<span class="muted">—</span>'}</td>
                          <td class="text-right">
                            <button type="button" class="btn btn-xs btn-ghost" data-player-modal="${esc(p.id)}">Ficha</button>
                          </td>
                        </tr>
                      `,
                        )
                        .join('')}
                    </tbody>
                  </table>
                </div>`
          }
        </div>
      </div>
    `;

    root.querySelectorAll<HTMLButtonElement>('[data-metric]').forEach((btn) => {
      btn.addEventListener('click', () => {
        metric = btn.dataset.metric as ChartMetric;
        draw();
      });
    });

    root.querySelectorAll<HTMLButtonElement>('[data-days]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const nextDays = Number(btn.dataset.days);
        if (!nextDays || nextDays === daysCount) return;
        daysCount = nextDays;
        data = await api<Overview>(`/api/admin/overview?days=${daysCount}`);
        draw();
      });
    });

    bindPlayerTriggers(root, () => {
      void api<Overview>(`/api/admin/overview?days=${daysCount}`).then((fresh) => {
        data = fresh;
        draw();
      });
    });
  };

  draw();
};

export function gamesToCsv(rows: GameStats[]): string {
  const head = 'gameId,title,category,sessions,playSeconds,players,entries,bestScore,lastPlayedAt';
  const lines = rows.map((g) => {
    const meta = getGameMeta(g.game_id);
    return [
      g.game_id,
      meta.title,
      CATEGORY_LABELS[meta.category],
      g.sessions,
      g.play_seconds,
      g.players,
      g.entries ?? 0,
      g.best_score,
      g.last_played_at ?? '',
    ]
      .map(csvCell)
      .join(',');
  });
  return [head, ...lines].join('\n');
}

export const gamesView: View = async (root, onBadgeUpdate) => {
  const o = await api<Overview>('/api/admin/overview?days=14');
  onBadgeUpdate?.(o.totals.open_reports);

  const byId = new Map<string, GameStats>(o.games.map((g) => [g.game_id, g]));
  const allGames: GameStats[] = GAMES_CATALOG.map((meta) => {
    const found = byId.get(meta.id);
    return (
      found ?? {
        game_id: meta.id,
        sessions: 0,
        play_seconds: 0,
        players: 0,
        best_score: 0,
        entries: 0,
        last_played_at: null,
      }
    );
  });
  // Include any extra game from DB not in static catalog
  for (const g of o.games) {
    if (!GAMES_CATALOG.some((c) => c.id === g.game_id)) {
      allGames.push(g);
    }
  }

  let search = '';
  let category: 'all' | GameCategory = 'all';
  let statusFilter: 'all' | 'played' | 'unplayed' | 'ranked' = 'all';
  let sortBy: 'time' | 'sessions' | 'players' | 'avg' | 'entries' | 'score' | 'recent' | 'name' = 'time';
  let page = 1;
  let perPage = 25;

  root.innerHTML = `
    <div class="panel">
      <div class="toolbar">
        <input id="game-q" type="search" class="input-search" placeholder="🔍 Buscar jogo por título ou ID..." />
        <div class="toolbar-filters">
          <select id="game-cat">
            <option value="all">Todas as categorias</option>
            ${(Object.keys(CATEGORY_LABELS) as GameCategory[])
              .map((c) => `<option value="${c}">${esc(CATEGORY_LABELS[c])}</option>`)
              .join('')}
          </select>
          <select id="game-status">
            <option value="all">Todos os jogos (${allGames.length})</option>
            <option value="played">Com partidas jogadas</option>
            <option value="unplayed">Sem partidas (0)</option>
            <option value="ranked">Com recordes no ranking</option>
          </select>
          <select id="game-sort">
            <option value="time">Ordenar: Maior tempo jogado</option>
            <option value="sessions">Ordenar: Mais partidas</option>
            <option value="players">Ordenar: Mais jogadores únicos</option>
            <option value="avg">Ordenar: Maior tempo médio</option>
            <option value="entries">Ordenar: Mais recordes</option>
            <option value="score">Ordenar: Maior pontuação</option>
            <option value="recent">Ordenar: Jogado recentemente</option>
            <option value="name">Ordenar: Nome (A–Z)</option>
          </select>
          <button type="button" id="game-csv" class="btn btn-secondary">📥 Exportar CSV</button>
        </div>
      </div>
      <div id="games-summary" class="summary-strip"></div>
      <div id="games-list"></div>
    </div>
  `;

  const summaryEl = root.querySelector<HTMLElement>('#games-summary')!;
  const listEl = root.querySelector<HTMLElement>('#games-list')!;

  const getFiltered = (): GameStats[] => {
    const q = search.trim().toLowerCase();
    return allGames
      .filter((g) => {
        const meta = getGameMeta(g.game_id);
        if (category !== 'all' && meta.category !== category) return false;
        if (statusFilter === 'played' && g.sessions === 0) return false;
        if (statusFilter === 'unplayed' && g.sessions > 0) return false;
        if (statusFilter === 'ranked' && (g.entries ?? 0) === 0) return false;
        if (q) {
          const hay = `${meta.title} ${g.game_id} ${CATEGORY_LABELS[meta.category]}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const ma = getGameMeta(a.game_id);
        const mb = getGameMeta(b.game_id);
        const avgA = a.sessions > 0 ? a.play_seconds / a.sessions : 0;
        const avgB = b.sessions > 0 ? b.play_seconds / b.sessions : 0;
        switch (sortBy) {
          case 'sessions':
            return b.sessions - a.sessions || b.play_seconds - a.play_seconds;
          case 'players':
            return b.players - a.players || b.play_seconds - a.play_seconds;
          case 'avg':
            return avgB - avgA || b.play_seconds - a.play_seconds;
          case 'entries':
            return (b.entries ?? 0) - (a.entries ?? 0) || b.play_seconds - a.play_seconds;
          case 'score':
            return b.best_score - a.best_score || b.play_seconds - a.play_seconds;
          case 'recent':
            return (b.last_played_at ?? '').localeCompare(a.last_played_at ?? '');
          case 'name':
            return ma.title.localeCompare(mb.title, 'pt-BR');
          case 'time':
          default:
            return b.play_seconds - a.play_seconds || b.sessions - a.sessions || ma.title.localeCompare(mb.title, 'pt-BR');
        }
      });
  };

  const renderTable = () => {
    const filtered = getFiltered();
    const pg = paginateSlice(filtered, page, perPage);
    page = pg.page;
    const totalSec = filtered.reduce((s, g) => s + g.play_seconds, 0);
    const totalSess = filtered.reduce((s, g) => s + g.sessions, 0);
    const playedCount = filtered.filter((g) => g.sessions > 0).length;
    const grandTotalSec = Math.max(1, o.totals.play_seconds);

    summaryEl.innerHTML = `
      <span><strong>${number(filtered.length)}</strong> jogos no filtro (${number(playedCount)} com partidas)</span>
      <span>Partidas somadas: <strong>${number(totalSess)}</strong></span>
      <span>Tempo somado: <strong>${duration(totalSec)}</strong></span>
    `;

    if (pg.total === 0) {
      listEl.innerHTML = `<div class="empty-state">Nenhum jogo encontrado para os filtros selecionados.</div>`;
      return;
    }

    listEl.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Jogo</th>
              <th>Categoria</th>
              <th>Tempo Jogado</th>
              <th>% do Total</th>
              <th>Partidas</th>
              <th>Jogadores</th>
              <th>Média/Partida</th>
              <th>Recordes</th>
              <th>Melhor Pontuação</th>
              <th>Última Partida</th>
              <th class="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${pg.items
              .map((g, idx) => {
                const rank = (pg.page - 1) * pg.per_page + idx + 1;
                const meta = getGameMeta(g.game_id);
                const avg = g.sessions > 0 ? Math.round(g.play_seconds / g.sessions) : 0;
                const share = percent(g.play_seconds, grandTotalSec, 1);
                return `
                  <tr class="${g.sessions === 0 && (g.entries ?? 0) === 0 ? 'row-dim' : ''}">
                    <td>${renderRankBadge(rank)}</td>
                    <td>${renderGameBadge(g.game_id, { showId: true })}</td>
                    <td><span class="cat-pill cat-${esc(meta.category)}">${esc(CATEGORY_LABELS[meta.category])}</span></td>
                    <td><span class="pill-duration">${duration(g.play_seconds)}</span></td>
                    <td>${esc(share)}</td>
                    <td><strong>${number(g.sessions)}</strong></td>
                    <td>${number(g.players)}</td>
                    <td>${g.sessions > 0 ? duration(avg) : '—'}</td>
                    <td>${number(g.entries ?? 0)}</td>
                    <td>${g.best_score > 0 ? `<strong class="text-gold">${number(g.best_score)}</strong>` : '—'}</td>
                    <td title="${esc(dateTime(g.last_played_at))}">${g.last_played_at ? ago(g.last_played_at) : '—'}</td>
                    <td class="text-right actions-cell">
                      <a href="#rankings?game=${encodeURIComponent(g.game_id)}" class="btn btn-xs btn-ghost" title="Ver ranking deste jogo">🏆 Ranking</a>
                      <a href="#sessoes?game=${encodeURIComponent(g.game_id)}" class="btn btn-xs btn-ghost" title="Ver partidas deste jogo">🕒 Partidas</a>
                    </td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
      ${renderPagination({ total: pg.total, page: pg.page, per_page: pg.per_page, noun: 'jogos' })}
    `;

    bindPagination(
      listEl,
      (nextPage) => {
        page = nextPage;
        renderTable();
      },
      (nextPerPage) => {
        perPage = nextPerPage;
        page = 1;
        renderTable();
      },
    );
  };

  root.querySelector<HTMLInputElement>('#game-q')!.addEventListener('input', (e) => {
    search = (e.target as HTMLInputElement).value;
    page = 1;
    renderTable();
  });
  root.querySelector<HTMLSelectElement>('#game-cat')!.addEventListener('change', (e) => {
    category = (e.target as HTMLSelectElement).value as 'all' | GameCategory;
    page = 1;
    renderTable();
  });
  root.querySelector<HTMLSelectElement>('#game-status')!.addEventListener('change', (e) => {
    statusFilter = (e.target as HTMLSelectElement).value as typeof statusFilter;
    page = 1;
    renderTable();
  });
  root.querySelector<HTMLSelectElement>('#game-sort')!.addEventListener('change', (e) => {
    sortBy = (e.target as HTMLSelectElement).value as typeof sortBy;
    page = 1;
    renderTable();
  });
  root.querySelector('#game-csv')!.addEventListener('click', () => {
    const filtered = getFiltered();
    downloadFile(
      `fliper-jogos-${new Date().toISOString().slice(0, 10)}.csv`,
      gamesToCsv(filtered),
      'text/csv',
    );
    toast('CSV de jogos exportado!');
  });

  renderTable();
};

export function sessionsToCsv(rows: PlaySession[]): string {
  const head = 'id,playerId,playerName,gameId,durationSec,score,startedAt,endedAt';
  const lines = rows.map((s) =>
    [s.id, s.playerId, s.playerName, s.gameId, s.durationSec, s.score, s.startedAt, s.endedAt].map(csvCell).join(','),
  );
  return [head, ...lines].join('\n');
}

export const sessions: View = async (root) => {
  const { params } = parseHashRoute(location.hash);
  let game = params.get('game') || 'all';
  let q = params.get('q') || '';
  let days = Number(params.get('days') ?? 30);
  if (!Number.isFinite(days)) days = 30;
  let sort = params.get('sort') || 'recent';
  let page = 1;
  let perPage = 25;
  let currentData: SessionsPage | null = null;

  root.innerHTML = `
    <div class="panel">
      <div class="toolbar">
        <input id="sess-q" type="search" class="input-search" placeholder="🔍 Buscar por jogador, ID ou jogo..." value="${esc(q)}" />
        <div class="toolbar-filters">
          <select id="sess-game">
            <option value="all" ${game === 'all' ? 'selected' : ''}>Todos os jogos (${sortedCatalog.length})</option>
            ${sortedCatalog
              .map(
                (g) =>
                  `<option value="${esc(g.id)}" ${game === g.id ? 'selected' : ''}>${esc(g.emoji)} ${esc(g.title)}</option>`,
              )
              .join('')}
          </select>
          <select id="sess-days">
            <option value="1" ${days === 1 ? 'selected' : ''}>Últimas 24 horas</option>
            <option value="7" ${days === 7 ? 'selected' : ''}>Últimos 7 dias</option>
            <option value="30" ${days === 30 ? 'selected' : ''}>Últimos 30 dias</option>
            <option value="90" ${days === 90 ? 'selected' : ''}>Últimos 90 dias</option>
            <option value="365" ${days === 365 ? 'selected' : ''}>Último ano</option>
            <option value="0" ${days === 0 ? 'selected' : ''}>Todo o período</option>
          </select>
          <select id="sess-sort">
            <option value="recent" ${sort === 'recent' ? 'selected' : ''}>Ordenar: Mais recentes</option>
            <option value="duration" ${sort === 'duration' ? 'selected' : ''}>Ordenar: Maior duração</option>
            <option value="score" ${sort === 'score' ? 'selected' : ''}>Ordenar: Maior pontuação</option>
          </select>
          <button type="button" id="csv" class="btn btn-secondary">📥 Baixar CSV</button>
        </div>
      </div>
      <div id="sess-summary" class="summary-strip"></div>
      <div id="sess-list"></div>
    </div>
  `;

  const summaryEl = root.querySelector<HTMLElement>('#sess-summary')!;
  const listEl = root.querySelector<HTMLElement>('#sess-list')!;

  const buildQuery = (overridePage = page, overridePerPage = perPage): string => {
    const sp = new URLSearchParams();
    sp.set('days', String(days));
    sp.set('sort', sort);
    sp.set('page', String(overridePage));
    sp.set('per_page', String(overridePerPage));
    if (game && game !== 'all') sp.set('game', game);
    if (q.trim()) sp.set('q', q.trim());
    return sp.toString();
  };

  const load = async () => {
    listEl.innerHTML = `<div class="loading-box"><div class="spinner"></div><span>Carregando partidas…</span></div>`;
    const res = await api<SessionsPage | PlaySession[]>(`/api/admin/sessions?${buildQuery()}`);
    // Support both paginated response and array fallback
    const pg: SessionsPage = Array.isArray(res)
      ? {
          ...paginateSlice(res, page, perPage),
          total_seconds: res.reduce((acc, s) => acc + s.durationSec, 0),
          unique_players: new Set(res.map((s) => s.playerId)).size,
        }
      : res;
    currentData = pg;
    const avgSec = pg.total > 0 ? Math.round(pg.total_seconds / pg.total) : 0;

    summaryEl.innerHTML = `
      <span>Total no filtro: <strong>${number(pg.total)}</strong> partidas</span>
      <span>Tempo somado: <strong>${duration(pg.total_seconds)}</strong> (média ${duration(avgSec)})</span>
      <span>Jogadores únicos: <strong>${number(pg.unique_players)}</strong></span>
    `;

    if (pg.items.length === 0) {
      listEl.innerHTML = `<div class="empty-state">Nenhuma partida encontrada para os filtros selecionados.</div>`;
      return;
    }

    const paginationHtml = renderPagination({
      total: pg.total,
      page: pg.page,
      per_page: pg.per_page,
      noun: 'partidas',
    });

    listEl.innerHTML = `
      ${paginationHtml}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Quando</th>
              <th>Jogador</th>
              <th>Jogo</th>
              <th>Duração</th>
              <th>Pontuação</th>
              <th class="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${pg.items
              .map(
                (s) => `
              <tr>
                <td>
                  <div>${dateTime(s.endedAt)}</div>
                  <small class="muted">${ago(s.endedAt)}</small>
                </td>
                <td>${renderPlayerCell({ id: s.playerId, name: s.playerName })}</td>
                <td>${renderGameBadge(s.gameId, { showCategory: true })}</td>
                <td><span class="pill-duration">${duration(s.durationSec)}</span></td>
                <td><strong>${s.score > 0 ? number(s.score) : '—'}</strong></td>
                <td class="text-right">
                  <button type="button" class="btn btn-xs btn-ghost" data-player-modal="${esc(s.playerId)}">Ver jogador</button>
                </td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      </div>
      ${paginationHtml}
    `;

    bindPagination(
      listEl,
      (nextPage) => {
        page = nextPage;
        void load();
      },
      (nextPerPage) => {
        perPage = nextPerPage;
        page = 1;
        void load();
      },
    );
    bindPlayerTriggers(listEl, () => void load());
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  root.querySelector<HTMLInputElement>('#sess-q')!.addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      q = (e.target as HTMLInputElement).value;
      page = 1;
      void load();
    }, 280);
  });
  root.querySelector<HTMLSelectElement>('#sess-game')!.addEventListener('change', (e) => {
    game = (e.target as HTMLSelectElement).value;
    page = 1;
    void load();
  });
  root.querySelector<HTMLSelectElement>('#sess-days')!.addEventListener('change', (e) => {
    days = Number((e.target as HTMLSelectElement).value);
    page = 1;
    void load();
  });
  root.querySelector<HTMLSelectElement>('#sess-sort')!.addEventListener('change', (e) => {
    sort = (e.target as HTMLSelectElement).value;
    page = 1;
    void load();
  });

  root.querySelector('#csv')?.addEventListener('click', async () => {
    try {
      const exportRes = await api<SessionsPage | PlaySession[]>(
        `/api/admin/sessions?${buildQuery(1, 1000)}`,
      );
      const rows = Array.isArray(exportRes) ? exportRes : exportRes.items;
      downloadFile(
        `fliper-sessoes-${new Date().toISOString().slice(0, 10)}.csv`,
        sessionsToCsv(rows),
        'text/csv',
      );
      toast(`CSV exportado (${number(rows.length)} partidas).`);
    } catch {
      if (currentData) {
        downloadFile(
          `fliper-sessoes-${new Date().toISOString().slice(0, 10)}.csv`,
          sessionsToCsv(currentData.items),
          'text/csv',
        );
      }
    }
  });

  await load();
};

export function playersToCsv(rows: PlayerSummary[]): string {
  const head = 'id,name,email,google,sessions,playSeconds,entries,favoriteGame,createdAt,lastSeenAt';
  const lines = rows.map((p) =>
    [
      p.id,
      p.name ?? 'Anônimo',
      p.email ?? '',
      p.google ? 'true' : 'false',
      p.sessions,
      p.play_seconds,
      p.entries,
      p.favorite_game ?? '',
      p.created_at,
      p.last_seen_at,
    ]
      .map(csvCell)
      .join(','),
  );
  return [head, ...lines].join('\n');
}

export const players: View = async (root) => {
  const { params } = parseHashRoute(location.hash);
  let q = params.get('q') || '';
  let kind = params.get('kind') || 'all';
  let sort = params.get('sort') || 'recent';
  let page = 1;
  let perPage = 25;

  root.innerHTML = `
    <div class="panel">
      <div class="toolbar">
        <input id="q" type="search" class="input-search" placeholder="🔍 Buscar por apelido, e-mail, ID ou jogo favorito..." value="${esc(q)}" />
        <div class="toolbar-filters">
          <select id="player-kind">
            <option value="all" ${kind === 'all' ? 'selected' : ''}>Todas as contas</option>
            <option value="google" ${kind === 'google' ? 'selected' : ''}>Apenas com Google</option>
            <option value="anon" ${kind === 'anon' ? 'selected' : ''}>Apenas anônimos</option>
            <option value="active" ${kind === 'active' ? 'selected' : ''}>Com partidas jogadas (&gt;0)</option>
          </select>
          <select id="player-sort">
            <option value="recent" ${sort === 'recent' ? 'selected' : ''}>Ordenar: Visto recentemente</option>
            <option value="time" ${sort === 'time' ? 'selected' : ''}>Ordenar: Maior tempo jogado</option>
            <option value="sessions" ${sort === 'sessions' ? 'selected' : ''}>Ordenar: Mais partidas</option>
            <option value="entries" ${sort === 'entries' ? 'selected' : ''}>Ordenar: Mais recordes</option>
            <option value="created" ${sort === 'created' ? 'selected' : ''}>Ordenar: Cadastro mais recente</option>
            <option value="name" ${sort === 'name' ? 'selected' : ''}>Ordenar: Nome (A–Z)</option>
          </select>
          <button type="button" id="players-csv" class="btn btn-secondary">📥 Exportar CSV</button>
        </div>
      </div>
      <div id="list"></div>
    </div>
  `;

  const list = root.querySelector<HTMLElement>('#list')!;

  const buildQuery = (overridePage = page, overridePerPage = perPage): string => {
    const sp = new URLSearchParams();
    sp.set('kind', kind);
    sp.set('sort', sort);
    sp.set('page', String(overridePage));
    sp.set('per_page', String(overridePerPage));
    if (q.trim()) sp.set('q', q.trim());
    return sp.toString();
  };

  const load = async () => {
    list.innerHTML = `<div class="loading-box"><div class="spinner"></div><span>Carregando jogadores…</span></div>`;
    const res = await api<Page<PlayerSummary> | PlayerSummary[]>(`/api/admin/players?${buildQuery()}`);
    const pg: Page<PlayerSummary> = Array.isArray(res) ? paginateSlice(res, page, perPage) : res;

    if (pg.items.length === 0) {
      list.innerHTML = `<div class="empty-state">Nenhum jogador encontrado para os filtros selecionados.</div>`;
      return;
    }

    const paginationHtml = renderPagination({
      total: pg.total,
      page: pg.page,
      per_page: pg.per_page,
      noun: 'jogadores',
    });

    list.innerHTML = `
      ${paginationHtml}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Jogador</th>
              <th>E-mail</th>
              <th>Tempo Jogado</th>
              <th>Partidas</th>
              <th>Jogo Favorito</th>
              <th>Recordes</th>
              <th>Chat</th>
              <th>Visto por Último</th>
              <th class="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${pg.items
              .map((p, idx) => {
                const rank = (pg.page - 1) * pg.per_page + idx + 1;
                const avg = p.sessions > 0 ? Math.round(p.play_seconds / p.sessions) : 0;
                return `
                  <tr>
                    <td><span class="rank-badge">#${number(rank)}</span></td>
                    <td>${renderPlayerCell({ ...p, email: null, showId: true })}</td>
                    <td>${p.email ? esc(p.email) : '<span class="muted">—</span>'}</td>
                    <td>
                      <span class="pill-duration">${duration(p.play_seconds)}</span>
                      ${avg > 0 ? `<small class="cell-sub">média ${duration(avg)}</small>` : ''}
                    </td>
                    <td><strong>${number(p.sessions)}</strong></td>
                    <td>${p.favorite_game ? renderGameBadge(p.favorite_game) : '<span class="muted">—</span>'}</td>
                    <td>${number(p.entries)}</td>
                    <td>${number(p.messages ?? 0)}</td>
                    <td title="Criado em ${esc(dateTime(p.created_at))}">
                      <div>${ago(p.last_seen_at)}</div>
                      <small class="muted">${dateTime(p.last_seen_at)}</small>
                    </td>
                    <td class="text-right">
                      <button type="button" class="btn btn-xs btn-secondary" data-player-modal="${esc(p.id)}">Ver ficha</button>
                    </td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
      ${paginationHtml}
    `;

    bindPagination(
      list,
      (nextPage) => {
        page = nextPage;
        void load();
      },
      (nextPerPage) => {
        perPage = nextPerPage;
        page = 1;
        void load();
      },
    );
    bindPlayerTriggers(list, () => void load());
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  root.querySelector<HTMLInputElement>('#q')!.addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      q = (e.target as HTMLInputElement).value.trim();
      page = 1;
      void load();
    }, 280);
  });
  root.querySelector<HTMLSelectElement>('#player-kind')!.addEventListener('change', (e) => {
    kind = (e.target as HTMLSelectElement).value;
    page = 1;
    void load();
  });
  root.querySelector<HTMLSelectElement>('#player-sort')!.addEventListener('change', (e) => {
    sort = (e.target as HTMLSelectElement).value;
    page = 1;
    void load();
  });
  root.querySelector('#players-csv')!.addEventListener('click', async () => {
    const res = await api<Page<PlayerSummary> | PlayerSummary[]>(`/api/admin/players?${buildQuery(1, 500)}`);
    const rows = Array.isArray(res) ? res : res.items;
    downloadFile(
      `fliper-jogadores-${new Date().toISOString().slice(0, 10)}.csv`,
      playersToCsv(rows),
      'text/csv',
    );
    toast(`CSV exportado (${number(rows.length)} jogadores).`);
  });

  await load();
};

export const rankings: View = async (root) => {
  const { params } = parseHashRoute(location.hash);
  let game = params.get('game') || sortedCatalog[0]!.id;
  let q = params.get('q') || '';
  let sort = params.get('sort') || 'score';
  let page = 1;
  let perPage = 25;

  root.innerHTML = `
    <div class="panel">
      <div class="toolbar">
        <input id="rank-q" type="search" class="input-search" placeholder="🔍 Filtrar recordes por apelido ou ID do jogador..." value="${esc(q)}" />
        <div class="toolbar-filters">
          <select id="game">
            <option value="all" ${game === 'all' ? 'selected' : ''}>🌎 Todos os jogos (visão global)</option>
            ${sortedCatalog
              .map(
                (g) =>
                  `<option value="${esc(g.id)}" ${game === g.id ? 'selected' : ''}>${esc(g.emoji)} ${esc(g.title)} (${esc(g.id)})</option>`,
              )
              .join('')}
          </select>
          <select id="rank-sort">
            <option value="score" ${sort === 'score' ? 'selected' : ''}>Ordenar: Maior pontuação</option>
            <option value="recent" ${sort === 'recent' ? 'selected' : ''}>Ordenar: Mais recentes</option>
          </select>
        </div>
      </div>
      <div id="board"></div>
    </div>
  `;

  const board = root.querySelector<HTMLElement>('#board')!;
  const select = root.querySelector<HTMLSelectElement>('#game')!;

  const load = async () => {
    board.innerHTML = `<div class="loading-box"><div class="spinner"></div><span>Carregando ranking…</span></div>`;
    const sp = new URLSearchParams();
    sp.set('game', select.value);
    sp.set('sort', sort);
    sp.set('page', String(page));
    sp.set('per_page', String(perPage));
    if (q.trim()) sp.set('q', q.trim());

    let pg: Page<Entry>;
    try {
      pg = await api<Page<Entry>>(`/api/admin/entries?${sp.toString()}`);
    } catch {
      const targetGame = select.value === 'all' ? sortedCatalog[0]!.id : select.value;
      const rows = await api<Entry[]>(`/api/boards/${encodeURIComponent(targetGame)}?limit=100`);
      pg = paginateSlice(
        rows.map((r, i) => ({ ...r, game_id: targetGame, rank: i + 1 })),
        page,
        perPage,
      );
    }

    if (pg.items.length === 0) {
      board.innerHTML = `<div class="empty-state">Nenhum recorde encontrado para este filtro.</div>`;
      return;
    }

    const paginationHtml = renderPagination({
      total: pg.total,
      page: pg.page,
      per_page: pg.per_page,
      noun: 'recordes',
    });

    board.innerHTML = `
      ${paginationHtml}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Posição</th>
              <th>Jogo</th>
              <th>Jogador</th>
              <th>Pontos</th>
              <th>Detalhes da Partida</th>
              <th>Data</th>
              <th class="text-right">Moderação</th>
            </tr>
          </thead>
          <tbody>
            ${pg.items
              .map((e, i) => {
                const pos = e.rank ?? (pg.page - 1) * pg.per_page + i + 1;
                const pairs = formatDetailPairs(e.details);
                return `
                  <tr>
                    <td>${renderRankBadge(pos)}</td>
                    <td>${e.game_id ? renderGameBadge(e.game_id) : renderGameBadge(select.value)}</td>
                    <td>${renderPlayerCell({ id: e.player, name: e.name })}</td>
                    <td><strong class="text-gold">${number(e.score)}</strong></td>
                    <td>
                      ${
                        pairs.length
                          ? pairs
                              .map(
                                (d) =>
                                  `<span class="detail-chip">${esc(d.label)}: <strong>${esc(d.value)}</strong></span>`,
                              )
                              .join(' ')
                          : '<span class="muted">—</span>'
                      }
                    </td>
                    <td>
                      <div>${dateTime(e.date)}</div>
                      <small class="muted">${ago(e.date)}</small>
                    </td>
                    <td class="text-right">
                      <button type="button" class="btn btn-xs btn-danger" data-id="${esc(e.id)}" data-name="${esc(e.name)}" data-score="${esc(number(e.score))}">
                        Remover
                      </button>
                    </td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
      ${paginationHtml}
    `;

    bindPagination(
      board,
      (nextPage) => {
        page = nextPage;
        void load();
      },
      (nextPerPage) => {
        perPage = nextPerPage;
        page = 1;
        void load();
      },
    );
    bindPlayerTriggers(board, () => void load());
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  root.querySelector<HTMLInputElement>('#rank-q')!.addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      q = (e.target as HTMLInputElement).value;
      page = 1;
      void load();
    }, 280);
  });
  select.addEventListener('change', () => {
    game = select.value;
    page = 1;
    void load();
  });
  root.querySelector<HTMLSelectElement>('#rank-sort')!.addEventListener('change', (e) => {
    sort = (e.target as HTMLSelectElement).value;
    page = 1;
    void load();
  });

  board.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (!id) return;
    const playerName = btn.dataset.name ?? '';
    const scoreText = btn.dataset.score ?? '';
    const ok = await confirmDialog({
      title: 'Remover recorde do ranking',
      message: `Deseja remover o recorde de ${playerName} (${scoreText} pts) permanentemente do ranking?`,
      confirmLabel: 'Remover recorde',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/admin/entries/${encodeURIComponent(id)}`, 'DELETE');
      toast('Recorde removido do ranking.');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha ao remover recorde.', 'error');
    }
  });

  await load();
};

export const reports: View = async (root, onBadgeUpdate) => {
  type Mode = 'reports' | 'messages';
  let mode: Mode = 'reports';
  let reportSearch = '';
  let reportPage = 1;
  let reportPerPage = 25;

  let msgRoom = 'all';
  let msgStatus = 'all';
  let msgSearch = '';
  let msgPage = 1;
  let msgPerPage = 25;

  const render = async () => {
    const reportRows = await api<Report[]>('/api/admin/reports');
    onBadgeUpdate?.(reportRows.length);

    root.innerHTML = `
      <div class="subtabs">
        <button type="button" class="subtab ${mode === 'reports' ? 'active' : ''}" data-mode="reports">
          🚨 Denúncias Abertas
          ${reportRows.length > 0 ? `<span class="badge-count">${number(reportRows.length)}</span>` : ''}
        </button>
        <button type="button" class="subtab ${mode === 'messages' ? 'active' : ''}" data-mode="messages">
          💬 Histórico Completo do Chat
        </button>
      </div>
      <div id="mod-body" class="panel"></div>
    `;

    root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        mode = btn.dataset.mode as Mode;
        void render();
      });
    });

    const body = root.querySelector<HTMLElement>('#mod-body')!;

    if (mode === 'reports') {
      const drawReports = () => {
        const q = reportSearch.trim().toLowerCase();
        const filtered = reportRows.filter(
          (r) =>
            !q ||
            r.author_name.toLowerCase().includes(q) ||
            r.text.toLowerCase().includes(q) ||
            r.room.toLowerCase().includes(q),
        );
        const pg = paginateSlice(filtered, reportPage, reportPerPage);
        reportPage = pg.page;

        body.innerHTML = `
          <div class="toolbar">
            <input id="rep-q" type="search" class="input-search" placeholder="🔍 Filtrar denúncias por autor, mensagem ou sala..." value="${esc(reportSearch)}" />
            <span class="muted">${number(reportRows.length)} mensagem(ns) com denúncia aberta</span>
          </div>
          ${
            pg.total === 0
              ? `<div class="empty-state">Nenhuma denúncia aberta encontrada. 🎉</div>`
              : `
                ${renderPagination({ total: pg.total, page: pg.page, per_page: pg.per_page, noun: 'denúncias' })}
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Sala</th>
                        <th>Autor</th>
                        <th>Mensagem</th>
                        <th>Denúncias</th>
                        <th>Última Denúncia</th>
                        <th class="text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${pg.items
                        .map(
                          (r) => `
                        <tr>
                          <td>${renderRoomBadge(r.room)}</td>
                          <td>${renderPlayerCell({ id: r.author_id, name: r.author_name })}</td>
                          <td class="msg-cell">${r.deleted ? '<em class="muted">já removida</em>' : esc(r.text)}</td>
                          <td><span class="tag tag-danger">${number(r.reports)}</span></td>
                          <td>
                            <div>${ago(r.last_reported_at)}</div>
                            <small class="muted">${dateTime(r.last_reported_at)}</small>
                          </td>
                          <td class="text-right actions-cell">
                            ${
                              r.deleted
                                ? ''
                                : `<button type="button" class="btn btn-xs btn-danger" data-hide="${esc(r.message_id)}">Remover</button>`
                            }
                            <button type="button" class="btn btn-xs btn-ghost" data-dismiss="${esc(r.message_id)}">Ignorar</button>
                          </td>
                        </tr>
                      `,
                        )
                        .join('')}
                    </tbody>
                  </table>
                </div>
                ${renderPagination({ total: pg.total, page: pg.page, per_page: pg.per_page, noun: 'denúncias' })}
              `
          }
        `;

        const input = body.querySelector<HTMLInputElement>('#rep-q');
        input?.addEventListener('input', () => {
          reportSearch = input.value;
          reportPage = 1;
          const pos = input.selectionStart ?? input.value.length;
          drawReports();
          const nextInput = body.querySelector<HTMLInputElement>('#rep-q');
          nextInput?.focus();
          nextInput?.setSelectionRange(pos, pos);
        });

        bindPagination(
          body,
          (nextPage) => {
            reportPage = nextPage;
            drawReports();
          },
          (nextPerPage) => {
            reportPerPage = nextPerPage;
            reportPage = 1;
            drawReports();
          },
        );
        bindPlayerTriggers(body, () => void render());
      };

      drawReports();
    } else {
      body.innerHTML = `
        <div class="toolbar">
          <input id="msg-q" type="search" class="input-search" placeholder="🔍 Buscar mensagens por texto, autor ou ID..." value="${esc(msgSearch)}" />
          <div class="toolbar-filters">
            <select id="msg-room">
              <option value="all" ${msgRoom === 'all' ? 'selected' : ''}>Todas as salas</option>
              <option value="geral" ${msgRoom === 'geral' ? 'selected' : ''}>🌎 Sala Geral</option>
              ${sortedCatalog
                .map(
                  (g) =>
                    `<option value="${esc(g.id)}" ${msgRoom === g.id ? 'selected' : ''}>${esc(g.emoji)} ${esc(g.title)}</option>`,
                )
                .join('')}
            </select>
            <select id="msg-status">
              <option value="all" ${msgStatus === 'all' ? 'selected' : ''}>Status: Todas</option>
              <option value="active" ${msgStatus === 'active' ? 'selected' : ''}>Apenas ativas</option>
              <option value="reported" ${msgStatus === 'reported' ? 'selected' : ''}>Com denúncias</option>
              <option value="deleted" ${msgStatus === 'deleted' ? 'selected' : ''}>Removidas</option>
            </select>
          </div>
        </div>
        <div id="msg-list"></div>
      `;

      const msgList = body.querySelector<HTMLElement>('#msg-list')!;
      const loadMessages = async () => {
        msgList.innerHTML = `<div class="loading-box"><div class="spinner"></div><span>Carregando mensagens…</span></div>`;
        const sp = new URLSearchParams();
        sp.set('room', msgRoom);
        sp.set('status', msgStatus);
        sp.set('page', String(msgPage));
        sp.set('per_page', String(msgPerPage));
        if (msgSearch.trim()) sp.set('q', msgSearch.trim());

        const pg = await api<Page<AdminMessage>>(`/api/admin/chat/messages?${sp.toString()}`);
        if (pg.items.length === 0) {
          msgList.innerHTML = `<div class="empty-state">Nenhuma mensagem encontrada para este filtro.</div>`;
          return;
        }

        const paginationHtml = renderPagination({
          total: pg.total,
          page: pg.page,
          per_page: pg.per_page,
          noun: 'mensagens',
        });

        msgList.innerHTML = `
          ${paginationHtml}
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Sala</th>
                  <th>Autor</th>
                  <th>Mensagem</th>
                  <th>Denúncias</th>
                  <th class="text-right">Moderação</th>
                </tr>
              </thead>
              <tbody>
                ${pg.items
                  .map(
                    (m) => `
                  <tr class="${m.deleted ? 'row-dim' : ''}">
                    <td>
                      <div>${dateTime(m.created_at)}</div>
                      <small class="muted">${ago(m.created_at)}</small>
                    </td>
                    <td>${renderRoomBadge(m.room)}</td>
                    <td>${renderPlayerCell({ id: m.player_id, name: m.name })}</td>
                    <td class="msg-cell">${m.deleted ? '<em class="muted">Mensagem removida</em>' : esc(m.text)}</td>
                    <td>${m.reports > 0 ? `<span class="tag tag-danger">${number(m.reports)}</span>` : '<span class="muted">0</span>'}</td>
                    <td class="text-right">
                      ${
                        m.deleted
                          ? '<span class="muted">Moderação concluída</span>'
                          : `<button type="button" class="btn btn-xs btn-danger" data-hide="${esc(m.id)}">Remover</button>`
                      }
                    </td>
                  </tr>
                `,
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
          ${paginationHtml}
        `;

        bindPagination(
          msgList,
          (nextPage) => {
            msgPage = nextPage;
            void loadMessages();
          },
          (nextPerPage) => {
            msgPerPage = nextPerPage;
            msgPage = 1;
            void loadMessages();
          },
        );
        bindPlayerTriggers(msgList, () => void loadMessages());
      };

      let timer: ReturnType<typeof setTimeout> | undefined;
      body.querySelector<HTMLInputElement>('#msg-q')!.addEventListener('input', (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          msgSearch = (e.target as HTMLInputElement).value;
          msgPage = 1;
          void loadMessages();
        }, 280);
      });
      body.querySelector<HTMLSelectElement>('#msg-room')!.addEventListener('change', (e) => {
        msgRoom = (e.target as HTMLSelectElement).value;
        msgPage = 1;
        void loadMessages();
      });
      body.querySelector<HTMLSelectElement>('#msg-status')!.addEventListener('change', (e) => {
        msgStatus = (e.target as HTMLSelectElement).value;
        msgPage = 1;
        void loadMessages();
      });

      await loadMessages();
    }
  };

  root.addEventListener('click', async (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-hide],[data-dismiss]');
    if (!el) return;
    const hide = el.dataset.hide;
    const dismiss = el.dataset.dismiss;
    if (hide) {
      const ok = await confirmDialog({
        title: 'Remover mensagem do chat',
        message: 'A mensagem será apagada para todos na sala e suas denúncias serão encerradas.',
        confirmLabel: 'Remover mensagem',
        danger: true,
      });
      if (!ok) return;
      try {
        await api(`/api/admin/chat/messages/${encodeURIComponent(hide)}`, 'DELETE');
        toast('Mensagem removida e denúncia encerrada.');
        await render();
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Falha ao moderar mensagem.', 'error');
      }
    } else if (dismiss) {
      try {
        await api(`/api/admin/reports/${encodeURIComponent(dismiss)}`, 'DELETE');
        toast('Denúncia arquivada.');
        await render();
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Falha ao ignorar denúncia.', 'error');
      }
    }
  });

  await render();
};

const DOW_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

export function renderHeatmapGrid(cells: readonly HourlyCell[]): string {
  const map = new Map<string, HourlyCell>();
  let max = 1;
  let peakCell: HourlyCell | null = null;
  for (const c of cells) {
    map.set(`${c.dow}:${c.hour}`, c);
    if (c.sessions > max) max = c.sessions;
    if (!peakCell || c.sessions > peakCell.sessions) peakCell = c;
  }

  const headerHours = Array.from({ length: 24 }, (_, h) => `<th>${String(h).padStart(2, '0')}h</th>`).join('');
  const rows = DOW_LABELS.map((dayLabel, dow) => {
    const cols = Array.from({ length: 24 }, (_, hour) => {
      const cell = map.get(`${dow}:${hour}`);
      const count = cell?.sessions ?? 0;
      const players = cell?.players ?? 0;
      const alpha = count === 0 ? 0.04 : Math.min(0.95, 0.18 + (count / max) * 0.77);
      const tip = `${dayLabel} ${String(hour).padStart(2, '0')}h–${String((hour + 1) % 24).padStart(2, '0')}h (BRT): ${number(count)} partida(s), ${number(players)} jogador(es)`;
      return `<td class="heat-cell ${count > 0 ? 'has-val' : ''}" style="background:rgba(124, 92, 255, ${alpha.toFixed(2)})" title="${esc(tip)}">${count > 0 ? number(count) : ''}</td>`;
    }).join('');
    return `<tr><th class="heat-day">${dayLabel}</th>${cols}</tr>`;
  }).join('');

  const peakSummary = peakCell
    ? `Horário de maior pico: <strong>${DOW_LABELS[peakCell.dow] ?? ''} às ${String(peakCell.hour).padStart(2, '0')}h BRT</strong> (${number(peakCell.sessions)} partidas)`
    : 'Sem partidas registradas no período';

  return `
    <div class="heat-summary">${peakSummary}</div>
    <div class="table-wrap heat-wrap">
      <table class="heat-table">
        <thead>
          <tr><th>Dia \\ Hora</th>${headerHours}</tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

export const liveMonitoring: View = async (root) => {
  let days = 30;
  let autoRefresh = false;
  let bounceSort: 'bounce' | 'sessions' | 'avg' = 'bounce';
  let bouncePage = 1;
  let bouncePerPage = 15;
  let snap = await api<MonitoringSnapshot>(`/api/admin/monitoring?days=${days}`);

  let intervalId: ReturnType<typeof setInterval> | undefined;
  const setupAutoRefresh = () => {
    if (intervalId) clearInterval(intervalId);
    if (!autoRefresh) return;
    intervalId = setInterval(async () => {
      if (!document.body.contains(root)) {
        clearInterval(intervalId);
        return;
      }
      try {
        snap = await api<MonitoringSnapshot>(`/api/admin/monitoring?days=${days}`);
        draw();
      } catch {
        /* ignore background refresh failure */
      }
    }, 10_000);
  };

  const draw = () => {
    const { live, online_players, recent_sessions, funnel, retention, heatmap, game_health, server } = snap;
    const d1Pct = percent(retention.d1_retained, retention.d1_eligible, 1);
    const d7Pct = percent(retention.d7_retained, retention.d7_eligible, 1);
    const d30Pct = percent(retention.d30_retained, retention.d30_eligible, 1);
    const retPct = percent(retention.returning_players, funnel.played_1, 1);
    const multiPct = percent(retention.multi_session_players, funnel.played_1, 1);

    const funnelSteps = [
      { label: '1. Visitantes / Contas criadas', val: funnel.total_players, base: funnel.total_players, color: '#6366f1' },
      { label: '2. Jogaram ao menos 1 partida', val: funnel.played_1, base: funnel.total_players, color: '#8b5cf6' },
      { label: '3. Jogaram 5 ou mais partidas', val: funnel.played_5, base: funnel.total_players, color: '#0ea5e9' },
      { label: '4. Vincularam conta Google', val: funnel.google_linked, base: funnel.total_players, color: '#10b981' },
      { label: '5. Publicaram recorde no Ranking', val: funnel.ranked, base: funnel.total_players, color: '#f59e0b' },
      { label: '6. Enviaram mensagem no Chat', val: funnel.chatted, base: funnel.total_players, color: '#ec4899' },
    ];

    const sortedBounce = [...game_health].sort((a, b) => {
      const rateA = a.sessions > 0 ? a.short_sessions / a.sessions : 0;
      const rateB = b.sessions > 0 ? b.short_sessions / b.sessions : 0;
      if (bounceSort === 'sessions') return b.sessions - a.sessions;
      if (bounceSort === 'avg') return b.avg_duration_sec - a.avg_duration_sec;
      return rateB - rateA || b.short_sessions - a.short_sessions;
    });
    const bouncePg = paginateSlice(sortedBounce, bouncePage, bouncePerPage);

    root.innerHTML = `
      <div class="toolbar">
        <div>
          <h2 class="section-heading">🟢 Pulso em Tempo Real & Engajamento</h2>
          <p class="panel-sub">Presença ativa no WebSocket, tráfego imediato, funil de conversão, retenção e mapa de calor</p>
        </div>
        <div class="toolbar-group">
          <button type="button" id="toggle-live" class="btn ${autoRefresh ? 'btn-primary' : 'btn-secondary'}">
            ${autoRefresh ? '⚡ Auto-atualizar (10s): ON' : '⏸ Auto-atualizar (10s): OFF'}
          </button>
          <button type="button" id="manual-live" class="btn btn-ghost">↻ Atualizar agora</button>
        </div>
      </div>

      <div class="stats">
        ${kpiCard(
          '🟢',
          'Online Agora',
          number(online_players.length),
          `<strong>${number(server.ws_subscribers)}</strong> conexões WebSocket ativas`,
          online_players.length > 0 ? 'stat-highlight' : '',
        )}
        ${kpiCard(
          '⚡',
          'Partidas (5m / 15m)',
          `${number(live.sessions_5m)} / ${number(live.sessions_15m)}`,
          `<strong>${number(live.active_players_15m)}</strong> jogadores ativos nos últimos 15 min`,
        )}
        ${kpiCard(
          '🕹️',
          'Última Hora (60m)',
          number(live.sessions_60m),
          `<strong>${number(live.active_players_60m)}</strong> jogadores · <strong>${number(live.entries_60m)}</strong> recordes`,
        )}
        ${kpiCard(
          '🔄',
          'Jogadores Recorrentes',
          number(retention.returning_players),
          `<strong>${esc(retPct)}</strong> jogaram em 2+ dias · <strong>${esc(multiPct)}</strong> 2+ partidas`,
        )}
        ${kpiCard(
          '📅',
          'Retenção D1 / D7',
          `${d1Pct} / ${d7Pct}`,
          `D1: ${number(retention.d1_retained)}/${number(retention.d1_eligible)} · D7: ${number(retention.d7_retained)}/${number(retention.d7_eligible)}`,
        )}
        ${kpiCard(
          '🏅',
          'Retenção D30',
          d30Pct,
          `${number(retention.d30_retained)} de ${number(retention.d30_eligible)} jogadores elegíveis (30d+)`,
        )}
      </div>

      <div class="grid-2">
        <div class="panel">
          <div class="panel-head">
            <div>
              <h2>🟢 Jogadores Online Neste Instante (${online_players.length})</h2>
              <p class="panel-sub">Heartbeats recebidos nos últimos 10 minutos</p>
            </div>
          </div>
          ${
            online_players.length === 0
              ? `<div class="empty-state">Nenhum jogador com heartbeat ativo neste momento.</div>`
              : `<div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Jogador</th>
                        <th>Onde está</th>
                        <th>Status no Chat</th>
                        <th>Último Sinal</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${online_players
                        .map(
                          (p) => `
                        <tr>
                          <td>${renderPlayerCell({ id: p.uid, name: p.name, google: true })}</td>
                          <td>${p.g ? renderGameBadge(p.g, { linkTab: 'sessoes' }) : '<span class="muted">🏠 No Hub / Menus</span>'}</td>
                          <td>${p.typing ? `<span class="tag">✍️ Digitando (${esc(p.typing)})</span>` : '<span class="muted">—</span>'}</td>
                          <td>${ago(new Date(p.at).toISOString())}</td>
                        </tr>
                      `,
                        )
                        .join('')}
                    </tbody>
                  </table>
                </div>`
          }
        </div>

        <div class="panel">
          <div class="panel-head">
            <div>
              <h2>⚡ Últimas Partidas Finalizadas</h2>
              <p class="panel-sub">Feed em tempo real das sessões mais recentes</p>
            </div>
            <a href="#sessoes" class="btn btn-xs btn-ghost">Ver histórico completo →</a>
          </div>
          ${
            recent_sessions.length === 0
              ? `<div class="empty-state">Nenhuma partida registrada nas últimas 24 horas.</div>`
              : `<div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Há</th>
                        <th>Jogador</th>
                        <th>Jogo</th>
                        <th>Duração</th>
                        <th>Pontos</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${recent_sessions
                        .slice(0, 8)
                        .map(
                          (s) => `
                        <tr>
                          <td><small class="muted">${ago(s.endedAt)}</small></td>
                          <td>${renderPlayerCell({ id: s.playerId, name: s.playerName, showId: false })}</td>
                          <td>${renderGameBadge(s.gameId)}</td>
                          <td><span class="pill-duration">${duration(s.durationSec)}</span></td>
                          <td><strong>${s.score > 0 ? number(s.score) : '—'}</strong></td>
                        </tr>
                      `,
                        )
                        .join('')}
                    </tbody>
                  </table>
                </div>`
          }
        </div>
      </div>

      <div class="grid-2">
        <div class="panel">
          <div class="panel-head">
            <div>
              <h2>🔻 Funil de Conversão de Jogadores</h2>
              <p class="panel-sub">Jornada desde o primeiro acesso até o ranking e chat</p>
            </div>
          </div>
          <div class="progress-list">
            ${funnelSteps
              .map((step, idx) => {
                const pctTotal = percent(step.val, step.base, 1);
                const prevVal = idx > 0 ? funnelSteps[idx - 1]!.val : step.val;
                const stepConv = idx > 0 ? ` · ${percent(step.val, prevVal, 0)} da etapa anterior` : '';
                const barW = step.base > 0 ? Math.max(3, Math.round((step.val / step.base) * 100)) : 0;
                return `
                  <div class="progress-row">
                    <div class="progress-meta">
                      <strong>${esc(step.label)}</strong>
                      <span class="progress-stats">
                        <strong class="text-accent">${number(step.val)}</strong> (${esc(pctTotal)} do total${esc(stepConv)})
                      </span>
                    </div>
                    <div class="progress-track">
                      <div class="progress-fill" style="width:${barW}%;background:${step.color}"></div>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <div>
              <h2>📈 Coortes de Retenção & Fidelidade</h2>
              <p class="panel-sub">Proporção de jogadores que retornam ao longo do tempo</p>
            </div>
          </div>
          <div class="progress-list">
            ${[
              {
                label: 'Engajamento Imediato (2+ partidas jogadas)',
                num: retention.multi_session_players,
                den: funnel.played_1,
                color: '#8b5cf6',
              },
              {
                label: 'Retorno Multi-Dia (jogaram em 2+ dias diferentes)',
                num: retention.returning_players,
                den: funnel.played_1,
                color: '#0ea5e9',
              },
              {
                label: 'Retenção D1 (jogou novamente ≥24h após cadastro)',
                num: retention.d1_retained,
                den: retention.d1_eligible,
                color: '#10b981',
              },
              {
                label: 'Retenção D7 (jogou novamente ≥7 dias após cadastro)',
                num: retention.d7_retained,
                den: retention.d7_eligible,
                color: '#f59e0b',
              },
              {
                label: 'Retenção D30 (jogou novamente ≥30 dias após cadastro)',
                num: retention.d30_retained,
                den: retention.d30_eligible,
                color: '#ec4899',
              },
            ]
              .map((r) => {
                const p = percent(r.num, r.den, 1);
                const w = r.den > 0 ? Math.max(3, Math.round((r.num / r.den) * 100)) : 0;
                return `
                  <div class="progress-row">
                    <div class="progress-meta">
                      <strong>${esc(r.label)}</strong>
                      <span class="progress-stats">
                        <strong class="text-gold">${esc(p)}</strong> (${number(r.num)} / ${number(r.den)} elegíveis)
                      </span>
                    </div>
                    <div class="progress-track">
                      <div class="progress-fill" style="width:${w}%;background:${r.color}"></div>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h2>🔥 Mapa de Calor de Horários de Pico (Dia da Semana × Hora BRT)</h2>
            <p class="panel-sub">Distribuição das partidas por faixa horária nos últimos ${days} dias</p>
          </div>
          <div class="seg-group">
            ${[7, 30, 90]
              .map(
                (d) =>
                  `<button type="button" class="seg-btn ${days === d ? 'active' : ''}" data-heat-days="${d}">${d}d</button>`,
              )
              .join('')}
          </div>
        </div>
        ${renderHeatmapGrid(heatmap)}
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h2>📉 Qualidade da Sessão & Taxa de Abandono Rápido (&lt;10s) por Jogo</h2>
            <p class="panel-sub">Identifique jogos onde os jogadores saem nos primeiros 10 segundos (dificuldade inicial ou UX)</p>
          </div>
          <select id="bounce-sort">
            <option value="bounce" ${bounceSort === 'bounce' ? 'selected' : ''}>Ordenar: Maior taxa de abandono (%)</option>
            <option value="sessions" ${bounceSort === 'sessions' ? 'selected' : ''}>Ordenar: Mais partidas</option>
            <option value="avg" ${bounceSort === 'avg' ? 'selected' : ''}>Ordenar: Maior duração média</option>
          </select>
        </div>
        ${
          bouncePg.total === 0
            ? `<div class="empty-state">Nenhuma sessão registrada para calcular taxa de abandono.</div>`
            : `
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Jogo</th>
                      <th>Partidas</th>
                      <th>Saídas &lt;10s</th>
                      <th>Taxa de Abandono (Bounce)</th>
                      <th>Duração Média</th>
                      <th>Duração Máxima</th>
                      <th>Média de Pontos</th>
                      <th>Recorde de Sessão</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${bouncePg.items
                      .map((g) => {
                        const rate = g.sessions > 0 ? (g.short_sessions / g.sessions) * 100 : 0;
                        const badgeClass =
                          rate >= 35 ? 'tag-danger' : rate >= 18 ? 'tag-warn' : 'tag-ok';
                        return `
                          <tr>
                            <td>${renderGameBadge(g.game_id, { showCategory: true, linkTab: 'sessoes' })}</td>
                            <td><strong>${number(g.sessions)}</strong></td>
                            <td>${number(g.short_sessions)}</td>
                            <td><span class="tag ${badgeClass}">${percent(g.short_sessions, g.sessions, 1)}</span></td>
                            <td><span class="pill-duration">${duration(g.avg_duration_sec)}</span></td>
                            <td>${duration(g.max_duration_sec)}</td>
                            <td>${number(g.avg_score)}</td>
                            <td><strong class="text-gold">${number(g.max_score)}</strong></td>
                          </tr>
                        `;
                      })
                      .join('')}
                  </tbody>
                </table>
              </div>
              <div id="bounce-pag">
                ${renderPagination({ total: bouncePg.total, page: bouncePg.page, per_page: bouncePg.per_page, noun: 'jogos' })}
              </div>
            `
        }
      </div>
    `;

    root.querySelector('#toggle-live')?.addEventListener('click', () => {
      autoRefresh = !autoRefresh;
      setupAutoRefresh();
      draw();
      toast(autoRefresh ? 'Auto-atualização ativada (a cada 10s).' : 'Auto-atualização pausada.', 'info');
    });

    root.querySelector('#manual-live')?.addEventListener('click', async () => {
      snap = await api<MonitoringSnapshot>(`/api/admin/monitoring?days=${days}`);
      draw();
      toast('Dados em tempo real atualizados!', 'info');
    });

    root.querySelectorAll<HTMLButtonElement>('[data-heat-days]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const nextDays = Number(btn.dataset.heatDays);
        if (!nextDays || nextDays === days) return;
        days = nextDays;
        snap = await api<MonitoringSnapshot>(`/api/admin/monitoring?days=${days}`);
        draw();
      });
    });

    root.querySelector<HTMLSelectElement>('#bounce-sort')?.addEventListener('change', (e) => {
      bounceSort = (e.target as HTMLSelectElement).value as typeof bounceSort;
      bouncePage = 1;
      draw();
    });

    const bouncePagEl = root.querySelector<HTMLElement>('#bounce-pag');
    if (bouncePagEl) {
      bindPagination(
        bouncePagEl,
        (nextPage) => {
          bouncePage = nextPage;
          draw();
        },
        (nextPerPage) => {
          bouncePerPage = nextPerPage;
          bouncePage = 1;
          draw();
        },
      );
    }

    bindPlayerTriggers(root, () => {
      void api<MonitoringSnapshot>(`/api/admin/monitoring?days=${days}`).then((fresh) => {
        snap = fresh;
        draw();
      });
    });
  };

  draw();
};

export const securityAndHealth: View = async (root) => {
  type SubMode = 'anticheat' | 'errors' | 'infra';
  let subMode: SubMode = 'anticheat';

  let anomSeverity = 'all';
  let anomReason = 'all';
  let anomSearch = '';
  let anomPage = 1;
  let anomPerPage = 25;

  let errKind = 'all';
  let errGame = 'all';
  let errSearch = '';
  let errPage = 1;
  let errPerPage = 25;

  let snap = await api<MonitoringSnapshot>('/api/admin/monitoring?days=30');

  const draw = async () => {
    const { anomalies, server, db, error_groups, live } = snap;
    const highAnomalies = anomalies.filter((a) => a.severity === 'high').length;

    root.innerHTML = `
      <div class="stats">
        ${kpiCard(
          '🛡️',
          'Recordes Suspeitos',
          number(anomalies.length),
          highAnomalies > 0
            ? `<span class="stat-alert">${number(highAnomalies)} de alta severidade</span>`
            : `<span class="text-success">✓ Nenhum alerta crítico</span>`,
          highAnomalies > 0 ? 'stat-danger' : '',
        )}
        ${kpiCard(
          '🐛',
          'Erros no Cliente (24h)',
          number(live.errors_24h),
          `<strong>${number(error_groups.length)}</strong> tipos agrupados no histórico`,
          live.errors_24h > 0 ? 'stat-danger' : '',
        )}
        ${kpiCard(
          '⏱️',
          'Uptime da API',
          duration(server.uptime_sec),
          `No ar desde <strong>${esc(dateTime(server.started_at))}</strong>`,
        )}
        ${kpiCard(
          '⚡',
          'Latência HTTP',
          `${server.avg_latency_ms.toFixed(2).replace('.', ',')} ms`,
          `Pico máx: <strong>${server.max_latency_ms.toFixed(1).replace('.', ',')} ms</strong>`,
          'stat-highlight',
        )}
        ${kpiCard(
          '📡',
          'Requisições HTTP',
          number(server.requests_total),
          `2xx: <strong>${number(server.status_2xx)}</strong> · 4xx: <strong>${number(server.status_4xx)}</strong> · 429: <strong>${number(server.status_429)}</strong> · 5xx: <strong>${number(server.status_5xx)}</strong>`,
        )}
        ${kpiCard(
          '🗄️',
          'Banco PostgreSQL',
          bytes(db.database_size_bytes),
          `Pool: <strong>${db.pool_size}</strong> conexões (${db.pool_idle} ociosas)`,
        )}
      </div>

      <div class="subtabs">
        <button type="button" class="subtab ${subMode === 'anticheat' ? 'active' : ''}" data-submode="anticheat">
          🛡️ Detector Anti-Cheat & Anomalias
          ${anomalies.length > 0 ? `<span class="badge-count">${number(anomalies.length)}</span>` : ''}
        </button>
        <button type="button" class="subtab ${subMode === 'errors' ? 'active' : ''}" data-submode="errors">
          🐛 Telemetria de Erros do Cliente
          ${live.errors_24h > 0 ? `<span class="badge-count">${number(live.errors_24h)}</span>` : ''}
        </button>
        <button type="button" class="subtab ${subMode === 'infra' ? 'active' : ''}" data-submode="infra">
          🗄️ Saúde do Servidor & Banco PostgreSQL
        </button>
      </div>

      <div id="sec-body"></div>
    `;

    root.querySelectorAll<HTMLButtonElement>('[data-submode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        subMode = btn.dataset.submode as SubMode;
        void draw();
      });
    });

    const body = root.querySelector<HTMLElement>('#sec-body')!;

    if (subMode === 'anticheat') {
      const renderAnomalies = () => {
        const q = anomSearch.trim().toLowerCase();
        const filtered = anomalies.filter((a) => {
          if (anomSeverity !== 'all' && a.severity !== anomSeverity) return false;
          if (anomReason !== 'all' && a.reason !== anomReason) return false;
          if (q) {
            const meta = getGameMeta(a.game_id);
            const hay = `${a.player_name} ${a.player_id} ${a.game_id} ${meta.title}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });
        const pg = paginateSlice(filtered, anomPage, anomPerPage);
        anomPage = pg.page;

        body.innerHTML = `
          <div class="panel">
            <div class="panel-head">
              <div>
                <h2>🛡️ Auditoria Automática de Rankings (Anti-Cheat)</h2>
                <p class="panel-sub">Cruza os recordes do ranking (<code>entries</code>) com o histórico real de partidas (<code>play_sessions</code>) para detectar submissões forjadas ou discrepantes</p>
              </div>
            </div>
            <div class="toolbar">
              <input id="anom-q" type="search" class="input-search" placeholder="🔍 Buscar por jogador, ID ou jogo..." value="${esc(anomSearch)}" />
              <div class="toolbar-filters">
                <select id="anom-sev">
                  <option value="all" ${anomSeverity === 'all' ? 'selected' : ''}>Todas as severidades</option>
                  <option value="high" ${anomSeverity === 'high' ? 'selected' : ''}>🚨 Alta severidade</option>
                  <option value="medium" ${anomSeverity === 'medium' ? 'selected' : ''}>⚠️ Média severidade</option>
                </select>
                <select id="anom-reason">
                  <option value="all" ${anomReason === 'all' ? 'selected' : ''}>Todos os diagnósticos</option>
                  <option value="no_session" ${anomReason === 'no_session' ? 'selected' : ''}>Recorde sem partida registrada</option>
                  <option value="score_mismatch" ${anomReason === 'score_mismatch' ? 'selected' : ''}>Recorde maior que a maior sessão</option>
                  <option value="short_high_score" ${anomReason === 'short_high_score' ? 'selected' : ''}>Alta pontuação em ≤4s</option>
                </select>
              </div>
            </div>
            ${
              pg.total === 0
                ? `<div class="empty-state">Nenhuma anomalia encontrada nos rankings! Todos os recordes possuem sessões compatíveis. ✅</div>`
                : `
                  ${renderPagination({ total: pg.total, page: pg.page, per_page: pg.per_page, noun: 'anomalias' })}
                  <div class="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Severidade</th>
                          <th>Diagnóstico</th>
                          <th>Jogo</th>
                          <th>Jogador</th>
                          <th>Pontos no Ranking</th>
                          <th>Maior Sessão</th>
                          <th>Nº Partidas</th>
                          <th>Data</th>
                          <th class="text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${pg.items
                          .map((a) => {
                            const info = anomalyReasonLabel(a.reason);
                            return `
                              <tr>
                                <td>
                                  <span class="tag ${a.severity === 'high' ? 'tag-danger' : 'tag-warn'}">
                                    ${a.severity === 'high' ? '🚨 Alta' : '⚠️ Média'}
                                  </span>
                                </td>
                                <td title="${esc(info.desc)}">
                                  <strong>${esc(info.title)}</strong>
                                  <small class="cell-sub">${esc(info.desc)}</small>
                                </td>
                                <td>${renderGameBadge(a.game_id, { linkTab: 'rankings' })}</td>
                                <td>${renderPlayerCell({ id: a.player_id, name: a.player_name })}</td>
                                <td><strong class="text-gold">${number(a.score)}</strong></td>
                                <td>${a.max_session_score !== null ? number(a.max_session_score) : '<span class="muted">Nenhuma</span>'}</td>
                                <td>${number(a.session_count)}</td>
                                <td>
                                  <div>${dateTime(a.created_at)}</div>
                                  <small class="muted">${ago(a.created_at)}</small>
                                </td>
                                <td class="text-right actions-cell">
                                  <button type="button" class="btn btn-xs btn-ghost" data-player-modal="${esc(a.player_id)}">Ficha</button>
                                  <button type="button" class="btn btn-xs btn-danger" data-del-anom="${esc(a.entry_id)}" data-name="${esc(a.player_name)}">Remover Recorde</button>
                                </td>
                              </tr>
                            `;
                          })
                          .join('')}
                      </tbody>
                    </table>
                  </div>
                  ${renderPagination({ total: pg.total, page: pg.page, per_page: pg.per_page, noun: 'anomalias' })}
                `
            }
          </div>
        `;

        const qInput = body.querySelector<HTMLInputElement>('#anom-q');
        qInput?.addEventListener('input', () => {
          anomSearch = qInput.value;
          anomPage = 1;
          const pos = qInput.selectionStart ?? qInput.value.length;
          renderAnomalies();
          const next = body.querySelector<HTMLInputElement>('#anom-q');
          next?.focus();
          next?.setSelectionRange(pos, pos);
        });
        body.querySelector<HTMLSelectElement>('#anom-sev')?.addEventListener('change', (e) => {
          anomSeverity = (e.target as HTMLSelectElement).value;
          anomPage = 1;
          renderAnomalies();
        });
        body.querySelector<HTMLSelectElement>('#anom-reason')?.addEventListener('change', (e) => {
          anomReason = (e.target as HTMLSelectElement).value;
          anomPage = 1;
          renderAnomalies();
        });

        bindPagination(
          body,
          (nextPage) => {
            anomPage = nextPage;
            renderAnomalies();
          },
          (nextPerPage) => {
            anomPerPage = nextPerPage;
            anomPage = 1;
            renderAnomalies();
          },
        );
        bindPlayerTriggers(body, async () => {
          snap = await api<MonitoringSnapshot>('/api/admin/monitoring?days=30');
          void draw();
        });

        body.querySelectorAll<HTMLButtonElement>('[data-del-anom]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.dataset.delAnom;
            if (!id) return;
            const ok = await confirmDialog({
              title: 'Remover recorde suspeito',
              message: `Confirmar a remoção do recorde suspeito de ${btn.dataset.name ?? ''}?`,
              confirmLabel: 'Remover do ranking',
              danger: true,
            });
            if (!ok) return;
            try {
              await api(`/api/admin/entries/${encodeURIComponent(id)}`, 'DELETE');
              snap.anomalies = snap.anomalies.filter((a) => a.entry_id !== id);
              toast('Recorde suspeito removido com sucesso.');
              void draw();
            } catch (err) {
              toast(err instanceof Error ? err.message : 'Erro ao remover recorde.', 'error');
            }
          });
        });
      };

      renderAnomalies();
    } else if (subMode === 'errors') {
      const sp = new URLSearchParams();
      sp.set('kind', errKind);
      sp.set('game', errGame);
      sp.set('page', String(errPage));
      sp.set('per_page', String(errPerPage));
      if (errSearch.trim()) sp.set('q', errSearch.trim());

      const errPg = await api<Page<ClientErrorRow>>(`/api/admin/errors?${sp.toString()}`);

      body.innerHTML = `
        <div class="panel">
          <div class="panel-head">
            <div>
              <h2>📊 Erros Agrupados por Frequência</h2>
              <p class="panel-sub">Exceções JavaScript, falhas de carregamento de chunk e perda de contexto WebGL nos dispositivos dos jogadores</p>
            </div>
            ${
              errPg.total > 0 || error_groups.length > 0
                ? `<button type="button" id="clear-all-errors" class="btn btn-xs btn-danger">🗑️ Limpar todos os erros</button>`
                : ''
            }
          </div>
          ${
            error_groups.length === 0
              ? `<div class="empty-state">Nenhum erro de cliente registrado até o momento! 🎉</div>`
              : `<div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Tipo</th>
                        <th>Jogo</th>
                        <th>Mensagem do Erro</th>
                        <th>Ocorrências</th>
                        <th>Jogadores Afetados</th>
                        <th>Última Vez</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${error_groups
                        .map(
                          (g) => `
                        <tr>
                          <td><span class="tag ${g.kind === 'webgl' || g.kind === 'error' ? 'tag-danger' : 'tag-warn'}">${esc(g.kind)}</span></td>
                          <td>${g.game_id ? renderGameBadge(g.game_id) : '<span class="muted">Global / Hub</span>'}</td>
                          <td class="msg-cell"><strong>${esc(g.message)}</strong></td>
                          <td><strong>${number(g.occurrences)}</strong></td>
                          <td>${number(g.affected_players)}</td>
                          <td>${ago(g.last_seen_at)} <small class="muted">(${dateTime(g.last_seen_at)})</small></td>
                        </tr>
                      `,
                        )
                        .join('')}
                    </tbody>
                  </table>
                </div>`
          }
        </div>

        <div class="panel" style="margin-top:20px">
          <div class="panel-head">
            <div>
              <h2>📋 Log Detalhado de Erros do Cliente</h2>
              <p class="panel-sub">Eventos individuais com stack trace, URL e navegador (User-Agent)</p>
            </div>
          </div>
          <div class="toolbar">
            <input id="err-q" type="search" class="input-search" placeholder="🔍 Buscar por mensagem, stack, URL ou aparelho..." value="${esc(errSearch)}" />
            <div class="toolbar-filters">
              <select id="err-kind">
                <option value="all" ${errKind === 'all' ? 'selected' : ''}>Todos os tipos</option>
                <option value="error" ${errKind === 'error' ? 'selected' : ''}>error (Exceção JS)</option>
                <option value="unhandledrejection" ${errKind === 'unhandledrejection' ? 'selected' : ''}>unhandledrejection (Promise)</option>
                <option value="webgl" ${errKind === 'webgl' ? 'selected' : ''}>webgl (Contexto perdido)</option>
                <option value="chunk" ${errKind === 'chunk' ? 'selected' : ''}>chunk (Falha de rede/deploy)</option>
              </select>
              <select id="err-game">
                <option value="all" ${errGame === 'all' ? 'selected' : ''}>Todos os jogos</option>
                ${sortedCatalog
                  .map(
                    (g) =>
                      `<option value="${esc(g.id)}" ${errGame === g.id ? 'selected' : ''}>${esc(g.emoji)} ${esc(g.title)}</option>`,
                  )
                  .join('')}
              </select>
            </div>
          </div>
          ${
            errPg.items.length === 0
              ? `<div class="empty-state">Nenhum registro de erro para este filtro.</div>`
              : `
                ${renderPagination({ total: errPg.total, page: errPg.page, per_page: errPg.per_page, noun: 'erros' })}
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Quando</th>
                        <th>Tipo</th>
                        <th>Jogo</th>
                        <th>Erro & Stack Trace</th>
                        <th>Aparelho / Jogador</th>
                        <th class="text-right"></th>
                      </tr>
                    </thead>
                    <tbody>
                      ${errPg.items
                        .map(
                          (er) => `
                        <tr>
                          <td>
                            <div>${dateTime(er.created_at)}</div>
                            <small class="muted">${ago(er.created_at)}</small>
                          </td>
                          <td><span class="tag tag-danger">${esc(er.kind)}</span></td>
                          <td>${er.game_id ? renderGameBadge(er.game_id) : '<span class="muted">Hub</span>'}</td>
                          <td class="msg-cell">
                            <div><strong>${esc(er.message)}</strong></div>
                            ${er.url ? `<small class="cell-sub mono">${esc(er.url)}</small>` : ''}
                            ${er.stack ? `<pre class="stack-box">${esc(er.stack)}</pre>` : ''}
                          </td>
                          <td class="msg-cell">
                            ${er.player_id ? renderPlayerCell({ id: er.player_id, name: er.player_id.slice(0, 8) }) : '<span class="muted">Sem sessão</span>'}
                            <small class="cell-sub">${esc(er.user_agent)}</small>
                          </td>
                          <td class="text-right">
                            <button type="button" class="btn btn-xs btn-ghost" data-del-err="${er.id}">✕</button>
                          </td>
                        </tr>
                      `,
                        )
                        .join('')}
                    </tbody>
                  </table>
                </div>
                ${renderPagination({ total: errPg.total, page: errPg.page, per_page: errPg.per_page, noun: 'erros' })}
              `
          }
        </div>
      `;

      body.querySelector('#clear-all-errors')?.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Limpar telemetria de erros',
          message: 'Deseja apagar todos os registros de erros do cliente armazenados?',
          confirmLabel: 'Limpar tudo',
          danger: true,
        });
        if (!ok) return;
        await api('/api/admin/errors', 'DELETE');
        snap = await api<MonitoringSnapshot>('/api/admin/monitoring?days=30');
        toast('Log de erros limpo.');
        void draw();
      });

      let timer: ReturnType<typeof setTimeout> | undefined;
      body.querySelector<HTMLInputElement>('#err-q')?.addEventListener('input', (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          errSearch = (e.target as HTMLInputElement).value;
          errPage = 1;
          void draw();
        }, 280);
      });
      body.querySelector<HTMLSelectElement>('#err-kind')?.addEventListener('change', (e) => {
        errKind = (e.target as HTMLSelectElement).value;
        errPage = 1;
        void draw();
      });
      body.querySelector<HTMLSelectElement>('#err-game')?.addEventListener('change', (e) => {
        errGame = (e.target as HTMLSelectElement).value;
        errPage = 1;
        void draw();
      });

      bindPagination(
        body,
        (nextPage) => {
          errPage = nextPage;
          void draw();
        },
        (nextPerPage) => {
          errPerPage = nextPerPage;
          errPage = 1;
          void draw();
        },
      );
      bindPlayerTriggers(body);

      body.querySelectorAll<HTMLButtonElement>('[data-del-err]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.delErr;
          if (!id) return;
          await api(`/api/admin/errors/${encodeURIComponent(id)}`, 'DELETE');
          snap = await api<MonitoringSnapshot>('/api/admin/monitoring?days=30');
          void draw();
        });
      });
    } else {
      const totalReqs = Math.max(1, server.requests_total);
      const totalDbBytes = Math.max(1, db.database_size_bytes);

      body.innerHTML = `
        <div class="grid-2">
          <div class="panel">
            <div class="panel-head">
              <div>
                <h2>📡 Saúde HTTP & Processo Rust (Axum)</h2>
                <p class="panel-sub">Contadores em memória desde o boot (${esc(dateTime(server.started_at))})</p>
              </div>
            </div>
            <div class="progress-list">
              ${[
                { label: 'Respostas de Sucesso (2xx / 3xx)', val: server.status_2xx, color: '#10b981' },
                { label: 'Erros de Cliente / Validação (4xx)', val: server.status_4xx, color: '#f59e0b' },
                { label: 'Rate-Limits Acionados (HTTP 429)', val: server.status_429, color: '#ec4899' },
                { label: 'Erros Internos de Servidor (5xx)', val: server.status_5xx, color: '#ff5c7a' },
              ]
                .map((s) => {
                  const pct = percent(s.val, totalReqs, 1);
                  const w = server.requests_total > 0 ? Math.max(2, Math.round((s.val / totalReqs) * 100)) : 0;
                  return `
                    <div class="progress-row">
                      <div class="progress-meta">
                        <strong>${esc(s.label)}</strong>
                        <span class="progress-stats"><strong>${number(s.val)}</strong> (${esc(pct)})</span>
                      </div>
                      <div class="progress-track">
                        <div class="progress-fill" style="width:${w}%;background:${s.color}"></div>
                      </div>
                    </div>
                  `;
                })
                .join('')}
            </div>
            <div class="summary-strip" style="margin-top:18px;margin-bottom:0">
              <span>Uptime: <strong>${duration(server.uptime_sec)}</strong></span>
              <span>Requisições API: <strong>${number(server.requests_api)}</strong> / ${number(server.requests_total)}</span>
              <span>Latência média: <strong>${server.avg_latency_ms.toFixed(2).replace('.', ',')} ms</strong></span>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head">
              <div>
                <h2>🗄️ Armazenamento PostgreSQL por Tabela</h2>
                <p class="panel-sub">Tamanho total do banco: <strong>${bytes(db.database_size_bytes)}</strong> · Pool SQLx: <strong>${db.pool_size}</strong> conexões (${db.pool_idle} ociosas)</p>
              </div>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tabela</th>
                    <th>Registros (Linhas)</th>
                    <th>Espaço em Disco</th>
                    <th>% do Banco</th>
                  </tr>
                </thead>
                <tbody>
                  ${db.tables
                    .map(
                      (tb) => `
                    <tr>
                      <td><code class="code-id">${esc(tb.table_name)}</code></td>
                      <td><strong>${number(tb.rows)}</strong></td>
                      <td><span class="pill-duration">${bytes(tb.size_bytes)}</span></td>
                      <td>${percent(tb.size_bytes, totalDbBytes, 1)}</td>
                    </tr>
                  `,
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }
  };

  await draw();
};
