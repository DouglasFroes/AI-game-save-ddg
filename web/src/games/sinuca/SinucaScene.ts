import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { heartsLabel, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  BALL_R,
  firstContact,
  LIVES,
  POCKET_R,
  POCKETS,
  PoolSim,
  TABLE,
  type PoolEvent,
} from './core';

const BALL_COLORS = [
  0xffffff, 0xfacc15, 0x2563eb, 0xdc2626, 0x7c3aed, 0xf97316, 0x16a34a, 0x7f1d1d, 0x111827,
];
const colorOf = (n: number) => BALL_COLORS[n > 8 ? n - 8 : n]!;
const PULL = 260;

/** "Sinuca": pull back from the cue ball and release; pocket a ball every shot or lose a life. */
export class SinucaScene extends MiniScene {
  private sim = new PoolSim();
  private g!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private aim: { x: number; y: number; px: number; py: number } | null = null;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Sinuca, 'sinuca', [0x1c1917, 0x052e16]);
  }

  create(): void {
    this.sim = new PoolSim();
    this.aim = null;
    this.frame('0');
    this.g = this.add.graphics().setDepth(5);
    this.labels = this.sim.balls.map((b) =>
      addText(this, 0, 0, b.n ? String(b.n) : '', 15, { color: '#111827' }).setDepth(7),
    );
    this.statusText = addText(this, GAME_WIDTH / 2, 170, '', 28, {
      color: '#bbf7d0',
      stroke: '#052e16',
      strokeThickness: 6,
    }).setDepth(50);
    this.livesText = addText(this, GAME_WIDTH / 2, 214, '', 28).setDepth(50);
    this.hintBox = hint(
      this,
      ['Puxe para trás e solte para tacar', 'Encaçape ao menos uma bola por tacada!'],
      1215,
      5000,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.ended || this.sim.rolling || p.y < 140) return;
      this.hintBox?.dismiss();
      this.aim = { x: p.x, y: p.y, px: p.x, py: p.y };
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (!this.aim) return;
      this.aim.px = p.x;
      this.aim.py = p.y;
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => {
      const a = this.aim;
      this.aim = null;
      if (!a || this.ended) return;
      const { dx, dy, power } = this.shotFrom(a);
      if (this.sim.shoot(dx, dy, power)) getServices(this).sfx.play('hit');
    });
    this.refresh();
  }

  /** Dragging away from the start point aims the opposite way, like pulling back a cue. */
  private shotFrom(a: { x: number; y: number; px: number; py: number }) {
    const dx = a.x - a.px;
    const dy = a.y - a.py;
    const len = Math.hypot(dx, dy);
    return { dx: len ? dx / len : 0, dy: len ? dy / len : 0, power: Math.min(1, len / PULL) };
  }

  private refresh(): void {
    const left = this.sim.balls.filter((b) => b.n !== 0 && !b.down).length;
    const mult = 1 + 0.5 * this.sim.streak;
    this.statusText.setText(
      `Mesa ${this.sim.racks + 1} · Bolas ${left} · 🔥 Sequência x${mult.toFixed(1)}`,
    );
    this.livesText.setText(heartsLabel(this.sim.lives, LIVES));
    this.setScore(this.sim.score);
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.handle(this.sim.step(Math.min(deltaMs, 40) / 1000));
    this.draw();
  }

  private handle(events: PoolEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e.type === 'clack') sfx.play('tick', Math.min(6, Math.floor(e.speed / 300)));
      else if (e.type === 'cushion') sfx.play('bounce');
      else if (e.type === 'pocket') {
        const b = this.sim.balls.find((q) => q.n === e.n);
        const p =
          b &&
          POCKETS.reduce((m, q) =>
            Math.hypot(q.x - b.x, q.y - b.y) < Math.hypot(m.x - b.x, m.y - b.y) ? q : m,
          );
        if (p) burst(this, p.x, p.y, e.n ? colorOf(e.n) : 0xffffff, 12, { speed: 200 });
        sfx.play(e.n ? 'coin' : 'locked');
      } else if (e.type === 'shot') {
        if (e.points) {
          const n = e.pocketed.length;
          banner(
            this,
            n >= 3 ? `TRIPLA! +${e.points}` : n === 2 ? `DUPLA! +${e.points}` : `+${e.points}`,
            '#86efac',
            560,
          );
          if (n >= 2) sfx.play('win');
        } else {
          sfx.play('hit');
          sfx.vibrate([50, 30, 50]);
          flash(this, 0xef4444, 0.25, 260);
          this.pop(
            GAME_WIDTH / 2,
            640,
            e.scratch ? 'Bola branca caiu!' : 'Nenhuma bola!',
            '#fca5a5',
            42,
          );
          if (e.livesLeft <= 0)
            this.finish(
              'Fim de jogo!',
              [`Bolas encaçapadas: ${this.sim.potted} · Mesas limpas: ${this.sim.racks}`],
              { score: this.sim.score, details: { balls: this.sim.potted, racks: this.sim.racks } },
              900,
            );
        }
      } else if (e.type === 'rack') {
        sfx.play('level');
        banner(this, `MESA LIMPA! +${e.bonus}`, '#fde047', 640);
        shockwave(this, GAME_WIDTH / 2, 700, 0xfde047, 320);
      }
      this.refresh();
    }
  }

  private draw(): void {
    const g = this.g.clear();
    const { x0, y0, x1, y1 } = TABLE;
    g.fillStyle(0x78350f, 1).fillRoundedRect(x0 - 42, y0 - 42, x1 - x0 + 84, y1 - y0 + 84, 30);
    g.fillStyle(0x0f5132, 1).fillRect(x0 - 14, y0 - 14, x1 - x0 + 28, y1 - y0 + 28);
    g.fillStyle(0x15803d, 1).fillRect(x0, y0, x1 - x0, y1 - y0);
    g.lineStyle(2, 0xffffff, 0.15).lineBetween(x0, 960 - 120, x1, 960 - 120);
    for (const p of POCKETS) g.fillStyle(0x020617, 1).fillCircle(p.x, p.y, POCKET_R - 4);

    const balls = this.sim.balls;
    const cue = balls[0]!;
    if (this.aim && !this.sim.rolling) {
      const { dx, dy, power } = this.shotFrom(this.aim);
      if (power > 0.03) {
        const hit = firstContact(balls, dx, dy);
        const end = hit ?? { x: cue.x + dx * 900, y: cue.y + dy * 900 };
        g.lineStyle(3, 0xffffff, 0.6).lineBetween(cue.x, cue.y, end.x, end.y);
        if (hit) {
          g.lineStyle(2, 0xffffff, 0.8).strokeCircle(hit.x, hit.y, BALL_R);
          const ox = hit.ball.x - hit.x;
          const oy = hit.ball.y - hit.y;
          const ol = Math.hypot(ox, oy) || 1;
          g.lineStyle(3, colorOf(hit.ball.n), 0.9).lineBetween(
            hit.ball.x,
            hit.ball.y,
            hit.ball.x + (ox / ol) * 120,
            hit.ball.y + (oy / ol) * 120,
          );
        }
        // The cue stick, pulled back by the power.
        const back = 30 + power * 90;
        g.lineStyle(10, 0xd6a35c, 1).lineBetween(
          cue.x - dx * back,
          cue.y - dy * back,
          cue.x - dx * (back + 300),
          cue.y - dy * (back + 300),
        );
        g.fillStyle(0x0f172a, 0.8).fillRoundedRect(GAME_WIDTH / 2 - 150, 1185, 300, 18, 9);
        g.fillStyle(power > 0.8 ? 0xef4444 : 0xfacc15, 1).fillRoundedRect(
          GAME_WIDTH / 2 - 150,
          1185,
          300 * power,
          18,
          9,
        );
      }
    }

    balls.forEach((b, i) => {
      const label = this.labels[i]!;
      label.setVisible(!b.down && b.n !== 0);
      if (b.down) return;
      g.fillStyle(0x000000, 0.3).fillCircle(b.x + 3, b.y + 4, BALL_R);
      g.fillStyle(colorOf(b.n), 1).fillCircle(b.x, b.y, BALL_R);
      if (b.n > 8) {
        g.fillStyle(0xffffff, 1)
          .fillCircle(b.x, b.y - BALL_R * 0.7, BALL_R * 0.45)
          .fillCircle(b.x, b.y + BALL_R * 0.7, BALL_R * 0.45);
      }
      if (b.n) g.fillStyle(0xffffff, 1).fillCircle(b.x, b.y, BALL_R * 0.5);
      g.fillStyle(0xffffff, 0.45).fillCircle(b.x - 5, b.y - 6, 4);
      label.setPosition(b.x, b.y);
    });
  }
}
