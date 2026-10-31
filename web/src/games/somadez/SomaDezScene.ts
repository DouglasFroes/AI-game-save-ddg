import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { COLS, normRect, ROWS, SumBoard, TIME, type Rect } from './core';

const CELL = 60;
const X0 = (GAME_WIDTH - CELL * COLS) / 2;
const Y0 = 262;
const DIGIT_COLORS = [
  '',
  '#fca5a5',
  '#fdba74',
  '#fde047',
  '#bef264',
  '#86efac',
  '#5eead4',
  '#7dd3fc',
  '#a5b4fc',
  '#f0abfc',
];

/** "Soma Dez": box digits that add up to 10 to clear them — as many as you can in two minutes. */
export class SomaDezScene extends MiniScene {
  private board = new SumBoard();
  private g!: Phaser.GameObjects.Graphics;
  private digits: Phaser.GameObjects.Text[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private sumText!: Phaser.GameObjects.Text;
  private start: { r: number; c: number } | null = null;
  private rect: Rect | null = null;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.SomaDez, 'somadez', [0x134e4a, 0x0b1430]);
  }

  create(): void {
    this.board = new SumBoard();
    this.start = null;
    this.rect = null;
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.statusText = addText(this, GAME_WIDTH / 2, 170, '', 30, {
      color: '#99f6e4',
      stroke: '#134e4a',
      strokeThickness: 6,
    }).setDepth(50);
    this.sumText = addText(this, GAME_WIDTH / 2, 1215, '', 40, {
      color: '#ffffff',
      stroke: '#0b1430',
      strokeThickness: 7,
    }).setDepth(50);
    this.digits = this.board.cells.map((_, i) =>
      addText(
        this,
        X0 + (i % COLS) * CELL + CELL / 2,
        Y0 + Math.floor(i / COLS) * CELL + CELL / 2,
        '',
        36,
        {
          color: '#ffffff',
        },
      ).setDepth(6),
    );
    this.hintBox = hint(
      this,
      ['Arraste um retângulo com números', 'que somem exatamente 10!'],
      700,
      4500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      const cell = this.cellAt(p.x, p.y);
      if (this.ended || !cell) return;
      this.hintBox?.dismiss();
      this.start = cell;
      this.rect = normRect(cell.r, cell.c, cell.r, cell.c);
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (!this.start || !p.isDown) return;
      const cell = this.cellAt(
        Phaser.Math.Clamp(p.x, X0, X0 + COLS * CELL - 1),
        Phaser.Math.Clamp(p.y, Y0, Y0 + ROWS * CELL - 1),
      );
      if (cell) this.rect = normRect(this.start.r, this.start.c, cell.r, cell.c);
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => this.release());
  }

  private cellAt(x: number, y: number): { r: number; c: number } | null {
    const c = Math.floor((x - X0) / CELL);
    const r = Math.floor((y - Y0) / CELL);
    return r < 0 || c < 0 || r >= ROWS || c >= COLS ? null : { r, c };
  }

  private release(): void {
    const rect = this.rect;
    this.start = null;
    this.rect = null;
    if (!rect || this.ended) return;
    const { sfx } = getServices(this);
    const n = this.board.clear(rect);
    if (!n) {
      if (rect.r1 > rect.r0 || rect.c1 > rect.c0) sfx.play('locked');
      return;
    }
    sfx.play(n >= 4 ? 'win' : 'coin', Math.min(8, n));
    sfx.vibrate(15);
    const cx = X0 + ((rect.c0 + rect.c1 + 1) / 2) * CELL;
    const cy = Y0 + ((rect.r0 + rect.r1 + 1) / 2) * CELL;
    burst(this, cx, cy, 0x5eead4, 6 + n * 3, { speed: 260 });
    this.pop(cx, cy - 20, `+${n}`, '#fde047', 30 + n * 3);
    if (n >= 4) banner(this, `${n} DE UMA VEZ!`, '#fde047', 560);
    this.setScore(this.board.score);
    if (!this.board.hasMove()) {
      banner(this, 'NOVOS NÚMEROS!', '#99f6e4', 560);
      this.board.refill();
    }
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.board.tick(deltaMs / 1000);
    const b = this.board;
    if (b.over) {
      getServices(this).sfx.play('hit');
      flash(this, 0xef4444, 0.3, 300);
      this.finish(
        'O tempo acabou!',
        [`Números limpos: ${b.score} · Somas: ${b.clears}`],
        { score: b.score, details: { clears: b.clears } },
        600,
      );
      return;
    }
    this.statusText.setText(`⏱ ${Math.ceil(b.timeLeft)}s · Somas feitas ${b.clears}`);
    const g = this.g.clear();
    const frac = b.timeLeft / TIME;
    g.fillStyle(0x042f2e, 1).fillRoundedRect(110, 212, 500, 16, 8);
    g.fillStyle(frac < 0.2 ? 0xef4444 : 0x2dd4bf, 1).fillRoundedRect(110, 212, 500 * frac, 16, 8);
    g.fillStyle(0x042f2e, 0.85).fillRoundedRect(
      X0 - 8,
      Y0 - 8,
      COLS * CELL + 16,
      ROWS * CELL + 16,
      18,
    );
    b.cells.forEach((v, i) =>
      this.digits[i]!.setText(v ? String(v) : '').setColor(DIGIT_COLORS[v] ?? '#ffffff'),
    );
    if (this.rect) {
      const r = this.rect;
      const s = b.sum(r);
      const color = s === 10 ? 0x22c55e : s > 10 ? 0xef4444 : 0xfacc15;
      const x = X0 + r.c0 * CELL;
      const y = Y0 + r.r0 * CELL;
      const w = (r.c1 - r.c0 + 1) * CELL;
      const h = (r.r1 - r.r0 + 1) * CELL;
      g.fillStyle(color, 0.22).fillRoundedRect(x, y, w, h, 10);
      g.lineStyle(4, color, 1).strokeRoundedRect(x, y, w, h, 10);
      this.sumText
        .setText(`Soma: ${s}`)
        .setColor(s === 10 ? '#86efac' : s > 10 ? '#fca5a5' : '#fde047');
    } else this.sumText.setText('');
  }
}
