/**
 * Pure rules of the arcade chat: message validation and clean-up, the client-side spam guard,
 * grouping messages into bubbles, mentions, reactions and the emoji catalogue. No DOM, no
 * Firebase: everything here is unit-tested. The server enforces the same limits in firestore.rules.
 */

export const MAX_TEXT = 280;
/** A reply quotes the start of the original. */
export const MAX_QUOTE = 80;
/** Server rule: at most one message every 2 s per player. */
export const MIN_GAP_MS = 2000;
/** Client burst limit: this many messages per window, then a short cooldown. */
export const BURST = 5;
export const BURST_WINDOW_MS = 20_000;
export const BURST_COOLDOWN_MS = 15_000;
/** A player counts as online while their last heartbeat is this recent. */
export const ONLINE_MS = 150_000;
/** "Typing…" lasts this long after the last keystroke ping. */
export const TYPING_MS = 6000;
export const PAGE = 50;

/** Reactions anyone can add to a message (must match firestore.rules exactly). */
export const REACTIONS = ['❤️', '🔥', '😂', '👏', '😮', '🏆'] as const;
export type Reaction = (typeof REACTIONS)[number];

export const GENERAL_ROOM = 'geral';

export interface Quote {
  readonly id: string;
  readonly name: string;
  readonly text: string;
}

export interface ChatMessage {
  readonly id: string;
  readonly uid: string;
  readonly name: string;
  readonly text: string;
  /** Epoch ms (server time; estimated while the write is in flight). */
  readonly at: number;
  readonly re?: Quote;
  /** uid → reaction. */
  readonly r?: Readonly<Record<string, string>>;
  readonly del?: boolean;
  /** Written on this device and not yet confirmed by the server. */
  readonly pending?: boolean;
}

export interface Presence {
  readonly uid: string;
  readonly name: string;
  readonly at: number;
  /** Game being played ('' in the menus). */
  readonly g: string;
  /** Room the player is typing in ('' when not typing). */
  readonly typing: string;
}

// ── Text ────────────────────────────────────────────────────────────────────

const URL_RE = /(https?:\/\/|www\.)\S*/i;
/** Same pattern the server checks (RE2, full match). */
export const SERVER_URL_PATTERN = '(?s).*(https?://|www[.]).*';

/** Mild pt-BR word list; matches are masked, not rejected. */
const BAD_WORDS = [
  'porra',
  'caralho',
  'merda',
  'puta',
  'fdp',
  'buceta',
  'cuzao',
  'cuzão',
  'arrombado',
  'viado',
  'otario',
  'otário',
  'desgraçado',
  'desgracado',
  'vagabundo',
  'vagabunda',
  'piranha',
  'corno',
];
const BAD_RE = new RegExp(`(^|[^\\p{L}])(${BAD_WORDS.join('|')})(?=$|[^\\p{L}])`, 'giu');

/** Masks offensive words (first letter kept). */
export function maskProfanity(text: string): string {
  return text.replace(
    BAD_RE,
    (_m, pre: string, word: string) => `${pre}${word[0]}${'•'.repeat(word.length - 1)}`,
  );
}

/**
 * What would be sent for `raw`: control characters removed, whitespace collapsed, long runs of
 * the same character shortened ("kkkkkkkkkkk" → "kkkkkk") and offensive words masked.
 */
export function cleanText(raw: string): string {
  return maskProfanity(
    raw
      // Control/format characters go, except newlines and the joiners emojis are built with.
      .replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === '\n' || c === '\u200d' || c === '\ufe0f' ? c : ''))
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/(.)\1{6,}/gu, '$1$1$1$1$1$1')
      .trim(),
  );
}

export type TextProblem = 'empty' | 'long' | 'link';

export function validateText(text: string): TextProblem | null {
  if (!text) return 'empty';
  if ([...text].length > MAX_TEXT || text.length > MAX_TEXT) return 'long';
  if (URL_RE.test(text)) return 'link';
  return null;
}

export const PROBLEM_LABEL: Record<TextProblem | 'slow' | 'repeat' | 'cooldown', string> = {
  empty: 'Escreva uma mensagem',
  long: `Máximo de ${MAX_TEXT} caracteres`,
  link: 'Links não são permitidos no chat',
  slow: 'Calma! Espere um instante',
  repeat: 'Você acabou de enviar isso',
  cooldown: 'Muitas mensagens — aguarde um pouco',
};

/** The start of a message, for reply quotes and notifications. */
export function snippet(text: string, max = MAX_QUOTE): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const chars = [...flat];
  return chars.length <= max ? flat : `${chars.slice(0, max - 1).join('')}…`;
}

// ── Spam guard ──────────────────────────────────────────────────────────────

export type GuardVerdict =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: 'slow' | 'repeat' | 'cooldown';
      readonly waitMs: number;
    };

/** Client-side flood control (the server separately allows one message per 2 s). */
export class SpamGuard {
  private sent: Array<{ at: number; text: string }> = [];
  private coolUntil = 0;

