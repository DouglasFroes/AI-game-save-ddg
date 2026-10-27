import { describe, expect, it } from 'vitest';
import { Klondike, type Card } from '@/games/paciencia/core';
import { SIZE, TerritorySim } from '@/games/territorio/core';
import { buildDeck, cardPoints, HUMAN, UltimaRound, type UCard } from '@/games/ultima/core';

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('paciência', () => {
  it('deals 28 cards in 7 columns with the last one face up', () => {
    const k = new Klondike(seeded(1));
    expect(k.tableau.map((t) => t.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(k.tableau.every((t) => t.at(-1)!.up && t.slice(0, -1).every((c) => !c.up))).toBe(true);
    expect(k.stock).toHaveLength(24);
  });

  it('foundations go Ace up by suit; columns go down alternating colors', () => {
    const k = new Klondike(seeded(2));
    const ace: Card = { suit: 1, rank: 1, up: true };
    const two: Card = { suit: 1, rank: 2, up: true };
    expect(k.canFound(two, 0)).toBe(false);
    expect(k.canFound(ace, 0)).toBe(true);
    k.foundations[0]!.push(ace);
    expect(k.canFound(two, 0)).toBe(true);
    expect(k.canFound({ suit: 2, rank: 2, up: true }, 0)).toBe(false);
    k.tableau[0] = [{ suit: 0, rank: 9, up: true }];
    expect(k.canStack({ suit: 1, rank: 8, up: true }, 0)).toBe(true); // red on black
    expect(k.canStack({ suit: 3, rank: 8, up: true }, 0)).toBe(false); // black on black
    k.tableau[1] = [];
    expect(k.canStack({ suit: 3, rank: 13, up: true }, 1)).toBe(true); // King on empty
    expect(k.canStack({ suit: 3, rank: 12, up: true }, 1)).toBe(false);
  });

  it('tapping moves to the best place and flips the card left behind', () => {
    const k = new Klondike(seeded(3));
    k.tableau[0] = [
      { suit: 0, rank: 5, up: false },
      { suit: 2, rank: 1, up: true },
    ];
    const score = k.score;
    expect(k.auto({ kind: 'tableau', i: 0 }, 1)).toEqual({ kind: 'foundation', i: 0 });
    expect(k.tableau[0]![0]!.up).toBe(true);
    expect(k.score).toBe(score + 15);
    // A run moves together.
    k.tableau[1] = [
      { suit: 3, rank: 9, up: true },
      { suit: 1, rank: 8, up: true },
      { suit: 0, rank: 7, up: true },
    ];
    k.tableau[2] = [{ suit: 2, rank: 10, up: true }];
    expect(k.move({ kind: 'tableau', i: 1 }, 0, { kind: 'tableau', i: 2 })).toBe(true);
    expect(k.tableau[2]!.map((c) => c.rank)).toEqual([10, 9, 8, 7]);
  });

  it('the stock turns one card at a time and recycles the waste', () => {
    const k = new Klondike(seeded(4));
    for (let i = 0; i < 24; i++) expect(k.draw()).toBe('draw');
    expect(k.stock).toHaveLength(0);
    expect(k.draw()).toBe('recycle');
    expect(k.stock).toHaveLength(24);
    expect(k.stock.every((c) => !c.up)).toBe(true);
  });

  it('finishes by itself once every card is open, and wins', () => {
    const k = new Klondike(seeded(5));
    // Build a nearly solved table: everything open, in order on the columns.
    k.stock = [];
    k.waste = [];
    for (const f of k.foundations) f.length = 0;
    for (let t = 0; t < 7; t++) k.tableau[t] = [];
    for (let s = 0; s < 4; s++)
      for (let r = 13; r >= 1; r--)
        k.tableau[s]!.push({ suit: s as 0 | 1 | 2 | 3, rank: r, up: true });
    expect(k.solvable).toBe(true);
    let guard = 0;
    while (k.autoStep() && guard++ < 100);
    expect(k.won).toBe(true);
    expect(k.finalScore(60)).toBeGreaterThan(k.score);
  });
});

describe('última carta', () => {
  it('has the 108-card deck', () => {
    const d = buildDeck();
    expect(d).toHaveLength(108);
    expect(d.filter((c) => c.color === -1)).toHaveLength(8);
    expect(cardPoints({ id: 0, color: 0, value: 7 })).toBe(7);
    expect(cardPoints({ id: 0, color: -1, value: 'wild4' })).toBe(50);
  });

  const card = (
    color: UCard['color'],
    value: UCard['value'],
    id = 1000 + Math.random(),
  ): UCard => ({ id, color, value });

  it('matches by color or symbol; wilds always', () => {
    const r = new UltimaRound(seeded(1));
    r.discard.push(card(2, 5));
    r.color = 2;
    expect(r.canPlay(card(2, 9))).toBe(true);
    expect(r.canPlay(card(0, 5))).toBe(true);
    expect(r.canPlay(card(0, 'skip'))).toBe(false);
    expect(r.canPlay(card(-1, 'wild'))).toBe(true);
  });

  it('+2 makes the next player draw and lose the turn; reverse changes direction', () => {
    const r = new UltimaRound(seeded(2));
    r.discard.push(card(1, 3));
    r.color = 1;
    const plus = card(1, 'draw2');
    r.hands[HUMAN]!.push(plus);
    const before = r.hands[1]!.length;
    r.play(plus);
    expect(r.hands[1]!.length).toBe(before + 2);
    expect(r.turn).toBe(2);
    const rev = card(1, 'reverse');
    r.hands[2]!.push(rev);
    r.play(rev);
    expect(r.direction).toBe(-1);
    expect(r.turn).toBe(1);
  });

  it('a wild sets the chosen color; drawing a playable card lets you play or pass', () => {
    const r = new UltimaRound(seeded(3));
    const w = card(-1, 'wild');
    r.hands[HUMAN]!.push(w);
    r.play(w, 3);
    expect(r.color).toBe(3);
    // Force the human's turn and a playable card on top of the pile.
    r.turn = HUMAN;
    r.hands[HUMAN]!.length = 0;
    r.hands[HUMAN]!.push(card(0, 1));
    r.drawPile.push(card(3, 4));
    r.draw();
    expect(r.drawn).not.toBeNull();
    expect(r.playable(HUMAN)).toEqual([r.drawn]);
    expect(r.pass()).toBe(true);
    expect(r.turn).toBe(1);
  });

  it('emptying your hand wins the round with the points left in the others', () => {
    const r = new UltimaRound(seeded(4));
    r.discard.push(card(0, 2));
    r.color = 0;
    r.hands[HUMAN]!.length = 0;
    const last = card(0, 7);
    r.hands[HUMAN]!.push(last);
    const points = r.hands
      .slice(1)
      .flat()
      .reduce((s, c) => s + cardPoints(c), 0);
    const events = r.play(last);
    expect(events).toContainEqual({ type: 'round', winner: HUMAN, points });
    expect(r.over).toBe(true);
  });

  it('bots play whole rounds to the end by themselves', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = new UltimaRound(seeded(seed));
      let guard = 0;
      while (!r.over && guard++ < 2000) {
        if (r.turn === HUMAN) {
          const p = r.playable(HUMAN)[0];
          if (p) r.play(p, 0);
          else if (!r.draw().length || r.drawn) r.pass();
        } else r.botTurn();
      }
      expect(r.over).toBe(true);
      expect(r.hands.flat().length + r.drawPile.length + r.discard.length).toBe(108);
    }
  });
});

