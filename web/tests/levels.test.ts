import { describe, expect, it } from 'vitest';
import { GAME_HEIGHT, GAME_WIDTH } from '@/config';
import { HUD_HEIGHT } from '@/games/doguinho/config';
import { getLevel, LEVEL_ORDER, LEVELS, nextLevelId } from '@/games/doguinho/data/levels';

describe('level data', () => {
  it('has 20 levels with unique, sequential ids', () => {
    expect(LEVELS).toHaveLength(20);
    expect(LEVEL_ORDER).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it.each(LEVELS.map((l) => [l.id, l] as const))('level %i is well-formed', (_id, level) => {
    expect(level.ink).toBeGreaterThan(0);
    expect(level.survive).toBeGreaterThan(0);
    expect(level.stars.three).toBeLessThan(level.stars.two);
    expect(level.hives.length).toBeGreaterThan(0);
    for (const h of level.hives) {
      expect(h.bees).toBeGreaterThan(0);
      expect(h.y).toBeGreaterThan(HUD_HEIGHT);
    }
    expect(level.dog.x).toBeGreaterThan(0);
    expect(level.dog.x).toBeLessThan(GAME_WIDTH);
    expect(level.dog.y).toBeGreaterThan(HUD_HEIGHT);
    expect(level.dog.y).toBeLessThan(GAME_HEIGHT);
  });

  it('navigates between levels', () => {
    expect(getLevel(3)?.id).toBe(3);
    expect(nextLevelId(1)).toBe(2);
    expect(nextLevelId(20)).toBeUndefined();
  });
});
