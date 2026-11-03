import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import { burst, flash, hint } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { LAVA_Y, REACH, SwingSim } from './core';

const CAM_LEAD = 240;

/** "Pêndulo": swing from hook to hook over the lava. Tap to throw the rope, tap again to let go. */
export class PenduloScene extends MiniScene {
  private sim = new SwingSim();
  private g!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private cam = 0;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Pendulo, 'pendulo', [0x7c2d12, 0x1c1917]);
  }

  create(): void {
    this.sim = new SwingSim();
    this.cam = 0;
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.info = addText(this, GAME_WIDTH / 2, 168, '', 30, {
      color: '#fed7aa',
      stroke: '#1c1917',
      strokeThickness: 6,
    }).setDepth(50);
    this.hintBox = hint(
      this,
      ['Toque para soltar a corda e voar', 'Toque de novo para agarrar o próximo gancho'],
      1190,
      5000,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (!this.ended && p.y > 140) this.tap();
    });
    this.input.keyboard?.on('keydown-SPACE', () => !this.ended && this.tap());
  }

  private tap(): void {
    this.hintBox?.dismiss();
    const { sfx } = getServices(this);
    if (this.sim.hook) {
      this.sim.release();
      sfx.play('bounce');
    } else if (this.sim.grab()) sfx.play('tick');
    else sfx.play('locked');
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const dt = Math.min(deltaMs, 33) / 1000;
    this.sim.step(dt);
    this.cam += (Math.max(0, this.sim.x - CAM_LEAD) - this.cam) * Math.min(1, dt * 8);
    this.setScore(this.sim.score);
    this.info.setText(this.sim.hook ? 'Preso na corda' : 'Voando!');
    this.draw();
    if (!this.sim.alive) {
      const { sfx } = getServices(this);
      sfx.play('boom');
      flash(this, 0xf97316, 0.4, 220);
      burst(this, this.sim.x - this.cam, LAVA_Y, 0xf97316, 28, { speed: 420 });
      this.finish(
        'Caiu na lava!',
        [`Distância: ${this.sim.score} m`],
        { score: this.sim.score, details: { meters: this.sim.score } },
        600,
      );
    }
  }

  private draw(): void {
    const g = this.g.clear();
    const s = this.sim;
    const cam = this.cam;
    // Far stalactites that scroll slowly.
    g.fillStyle(0x292524, 1);
    for (let i = -1; i < 10; i++) {
      const x = i * 120 - ((cam * 0.3) % 120);
      g.fillTriangle(x, 200, x + 90, 200, x + 45, 330 + ((i * 37) % 90));
    }
    g.fillStyle(0x44403c, 1).fillRect(0, 200, GAME_WIDTH, 40);
    for (const h of s.hooks) {
      const x = h.x - cam;
      if (x < -60 || x > GAME_WIDTH + 60) continue;
      const near =
        !s.hook && h.x > s.x + 40 && h.y < s.y - 80 && Math.hypot(h.x - s.x, h.y - s.y) < REACH;
      g.lineStyle(6, 0x78716c, 1).lineBetween(x, 240, x, h.y);
      g.fillStyle(near ? 0xfde047 : 0xd6d3d1, 1).fillCircle(x, h.y, near ? 18 : 14);
    }
    if (s.hook) {
      g.lineStyle(6, 0xfef3c7, 1).lineBetween(s.hook.x - cam, s.hook.y, s.x - cam, s.y);
    }
    g.fillStyle(0x000000, 0.3).fillCircle(s.x - cam + 3, s.y + 5, 24);
    g.fillStyle(0x38bdf8, 1).fillCircle(s.x - cam, s.y, 24);
    g.fillStyle(0xffffff, 1).fillCircle(s.x - cam + 7, s.y - 5, 7);
    g.fillStyle(0x111827, 1).fillCircle(s.x - cam + 9, s.y - 5, 3);
    // Lava with moving waves.
    g.fillStyle(0xea580c, 1).fillRect(0, LAVA_Y, GAME_WIDTH, GAME_HEIGHT - LAVA_Y);
    g.fillStyle(0xfb923c, 1);
    for (let x = 0; x <= GAME_WIDTH; x += 40) {
      g.fillCircle(x, LAVA_Y + Math.sin((x + cam * 0.8) / 50 + s.t * 3) * 8, 26);
    }
  }
}
