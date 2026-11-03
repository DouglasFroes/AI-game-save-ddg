import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { burst, flash, hint } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { CEIL, FLOOR, GravitySim, RUNNER_X, SPIKE_H, SPIKE_W } from './core';

/** "Gravidade": tap to flip gravity and dodge the spikes on the floor and ceiling. */
export class GravidadeScene extends MiniScene {
  private sim = new GravitySim();
  private g!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private runner!: Phaser.GameObjects.Text;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Gravidade, 'gravidade', [0x4c1d95, 0x0f0720]);
  }

  create(): void {
    this.sim = new GravitySim();
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.runner = emojiText(this, RUNNER_X, FLOOR, '🤖', 64).setDepth(6);
    this.info = addText(this, GAME_WIDTH / 2, 168, '', 28, {
      color: '#ddd6fe',
      stroke: '#0f0720',
      strokeThickness: 6,
    }).setDepth(50);
    this.hintBox = hint(
      this,
      ['Toque para inverter a gravidade', 'Fuja dos espinhos!'],
      1190,
      4500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (!this.ended && p.y > 140) this.flipNow();
    });
    this.input.keyboard?.on('keydown-SPACE', () => !this.ended && this.flipNow());
  }

  private flipNow(): void {
    this.hintBox?.dismiss();
    getServices(this).sfx.play('tick');
    this.sim.flip();
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const before = this.sim.score;
    this.sim.step(Math.min(deltaMs, 33) / 1000);
    if (this.sim.score !== before) {
      this.setScore(this.sim.score);
      getServices(this).sfx.play('pop');
    }
    this.runner.setPosition(RUNNER_X, this.sim.y).setFlipY(this.sim.side === -1);
    this.info.setText(`Velocidade ${Math.round(this.sim.speed() / 10)} km/h`);
    this.draw();
    if (!this.sim.alive) {
      getServices(this).sfx.play('boom');
      flash(this, 0xffffff, 0.4, 200);
      burst(this, RUNNER_X, this.sim.y, 0xa78bfa, 26, { speed: 420 });
      this.runner.setVisible(false);
      this.finish(
        'Espetou!',
        [`Espinhos vencidos: ${this.sim.score}`],
        { score: this.sim.score, details: { spikes: this.sim.score } },
        700,
      );
    }
  }

  private draw(): void {
    const g = this.g.clear();
    g.fillStyle(0x1e1b4b, 1).fillRect(0, CEIL, GAME_WIDTH, FLOOR - CEIL);
    g.fillStyle(0x6d28d9, 1)
      .fillRect(0, CEIL - 24, GAME_WIDTH, 24)
      .fillRect(0, FLOOR, GAME_WIDTH, 24);
    // Speed lines.
    const off = (this.sim.t * this.sim.speed() * 0.5) % 240;
    g.lineStyle(4, 0x4c1d95, 0.7);
    for (let i = 0; i < 4; i++) {
      const x = ((i * 240 - off) % 960) - 120;
      g.lineBetween(x, 640, x + 90, 640).lineBetween(x + 60, 800, x + 160, 800);
    }
    for (const s of this.sim.spikes) {
      const teeth = 2;
      const w = SPIKE_W / teeth;
      for (let i = 0; i < teeth; i++) {
        const x0 = s.x - SPIKE_W / 2 + i * w;
        if (s.side === 1)
          g.fillStyle(0xf43f5e, 1).fillTriangle(
            x0,
            FLOOR,
            x0 + w,
            FLOOR,
            x0 + w / 2,
            FLOOR - SPIKE_H,
          );
        else
          g.fillStyle(0xf43f5e, 1).fillTriangle(x0, CEIL, x0 + w, CEIL, x0 + w / 2, CEIL + SPIKE_H);
      }
    }
  }
}
