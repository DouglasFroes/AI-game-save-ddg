import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { ambient, banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { BALL_R, LANE_START_Y, LANE_X, PinballSim, type Flipper, type PinballEvent } from './core';

const TRAIL = 14;

/** "Pinball Neon": touch the left or right half for the flippers; tap to launch. */
export class PinballScene extends MiniScene {
  private sim = new PinballSim();
  private g!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private trail: Array<{ x: number; y: number }> = [];
  private touches = new Map<number, 1 | -1>();
  private lastWall = 0;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Pinball, 'pinball', [0x05010f, 0x1a0b3b]);
  }

  create(): void {
    this.sim = new PinballSim();
    this.trail = [];
    this.touches.clear();
    this.frame();
    ambient(this, 0xf0abfc, 14);
    this.input.addPointer(2);
    this.g = this.add.graphics().setDepth(5);
    this.info = addText(this, GAME_WIDTH / 2, 168, '', 30, {
      color: '#f5d0fe',
      stroke: '#05010f',
      strokeThickness: 6,
    }).setDepth(50);
    this.hintBox = hint(
      this,
      ['Toque nos lados para mover os flippers', 'Toque para lançar a bola!'],
      830,
      8000,
    );

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.ended || p.y < 130) return;
      this.hintBox?.dismiss();
      if (this.sim.state === 'plunger') {
        this.handle(this.sim.launch());
        return;
      }
      const side: 1 | -1 = p.x < GAME_WIDTH / 2 ? 1 : -1;
      this.touches.set(p.id, side);
      this.handle(this.sim.press(side, true));
    });
    const release = (p: Phaser.Input.Pointer) => {
      const side = this.touches.get(p.id);
      if (!side) return;
      this.touches.delete(p.id);
      // Another finger may still be holding that side.
      if (![...this.touches.values()].includes(side)) this.sim.press(side, false);
    };
    this.input.on(Phaser.Input.Events.POINTER_UP, release);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, release);

    const key = (name: string, side: 1 | -1) => {
      this.input.keyboard?.on(`keydown-${name}`, () => this.handle(this.sim.press(side, true)));
      this.input.keyboard?.on(`keyup-${name}`, () => this.sim.press(side, false));
    };
    key('Z', 1);
    key('LEFT', 1);
    key('M', -1);
    key('RIGHT', -1);
    this.input.keyboard?.on('keydown-SPACE', () => this.handle(this.sim.launch()));
  }

  override update(time: number, deltaMs: number): void {
    if (this.ended) return;
    this.handle(this.sim.step(Math.min(deltaMs, 33) / 1000));
    this.setScore(this.sim.score);
    this.info.setText(`Bolas ${'●'.repeat(Math.max(0, this.sim.ballsLeft))} · ×${this.sim.multi}`);
    this.trail.push({ x: this.sim.ball.x, y: this.sim.ball.y });
    if (this.trail.length > TRAIL) this.trail.shift();
    this.draw(time);
  }

  private handle(events: PinballEvent[]): void {
    const { sfx } = getServices(this);
    for (const ev of events) {
      switch (ev.type) {
        case 'launch':
          sfx.play('zap');
          sfx.vibrate(20);
          break;
        case 'wall':
          if (this.time.now - this.lastWall > 60) {
            this.lastWall = this.time.now;
            sfx.play('tick');
          }
          break;
        case 'bumper':
          sfx.play('bounce', ev.index + 2);
          sfx.vibrate(10);
          shockwave(this, ev.x, ev.y, 0xf0abfc, 70);
          burst(this, ev.x, ev.y, 0xf0abfc, 8, { speed: 260, size: 5 });
          this.pop(ev.x, ev.y - 52, `${ev.points}`, '#f5d0fe', 30);
          break;
        case 'sling':
          sfx.play('pop');
          break;
        case 'target':
          sfx.play('coin', 3);
          this.pop(GAME_WIDTH / 2, 640, `+${ev.points}`, '#67e8f9', 34);
          break;
        case 'targetsDone':
          sfx.play('level');
          flash(this, 0x67e8f9, 0.25);
          banner(this, `MULTIPLICADOR ×${ev.multi}!`, '#67e8f9');
          break;
        case 'flip':
          sfx.play('click');
          break;
        case 'save':
          sfx.play('star');
          banner(this, 'BOLA SALVA!', '#86efac');
          break;
        case 'drain':
          sfx.play('hit');
          this.cameras.main.shake(180, 0.006);
          break;
        case 'gameOver':
          sfx.play('boom');
          this.finish(
            'Fim de jogo!',
            [`Multiplicador máximo: ×${this.sim.maxMulti}`],
            { score: this.sim.score, details: { multi: this.sim.maxMulti } },
            500,
          );
          break;
      }
    }
  }

  private draw(time: number): void {
    const { sim } = this;
    const g = this.g.clear();

    // Table glow behind everything.
    g.fillStyle(0x000000, 0.28).fillRoundedRect(36, 180, 648, 1130, 28);

    // Walls.
    for (const s of sim.segs) {
      if (s.kind === 'sling') {
        const lit = Math.max(0, 1 - sim.slingLit[s.ax < 360 ? 0 : 1]! * 4);
        g.lineStyle(14, 0xfb7185, 0.35 + lit * 0.5).lineBetween(s.ax, s.ay, s.bx, s.by);
        g.lineStyle(5, 0xffffff, 0.8).lineBetween(s.ax, s.ay, s.bx, s.by);
      } else if (s.kind === 'target') {
        if (sim.targetsDown[s.index!]) {
          g.lineStyle(4, 0x155e75, 0.5).lineBetween(s.ax, s.ay, s.bx, s.by);
        } else {
          g.lineStyle(20, 0x22d3ee, 0.3).lineBetween(s.ax, s.ay, s.bx, s.by);
          g.lineStyle(10, 0x67e8f9, 1).lineBetween(s.ax, s.ay, s.bx, s.by);
        }
      } else {
        g.lineStyle(14, 0xa78bfa, 0.25).lineBetween(s.ax, s.ay, s.bx, s.by);
        g.lineStyle(5, 0xddd6fe, 0.95).lineBetween(s.ax, s.ay, s.bx, s.by);
      }
    }

    // Bumpers.
    for (const b of sim.bumpers) {
      const lit = Math.max(0, 1 - b.lit * 5);
      g.fillStyle(0xf0abfc, 0.12 + lit * 0.4).fillCircle(b.x, b.y, b.r + 14 + lit * 10);
      g.fillStyle(0x701a75).fillCircle(b.x, b.y, b.r);
      g.fillStyle(0xe879f9, 0.6 + lit * 0.4).fillCircle(b.x, b.y, b.r * 0.72);
      g.lineStyle(5, 0xffffff, 0.8).strokeCircle(b.x, b.y, b.r);
      g.fillStyle(0xffffff, 0.7).fillCircle(b.x - 9, b.y - 10, 7);
    }

    // Plunger lane.
    const charge = sim.state === 'plunger' ? 18 + Math.sin(time / 180) * 4 : 0;
    g.fillStyle(0x94a3b8).fillRoundedRect(LANE_X - 18, LANE_START_Y + BALL_R + charge, 36, 12, 4);
    g.lineStyle(4, 0x64748b).lineBetween(LANE_X, LANE_START_Y + BALL_R + 12 + charge, LANE_X, 1280);

    // Flippers.
    for (const f of sim.flippers) this.drawFlipper(g, f);

    // Ball and trail.
    this.trail.forEach((p, i) => {
      const k = i / TRAIL;
      g.fillStyle(0x67e8f9, k * 0.4).fillCircle(p.x, p.y, BALL_R * (0.4 + k * 0.6));
    });
    const b = sim.ball;
    g.fillStyle(0xffffff, 0.2).fillCircle(b.x, b.y, BALL_R * 1.9);
    g.fillStyle(0xe2e8f0).fillCircle(b.x, b.y, BALL_R);
    g.fillStyle(0xffffff).fillCircle(b.x - 4, b.y - 4, 5);

    if (sim.saveTime > 0 && sim.state === 'play') {
      g.lineStyle(4, 0x86efac, 0.25 + Math.abs(Math.sin(time / 160)) * 0.3).lineBetween(
        150,
        1240,
        540,
        1240,
      );
    }
  }

  private drawFlipper(g: Phaser.GameObjects.Graphics, f: Flipper): void {
    const tx = f.px + f.side * Math.cos(f.angle) * f.len;
    const ty = f.py + Math.sin(f.angle) * f.len;
    g.lineStyle(34, 0x38bdf8, f.pressed ? 0.45 : 0.2).lineBetween(f.px, f.py, tx, ty);
    g.lineStyle(24, 0x0ea5e9, 1).lineBetween(f.px, f.py, tx, ty);
    g.lineStyle(8, 0xe0f2fe, 0.9).lineBetween(f.px, f.py - 5, tx, ty - 3);
    g.fillStyle(0xffffff).fillCircle(f.px, f.py, 9);
  }
}
