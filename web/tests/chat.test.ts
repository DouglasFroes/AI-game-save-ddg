import { describe, expect, it } from 'vitest';
import { NO_ACCOUNT, type AccountService } from '@/platform/account';
import type { ChatBackend } from '@/platform/chat/backend';
import { parseApiMessage } from '@/platform/api/chat';
import {
  BURST,
  cleanText,
  isJumboEmoji,
  layoutRows,
  MAX_TEXT,
  maskProfanity,
  mentions,
  mergeMessages,
  MIN_GAP_MS,
  onlinePlayers,
  reactionSummary,
  snippet,
  SpamGuard,
  splitMentions,
  toggleReaction,
  typingLabel,
  typingNames,
  validateText,
  type ChatMessage,
} from '@/platform/chat/core';
import { ChatService } from '@/platform/chat/service';
import { ProfileRepository } from '@/platform/profile';
import { MemoryStore } from '@/platform/storage';

const msg = (id: string, uid: string, at: number, text = 'oi'): ChatMessage => ({
  id,
  uid,
  name: uid.toUpperCase(),
  text,
  at,
});

describe('chat · texto', () => {
  it('cleans and validates messages', () => {
    expect(cleanText('  oi \u0007 tudo   bem?  ')).toBe('oi tudo bem?');
    expect(cleanText('kkkkkkkkkkkkkkkk')).toBe('kkkkkk');
    expect(cleanText('a\n\n\n\nb')).toBe('a\n\nb');
    expect(cleanText('👨‍👩‍👧 ❤️')).toBe('👨‍👩‍👧 ❤️');
    expect(validateText('')).toBe('empty');
    expect(validateText('x'.repeat(MAX_TEXT + 1))).toBe('long');
    expect(validateText('veja https://site.com')).toBe('link');
    expect(validateText('acesse www.site.com')).toBe('link');
    expect(validateText('bom jogo!')).toBeNull();
  });

  it('masks offensive words but not words that contain them', () => {
    expect(maskProfanity('que porra é essa')).toBe('que p•••• é essa');
    expect(maskProfanity('computador')).toBe('computador');
    expect(maskProfanity('PUTA jogada')).toBe('P••• jogada');
  });

  it('mentions, snippets and emoji-only messages', () => {
    expect(mentions('boa @douglas!', 'Douglas')).toBe(true);
    expect(mentions('boa @Douglasinho', 'Douglas')).toBe(false);
    expect(mentions('vem @João', 'joao')).toBe(true);
    expect(splitMentions('oi @Ana e @Bia')).toEqual([
      { text: 'oi ', mention: false },
      { text: '@Ana', mention: true },
      { text: ' e ', mention: false },
      { text: '@Bia', mention: true },
    ]);
    expect(snippet('a'.repeat(100), 10)).toBe(`${'a'.repeat(9)}…`);
    expect(isJumboEmoji('🔥🔥')).toBe(true);
    expect(isJumboEmoji('🔥 boa')).toBe(false);
    expect(isJumboEmoji('🔥🔥🔥🔥')).toBe(false);
  });
});

describe('chat · anti-spam', () => {
  it('limits the pace, repeats and bursts', () => {
    const g = new SpamGuard();
    let t = 0;
    expect(g.check('oi', t).ok).toBe(true);
    g.record('oi', t);
    expect(g.check('outra', t + 500)).toMatchObject({ ok: false, reason: 'slow' });
    expect(g.check('OI', t + MIN_GAP_MS + 1)).toMatchObject({ ok: false, reason: 'repeat' });
    t += MIN_GAP_MS + 1;
    for (let i = 1; i < BURST; i++) {
      expect(g.check(`m${i}`, t).ok).toBe(true);
      g.record(`m${i}`, t);
      t += MIN_GAP_MS + 1;
    }
    const v = g.check('mais uma', t);
    expect(v).toMatchObject({ ok: false, reason: 'cooldown' });
    expect(g.waitMs(t)).toBeGreaterThan(10_000);
  });
});

