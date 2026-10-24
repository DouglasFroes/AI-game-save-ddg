import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import { burst, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { getServices } from '@/services';
import { BALL_R, CEIL_Y, FLOOR_Y, GanchoSim, type GanchoEvent } from './core';

const TRAIL = 16;

/** "Gancho Elástico": hold to throw the rope, release to fly; stars, combos, lava below. */
export class GanchoScene extends MiniScene {
  private sim = new GanchoSim();
  private g!: Phaser.GameObjects.Graphics;
  private lava!: Phaser.GameObjects.Graphics;
  private trail: Array<{ x: number; y: number }> = [];
  private started = false;
  private hintBox?: { dismiss: () => void };
  private comboText!: Phaser.GameObjects.Text;
  private emberAt = 0;

  constructor() {
    super(SceneKeys.Gancho, 'gancho', [0x12060a, 0x3b1308]);
  }

  create(): void {
    this.sim = new GanchoSim();
    this.trail = [];
    this.started = false;
    this.frame();
    this.lava = this.add.graphics().setDepth(20);
    this.g = this.add.graphics().setDepth(8);
    this.comboText = this.add
      .text(GAME_WIDTH / 2, 190, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '40px',
        fontStyle: 'bold',
        color: '#ffd166',
        stroke: '#1b0a05',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(50)
      .setAlpha(0);
    this.hintBox = hint(this, ['Segure para lançar a corda', 'Solte para voar!'], 1000, 60000);

    const down = () => {
      if (this.ended) return;
      if (!this.started) {
        this.started = true;
        this.hintBox?.dismiss();
      }
      this.handle(this.sim.attach());
    };
    const up = () => this.handle(this.sim.release());
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y > 130) down();
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, up);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, up);
    this.input.keyboard?.on('keydown-SPACE', down);
    this.input.keyboard?.on('keyup-SPACE', up);
  }

  override update(time: number, deltaMs: number): void {
    if (this.ended) return;
    if (this.started) this.handle(this.sim.step(Math.min(deltaMs, 40) / 1000));
    this.setScore(this.sim.score);
    this.trail.push({ x: this.sim.x, y: this.sim.y });
    if (this.trail.length > TRAIL) this.trail.shift();
    this.draw(time);
  }

  private handle(events: GanchoEvent[]): void {
    const { sfx } = getServices(this);
    const cam = this.sim.cam;
    for (const ev of events) {
      switch (ev.type) {
        case 'attach':
          sfx.play('zap');
          sfx.vibrate(10);
          shockwave(this, ev.anchor.x - cam, ev.anchor.y, 0xffd166, 60);
          break;
        case 'release':
          sfx.play('bounce', 2);
          break;
        case 'star': {
          sfx.play('coin', ev.combo);
          sfx.vibrate(8);
          burst(this, ev.star.x - cam, ev.star.y, 0xffe066, 12, { speed: 260 });
          this.pop(
            ev.star.x - cam,
            ev.star.y - 30,
            `+${10 * Math.min(ev.combo, 5)}`,
            '#ffe066',
            40,
          );
          if (ev.combo > 1) this.showCombo(ev.combo);
          break;
        }
        case 'dead': {
          const x = this.sim.x - cam;
          burst(this, x, Math.min(this.sim.y, FLOOR_Y - 10), 0xff6b35, 30, {
            speed: 520,
            gravity: 900,
            size: 9,
          });
          sfx.play('boom');
          const best = this.sim.meters;
          this.finish(
            ev.reason === 'lava' ? 'Queimou na lava!' : 'Ficou para trás!',
            [`Distância: ${best} m`, `Estrelas: ${this.sim.stars}`],
            { score: this.sim.score, details: { meters: best, stars: this.sim.stars } },
          );
          break;
        }
      }
    }
  }

  private showCombo(n: number): void {
    this.comboText
      .setText(`COMBO x${Math.min(n, 5)}`)
      .setAlpha(1)
      .setScale(0.6);
    this.tweens.killTweensOf(this.comboText);
    this.tweens.add({ targets: this.comboText, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.comboText, alpha: 0, delay: 700, duration: 300 });
  }

  private draw(time: number): void {
    const { sim } = this;
    const cam = sim.cam;
    const g = this.g.clear();

    // Parallax cave teeth on the ceiling, in two layers.
    for (const [speed, color, h] of [
      [0.35, 0x2a0d08, 90],
      [0.7, 0x3d150b, 60],
    ] as const) {
      g.fillStyle(color);
      const off = (cam * speed) % 120;
      for (let x = -off - 120; x < GAME_WIDTH + 120; x += 120) {
        g.fillTriangle(x, 130, x + 120, 130, x + 60, 130 + h + ((x * 7) % 40));
      }
    }
    g.fillStyle(0x4a1a0d).fillRect(0, 130, GAME_WIDTH, CEIL_Y - 130);

    // Stars.
    for (const s of sim.starList) {
      const sx = s.x - cam;
      if (s.taken || sx < -40 || sx > GAME_WIDTH + 40) continue;
      const pulse = 1 + Math.sin(time / 180 + s.x) * 0.12;
      this.star(g, sx, s.y, 24 * pulse);
    }

    // Anchors; the one a throw would grab right now gets a pulsing ring and a guide line.
    const target = sim.anchor ?? sim.nearestAnchor();
    for (const a of sim.anchors) {
      const ax = a.x - cam;
      if (ax < -40 || ax > GAME_WIDTH + 40) continue;
      g.lineStyle(3, 0x7a3a22, 0.6).lineBetween(ax, CEIL_Y, ax, a.y);
      g.fillStyle(0xfff1d6).fillCircle(ax, a.y, 12);
      g.lineStyle(4, 0xffb703, 0.9).strokeCircle(ax, a.y, 17);
      if (a === target && !sim.anchor) {
        const r = 28 + Math.sin(time / 120) * 5;
        g.lineStyle(4, 0xffd166, 0.85).strokeCircle(ax, a.y, r);
        g.lineStyle(2, 0xffd166, 0.3).lineBetween(ax, a.y, sim.x - cam, sim.y);
      }
    }

    // Rope.
    if (sim.anchor) {
      const ax = sim.anchor.x - cam;
      g.lineStyle(14, 0xff9f1c, 0.25).lineBetween(ax, sim.anchor.y, sim.x - cam, sim.y);
      g.lineStyle(6, 0xffe8b0, 1).lineBetween(ax, sim.anchor.y, sim.x - cam, sim.y);
    }

    // Trail and ball.
    this.trail.forEach((p, i) => {
      const k = i / TRAIL;
      g.fillStyle(0xffb703, k * 0.5).fillCircle(p.x - cam, p.y, BALL_R * (0.3 + k * 0.7));
    });
    const bx = sim.x - cam;
    g.fillStyle(0xffd166, 0.25).fillCircle(bx, sim.y, BALL_R + 10);
    g.fillStyle(0xff9f1c).fillCircle(bx, sim.y, BALL_R);
    g.fillStyle(0xffffff, 0.75).fillCircle(bx - 6, sim.y - 6, 6);

    this.drawLava(time);
  }

  private star(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number): void {
    const pts: Phaser.Geom.Point[] = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? r : r * 0.45;
      pts.push(new Phaser.Geom.Point(x + Math.cos(a) * rr, y + Math.sin(a) * rr));
    }
    g.fillStyle(0xffe066, 0.28).fillCircle(x, y, r * 1.5);
    g.fillStyle(0xffd23f).fillPoints(pts, true);
  }

  private drawLava(time: number): void {
    const g = this.lava.clear();
    const cam = this.sim.cam;
    const top = FLOOR_Y;
    const wave = (x: number, phase: number, amp: number) =>
      top + Math.sin((x + cam) / 70 + time / 380 + phase) * amp;
    for (const [phase, amp, color] of [
      [0, 12, 0xff4d00],
      [2, 9, 0xff7b00],
      [4, 6, 0xffb703],
    ] as const) {
      g.fillStyle(color);
      g.beginPath().moveTo(0, GAME_HEIGHT);
      for (let x = 0; x <= GAME_WIDTH; x += 20) g.lineTo(x, wave(x, phase, amp) + phase * 6);
      g.lineTo(GAME_WIDTH, GAME_HEIGHT).closePath().fillPath();
    }
    g.fillStyle(0x7a1100, 0.55).fillRect(0, top + 70, GAME_WIDTH, GAME_HEIGHT - top - 70);
    // Embers pop out of the lava now and then.
    if (time > this.emberAt) {
      this.emberAt = time + 220;
      const x = Math.random() * GAME_WIDTH;
      const dot = this.add.circle(x, top + 10, 4 + Math.random() * 4, 0xffb703).setDepth(19);
      this.tweens.add({
        targets: dot,
        y: top - 80 - Math.random() * 120,
        alpha: 0,
        duration: 900,
        onComplete: () => dot.destroy(),
      });
    }
  }
}
