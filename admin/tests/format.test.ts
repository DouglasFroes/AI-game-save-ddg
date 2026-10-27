import { describe, expect, it } from 'vitest';
import { ago, csvCell, duration, esc } from '../src/format';
import { sessionsToCsv } from '../src/views';

describe('format', () => {
  it('escapes HTML so API text can never become markup', () => {
    expect(esc('<img src=x onerror="a">&\'')).toBe('&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;');
    expect(esc(null)).toBe('');
  });

  it('formats durations', () => {
    expect([45, 120, 135, 3600, 7500].map(duration)).toEqual(['45s', '2m', '2m 15s', '1h', '2h 5m']);
  });

  it('says how long ago', () => {
    const now = Date.parse('2026-10-27T12:00:00Z');
    expect(ago('2026-10-27T11:59:50Z', now)).toBe('agora');
    expect(ago('2026-10-27T11:30:00Z', now)).toBe('há 30 min');
    expect(ago('2026-10-27T09:00:00Z', now)).toBe('há 3 h');
    expect(ago('2026-10-25T12:00:00Z', now)).toBe('há 2 d');
  });

  it('quotes CSV cells that need it', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(5)).toBe('5');
  });

  it('exports sessions as CSV', () => {
    const csv = sessionsToCsv([
      { id: 's1', playerId: 'p', playerName: 'Ana, Jr', gameId: 'stack', durationSec: 9, score: 1, startedAt: 'a', endedAt: 'b' },
    ]);
    expect(csv.split('\n')[1]).toBe('s1,p,"Ana, Jr",stack,9,1,a,b');
  });
});
