import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { BALL_R, BALL_X, HelixSim, PERIOD, SECTOR_W } from './core';

/** Screen y where the ball is drawn; the tower scrolls up around it. */
const BALL_SCREEN_Y = 460;
const SLAB_H = 30;

/** "Torre Helix": drag sideways to spin the tower and drop through the gaps. */
export class HelixScene extends MiniScene {
  private sim = new HelixSim();
  private gfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super(SceneKeys.Helix, 'helix', [0x03045e, 0x7b2cbf]);
  }

  create(): void {
    this.sim = new HelixSim();
    this.frame();
    this.gfx = this.add.graphics().setDepth(1);
    addText(this, GAME_WIDTH / 2, 180, 'Arraste para girar a torre', 30, {
      color: '#ffe066',
      stroke: '#0b1430',
    }).setDepth(50);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (p.isDown && !this.ended) this.sim.spin((p.x - p.prevPosition.x) * 1.3);
    });
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const { sfx } = getServices(this);
    const ev = this.sim.step(Math.min(deltaMs, 33) / 1000);
    if (ev.landed) sfx.play('pop', 2);
    if (ev.smashed) {
      sfx.play('win');
      sfx.vibrate(30);
      this.pop(BALL_X, BALL_SCREEN_Y - 80, 'SMASH!', '#ffd23f');
    } else if (ev.passed) {
      sfx.play('star', Math.min(this.sim.streak, 6));
    }
    this.setScore(this.sim.score);
    this.draw();
    if (this.sim.dead) {
      this.finish('Zona vermelha!', [`Andares: ${this.sim.passed}`], {
        score: this.sim.score,
        details: { floors: this.sim.passed },
      });
    }
  }

  private draw(): void {
    const g = this.gfx.clear();
    const { sim } = this;
    // The pole in the middle of the tower.
    g.fillGradientStyle(0x1b1b3a, 0x3a3a6e, 0x1b1b3a, 0x3a3a6e, 1).fillRect(
      BALL_X - 70,
      0,
      140,
      GAME_HEIGHT,
    );
    const offset = BALL_SCREEN_Y - sim.y;
    for (const p of sim.platforms) {
      if (p.broken) continue;
      const y = p.y + offset;
      if (y < -SLAB_H || y > GAME_HEIGHT + SLAB_H) continue;
      p.sectors.forEach((kind, i) => {
        if (kind === 'gap') return;
        const base = (((i * SECTOR_W + sim.rot) % PERIOD) + PERIOD) % PERIOD;
        for (const x of [base, base - PERIOD]) {
          if (x > GAME_WIDTH || x + SECTOR_W < 0) continue;
          const top = kind === 'danger' ? 0xff4d6d : 0x4cc9f0;
          const side = kind === 'danger' ? 0x9d0208 : 0x1d6fa5;
          g.fillStyle(side).fillRect(x, y, SECTOR_W, SLAB_H);
          g.fillStyle(top).fillRect(x, y, SECTOR_W, SLAB_H - 10);
          g.lineStyle(3, 0x0b1430, 0.6).strokeRect(x, y, SECTOR_W, SLAB_H);
        }
      });
    }
    const smash = sim.smashing;
    if (smash) g.fillStyle(0xff7b00, 0.35).fillCircle(BALL_X, BALL_SCREEN_Y, BALL_R + 16);
    g.fillStyle(smash ? 0xff9f1c : 0xffd23f).fillCircle(BALL_X, BALL_SCREEN_Y, BALL_R);
    g.fillStyle(0xffffff, 0.6).fillCircle(BALL_X - 8, BALL_SCREEN_Y - 9, 7);
  }
}
