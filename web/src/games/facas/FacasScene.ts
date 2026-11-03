import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { KnifeSim, TARGET } from './core';

const KNIFE_Y = 1110;

/** "Lança Facas": throw knives at the spinning log — never touch one that is already stuck. */
export class FacasScene extends MiniScene {
  private sim = new KnifeSim();
  private g!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private recoil = 0;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Facas, 'facas', [0x7c2d12, 0x1c0a05]);
  }

  create(): void {
    this.sim = new KnifeSim();
    this.recoil = 0;
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.info = addText(this, GAME_WIDTH / 2, 168, '', 30, {
      color: '#fed7aa',
      stroke: '#1c0a05',
      strokeThickness: 6,
    }).setDepth(50);
    this.hintBox = hint(
      this,
      ['Toque para lançar a faca', 'Não acerte as que já estão fincadas!'],
      1190,
      4500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (!this.ended && p.y > 140) this.throwKnife();
    });
    this.input.keyboard?.on('keydown-SPACE', () => !this.ended && this.throwKnife());
  }

  private throwKnife(): void {
    this.hintBox?.dismiss();
    const { sfx } = getServices(this);
    const stage = this.sim.stage;
    const res = this.sim.throwKnife();
    const hitY = TARGET.y + TARGET.r;
    this.recoil = 14;
    if (res === 'dead') {
      sfx.play('boom');
      flash(this, 0xffffff, 0.4, 200);
      burst(this, TARGET.x, hitY, 0xfacc15, 24, { speed: 380 });
      this.finish(
        'A faca bateu!',
        [`Fase ${stage} · Facas fincadas: ${this.sim.score}`],
        { score: this.sim.score, details: { stage } },
        700,
      );
      return;
    }
    sfx.play('hit');
    burst(this, TARGET.x, hitY, 0xfde68a, 8, { speed: 220 });
    this.setScore(this.sim.score);
    if (res === 'clear') {
      sfx.play('level');
      banner(this, `FASE ${this.sim.stage}!`, '#fde047', 700);
      burst(this, TARGET.x, TARGET.y, 0xfacc15, 30, { speed: 460 });
    }
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.sim.step(Math.min(deltaMs, 33) / 1000);
    this.recoil *= 0.85;
    this.info.setText(`Fase ${this.sim.stage} · Facas: ${this.sim.left}`);
    this.draw();
  }

  private knife(x: number, y: number, dir: number, deep: number): void {
    const g = this.g;
    const cx = Math.cos(dir);
    const cy = Math.sin(dir);
    // The blade first (pointing at the log), then the handle further out.
    g.lineStyle(9, 0xe5e7eb, 1).lineBetween(x - cx * deep, y - cy * deep, x + cx * 44, y + cy * 44);
    g.lineStyle(15, 0x78350f, 1).lineBetween(x + cx * 44, y + cy * 44, x + cx * 104, y + cy * 104);
    g.lineStyle(20, 0xfacc15, 1).lineBetween(x + cx * 42, y + cy * 42, x + cx * 50, y + cy * 50);
  }

  private draw(): void {
    const g = this.g.clear();
    const { x, y, r } = TARGET;
    g.fillStyle(0x000000, 0.3).fillCircle(x + 8, y + 12, r);
    g.fillStyle(0xb45309, 1).fillCircle(x, y, r);
    g.lineStyle(10, 0x78350f, 1).strokeCircle(x, y, r - 5);
    g.lineStyle(5, 0x92400e, 1)
      .strokeCircle(x, y, r * 0.66)
      .strokeCircle(x, y, r * 0.33);
    g.fillStyle(0xfacc15, 1).fillCircle(x, y, 14);
    for (const rel of this.sim.stuck) {
      const a = rel + this.sim.angle;
      this.knife(x + Math.cos(a) * (r - 6), y + Math.sin(a) * (r - 6), a, 30);
    }
    // The knife ready at the bottom, pointing up.
    this.knife(x, KNIFE_Y + this.recoil, -Math.PI / 2, 0);
  }
}