describe('chat · layout e reações', () => {
  it('groups messages by author and day', () => {
    const day = new Date('2026-10-27T12:00:00').getTime();
    const rows = layoutRows(
      [
        msg('1', 'ana', day - 86_400_000),
        msg('2', 'ana', day),
        msg('3', 'ana', day + 60_000),
        msg('4', 'me', day + 120_000),
        msg('5', 'ana', day + 20 * 60_000),
      ],
      'me',
      day + 30 * 60_000,
    );
    expect(
      rows.map((r) =>
        r.kind === 'day' ? r.label : `${r.key}${r.first ? 'F' : ''}${r.last ? 'L' : ''}`,
      ),
    ).toEqual(['Ontem', '1FL', 'Hoje', '2F', '3L', '4FL', '5FL']);
    expect(rows.find((r) => r.kind === 'msg' && r.key === '4')).toMatchObject({ mine: true });
  });

  it('merges pages without duplicates, oldest first', () => {
    const merged = mergeMessages(
      [msg('b', 'x', 2), msg('a', 'x', 1)],
      [msg('b', 'x', 2, 'novo'), msg('c', 'x', 3)],
    );
    expect(merged.map((m) => `${m.id}${m.text}`)).toEqual(['aoi', 'bnovo', 'coi']);
  });

  it('toggles and counts reactions', () => {
    let r = toggleReaction(undefined, 'me', '🔥');
    r = toggleReaction(r, 'ana', '🔥');
    r = toggleReaction(r, 'bia', '❤️');
    expect(reactionSummary(r, 'me')).toEqual([
      { emoji: '❤️', count: 1, mine: false },
      { emoji: '🔥', count: 2, mine: true },
    ]);
    expect(toggleReaction(r, 'me', '🔥').me).toBeUndefined();
    expect(toggleReaction(r, 'me', '😂').me).toBe('😂');
  });

  it('presence: online players and who is typing', () => {
    const now = 1_000_000;
    const list = [
      { uid: 'a', name: 'Ana', at: now - 5000, g: 'snake', typing: 'geral' },
      { uid: 'b', name: 'Bia', at: now - 400_000, g: '', typing: '' },
      { uid: 'me', name: 'Eu', at: now - 1000, g: '', typing: 'geral' },
    ];
    expect(onlinePlayers(list, now, 'me').map((p) => p.uid)).toEqual(['me', 'a']);
    expect(typingNames(list, 'geral', now, 'me')).toEqual(['Ana']);
    expect(typingLabel(['Ana', 'Bia'])).toBe('Ana e Bia estão digitando');
    expect(typingLabel(['A', 'B', 'C'])).toBe('3 pessoas estão digitando');
  });

  it('parses API messages defensively', () => {
    expect(parseApiMessage({ id: 'x', uid: 1 })).toBeNull();
    expect(parseApiMessage(null)).toBeNull();
    const m = parseApiMessage({
      id: 'x',
      uid: 'u',
      name: 'N',
      text: 't',
      at: 5,
      r: { a: '🔥', b: 3 },
      re: { id: 'q', name: 'Q', text: 'oi' },
    });
    expect(m).toMatchObject({ id: 'x', at: 5, r: { a: '🔥' }, re: { id: 'q' }, del: false });
  });
});

describe('chat · serviço', () => {
  function setup(signedIn: boolean) {
    const listeners: Array<(m: ChatMessage[]) => void> = [];
    const beats: string[] = [];
    const backend: ChatBackend = {
      uid: async () => (signedIn ? 'me' : null),
      watchRoom: () => () => undefined,
      loadOlder: async () => [],
      send: async () => undefined,
      react: async () => undefined,
      remove: async () => undefined,
      report: async () => undefined,
      watchPresence: () => () => undefined,
      heartbeat: async (name, g, typing) => void beats.push(`${name}|${g}|${typing}`),
      watchSince: (_room, _since, cb) => {
        listeners.push(cb);
        return () => undefined;
      },
    };
    const account: AccountService = {
      ...NO_ACCOUNT,
      available: true,
      onChange: () => () => undefined,
    };
    const store = new MemoryStore();
    const profile = new ProfileRepository(store);
    profile.update({ name: 'Douglas' });
    const chat = new ChatService(backend, account, profile, store, { activeGameId: 'snake' });
    return { chat, listeners, beats };
  }

  it('signed out: no heartbeat, no unread watch', async () => {
    const { chat, listeners, beats } = setup(false);
    chat.start();
    await new Promise((r) => setTimeout(r, 0));
    expect(chat.myUid).toBeNull();
    expect(listeners).toHaveLength(0);
    expect(beats).toHaveLength(0);
  });

  it('counts unread messages and announces mentions', async () => {
    const { chat, listeners, beats } = setup(true);
    const seen: number[] = [];
    const mentioned: string[] = [];
    chat.onUnread((n) => seen.push(n));
    chat.onMention((e) => mentioned.push(e.msg.id));
    chat.start();
    await new Promise((r) => setTimeout(r, 0));
    expect(beats[0]).toBe('Douglas|snake|');
    const now = Date.now();
    listeners[0]!([msg('1', 'ana', now, 'oi @Douglas'), msg('2', 'bia', now), msg('3', 'me', now)]);
    expect(chat.unread).toBe(2);
    expect(mentioned).toEqual(['1']);
    chat.mute('bia', 'Bia', true);
    listeners[0]!([msg('1', 'ana', now, 'oi @Douglas'), msg('2', 'bia', now)]);
    expect(chat.unread).toBe(1);
    expect(mentioned).toEqual(['1']); // announced once
    chat.markSeen('geral', now);
    expect(chat.unread).toBe(0);
    expect(seen.at(-1)).toBe(0);
  });

  it('typing pings are throttled', async () => {
    const { chat, beats } = setup(true);
    chat.start();
    await new Promise((r) => setTimeout(r, 0));
    chat.typing('geral');
    chat.typing('geral');
    chat.typing('geral');
    await new Promise((r) => setTimeout(r, 0));
    expect(beats.filter((b) => b.endsWith('|geral'))).toHaveLength(1);
  });
});
