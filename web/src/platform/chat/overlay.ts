import { GAMES } from '@/games/registry';
import type { Sfx } from '@/platform/audio/Sfx';
import { avatarColorFor } from '@/platform/ui/arcadeFormat';
import {
  cleanText,
  EMOJI_GROUPS,
  GENERAL_ROOM,
  isJumboEmoji,
  MAX_TEXT,
  mentions,
  mergeMessages,
  onlinePlayers,
  PAGE,
  PROBLEM_LABEL,
  REACTIONS,
  reactionSummary,
  snippet,
  splitMentions,
  timeLabel,
  toggleReaction,
  typingLabel,
  typingNames,
  validateText,
  layoutRows,
  type ChatMessage,
  type ChatRow,
  type Presence,
  type Quote,
  type Reaction,
} from './core';
import type { ChatService } from './service';
import { injectChatStyles } from './styles';

export interface ChatOpenOptions {
  /** Room to open on (a game id, or the general room). */
  readonly room?: string;
  /** Other game rooms to offer as tabs (e.g. the recently played games). */
  readonly rooms?: readonly string[];
  /** "Play too": launches a game a friend is playing. */
  readonly onPlay?: (gameId: string) => void;
  readonly onClose?: () => void;
}

// Static icons (never user content).
const ICON = {
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12Z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01" stroke-width="3"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M3.4 20.6 21 12 3.4 3.4l-.1 6.7L15 12 3.3 13.9z"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  clock:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2" stroke-linecap="round"/></svg>',
  check:
    '<svg class="ok" viewBox="0 0 24 24" fill="none" stroke="#38e1ff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  google:
    '<svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>',
};

const LONG_PRESS_MS = 420;
const DOUBLE_TAP_MS = 280;
const SWIPE_REPLY_PX = 64;
const NEAR_BOTTOM_PX = 140;

const gameOf = (id: string) => GAMES.find((g) => g.id === id);

