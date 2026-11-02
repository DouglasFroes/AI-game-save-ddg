import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { burst, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  CELLS,
  HAND_LABEL,
  HAND_SHORT,
  LINES,
  POINTS,
  PokerSquares,
  RANK_LABEL,
  SIZE,
  type Card,
} from './core';

const CELL_W = 100;
const CELL_H = 116;
const GAP = 8;
const X0 = 30;
const Y0 = 236;
const STEP_X = CELL_W + GAP;
const STEP_Y = CELL_H + GAP;
const ROW_LABEL_X = 640;
const COL_LABEL_Y = Y0 + SIZE * STEP_Y - GAP + 38;
const NEXT = { x: GAME_WIDTH / 2, y: 1050, w: 150, h: 210 };

const cellX = (c: number) => X0 + c * STEP_X + CELL_W / 2;
const cellY = (r: number) => Y0 + r * STEP_Y + CELL_H / 2;
const isRed = (c: Card) => c.suit === '♥' || c.suit === '♦';

/** "Pôquer": place 25 cards on a 5×5 grid; every row and column scores as a poker hand. */
export class PoquerScene extends MiniScene {
  private table = new PokerSquares();
  private g!: Phaser.GameObjects.Graphics;
  private cellTexts: Phaser.GameObjects.Text[] = [];
  private lineTexts: Phaser.GameObjects.Text[] = [];
  private nextText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Poquer, 'poquer', [0x14532d, 0x052e16]);
  }

  create(): void {
    this.table = new PokerSquares();
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.statusText = addText(this, GAME_WIDTH / 2, 168, '', 28, {
      color: '#dcfce7',
      stroke: '#052e16',
      strokeThickness: 6,
    }).setDepth(50);
    addText(this, GAME_WIDTH / 2, 202, 'Linhas e colunas valem como mãos de pôquer', 22, {
      color: '#bbf7d0',
      weight: 'normal',
    }).setDepth(50);

    this.cellTexts = Array.from({ length: CELLS }, (_, i) =>
      addText(this, cellX(i % SIZE), cellY(Math.floor(i / SIZE)), '', 38).setDepth(6),
    );
    // Rows are labelled on the right, columns underneath.
    this.lineTexts = LINES.map((l) =>
      addText(
        this,
        l.kind === 'row' ? ROW_LABEL_X : cellX(l.index),
        l.kind === 'row' ? cellY(l.index) : COL_LABEL_Y,
        '',
        22,
        { color: '#bbf7d0' },
      ).setDepth(6),
    );
    addText(this, GAME_WIDTH / 2, NEXT.y - NEXT.h / 2 - 28, 'PRÓXIMA CARTA', 22, {
      color: '#bbf7d0',
    }).setDepth(6);
    this.nextText = addText(this, NEXT.x, NEXT.y, '', 64).setDepth(6);

    // The payout table, always in view so the choices make sense.
    addText(
      this,
      GAME_WIDTH / 2,
      1196,
      `Par ${POINTS.pair} · 2 Pares ${POINTS.twoPair} · Trinca ${POINTS.three} · Seq. ${POINTS.straight} · Flush ${POINTS.flush}`,
      21,
      { color: '#fef9c3', weight: 'normal' },
    ).setDepth(6);
    addText(
      this,
      GAME_WIDTH / 2,
      1232,
      `Full ${POINTS.fullHouse} · Quadra ${POINTS.four} · S. Flush ${POINTS.straightFlush} · Royal ${POINTS.royal}`,
      21,
      { color: '#fef9c3', weight: 'normal' },
    ).setDepth(6);

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.tap(p));
    this.refresh();
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.ended || this.table.over) return;
    const dx = p.x - X0;
    const dy = p.y - Y0;
    const col = Math.floor(dx / STEP_X);
    const row = Math.floor(dy / STEP_Y);
    // Taps in the gaps or outside the grid do nothing.
    if (dx < 0 || dy < 0 || col >= SIZE || row >= SIZE) return;
    if (dx - col * STEP_X > CELL_W || dy - row * STEP_Y > CELL_H) return;
    const cell = row * SIZE + col;
    const done = this.table.place(cell);
    if (!done) return;

    const { sfx } = getServices(this);
    sfx.play('draw');
    this.tweens.add({
      targets: this.cellTexts[cell]!,
      scale: { from: 1.4, to: 1 },
      duration: 160,
    });

    for (const s of done) {
      if (s.points <= 0) continue;
      const x = s.line.kind === 'row' ? ROW_LABEL_X : cellX(s.line.index);
      const y = s.line.kind === 'row' ? cellY(s.line.index) : COL_LABEL_Y;
      this.pop(x, y - 30, `+${s.points}`, s.points >= 15 ? '#fde047' : '#86efac', 40);
      sfx.play(s.points >= 15 ? 'win' : 'coin');
      if (s.points >= 15) burst(this, x, y, 0xfde047, 12 + s.points / 4, { speed: 320 });
      if (s.points >= 50) shockwave(this, x, y, 0xfde047, 300);
    }
    this.refresh();

    if (this.table.over) {
      const t = this.table;
      const best = t.best;
      const scoring = t.states().filter((s) => s.points > 0).length;
      this.time.delayedCall(700, () =>
        this.finish(
          t.score >= 100 ? 'Mesa de campeão!' : t.score >= 60 ? 'Ótima mesa!' : 'Fim da partida',
          [`Melhor mão: ${HAND_LABEL[best.name]} (+${best.points}) · ${scoring}/10 linhas`],
          { score: t.score, details: { best: best.points, lines: scoring } },
          300,
        ),
      );
    }
  }

  /** Repaints the grid, the next card and every line label (only changes after a placement). */
  private refresh(): void {
    const t = this.table;
    this.setScore(t.score);
    this.statusText.setText(
      t.over ? 'Mesa completa!' : `Carta ${t.placed + 1} de ${CELLS} · toque numa casa vazia`,
    );

    const g = this.g.clear();
    g.fillStyle(0x052e16, 0.55).fillRoundedRect(
      X0 - 12,
      Y0 - 12,
      SIZE * STEP_X - GAP + 24,
      SIZE * STEP_Y - GAP + 24,
      22,
    );
    for (let i = 0; i < CELLS; i++) {
      const c = t.grid[i];
      const x = X0 + (i % SIZE) * STEP_X;
      const y = Y0 + Math.floor(i / SIZE) * STEP_Y;
      if (!c) {
        g.fillStyle(0x14532d, 0.7).fillRoundedRect(x, y, CELL_W, CELL_H, 12);
        g.lineStyle(3, 0x86efac, 0.35).strokeRoundedRect(x, y, CELL_W, CELL_H, 12);
        this.cellTexts[i]!.setText('');
      } else {
        g.fillStyle(0x000000, 0.3).fillRoundedRect(x + 3, y + 5, CELL_W, CELL_H, 12);
        g.fillStyle(0xffffff, 1).fillRoundedRect(x, y, CELL_W, CELL_H, 12);
        this.cellTexts[i]!.setText(`${RANK_LABEL(c.rank)}\n${c.suit}`).setColor(
          isRed(c) ? '#dc2626' : '#111827',
        );
      }
    }

    const next = t.current;
    if (next) {
      const x = NEXT.x - NEXT.w / 2;
      const y = NEXT.y - NEXT.h / 2;
      g.fillStyle(0x000000, 0.35).fillRoundedRect(x + 6, y + 9, NEXT.w, NEXT.h, 18);
      g.fillStyle(0xffffff, 1).fillRoundedRect(x, y, NEXT.w, NEXT.h, 18);
      g.lineStyle(5, 0xfde047, 1).strokeRoundedRect(x, y, NEXT.w, NEXT.h, 18);
      this.nextText
        .setText(`${RANK_LABEL(next.rank)}\n${next.suit}`)
        .setColor(isRed(next) ? '#dc2626' : '#111827');
      this.tweens.add({ targets: this.nextText, scale: { from: 1.2, to: 1 }, duration: 140 });
    } else this.nextText.setText('');

    t.states().forEach((st, i) => {
      const label = this.lineTexts[i]!;
      if (st.filled === SIZE) {
        label.setText(st.points > 0 ? `${HAND_SHORT[st.name]}\n+${st.points}` : 'Nada\n0');
        label
          .setColor(st.points >= 15 ? '#fde047' : st.points > 0 ? '#86efac' : '#fca5a5')
          .setAlpha(1);
      } else if (st.name !== 'nothing') {
        // A line still open that already holds a match: shown dim, it pays only when full.
        label.setText(HAND_SHORT[st.name]).setColor('#bbf7d0').setAlpha(0.65);
      } else label.setText('');
    });
  }
}