describe('território', () => {
  it('starts with a 5×5 home for everyone', () => {
    const s = new TerritorySim('Eu', seeded(1));
    expect(s.share(s.player)).toBeCloseTo(25 / (SIZE * SIZE));
  });

  it('a loop out of home claims the trail and the area inside', () => {
    const s = new TerritorySim('Eu', seeded(2));
    s.runners.forEach((r) => r.bot && ((r.alive = false), (r.respawn = 999)));
    const me = s.player;
    const before = s.share(me);
    // From the center (home is ±2): up 5, right 2, down 3 → back on the home edge.
    me.dir = me.wish = 0;
    const path = [0, 0, 0, 0, 0, 1, 1, 2, 2, 2] as const;
    let claimed = 0;
    for (const d of path) {
      s.turn(d);
      for (const e of s.step(1 / 8 + 1e-6)) if (e.type === 'claim') claimed = e.cells;
    }
    expect(claimed).toBe(9); // 7 trail cells + the 2 enclosed
    expect(s.share(me)).toBeGreaterThan(before);
    expect(me.trail).toHaveLength(0);
  });

  it('crossing your own trail or leaving the arena ends the run', () => {
    const s = new TerritorySim('Eu', seeded(3));
    s.runners.forEach((r) => r.bot && ((r.alive = false), (r.respawn = 999)));
    for (let i = 0; i < SIZE; i++) s.step(1 / 8 + 1e-6);
    expect(s.over).toBe(true);
  });

  it('touching a bot trail eliminates the bot and frees its land', () => {
    const s = new TerritorySim('Eu', seeded(4));
    const me = s.player;
    const bot = s.runners.find((r) => r.bot)!;
    s.runners.forEach((r) => r !== bot && r.bot && ((r.alive = false), (r.respawn = 999)));
    const i = TerritorySim.idx(me.x, me.y - 3);
    s.trail[i] = bot.id;
    bot.trail.push(i);
    bot.progress = -1e9; // the bot stands still (and can't take its trail home)
    me.dir = me.wish = 0;
    for (let k = 0; k < 3 && bot.alive; k++) s.step(1 / 8 + 1e-6);
    expect(bot.alive).toBe(false);
    expect(me.kills).toBe(1);
    expect(s.share(bot)).toBe(0);
  });

  it('bots roam and claim land on their own', () => {
    const s = new TerritorySim('Eu', seeded(5));
    s.player.alive = false; // spectator: keep the player out of it
    const start = s.runners.filter((r) => r.bot).reduce((t, r) => t + s.share(r), 0);
    for (let i = 0; i < 60 * 30; i++) s.step(1 / 60);
    const end = s.runners.filter((r) => r.bot).reduce((t, r) => t + s.share(r), 0);
    expect(end).toBeGreaterThan(start);
  });
});
