import { api, type PlayerDetail } from './api';
import {
  ago,
  dateTime,
  duration,
  esc,
  formatDetailPairs,
  number,
  pageRange,
  paginateSlice,
  percent,
} from './format';
import { CATEGORY_LABELS, getGameMeta } from './games';

export interface PaginationOptions {
  total: number;
  page: number;
  per_page: number;
  noun?: string;
  perPageOptions?: readonly number[];
}

export function renderPagination(opts: PaginationOptions): string {
  const { total, page, per_page, noun = 'registros', perPageOptions = [10, 25, 50, 100] } = opts;
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, per_page)));
  const safePage = Math.min(totalPages, Math.max(1, page));
  const start = total === 0 ? 0 : (safePage - 1) * per_page + 1;
  const end = Math.min(total, safePage * per_page);
  const pages = pageRange(safePage, totalPages);

  return `
    <div class="pagination-bar" role="navigation" aria-label="Paginação">
      <div class="pagination-info">
        ${
          total === 0
            ? `<span>Nenhum resultado para exibir</span>`
            : `Mostrando <strong>${number(start)}–${number(end)}</strong> de <strong>${number(total)}</strong> ${esc(noun)}`
        }
      </div>
      <div class="pagination-controls">
        <label class="pagination-size">
          <span>Por página:</span>
          <select class="select-sm" data-page-size>
            ${perPageOptions
              .map(
                (sz) =>
                  `<option value="${sz}" ${sz === per_page ? 'selected' : ''}>${sz}</option>`,
              )
              .join('')}
          </select>
        </label>
        <div class="pagination-buttons">
          <button type="button" class="page-btn" data-page="1" title="Primeira página" ${safePage <= 1 ? 'disabled' : ''}>«</button>
          <button type="button" class="page-btn" data-page="${safePage - 1}" title="Página anterior" ${safePage <= 1 ? 'disabled' : ''}>‹</button>
          ${pages
            .map((p) =>
              p === '…'
                ? `<span class="page-ellipsis">…</span>`
                : `<button type="button" class="page-btn ${p === safePage ? 'active' : ''}" data-page="${p}">${p}</button>`,
            )
            .join('')}
          <button type="button" class="page-btn" data-page="${safePage + 1}" title="Próxima página" ${safePage >= totalPages ? 'disabled' : ''}>›</button>
          <button type="button" class="page-btn" data-page="${totalPages}" title="Última página" ${safePage >= totalPages ? 'disabled' : ''}>»</button>
        </div>
      </div>
    </div>
  `;
}

export function bindPagination(
  root: HTMLElement,
  onPageChange: (page: number) => void,
  onPerPageChange?: (perPage: number) => void,
): void {
  root.querySelectorAll<HTMLButtonElement>('button[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const p = Number(btn.dataset.page);
      if (Number.isFinite(p) && p >= 1) onPageChange(p);
    });
  });
  if (onPerPageChange) {
    root.querySelectorAll<HTMLSelectElement>('select[data-page-size]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const sz = Number(sel.value);
        if (Number.isFinite(sz) && sz >= 1) onPerPageChange(sz);
      });
    });
  }
}

export function toast(message: string, kind: 'success' | 'error' | 'info' = 'success'): void {
  if (typeof document === 'undefined') return;
  let stack = document.getElementById('toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  const el = document.createElement('div');
  const icon = kind === 'success' ? '✓' : kind === 'error' ? '⚠' : 'ℹ';
  el.className = `toast toast-${kind}`;
  el.innerHTML = `<span class="toast-icon">${icon}</span><span>${esc(message)}</span>`;
  stack.appendChild(el);
  setTimeout(() => {
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 260);
  }, 3200);
}

