import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, flash, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { BinaryBoard, boardPoints, generate, timeFor } from './core';

const BOARD = 620;
const X0 = (GAME_WIDTH - BOARD) / 2;
const Y0 = 330;
const ZERO = 0x38bdf8;
const ONE = 0xf472b6;

/** "Binário": fill with 0s and 1s — no three alike in a row, equal halves, no twin lines. */
export class BinarioScene extends MiniScene {
  private board!: BinaryBoard;
  private level = 1;
  private score = 0;
  private timeLeft = 0;
  private g!: Phaser.GameObjects.Graphics;
  private digits: Phaser.GameObjects.Text[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Binario, 'binario', [0x0c4a6e, 0x0b1430]);
  }

  create(): void {
    this.level = 1;
    this.score = 0;
    this.digits = [];
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.statusText = addText(this, GAME_WIDTH / 2, 170, '', 30, {
      color: '#bae6fd',
      stroke: '#0c4a6e',
      strokeThickness: 6,
    }).setDepth(50);
    addText(
      this,
      GAME_WIDTH / 2,
      1060,
      'Sem 3 iguais seguidos · metade 0, metade 1\nnenhuma linha ou coluna repetida',
      26,
      {
        color: '#e0f2fe',
        stroke: '#0b1430',
        strokeThickness: 5,
      },
    ).setDepth(50);
    this.newBoard();
    this.hintBox = hint(this, ['Toque para trocar: vazio → 0 → 1'], 1180, 4500);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) =>
      this.tap(p.x, p.y),
    );
  }

  private newBoard(): void {
    this.board = new BinaryBoard(generate(this.level));
    this.timeLeft = timeFor(this.board.puzzle.n);
    for (const t of this.digits) t.destroy();
    const n = this.board.puzzle.n;
    const cs = BOARD / n;
    this.digits = this.board.cells.map((_, i) =>
      addText(
        this,
        X0 + (i % n) * cs + cs / 2,
        Y0 + Math.floor(i / n) * cs + cs / 2,
        '',
        n === 6 ? 56 : 44,
        {
          color: '#ffffff',
        },
      ).setDepth(6),
    );
  }

  private tap(x: number, y: number): void {
    if (this.ended) return;
    const n = this.board.puzzle.n;
    const cs = BOARD / n;
    const c = Math.floor((x - X0) / cs);
    const r = Math.floor((y - Y0) / cs);
    if (r < 0 || c < 0 || r >= n || c >= n) return;
    const i = r * n + c;
    const { sfx } = getServices(this);
    if (this.board.locked(i)) {
      sfx.play('locked');
      return;
    }
    this.hintBox?.dismiss();
    this.board.cycle(i);
    sfx.play('click');
    if (!this.board.solved) return;
    const pts = boardPoints(this.level, n) + Math.ceil(this.timeLeft) * 5;
    this.score += pts;
    this.setScore(this.score);
    sfx.play('win');
    sfx.vibrate([30, 30, 60]);
    banner(this, `+${pts}`, '#86efac');
    shockwave(this, GAME_WIDTH / 2, Y0 + BOARD / 2, 0x38bdf8, 320);
    this.level++;
    this.newBoard();
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.timeLeft -= deltaMs / 1000;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      getServices(this).sfx.play('hit');
      flash(this, 0xef4444, 0.3, 300);
      this.finish(
        'O tempo acabou!',
        [`Tabuleiros: ${this.level - 1}`],
        { score: this.score, details: { boards: this.level - 1 } },
        600,
      );
    }
    const b = this.board;
    const n = b.puzzle.n;
    this.statusText.setText(
      `Nível ${this.level} · ${n}×${n} · ⏱ ${Math.ceil(this.timeLeft)}s · ${b.filled}/${n * n}`,
    );
    this.draw();
  }

  private draw(): void {
    const g = this.g.clear();
    const b = this.board;
    const n = b.puzzle.n;
    const cs = BOARD / n;
    const bad = b.conflicts();
    g.fillStyle(0x020617, 1).fillRoundedRect(X0 - 12, Y0 - 12, BOARD + 24, BOARD + 24, 22);
    b.cells.forEach((v, i) => {
      const x = X0 + (i % n) * cs;
      const y = Y0 + Math.floor(i / n) * cs;
      const fill = v === null ? 0x1e293b : v === 0 ? ZERO : ONE;
      g.fillStyle(fill, b.locked(i) ? 1 : 0.85).fillRoundedRect(x + 4, y + 4, cs - 8, cs - 8, 12);
      if (b.locked(i))
        g.lineStyle(3, 0xffffff, 0.5).strokeRoundedRect(x + 4, y + 4, cs - 8, cs - 8, 12);
      if (bad.has(i))
        g.lineStyle(5, 0xef4444, 1).strokeRoundedRect(x + 4, y + 4, cs - 8, cs - 8, 12);
      this.digits[i]!.setText(v === null ? '' : String(v)).setColor(
        b.locked(i) ? '#0b1430' : '#ffffff',
      );
    });
  }
}
