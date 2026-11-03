import Phaser from 'phaser';
import { SceneKeys } from '@/config';
import { hint } from '@/platform/ui/juice';
import { PuzzleScene } from '@/platform/ui/puzzleGame';
import { Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  emptyBoard,
  generate,
  isSolved,
  place,
  remove,
  rotate,
  type Owner,
  type Puzzle,
  type Shape,
} from './core';

const Y0 = 260;
const BOARD = 420;
const TRAY_Y = 740;
const COLORS = [
  0xef4444, 0x3b82f6, 0x22c55e, 0xfacc15, 0xa855f7, 0xf97316, 0x06b6d4, 0xec4899, 0x84cc16,
  0x14b8a6, 0xf43f5e, 0x8b5cf6,
];

/** "Encaixe": fill the whole board with the pieces. Select a piece, rotate it, tap where it goes. */
export class EncaixeScene extends PuzzleScene {
  private pz!: Puzzle;
  private owner: Owner = [];
  private shapes: Shape[] = [];
  private sel = -1;
  private cell = 70;
  private x0 = 0;
  private g!: Phaser.GameObjects.Graphics;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Encaixe, 'encaixe', [0x0f766e, 0x042f2e]);
  }

  create(): void {
    this.g = this.add.graphics().setDepth(3);
    this.begin('#99f6e4', '#042f2e');
    new Button(this, 190, 1190, 'Girar', () => this.turn(), {
      width: 300,
      height: 90,
      fontSize: 34,
      color: 0x0d9488,
      shade: 0x115e59,
    }).setDepth(20);
    new Button(this, 530, 1190, 'Limpar', () => this.clear(), {
      width: 300,
      height: 90,
      fontSize: 34,
      color: 0x6b7280,
      shade: 0x374151,
    }).setDepth(20);
    this.hintBox = hint(this, ['Escolha, gire e toque no tabuleiro'], 1110, 6000);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.tap(p));
  }

  protected startLevel(): void {
    this.pz = generate(this.level);
    this.owner = emptyBoard(this.pz);
    this.shapes = this.pz.tray.map((s) => s);
    this.sel = -1;
    this.cell = Math.floor(BOARD / Math.max(this.pz.w, this.pz.h));
    this.x0 = (720 - this.cell * this.pz.w) / 2;
  }

  private traySlot(i: number): { x: number; y: number } {
    return { x: 20 + (i % 5) * 136, y: TRAY_Y + Math.floor(i / 5) * 130 };
  }

  private turn(): void {
    if (this.locked || this.ended || this.sel < 0) return;
    this.shapes[this.sel] = rotate(this.shapes[this.sel]!);
    getServices(this).sfx.play('tick');
  }

  private clear(): void {
    if (this.locked || this.ended) return;
    this.owner = emptyBoard(this.pz);
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.locked || this.ended) return;
    this.hintBox?.dismiss();
    const { sfx } = getServices(this);
    const c = Math.floor((p.x - this.x0) / this.cell);
    const r = Math.floor((p.y - Y0) / this.cell);
    if (r >= 0 && r < this.pz.h && c >= 0 && c < this.pz.w) {
      const here = this.owner[r * this.pz.w + c]!;
      if (here >= 0) {
        this.owner = remove(this.owner, here);
        this.sel = here;
        sfx.play('click');
        return;
      }
      if (this.sel < 0) return;
      const shape = this.shapes[this.sel]!;
      // The first cell of the shape lands where you tap.
      const next = place(this.pz, this.owner, this.sel, shape, r, c - shape[0]![1]);
      if (!next) {
        sfx.play('locked');
        return;
      }
      this.owner = next;
      this.sel = -1;
      sfx.play('pop');
      if (isSolved(this.owner)) this.solved();
      return;
    }
    this.shapes.forEach((_, i) => {
      const s = this.traySlot(i);
      if (
        p.x >= s.x &&
        p.x < s.x + 130 &&
        p.y >= s.y &&
        p.y < s.y + 124 &&
        !this.owner.includes(i)
      ) {
        this.sel = this.sel === i ? -1 : i;
        sfx.play('click');
      }
    });
  }

  override update(t: number, dt: number): void {
    super.update(t, dt);
    const g = this.g.clear();
    const { w, h } = this.pz;
    g.fillStyle(0x020617, 0.5).fillRoundedRect(
      this.x0 - 8,
      Y0 - 8,
      w * this.cell + 16,
      h * this.cell + 16,
      12,
    );
    for (let i = 0; i < w * h; i++) {
      const o = this.owner[i]!;
      const x = this.x0 + (i % w) * this.cell;
      const y = Y0 + Math.floor(i / w) * this.cell;
      g.fillStyle(o >= 0 ? COLORS[o % COLORS.length]! : 0x134e4a, 1).fillRect(
        x + 2,
        y + 2,
        this.cell - 4,
        this.cell - 4,
      );
    }
    this.shapes.forEach((s, i) => {
      if (this.owner.includes(i)) return;
      const slot = this.traySlot(i);
      const k = 24;
      if (this.sel === i)
        g.lineStyle(5, 0xfde047, 1).strokeRoundedRect(slot.x, slot.y, 130, 124, 12);
      for (const [r, c] of s) {
        g.fillStyle(COLORS[i % COLORS.length]!, 1).fillRect(
          slot.x + 10 + c * k,
          slot.y + 10 + r * k,
          k - 2,
          k - 2,
        );
      }
    });
  }
}
