import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  BALL_R,
  BasketSim,
  FLOOR_Y,
  GRAVITY,
  launch,
  MAX_PULL,
  MAX_TIME,
  RIM_HALF,
  THREE_X,
  type BasketEvent,
} from './core';

const CX = GAME_WIDTH / 2;

/** "Arremesso": pull back and let go; swishes set you on fire. 60 seconds on the clock. */
export class BasqueteScene extends MiniScene {
  private sim = new BasketSim();
  private backG!: Phaser.GameObjects.Graphics;
  private frontG!: Phaser.GameObjects.Graphics;
  private ball!: Phaser.GameObjects.Container;
  private shadow!: Phaser.GameObjects.Ellipse;
  private aim!: Phaser.GameObjects.Graphics;
  private clockBar!: Phaser.GameObjects.Graphics;
  private clockText!: Phaser.GameObjects.Text;
  private fireText!: Phaser.GameObjects.Text;
  private spotText!: Phaser.GameObjects.Text;
  private drag: { x: number; y: number } | null = null;
  private pull = { x: 0, y: 0 };
  private netSwing = 0;
  private lastSound = 0;
  private trail: Array<{ x: number; y: number }> = [];
  private trailG!: Phaser.GameObjects.Graphics;
  private tutorial?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Basquete, 'basquete', [0x1e1b4b, 0x7c2d12]);
  }

  create(): void {
    this.sim = new BasketSim();
    this.drag = null;
    this.trail = [];
    this.frame('0');
    this.drawGym();
    this.backG = this.add.graphics().setDepth(1);
    this.trailG = this.add.graphics().setDepth(2);
    this.shadow = this.add.ellipse(0, FLOOR_Y, 60, 14, 0x000000, 0.35).setDepth(1);
    this.ball = this.makeBall().setDepth(3);
    this.frontG = this.add.graphics().setDepth(4);
    this.aim = this.add.graphics().setDepth(5);
    this.clockBar = this.add.graphics().setDepth(6);
    this.clockText = addText(this, GAME_WIDTH - 60, 176, '', 30, {
      color: '#ffffff',
      stroke: '#0b1430',
    }).setDepth(6);
    this.fireText = addText(this, CX, 230, '', 34, {
      color: '#fb923c',
      stroke: '#0b1430',
    }).setDepth(6);
    this.spotText = addText(this, 0, 0, '', 26, { color: '#fde68a', stroke: '#0b1430' }).setDepth(
      6,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y < 130 || this.sim.flying || this.ended) return;
      this.tutorial?.dismiss();
      this.drag = { x: p.x, y: p.y };
      this.pull = { x: 0, y: 0 };
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (!this.drag) return;
      this.pull = { x: p.x - this.drag.x, y: p.y - this.drag.y };
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => {
      if (!this.drag) return;
      this.drag = null;
      this.aim.clear();
      if (this.sim.shoot(this.pull.x, this.pull.y)) getServices(this).sfx.play('click');
    });
    this.tutorial = hint(
      this,
      ['Puxe para trás e solte', 'Cesta sem tocar no aro = SWISH!'],
      760,
      4500,
    );
    this.placeBall();
  }

  private drawGym(): void {
    const g = this.add.graphics().setDepth(-5);
    // Crowd stands.
    for (let i = 0; i < 220; i++) {
      const colors = [0xf97316, 0xfde047, 0x60a5fa, 0xf472b6, 0xffffff];
      g.fillStyle(colors[i % colors.length]!, 0.25).fillCircle(
        (i * 41) % GAME_WIDTH,
        260 + ((i * 67) % 480),
        6,
      );
    }
    // Wooden floor with planks.
    g.fillStyle(0xb45309).fillRect(0, FLOOR_Y, GAME_WIDTH, 200);
    for (let x = 0; x < GAME_WIDTH; x += 60)
      g.lineStyle(2, 0x92400e, 0.6).lineBetween(x, FLOOR_Y, x - 30, 1280);
    g.fillStyle(0xfde68a, 0.9).fillRect(0, FLOOR_Y, GAME_WIDTH, 6);
    // Three-point line.
    g.lineStyle(6, 0xffffff, 0.9).lineBetween(THREE_X, FLOOR_Y + 6, THREE_X - 40, 1280);
    addText(this, THREE_X - 90, FLOOR_Y + 60, '3 PONTOS', 22, { color: '#ffffff' }).setDepth(-4);
  }

  private makeBall(): Phaser.GameObjects.Container {
    const body = this.add.circle(0, 0, BALL_R, 0xf97316).setStrokeStyle(3, 0x7c2d12);
    const seams = this.add.graphics();
    seams.lineStyle(3, 0x7c2d12);
    seams.lineBetween(-BALL_R, 0, BALL_R, 0).lineBetween(0, -BALL_R, 0, BALL_R);
    seams.beginPath();
    seams.arc(-BALL_R * 1.1, 0, BALL_R * 0.8, -0.9, 0.9);
    seams.strokePath();
    seams.beginPath();
    seams.arc(BALL_R * 1.1, 0, BALL_R * 0.8, Math.PI - 0.9, Math.PI + 0.9);
    seams.strokePath();
    const shine = this.add.circle(-9, -9, 7, 0xffffff, 0.3);
    return this.add.container(0, 0, [body, seams, shine]);
  }

  private placeBall(): void {
    this.ball.setPosition(this.sim.x, this.sim.y).setScale(0.3).setAlpha(0);
    this.tweens.add({
      targets: this.ball,
      scale: 1,
      alpha: 1,
      duration: 220,
      ease: 'Back.easeOut',
    });
    this.spotText
      .setText(this.sim.isThree ? '3 PONTOS' : '')
      .setPosition(this.sim.x, this.sim.y - 70);
    this.trail = [];
  }

  /** Backboard, pole and the back of the rim (behind the ball). */
  private drawHoop(): void {
    const h = this.sim.hoop;
    const g = this.backG.clear();
    const bx = h.x + RIM_HALF + 20;
    g.fillStyle(0x334155).fillRect(bx + 10, h.y - 40, 26, FLOOR_Y - h.y + 40);
    g.fillStyle(0x475569).fillRect(bx + 4, h.y - 30, 30, 18);
    g.fillStyle(0xf8fafc).fillRoundedRect(bx - 6, h.y - 160, 18, 200, 6);
    g.lineStyle(4, 0xef4444).strokeRect(bx - 4, h.y - 70, 14, 60);
    g.lineStyle(7, 0xc2410c).strokeEllipse(h.x, h.y, RIM_HALF * 2, 18);
    const f = this.frontG.clear();
    // Net: lines from the ring down to a narrower bottom, swinging after a basket.
    const sway = Math.sin(this.netSwing * 30) * this.netSwing * 18;
    f.lineStyle(3, 0xffffff, 0.85);
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const top = h.x - RIM_HALF + t * RIM_HALF * 2;
      const bottom = h.x - RIM_HALF * 0.55 + t * RIM_HALF * 1.1 + sway;
      f.lineBetween(top, h.y + 4, bottom, h.y + 76);
    }
    for (let j = 1; j <= 3; j++) {
      const y = h.y + 4 + j * 24;
      const w = RIM_HALF * (1 - j * 0.15);
      f.lineBetween(h.x - w + sway * (j / 3), y, h.x + w + sway * (j / 3), y);
    }
    // Front of the ring, over the ball.
    f.lineStyle(8, 0xf97316);
    f.beginPath();
    f.arc(h.x, h.y, RIM_HALF, 0.15, Math.PI - 0.15);
    f.strokePath();
  }

  private drawAim(): void {
    const g = this.aim.clear();
    const v = launch(this.pull.x, this.pull.y);
    if (!v) return;
    const power = Math.min(1, Math.hypot(this.pull.x, this.pull.y) / MAX_PULL);
    // Only the first stretch of the arc: reading the rest is the skill.
    for (let i = 1; i <= 9; i++) {
      const t = i * 0.035;
      const x = this.sim.x + v.vx * t;
      const y = this.sim.y + v.vy * t + 0.5 * GRAVITY * t * t;
      g.fillStyle(0xffffff, 1 - i / 11).fillCircle(x, y, 8 - i * 0.5);
    }
    g.fillStyle(0x0b1430, 0.6).fillRoundedRect(this.sim.x - 60, this.sim.y + 44, 120, 12, 6);
    g.fillStyle(power > 0.85 ? 0xef4444 : power > 0.5 ? 0xfacc15 : 0x4ade80).fillRoundedRect(
      this.sim.x - 60,
      this.sim.y + 44,
      120 * power,
      12,
      6,
    );
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    const wasFlying = this.sim.flying;
    const events = this.sim.step(dt);
    this.handle(events);
    if (wasFlying && !this.sim.flying && !this.sim.over) this.placeBall();
    this.netSwing = Math.max(0, this.netSwing - dt);
    this.drawHoop();
    if (this.drag) this.drawAim();
    if (this.sim.flying) {
      this.ball.setPosition(this.sim.x, this.sim.y);
      this.ball.rotation += this.sim.vx * dt * 0.01;
      this.trail.push({ x: this.sim.x, y: this.sim.y });
      if (this.trail.length > 10) this.trail.shift();
    }
    const tg = this.trailG.clear();
    this.trail.forEach((p, i) =>
      tg
        .fillStyle(this.sim.fire ? 0xfb923c : 0xffffff, (i / 10) * 0.35)
        .fillCircle(p.x, p.y, BALL_R * (i / 10)),
    );
    const k = Math.max(0, 1 - (FLOOR_Y - this.ball.y) / 900);
    this.shadow
      .setPosition(this.ball.x, FLOOR_Y + 4)
      .setScale(0.4 + 0.6 * k)
      .setAlpha(0.15 + 0.25 * k);
    // Clock.
    const c = this.clockBar.clear();
    const frac = this.sim.clock / MAX_TIME;
    c.fillStyle(0x000000, 0.4).fillRoundedRect(40, 164, 560, 24, 12);
    c.fillStyle(frac > 0.25 ? 0x4ade80 : 0xef4444).fillRoundedRect(
      40,
      164,
      Math.max(24, 560 * frac),
      24,
      12,
    );
    this.clockText.setText(`${Math.ceil(this.sim.clock)}s`);
    this.fireText.setText(
      this.sim.fire
        ? '🔥 EM CHAMAS! PONTOS x2 🔥'
        : this.sim.streak > 0
          ? `Swish seguidos: ${this.sim.streak}/3`
          : '',
    );
  }

  private handle(events: BasketEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if ((e.type === 'rim' || e.type === 'board') && this.time.now - this.lastSound > 70) {
        this.lastSound = this.time.now;
        sfx.play(e.type === 'rim' ? 'bounce' : 'tick');
      } else if (e.type === 'floor') sfx.play('bounce');
      else if (e.type === 'score') {
        const h = this.sim.hoop;
        this.netSwing = 1;
        sfx.play(e.swish ? 'win' : 'coin');
        burst(this, h.x, h.y + 40, e.fire ? 0xfb923c : 0xfde047, e.swish ? 24 : 14);
        if (e.swish) shockwave(this, h.x, h.y, 0xffffff, 80);
        this.pop(h.x - 40, h.y - 90, `+${e.points}`, e.fire ? '#fb923c' : '#fde047', 56);
        if (e.swish) banner(this, e.three ? 'SWISH DE 3!' : 'SWISH!', '#fde047', 640);
        else if (e.three) banner(this, 'CESTA DE 3!', '#fde68a', 640);
        if (e.fire && this.sim.streak === 3) {
          flash(this, 0xf97316, 0.3, 320);
          sfx.vibrate([50, 30, 80]);
        }
        this.setScore(this.sim.score);
      } else if (e.type === 'miss') {
        if (this.sim.baskets > 0) sfx.play('hit');
      } else if (e.type === 'over') {
        const s = this.sim;
        this.finish(
          s.score >= 60 ? 'Mão calibrada! 🏀' : 'Fim do tempo!',
          [`Cestas: ${s.baskets} · Swish: ${s.swishes} · De 3: ${s.threes}`],
          { score: s.score, details: { baskets: s.baskets, swishes: s.swishes } },
        );
      }
    }
  }
}
