import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { BOTTOM_LIMIT, CaveSim, COL_W, PLAYER_X, TOP_LIMIT } from './core';

/** "Balão": press and hold to float up through the narrowing cave. */
export class BalaoScene extends MiniScene {
  private sim = new CaveSim();
  private g!: Phaser.GameObjects.Graphics;
  private balloon!: Phaser.GameObjects.Text;
  private hint?: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Balao, 'balao', [0x370617, 0x6a040f]);
  }

  create(): void {
    this.sim = new CaveSim();
    this.frame();
    this.g = this.add.graphics();
    this.balloon = emojiText(this, PLAYER_X, this.sim.y, '🎈', 64).setDepth(5);
    this.hint = addText(this, GAME_WIDTH / 2, 1120, 'Segure para subir, solte para descer', 36, {
      color: '#ffffff',
      stroke: '#0b1430',
    });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y < 130) return;
      this.hint?.destroy();
      this.hint = undefined;
      this.sim.holding = true;
    });
    const up = () => (this.sim.holding = false);
    this.input.on(Phaser.Input.Events.POINTER_UP, up);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, up);
    this.input.keyboard?.on('keydown-SPACE', () => (this.sim.holding = true));
    this.input.keyboard?.on('keyup-SPACE', up);
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    // The balloon floats in place until the first touch.
    if (!this.hint && this.sim.step(Math.min(deltaMs, 50) / 1000)) {
      getServices(this).sfx.play('hit');
      this.finish('Estourou!', [`Distância: ${this.sim.score} m`], {
        score: this.sim.score,
        details: { seconds: Math.floor(this.sim.time) },
      });
    }
    this.setScore(this.sim.score);
    this.balloon.setPosition(PLAYER_X, this.sim.y).setAngle(this.sim.vy * 0.03);
    this.draw();
  }

  private draw(): void {
    const g = this.g.clear();
    const x0 = -this.sim.frac;
    g.fillStyle(0x1b0a14);
    g.fillRect(0, 130, GAME_WIDTH, BOTTOM_LIMIT - TOP_LIMIT + 90).fillStyle(0x4a1c2c);
    // Walls: one rectangle per column (top and bottom), cheap and crisp.
    this.sim.cols.forEach((c, i) => {
      const x = x0 + i * COL_W;
      g.fillStyle(i % 2 ? 0x7a2e45 : 0x6d2840).fillRect(x, 130, COL_W + 1, c.top - 130);
      g.fillRect(x, c.bottom, COL_W + 1, 1280 - c.bottom);
    });
  }
}