export function confirmDialog(opts: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(true);
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal-dialog modal-sm" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h3>${esc(opts.title)}</h3>
        </div>
        <p class="modal-body-text">${esc(opts.message)}</p>
        <div class="modal-foot">
          <button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>
          <button type="button" class="btn ${opts.danger !== false ? 'btn-danger' : 'btn-primary'}" data-confirm>
            ${esc(opts.confirmLabel ?? 'Confirmar')}
          </button>
        </div>
      </div>
    `;
    const cleanup = (result: boolean) => {
      window.removeEventListener('keydown', onKey);
      backdrop.remove();
      resolve(result);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cleanup(false);
    };
    window.addEventListener('keydown', onKey);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) cleanup(false);
    });
    backdrop.querySelector('[data-cancel]')?.addEventListener('click', () => cleanup(false));
    const confirmBtn = backdrop.querySelector<HTMLButtonElement>('[data-confirm]');
    confirmBtn?.addEventListener('click', () => cleanup(true));
    document.body.appendChild(backdrop);
    confirmBtn?.focus();
  });
}

export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const AVATAR_PALETTE = ['#7c5cff', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#6366f1', '#14b8a6'];

export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]!;
}

export function renderGameBadge(
  gameId: string,
  opts: { showId?: boolean; showCategory?: boolean; linkTab?: 'rankings' | 'sessoes' } = {},
): string {
  const g = getGameMeta(gameId);
  const inner = `
    <span class="game-dot" style="background:${esc(g.color)}"></span>
    <span class="game-emoji">${esc(g.emoji)}</span>
    <strong class="game-title">${esc(g.title)}</strong>
    ${opts.showId ? `<code class="code-id">${esc(g.id)}</code>` : ''}
    ${opts.showCategory ? `<span class="cat-pill cat-${esc(g.category)}">${esc(CATEGORY_LABELS[g.category])}</span>` : ''}
  `;
  if (opts.linkTab) {
    return `<a href="#${opts.linkTab}?game=${encodeURIComponent(g.id)}" class="game-badge game-badge-link" title="Filtrar por ${esc(g.title)}">${inner}</a>`;
  }
  return `<span class="game-badge">${inner}</span>`;
}

export function renderRoomBadge(room: string): string {
  if (room === 'geral') {
    return `<span class="room-badge room-global">🌎 Sala Geral</span>`;
  }
  const g = getGameMeta(room);
  return `<span class="room-badge"><span class="game-dot" style="background:${esc(g.color)}"></span>${esc(g.emoji)} ${esc(g.title)}</span>`;
}

export function renderRankBadge(rank: number): string {
  if (rank === 1) return `<span class="rank-badge rank-1" title="1º Lugar">🥇 1º</span>`;
  if (rank === 2) return `<span class="rank-badge rank-2" title="2º Lugar">🥈 2º</span>`;
  if (rank === 3) return `<span class="rank-badge rank-3" title="3º Lugar">🥉 3º</span>`;
  return `<span class="rank-badge">#${number(rank)}</span>`;
}

export function renderPlayerCell(p: {
  id: string;
  name: string | null | undefined;
  email?: string | null;
  google?: boolean;
  showId?: boolean;
}): string {
  const display = p.name?.trim() || 'Anônimo';
  const initial = display.charAt(0).toUpperCase();
  const bg = avatarColor(p.id || display);
  return `
    <button type="button" class="player-trigger" data-player-modal="${esc(p.id)}" title="Ver ficha completa de ${esc(display)}">
      <span class="player-avatar" style="background:${bg}">${esc(initial)}</span>
      <span class="player-meta">
        <span class="player-name-row">
          <strong>${esc(display)}</strong>
          ${p.google ? '<span class="tag tag-google">Google</span>' : p.google === false ? '<span class="tag tag-anon">Anônimo</span>' : ''}
        </span>
        ${
          p.email
            ? `<span class="player-sub">${esc(p.email)}</span>`
            : p.showId !== false && p.id && p.id !== 'anon'
              ? `<span class="player-sub mono">${esc(p.id.slice(0, 8))}</span>`
              : ''
        }
      </span>
    </button>
  `;
}

/**
 * Opens a rich modal showing a player's full profile, per-game breakdown, sessions, ranking entries, and chat history.
 */
