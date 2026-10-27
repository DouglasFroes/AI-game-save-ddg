import './style.css';
import { api, ApiError, signInWithGoogle, token } from './api';
import { esc } from './format';
import { overview, players, rankings, reports, sessions, type View } from './views';

declare global {
  interface Window {
    __FLIPER__?: { googleClientId?: string };
  }
}

// Injected by the server into the page; `VITE_GOOGLE_CLIENT_ID` only matters for local development.
const CLIENT_ID =
  window.__FLIPER__?.googleClientId || (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || '';

const TABS: ReadonlyArray<{ id: string; label: string; view: View }> = [
  { id: 'geral', label: 'Visão geral', view: overview },
  { id: 'sessoes', label: 'Partidas', view: sessions },
  { id: 'jogadores', label: 'Jogadores', view: players },
  { id: 'rankings', label: 'Rankings', view: rankings },
  { id: 'denuncias', label: 'Denúncias', view: reports },
];

const app = document.getElementById('app')!;

function loginScreen(message = ''): void {
  app.innerHTML = `<main class="login"><h1>Fliper · Admin</h1>
    <p>Entre com uma conta Google autorizada.</p>
    <button id="login" class="primary">Entrar com Google</button>
    <p class="error">${esc(message)}</p></main>`;
  document.getElementById('login')!.addEventListener('click', () => {
    signInWithGoogle(CLIENT_ID).then(
      () => void start(),
      (err: unknown) => loginScreen(err instanceof Error ? err.message : 'Falha no login.'),
    );
  });
}

async function show(tab: (typeof TABS)[number]): Promise<void> {
  const root = document.getElementById('content')!;
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === `#${tab.id}`));
  root.innerHTML = '<p class="empty">Carregando…</p>';
  // A fresh node per screen, so listeners of the previous one are gone.
  const fresh = root.cloneNode(false) as HTMLElement;
  root.replaceWith(fresh);
  try {
    await tab.view(fresh);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      token.set(null);
      return loginScreen(err.status === 403 ? 'Esta conta não é de administrador.' : '');
    }
    fresh.innerHTML = `<p class="error">${esc(err instanceof Error ? err.message : 'Erro')}</p>`;
  }
}

async function start(): Promise<void> {
  if (!token.get()) return loginScreen();
  try {
    await api('/api/admin/overview'); // proves the saved session is an administrator's
  } catch (err) {
    token.set(null);
    return loginScreen(err instanceof ApiError && err.status === 403 ? 'Esta conta não é de administrador.' : '');
  }
  app.innerHTML = `<header><h1>Fliper · Admin</h1><nav>${TABS.map((t) => `<a href="#${t.id}">${esc(t.label)}</a>`).join('')}</nav><button id="out">Sair</button></header><section id="content"></section>`;
  document.getElementById('out')!.addEventListener('click', () => (token.set(null), loginScreen()));
  const route = () => void show(TABS.find((t) => `#${t.id}` === location.hash) ?? TABS[0]!);
  window.addEventListener('hashchange', route);
  route();
}

void start();
