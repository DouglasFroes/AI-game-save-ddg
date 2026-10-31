import type Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { heartsLabel, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { LIVES, MAX_TRIES, TermoRun, WORD_LEN, type Mark } from './core';

const TILE = 92;
const GAP = 10;
const BOARD_X = (GAME_WIDTH - (TILE * WORD_LEN + GAP * (WORD_LEN - 1))) / 2;
const BOARD_Y = 250;
const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', '>ZXCVBNM<'];
const KEY_W = 64;
const KEY_H = 88;
const KEY_GAP = 6;
const KEYS_Y = 930;

const FILL: Record<Mark | 'empty' | 'typed', number> = {
  empty: 0x1f2937,
  typed: 0x374151,
  miss: 0x3f3f46,
  near: 0xeab308,
  hit: 0x22c55e,
};

interface Cell {
  box: Phaser.GameObjects.Rectangle;
  letter: Phaser.GameObjects.Text;
}

/** "Palavra Secreta": endless Wordle in Portuguese; each word solved raises the streak bonus. */
export class TermoScene extends MiniScene {
  private run = new TermoRun();
  private cells: Cell[][] = [];
  private keyBoxes = new Map<string, Phaser.GameObjects.Rectangle>();
  private statusText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private busy = false;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Termo, 'termo', [0x052e16, 0x0b1430]);
  }

  create(): void {
    this.run = new TermoRun();
    this.cells = [];
    this.keyBoxes = new Map();
    this.busy = false;
    this.frame('0');
    this.statusText = addText(this, GAME_WIDTH / 2, 165, '', 28, {
      color: '#bbf7d0',
      stroke: '#052e16',
      strokeThickness: 6,
    }).setDepth(50);
    this.livesText = addText(this, GAME_WIDTH / 2, 210, '', 30).setDepth(50);

    for (let r = 0; r < MAX_TRIES; r++) {
      const row: Cell[] = [];
      for (let c = 0; c < WORD_LEN; c++) {
        const x = BOARD_X + c * (TILE + GAP) + TILE / 2;
        const y = BOARD_Y + r * (TILE + GAP) + TILE / 2;
        const box = this.add
          .rectangle(x, y, TILE, TILE, FILL.empty)
          .setStrokeStyle(3, 0x4b5563)
          .setDepth(5);
        const letter = addText(this, x, y, '', 54, { color: '#ffffff' }).setDepth(6);
        row.push({ box, letter });
      }
      this.cells.push(row);
    }
    this.buildKeyboard();
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') this.press('>');
      else if (e.key === 'Backspace') this.press('<');
      else if (/^[a-zA-Z]$/.test(e.key)) this.press(e.key.toUpperCase());
    });
    this.hintBox = hint(
      this,
      ['Adivinhe a palavra de 5 letras!', 'Verde: lugar certo · Amarelo: está na palavra'],
      1230,
      5000,
    );
    this.refresh();
  }

  private buildKeyboard(): void {
    KEY_ROWS.forEach((row, r) => {
      const widths = [...row].map((k) => (k === '>' || k === '<' ? KEY_W * 1.5 : KEY_W));
      const total = widths.reduce((a, b) => a + b, 0) + KEY_GAP * (row.length - 1);
      let x = (GAME_WIDTH - total) / 2;
      [...row].forEach((k, i) => {
        const w = widths[i]!;
        const y = KEYS_Y + r * (KEY_H + KEY_GAP) + KEY_H / 2;
        const box = this.add
          .rectangle(x + w / 2, y, w, KEY_H, 0x6b7280)
          .setDepth(5)
          .setInteractive({ useHandCursor: true });
        const label = k === '>' ? 'OK' : k === '<' ? '⌫' : k;
        addText(this, x + w / 2, y, label, k === '>' ? 28 : 34, { color: '#ffffff' }).setDepth(6);
        box.on('pointerdown', () => {
          box.setScale(0.92);
          this.press(k);
        });
        box.on('pointerup', () => box.setScale(1));
        box.on('pointerout', () => box.setScale(1));
        if (k !== '>' && k !== '<') this.keyBoxes.set(k, box);
        x += w + KEY_GAP;
      });
    });
  }

  private press(k: string): void {
    if (this.ended || this.busy) return;
    this.hintBox?.dismiss();
    const { sfx } = getServices(this);
    if (k === '<') this.run.erase();
    else if (k === '>') {
      this.submit();
      return;
    } else {
      this.run.type(k);
      sfx.play('click');
    }
    this.refresh();
  }

  private submit(): void {
    const { sfx } = getServices(this);
    const row = this.run.guesses.length;
    const res = this.run.submit();
    if (res.kind === 'short') {
      sfx.play('locked');
      this.shakeRow(row);
      return;
    }
    this.busy = true;
    const guess = this.run.guesses[row]!;
    // Flip the tiles one by one, then react.
    res.marks.forEach((m, c) => {
      const cell = this.cells[row]![c]!;
      cell.letter.setText(guess[c]!);
      this.tweens.add({
        targets: [cell.box, cell.letter],
        scaleY: 0,
        duration: 120,
        delay: c * 130,
        yoyo: true,
        onYoyo: () => {
          cell.box.setFillStyle(FILL[m]).setStrokeStyle(3, FILL[m]);
          sfx.play('tick', c);
        },
      });
    });
    this.time.delayedCall(WORD_LEN * 130 + 200, () => {
      this.busy = false;
      this.refreshKeys();
      if (res.kind === 'solved') {
        sfx.play('win');
        sfx.vibrate([30, 30, 60]);
        banner(this, `+${res.points}`, '#86efac', 560);
        shockwave(this, GAME_WIDTH / 2, BOARD_Y + row * (TILE + GAP) + TILE / 2, 0x22c55e, 220);
        for (let c = 0; c < WORD_LEN; c++) {
          const cell = this.cells[row]![c]!;
          burst(this, cell.box.x, cell.box.y, 0x86efac, 8, { speed: 200 });
          this.tweens.add({
            targets: cell.box,
            y: cell.box.y - 24,
            yoyo: true,
            delay: c * 70,
            duration: 140,
          });
        }
        this.setScore(this.run.score);
        this.busy = true;
        this.time.delayedCall(900, () => this.newWord());
      } else if (res.kind === 'failed') {
        sfx.play('hit');
        flash(this, 0xef4444, 0.3, 300);
        banner(this, res.answer, '#fca5a5', 560);
        if (res.livesLeft <= 0) {
          this.finish(
            'Fim das tentativas!',
            [`Palavras: ${this.run.words} · Maior sequência: ${this.run.bestStreak}`],
            {
              score: this.run.score,
              details: { words: this.run.words, streak: this.run.bestStreak },
            },
            1300,
          );
        } else {
          this.busy = true;
          this.time.delayedCall(1400, () => this.newWord());
        }
      }
      this.refresh();
    });
  }

  private newWord(): void {
    this.busy = false;
    if (this.ended) return;
    this.run.nextWord();
    for (const row of this.cells)
      for (const cell of row) {
        cell.box.setFillStyle(FILL.empty).setStrokeStyle(3, 0x4b5563);
        cell.letter.setText('');
      }
    this.refreshKeys();
    this.refresh();
  }

  private shakeRow(r: number): void {
    const row = this.cells[r];
    if (!row) return;
    for (const cell of row)
      this.tweens.add({
        targets: [cell.box, cell.letter],
        x: '+=14',
        duration: 50,
        yoyo: true,
        repeat: 2,
      });
  }

  private refreshKeys(): void {
    for (const [k, box] of this.keyBoxes) {
      const m = this.run.keys.get(k);
      box.setFillStyle(m ? FILL[m] : 0x6b7280);
    }
  }

  /** Redraws the row being typed and the status line. */
  private refresh(): void {
    const r = this.run.guesses.length;
    const row = this.cells[r];
    if (row && !this.busy)
      row.forEach((cell, c) => {
        const ch = this.run.current[c] ?? '';
        cell.letter.setText(ch);
        cell.box
          .setFillStyle(ch ? FILL.typed : FILL.empty)
          .setStrokeStyle(3, ch ? 0x9ca3af : 0x4b5563);
      });
    const mult = 1 + 0.25 * this.run.streak;
    this.statusText.setText(
      `Palavra ${this.run.words + 1} · 🔥 Sequência ${this.run.streak} · bônus x${mult.toFixed(2)}`,
    );
    this.livesText.setText(heartsLabel(this.run.lives, LIVES));
  }
}