  check(text: string, now: number): GuardVerdict {
    if (now < this.coolUntil)
      return { ok: false, reason: 'cooldown', waitMs: this.coolUntil - now };
    const last = this.sent[this.sent.length - 1];
    if (last && now - last.at < MIN_GAP_MS)
      return { ok: false, reason: 'slow', waitMs: MIN_GAP_MS - (now - last.at) };
    const norm = text.toLowerCase().replace(/\s+/g, ' ');
    if (last && last.text === norm && now - last.at < 60_000)
      return { ok: false, reason: 'repeat', waitMs: 0 };
    const recent = this.sent.filter((s) => now - s.at < BURST_WINDOW_MS);
    if (recent.length >= BURST) {
      this.coolUntil = now + BURST_COOLDOWN_MS;
      return { ok: false, reason: 'cooldown', waitMs: BURST_COOLDOWN_MS };
    }
    return { ok: true };
  }

  record(text: string, now: number): void {
    this.sent.push({ at: now, text: text.toLowerCase().replace(/\s+/g, ' ') });
    this.sent = this.sent.filter((s) => now - s.at < 60_000);
  }

  /** Milliseconds until the next message may go (0 = now). */
  waitMs(now: number): number {
    const last = this.sent[this.sent.length - 1];
    return Math.max(0, this.coolUntil - now, last ? MIN_GAP_MS - (now - last.at) : 0);
  }
}

// ── Mentions ────────────────────────────────────────────────────────────────

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** True when `text` contains "@name" (accents and case ignored, whole name). */
export function mentions(text: string, name: string): boolean {
  if (!name.trim()) return false;
  const t = fold(text);
  const n = `@${fold(name.trim())}`;
  let at = t.indexOf(n);
  while (at >= 0) {
    const next = t[at + n.length];
    if (next === undefined || !/[\p{L}\p{N}_]/u.test(next)) return true;
    at = t.indexOf(n, at + 1);
  }
  return false;
}

/** Splits text into plain and "@mention" parts, for highlighting. */
export function splitMentions(text: string): Array<{ text: string; mention: boolean }> {
  const out: Array<{ text: string; mention: boolean }> = [];
  const re = /@[\p{L}\p{N}_]+/gu;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index), mention: false });
    out.push({ text: m[0], mention: true });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), mention: false });
  return out;
}

/** A message made only of 1–3 emojis is shown big, without a bubble. */
export function isJumboEmoji(text: string): boolean {
  const t = text.replace(/\s/g, '');
  if (!t) return false;
  // Joiners and variation selectors glue emojis together; everything else must be an emoji.
  const bare = t.replace(/\u200d|\ufe0f/g, '');
  if (!/^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|[\u{1F1E6}-\u{1F1FF}])+$/u.test(bare))
    return false;
  const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl;
  const count = seg
    ? [...new Intl.Segmenter('pt', { granularity: 'grapheme' }).segment(t)].length
    : [...t.matchAll(/\p{Extended_Pictographic}/gu)].length;
  return count >= 1 && count <= 3;
}

// ── Reactions ───────────────────────────────────────────────────────────────

export interface ReactionCount {
  readonly emoji: string;
  readonly count: number;
  readonly mine: boolean;
}

export function reactionSummary(
  r: Readonly<Record<string, string>> | undefined,
  me: string,
): ReactionCount[] {
  if (!r) return [];
  const counts = new Map<string, number>();
  for (const e of Object.values(r)) counts.set(e, (counts.get(e) ?? 0) + 1);
  return REACTIONS.filter((e) => counts.has(e)).map((emoji) => ({
    emoji,
    count: counts.get(emoji)!,
    mine: r[me] === emoji,
  }));
}

/** The reaction map after `me` taps `emoji` (tapping your own reaction again removes it). */
export function toggleReaction(
  r: Readonly<Record<string, string>> | undefined,
  me: string,
  emoji: Reaction,
): Record<string, string> {
  const next = { ...(r ?? {}) };
  if (next[me] === emoji) delete next[me];
  else next[me] = emoji;
  return next;
}

// ── Layout ──────────────────────────────────────────────────────────────────

/** Messages from the same author within this gap share one block (avatar and name once). */
export const GROUP_GAP_MS = 5 * 60_000;

export type ChatRow =
  | { readonly kind: 'day'; readonly key: string; readonly label: string }
  | {
      readonly kind: 'msg';
      readonly key: string;
      readonly msg: ChatMessage;
      /** First of its block: shows the name. */
      readonly first: boolean;
      /** Last of its block: shows the avatar and the time. */
      readonly last: boolean;
      readonly mine: boolean;
    };

const DAY_MS = 86_400_000;

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function dayLabel(ms: number, now: number): string {
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const t = startToday.getTime();
  if (ms >= t) return 'Hoje';
  if (ms >= t - DAY_MS) return 'Ontem';
  return new Date(ms).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
}

