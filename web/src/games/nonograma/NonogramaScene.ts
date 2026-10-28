import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { ambient, banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { heartsLabel, MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { NonogramaBoard, TEMPLATES } from './core';

export class NonogramaScene extends MiniScene {
  private board!: NonogramaBoard;
  private g!: Phaser.GameObjects.Graphics;
  private clueTexts: Phaser.GameObjects.Text[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private mode: 'fill' | 'mark' = 'fill';
  private score = 0;
  private puzzlesDone = 0;
  private perfectCount = 0;
  private lives = 3;
  private levelIdx = 0;
  private x0 = 180;
  private y0 = 390;
  private cell = 84;
  private busy = false;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Nonograma, 'nonograma', [0x1e1b4b, 0x312e81]);
  }

  create(): void {
    this.score = 0;
    this.puzzlesDone = 0;
    this.perfectCount = 0;
    this.lives = 3;
    this.levelIdx = 0;
    this.mode = 'fill';
    this.busy = false;
    this.clueTexts = [];
    this.frame('0');
    ambient(this, 0xa5b4fc, 18);

    this.statusText = addText(this, GAME_WIDTH / 2, 168, '', 30, {
      color: '#e0e7ff',
      stroke: '#1e1b4b',
      strokeThickness: 6,
    }).setDepth(50);

    this.livesText = addText(this, GAME_WIDTH / 2, 220, '', 34, {
      color: '#ffffff',
    }).setDepth(50);

    this.g = this.add.graphics().setDepth(5);

    new Button(this, 210, 1185, '🎨 Pintar', () => this.setMode('fill'), {
      width: 270,
      height: 88,
      fontSize: 30,
      color: 0x6366f1,
      shade: 0x4338ca,
    }).setDepth(50);

    new Button(this, 510, 1185, '✕ Marcar Vazio', () => this.setMode('mark'), {
      width: 270,
      height: 88,
      fontSize: 28,
      color: 0x64748b,
      shade: 0x334155,
    }).setDepth(50);

    this.hintBox = hint(
      this,
      ['Os números indicam quantos blocos seguidos', 'existem em cada linha e coluna!'],
      1085,
      4500,
    );

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.ended || this.busy) return;
      const c = Math.floor((p.x - this.x0) / this.cell);
      const r = Math.floor((p.y - this.y0) / this.cell);
      if (r < 0 || r >= this.board.size || c < 0 || c >= this.board.size) return;
      this.tapCell(r, c);
    });

    this.startPuzzle();
  }

  private setMode(m: 'fill' | 'mark'): void {
    if (this.ended) return;
    this.mode = m;
    getServices(this).sfx.play('click');
    this.updateHeader();
  }

  private startPuzzle(): void {
    const tpl = TEMPLATES[this.levelIdx % TEMPLATES.length]!;
    this.board = new NonogramaBoard(tpl);
    this.cell = this.board.size <= 5 ? 88 : 76;
    const totalW = this.board.size * this.cell;
    this.x0 = (GAME_WIDTH - totalW) / 2 + 44;
    this.y0 = 400;
    this.updateHeader();
    this.redraw();
  }

  private updateHeader(): void {
    const modeLbl = this.mode === 'fill' ? '🎨 Modo: Pintar' : '✕ Modo: Marcar';
    this.statusText.setText(`Desenho #${this.puzzlesDone + 1}   ·   ${modeLbl}`);
    this.livesText.setText(heartsLabel(this.lives, 3));
  }

  private tapCell(r: number, c: number): void {
    this.hintBox?.dismiss();
    const res = this.board.act(r, c, this.mode);
    if (res === 'noop') return;

    const cx = this.x0 + c * this.cell + this.cell / 2;
    const cy = this.y0 + r * this.cell + this.cell / 2;
    const { sfx } = getServices(this);

    if (res === 'hit') {
      sfx.play('pop');
      this.score += 40;
      this.setScore(this.score);
      burst(this, cx, cy, this.board.template.color, 10, { speed: 180 });
      this.redraw();
      if (this.board.solved) this.onPuzzleSolved();
    } else if (res === 'marked') {
      sfx.play('tick');
      this.redraw();
    } else if (res === 'mistake') {
      this.lives--;
      sfx.play('hit');
      sfx.vibrate(45);
      flash(this, 0xf43f5e, 0.28, 200);
      this.cameras.main.shake(160, 0.008);
      this.updateHeader();
      this.redraw();
      if (this.lives <= 0) {
        this.finish(
          'Acabaram as vidas!',
          [`Desenhos revelados: ${this.puzzlesDone}`, `Perfeitos: ${this.perfectCount}`],
          {
            score: this.score,
            details: { puzzles: this.puzzlesDone, perfect: this.perfectCount },
          },
        );
      }
    }
  }

  private onPuzzleSolved(): void {
    this.busy = true;
    this.puzzlesDone++;
    const perfect = this.board.mistakes === 0;
    if (perfect) this.perfectCount++;
    const bonus = 250 + (perfect ? 150 : 0);
    this.score += bonus;
    this.setScore(this.score);

    const { sfx } = getServices(this);
    sfx.play(perfect ? 'level' : 'win');
    const tpl = this.board.template;
    banner(this, `${tpl.emoji} ${tpl.name.toUpperCase()}!`, '#fde047');
    shockwave(this, GAME_WIDTH / 2, this.y0 + (this.board.size * this.cell) / 2, tpl.color, 180);

    this.time.delayedCall(1450, () => {
      if (this.ended) return;
      this.levelIdx++;
      this.busy = false;
      this.startPuzzle();
    });
  }

  private redraw(): void {
    for (const t of this.clueTexts) t.destroy();
    this.clueTexts = [];

    const g = this.g.clear();
    const n = this.board.size;
    const c = this.cell;
    const total = n * c;

    g.fillStyle(0x0f172a, 0.92).fillRoundedRect(
      this.x0 - 118,
      this.y0 - 118,
      total + 132,
      total + 132,
      26,
    );
    g.lineStyle(3, 0x818cf8, 0.55).strokeRoundedRect(
      this.x0 - 118,
      this.y0 - 118,
      total + 132,
      total + 132,
      26,
    );

    // Row clues
    for (let r = 0; r < n; r++) {
      const done = this.board.isRowComplete(r);
      const label = this.board.rowClues[r]!.join(' ');
      const t = addText(this, this.x0 - 18, this.y0 + r * c + c / 2, label, 26, {
        color: done ? '#64748b' : '#ffffff',
      })
        .setOrigin(1, 0.5)
        .setDepth(10);
      this.clueTexts.push(t);
    }

    // Col clues
    for (let col = 0; col < n; col++) {
      const done = this.board.isColComplete(col);
      const label = this.board.colClues[col]!.join('\n');
      const t = addText(this, this.x0 + col * c + c / 2, this.y0 - 16, label, 24, {
        color: done ? '#64748b' : '#ffffff',
        align: 'center',
      })
        .setOrigin(0.5, 1)
        .setDepth(10);
      this.clueTexts.push(t);
    }

    // Cells
    for (let r = 0; r < n; r++) {
      for (let col = 0; col < n; col++) {
        const x = this.x0 + col * c;
        const y = this.y0 + r * c;
        const state = this.board.cells[r]![col]!;
        if (state === 'filled') {
          g.fillStyle(this.board.template.color).fillRoundedRect(x + 4, y + 4, c - 8, c - 8, 14);
          g.fillStyle(0xffffff, 0.28).fillRoundedRect(x + 10, y + 8, c - 24, 12, 6);
        } else {
          g.fillStyle(0x1e293b).fillRoundedRect(x + 4, y + 4, c - 8, c - 8, 12);
          g.lineStyle(2, 0x334155).strokeRoundedRect(x + 4, y + 4, c - 8, c - 8, 12);
          if (state === 'marked') {
            g.lineStyle(5, 0x94a3b8, 0.85);
            g.lineBetween(x + 22, y + 22, x + c - 22, y + c - 22);
            g.lineBetween(x + c - 22, y + 22, x + 22, y + c - 22);
          }
        }
      }
    }
  }
}
