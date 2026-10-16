import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { SimonSim } from './core';

const PAD = 300;
const GAP = 24;
const COLORS = [0xff4d6d, 0x4da3ff, 0x5bd46f, 0xffd23f];
const PAD_SIZE = PAD;
const ORIGIN_X = (GAME_WIDTH - (PAD * 2 + GAP)) / 2;
const ORIGIN_Y = 430;

/** "Sequência": a memory game with four glowing pads. */
export class SequenciaScene extends MiniScene {
  private sim = new SimonSim();
  private pads: Phaser.GameObjects.Rectangle[] = [];
  private status!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Sequencia, 'sequencia', [0x240046, 0x3c096c]);
  }

  create(): void {
    this.sim = new SimonSim();
    this.frame();
    this.status = addText(this, GAME_WIDTH / 2, 280, '', 44, {
      color: '#ffffff',
      stroke: '#0b1430',
    });
    this.pads = COLORS.map((c, i) => {
      const x = ORIGIN_X + (i % 2) * (PAD + GAP) + PAD / 2;
      const y = ORIGIN_Y + Math.floor(i / 2) * (PAD + GAP) + PAD / 2;
      const r = this.add.rectangle(x, y, PAD_SIZE, PAD_SIZE, c, 0.45).setInteractive();
      r.setStrokeStyle(8, 0xffffff, 0.35);
      r.on(Phaser.Input.Events.POINTER_DOWN, () => this.press(i));
      return r;
    });
    this.time.delayedCall(700, () => this.playBack());
  }

  private light(i: number, ms = 280): void {
    const pad = this.pads[i]!;
    pad.setFillStyle(COLORS[i]!, 1);
    getServices(this).sfx.play('pop', i * 2);
    this.tweens.add({ targets: pad, scale: { from: 1.06, to: 1 }, duration: ms });
    this.time.delayedCall(ms, () => pad.setFillStyle(COLORS[i]!, 0.45));
  }

  private playBack(): void {
    if (this.ended) return;
    this.status.setText('Observe…');
    const step = Math.max(300, 620 - this.sim.seq.length * 22);
    this.sim.seq.forEach((p, n) =>
      this.time.delayedCall(n * step, () => this.light(p, step * 0.7)),
    );
    this.time.delayedCall(this.sim.seq.length * step + 100, () => {
      this.sim.doneShowing();
      if (!this.ended) this.status.setText('Sua vez!');
    });
  }

  private press(i: number): void {
    if (this.ended || this.sim.phase !== 'input') return;
    this.light(i, 180);
    const r = this.sim.press(i);
    if (r === 'round') {
      this.setScore(this.sim.score);
      getServices(this).sfx.play('win');
      this.pop(GAME_WIDTH / 2, 380, 'Muito bem!', '#ffe066');
      this.time.delayedCall(800, () => this.playBack());
    } else if (r === 'fail') {
      const { score } = this.sim;
      this.finish('Errou a ordem!', [`Rodadas: ${score}`], {
        score,
        details: { length: score + 1 },
      });
    }
  }
}
