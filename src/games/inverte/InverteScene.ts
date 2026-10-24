import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, flash } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { FlipSim, PLAYER_R, PLAYER_X } from './core';

const FLOOR = 940;
const CEIL = 400;
const SPIKE_H = 84;

/** "Inverte": tap to flip gravity between floor and ceiling. */
export class InverteScene extends MiniScene {
  private sim = new FlipSim();
  private g!: Phaser.GameObjects.Graphics;
  private hint?: Phaser.GameObjects.Text;
  private level = 1;
  private levelText!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Inverte, 'inverte', [0x03045e, 0x0077b6]);
  }

  create(): void {
    this.sim = new FlipSim();
    this.level = 1;
    this.frame();
    this.levelText = addText(this, GAME_WIDTH / 2, 150, '⚡ Velocidade 1', 26, {
      color: '#ffd23f',
      stroke: '#0b1430',
    }).setDepth(50);
    this.g = this.add.graphics();
    this.hint = addText(this, GAME_WIDTH / 2, 680, 'Toque para inverter a gravidade', 38, {
      color: '#ffffff',
      stroke: '#0b1430',
    });
    const tap = () => {
      if (this.ended) return;
      this.hint?.destroy();
      this.hint = undefined;
      this.sim.tap();
      getServices(this).sfx.play('click');
    };
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y > 130) tap();
    });
    this.input.keyboard?.on('keydown-SPACE', tap);
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    if (!this.hint && this.sim.step(Math.min(deltaMs, 50) / 1000)) {
      this.finish('Espetou!', [`Distância: ${this.sim.score} m`], {
        score: this.sim.score,
        details: { seconds: Math.floor(this.sim.time) },
      });
    }
    this.setScore(this.sim.score);
    if (this.sim.level > this.level) {
      this.level = this.sim.level;
      this.levelText.setText(`⚡ Velocidade ${this.level}`);
      banner(this, 'MAIS RÁPIDO!', '#ffd23f', 640);
      flash(this, 0xffd23f, 0.16, 200);
      getServices(this).sfx.play('win');
    }
    this.draw();
  }

  private draw(): void {
    const g = this.g.clear();
    g.fillStyle(0x001d3d)
      .fillRect(0, FLOOR, GAME_WIDTH, 260)
      .fillRect(0, 130, GAME_WIDTH, CEIL - 130);
    // Scrolling stripes sell the speed.
    const off = this.sim.distance % 90;
    g.fillStyle(0xffffff, 0.12);
    for (let x = -off; x < GAME_WIDTH; x += 90) {
      g.fillRect(x, FLOOR, 40, 8).fillRect(x, CEIL - 8, 40, 8);
    }
    for (const s of this.sim.spikes) {
      const count = Math.max(1, Math.round(s.w / 40));
      const step = s.w / count;
      for (let i = 0; i < count; i++) {
        const x = s.x + i * step;
        const base = s.lane === 0 ? FLOOR : CEIL;
        const tip = s.lane === 0 ? FLOOR - SPIKE_H : CEIL + SPIKE_H;
        g.fillStyle(0xff4d6d).fillTriangle(x, base, x + step, base, x + step / 2, tip);
      }
    }
    const y = FLOOR - PLAYER_R - this.sim.p * (FLOOR - CEIL - PLAYER_R * 2);
    g.fillStyle(0x000000, 0.2).fillEllipse(PLAYER_X, this.sim.p < 0.5 ? FLOOR : CEIL, 56, 12);
    g.fillStyle(0xffd23f).fillCircle(PLAYER_X, y, PLAYER_R);
    g.fillStyle(0x000000)
      .fillCircle(PLAYER_X + 8, y - 4, 5)
      .fillCircle(PLAYER_X - 6, y - 4, 5);
  }
}
