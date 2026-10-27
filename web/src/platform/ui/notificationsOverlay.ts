import { GAMES } from '@/games/registry';
import type { Sfx } from '@/platform/audio/Sfx';
import {
  browserNotificationState,
  clearNoticeHistory,
  isBrowserNotifyEnabled,
  listNoticeHistory,
  markAllNoticesRead,
  markNoticeRead,
  onNoticeHistoryChange,
  removeNoticeHistory,
  setBrowserNotifyEnabled,
  type NoticeCategory,
  type NoticeHistoryItem,
} from '@/platform/notices';

export interface NotificationsOpenOptions {
  readonly onPlayGame?: (gameId: string) => void;
  readonly onOpenLeaderboard?: (gameId: string) => void;
  readonly onOpenChat?: (room?: string) => void;
  readonly onClose?: () => void;
}

type FilterTab = 'all' | NoticeCategory;

const FILTER_TABS: ReadonlyArray<{ id: FilterTab; label: string; emoji: string }> = [
  { id: 'all', label: 'Todas', emoji: '🔔' },
  { id: 'ranking', label: 'Ranking', emoji: '🏆' },
  { id: 'chat', label: 'Chat', emoji: '💬' },
  { id: 'system', label: 'Sistema', emoji: '⚡' },
];

const SVG = {
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  trash:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
};

