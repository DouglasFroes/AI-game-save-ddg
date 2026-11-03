import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { CENTER, SumoSim } from './core';

/** "Sumô": swipe to dash and shove rivals off the shrinking ring. */
export class SumoScene extends MiniScene {
  private sim = new SumoSim();
  private g!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private down: { x: number; y: number } | null = null;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Sumo, 'sumo', [0x9d174d, 0x2e1065]);
  }

  create(): void {
    this.sim = new SumoSim();
    this.down = null;
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.info = addText(this, GAME_WIDTH / 2, 168, '', 30, {
      color: '#fbcfe8',
      stroke: '#2e1065',
      strokeThickness: 6,
    }).setDepth(50);
    this.hintBox = hint(
      this,
      ['Deslize o dedo para investir', 'Empurre todos para fora do ringue!'],
      1190,
      4500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (!this.ended && p.y > 140) this.down = { x: p.x, y: p.y };
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      const d = this.down;
      this.down = null;
      if (!d || this.ended) return;
      this.hintBox?.dismiss();
      let dx = p.x - d.x;
      let dy = p.y - d.y;
      // A tap dashes toward the tapped spot.
      if (Math.hypot(dx, dy) < 30) {
        dx = p.x - this.sim.player.x;
        dy = p.y - this.sim.player.y;
      }
      if (this.sim.dash(dx, dy)) getServices(this).sfx.play('bounce');
    });
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const { sfx } = getServices(this);
    const before = this.sim.knocked;
    const wave = this.sim.wave;
    this.sim.step(Math.min(deltaMs, 33) / 1000);
    if (this.sim.knocked > before) {
      sfx.play('coin');
      this.pop(CENTER.x, 460, 'FORA!', '#fde047', 56);
      flash(this, 0xffffff, 0.15, 120);
    }
    if (this.sim.wave > wave) {
      sfx.play('level');
      banner(this, `ONDA ${this.sim.wave}`, '#fbcfe8', 800);
    }
    this.setScore(this.sim.score);
    this.info.setText(
      `Onda ${this.sim.wave} · Rivais: ${this.sim.enemies.filter((e) => e.alive).length}`,
    );
    this.draw();
    if (!this.sim.alive) {
      const p = this.sim.player;
      sfx.play('boom');
      burst(this, p.x, p.y, 0x38bdf8, 24, { speed: 380 });
      this.finish(
        'Você caiu do ringue!',
        [`Onda ${this.sim.wave} · Derrubados: ${this.sim.knocked}`],
        { score: this.sim.score, details: { wave: this.sim.wave, knocked: this.sim.knocked } },
        600,
      );
    }
  }

  private draw(): void {
    const g = this.g.clear();
    const s = this.sim;
    g.fillStyle(0x000000, 0.35).fillCircle(CENTER.x + 8, CENTER.y + 14, 345);
    g.fillStyle(0x7f1d1d, 1).fillCircle(CENTER.x, CENTER.y, s.ring + 14);
    g.fillStyle(0xfde68a, 1).fillCircle(CENTER.x, CENTER.y, s.ring);
    g.lineStyle(6, 0xb45309, 1).strokeCircle(CENTER.x, CENTER.y, s.ring * 0.5);
    for (const e of s.enemies) {
      if (!e.alive) continue;
      g.fillStyle(0x000000, 0.3).fillCircle(e.x + 4, e.y + 6, e.r);
      g.fillStyle(0xec4899, 1).fillCircle(e.x, e.y, e.r);
      g.fillStyle(0xffffff, 1)
        .fillCircle(e.x - 10, e.y - 6, 7)
        .fillCircle(e.x + 10, e.y - 6, 7);
      g.fillStyle(0x111827, 1)
        .fillCircle(e.x - 10, e.y - 6, 3)
        .fillCircle(e.x + 10, e.y - 6, 3);
    }
    const p = s.player;
    g.fillStyle(0x000000, 0.3).fillCircle(p.x + 4, p.y + 6, p.r);
    g.fillStyle(0x38bdf8, 1).fillCircle(p.x, p.y, p.r);
    g.fillStyle(0xffffff, 1)
      .fillCircle(p.x - 11, p.y - 7, 8)
      .fillCircle(p.x + 11, p.y - 7, 8);
    g.fillStyle(0x111827, 1)
      .fillCircle(p.x - 11, p.y - 7, 3.5)
      .fillCircle(p.x + 11, p.y - 7, 3.5);
    // Dash recharge ring.
    if (p.cd > 0) {
      g.lineStyle(6, 0xfde047, 0.9)
        .beginPath()
        .arc(p.x, p.y, p.r + 8, -Math.PI / 2, -Math.PI / 2 + (1 - p.cd / 0.55) * Math.PI * 2)
        .strokePath();
    }
  }
}
