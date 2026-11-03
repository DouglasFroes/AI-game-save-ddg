import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { hint } from '@/platform/ui/juice';
import { PuzzleScene, TIME_BONUS } from '@/platform/ui/puzzleGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { consistent, describe, generate, NAMES, type Puzzle } from './core';

const Y0 = 290;
const ROW = 118;

type Mark = 0 | 1 | 2; // ? / sincero / mentiroso

/** "Quem Mente?": each suspect says one thing; sincere people tell the truth, liars always lie. */
export class MentiraScene extends PuzzleScene {
  private pz!: Puzzle;
  private marks: Mark[] = [];
  private g!: Phaser.GameObjects.Graphics;
  private rows: Array<{
    name: Phaser.GameObjects.Text;
    say: Phaser.GameObjects.Text;
    mark: Phaser.GameObjects.Text;
  }> = [];
  private msg!: Phaser.GameObjects.Text;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Mentira, 'mentira', [0x9f1239, 0x2a0a14]);
  }

  create(): void {
    this.g = this.add.graphics().setDepth(3);
    this.msg = addText(this, GAME_WIDTH / 2, 1075, '', 30, {
      color: '#fde047',
      stroke: '#2a0a14',
      strokeThickness: 6,
      wrapWidth: 640,
    }).setDepth(30);
    this.begin('#fecdd3', '#2a0a14');
    new Button(this, 360, 1180, 'Verificar', () => this.check(), {
      width: 380,
      height: 96,
      fontSize: 38,
      color: 0x22c55e,
      shade: 0x15803d,
    }).setDepth(20);
    this.hintBox = hint(
      this,
      [
        'Toque numa pessoa: sincera ou mentirosa',
        'Sinceros dizem a verdade; mentirosos sempre mentem',
      ],
      1000,
      6000,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.locked || this.ended) return;
      const i = Math.floor((p.y - (Y0 - ROW / 2)) / ROW);
      if (i < 0 || i >= this.pz.n || p.y > 1040) return;
      this.hintBox?.dismiss();
      this.marks[i] = ((this.marks[i]! + 1) % 3) as Mark;
      getServices(this).sfx.play('tick');
    });
  }

  protected startLevel(): void {
    this.pz = generate(this.level);
    this.marks = this.pz.stmts.map(() => 0 as Mark);
    for (const r of this.rows) [r.name, r.say, r.mark].forEach((t) => t.destroy());
    this.rows = this.pz.stmts.map((st, i) => ({
      name: addText(this, 0, -100, '', 10).setVisible(false),
      say: addText(this, 50, Y0 + i * ROW, `${NAMES[i]}: "${describe(st)}"`, 28, {
        color: '#ffffff',
        stroke: '#2a0a14',
        strokeThickness: 5,
        wrapWidth: 440,
      })
        .setOrigin(0, 0.5)
        .setAlign('left')
        .setDepth(9),
      mark: addText(this, 610, Y0 + i * ROW, '?', 32, {
        color: '#ffffff',
        stroke: '#2a0a14',
        strokeThickness: 6,
      }).setDepth(9),
    }));
    this.msg.setText('');
  }

  private check(): void {
    if (this.locked || this.ended) return;
    const { sfx } = getServices(this);
    if (this.marks.some((m) => m === 0)) {
      sfx.play('locked');
      this.msg.setText('Marque todo mundo antes de verificar.');
      return;
    }
    if (
      consistent(
        this.pz,
        this.marks.map((m) => m === 1),
      )
    ) {
      this.msg.setText('');
      this.solved('DESCOBRIU!');
      return;
    }
    sfx.play('hit');
    this.cameras.main.shake(160, 0.006);
    this.timeLeft = Math.max(1, this.timeLeft - TIME_BONUS / 3);
    this.msg.setText('Tem algo errado… (-10 s)');
  }

  override update(t: number, dt: number): void {
    super.update(t, dt);
    const g = this.g.clear();
    this.rows.forEach((r, i) => {
      const y = Y0 + i * ROW;
      g.fillStyle(0x000000, 0.35).fillRoundedRect(30, y - ROW / 2 + 6, 660, ROW - 12, 22);
      const m = this.marks[i]!;
      g.fillStyle(m === 1 ? 0x16a34a : m === 2 ? 0xdc2626 : 0x475569, 1).fillRoundedRect(
        520,
        y - 38,
        180,
        76,
        18,
      );
      r.mark
        .setText(m === 1 ? 'Sincero' : m === 2 ? 'Mentiroso' : '?')
        .setFontSize(m === 0 ? 40 : 26);
    });
  }
}