const NOTICES_CSS = /* css */ `
.fxn {
  --bg: #06070f;
  --panel: #0b0d1e;
  --glass: rgba(255,255,255,.06);
  --glass-2: rgba(255,255,255,.11);
  --line: rgba(255,255,255,.1);
  --text: #f5f7ff;
  --soft: #b6bcdc;
  --mute: #7a80a8;
  --cyan: #38e1ff;
  --violet: #8b5cf6;
  --pink: #ff5fb8;
  --gold: #ffd166;
  --green: #34d399;
  --spring: cubic-bezier(.2,.9,.25,1.12);
  --ease: cubic-bezier(.22,.8,.3,1);
  position: fixed; inset: 0; z-index: 9000;
  font-family: "Sora", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--text);
  -webkit-tap-highlight-color: transparent;
  -webkit-font-smoothing: antialiased;
}
.fxn * { box-sizing: border-box; }
:where(.fxn) button { font: inherit; color: inherit; border: 0; background: none; cursor: pointer; padding: 0; }
:where(.fxn) button:focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; }

.fxn-scrim {
  position: absolute; inset: 0;
  background: radial-gradient(120% 80% at 50% 100%, rgba(139,92,246,.25), rgba(3,4,10,.78) 60%);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  opacity: 0; transition: opacity .32s var(--ease);
}
.fxn.is-open .fxn-scrim { opacity: 1; }

.fxn-panel {
  position: absolute; left: 50%; top: 0;
  width: min(100vw, 540px); height: 100dvh;
  transform: translate(-50%, 104%);
  display: flex; flex-direction: column;
  background:
    radial-gradient(90% 40% at 0% 0%, rgba(56,225,255,.12), transparent 60%),
    radial-gradient(80% 40% at 100% 10%, rgba(255,95,184,.12), transparent 60%),
    radial-gradient(120% 60% at 50% 120%, rgba(139,92,246,.22), transparent 60%),
    linear-gradient(180deg, #0d1024, #070815);
  border: 1px solid var(--line);
  box-shadow: 0 -20px 80px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.08);
  overflow: hidden;
  transition: transform .44s var(--spring);
  will-change: transform;
}
.fxn.is-open .fxn-panel { transform: translate(-50%, 0); }
@media (min-width: 900px) {
  .fxn-panel {
    left: auto; right: 24px; top: 24px;
    width: 440px; height: calc(100dvh - 48px);
    border-radius: 32px; transform: translate(0, 0) scale(.92); opacity: 0;
    transition: transform .4s var(--spring), opacity .28s var(--ease);
  }
  .fxn.is-open .fxn-panel { transform: none; opacity: 1; }
}

.fxn-head {
  flex: none; padding: calc(env(safe-area-inset-top) + 14px) 16px 12px;
  background: linear-gradient(180deg, rgba(13,16,36,.96), rgba(13,16,36,.82));
  backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
  border-bottom: 1px solid var(--line);
}
.fxn-titlebar { display: flex; align-items: center; gap: 12px; }
.fxn-logo {
  width: 46px; height: 46px; border-radius: 16px; flex: none;
  display: grid; place-items: center;
  background: linear-gradient(135deg, var(--gold), var(--pink) 55%, var(--violet));
  box-shadow: 0 8px 24px rgba(255,95,184,.35), inset 0 1px 0 rgba(255,255,255,.4);
}
.fxn-logo svg { width: 24px; height: 24px; }
.fxn-titles { flex: 1; min-width: 0; }
.fxn-titles h2 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: .2px; line-height: 1.15; }
.fxn-sub { margin: 2px 0 0; font-size: 12.5px; color: var(--soft); }
.fxn-icon {
  width: 42px; height: 42px; border-radius: 14px; flex: none;
  display: grid; place-items: center;
  background: var(--glass); border: 1px solid var(--line);
  color: var(--soft);
  transition: transform .18s var(--spring), background .2s, color .2s;
}
.fxn-icon:hover { background: var(--glass-2); color: #fff; }
.fxn-icon:active { transform: scale(.9); }
.fxn-icon svg { width: 19px; height: 19px; }

.fxn-tabs {
  display: flex; gap: 8px; margin: 12px -16px -4px; padding: 2px 16px 6px;
  overflow-x: auto; scrollbar-width: none;
}
.fxn-tabs::-webkit-scrollbar { display: none; }
.fxn-tab {
  flex: none; display: flex; align-items: center; gap: 6px;
  height: 34px; padding: 0 13px; border-radius: 17px;
  background: var(--glass); border: 1px solid var(--line);
  font-size: 13px; font-weight: 700; color: var(--soft);
  transition: all .22s var(--ease);
}
.fxn-tab.is-on {
  color: #fff; border-color: transparent;
  background: linear-gradient(135deg, rgba(56,225,255,.9), rgba(139,92,246,.95) 55%, rgba(255,95,184,.95));
  box-shadow: 0 6px 18px rgba(139,92,246,.38);
}
.fxn-tab .cnt {
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px;
  background: rgba(255,255,255,.16); color: #fff; font-size: 11px;
  display: grid; place-items: center;
}

.fxn-browser-bar {
  flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin: 10px 14px 0; padding: 10px 14px; border-radius: 16px;
  background: rgba(56,225,255,.07); border: 1px solid rgba(56,225,255,.22);
  font-size: 12.5px; color: var(--soft);
}
.fxn-browser-bar strong { color: #fff; display: block; font-size: 13px; margin-bottom: 1px; }
.fxn-switch {
  flex: none; height: 32px; padding: 0 14px; border-radius: 16px;
  font-size: 12px; font-weight: 700;
  background: var(--glass-2); border: 1px solid var(--line); color: #fff;
  transition: all .2s;
}
.fxn-switch.is-on {
  background: rgba(52,211,153,.2); border-color: rgba(52,211,153,.5); color: #6ee7b7;
}

.fxn-list {
  flex: 1; overflow-y: auto; padding: 14px;
  display: flex; flex-direction: column; gap: 10px;
}
.fxn-empty {
  margin: auto 0; text-align: center; padding: 36px 20px; color: var(--mute);
}
.fxn-empty .emo { font-size: 42px; margin-bottom: 10px; display: block; opacity: .8; }
.fxn-empty h3 { margin: 0 0 6px; font-size: 16px; color: var(--soft); }
.fxn-empty p { margin: 0; font-size: 13px; line-height: 1.45; }

.fxn-card {
  position: relative; display: flex; gap: 12px; padding: 14px;
  border-radius: 20px; background: var(--glass);
  border: 1px solid var(--line);
  transition: background .2s, border-color .2s, transform .18s;
}
.fxn-card.is-unread {
  background: rgba(139,92,246,.11);
  border-color: rgba(139,92,246,.36);
}
.fxn-card[data-kind="rival"] {
  border-left: 4px solid var(--pink);
}
.fxn-card[data-kind="success"] {
  border-left: 4px solid var(--green);
}
.fxn-card[data-kind="warn"] {
  border-left: 4px solid var(--gold);
}
.fxn-card[data-kind="info"] {
  border-left: 4px solid var(--cyan);
}
.fxn-badge-icon {
  width: 44px; height: 44px; border-radius: 14px; flex: none;
  display: grid; place-items: center; font-size: 22px;
  background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.1);
}
.fxn-body { flex: 1; min-width: 0; }
.fxn-meta {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 700; color: var(--mute);
  text-transform: uppercase; letter-spacing: .4px; margin-bottom: 3px;
}
.fxn-dot {
  width: 7px; height: 7px; border-radius: 50%; background: var(--cyan);
  box-shadow: 0 0 8px var(--cyan);
}
.fxn-title {
  margin: 0; font-size: 14.5px; font-weight: 700; color: #fff; line-height: 1.3;
}
.fxn-card[data-kind="rival"] .fxn-title { color: var(--gold); }
.fxn-text {
  margin: 4px 0 0; font-size: 13px; color: var(--soft); line-height: 1.4;
  word-break: break-word;
}
.fxn-actions {
  display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px;
}
.fxn-btn {
  height: 32px; padding: 0 14px; border-radius: 16px;
  font-size: 12.5px; font-weight: 700;
  background: var(--glass-2); border: 1px solid var(--line); color: #fff;
  transition: transform .15s, background .2s;
}
.fxn-btn.primary {
  background: linear-gradient(135deg, var(--cyan), var(--violet));
  border-color: transparent; color: #fff;
}
.fxn-btn:active { transform: scale(.94); }
.fxn-del {
  width: 28px; height: 28px; border-radius: 10px; flex: none;
  display: grid; place-items: center; color: var(--mute);
  margin: -4px -4px 0 0;
}
.fxn-del:hover { color: #fff; background: rgba(255,255,255,.08); }
.fxn-del svg { width: 15px; height: 15px; }
`;

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected || typeof document === 'undefined') return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.id = 'fliper-notices-css';
  style.textContent = NOTICES_CSS;
  document.head.appendChild(style);
}

