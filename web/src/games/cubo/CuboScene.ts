import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { CUBE, CUBE_X, CubeSim, GROUND_Y } from './core';

const HUES = [0x22d3ee, 0xa855f7, 0xf472b6, 0xfacc15, 0x4ade80];

/** "Cubo Saltitante": tap to jump over spikes and onto blocks — how far can you go? */
export class CuboScene extends MiniScene {
  private sim = new CubeSim();
  private g!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private holding = false;
  private lastMilestone = 0;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Cubo, 'cubo', [0x0f0a1e, 0x1e1b4b]);
  }

  create(): void {
    this.sim = new CubeSim();
    this.holding = false;
    this.lastMilestone = 0;
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.statusText = addText(this, GAME_WIDTH / 2, 168, '', 28, {
      color: '#e9d5ff',
      stroke: '#0f0a1e',
      strokeThickness: 6,
    }).setDepth(50);
    this.hintBox = hint(this, ['Toque para pular · segure para pular sem parar'], 1150, 4000);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.ended || p.y < 140) return;
      this.hintBox?.dismiss();
      this.holding = true;
      if (this.sim.jump()) getServices(this).sfx.play('bounce');
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => (this.holding = false));
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (!this.ended && this.sim.jump()) getServices(this).sfx.play('bounce');
    });
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const before = this.sim.jumps;
    if (this.sim.step(Math.min(deltaMs, 33) / 1000, this.holding) === 'dead') {
      const { sfx } = getServices(this);
      sfx.play('boom');
      sfx.vibrate([70, 30, 70]);
      flash(this, 0xffffff, 0.4, 200);
      burst(this, CUBE_X + CUBE / 2, GROUND_Y - this.sim.y - CUBE / 2, this.hue(), 30, {
        speed: 420,
      });
      this.finish(
        'Bateu!',
        [`Distância: ${this.sim.score} m · Pulos: ${this.sim.jumps}`],
        { score: this.sim.score, details: { jumps: this.sim.jumps } },
        700,
      );
    } else if (this.sim.jumps > before) getServices(this).sfx.play('bounce');
    const m = Math.floor(this.sim.score / 250);
    if (m > this.lastMilestone) {
      this.lastMilestone = m;
      banner(this, `${m * 250} m!`, '#e9d5ff', 520);
      getServices(this).sfx.play('level');
    }
    this.setScore(this.sim.score);
    this.statusText.setText(
      `Velocidade ${Math.round(this.sim.speed / 4.3)}% · Pulos ${this.sim.jumps}`,
    );
    this.draw();
  }

  private hue(): number {
    return HUES[Math.floor(this.sim.dist / 3000) % HUES.length]!;
  }

  private draw(): void {
    const g = this.g.clear();
    const s = this.sim;
    const hue = this.hue();
    // Scrolling backdrop grid.
    g.lineStyle(2, hue, 0.12);
    const off = (s.dist * 0.4) % 80;
    for (let x = -off; x < GAME_WIDTH; x += 80) g.lineBetween(x, 260, x, GROUND_Y);
    g.fillStyle(0x020617, 1).fillRect(0, GROUND_Y, GAME_WIDTH, GAME_HEIGHT - GROUND_Y);
    g.lineStyle(4, hue, 1).lineBetween(0, GROUND_Y, GAME_WIDTH, GROUND_Y);
    for (const o of s.obstacles) {
      const x = o.x - s.dist;
      if (x > GAME_WIDTH || x + o.w < 0) continue;
      const bottom = GROUND_Y - o.base;
      if (o.kind === 'block') {
        g.fillStyle(0x0f172a, 1).fillRect(x, bottom - o.h, o.w, o.h);
        g.lineStyle(4, hue, 1).strokeRect(x, bottom - o.h, o.w, o.h);
      } else {
        g.fillStyle(0xffffff, 1).fillTriangle(
          x,
          bottom,
          x + o.w,
          bottom,
          x + o.w / 2,
          bottom - o.h,
        );
        g.lineStyle(3, hue, 1).strokeTriangle(
          x,
          bottom,
          x + o.w,
          bottom,
          x + o.w / 2,
          bottom - o.h,
        );
      }
    }
    // The cube spins in the air and lands square.
    const cx = CUBE_X + CUBE / 2;
    const cy = GROUND_Y - s.y - CUBE / 2;
    const corners = [0, 1, 2, 3].map((k) => {
      const a = s.angle + Math.PI / 4 + (k * Math.PI) / 2;
      return { x: cx + Math.cos(a) * CUBE * 0.707, y: cy + Math.sin(a) * CUBE * 0.707 };
    });
    g.fillStyle(hue, 1).fillPoints(corners, true);
    g.lineStyle(4, 0xffffff, 1).strokePoints(corners, true);
    g.fillStyle(0x0f172a, 1)
      .fillRect(cx - 10, cy - 8, 8, 8)
      .fillRect(cx + 4, cy - 8, 8, 8);
  }
}
