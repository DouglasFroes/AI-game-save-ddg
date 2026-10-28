import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { ambient, banner, burst, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  DIR_E,
  DIR_N,
  DIR_S,
  DIR_W,
  generatePipeGrid,
  isPipeGridSolved,
  propagateWater,
  rotateCell,
  type PipeCell,
} from './core';

export class CanosScene extends MiniScene {
  private grid: PipeCell[][] = [];
  private g!: Phaser.GameObjects.Graphics;
  private bar!: Phaser.GameObjects.Graphics;
  private infoText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private score = 0;
  private levelsDone = 0;
  private totalMoves = 0;
  private levelMoves = 0;
  private timeLeft = 45;
  private maxTime = 45;
  private x0 = 60;
  private y0 = 310;
  private cell = 110;
  private busy = false;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Canos, 'canos', [0x082f49, 0x0c4a6e]);
  }

  create(): void {
    this.score = 0;
    this.levelsDone = 0;
    this.totalMoves = 0;
    this.levelMoves = 0;
    this.timeLeft = 45;
    this.maxTime = 45;
    this.busy = false;
    this.frame('0');
    ambient(this, 0x7dd3fc, 20);

    this.infoText = addText(this, GAME_WIDTH / 2, 168, '', 30, {
      color: '#bae6fd',
      stroke: '#082f49',
      strokeThickness: 6,
    }).setDepth(50);

    this.timeText = addText(this, GAME_WIDTH / 2, 218, '', 26, {
      color: '#ffffff',
      stroke: '#082f49',
      strokeThickness: 5,
    }).setDepth(51);

    this.g = this.add.graphics().setDepth(5);
    this.bar = this.add.graphics().setDepth(45);

    new Button(this, GAME_WIDTH / 2, 1185, '💡 Alinhar 1 Cano (-5s)', () => this.useHint(), {
      width: 380,
      height: 88,
      fontSize: 28,
      color: 0x0ea5e9,
      shade: 0x0369a1,
    }).setDepth(50);

    this.hintBox = hint(
      this,
      ['Toque nos canos para girá-los', 'e levar a água da fonte até todos os cristais!'],
      1085,
      4500,
    );

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.ended || this.busy) return;
      const size = this.grid.length;
      const c = Math.floor((p.x - this.x0) / this.cell);
      const r = Math.floor((p.y - this.y0) / this.cell);
      if (r < 0 || r >= size || c < 0 || c >= size) return;
      this.tapPipe(r, c);
    });

    this.nextLevel();
  }

  override update(_time: number, deltaMs: number): void {
    if (this.ended || this.busy) return;
    this.timeLeft -= Math.min(deltaMs, 50) / 1000;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.drawBar();
      this.finish(
        'Pressão estourou!',
        [`Redes conectadas: ${this.levelsDone}`, `Giros totais: ${this.totalMoves}`],
        {
          score: this.score,
          details: { levels: this.levelsDone, moves: this.totalMoves },
        },
      );
      return;
    }
    this.drawBar();
  }

  private nextLevel(): void {
    const size = this.levelsDone < 2 ? 4 : this.levelsDone < 5 ? 5 : 6;
    this.grid = generatePipeGrid(size, Date.now() + this.levelsDone * 97);
    this.levelMoves = 0;
    this.cell = Math.floor(600 / size);
    this.x0 = (GAME_WIDTH - size * this.cell) / 2;
    this.y0 = 310;
    this.updateInfo();
    this.redraw();
  }

  private updateInfo(): void {
    const targets = this.grid.flat().filter((c) => c.isTarget);
    const connected = targets.filter((c) => c.watered).length;
    this.infoText.setText(
      `Rede #${this.levelsDone + 1}   ·   💎 ${connected}/${targets.length}   ·   Giros: ${this.levelMoves}`,
    );
  }

  private tapPipe(r: number, c: number): void {
    this.hintBox?.dismiss();
    rotateCell(this.grid, r, c);
    this.levelMoves++;
    this.totalMoves++;
    const { sfx } = getServices(this);
    const cell = this.grid[r]![c]!;
    sfx.play(cell.watered ? 'pop' : 'tick');
    const px = this.x0 + c * this.cell + this.cell / 2;
    const py = this.y0 + r * this.cell + this.cell / 2;
    if (cell.watered) burst(this, px, py, 0x38bdf8, 8, { speed: 150, size: 5 });

    this.updateInfo();
    this.redraw();

    if (isPipeGridSolved(this.grid)) {
      this.onSolved();
    }
  }

  private useHint(): void {
    if (this.ended || this.busy || this.timeLeft <= 6) {
      getServices(this).sfx.play('locked');
      return;
    }
    const wrong = this.grid.flat().find((c) => c.mask !== c.solvedMask);
    if (!wrong) return;
    this.timeLeft = Math.max(1, this.timeLeft - 5);
    wrong.mask = wrong.solvedMask;
    propagateWater(this.grid);
    getServices(this).sfx.play('star');
    const px = this.x0 + wrong.c * this.cell + this.cell / 2;
    const py = this.y0 + wrong.r * this.cell + this.cell / 2;
    shockwave(this, px, py, 0xfde047, 70);
    this.updateInfo();
    this.redraw();
    if (isPipeGridSolved(this.grid)) this.onSolved();
  }

  private onSolved(): void {
    this.busy = true;
    this.levelsDone++;
    const bonusTime = 12;
    this.timeLeft = Math.min(this.maxTime, this.timeLeft + bonusTime);
    const pts = 200 + Math.max(0, 120 - this.levelMoves * 4);
    this.score += pts;
    this.setScore(this.score);

    const { sfx } = getServices(this);
    sfx.play('level');
    banner(this, 'ÁGUA LIBERADA!', '#38bdf8');
    shockwave(this, GAME_WIDTH / 2, this.y0 + 300, 0x38bdf8, 200);
    this.pop(GAME_WIDTH / 2, 540, `+${pts}  ⏱+${bonusTime}s`, '#bae6fd', 44);

    this.time.delayedCall(1200, () => {
      if (this.ended) return;
      this.busy = false;
      this.nextLevel();
    });
  }

  private drawBar(): void {
    const g = this.bar.clear();
    const w = 520;
    const x = (GAME_WIDTH - w) / 2;
    const y = 252;
    const ratio = Phaser.Math.Clamp(this.timeLeft / this.maxTime, 0, 1);
    g.fillStyle(0x0f172a, 0.85).fillRoundedRect(x, y, w, 20, 10);
    g.fillStyle(ratio < 0.25 ? 0xf43f5e : 0x38bdf8).fillRoundedRect(
      x,
      y,
      Math.max(12, w * ratio),
      20,
      10,
    );
    this.timeText.setText(`⏱ ${Math.ceil(this.timeLeft)}s`);
  }

  private redraw(): void {
    const g = this.g.clear();
    const size = this.grid.length;
    const c = this.cell;
    const total = size * c;

    g.fillStyle(0x041e30, 0.92).fillRoundedRect(
      this.x0 - 14,
      this.y0 - 14,
      total + 28,
      total + 28,
      24,
    );
    g.lineStyle(3, 0x38bdf8, 0.45).strokeRoundedRect(
      this.x0 - 14,
      this.y0 - 14,
      total + 28,
      total + 28,
      24,
    );

    const pipeW = Math.max(22, Math.floor(c * 0.28));

    for (let r = 0; r < size; r++) {
      for (let col = 0; col < size; col++) {
        const cell = this.grid[r]![col]!;
        const x = this.x0 + col * c;
        const y = this.y0 + r * c;
        const cx = x + c / 2;
        const cy = y + c / 2;

        g.fillStyle(cell.watered ? 0x0c4a6e : 0x0f172a).fillRoundedRect(
          x + 4,
          y + 4,
          c - 8,
          c - 8,
          16,
        );
        g.lineStyle(2, cell.watered ? 0x38bdf8 : 0x1e293b).strokeRoundedRect(
          x + 4,
          y + 4,
          c - 8,
          c - 8,
          16,
        );

        const color = cell.watered ? 0x38bdf8 : 0x64748b;
        g.fillStyle(color);

        // Center hub
        g.fillCircle(cx, cy, pipeW * 0.65);

        // Pipe arms
        if (cell.mask & DIR_N) g.fillRect(cx - pipeW / 2, y + 4, pipeW, c / 2 - 4);
        if (cell.mask & DIR_S) g.fillRect(cx - pipeW / 2, cy, pipeW, c / 2 - 4);
        if (cell.mask & DIR_W) g.fillRect(x + 4, cy - pipeW / 2, c / 2 - 4, pipeW);
        if (cell.mask & DIR_E) g.fillRect(cx, cy - pipeW / 2, c / 2 - 4, pipeW);

        // Inner water highlight
        if (cell.watered) {
          g.fillStyle(0xe0f2fe, 0.65).fillCircle(cx, cy, pipeW * 0.3);
        }

        // Source / Target emblems
        if (cell.isSource) {
          g.fillStyle(0xfbbf24).fillCircle(cx, cy, pipeW * 0.85);
          g.lineStyle(3, 0xffffff).strokeCircle(cx, cy, pipeW * 0.85);
        } else if (cell.isTarget) {
          g.fillStyle(cell.watered ? 0x34d399 : 0xf43f5e).fillCircle(cx, cy, pipeW * 0.8);
          g.lineStyle(3, 0xffffff).strokeCircle(cx, cy, pipeW * 0.8);
        }
      }
    }
  }
}
