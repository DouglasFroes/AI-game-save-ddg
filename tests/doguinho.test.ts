import { describe, expect, it } from 'vitest';
import { polylineLength, sampleSegment } from '@/games/doguinho/core/geometry';
import { InkStroke } from '@/games/doguinho/core/inkStroke';
import {
  createProgress,
  isUnlocked,
  parseProgress,
  ProgressRepository,
  recordDeath,
  recordWin,
  summarize,
} from '@/games/doguinho/core/progress';
import { computeScore, starsForInk } from '@/games/doguinho/core/scoring';
import { MemoryStore } from '@/platform/storage';

describe('geometry', () => {
  it('measures polylines', () => {
    expect(
      polylineLength([
        { x: 0, y: 0 },
        { x: 3, y: 4 },
        { x: 3, y: 10 },
      ]),
    ).toBe(11);
  });

  it('samples both ends of a segment', () => {
    const s = sampleSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, 4);
    expect(s[0]).toEqual({ x: 0, y: 0 });
    expect(s[s.length - 1]).toEqual({ x: 10, y: 0 });
  });
});

describe('InkStroke', () => {
  it('ignores points closer than the minimum spacing', () => {
    const s = new InkStroke(100, 10);
    s.start({ x: 0, y: 0 });
    expect(s.extend({ x: 5, y: 0 })).toBe('too-close');
    expect(s.extend({ x: 20, y: 0 })).toBe('added');
    expect(s.used).toBe(20);
  });

  it('clamps the last segment to the remaining ink', () => {
    const s = new InkStroke(50, 10);
    s.start({ x: 0, y: 0 });
    expect(s.extend({ x: 80, y: 0 })).toBe('exhausted');
    expect(s.points[1]).toEqual({ x: 50, y: 0 });
    expect(s.ratio).toBe(1);
  });

  it('respects the guard', () => {
    const s = new InkStroke(100, 10);
    const wallAt15 = (a: { x: number }, b: { x: number }) => a.x < 15 && b.x >= 15;
    s.start({ x: 0, y: 0 }, wallAt15);
    expect(s.extend({ x: 30, y: 0 }, wallAt15)).toBe('blocked');
    expect(s.isDrawable).toBe(false);
  });
});

describe('scoring', () => {
  it('gives stars by ink usage', () => {
    const t = { three: 0.4, two: 0.7 };
    expect(starsForInk(0.4, t)).toBe(3);
    expect(starsForInk(0.5, t)).toBe(2);
    expect(starsForInk(0.9, t)).toBe(1);
  });

  it('ranks stars over deaths over ink', () => {
    const a = computeScore({ stars: 10, deaths: 50, inkSaved: 0 });
    const b = computeScore({ stars: 9, deaths: 0, inkSaved: 99 });
    const c = computeScore({ stars: 10, deaths: 49, inkSaved: 0 });
    expect(a).toBeGreaterThan(b);
    expect(c).toBeGreaterThan(a);
  });
});

describe('progress', () => {
  it('keeps the best result per level', () => {
    let p = createProgress('me');
    p = recordWin(p, 1, 2, 0.5);
    p = recordWin(p, 1, 1, 0.3);
    expect(p.results[1]).toEqual({ stars: 2, inkRatio: 0.3 });
  });

  it('unlocks levels in order', () => {
    const order = [1, 2, 3];
    const p = recordWin(createProgress('me'), 1, 3, 0.2);
    expect(isUnlocked(p, 2, order)).toBe(true);
    expect(isUnlocked(p, 3, order)).toBe(false);
    expect(isUnlocked(p, 99, order)).toBe(false);
  });

  it('summarizes for the ranking', () => {
    let p = recordWin(createProgress('me'), 1, 3, 0.2);
    p = recordWin(p, 2, 2, 0.6);
    p = recordDeath(p);
    expect(summarize(p)).toMatchObject({ stars: 5, deaths: 1, inkSaved: 60, completed: 2 });
  });

  it('rejects corrupted saves and sanitizes fields', () => {
    expect(parseProgress(null)).toBeNull();
    const p = parseProgress({
      version: 2,
      playerId: 'x',
      deaths: -3,
      results: { 1: { stars: 9, inkRatio: 0.5 }, 2: { stars: 2, inkRatio: 7 } },
    });
    expect(p?.deaths).toBe(0);
    expect(p?.results).toEqual({ 2: { stars: 2, inkRatio: 1 } });
  });

  it('persists through the repository', () => {
    const store = new MemoryStore();
    new ProgressRepository(store).update((p) => recordWin(p, 1, 3, 0.1));
    expect(new ProgressRepository(store).get().results[1]?.stars).toBe(3);
  });
});
