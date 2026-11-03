import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { BoardScene } from '@/platform/ui/boardGame';
import { burst, hint } from '@/platform/ui/juice';
import { getServices } from '@/services';
import { boardStatus, cpuMove, legal, newGame, play, statuses, winner, type State } from './core';

const CELL = 68;
const SMALL_GAP = 16;
const BIG = CELL * 3;
const TOTAL = BIG * 3 + SMALL_GAP * 2;
const X0 = (GAME_WIDTH - TOTAL) / 2;
const Y0 = 300;
const CYAN = 0x38bdf8;
const PINK = 0xf472b6;

/** Top-left of small board `b`. */
const boardOrigin = (b: number) => ({
  x: X0 + (b % 3) * (BIG + SMALL_GAP),
  y: Y0 + Math.floor(b / 3) * (BIG + SMALL_GAP),
});

const cellCenter = (i: number) => {
  const o = boardOrigin(Math.floor(i / 9));
  const c = i % 9;
  return { x: o.x + (c % 3) * CELL + CELL / 2, y: o.y + Math.floor(c / 3) * CELL + CELL / 2 };
};

/** "Velha Suprema": nine tic-tac-toe boards in one; where you play sends your rival to a board. */
export class SupremaScene extends BoardScene {
  private s: State = newGame();
  private g!: Phaser.GameObjects.Graphics;
  private last = -1;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Suprema, 'suprema', [0x3730a3, 0x1e1b4b]);
  }

  create(): void {
    this.g = this.add.graphics().setDepth(5);
    this.begin('#c7d2fe', '#1e1b4b');
    this.hintBox = hint(
      this,
      ['Onde você joga manda o robô', 'para o quadro correspondente'],
      1130,
      5200,
    );
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => this.tap(p));
  }

  protected startMatch(): void {
    this.s = newGame();
    this.last = -1;
    this.say(`Nível ${this.level} · sua vez (X)`);
    this.paint();
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.ended || this.busy || this.s.turn !== 1) return;
    let hit = -1;
    for (const i of legal(this.s)) {
      const c = cellCenter(i);
      if (Math.abs(p.x - c.x) <= CELL / 2 && Math.abs(p.y - c.y) <= CELL / 2) hit = i;
    }
    if (hit < 0) {
      getServices(this).sfx.play('locked');
      return;
    }
    this.hintBox?.dismiss();
    this.move(hit);
  }

  private move(i: number): void {
    const who = this.s.turn;
    const before = statuses(this.s.cells);
    this.s = play(this.s, i)!;
    this.last = i;
    const { sfx } = getServices(this);
    sfx.play(who === 1 ? 'pop' : 'tick');
    const c = cellCenter(i);
    burst(this, c.x, c.y, who === 1 ? CYAN : PINK, 6, { speed: 120, size: 5 });
    const b = Math.floor(i / 9);
    if (before[b] === 0 && boardStatus(this.s.cells, b) === who) {
      sfx.play('coin');
      const o = boardOrigin(b);
      burst(this, o.x + BIG / 2, o.y + BIG / 2, who === 1 ? CYAN : PINK, 16, { speed: 240 });
    }
    this.paint();
    const w = winner(this.s);
    if (w === 1) return this.win('VITÓRIA SUPREMA!', 80);
    if (w === 2) return this.lose('O robô venceu o tabuleiro!');
    if (w === 3) return this.tie();
    if (this.s.turn === 2) {
      this.say('Robô pensando…');
      this.later(560, () => this.move(cpuMove(this.s, this.level)));
    } else this.say(`Nível ${this.level} · sua vez (X)`);
  }

  private mark(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    who: 1 | 2,
    r: number,
    w: number,
  ): void {
    if (who === 1) {
      g.lineStyle(w, CYAN, 1)
        .lineBetween(x - r, y - r, x + r, y + r)
        .lineBetween(x + r, y - r, x - r, y + r);
    } else g.lineStyle(w, PINK, 1).strokeCircle(x, y, r * 1.1);
  }

  private paint(): void {
    const g = this.g.clear();
    const st = statuses(this.s.cells);
    const open =
      this.s.turn === 1 && !this.busy
        ? new Set(legal(this.s).map((i) => Math.floor(i / 9)))
        : new Set<number>();
    for (let b = 0; b < 9; b++) {
      const o = boardOrigin(b);
      g.fillStyle(0x1e1b4b, 0.85).fillRoundedRect(o.x - 6, o.y - 6, BIG + 12, BIG + 12, 14);
      if (open.has(b))
        g.lineStyle(5, 0xfde047, 1).strokeRoundedRect(o.x - 6, o.y - 6, BIG + 12, BIG + 12, 14);
      g.lineStyle(3, 0x818cf8, 0.55);
      for (let k = 1; k < 3; k++) {
        g.lineBetween(o.x + k * CELL, o.y + 6, o.x + k * CELL, o.y + BIG - 6);
        g.lineBetween(o.x + 6, o.y + k * CELL, o.x + BIG - 6, o.y + k * CELL);
      }
      for (let c = 0; c < 9; c++) {
        const v = this.s.cells[b * 9 + c]!;
        if (v === 0) continue;
        const q = cellCenter(b * 9 + c);
        this.mark(g, q.x, q.y, v, 17, b * 9 + c === this.last ? 9 : 6);
      }
      const owner = st[b]!;
      if (owner === 1 || owner === 2) {
        g.fillStyle(owner === 1 ? CYAN : PINK, 0.28).fillRoundedRect(
          o.x - 6,
          o.y - 6,
          BIG + 12,
          BIG + 12,
          14,
        );
        this.mark(g, o.x + BIG / 2, o.y + BIG / 2, owner, 62, 16);
      } else if (owner === 3) {
        g.fillStyle(0x64748b, 0.4).fillRoundedRect(o.x - 6, o.y - 6, BIG + 12, BIG + 12, 14);
      }
    }
  }
}
