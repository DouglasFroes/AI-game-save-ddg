import Phaser from 'phaser';
import { SceneKeys } from '@/config';
import { hint } from '@/platform/ui/juice';
import { PuzzleScene } from '@/platform/ui/puzzleGame';
import { Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  begin,
  extend,
  filled,
  generate,
  isConnected,
  isSolved,
  newPaths,
  type Paths,
  type Puzzle,
} from './core';

const BOARD = 640;
const Y0 = 270;
const COLORS = [0xef4444, 0x3b82f6, 0x22c55e, 0xfacc15, 0xf97316, 0xa855f7, 0x06b6d4, 0xec4899];

/** "Fluxo": drag from a dot to its twin and fill the whole board with pipes. */
export class FluxoScene extends PuzzleScene {
  private pz!: Puzzle;
  private paths: Paths = [];
  private cell = 100;
  private x0 = 0;
  private active = -1;
  private g!: Phaser.GameObjects.Graphics;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Fluxo, 'fluxo', [0x1d4ed8, 0x0f172a]);
  }

  create(): void {
    this.g = this.add.graphics().setDepth(3);
    this.begin('#bfdbfe', '#0f172a');
    new Button(this, 360, 1130, 'Limpar', () => this.clear(), {
      width: 320,
      height: 90,
      fontSize: 32,
      color: 0x6b7280,
      shade: 0x374151,
    }).setDepth(20);
    this.hintBox = hint(
      this,
      ['Arraste de um ponto até o outro da mesma cor', 'Preencha todos os quadrados'],
      940,
      5000,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.locked || this.ended) return;
      const c = this.at(p);
      if (c < 0) return;
      this.hintBox?.dismiss();
      this.active = begin(this.pz, this.paths, c);
      if (this.active >= 0) getServices(this).sfx.play('click');
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.active < 0 || this.locked || this.ended) return;
      const c = this.at(p);
      if (c >= 0 && extend(this.pz, this.paths, this.active, c)) {
        getServices(this).sfx.play('tick');
        if (isSolved(this.pz, this.paths)) {
          this.active = -1;
          this.solved();
        }
      }
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => (this.active = -1));
  }

  protected startLevel(): void {
    this.pz = generate(this.level);
    this.paths = newPaths(this.pz);
    this.active = -1;
    this.cell = Math.floor(BOARD / this.pz.size);
    this.x0 = (720 - this.cell * this.pz.size) / 2;
  }

  protected override hud(): string {
    return `${filled(this.paths)}/${this.pz.size * this.pz.size}`;
  }

  private clear(): void {
    if (this.locked || this.ended) return;
    this.paths = newPaths(this.pz);
    this.active = -1;
  }

  private at(p: Phaser.Input.Pointer): number {
    const c = Math.floor((p.x - this.x0) / this.cell);
    const r = Math.floor((p.y - Y0) / this.cell);
    return c < 0 || c >= this.pz.size || r < 0 || r >= this.pz.size ? -1 : r * this.pz.size + c;
  }

  private center(i: number): { x: number; y: number } {
    const s = this.pz.size;
    return {
      x: this.x0 + (i % s) * this.cell + this.cell / 2,
      y: Y0 + Math.floor(i / s) * this.cell + this.cell / 2,
    };
  }

  override update(t: number, dt: number): void {
    super.update(t, dt);
    const g = this.g.clear();
    const s = this.pz.size;
    g.fillStyle(0x020617, 0.7).fillRoundedRect(
      this.x0 - 8,
      Y0 - 8,
      s * this.cell + 16,
      s * this.cell + 16,
      14,
    );
    for (let i = 0; i < s * s; i++) {
      const c = this.center(i);
      g.lineStyle(2, 0x334155, 1).strokeRect(
        c.x - this.cell / 2,
        c.y - this.cell / 2,
        this.cell,
        this.cell,
      );
    }
    this.paths.forEach((path, color) => {
      const col = COLORS[color % COLORS.length]!;
      if (isConnected(this.pz, this.paths, color)) {
        for (const cell of path) {
          const c = this.center(cell);
          g.fillStyle(col, 0.22).fillRect(
            c.x - this.cell / 2,
            c.y - this.cell / 2,
            this.cell,
            this.cell,
          );
        }
      }
      g.lineStyle(this.cell * 0.32, col, 1);
      for (let k = 1; k < path.length; k++) {
        const a = this.center(path[k - 1]!);
        const b = this.center(path[k]!);
        g.lineBetween(a.x, a.y, b.x, b.y);
        g.fillStyle(col, 1).fillCircle(b.x, b.y, this.cell * 0.16);
      }
    });
    this.pz.ends.forEach(([a, b], color) => {
      for (const e of [a, b]) {
        const c = this.center(e);
        g.fillStyle(COLORS[color % COLORS.length]!, 1).fillCircle(c.x, c.y, this.cell * 0.34);
        g.lineStyle(3, 0xffffff, 0.6).strokeCircle(c.x, c.y, this.cell * 0.34);
      }
    });
  }
}
