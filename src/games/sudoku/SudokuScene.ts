import Phaser from 'phaser';
import { COLORS, FONT_FAMILY, GAME_WIDTH, SceneKeys } from '@/config';
import { formatTime } from '@/platform/ranking';
import type { GameOverData } from '@/platform/scenes/GameOverScene';
import { addText, Button, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  box,
  col,
  DIFFICULTIES,
  isComplete,
  makePuzzle,
  PEERS,
  row,
  sudokuScore,
  type Difficulty,
  type Grid,
} from './core';

export interface SudokuData {
  difficulty: Difficulty;
}

const CELL = 76;
const GRID_X = (GAME_WIDTH - CELL * 9) / 2;
const GRID_Y = 210;
const PAD_Y = 1010;
const TOOLS_Y = 1150;

const C = {
  bg: 0xffffff,
  given: '#1d2b53',
  entered: '#2a7ad1',
  wrong: '#e63946',
  peer: 0xe8eefb,
  same: 0xc9dafb,
  selected: 0x9cc2ff,
  thin: 0xb8c4dc,
  thick: 0x1d2b53,
};

export class SudokuScene extends Phaser.Scene {
  private difficulty: Difficulty = 'easy';
  private solution: Grid = [];
  private grid: Grid = [];
  private given: boolean[] = [];
  private notes: Set<number>[] = [];
  private selected = -1;
  private notesMode = false;
  private mistakes = 0;
  private hints = 0;
  private elapsed = 0;
  private finished = false;

  private highlight!: Phaser.GameObjects.Graphics;
  private digits: Phaser.GameObjects.Text[] = [];
  private noteTexts: Phaser.GameObjects.Text[] = [];
  private padButtons: Button[] = [];
  private timerText!: Phaser.GameObjects.Text;
  private mistakesText!: Phaser.GameObjects.Text;
  private notesButton!: Button;

  constructor() {
    super(SceneKeys.Sudoku);
  }

  init(data: SudokuData): void {
    this.difficulty = data.difficulty ?? 'easy';
    const { puzzle, solution } = makePuzzle(this.difficulty);
    this.solution = solution;
    this.grid = [...puzzle];
    this.given = puzzle.map((n) => n !== 0);
    this.notes = Array.from({ length: 81 }, () => new Set<number>());
    this.selected = -1;
    this.notesMode = false;
    this.mistakes = 0;
    this.hints = 0;
    this.elapsed = 0;
    this.finished = false;
    this.digits = [];
    this.noteTexts = [];
    this.padButtons = [];
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0xeef3fb);
    const def = DIFFICULTIES[this.difficulty];

    iconButton(this, 66, 66, '‹', () => this.scene.start(SceneKeys.SudokuMenu));
    addText(this, GAME_WIDTH / 2, 50, `Sudoku · ${def.label}`, 34);
    this.timerText = addText(this, GAME_WIDTH / 2, 100, '0:00', 30, { color: COLORS.textMuted });
    this.mistakesText = addText(this, GAME_WIDTH - 110, 66, '', 28, { color: COLORS.textMuted });

    this.add.rectangle(GRID_X, GRID_Y, CELL * 9, CELL * 9, C.bg).setOrigin(0);
    this.highlight = this.add.graphics();
    this.drawGridLines();

    for (let i = 0; i < 81; i++) {
      const x = GRID_X + col(i) * CELL + CELL / 2;
      const y = GRID_Y + row(i) * CELL + CELL / 2;
      this.digits.push(
        addText(this, x, y + 2, '', 46, { weight: this.given[i] ? 'bold' : 'normal' }),
      );
      this.noteTexts.push(
        this.add
          .text(x, y, '', {
            fontFamily: FONT_FAMILY,
            fontSize: '19px',
            color: '#5b6b8c',
            align: 'center',
            lineSpacing: -3,
            resolution: 2,
          })
          .setOrigin(0.5),
      );
    }