function relativeTime(at: number, now = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((now - at) / 1000));
  if (diffSec < 45) return 'agora';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `há ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `há ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'ontem' : `há ${days}d`;
}

function categoryLabel(cat: NoticeCategory, kind: string): string {
  if (kind === 'rival') return 'Desafio no Ranking';
  if (cat === 'ranking') return 'Ranking';
  if (cat === 'chat') return 'Bate-papo';
  return 'Sistema';
}

function itemEmoji(item: NoticeHistoryItem): string {
  if (item.gameId) {
    const g = GAMES.find((game) => game.id === item.gameId);
    if (g?.emoji) return g.emoji;
  }
  if (item.kind === 'rival') return '⚔️';
  if (item.category === 'chat') return '💬';
  if (item.kind === 'success') return '✅';
  if (item.kind === 'warn') return '⚠️';
  return '🔔';
}

let currentOverlay: NotificationsOverlay | null = null;

export function isNotificationsOpen(): boolean {
  return currentOverlay !== null;
}

export function openNotifications(sfx: Sfx, opts: NotificationsOpenOptions = {}): void {
  if (currentOverlay) return;
  currentOverlay = new NotificationsOverlay(sfx, opts);
}

class NotificationsOverlay {
  private readonly root: HTMLElement;
  private readonly listEl: HTMLElement;
  private readonly subEl: HTMLElement;
  private readonly tabsEl: HTMLElement;
  private readonly browserBarEl: HTMLElement;
  private readonly clearBtn: HTMLButtonElement;
  private readonly offChange: () => void;
  private filter: FilterTab = 'all';
  private closed = false;

