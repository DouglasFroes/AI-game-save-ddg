import type Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { heartsLabel, MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { INKS, StroopSim, type StroopResult } from './core';

const CX = GAME_WIDTH / 2;

/** "Cor Certa": the word says one color, the paint may say another. */
export class CorCertaScene extends MiniScene {
  private sim = new StroopSim();
  private word!: Phaser.GameObjects.Text;
  private bar!: Phaser.GameObjects.Graphics;
  private hearts!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.CorCerta, 'corcerta', [0x1b1f3b, 0x432371]);
  }

  create(): void {
    this.sim = new StroopSim();
    this.frame();
    addText(this, CX, 250, 'A cor da letra é\no que a palavra diz?', 40, {
      color: '#ffffff',
      stroke: '#0b1430',
    });
    this.add.rectangle(CX, 560, 640, 260, 0x0d1030).setStrokeStyle(6, 0xffffff, 0.25);
    this.word = addText(this, CX, 560, '', 96, { stroke: '#000000', strokeThickness: 4 });
    this.bar = this.add.graphics();
    this.hearts = addText(this, CX, 760, heartsLabel(3), 52);
    const yes = new Button(this, 190, 1010, 'SIM', () => this.answer(true), {
      width: 290,
      height: 170,
      color: COLORS.success,
      shade: COLORS.successDark,
      fontSize: 64,
    });
    const no = new Button(this, 530, 1010, 'NÃO', () => this.answer(false), {
      width: 290,
      height: 170,
      color: COLORS.danger,
      shade: COLORS.dangerDark,
      fontSize: 64,
    });
    yes.setDepth(5);
    no.setDepth(5);
    this.input.keyboard?.on('keydown-LEFT', () => this.answer(true));
    this.input.keyboard?.on('keydown-RIGHT', () => this.answer(false));
    this.show();
  }

  private answer(yes: boolean): void {
    if (this.ended) return;
    this.react(this.sim.answer(yes));
  }

  private react(r: StroopResult): void {
    const { sfx } = getServices(this);
    if (r === 'right') {
      sfx.play('pop', Math.min(this.sim.streak, 8));
      this.setScore(this.sim.score);
    } else {
      sfx.play('hit');
      sfx.vibrate(40);
      this.cameras.main.shake(120, 0.006);
      this.pop(CX, 700, r === 'timeout' ? 'Tempo!' : 'Errou!', '#ff8080');
    }
    this.hearts.setText(heartsLabel(this.sim.lives));
    if (this.sim.dead) {
      const { score, maxStreak } = this.sim;
      this.finish('Acabaram as vidas!', [`Maior sequência: ${maxStreak}`], {
        score,
        details: { streak: maxStreak },
      });
    } else this.show();
  }

  private show(): void {
    const { word, ink } = this.sim.q;
    this.word.setText(INKS[word]!.name);
    this.word.setColor(`#${INKS[ink]!.color.toString(16).padStart(6, '0')}`);
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const r = this.sim.step(Math.min(deltaMs, 50) / 1000);
    if (r) this.react(r);
    const frac = Math.max(0, this.sim.timeLeft / this.sim.limit);
    this.bar
      .clear()
      .fillStyle(0x000000, 0.4)
      .fillRoundedRect(CX - 300, 700, 600, 26, 13)
      .fillStyle(frac > 0.3 ? 0xffd23f : 0xff4d4d)
      .fillRoundedRect(CX - 300, 700, Math.max(26, 600 * frac), 26, 13);
  }
}
