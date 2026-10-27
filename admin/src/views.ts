import { ago, csvCell, dateTime, duration, esc, number } from './format';
import {
  api,
  type DayStats,
  type Entry,
  type Overview,
  type PlayerSummary,
  type PlaySession,
  type Report,
} from './api';

/** A screen: fills `root` and returns when it is drawn. Errors are shown by the caller. */
export type View = (root: HTMLElement) => Promise<void>;

const stat = (label: string, value: string, hint = ''): string =>
  `<div class="stat"><span>${esc(label)}</span><strong>${esc(value)}</strong>${hint ? `<small>${esc(hint)}</small>` : ''}</div>`;

function bars(days: DayStats[]): string {
  const max = Math.max(1, ...days.map((d) => d.sessions));
  return `<div class="bars">${days
    .map(
      (d) =>
        `<div class="bar" title="${esc(d.day)}: ${d.sessions} partidas, ${d.players} jogadores"><i style="height:${Math.max(2, (d.sessions / max) * 100)}%"></i><span>${esc(d.day.slice(8))}</span></div>`,
    )
    .join('')}</div>`;
}

export const overview: View = async (root) => {
  const o = await api<Overview>('/api/admin/overview');
  const t = o.totals;
  root.innerHTML = `
    <div class="stats">
      ${stat('Jogadores', number(t.players), `${number(t.google_players)} com Google`)}
      ${stat('Ativos hoje', number(t.active_today), `${number(t.active_7d)} em 7 dias`)}
      ${stat('Partidas', number(t.sessions))}
      ${stat('Tempo jogado', duration(t.play_seconds))}
      ${stat('Recordes', number(t.entries))}
      ${stat('Mensagens', number(t.messages), `${t.open_reports} denúncia(s) aberta(s)`)}
    </div>
    <h2>Partidas por dia (14 dias)</h2>${bars(o.daily)}
    <h2>Jogos</h2>
    <table><thead><tr><th>Jogo</th><th>Partidas</th><th>Tempo</th><th>Jogadores</th><th>Melhor</th><th>Última</th></tr></thead><tbody>${o.games
      .map(
        (g) =>
          `<tr><td>${esc(g.game_id)}</td><td>${number(g.sessions)}</td><td>${duration(g.play_seconds)}</td><td>${number(g.players)}</td><td>${number(g.best_score)}</td><td>${g.last_played_at ? ago(g.last_played_at) : '—'}</td></tr>`,
      )
      .join('')}</tbody></table>`;
};

export function sessionsToCsv(rows: PlaySession[]): string {
  const head = 'id,playerId,playerName,gameId,durationSec,score,startedAt,endedAt';
  const lines = rows.map((s) =>
    [s.id, s.playerId, s.playerName, s.gameId, s.durationSec, s.score, s.startedAt, s.endedAt].map(csvCell).join(','),
  );
  return [head, ...lines].join('\n');
}

export const sessions: View = async (root) => {
  const rows = await api<PlaySession[]>('/api/admin/sessions?days=30&limit=300');
  root.innerHTML = `
    <p class="bar-actions"><button id="csv">Baixar CSV</button><span>${rows.length} partidas dos últimos 30 dias</span></p>
    <table><thead><tr><th>Quando</th><th>Jogador</th><th>Jogo</th><th>Duração</th><th>Pontos</th></tr></thead><tbody>${rows
      .map(
        (s) =>
          `<tr><td>${dateTime(s.endedAt)}</td><td>${esc(s.playerName)}</td><td>${esc(s.gameId)}</td><td>${duration(s.durationSec)}</td><td>${number(s.score)}</td></tr>`,
      )
      .join('')}</tbody></table>`;
  root.querySelector('#csv')?.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([sessionsToCsv(rows)], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `fliper-sessoes-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  });
};

export const players: View = async (root) => {
  root.innerHTML = `<p class="bar-actions"><input id="q" type="search" placeholder="Buscar por apelido ou e-mail" /></p><div id="list"></div>`;
  const list = root.querySelector<HTMLElement>('#list')!;
  const load = async (q: string) => {
    const rows = await api<PlayerSummary[]>(`/api/admin/players?limit=100${q ? `&q=${encodeURIComponent(q)}` : ''}`);
    list.innerHTML = `<table><thead><tr><th>Jogador</th><th>E-mail</th><th>Partidas</th><th>Tempo</th><th>Recordes</th><th>Visto</th></tr></thead><tbody>${rows
      .map(
        (p) =>
          `<tr><td>${esc(p.name ?? 'Anônimo')} ${p.google ? '<span class="tag">Google</span>' : ''}</td><td>${esc(p.email ?? '—')}</td><td>${number(p.sessions)}</td><td>${duration(p.play_seconds)}</td><td>${number(p.entries)}</td><td>${ago(p.last_seen_at)}</td></tr>`,
      )
      .join('')}</tbody></table>`;
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  root.querySelector<HTMLInputElement>('#q')!.addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => void load((e.target as HTMLInputElement).value.trim()), 300);
  });
  await load('');
};

export const rankings: View = async (root) => {
  const games = await api<string[]>('/api/games');
  root.innerHTML = `<p class="bar-actions"><select id="game">${games.map((g) => `<option>${esc(g)}</option>`).join('')}</select><span>Remova recordes suspeitos ou apelidos ofensivos.</span></p><div id="board"></div>`;
  const board = root.querySelector<HTMLElement>('#board')!;
  const select = root.querySelector<HTMLSelectElement>('#game')!;
  const load = async () => {
    const rows = await api<Entry[]>(`/api/boards/${encodeURIComponent(select.value)}?limit=50`);
    board.innerHTML = `<table><thead><tr><th>#</th><th>Jogador</th><th>Pontos</th><th>Quando</th><th></th></tr></thead><tbody>${rows
      .map(
        (e, i) =>
          `<tr><td>${i + 1}</td><td>${esc(e.name)}</td><td>${number(e.score)}</td><td>${dateTime(e.date)}</td><td><button class="danger" data-id="${esc(e.id)}">Remover</button></td></tr>`,
      )
      .join('')}</tbody></table>`;
  };
  select.addEventListener('change', () => void load());
  board.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).dataset.id;
    if (!id || !confirm('Remover este recorde do ranking?')) return;
    void api(`/api/admin/entries/${id}`, 'DELETE').then(load);
  });
  await load();
};

export const reports: View = async (root) => {
  const render = async () => {
    const rows = await api<Report[]>('/api/admin/reports');
    root.innerHTML = rows.length
      ? `<table><thead><tr><th>Sala</th><th>Autor</th><th>Mensagem</th><th>Denúncias</th><th>Última</th><th></th></tr></thead><tbody>${rows
          .map(
            (r) =>
              `<tr><td>${esc(r.room)}</td><td>${esc(r.author_name)}</td><td>${r.deleted ? '<em>já removida</em>' : esc(r.text)}</td><td>${r.reports}</td><td>${ago(r.last_reported_at)}</td><td>${r.deleted ? '' : `<button class="danger" data-hide="${esc(r.message_id)}">Remover</button> `}<button data-dismiss="${esc(r.message_id)}">Ignorar</button></td></tr>`,
          )
          .join('')}</tbody></table>`
      : '<p class="empty">Nenhuma denúncia aberta. 🎉</p>';
  };
  root.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const hide = el.dataset.hide;
    const dismiss = el.dataset.dismiss;
    if (hide) void api(`/api/admin/chat/messages/${hide}`, 'DELETE').then(render);
    else if (dismiss) void api(`/api/admin/reports/${dismiss}`, 'DELETE').then(render);
  });
  await render();
};