    const zone = this.add
      .zone(GRID_X, GRID_Y, CELL * 9, CELL * 9)
      .setOrigin(0)
      .setInteractive();
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const cx = Math.floor((p.x - GRID_X) / CELL);
      const cy = Math.floor((p.y - GRID_Y) / CELL);
      if (cx >= 0 && cx < 9 && cy >= 0 && cy < 9) this.select(cy * 9 + cx);
    });

    const padW = 74;
    for (let n = 1; n <= 9; n++) {
      this.padButtons.push(
        new Button(
          this,
          GRID_X + (n - 1) * (padW + 2.5) + padW / 2,
          PAD_Y,
          String(n),
          () => this.input_(n),
          {
            width: padW,
            height: 100,
            fontSize: 48,
            color: COLORS.panel,
            shade: 0xc7cfdc,
            textColor: '#2a7ad1',
          },
        ),
      );
    }

    const tool = {
      width: 200,
      height: 92,
      fontSize: 30,
      color: COLORS.secondary,
      shade: COLORS.secondaryDark,
    };
    new Button(this, 140, TOOLS_Y, '⌫ Apagar', () => this.erase(), tool);
    this.notesButton = new Button(this, 360, TOOLS_Y, '✎ Notas', () => this.toggleNotes(), tool);
    const hintButton = new Button(this, 580, TOOLS_Y, '💡 Dica', () => this.hint(), {
      ...tool,
      color: COLORS.primary,
      shade: COLORS.primaryDark,
    });
    if (!def.hints) {
      hintButton.label.setText('💡 Sem dica');
      hintButton.setEnabled(false);
    }

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (/^[1-9]$/.test(e.key)) this.input_(Number(e.key));
      else if (e.key === 'Backspace' || e.key === 'Delete') this.erase();
      else if (e.key.startsWith('Arrow') && this.selected >= 0) {
        const d = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key] ?? 0;
        this.select(Phaser.Math.Clamp(this.selected + d, 0, 80));
      }
    });

    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (this.finished) return;
        this.elapsed++;
        this.timerText.setText(formatTime(this.elapsed));
      },
    });

    this.render();
    if (import.meta.env.DEV) (window as unknown as { __sudoku?: SudokuScene }).__sudoku = this;
  }

  private drawGridLines(): void {
    const g = this.add.graphics();
    for (let i = 0; i <= 9; i++) {
      const thick = i % 3 === 0;
      g.lineStyle(thick ? 5 : 2, thick ? C.thick : C.thin);
      g.lineBetween(GRID_X + i * CELL, GRID_Y, GRID_X + i * CELL, GRID_Y + 9 * CELL);
      g.lineBetween(GRID_X, GRID_Y + i * CELL, GRID_X + 9 * CELL, GRID_Y + i * CELL);
    }
  }

  private select(i: number): void {
    if (this.finished) return;
    this.selected = i;
    this.render();
  }

  private toggleNotes(): void {
    this.notesMode = !this.notesMode;
    this.notesButton.label.setText(this.notesMode ? '✎ Notas ON' : '✎ Notas');
  }

  private input_(n: number): void {
    const i = this.selected;
    if (this.finished || i < 0 || this.given[i] || this.grid[i] === this.solution[i]) return;
    const { sfx } = getServices(this);

    if (this.notesMode) {
      const set = this.notes[i]!;
      if (set.has(n)) set.delete(n);
      else set.add(n);
      sfx.play('click');
      this.render();
      return;
    }

    if (this.solution[i] === n) {
      this.grid[i] = n;
      this.notes[i]!.clear();
      for (const j of PEERS[i]!) this.notes[j]!.delete(n);
      sfx.play('pop');
      this.render();
      this.bump(i);
      if (isComplete(this.grid, this.solution)) this.win();
      return;
    }

    this.mistakes++;
    sfx.play('hit');
    sfx.vibrate(60);
    const t = this.digits[i]!;
    t.setText(String(n)).setColor(C.wrong);
    this.cameras.main.shake(120, 0.004);
    this.time.delayedCall(600, () => this.render());
    this.render(false);
    if (this.mistakes >= DIFFICULTIES[this.difficulty].lives) this.lose();
  }

  private erase(): void {
    const i = this.selected;
    if (this.finished || i < 0 || this.given[i] || this.grid[i] === this.solution[i]) return;
    this.notes[i]!.clear();
    this.render();
  }

  private hint(): void {
    if (this.finished || !DIFFICULTIES[this.difficulty].hints) return;
    let i = this.selected;
    if (i < 0 || this.grid[i] === this.solution[i]) {
      i = this.grid.findIndex((n, k) => n !== this.solution[k]);
      if (i < 0) return;
    }
    this.hints++;
    this.selected = i;
    this.input_(this.solution[i]!);
  }

  private bump(i: number): void {
    const t = this.digits[i]!;
    this.tweens.add({
      targets: t,
      scale: { from: 1.4, to: 1 },
      duration: 220,
      ease: 'Back.easeOut',
    });
  }

  /** Redraws highlights, digits, notes, mistakes and the number pad. */
  private render(updateDigits = true): void {
    const g = this.highlight.clear();
    const sel = this.selected;
    const selValue = sel >= 0 ? this.grid[sel] : 0;
    for (let i = 0; i < 81; i++) {
      let color: number | null = null;
      if (sel >= 0 && (row(i) === row(sel) || col(i) === col(sel) || box(i) === box(sel)))
        color = C.peer;
      if (selValue && this.grid[i] === selValue) color = C.same;
      if (i === sel) color = C.selected;
      if (color !== null)
        g.fillStyle(color).fillRect(GRID_X + col(i) * CELL, GRID_Y + row(i) * CELL, CELL, CELL);
    }

    if (updateDigits) {
      this.grid.forEach((n, i) => {
        this.digits[i]!.setText(n ? String(n) : '').setColor(this.given[i] ? C.given : C.entered);
        const notes = this.notes[i]!;
        this.noteTexts[i]!.setText(
          !n && notes.size
            ? [0, 1, 2]
                .map((r) =>
                  [1, 2, 3].map((c) => (notes.has(r * 3 + c) ? r * 3 + c : ' ')).join(' '),
                )
                .join('\n')
            : '',
        );
      });
    }

    const lives = DIFFICULTIES[this.difficulty].lives;
    this.mistakesText.setText(
      lives === 1 ? `Vidas ${lives - this.mistakes}` : `Erros ${this.mistakes}/${lives}`,
    );
    const counts = new Array(10).fill(0);
    for (const n of this.grid) counts[n]++;
    this.padButtons.forEach((b, k) => b.setEnabled(counts[k + 1] < 9));
  }

  private win(): void {
    this.finished = true;
    this.selected = -1;
    this.render();
    const { sfx } = getServices(this);
    sfx.play('win');
    this.digits.forEach((d, i) =>
      this.tweens.add({
        targets: d,
        scale: { from: 1, to: 1.3 },
        yoyo: true,
        duration: 160,
        delay: (row(i) + col(i)) * 30,
      }),
    );
    const def = DIFFICULTIES[this.difficulty];
    const score = sudokuScore(this.difficulty, this.elapsed, this.mistakes, this.hints);
    this.endWith({
      gameId: 'sudoku',
      title: 'Sudoku resolvido!',
      lines: [
        `${def.label} · ${formatTime(this.elapsed)}`,
        `Erros: ${this.mistakes} · Dicas: ${this.hints}`,
      ],
      record: { score, details: { level: def.level, time: this.elapsed } },
      parent: SceneKeys.Sudoku,
      retry: {
        scene: SceneKeys.Sudoku,
        data: { difficulty: this.difficulty } satisfies SudokuData,
      },
    });
  }

  private lose(): void {
    this.finished = true;
    const oneLife = DIFFICULTIES[this.difficulty].lives === 1;
    this.endWith({
      gameId: 'sudoku',
      title: oneLife ? 'Um erro e acabou!' : 'Três erros!',
      lines: oneLife
        ? ['No Extremo só existe uma vida.', 'Use as notas ✎ e confira antes de jogar.']
        : ['Tente de novo com calma.', 'Use as notas ✎ para marcar opções.'],
      record: null,
      parent: SceneKeys.Sudoku,
      retry: {
        scene: SceneKeys.Sudoku,
        data: { difficulty: this.difficulty } satisfies SudokuData,
      },
    });
  }

  private endWith(data: GameOverData): void {
    this.time.delayedCall(1100, () => this.scene.launch(SceneKeys.GameOver, data));
  }
}
