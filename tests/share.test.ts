import { describe, expect, it } from 'vitest';
import { gameIdFromSearch, gameLink } from '@/platform/shareLink';

describe('share links', () => {
  it('builds a link that keeps the site path', () => {
    expect(gameLink('zigue', { origin: 'https://x.dev', pathname: '/fliperama/' })).toBe(
      'https://x.dev/fliperama/?jogo=zigue',
    );
  });

  it('reads a known game id back from the query string', () => {
    const known = (id: string) => id === 'zigue';
    expect(gameIdFromSearch('?jogo=zigue', known)).toBe('zigue');
    expect(gameIdFromSearch('?foo=1&jogo=zigue', known)).toBe('zigue');
  });

  it('ignores missing or unknown ids', () => {
    const known = (id: string) => id === 'zigue';
    expect(gameIdFromSearch('', known)).toBeNull();
    expect(gameIdFromSearch('?jogo=naoexiste', known)).toBeNull();
    expect(gameIdFromSearch('?jogo=', known)).toBeNull();
  });
});
