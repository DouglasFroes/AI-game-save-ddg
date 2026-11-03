import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText, TimeBar } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { boardTime, findWord, generate, lineCells, SIZE, type WordGrid } from './core';

const CELL = 72;
const X0 = (GAME_WIDTH - CELL * SIZE) / 2;
const Y0 = 250;
const HUES = [0xf472b6, 0x60a5fa, 0x34d399, 0xfbbf24, 0xa78bfa, 0xfb923c, 0x22d3ee, 0xf87171];

/** "Caça-Palavras": drag across the letters to find every hidden word before time runs out. */
export class CacaPalavrasScene extends MiniScene {
  private grid!: WordGrid;
  private board = 1;
  private score = 0;
  private wordsFound = 0;
  private found = new Set<number>();
  private timeBar!: TimeBar;
  private timeLeft = 0;
  private dragFrom: number | null = null;
  private dragTo: number | null = null;
  private g!: Phaser.GameObjects.Graphics;
  private letters: Phaser.GameObjects.Text[] = [];
  private wordTexts: Phaser.GameObjects.Text[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.CacaPalavras, 'cacapalavras', [0x14532d, 0x0b1430]);
  }

  create(): void {
    this.board = 1;
    this.score = 0;
    this.wordsFound = 0;
    this.letters = [];
    this.wordTexts = [];
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.statusText = addText(this, GAME_WIDTH / 2, 170, '', 30, {
      color: '#bbf7d0',
      stroke: '#14532d',
      strokeThickness: 6,
    }).setDepth(50);
    this.timeBar = new TimeBar(this, 214);
    for (let i = 0; i < SIZE * SIZE; i++)
      this.letters.push(
        addText(
          this,
          X0 + (i % SIZE) * CELL + CELL / 2,
          Y0 + Math.floor(i / SIZE) * CELL + CELL / 2,
          '',
          40,
          {
            color: '#ffffff',
          },
        ).setDepth(6),
      );
    this.newBoard();
    this.hintBox = hint(
      this,
      ['Arraste da primeira à última letra', 'para marcar cada palavra'],
      1220,
      4500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.ended) return;
      const c = this.cellAt(p.x, p.y);
      if (c === null) return;
      this.hintBox?.dismiss();
      this.dragFrom = c;
      this.dragTo = c;
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.dragFrom === null || !p.isDown) return;
      const c = this.cellAt(p.x, p.y);
      if (c !== null) this.dragTo = c;
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => this.release());
  }

  private newBoard(): void {
    this.grid = generate(this.board);
    this.found = new Set();
    this.timeLeft = boardTime(this.board);
    this.timeBar?.reset(this.timeLeft);
    this.grid.letters.forEach((ch, i) => this.letters[i]!.setText(ch));
    for (const t of this.wordTexts) t.destroy();
    this.wordTexts = this.grid.words.map((w, i) =>
      addText(this, 140 + (i % 3) * 220, 950 + Math.floor(i / 3) * 62, w.word, 32, {
        color: '#ffffff',
        stroke: '#0b1430',
        strokeThickness: 5,
      }).setDepth(6),
    );
  }

  private cellAt(x: number, y: number): number | null {
    const c = Math.floor((x - X0) / CELL);
    const r = Math.floor((y - Y0) / CELL);
    return r < 0 || c < 0 || r >= SIZE || c >= SIZE ? null : r * SIZE + c;
  }

  private release(): void {
    const from = this.dragFrom;
    const to = this.dragTo;
    this.dragFrom = this.dragTo = null;
    if (from === null || to === null || this.ended) return;
    const cells = lineCells(from, to);
    if (!cells || cells.length < 2) return;
    const { sfx } = getServices(this);
    const idx = findWord(this.grid, cells, this.found);
    if (idx < 0) {
      sfx.play('locked');
      return;
    }
    this.found.add(idx);
    this.wordsFound++;
    const pts = 50 + this.board * 10;
    this.score += pts;
    this.setScore(this.score);
    sfx.play('coin', this.found.size);
    const mid = cells[Math.floor(cells.length / 2)]!;
    const mx = X0 + (mid % SIZE) * CELL + CELL / 2;
    const my = Y0 + Math.floor(mid / SIZE) * CELL + CELL / 2;
    burst(this, mx, my, HUES[idx % HUES.length]!, 14, { speed: 240 });
    this.pop(mx, my - 30, `+${pts}`, '#fde047', 34);
    this.wordTexts[idx]!.setColor('#4ade80').setAlpha(0.55);
    if (this.found.size < this.grid.words.length) return;
    const bonus = Math.ceil(this.timeLeft) * 10;
    this.score += bonus;
    this.setScore(this.score);
    sfx.play('win');
    sfx.vibrate([30, 30, 60]);
    banner(this, `QUADRO COMPLETO! +${bonus}`, '#86efac');
    shockwave(this, GAME_WIDTH / 2, Y0 + (CELL * SIZE) / 2, 0x4ade80, 320);
    this.board++;
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
        [`Palavras: ${this.wordsFound} · Quadros: ${this.board - 1}`],
        { score: this.score, details: { words: this.wordsFound, boards: this.board - 1 } },
        600,
      );
    }
    this.timeBar.set(this.timeLeft);
    this.statusText.setText(
      `Quadro ${this.board} · ${this.found.size}/${this.grid.words.length} palavras`,
    );
    this.draw();
  }

  private bar(cells: readonly number[], color: number, alpha: number): void {
    const a = cells[0]!;
    const b = cells[cells.length - 1]!;
    const ax = X0 + (a % SIZE) * CELL + CELL / 2;
    const ay = Y0 + Math.floor(a / SIZE) * CELL + CELL / 2;
    const bx = X0 + (b % SIZE) * CELL + CELL / 2;
    const by = Y0 + Math.floor(b / SIZE) * CELL + CELL / 2;
    this.g.lineStyle(CELL * 0.72, color, alpha).lineBetween(ax, ay, bx, by);
    this.g
      .fillStyle(color, alpha)
      .fillCircle(ax, ay, CELL * 0.36)
      .fillCircle(bx, by, CELL * 0.36);
  }

  private draw(): void {
    const g = this.g.clear();
    g.fillStyle(0x052e16, 1).fillRoundedRect(
      X0 - 12,
      Y0 - 12,
      CELL * SIZE + 24,
      CELL * SIZE + 24,
      22,
    );
    this.grid.words.forEach((w, i) => {
      if (this.found.has(i)) this.bar(w.cells, HUES[i % HUES.length]!, 0.55);
    });
    if (this.dragFrom !== null && this.dragTo !== null) {
      const cells = lineCells(this.dragFrom, this.dragTo);
      if (cells) this.bar(cells, 0xffffff, 0.3);
    }
  }
}