export async function openPlayerModal(playerId: string, onChanged?: () => void): Promise<void> {
  if (!playerId || playerId === 'anon') return;
  document.getElementById('player-detail-modal')?.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'player-detail-modal';
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal-dialog modal-lg" role="dialog" aria-modal="true">
      <div class="loading-box"><div class="spinner"></div><span>Carregando ficha do jogador…</span></div>
    </div>
  `;
  const close = () => {
    window.removeEventListener('keydown', onKey);
    backdrop.remove();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  window.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  document.body.appendChild(backdrop);

  const dialog = backdrop.querySelector<HTMLElement>('.modal-dialog')!;
  let detail: PlayerDetail;
  try {
    detail = await api<PlayerDetail>(`/api/admin/players/${encodeURIComponent(playerId)}`);
  } catch (err) {
    dialog.innerHTML = `
      <div class="modal-head">
        <h3>Ficha do Jogador</h3>
        <button type="button" class="btn btn-ghost" data-close-modal>✕ Fechar</button>
      </div>
      <p class="error-banner">${esc(err instanceof Error ? err.message : 'Não foi possível carregar o jogador.')}</p>
    `;
    dialog.querySelector('[data-close-modal]')?.addEventListener('click', close);
    return;
  }

  type SubTab = 'games' | 'sessions' | 'entries' | 'messages';
  let activeSubTab: SubTab = 'games';
  let sessionsPage = 1;
  let entriesPage = 1;
  let messagesPage = 1;
  const modalPerPage = 10;

  const draw = () => {
    const p = detail.player;
    const display = p.name?.trim() || 'Anônimo';
    const avgSec = p.sessions > 0 ? Math.round(p.play_seconds / p.sessions) : 0;
    const favMeta = p.favorite_game ? getGameMeta(p.favorite_game) : null;
    const maxGameTime = Math.max(1, detail.games[0]?.play_seconds ?? 1);

    let subContent = '';
    if (activeSubTab === 'games') {
      subContent =
        detail.games.length === 0
          ? `<div class="empty-state">Nenhuma partida registrada para este jogador.</div>`
          : `<div class="progress-list">
              ${detail.games
                .map((ug, idx) => {
                  const g = getGameMeta(ug.game_id);
                  const wPct = Math.max(4, Math.round((ug.play_seconds / maxGameTime) * 100));
                  const share = percent(ug.play_seconds, p.play_seconds, 0);
                  const avgGame = ug.sessions > 0 ? Math.round(ug.play_seconds / ug.sessions) : 0;
                  return `
                    <div class="progress-row">
                      <div class="progress-meta">
                        <span class="rank-badge">#${idx + 1}</span>
                        ${renderGameBadge(ug.game_id, { showCategory: true })}
                        <span class="progress-stats">
                          <strong class="text-accent">${duration(ug.play_seconds)}</strong> (${share}) ·
                          ${number(ug.sessions)} part. · média ${duration(avgGame)} ·
                          recorde <strong>${number(ug.best_score)}</strong> ·
                          última ${ago(ug.last_played_at)}
                        </span>
                      </div>
                      <div class="progress-track">
                        <div class="progress-fill" style="width:${wPct}%;background:${esc(g.color)}"></div>
                      </div>
                    </div>
                  `;
                })
                .join('')}
            </div>`;
    } else if (activeSubTab === 'sessions') {
      const pg = paginateSlice(detail.recent_sessions, sessionsPage, modalPerPage);
      subContent =
        pg.total === 0
          ? `<div class="empty-state">Nenhuma partida recente encontrada.</div>`
          : `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fim da Partida</th>
                    <th>Jogo</th>
                    <th>Duração</th>
                    <th>Pontuação</th>
                  </tr>
                </thead>
                <tbody>
                  ${pg.items
                    .map(
                      (s) => `
                    <tr>
                      <td>${dateTime(s.endedAt)} <small class="muted">(${ago(s.endedAt)})</small></td>
                      <td>${renderGameBadge(s.gameId)}</td>
                      <td><span class="pill-duration">${duration(s.durationSec)}</span></td>
                      <td><strong>${number(s.score)}</strong></td>
                    </tr>
                  `,
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
            ${renderPagination({ total: pg.total, page: pg.page, per_page: pg.per_page, noun: 'partidas', perPageOptions: [10] })}
          `;
    } else if (activeSubTab === 'entries') {
      const pg = paginateSlice(detail.entries, entriesPage, modalPerPage);
      subContent =
        pg.total === 0
          ? `<div class="empty-state">Este jogador não possui recordes salvos nos rankings.</div>`
          : `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Posição</th>
                    <th>Jogo</th>
                    <th>Apelido no Recorde</th>
                    <th>Pontos</th>
                    <th>Detalhes</th>
                    <th>Data</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${pg.items
                    .map((e) => {
                      const pairs = formatDetailPairs(e.details);
                      return `
                        <tr>
                          <td>${renderRankBadge(e.rank ?? 1)}</td>
                          <td>${e.game_id ? renderGameBadge(e.game_id) : '—'}</td>
                          <td>${esc(e.name)}</td>
                          <td><strong class="text-gold">${number(e.score)}</strong></td>
                          <td>
                            ${
                              pairs.length
                                ? pairs.map((d) => `<span class="detail-chip">${esc(d.label)}: <strong>${esc(d.value)}</strong></span>`).join(' ')
                                : '<span class="muted">—</span>'
                            }
                          </td>
                          <td>${dateTime(e.date)}</td>
                          <td class="text-right">
                            <button type="button" class="btn btn-xs btn-danger" data-del-entry="${esc(e.id)}">Remover</button>
                          </td>
                        </tr>
                      `;
                    })
                    .join('')}
                </tbody>
              </table>
            </div>
            ${renderPagination({ total: pg.total, page: pg.page, per_page: pg.per_page, noun: 'recordes', perPageOptions: [10] })}
          `;
    } else if (activeSubTab === 'messages') {
      const pg = paginateSlice(detail.recent_messages, messagesPage, modalPerPage);
      subContent =
        pg.total === 0
          ? `<div class="empty-state">Nenhuma mensagem enviada no chat por este jogador.</div>`
          : `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Sala</th>
                    <th>Mensagem</th>
                    <th>Denúncias</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${pg.items
                    .map(
                      (m) => `
                    <tr>
                      <td>${dateTime(m.created_at)}</td>
                      <td>${renderRoomBadge(m.room)}</td>
                      <td class="msg-cell">${m.deleted ? '<em class="muted">Mensagem removida</em>' : esc(m.text)}</td>
                      <td>${m.reports > 0 ? `<span class="tag tag-danger">${m.reports}</span>` : '<span class="muted">0</span>'}</td>
                      <td class="text-right">
                        ${m.deleted ? '' : `<button type="button" class="btn btn-xs btn-danger" data-del-msg="${esc(m.id)}">Remover</button>`}
                      </td>
                    </tr>
                  `,
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
            ${renderPagination({ total: pg.total, page: pg.page, per_page: pg.per_page, noun: 'mensagens', perPageOptions: [10] })}
          `;
    }

    dialog.innerHTML = `
      <div class="modal-head">
        <div class="player-modal-identity">
          <span class="player-avatar player-avatar-lg" style="background:${avatarColor(p.id)}">
            ${esc(display.charAt(0).toUpperCase())}
          </span>
          <div>
            <div class="player-modal-title">
              <h2>${esc(display)}</h2>
              ${p.google ? '<span class="tag tag-google">Conta Google</span>' : '<span class="tag tag-anon">Anônimo</span>'}
            </div>
            <div class="player-modal-sub">
              ${p.email ? `<span>✉️ ${esc(p.email)}</span> · ` : ''}
              <span class="mono">ID: ${esc(p.id)}</span>
              <button type="button" class="btn btn-xs btn-ghost" data-copy-id="${esc(p.id)}">📋 Copiar ID</button>
            </div>
            <div class="player-modal-sub">
              Cadastro: <strong>${dateTime(p.created_at)}</strong> · Último acesso: <strong>${dateTime(p.last_seen_at)}</strong> (${ago(p.last_seen_at)})
            </div>
          </div>
        </div>
        <button type="button" class="btn btn-ghost" data-close-modal>✕ Fechar</button>
      </div>

      <div class="stats stats-compact">
        <div class="stat">
          <span class="stat-label">⏱️ Tempo Jogado</span>
          <strong>${duration(p.play_seconds)}</strong>
          <small>Média ${duration(avgSec)} / partida</small>
        </div>
        <div class="stat">
          <span class="stat-label">🕹️ Partidas</span>
          <strong>${number(p.sessions)}</strong>
          <small>${number(detail.games.length)} jogo(s) diferente(s)</small>
        </div>
        <div class="stat">
          <span class="stat-label">🏆 Recordes</span>
          <strong>${number(detail.entries.length)}</strong>
          <small>Salvos no ranking</small>
        </div>
        <div class="stat">
          <span class="stat-label">🔥 Jogo Favorito</span>
          <strong class="stat-fav">${favMeta ? `${esc(favMeta.emoji)} ${esc(favMeta.title)}` : '—'}</strong>
          <small>${detail.games[0] ? `${duration(detail.games[0].play_seconds)} (${detail.games[0].sessions} part.)` : 'Sem partidas'}</small>
        </div>
      </div>

      <div class="subtabs">
        <button type="button" class="subtab ${activeSubTab === 'games' ? 'active' : ''}" data-subtab="games">
          🎮 Jogos (${detail.games.length})
        </button>
        <button type="button" class="subtab ${activeSubTab === 'sessions' ? 'active' : ''}" data-subtab="sessions">
          🕒 Últimas Partidas (${detail.recent_sessions.length})
        </button>
        <button type="button" class="subtab ${activeSubTab === 'entries' ? 'active' : ''}" data-subtab="entries">
          🏆 Recordes (${detail.entries.length})
        </button>
        <button type="button" class="subtab ${activeSubTab === 'messages' ? 'active' : ''}" data-subtab="messages">
          💬 Chat (${detail.recent_messages.length})
        </button>
      </div>

      <div class="modal-subcontent">
        ${subContent}
      </div>
    `;

    dialog.querySelector('[data-close-modal]')?.addEventListener('click', close);
    dialog.querySelector<HTMLButtonElement>('[data-copy-id]')?.addEventListener('click', (e) => {
      const id = (e.currentTarget as HTMLElement).dataset.copyId ?? '';
      void navigator.clipboard?.writeText(id);
      toast('ID do jogador copiado!', 'info');
    });
    dialog.querySelectorAll<HTMLButtonElement>('[data-subtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeSubTab = btn.dataset.subtab as SubTab;
        draw();
      });
    });

    bindPagination(dialog, (nextPage) => {
      if (activeSubTab === 'sessions') sessionsPage = nextPage;
      else if (activeSubTab === 'entries') entriesPage = nextPage;
      else if (activeSubTab === 'messages') messagesPage = nextPage;
      draw();
    });

    dialog.querySelectorAll<HTMLButtonElement>('[data-del-entry]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.delEntry;
        if (!id) return;
        const ok = await confirmDialog({
          title: 'Remover recorde do ranking',
          message: 'Tem certeza de que deseja remover este recorde permanentemente do ranking?',
          confirmLabel: 'Sim, remover',
          danger: true,
        });
        if (!ok) return;
        try {
          await api(`/api/admin/entries/${encodeURIComponent(id)}`, 'DELETE');
          detail.entries = detail.entries.filter((e) => e.id !== id);
          detail.player.entries = Math.max(0, detail.player.entries - 1);
          toast('Recorde removido com sucesso.');
          draw();
          onChanged?.();
        } catch (err) {
          toast(err instanceof Error ? err.message : 'Falha ao remover recorde.', 'error');
        }
      });
    });

    dialog.querySelectorAll<HTMLButtonElement>('[data-del-msg]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.delMsg;
        if (!id) return;
        const ok = await confirmDialog({
          title: 'Remover mensagem do chat',
          message: 'A mensagem será apagada para todos os jogadores na sala imediatamente.',
          confirmLabel: 'Remover mensagem',
          danger: true,
        });
        if (!ok) return;
        try {
          await api(`/api/admin/chat/messages/${encodeURIComponent(id)}`, 'DELETE');
          const found = detail.recent_messages.find((m) => m.id === id);
          if (found) {
            found.deleted = true;
            found.text = '';
            found.reports = 0;
          }
          toast('Mensagem moderada com sucesso.');
          draw();
          onChanged?.();
        } catch (err) {
          toast(err instanceof Error ? err.message : 'Falha ao moderar mensagem.', 'error');
        }
      });
    });
  };

  draw();
}