  constructor(
    private readonly sfx: Sfx,
    private readonly opts: NotificationsOpenOptions,
  ) {
    injectStyles();
    this.root = document.createElement('div');
    this.root.className = 'fxn';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Central de notificações');

    const scrim = document.createElement('div');
    scrim.className = 'fxn-scrim';
    scrim.addEventListener('click', () => this.close());

    const panel = document.createElement('div');
    panel.className = 'fxn-panel';

    // Header
    const head = document.createElement('header');
    head.className = 'fxn-head';
    const titlebar = document.createElement('div');
    titlebar.className = 'fxn-titlebar';

    const logo = document.createElement('div');
    logo.className = 'fxn-logo';
    logo.innerHTML = SVG.bell;

    const titles = document.createElement('div');
    titles.className = 'fxn-titles';
    const h2 = document.createElement('h2');
    h2.textContent = 'Notificações';
    this.subEl = document.createElement('p');
    this.subEl.className = 'fxn-sub';
    titles.append(h2, this.subEl);

    this.clearBtn = document.createElement('button');
    this.clearBtn.type = 'button';
    this.clearBtn.className = 'fxn-icon';
    this.clearBtn.innerHTML = SVG.trash;
    this.clearBtn.title = 'Limpar tudo';
    this.clearBtn.setAttribute('aria-label', 'Limpar histórico de notificações');
    this.clearBtn.addEventListener('click', () => {
      this.sfx.play('click');
      clearNoticeHistory();
    });

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'fxn-icon';
    closeBtn.innerHTML = SVG.close;
    closeBtn.setAttribute('aria-label', 'Fechar');
    closeBtn.addEventListener('click', () => this.close());

    titlebar.append(logo, titles, this.clearBtn, closeBtn);

    this.tabsEl = document.createElement('div');
    this.tabsEl.className = 'fxn-tabs';

    head.append(titlebar, this.tabsEl);

    // Optional browser push/background notification toggle
    this.browserBarEl = document.createElement('div');
    this.browserBarEl.className = 'fxn-browser-bar';

    this.listEl = document.createElement('div');
    this.listEl.className = 'fxn-list';

    panel.append(head, this.browserBarEl, this.listEl);
    this.root.append(scrim, panel);
    document.body.appendChild(this.root);

    this.render();
    // Mark all current notifications as read once the player opens the center.
    markAllNoticesRead();

    this.offChange = onNoticeHistoryChange(() => this.render());
    window.addEventListener('keydown', this.onKey);

    requestAnimationFrame(() => {
      this.root.classList.add('is-open');
    });
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.close();
  };

  private render(): void {
    const all = listNoticeHistory();
    const counts: Record<FilterTab, number> = {
      all: all.length,
      ranking: all.filter((i) => i.category === 'ranking').length,
      chat: all.filter((i) => i.category === 'chat').length,
      system: all.filter((i) => i.category === 'system').length,
    };

    this.subEl.textContent =
      all.length === 0
        ? 'Tudo em dia por aqui'
        : `${all.length} ${all.length === 1 ? 'aviso recente' : 'avisos recentes'}`;
    this.clearBtn.style.display = all.length > 0 ? '' : 'none';

    // Filter tabs
    this.tabsEl.replaceChildren();
    for (const t of FILTER_TABS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `fxn-tab${this.filter === t.id ? ' is-on' : ''}`;
      const emo = document.createElement('span');
      emo.textContent = t.emoji;
      const lbl = document.createElement('span');
      lbl.textContent = t.label;
      btn.append(emo, lbl);
      if (counts[t.id] > 0) {
        const cnt = document.createElement('span');
        cnt.className = 'cnt';
        cnt.textContent = String(counts[t.id]);
        btn.appendChild(cnt);
      }
      btn.addEventListener('click', () => {
        if (this.filter === t.id) return;
        this.sfx.play('click');
        this.filter = t.id;
        this.render();
      });
      this.tabsEl.appendChild(btn);
    }

    // Browser notification bar
    const perm = browserNotificationState();
    if (perm === 'unsupported' || perm === 'denied') {
      this.browserBarEl.style.display = 'none';
    } else {
      this.browserBarEl.style.display = 'flex';
      const enabled = isBrowserNotifyEnabled();
      this.browserBarEl.replaceChildren();
      const info = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = 'Avisos em segundo plano';
      const span = document.createElement('span');
      span.textContent = enabled
        ? 'Ativado quando a aba estiver oculta'
        : 'Receba alerta se passarem você ou te mencionarem';
      info.append(strong, span);

      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = `fxn-switch${enabled ? ' is-on' : ''}`;
      toggleBtn.textContent = enabled ? 'Ativo ✓' : 'Ativar';
      toggleBtn.addEventListener('click', () => {
        this.sfx.play('click');
        void setBrowserNotifyEnabled(!enabled).then(() => this.render());
      });
      this.browserBarEl.append(info, toggleBtn);
    }

    // Items list
    const filtered =
      this.filter === 'all' ? all : all.filter((item) => item.category === this.filter);
    this.listEl.replaceChildren();

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'fxn-empty';
      const emo = document.createElement('span');
      emo.className = 'emo';
      emo.textContent = this.filter === 'ranking' ? '🏆' : this.filter === 'chat' ? '💬' : '✨';
      const h3 = document.createElement('h3');
      h3.textContent = 'Nenhuma notificação aqui';
      const p = document.createElement('p');
      p.textContent =
        this.filter === 'ranking'
          ? 'Quando alguém passar você no ranking global ou seus recordes sincronizarem, o aviso aparece aqui.'
          : this.filter === 'chat'
            ? 'Menções (@apelido) e respostas às suas mensagens no bate-papo ficam salvas aqui.'
            : 'Avisos de rivais no ranking, menções no chat e sincronização aparecerão aqui.';
      empty.append(emo, h3, p);
      this.listEl.appendChild(empty);
      return;
    }

