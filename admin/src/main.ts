import './style.css';
import { api, ApiError, signInWithGoogle, token, type Overview, type Session } from './api';
import { esc, number, parseHashRoute } from './format';
import { gamesView, overview, players, rankings, reports, sessions, type View } from './views';

declare global {
  interface Window {
    __FLIPER__?: { googleClientId?: string };
  }
}

// Injected by the server into the page; `VITE_GOOGLE_CLIENT_ID` only matters for local development.
const CLIENT_ID =
  window.__FLIPER__?.googleClientId || (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || '';

const TABS: ReadonlyArray<{ id: string; icon: string; label: string; view: View }> = [
  { id: 'geral', icon: '📊', label: 'Visão geral', view: overview },
  { id: 'jogos', icon: '🎮', label: 'Jogos', view: gamesView },
  { id: 'sessoes', icon: '🕒', label: 'Partidas', view: sessions },
  { id: 'jogadores', icon: '👥', label: 'Jogadores', view: players },
  { id: 'rankings', icon: '🏆', label: 'Rankings', view: rankings },
  { id: 'denuncias', icon: '🛡️', label: 'Moderação', view: reports },
];

const app = document.getElementById('app')!;
let routeListenerBound = false;

function updateReportBadge(count: number): void {
  const badge = document.getElementById('nav-reports-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = number(count);
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

function loginScreen(message = ''): void {
  app.innerHTML = `
    <main class="login">
      <div class="login-card">
        <div class="login-logo">🕹️</div>
        <h1>Fliper · Painel Admin</h1>
        <p class="login-sub">Entre com uma conta Google autorizada para gerenciar jogadores, partidas, rankings e moderação do chat.</p>
        <button id="login" class="btn btn-primary btn-lg">
          <span>🔑 Entrar com Google</span>
        </button>
        ${message ? `<p class="error-banner">${esc(message)}</p>` : ''}
        <a href="/" class="login-back">← Voltar para o Fliperama</a>
      </div>
    </main>
  `;
  document.getElementById('login')!.addEventListener('click', () => {
    signInWithGoogle(CLIENT_ID).then(
      () => void start(),
      (err: unknown) => loginScreen(err instanceof Error ? err.message : 'Falha no login.'),
    );
  });
}

async function show(tab: (typeof TABS)[number]): Promise<void> {
  const root = document.getElementById('content');
  if (!root) return;
  document.querySelectorAll('nav a[data-tab-id]').forEach((a) => {
    a.classList.toggle('on', a.getAttribute('data-tab-id') === tab.id);
  });
  root.innerHTML = `<div class="loading-box"><div class="spinner"></div><span>Carregando ${esc(tab.label.toLowerCase())}…</span></div>`;
  // A fresh node per screen, so listeners of the previous one are gone.
  const fresh = root.cloneNode(false) as HTMLElement;
  root.replaceWith(fresh);
  try {
    await tab.view(fresh, updateReportBadge);
    const stamp = document.getElementById('last-updated');
    if (stamp) {
      stamp.textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    }
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      token.set(null);
      return loginScreen(err.status === 403 ? 'Esta conta não é de administrador.' : '');
    }
    fresh.innerHTML = `<div class="panel"><p class="error-banner">${esc(err instanceof Error ? err.message : 'Erro ao carregar os dados.')}</p></div>`;
  }
}

function currentTab(): (typeof TABS)[number] {
  const { tab } = parseHashRoute(location.hash);
  return TABS.find((t) => t.id === tab) ?? TABS[0]!;
}

async function start(): Promise<void> {
  if (!token.get()) return loginScreen();
  let initialOverview: Overview;
  let me: Session | null = null;
  try {
    [initialOverview, me] = await Promise.all([
      api<Overview>('/api/admin/overview?days=14'), // proves the saved session is an administrator's
      api<Session>('/api/me').catch(() => null),
    ]);
  } catch (err) {
    token.set(null);
    return loginScreen(err instanceof ApiError && err.status === 403 ? 'Esta conta não é de administrador.' : '');
  }

  const adminLabel = me?.account?.email || me?.account?.name || 'Admin';

  app.innerHTML = `
    <header class="app-header">
      <div class="header-top">
        <div class="brand">
          <span class="brand-logo">🕹️</span>
          <div>
            <h1>Fliper · Admin</h1>
            <span id="last-updated" class="brand-sub">Conectado</span>
          </div>
        </div>
        <div class="header-actions">
          <span class="admin-user-pill" title="Conta autenticada">👤 ${esc(adminLabel)}</span>
          <button type="button" id="refresh-btn" class="btn btn-ghost btn-sm" title="Recarregar aba atual">↻ Atualizar</button>
          <a href="/" class="btn btn-secondary btn-sm">🎮 Ir para o Jogo</a>
          <button type="button" id="out" class="btn btn-ghost btn-sm">Sair</button>
        </div>
      </div>
      <nav class="app-nav">
        ${TABS.map(
          (t) => `
          <a href="#${t.id}" data-tab-id="${t.id}">
            <span class="nav-icon">${t.icon}</span>
            <span>${esc(t.label)}</span>
            ${t.id === 'denuncias' ? `<span id="nav-reports-badge" class="badge-count" hidden>0</span>` : ''}
          </a>
        `,
        ).join('')}
      </nav>
    </header>
    <section id="content" class="app-content"></section>
  `;

  updateReportBadge(initialOverview.totals.open_reports);

  document.getElementById('out')!.addEventListener('click', () => {
    token.set(null);
    loginScreen();
  });
  document.getElementById('refresh-btn')!.addEventListener('click', () => {
    void show(currentTab());
  });

  const route = () => void show(currentTab());
  if (!routeListenerBound) {
    window.addEventListener('hashchange', route);
    routeListenerBound = true;
  }
  route();
}

void start();
