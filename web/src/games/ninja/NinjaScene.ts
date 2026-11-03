import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { LEFT_X, NINJA_Y, NinjaSim, RIGHT_X } from './core';

const WALL_W = 70;

/** "Ninja": leap between two walls while spikes and shurikens rush past. */
export class NinjaScene extends MiniScene {
  private sim = new NinjaSim();
  private g!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private me!: Phaser.GameObjects.Text;
  private lastMilestone = 0;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Ninja, 'ninja', [0x1e293b, 0x020617]);
  }

  create(): void {
    this.sim = new NinjaSim();
    this.lastMilestone = 0;
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.me = emojiText(this, LEFT_X, NINJA_Y, '🥷', 80).setDepth(8);
    this.info = addText(this, GAME_WIDTH / 2, 168, '', 28, {
      color: '#cbd5e1',
      stroke: '#020617',
      strokeThickness: 6,
    }).setDepth(50);
    this.hintBox = hint(
      this,
      ['Toque para pular para o outro lado', 'Fuja dos espinhos e das shurikens!'],
      1190,
      4500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (!this.ended && p.y > 140) this.leap();
    });
    this.input.keyboard?.on('keydown-SPACE', () => !this.ended && this.leap());
  }

  private leap(): void {
    this.hintBox?.dismiss();
    if (this.sim.tap()) getServices(this).sfx.play('bounce');
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.sim.step(Math.min(deltaMs, 33) / 1000);
    this.setScore(this.sim.score);
    const m = Math.floor(this.sim.score / 100);
    if (m > this.lastMilestone) {
      this.lastMilestone = m;
      banner(this, `${m * 100}!`, '#e2e8f0', 500);
      getServices(this).sfx.play('level');
    }
    this.info.setText(`Velocidade ${Math.round((this.sim.speed / 360) * 100)}%`);
    this.me.setPosition(this.sim.x(), NINJA_Y);
    this.me.setFlipX(this.sim.side === 1 ? this.sim.cross === null : this.sim.cross !== null);
    this.me.setAngle(
      this.sim.cross === null ? 0 : this.sim.cross * 360 * (this.sim.side === 0 ? 1 : -1),
    );
    this.draw();
    if (!this.sim.alive) {
      const { sfx } = getServices(this);
      sfx.play('boom');
      flash(this, 0xffffff, 0.4, 200);
      burst(this, this.sim.x(), NINJA_Y, 0x94a3b8, 24, { speed: 400 });
      this.me.setVisible(false);
      this.finish(
        'Ai!',
        [`Distância: ${this.sim.score}`],
        { score: this.sim.score, details: {} },
        600,
      );
    }
  }

  private draw(): void {
    const g = this.g.clear();
    const s = this.sim;
    // Walls with moving bricks to give a feeling of speed.
    g.fillStyle(0x334155, 1)
      .fillRect(LEFT_X - WALL_W, 200, WALL_W, GAME_HEIGHT - 200)
      .fillRect(RIGHT_X, 200, WALL_W, GAME_HEIGHT - 200);
    g.lineStyle(4, 0x1e293b, 1);
    const off = s.dist % 90;
    for (let y = 200 - 90 + off; y < GAME_HEIGHT; y += 90) {
      g.lineBetween(LEFT_X - WALL_W, y, LEFT_X, y).lineBetween(RIGHT_X, y, RIGHT_X + WALL_W, y);
    }
    for (const h of s.hazards) {
      const y = s.screenY(h);
      if (y < 190 || y > GAME_HEIGHT + 60) continue;
      if (h.kind === 'spike') {
        const left = h.side === 0;
        const x0 = left ? LEFT_X : RIGHT_X;
        const dir = left ? 1 : -1;
        g.fillStyle(0xe2e8f0, 1).fillTriangle(x0, y - 44, x0, y + 44, x0 + dir * 78, y);
        g.lineStyle(4, 0xef4444, 1).strokeTriangle(x0, y - 44, x0, y + 44, x0 + dir * 78, y);
      } else {
        const x = (LEFT_X + RIGHT_X) / 2;
        const a = s.t * 12;
        g.fillStyle(0xcbd5e1, 1);
        for (let k = 0; k < 4; k++) {
          const b = a + (k * Math.PI) / 2;
          g.fillTriangle(
            x + Math.cos(b) * 12,
            y + Math.sin(b) * 12,
            x + Math.cos(b + 0.5) * 34,
            y + Math.sin(b + 0.5) * 34,
            x + Math.cos(b - 0.5) * 34,
            y + Math.sin(b - 0.5) * 34,
          );
        }
        g.fillStyle(0x0f172a, 1).fillCircle(x, y, 8);
      }
    }
  }
}
