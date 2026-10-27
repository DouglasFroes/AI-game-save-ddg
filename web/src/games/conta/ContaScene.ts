import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { MathSim } from './core';

const CX = GAME_WIDTH / 2;
const BTN_COLORS = [
  [0xff7b54, 0xc4562f],
  [0x4da3ff, 0x2a7ad1],
  [0x5bd46f, 0x35a249],
] as const;

/** "Conta Rápida": pick the right result before the clock runs out. */
export class ContaScene extends MiniScene {
  private sim = new MathSim();
  private question!: Phaser.GameObjects.Text;
  private buttons: Button[] = [];
  private bar!: Phaser.GameObjects.Graphics;

  constructor() {
    super(SceneKeys.Conta, 'conta', [0x0f4c5c, 0x5f0f40]);
  }

  create(): void {
    this.sim = new MathSim();
    this.frame();
    this.bar = this.add.graphics();
    this.add.rectangle(CX, 420, 600, 220, 0x0d1030, 0.6).setStrokeStyle(6, 0xffffff, 0.25);
    this.question = addText(this, CX, 420, '', 110, { color: '#ffffff', stroke: '#0b1430' });
    this.buttons = [0, 1, 2].map((i) => {
      const [color, shade] = BTN_COLORS[i]!;
      return new Button(this, CX, 700 + i * 190, '', () => this.pick(i), {
        width: 560,
        height: 150,
        color,
        shade,
        fontSize: 76,
      });
    });
    ['ONE', 'TWO', 'THREE'].forEach((k, i) =>
      this.input.keyboard?.on(`keydown-${k}`, () => this.pick(i)),
    );
    this.show();
  }

  private pick(i: number): void {
    if (this.ended) return;
    const { sfx } = getServices(this);
    if (this.sim.answer(i)) {
      sfx.play('pop', Math.min(this.sim.streak, 8));
      this.setScore(this.sim.score);
    } else {
      sfx.play('hit');
      sfx.vibrate(40);
      this.pop(CX, 300, '-2s', '#ff8080');
    }
    this.show();
  }

  private show(): void {
    this.question.setText(this.sim.q.text);
    this.buttons.forEach((b, i) => b.label.setText(String(this.sim.q.choices[i])));
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.sim.step(Math.min(deltaMs, 50) / 1000);
    const frac = Phaser.Math.Clamp(this.sim.time / 10, 0, 1);
    this.bar
      .clear()
      .fillStyle(0x000000, 0.4)
      .fillRoundedRect(CX - 300, 190, 600, 26, 13)
      .fillStyle(frac > 0.3 ? 0xffd23f : 0xff4d4d)
      .fillRoundedRect(CX - 300, 190, Math.max(26, 600 * frac), 26, 13);
    if (this.sim.dead) {
      const { score, maxStreak } = this.sim;
      this.finish('Acabou o tempo!', [`Maior sequência: ${maxStreak}`], {
        score,
        details: { streak: maxStreak },
      });
    }
  }
}