    const now = Date.now();
    for (const item of filtered) {
      this.listEl.appendChild(this.buildCard(item, now));
    }
  }

  private buildCard(item: NoticeHistoryItem, now: number): HTMLElement {
    const card = document.createElement('div');
    card.className = `fxn-card${item.read ? '' : ' is-unread'}`;
    card.dataset.kind = item.kind;

    const icon = document.createElement('div');
    icon.className = 'fxn-badge-icon';
    icon.textContent = itemEmoji(item);

    const body = document.createElement('div');
    body.className = 'fxn-body';

    const meta = document.createElement('div');
    meta.className = 'fxn-meta';
    if (!item.read) {
      const dot = document.createElement('span');
      dot.className = 'fxn-dot';
      meta.appendChild(dot);
    }
    const cat = document.createElement('span');
    cat.textContent = `${categoryLabel(item.category, item.kind)} • ${relativeTime(item.at, now)}`;
    meta.appendChild(cat);

    const title = document.createElement('h4');
    title.className = 'fxn-title';
    title.textContent = item.title;

    body.append(meta, title);

    if (item.body) {
      const text = document.createElement('p');
      text.className = 'fxn-text';
      text.textContent = item.body;
      body.appendChild(text);
    }

    const actions = document.createElement('div');
    actions.className = 'fxn-actions';

    if (item.gameId) {
      const rankBtn = document.createElement('button');
      rankBtn.type = 'button';
      rankBtn.className = 'fxn-btn primary';
      rankBtn.textContent = 'Ver ranking';
      rankBtn.addEventListener('click', () => {
        markNoticeRead(item.id);
        const gameId = item.gameId!;
        this.close(() => this.opts.onOpenLeaderboard?.(gameId));
      });
      const playBtn = document.createElement('button');
      playBtn.type = 'button';
      playBtn.className = 'fxn-btn';
      playBtn.textContent = 'Jogar agora';
      playBtn.addEventListener('click', () => {
        markNoticeRead(item.id);
        const gameId = item.gameId!;
        this.close(() => this.opts.onPlayGame?.(gameId));
      });
      actions.append(rankBtn, playBtn);
    } else if (item.category === 'chat') {
      const chatBtn = document.createElement('button');
      chatBtn.type = 'button';
      chatBtn.className = 'fxn-btn primary';
      chatBtn.textContent = 'Abrir chat';
      chatBtn.addEventListener('click', () => {
        markNoticeRead(item.id);
        const room = item.chatRoom;
        this.close(() => this.opts.onOpenChat?.(room));
      });
      actions.appendChild(chatBtn);
    }

    if (actions.childElementCount > 0) {
      body.appendChild(actions);
    }

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'fxn-del';
    del.innerHTML = SVG.close;
    del.setAttribute('aria-label', 'Remover notificação');
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      this.sfx.play('click');
      removeNoticeHistory(item.id);
    });

    card.append(icon, body, del);
    return card;
  }

  close(after?: () => void): void {
    if (this.closed) return;
    this.closed = true;
    this.sfx.play('click');
    this.offChange();
    window.removeEventListener('keydown', this.onKey);
    currentOverlay = null;
    this.root.classList.remove('is-open');
    setTimeout(() => {
      this.root.remove();
      this.opts.onClose?.();
      after?.();
    }, 240);
  }
}