export function timeLabel(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Oldest-first messages → rows with day separators and author blocks. */
export function layoutRows(msgs: readonly ChatMessage[], me: string, now: number): ChatRow[] {
  const rows: ChatRow[] = [];
  let lastDay = '';
  msgs.forEach((m, i) => {
    const dk = dayKey(m.at);
    if (dk !== lastDay) {
      rows.push({ kind: 'day', key: `day-${dk}`, label: dayLabel(m.at, now) });
      lastDay = dk;
    }
    const prev = msgs[i - 1];
    const next = msgs[i + 1];
    const joins = (a: ChatMessage | undefined, b: ChatMessage | undefined) =>
      !!a &&
      !!b &&
      a.uid === b.uid &&
      Math.abs(b.at - a.at) < GROUP_GAP_MS &&
      dayKey(a.at) === dayKey(b.at);
    rows.push({
      kind: 'msg',
      key: m.id,
      msg: m,
      first: !joins(prev, m),
      last: !joins(m, next),
      mine: m.uid === me,
    });
  });
  return rows;
}

/** Merges a page of messages into the list: unique by id, oldest first. */
export function mergeMessages(
  current: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
): ChatMessage[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

// ── Presence ────────────────────────────────────────────────────────────────

export function onlinePlayers(list: readonly Presence[], now: number, me: string): Presence[] {
  return list
    .filter((p) => now - p.at < ONLINE_MS)
    .sort((a, b) => Number(b.uid === me) - Number(a.uid === me) || b.at - a.at);
}

export function typingNames(
  list: readonly Presence[],
  room: string,
  now: number,
  me: string,
): string[] {
  return list
    .filter((p) => p.uid !== me && p.typing === room && now - p.at < TYPING_MS)
    .map((p) => p.name);
}

export function typingLabel(names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} está digitando`;
  if (names.length === 2) return `${names[0]} e ${names[1]} estão digitando`;
  return `${names.length} pessoas estão digitando`;
}

export function roomOf(gameId: string | null): string {
  return gameId ?? GENERAL_ROOM;
}

// ── Emoji catalogue ─────────────────────────────────────────────────────────

export const EMOJI_GROUPS: ReadonlyArray<{
  readonly label: string;
  readonly icon: string;
  readonly items: readonly string[];
}> = [
  {
    label: 'Recentes',
    icon: '🕘',
    items: [],
  },
  {
    label: 'Carinhas',
    icon: '😀',
    items: [
      '😀',
      '😁',
      '😂',
      '🤣',
      '😅',
      '😊',
      '😇',
      '🙂',
      '😉',
      '😍',
      '🥰',
      '😘',
      '😎',
      '🤩',
      '🥳',
      '😏',
      '🤔',
      '🤨',
      '😐',
      '🙄',
      '😬',
      '😴',
      '🤤',
      '😮',
      '😱',
      '😭',
      '😤',
      '😡',
      '🤯',
      '🥶',
      '🥵',
      '😈',
      '🤡',
      '👻',
      '💀',
      '🤖',
      '👽',
      '🙈',
      '🙉',
      '🙊',
    ],
  },
  {
    label: 'Gestos',
    icon: '👍',
    items: [
      '👍',
      '👎',
      '👏',
      '🙌',
      '🤝',
      '🙏',
      '💪',
      '✌️',
      '🤞',
      '🤟',
      '🤘',
      '👌',
      '🫡',
      '👋',
      '🫶',
      '👊',
      '✊',
      '🤙',
      '👀',
      '🧠',
    ],
  },
  {
    label: 'Jogos',
    icon: '🎮',
    items: [
      '🎮',
      '🕹️',
      '👾',
      '🏆',
      '🥇',
      '🥈',
      '🥉',
      '🏅',
      '🎯',
      '🎲',
      '♟️',
      '🃏',
      '🧩',
      '⚽',
      '🏀',
      '🎾',
      '🏐',
      '🎳',
      '🥊',
      '⛳',
      '🏹',
      '🛹',
      '⛷️',
      '🚴',
      '🏎️',
      '🚀',
      '💣',
      '💥',
      '⚡',
      '🔥',
      '💎',
      '👑',
      '🪙',
      '❤️‍🔥',
      '🐶',
      '🐝',
      '🐍',
      '🦆',
    ],
  },
  {
    label: 'Símbolos',
    icon: '❤️',
    items: [
      '❤️',
      '🧡',
      '💛',
      '💚',
      '💙',
      '💜',
      '🖤',
      '🤍',
      '💔',
      '💯',
      '✨',
      '⭐',
      '🌟',
      '💫',
      '✅',
      '❌',
      '❗',
      '❓',
      '💬',
      '🎉',
      '🎊',
      '🍕',
      '🍔',
      '🍿',
      '☕',
      '🌈',
      '☀️',
      '🌙',
    ],
  },
];

/** Most recent first, unique, at most `max`. */
export function pushRecent(recent: readonly string[], emoji: string, max = 16): string[] {
  return [emoji, ...recent.filter((e) => e !== emoji)].slice(0, max);
}