function roomLabel(room: string): { emoji: string; name: string } {
  if (room === GENERAL_ROOM) return { emoji: '🌎', name: 'Geral' };
  const g = gameOf(room);
  return { emoji: g?.emoji ?? '🎮', name: g?.title ?? room };
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

function iconButton(cls: string, svg: string, label: string): HTMLButtonElement {
  const b = h('button', cls);
  b.type = 'button';
  b.innerHTML = svg;
  b.setAttribute('aria-label', label);
  return b;
}

function avatar(name: string, small = false, online = false): HTMLElement {
  const a = h(
    'div',
    `fxc-av${small ? ' sm' : ''}${online ? ' on' : ''}`,
    [...name][0]?.toUpperCase() ?? '?',
  );
  a.style.setProperty('--c', `#${avatarColorFor(name).toString(16).padStart(6, '0')}`);
  return a;
}

const reducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let current: ChatOverlay | null = null;

/** Opens the chat (or brings the open one to the given room). */
export function openChat(chat: ChatService, sfx: Sfx, opts: ChatOpenOptions = {}): void {
  if (current) {
    if (opts.room) current.switchRoom(opts.room);
    return;
  }
  current = new ChatOverlay(chat, sfx, opts);
}

export function isChatOpen(): boolean {
  return current !== null;
}

/**
 * The chat window: a DOM overlay above the game (native keyboard, text selection and smooth
 * scrolling). Messages are rendered incrementally by key, so live updates never rebuild the list.
 */
class ChatOverlay {
  private readonly root = h('div', 'fxc');
  private readonly panel = h('section', 'fxc-panel');
  private readonly sub = h('p', 'fxc-sub');
  private readonly roomsBar = h('nav', 'fxc-rooms');
  private readonly onlineBar = h('div', 'fxc-online');
  private readonly list = h('main', 'fxc-list');
  private readonly top = h('div', 'fxc-more');
  private readonly rowsBox = h('div');
  private readonly typingRow = h('div', 'fxc-typing');
  private readonly jump = h('button', 'fxc-jump');
  private readonly composer = h('footer', 'fxc-composer');
  private readonly replyBox = h('div', 'fxc-reply');
  private readonly input = h('textarea');
  private readonly send = iconButton('fxc-send', ICON.send, 'Enviar');
  private readonly emojiBtn = h('button', 'fxc-emoji-btn', '😊');
  private readonly emojiBox = h('div', 'fxc-emoji');
  private readonly hint = h('div', 'fxc-hint');
  private readonly banner = h('div', 'fxc-banner');
  private readonly menu = h('div', 'fxc-menu');
  private readonly gate = h('div', 'fxc-gate');
  private readonly toastEl = h('div', 'fxc-toast');

  private room: string;
  private rooms: string[];
  private me: string | null = null;
  private live: ChatMessage[] = [];
  private older: ChatMessage[] = [];
  private msgs: ChatMessage[] = [];
  private presence: Presence[] = [];
  private readonly rendered = new Map<string, { el: HTMLElement; sig: string }>();
  private readonly known = new Set<string>();
  private firstBatch = true;
  private hasOlder = true;
  private loadingOlder = false;
  private unseenBelow = 0;
  private replyTo: ChatMessage | null = null;
  private stopRoom: (() => void) | null = null;
  private stopPresence: (() => void) | null = null;
  private readonly cleanups: Array<() => void> = [];
  private tick: ReturnType<typeof setInterval> | null = null;
  private emojiTab = 1;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private hintTimer: ReturnType<typeof setTimeout> | null = null;
  private cooldownRaf = 0;
  private closed = false;

  constructor(
    private readonly chat: ChatService,
    private readonly sfx: Sfx,
    private readonly opts: ChatOpenOptions,
  ) {
    injectChatStyles();
    this.room = opts.room ?? GENERAL_ROOM;
    const extra = [opts.room, ...(opts.rooms ?? [])].filter(
      (r): r is string => !!r && r !== GENERAL_ROOM && !!gameOf(r),
    );
    this.rooms = [GENERAL_ROOM, ...new Set(extra)].slice(0, 7);
    this.build();
    document.body.appendChild(this.root);
    this.fitViewport();
    requestAnimationFrame(() => requestAnimationFrame(() => this.root.classList.add('is-open')));
    void this.start();
  }

  // ── Building ────────────────────────────────────────────────────────────────

  private build(): void {
    const { root, panel } = this;
    root.setAttribute('role', 'presentation');
    const scrim = h('div', 'fxc-scrim');
    scrim.addEventListener('click', () => this.close());
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Chat do Fliper');

    // Header.
    const head = h('header', 'fxc-head');
    const bar = h('div', 'fxc-titlebar');
    const logo = h('div', 'fxc-logo');
    logo.innerHTML = ICON.chat;
    const titles = h('div', 'fxc-titles');
    titles.append(h('h2', '', 'Chat'), this.sub);
    const close = iconButton('fxc-icon', ICON.close, 'Fechar chat');
    close.addEventListener('click', () => this.close());
    bar.append(logo, titles, close);
    head.append(bar, this.roomsBar, this.onlineBar);
    this.renderRooms();
    this.setSub('Conectando…', false);

    // Messages.
    this.list.setAttribute('role', 'log');
    this.list.setAttribute('aria-live', 'polite');
    this.list.append(this.top, this.rowsBox, this.typingRow);
    const dots = h('div', 'fxc-dots');
    dots.append(h('i'), h('i'), h('i'));
    this.typingRow.append(dots, h('span', 't'));
    this.list.addEventListener('scroll', () => this.onScroll(), { passive: true });
    this.jump.type = 'button';
    this.jump.addEventListener('click', () => this.scrollToBottom(true));

    // Composer.
    this.input.rows = 1;
    this.input.maxLength = MAX_TEXT + 40;
    this.input.setAttribute('enterkeyhint', 'send');
    this.input.setAttribute('aria-label', 'Mensagem');
    this.input.addEventListener('input', () => this.onInput());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        void this.submit();
      }
    });
    this.input.addEventListener('focus', () => this.toggleEmoji(false));
    this.input.addEventListener('blur', () => this.chat.stopTyping());
    this.emojiBtn.type = 'button';
    this.emojiBtn.setAttribute('aria-label', 'Emojis');
    this.emojiBtn.addEventListener('click', () => this.toggleEmoji());
    this.send.type = 'button';
    this.send.addEventListener('click', () => void this.submit());
    this.send.insertAdjacentHTML(
      'beforeend',
      '<svg class="ring" viewBox="0 0 54 54"><circle cx="27" cy="27" r="25" stroke-dasharray="157" stroke-dashoffset="157"/></svg>',
    );
    const field = h('div', 'fxc-field');
    field.append(this.emojiBtn, this.input);
    const barRow = h('div', 'fxc-bar');
    barRow.append(field, this.send);
    this.composer.append(this.replyBox, barRow, this.hint, this.emojiBox);
    this.buildEmoji();
    this.updateSend();

    panel.append(
      head,
      this.banner,
      this.list,
      this.jump,
      this.composer,
      this.gate,
      this.menu,
      this.toastEl,
    );
    root.append(scrim, panel);

    // Keys typed in the chat must not reach the game behind it.
    const stopKeys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (this.menu.classList.contains('is-on')) this.closeMenu();
        else this.close();
      }
      e.stopPropagation();
    };
    root.addEventListener('keydown', stopKeys);
    // Escape also works when the focus is outside the chat (e.g. on the page body).
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || root.contains(e.target as Node)) return;
      if (this.menu.classList.contains('is-on')) this.closeMenu();
      else this.close();
    };
    document.addEventListener('keydown', escape);
    this.cleanups.push(() => document.removeEventListener('keydown', escape));
    root.addEventListener('keyup', (e) => e.stopPropagation());

    const vv = window.visualViewport;
    const fit = () => this.fitViewport();
    vv?.addEventListener('resize', fit);
    vv?.addEventListener('scroll', fit);
    window.addEventListener('resize', fit);
    this.cleanups.push(() => {
      vv?.removeEventListener('resize', fit);
      vv?.removeEventListener('scroll', fit);
      window.removeEventListener('resize', fit);
    });
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() =>
            this.panel.style.setProperty('--composer-h', `${this.composer.offsetHeight}px`),
          )
        : null;
    ro?.observe(this.composer);
    this.cleanups.push(() => ro?.disconnect());

    // Older messages load when the top of the list comes into view.
    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver((e) => e[0]?.isIntersecting && void this.loadOlder(), {
            root: this.list,
          })
        : null;
    io?.observe(this.top);
    this.cleanups.push(() => io?.disconnect());
  }

  /** Follows the on-screen keyboard (visual viewport) so the composer stays visible. */
  private fitViewport(): void {
    const vv = window.visualViewport;
    const height = vv ? vv.height : window.innerHeight;
    this.root.style.setProperty('--vvh', `${Math.round(height)}px`);
    this.root.style.setProperty('--vvtop', `${Math.round(vv?.offsetTop ?? 0)}px`);
  }

  private renderRooms(): void {
    this.roomsBar.replaceChildren(
      ...this.rooms.map((r) => {
        const { emoji, name } = roomLabel(r);
        const b = h('button', `fxc-room${r === this.room ? ' is-on' : ''}`);
        b.type = 'button';
        b.append(h('span', 'e', emoji), h('span', '', name));
        b.addEventListener('click', () => this.switchRoom(r));
        return b;
      }),
    );
    this.roomsBar.querySelector('.is-on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    this.input.placeholder = `Mensagem em ${roomLabel(this.room).name}…`;
  }

  private setSub(text: string, live: boolean): void {
    this.sub.replaceChildren(...(live ? [h('i', 'fxc-live')] : []), h('span', '', text));
  }

  // ── Session ─────────────────────────────────────────────────────────────────

  private async start(): Promise<void> {
    if (!this.chat.available) {
      this.showGate('offline');
      return;
    }
    void this.chat.account.prepare();
    const uid = await this.chat.backend!.uid().catch(() => null);
    if (this.closed) return;
    if (!uid) {
      this.showGate('login');
      return;
    }
    this.me = uid;
    this.gate.classList.remove('is-on');
    this.stopPresence = this.chat.backend!.watchPresence((list) => {
      this.presence = list;
      this.renderPresence();
    });
    this.tick = setInterval(() => this.renderPresence(), 2000);
    this.enterRoom();
  }

  switchRoom(room: string): void {
    if (room === this.room) return;
    if (!this.rooms.includes(room)) {
      this.rooms = [...this.rooms, room];
    }
    this.room = room;
    this.renderRooms();
    this.cancelReply();
    if (this.me) this.enterRoom();
  }

  private enterRoom(): void {
    this.stopRoom?.();
    this.chat.openRoom = this.room;
    this.live = [];
    this.older = [];
    this.msgs = [];
    this.known.clear();
    for (const { el } of this.rendered.values()) el.remove();
    this.rendered.clear();
    this.firstBatch = true;
    this.hasOlder = true;
    this.unseenBelow = 0;
    this.updateJump();
    this.top.replaceChildren(h('div', 'fxc-spin'));
    this.banner.classList.remove('is-on');
    const room = this.room;
    this.stopRoom = this.chat.backend!.watchRoom(
      room,
      (msgs) => {
        if (room !== this.room || this.closed) return;
        this.live = msgs;
        if (msgs.length < PAGE) this.hasOlder = false;
        this.refresh();
      },
      (err) => {
        console.warn('Chat indisponível.', err);
        this.showBanner('Não foi possível carregar o chat agora. Tente de novo em instantes.');
        this.top.replaceChildren();
      },
    );
  }

  private showGate(mode: 'login' | 'offline'): void {
    const g = this.gate;
    g.replaceChildren();
    const ghost = h('div', 'fxc-ghost');
    for (let i = 0; i < 9; i++) ghost.append(h('div'));
    const card = h('div', 'fxc-gatecard');
    const lock = h('div', 'fxc-lock', mode === 'login' ? '🔒' : '📡');
    const title = h('h3', '', mode === 'login' ? 'Entre para conversar' : 'Chat indisponível');
    const text = h(
      'p',
      '',
      mode === 'login'
        ? 'O chat do Fliper é exclusivo para jogadores com conta. Entre com Google para conversar, desafiar amigos e ver quem está online.'
        : 'O chat precisa de conexão com o servidor do Fliper. Tente de novo quando estiver online.',
    );
    card.append(lock, title, text);
    if (mode === 'login') {
      const perks = h('div', 'fxc-perks');
      for (const p of ['💬 Tempo real', '🟢 Quem está online', '🏆 Desafios', '🛡️ Sem spam'])
        perks.append(h('span', '', p));
      const btn = h('button', 'fxc-google');
      btn.type = 'button';
      btn.innerHTML = ICON.google;
      btn.append(h('span', '', 'Entrar com Google'));
      const msg = h('div', 'fxc-gatemsg');
      const ready = () => {
        btn.disabled = !this.chat.account.isReady;
      };
      ready();
      if (!this.chat.account.isReady)
        void this.chat.account.prepare().then((ok) => {
          ready();
          if (!ok) msg.textContent = 'Sem conexão agora. Tente de novo.';
        });
      btn.addEventListener('click', () => {
        if (!this.chat.account.isReady) return;
        btn.disabled = true;
        // The Google popup must open inside this click.
        const pending = this.chat.account.signIn();
        btn.lastElementChild!.textContent = 'Entrando…';
        void pending.then((r) => {
          if (this.closed) return;
          btn.disabled = false;
          btn.lastElementChild!.textContent = 'Entrar com Google';
          if (r.type === 'signed-in') {
            this.sfx.play('win');
            void this.start();
          } else if (r.type === 'error') msg.textContent = r.message;
        });
      });
      card.append(perks, btn, msg);
    }
    const later = h('button', 'fxc-later', mode === 'login' ? 'Agora não' : 'Fechar');
    later.type = 'button';
    later.addEventListener('click', () => this.close());
    card.append(later);
    g.append(ghost, card);
    g.classList.add('is-on');
    this.setSub(mode === 'login' ? 'Exclusivo para jogadores com conta' : 'Offline', false);
  }

  // ── Messages ────────────────────────────────────────────────────────────────

  private refresh(): void {
    const nearBottom = this.isNearBottom();
    const prevHeight = this.list.scrollHeight;
    const prevTop = this.list.scrollTop;
    const firstId = this.msgs[0]?.id;
    this.msgs = mergeMessages(this.older, this.live).filter((m) => !this.chat.isMuted(m.uid));

    // New arrivals (not on the first load): sound, mention check, "new messages" pill.
    const fresh = this.firstBatch ? [] : this.msgs.filter((m) => !this.known.has(m.id));
    for (const m of this.msgs) this.known.add(m.id);
    const fromOthers = fresh.filter((m) => m.uid !== this.me);
    if (fromOthers.length) this.sfx.play('tick');

    this.renderRows(new Set(fresh.map((m) => m.id)));
    this.renderStart();

    const prepended =
      !!firstId && this.msgs[0]?.id !== firstId && !fresh.some((m) => m.id === this.msgs[0]?.id);
    if (this.firstBatch) {
      this.firstBatch = false;
      this.top.replaceChildren();
      this.scrollToBottom(false);
    } else if (prepended) {
      this.list.scrollTop = prevTop + (this.list.scrollHeight - prevHeight);
    } else if (nearBottom || fresh.some((m) => m.uid === this.me)) {
      this.scrollToBottom(true);
    } else if (fromOthers.length) {
      this.unseenBelow += fromOthers.length;
      this.updateJump();
    }
    this.markSeen();
  }

  private renderStart(): void {
    const old = this.rowsBox.querySelector('.fxc-start');
    if (this.hasOlder || this.firstBatch) {
      old?.remove();
      return;
    }
    if (old) return;
    const { emoji, name } = roomLabel(this.room);
    const s = h('div', 'fxc-start');
    s.append(
      h('span', 'big', emoji),
      h(
        'b',
        '',
        this.room === GENERAL_ROOM ? 'Bem-vindo ao chat do Fliper!' : `Sala de ${name}`,
      ),
      h(
        'span',
        '',
        this.msgs.length
          ? 'Este é o começo da conversa. Seja gentil e divirta-se!'
          : 'Ninguém falou ainda. Diga oi e chame a galera para jogar!',
      ),
    );
    this.rowsBox.prepend(s);
  }

  private signature(row: ChatRow): string {
    if (row.kind === 'day') return row.label;
    const m = row.msg;
    return JSON.stringify([
      row.first,
      row.last,
      row.mine,
      m.text,
      m.del,
      m.pending,
      m.r,
      m.re?.id,
      m.name,
    ]);
  }

  private renderRows(animate: Set<string>): void {
    const rows = layoutRows(this.msgs, this.me ?? '', Date.now());
    const keep = new Set<string>();
    const start = this.rowsBox.querySelector('.fxc-start');
    // Walks the wanted order, moving or inserting only the elements that are out of place.
    let ref: ChildNode | null = start ? start.nextSibling : this.rowsBox.firstChild;
    for (const row of rows) {
      keep.add(row.key);
      const sig = this.signature(row);
      let entry = this.rendered.get(row.key);
      if (!entry || entry.sig !== sig) {
        const el =
          row.kind === 'day'
            ? this.dayEl(row.label)
            : this.rowEl(row, animate.has(row.key) && !reducedMotion());
        if (entry) {
          if (ref === entry.el) ref = entry.el.nextSibling;
          entry.el.remove();
        }
        entry = { el, sig };
        this.rendered.set(row.key, entry);
      }
      if (entry.el === ref) ref = ref.nextSibling;
      else this.rowsBox.insertBefore(entry.el, ref);
    }
    for (const [key, { el }] of this.rendered) {
      if (keep.has(key)) continue;
      el.remove();
      this.rendered.delete(key);
    }
  }

  private dayEl(label: string): HTMLElement {
    const d = h('div', 'fxc-day');
    d.append(h('span', '', label));
    return d;
  }

  private rowEl(row: Extract<ChatRow, { kind: 'msg' }>, animate: boolean): HTMLElement {
    const m = row.msg;
    const mention = !row.mine && !m.del && mentions(m.text, this.chat.name);
    const r = h(
      'div',
      `fxc-row${row.mine ? ' mine' : ''}${row.first ? ' first' : ''}${row.last ? ' last' : ''}${m.pending ? ' pending' : ''}${mention ? ' mention' : ''}${animate ? ' in' : ''}`,
    );
    r.dataset.id = m.id;
    const slot = h('div', 'slot');
    if (row.last && !row.mine) {
      const online = this.presence.some((p) => p.uid === m.uid && Date.now() - p.at < 150_000);
      const av = avatar(m.name, false, online);
      av.addEventListener('click', () => this.mention(m.name));
      slot.append(av);
    }
    const col = h('div', 'fxc-col');
    if (row.first && !row.mine) {
      const n = h('div', 'fxc-name', m.name);
      n.style.color = `#${avatarColorFor(m.name).toString(16).padStart(6, '0')}`;
      n.addEventListener('click', () => this.mention(m.name));
      col.append(n);
    }
    const bubble = h('div', 'fxc-bubble');
    if (m.del) {
      bubble.classList.add('deleted');
      bubble.textContent = '🚫 Mensagem apagada';
    } else {
      if (m.re) {
        const q = h('span', 'fxc-quote');
        q.append(h('b', '', m.re.name), document.createTextNode(m.re.text));
        q.addEventListener('click', (e) => {
          e.stopPropagation();
          this.flashMessage(m.re!.id);
        });
        bubble.append(q);
      }
      if (!m.re && isJumboEmoji(m.text)) bubble.classList.add('jumbo');
      for (const part of splitMentions(m.text)) {
        bubble.append(
          part.mention ? h('span', 'fxc-mention', part.text) : document.createTextNode(part.text),
        );
      }
      this.bindGestures(bubble, r, m);
    }
    col.append(bubble);

    const reacts = reactionSummary(m.r, this.me ?? '');
    if (reacts.length && !m.del) {
      const box = h('div', 'fxc-reacts');
      for (const x of reacts) {
        const pill = h('button', `fxc-react${x.mine ? ' mine' : ''}`);
        pill.type = 'button';
        pill.append(document.createTextNode(x.emoji), h('span', 'c', String(x.count)));
        pill.addEventListener('click', () => void this.react(m, x.emoji as Reaction, pill));
        box.append(pill);
      }
      col.append(box);
    }
    if (row.last) {
      const meta = h('div', 'fxc-meta', timeLabel(m.at));
      if (row.mine) meta.insertAdjacentHTML('beforeend', m.pending ? ICON.clock : ICON.check);
      col.append(meta);
    }

    if (!m.del) {
      const actions = h('div', 'fxc-actions');
      const react = h('button', '', '😊');
      react.type = 'button';
      react.title = 'Reagir';
      react.addEventListener('click', () => this.openMenu(m, bubble));
      const reply = h('button', '', '↩️');
      reply.type = 'button';
      reply.title = 'Responder';
      reply.addEventListener('click', () => this.startReply(m));
      actions.append(react, reply);
      r.append(actions);
    }
    r.prepend(slot, col);
    return r;
  }

  // ── Gestures ────────────────────────────────────────────────────────────────

  /** Long-press for the menu, double-tap for ❤️, swipe right to reply. */
  private bindGestures(bubble: HTMLElement, row: HTMLElement, m: ChatMessage): void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let start: { x: number; y: number } | null = null;
    let swiping = false;
    let lastTap = 0;
    let longPressed = false;
    const reset = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      bubble.classList.remove('pressed');
      if (swiping) {
        row.style.transition = 'transform .25s cubic-bezier(.2,.9,.25,1.12)';
        row.style.transform = '';
        setTimeout(() => (row.style.transition = ''), 260);
      }
      swiping = false;
      start = null;
    };
    bubble.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      start = { x: e.clientX, y: e.clientY };
      longPressed = false;
      bubble.classList.add('pressed');
      timer = setTimeout(() => {
        longPressed = true;
        bubble.classList.remove('pressed');
        navigator.vibrate?.(10);
        this.openMenu(m, bubble);
      }, LONG_PRESS_MS);
    });
    bubble.addEventListener('pointermove', (e) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        if (timer) clearTimeout(timer);
        timer = null;
        bubble.classList.remove('pressed');
      }
      if (e.pointerType !== 'mouse' && dx > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) swiping = true;
      if (swiping) {
        const pull = Math.min(90, Math.max(0, dx) * 0.6);
        row.style.transform = `translateX(${pull}px)`;
      }
    });
    bubble.addEventListener('pointerup', (e) => {
      const dx = start ? e.clientX - start.x : 0;
      const wasSwipe = swiping;
      reset();
      if (wasSwipe) {
        if (dx * 0.6 >= SWIPE_REPLY_PX * 0.6 && dx >= SWIPE_REPLY_PX) {
          navigator.vibrate?.(8);
          this.startReply(m);
        }
        return;
      }
      if (longPressed) return;
      const now = Date.now();
      if (now - lastTap < DOUBLE_TAP_MS) {
        lastTap = 0;
        void this.react(m, '❤️', bubble, true);
      } else lastTap = now;
    });
    bubble.addEventListener('pointercancel', reset);
    bubble.addEventListener('pointerleave', () => {
      if (!swiping) reset();
    });
    bubble.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.openMenu(m, bubble);
    });
  }

  // ── Context menu ────────────────────────────────────────────────────────────

  private openMenu(m: ChatMessage, anchor: HTMLElement): void {
    if (!this.me) return;
    const mine = m.uid === this.me;
    const menu = this.menu;
    menu.replaceChildren();
    const bg = h('div', 'bg');
    bg.addEventListener('click', () => this.closeMenu());
    const sheet = h('div', 'fxc-sheet');
    const bar = h('div', 'fxc-reactbar');
    REACTIONS.forEach((e, i) => {
      const b = h('button', m.r?.[this.me!] === e ? 'is-on' : '', e);
      b.type = 'button';
      b.style.animationDelay = `${i * 25}ms`;
      b.addEventListener('click', () => {
        this.closeMenu();
        void this.react(m, e, anchor);
      });
      bar.append(b);
    });
    const preview = h('div', 'fxc-preview', snippet(m.text, 160));
    const opts = h('div', 'fxc-opts');
    const opt = (icon: string, label: string, fn: () => void, danger = false) => {
      const b = h('button', danger ? 'danger' : '');
      b.type = 'button';
      b.append(h('span', 'i', icon), h('span', '', label));
      b.addEventListener('click', () => {
        this.closeMenu();
        fn();
      });
      opts.append(b);
    };
    opt('↩️', 'Responder', () => this.startReply(m));
    opt('📋', 'Copiar texto', () => {
      void navigator.clipboard?.writeText(m.text).then(() => this.toast('Copiado!'));
    });
    if (mine) {
      opt('🗑️', 'Apagar mensagem', () => void this.remove(m), true);
    } else {
      opt('@', `Mencionar ${m.name}`, () => this.mention(m.name));
      opt('🔇', `Silenciar ${m.name}`, () => this.muteUser(m.uid, m.name));
      opt('🚩', 'Denunciar', () => void this.report(m), true);
    }
    sheet.append(bar, preview, opts);
    menu.append(bg, sheet);
    menu.classList.add('is-on');
    // Next to the message, but always fully on screen.
    const pr = this.panel.getBoundingClientRect();
    const ar = anchor.getBoundingClientRect();
    const sheetH = sheet.offsetHeight || 320;
    const top = Math.min(Math.max(ar.top - pr.top - 70, 16), pr.height - sheetH - 16);
    sheet.style.top = `${Math.max(16, top)}px`;
    this.sfx.play('click');
  }

  private closeMenu(): void {
    this.menu.classList.remove('is-on');
    this.menu.replaceChildren();
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  private async react(
    m: ChatMessage,
    emoji: Reaction,
    from: HTMLElement,
    onlyAdd = false,
  ): Promise<void> {
    if (!this.me || m.del) return;
    const had = m.r?.[this.me];
    if (onlyAdd && had === emoji) {
      this.burst(emoji, from);
      return;
    }
    const next = toggleReaction(m.r, this.me, emoji);
    const value = next[this.me] ?? null;
    if (value) this.burst(emoji, from);
    navigator.vibrate?.(8);
    this.sfx.play(value ? 'pop' : 'click');
    await this.chat
      .backend!.react(this.room, m.id, value)
      .catch(() => this.toast('Não foi possível reagir agora'));
  }

  /** Little emojis floating up from where the player reacted. */
  private burst(emoji: string, from: HTMLElement): void {
    if (reducedMotion()) return;
    const pr = this.panel.getBoundingClientRect();
    const r = from.getBoundingClientRect();
    for (let i = 0; i < 6; i++) {
      const b = h('div', 'fxc-burst', emoji);
      b.style.left = `${r.left - pr.left + r.width / 2 - 11 + (Math.random() - 0.5) * 30}px`;
      b.style.top = `${r.top - pr.top + r.height / 2 - 11}px`;
      b.style.setProperty('--dx', `${(Math.random() - 0.5) * 50}px`);
      b.style.setProperty('--rot', `${(Math.random() - 0.5) * 60}deg`);
      b.style.animationDelay = `${i * 45}ms`;
      this.panel.append(b);
      setTimeout(() => b.remove(), 1100 + i * 45);
    }
  }

  private async remove(m: ChatMessage): Promise<void> {
    await this.chat
      .backend!.remove(this.room, m.id)
      .catch(() => this.toast('Não foi possível apagar'));
  }

  private async report(m: ChatMessage): Promise<void> {
    await this.chat.backend!.report(this.room, m).catch(() => undefined);
    this.chat.mute(m.uid, m.name, true);
    this.refresh();
    this.toast('Denúncia enviada. Você não verá mais esse jogador.');
  }

  private muteUser(uid: string, name: string): void {
    this.chat.mute(uid, name, true);
    this.refresh();
    this.toast(`${name} silenciado`, 'Desfazer', () => {
      this.chat.mute(uid, name, false);
      this.refresh();
    });
  }

  private mention(name: string): void {
    const tag = `@${name.replace(/\s+/g, '')} `;
    if (!this.input.value.includes(tag.trim())) {
      const v = this.input.value;
      this.input.value = `${v}${v && !v.endsWith(' ') ? ' ' : ''}${tag}`;
    }
    this.onInput();
    this.input.focus();
  }

  private startReply(m: ChatMessage): void {
    this.replyTo = m;
    this.replyBox.replaceChildren();
    const q = h('div', 'q');
    q.append(
      h('b', '', `Respondendo a ${m.uid === this.me ? 'você' : m.name}`),
      document.createTextNode(snippet(m.text, 70)),
    );
    const x = iconButton('fxc-icon', ICON.close, 'Cancelar resposta');
    x.style.width = x.style.height = '32px';
    x.addEventListener('click', () => this.cancelReply());
    this.replyBox.append(q, x);
    this.replyBox.classList.add('is-on');
    this.input.focus();
  }

  private cancelReply(): void {
    this.replyTo = null;
    this.replyBox.classList.remove('is-on');
    this.replyBox.replaceChildren();
  }

  private flashMessage(id: string): void {
    const el = this.rendered.get(id)?.el;
    if (!el) {
      this.toast('Mensagem antiga demais para mostrar');
      return;
    }
    el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  // ── Composer ────────────────────────────────────────────────────────────────

  private onInput(): void {
    const ta = this.input;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(120, ta.scrollHeight)}px`;
    if (ta.value.trim()) this.chat.typing(this.room);
    this.updateSend();
    const len = [...ta.value].length;
    if (len > MAX_TEXT - 40) this.setHint(len > MAX_TEXT ? 'err' : 'warn', `${len}/${MAX_TEXT}`, 0);
    else if (this.hint.dataset.kind !== 'err') this.setHint('', '', 0);
  }

  private updateSend(): void {
    this.send.disabled = !this.input.value.trim() || !this.me;
  }

  private setHint(kind: 'err' | 'warn' | '', text: string, clearAfter = 2600): void {
    if (this.hintTimer) clearTimeout(this.hintTimer);
    this.hint.replaceChildren();
    this.hint.dataset.kind = kind;
    if (text) this.hint.append(h('span', kind, text));
    if (clearAfter && text) this.hintTimer = setTimeout(() => this.setHint('', '', 0), clearAfter);
  }

  private async submit(): Promise<void> {
    if (!this.me) return;
    const text = cleanText(this.input.value);
    const problem = validateText(text);
    if (problem) {
      if (problem !== 'empty') this.setHint('err', PROBLEM_LABEL[problem]);
      return;
    }
    const now = Date.now();
    const verdict = this.chat.guard.check(text, now);
    if (!verdict.ok) {
      this.setHint('err', PROBLEM_LABEL[verdict.reason]);
      if (verdict.waitMs > 0) this.showCooldown(verdict.waitMs);
      this.sfx.play('locked');
      return;
    }
    this.chat.guard.record(text, now);
    const re: Quote | undefined = this.replyTo
      ? { id: this.replyTo.id, name: this.replyTo.name, text: snippet(this.replyTo.text) }
      : undefined;
    const draft = this.input.value;
    this.input.value = '';
    this.cancelReply();
    this.onInput();
    this.chat.stopTyping();
    this.send.classList.remove('fly');
    void this.send.offsetWidth;
    this.send.classList.add('fly');
    this.sfx.play('click');
    navigator.vibrate?.(6);
    this.showCooldown(this.chat.guard.waitMs(Date.now()));
    try {
      await this.chat.backend!.send(this.room, this.chat.name, text, re);
    } catch (err) {
      console.warn('Mensagem não enviada.', err);
      if (!this.input.value) this.input.value = draft;
      this.onInput();
      this.setHint('err', 'Mensagem não enviada. Tente de novo.');
    }
  }

  /** A golden ring around the send button counts down until the next message may go. */
  private showCooldown(ms: number): void {
    cancelAnimationFrame(this.cooldownRaf);
    const circle = this.send.querySelector<SVGCircleElement>('.ring circle');
    if (!circle || ms <= 0) return;
    const end = Date.now() + ms;
    const step = () => {
      const left = Math.max(0, end - Date.now());
      circle.style.strokeDashoffset = String(157 - 157 * (left / ms));
      if (left > 0) this.cooldownRaf = requestAnimationFrame(step);
      else circle.style.strokeDashoffset = '157';
    };
    step();
  }

  private buildEmoji(): void {
    const tabs = h('div', 'fxc-etabs');
    const grid = h('div', 'fxc-egrid');
    const show = (i: number) => {
      this.emojiTab = i;
      tabs.querySelectorAll('button').forEach((b, j) => b.classList.toggle('is-on', j === i));
      const items = i === 0 ? this.chat.recentEmojis() : EMOJI_GROUPS[i]!.items;
      grid.replaceChildren();
      if (!items.length) grid.append(h('div', 'empty', 'Seus emojis recentes aparecem aqui'));
      for (const e of items) {
        const b = h('button', '', e);
        b.type = 'button';
        b.addEventListener('click', () => this.insertEmoji(e));
        grid.append(b);
      }
      grid.scrollTop = 0;
    };
    EMOJI_GROUPS.forEach((g, i) => {
      const b = h('button', '', g.icon);
      b.type = 'button';
      b.title = g.label;
      b.addEventListener('click', () => show(i));
      tabs.append(b);
    });
    this.emojiBox.append(tabs, grid);
    show(this.chat.recentEmojis().length ? 0 : 1);
  }

  private insertEmoji(e: string): void {
    const ta = this.input;
    const at = ta.selectionStart ?? ta.value.length;
    ta.value = ta.value.slice(0, at) + e + ta.value.slice(ta.selectionEnd ?? at);
    ta.selectionStart = ta.selectionEnd = at + e.length;
    this.chat.useEmoji(e);
    this.onInput();
  }

  private toggleEmoji(on = !this.emojiBox.classList.contains('is-on')): void {
    this.emojiBox.classList.toggle('is-on', on);
    this.emojiBtn.classList.toggle('is-on', on);
    if (on) {
      this.input.blur();
      if (this.emojiTab === 0) {
        // Refresh the recents tab.
        (this.emojiBox.querySelector('.fxc-etabs button') as HTMLButtonElement | null)?.click();
      }
      setTimeout(() => this.isNearBottom(400) && this.scrollToBottom(true), 340);
    }
  }

  // ── Presence ────────────────────────────────────────────────────────────────

  private renderPresence(): void {
    if (!this.me) return;
    const now = Date.now();
    const online = onlinePlayers(this.presence, now, this.me);
    const playing = online.filter((p) => p.g).length;
    this.setSub(
      `${online.length} online${playing ? ` · ${playing} jogando` : ''} · ${roomLabel(this.room).name}`,
      true,
    );
    const sig = online.map((p) => `${p.uid}:${p.g}:${p.name}`).join('|');
    if (this.onlineBar.dataset.sig !== sig) {
      this.onlineBar.dataset.sig = sig;
      this.onlineBar.replaceChildren(
        ...online.slice(0, 24).map((p) => {
          const chip = h('div', 'fxc-person');
          const who = h('div', 'who');
          const g = p.g ? gameOf(p.g) : undefined;
          who.append(
            h('span', 'n', p.uid === this.me ? `${p.name} (você)` : p.name),
            h('span', 'g', g ? `${g.emoji} ${g.title}` : 'no menu'),
          );
          chip.append(avatar(p.name, true, true), who);
          if (g && p.uid !== this.me && this.opts.onPlay) {
            const play = h('button', 'play', 'Jogar');
            play.type = 'button';
            play.title = `Jogar ${g.title} também`;
            play.addEventListener('click', () => {
              const go = this.opts.onPlay!;
              this.close();
              go(g.id);
            });
            chip.append(play);
          }
          if (p.uid !== this.me)
            chip.addEventListener('click', (e) => {
              if ((e.target as HTMLElement).closest('.play')) return;
              this.mention(p.name);
            });
          return chip;
        }),
      );
    }
    const label = typingLabel(typingNames(this.presence, this.room, now, this.me));
    this.typingRow.classList.toggle('is-on', !!label);
    if (label) (this.typingRow.lastElementChild as HTMLElement).textContent = label;
  }

  // ── Scrolling ───────────────────────────────────────────────────────────────

  private isNearBottom(px = NEAR_BOTTOM_PX): boolean {
    const l = this.list;
    return l.scrollHeight - l.scrollTop - l.clientHeight < px;
  }

  private scrollToBottom(smooth: boolean): void {
    const l = this.list;
    l.scrollTo({ top: l.scrollHeight, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
    this.unseenBelow = 0;
    this.updateJump();
    this.markSeen();
  }

  private onScroll(): void {
    if (this.isNearBottom(60)) {
      this.unseenBelow = 0;
      this.markSeen();
    }
    this.updateJump();
  }

  private updateJump(): void {
    const show = !this.isNearBottom(240) && this.msgs.length > 0;
    this.jump.classList.toggle('is-on', show);
    this.jump.innerHTML = ICON.down;
    this.jump.append(
      document.createTextNode(
        this.unseenBelow
          ? `${this.unseenBelow} nova${this.unseenBelow > 1 ? 's' : ''}`
          : 'Recentes',
      ),
    );
  }

  private markSeen(): void {
    const last = this.msgs[this.msgs.length - 1];
    if (last && this.isNearBottom(200)) this.chat.markSeen(this.room, last.at);
  }

  private async loadOlder(): Promise<void> {
    if (!this.me || this.loadingOlder || !this.hasOlder || this.firstBatch || !this.msgs.length)
      return;
    this.loadingOlder = true;
    this.top.replaceChildren(h('div', 'fxc-spin'));
    const room = this.room;
    const page = await this.chat.backend!.loadOlder(room, this.msgs[0]!.at).catch(() => []);
    this.loadingOlder = false;
    if (room !== this.room || this.closed) return;
    this.top.replaceChildren();
    if (page.length < PAGE) this.hasOlder = false;
    this.older = mergeMessages(this.older, page);
    for (const m of page) this.known.add(m.id);
    this.refresh();
  }

  // ── Feedback ────────────────────────────────────────────────────────────────

  private toast(text: string, action?: string, onAction?: () => void): void {
    const t = this.toastEl;
    t.replaceChildren(h('span', '', text));
    if (action && onAction) {
      const b = h('button', '', action);
      b.type = 'button';
      b.addEventListener('click', () => {
        t.classList.remove('is-on');
        onAction();
      });
      t.append(b);
    }
    t.classList.add('is-on');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('is-on'), 3200);
  }

  private showBanner(text: string): void {
    this.banner.textContent = text;
    this.banner.classList.add('is-on');
  }

  // ── Closing ─────────────────────────────────────────────────────────────────

  close(): void {
    if (this.closed) return;
    this.closed = true;
    current = null;
    this.chat.openRoom = null;
    this.chat.stopTyping();
    this.stopRoom?.();
    this.stopPresence?.();
    if (this.tick) clearInterval(this.tick);
    cancelAnimationFrame(this.cooldownRaf);
    for (const c of this.cleanups) c();
    this.input.blur();
    this.root.classList.remove('is-open');
    setTimeout(() => this.root.remove(), reducedMotion() ? 0 : 460);
    this.opts.onClose?.();
  }
}
