import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { RopeSim } from './core';

const GROUND = 1000;
const HAND_Y = 880;
const HAND_L = 250;
const HAND_R = 470;

/** "Pular Corda": jump just as the rope sweeps the ground. It keeps changing speed. */
export class CordaScene extends MiniScene {
  private sim = new RopeSim();
  private g!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private kid!: Phaser.GameObjects.Text;
  private lastMilestone = 0;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Corda, 'corda', [0x0f766e, 0x042f2e]);
  }

  create(): void {
    this.sim = new RopeSim();
    this.lastMilestone = 0;
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.kid = emojiText(this, GAME_WIDTH / 2, GROUND - 60, '🧒', 120).setDepth(6);
    this.info = addText(this, GAME_WIDTH / 2, 168, '', 28, {
      color: '#99f6e4',
      stroke: '#042f2e',
      strokeThickness: 6,
    }).setDepth(50);
    this.hintBox = hint(
      this,
      ['Toque para pular', 'Pule quando a corda passar pelo chão!'],
      1190,
      4500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (!this.ended && p.y > 140) this.jump();
    });
    this.input.keyboard?.on('keydown-SPACE', () => !this.ended && this.jump());
  }

  private jump(): void {
    this.hintBox?.dismiss();
    if (this.sim.jump()) getServices(this).sfx.play('bounce');
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.sim.step(Math.min(deltaMs, 33) / 1000);
    const { sfx } = getServices(this);
    if (this.sim.passed) {
      sfx.play('tick');
      burst(this, GAME_WIDTH / 2, GROUND, 0x5eead4, 6, { speed: 200 });
      const m = Math.floor(this.sim.jumps / 25);
      if (m > this.lastMilestone) {
        this.lastMilestone = m;
        banner(this, `${m * 25} PULOS!`, '#99f6e4', 600);
        sfx.play('level');
      }
    }
    this.setScore(this.sim.score);
    this.info.setText(`Velocidade ${Math.round((1.3 / this.sim.period) * 100)}%`);
    this.kid.setY(GROUND - 60 - this.sim.y);
    this.draw();
    if (!this.sim.alive) {
      sfx.play('boom');
      flash(this, 0xffffff, 0.35, 180);
      burst(this, GAME_WIDTH / 2, GROUND, 0xf97316, 16, { speed: 320 });
      this.finish(
        'Tropeçou!',
        [`Pulos seguidos: ${this.sim.jumps}`],
        { score: this.sim.jumps, details: { jumps: this.sim.jumps } },
        600,
      );
    }
  }

  private draw(): void {
    const g = this.g.clear();
    g.fillStyle(0x134e4a, 1).fillRect(0, GROUND, GAME_WIDTH, 400);
    g.fillStyle(0x2dd4bf, 1).fillRect(0, GROUND, GAME_WIDTH, 10);
    // The rope is a bow between the two handles; its middle swings between the ground and overhead.
    const mid = 800 + 215 * Math.cos(this.sim.theta);
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      pts.push({
        x: HAND_L - 40 + (HAND_R - HAND_L + 80) * u,
        y: HAND_Y + (mid - HAND_Y) * Math.sin(Math.PI * u),
      });
    }
    g.lineStyle(10, 0xfbbf24, 1).strokePoints(pts, false);
    g.fillStyle(0xb45309, 1)
      .fillCircle(HAND_L - 40, HAND_Y, 18)
      .fillCircle(HAND_R + 40, HAND_Y, 18);
    g.fillStyle(0x000000, 0.25).fillEllipse(
      GAME_WIDTH / 2,
      GROUND + 6,
      100 - this.sim.y * 0.12,
      20,
    );
  }
}
