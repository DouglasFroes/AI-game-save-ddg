import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, flash, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText, TimeBar } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { boardPoints, generate, timeBonus, type SlideBoard } from './core';

const BOARD = 620;
const X0 = (GAME_WIDTH - BOARD) / 2;
const Y0 = 340;
const START_TIME = 60;
const COLORS = [0x6366f1, 0x8b5cf6, 0xec4899, 0xf97316, 0x14b8a6];

/** "Quebra-Cabeça Deslizante": slide the tiles back into order before the clock runs out. */
export class DeslizanteScene extends MiniScene {
  private board!: SlideBoard;
  private level = 1;
  private score = 0;
  private timeBar!: TimeBar;
  private timeLeft = START_TIME;
  private g!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Deslizante, 'deslizante', [0x1e1b4b, 0x0b1430]);
  }

  create(): void {
    this.level = 1;
    this.score = 0;
    this.timeLeft = START_TIME;
    this.labels = [];
    this.frame('0');
    this.g = this.add.graphics().setDepth(5);
    this.statusText = addText(this, GAME_WIDTH / 2, 170, '', 30, {
      color: '#c7d2fe',
      stroke: '#1e1b4b',
      strokeThickness: 6,
    }).setDepth(50);
    this.timeBar = new TimeBar(this, 214);
    this.loadLevel();
    this.hintBox = hint(
      this,
      ['Toque numa peça da linha ou coluna do vazio', 'Coloque tudo em ordem: 1, 2, 3…'],
      1100,
      4500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) =>
      this.tap(p.x, p.y),
    );
  }

  private loadLevel(): void {
    this.board = generate(this.level);
    for (const t of this.labels) t.destroy();
    this.labels = this.board.tiles.map(() =>
      addText(this, 0, 0, '', this.board.n === 3 ? 72 : this.board.n === 4 ? 58 : 46, {
        color: '#ffffff',
        stroke: '#0b1430',
        strokeThickness: 6,
      }).setDepth(7),
    );
  }

  private tap(x: number, y: number): void {
    if (this.ended) return;
    const n = this.board.n;
    const cs = BOARD / n;
    const c = Math.floor((x - X0) / cs);
    const r = Math.floor((y - Y0) / cs);
    if (r < 0 || c < 0 || r >= n || c >= n) return;
    this.hintBox?.dismiss();
    const { sfx } = getServices(this);
    if (!this.board.tap(r * n + c)) {
      sfx.play('locked');
      return;
    }
    sfx.play('tick', this.board.placed % 8);
    if (!this.board.solved) return;
    const pts = boardPoints(this.level, this.board);
    this.score += pts;
    this.timeLeft += timeBonus(n);
    this.setScore(this.score);
    sfx.play('win');
    sfx.vibrate([30, 30, 60]);
    banner(this, `+${pts}`, '#86efac');
    this.pop(GAME_WIDTH / 2, 1060, `+${timeBonus(n)}s`, '#a5f3fc', 40);
    shockwave(this, GAME_WIDTH / 2, Y0 + BOARD / 2, 0xa5b4fc, 320);
    this.level++;
    this.loadLevel();
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
        [`Quebra-cabeças: ${this.level - 1}`],
        { score: this.score, details: { boards: this.level - 1, size: this.board.n } },
        600,
      );
    }
    const b = this.board;
    this.timeBar.set(this.timeLeft);
    this.statusText.setText(`Nível ${this.level} · ${b.n}×${b.n} · Movimentos ${b.moves}`);
    this.draw();
  }

  private draw(): void {
    const g = this.g.clear();
    const b = this.board;
    const n = b.n;
    const cs = BOARD / n;
    g.fillStyle(0x020617, 1).fillRoundedRect(X0 - 14, Y0 - 14, BOARD + 28, BOARD + 28, 24);
    b.tiles.forEach((t, i) => {
      const label = this.labels[i]!;
      const x = X0 + (i % n) * cs;
      const y = Y0 + Math.floor(i / n) * cs;
      label.setText(t ? String(t) : '').setPosition(x + cs / 2, y + cs / 2);
      if (!t) return;
      // Colour by the tile's home row: a solved board reads as clean stripes.
      const color = COLORS[Math.floor((t - 1) / n) % COLORS.length]!;
      const home = t === i + 1;
      g.fillStyle(0x000000, 0.35).fillRoundedRect(x + 8, y + 12, cs - 12, cs - 12, 16);
      g.fillStyle(color, 1).fillRoundedRect(x + 5, y + 5, cs - 10, cs - 10, 16);
      g.fillStyle(0xffffff, 0.2).fillRoundedRect(x + 12, y + 10, cs - 24, (cs - 20) / 3, 10);
      if (home) g.lineStyle(4, 0xfde047, 0.9).strokeRoundedRect(x + 5, y + 5, cs - 10, cs - 10, 16);
    });
  }
}
