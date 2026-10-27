import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { CELLS, CLEAR_AT, HexaSim, topRun, type Stack } from './core';

const CX = GAME_WIDTH / 2;
const BOARD_Y = 600;
const SIZE = 66;
const HAND_Y = 1110;
const HAND_X = [140, 360, 580] as const;
const CHIP_H = 8;
const PALETTE = [0xff595e, 0xffca3a, 0x8ac926, 0x1982c4, 0x9b5de5] as const;

const cellPos = (i: number): { x: number; y: number } => {
  const c = CELLS[i]!;
  return {
    x: CX + SIZE * Math.sqrt(3) * (c.q + c.r / 2),
    y: BOARD_Y + SIZE * 1.5 * c.r,
  };
};

/** "Hexa Pilhas": a hexagon-sort puzzle. Tap a stack, tap an empty cell. */
export class HexaScene extends MiniScene {
  private sim = new HexaSim();
  private gfx!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private selected = -1;

  constructor() {
    super(SceneKeys.Hexa, 'hexa', [0x14213d, 0x3a0ca3]);
  }

  create(): void {
    this.sim = new HexaSim();
    this.selected = -1;
    this.labels = [];
    this.frame();
    this.gfx = this.add.graphics();
    addText(this, CX, 190, 'Junte 10 da mesma cor!', 32, {
      color: '#ffe066',
      stroke: '#0b1430',
    });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) =>
      this.onTap(p.x, p.y),
    );
    this.draw();
  }

  private onTap(x: number, y: number): void {
    if (this.ended) return;
    const { sfx } = getServices(this);
    const slot = HAND_X.findIndex(
      (hx, i) =>
        Math.abs(x - hx) < 100 && Math.abs(y - HAND_Y) < 130 && this.sim.hand[i]!.length > 0,
    );
    if (slot >= 0) {
      this.selected = this.selected === slot ? -1 : slot;
      sfx.play('click');
      this.draw();
      return;
    }
    if (this.selected < 0) return;
    const cell = CELLS.findIndex((_, i) => {
      const p = cellPos(i);
      return Math.hypot(x - p.x, y - p.y) < SIZE * 0.9;
    });
    if (cell < 0 || this.sim.board[cell]) return;
    const ev = this.sim.place(this.selected, cell);
    if (!ev) return;
    this.selected = -1;
    this.setScore(this.sim.score);
    if (ev.cleared) {
      sfx.play('win');
      sfx.vibrate(40);
      const p = cellPos(cell);
      this.pop(
        p.x,
        p.y - 60,
        ev.chain > 1 ? `COMBO x${ev.chain}!` : `+${ev.cleared * 3}`,
        '#ffe066',
      );
    } else {
      sfx.play('pop', cell % 7);
    }
    this.draw();
    if (this.sim.dead) {
      this.finish('Tabuleiro cheio!', [`Pilhas colocadas: ${this.sim.placed}`], {
        score: this.sim.score,
        details: { chain: this.sim.bestChain, placed: this.sim.placed },
      });
    }
  }

  private draw(): void {
    const g = this.gfx.clear();
    for (const t of this.labels) t.destroy();
    this.labels = [];
    CELLS.forEach((_, i) => {
      const { x, y } = cellPos(i);
      this.hexPath(g, x, y, SIZE - 4);
      g.fillStyle(0x000000, 0.28).fillPath();
      this.hexPath(g, x, y, SIZE - 4);
      g.lineStyle(3, 0xffffff, 0.18).strokePath();
    });
    CELLS.forEach((_, i) => {
      const s = this.sim.board[i];
      if (s) this.drawStack(g, cellPos(i).x, cellPos(i).y, s);
    });
    this.sim.hand.forEach((s, i) => {
      const x = HAND_X[i]!;
      if (this.selected === i) {
        g.fillStyle(0xffffff, 0.18).fillRoundedRect(x - 100, HAND_Y - 140, 200, 250, 24);
        g.lineStyle(4, 0xffe066).strokeRoundedRect(x - 100, HAND_Y - 140, 200, 250, 24);
      }
      if (s.length) this.drawStack(g, x, HAND_Y, s);
    });
  }

  private hexPath(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number): void {
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 6 + (k * Math.PI) / 3;
      const px = x + r * Math.cos(a);
      const py = y + r * Math.sin(a);
      if (k === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
  }

  private drawStack(g: Phaser.GameObjects.Graphics, x: number, y: number, s: Stack): void {
    const r = SIZE - 8;
    s.forEach((color, level) => {
      const cy = y - level * CHIP_H;
      this.hexPath(g, x, cy, r);
      g.fillStyle(PALETTE[color % PALETTE.length]!).fillPath();
      this.hexPath(g, x, cy, r);
      g.lineStyle(2, 0x000000, 0.35).strokePath();
    });
    const run = topRun(s);
    if (run >= CLEAR_AT / 2) {
      this.labels.push(
        addText(this, x, y - (s.length - 1) * CHIP_H, `${run}/${CLEAR_AT}`, 26, {
          color: '#ffffff',
          stroke: '#000000',
        }),
      );
    }
  }
}
