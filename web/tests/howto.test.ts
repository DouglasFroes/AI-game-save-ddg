import { describe, expect, it } from 'vitest';
import { GAMES } from '@/games/registry';
import { HOW_TO } from '@/platform/howTo';

describe('como jogar', () => {
  it('every game has a goal and at least one step', () => {
    for (const g of GAMES) {
      const card = HOW_TO[g.id];
      expect(card, g.id).toBeDefined();
      expect(card!.goal.length, g.id).toBeGreaterThan(5);
      expect(card!.steps.length, g.id).toBeGreaterThan(0);
    }
  });
});
