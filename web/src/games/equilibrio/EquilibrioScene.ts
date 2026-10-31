import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { BalanceSim, LIMIT, type BalanceEvent } from './core';

const BASE_Y = 1020;

/** "Equilíbrio": slide your finger to keep the stick standing — wind and all. */
export class EquilibrioScene extends MiniScene {
  private sim = new BalanceSim();
  private g!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private target = 360;
  private ball!: Phaser.GameObjects.Text;
  private lastMilestone = 0;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Equilibrio, 'equilibrio', [0x064e3b, 0x0b1430]);
  }

  create(): void {
    this.sim = new BalanceSim();
    this.target = 360;
    this.lastMilestone = 0;
    this.frame('0.0');
    this.g = this.add.graphics().setDepth(4);
    this.ball = emojiText(this, 360, 600, '🍎', 54).setDepth(6);
    this.statusText = addText(this, GAME_WIDTH / 2, 168, '', 28, {
      color: '#a7f3d0',
      stroke: '#064e3b',
      strokeThickness: 6,
    }).setDepth(50);
    this.hintBox = hint(
      this,
      ['Arraste o dedo para os lados', 'e não deixe a vara cair!'],
      360,
      4500,
    );
    const move = (p: Phaser.Input.Pointer) => {
      if (this.ended) return;
      this.hintBox?.dismiss();
      this.target = Phaser.Math.Clamp(p.x, 60, GAME_WIDTH - 60);
    };
    this.input.on(Phaser.Input.Events.POINTER_DOWN, move);
    this.input.on(
      Phaser.Input.Events.POINTER_MOVE,
      (p: Phaser.Input.Pointer) => p.isDown && move(p),
    );
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    // A few small steps per frame keep the pendulum stable.
    const dt = Math.min(deltaMs, 40) / 1000;
    for (let i = 0; i < 4; i++) this.handle(this.sim.step(dt / 4, this.target));
    const s = this.sim;
    this.setScore((s.score / 10).toFixed(1));
    const m = Math.floor(s.time / 15);
    if (m > this.lastMilestone && s.alive) {
      this.lastMilestone = m;
      banner(this, `${m * 15} s!`, '#a7f3d0', 520);
      getServices(this).sfx.play('level');
    }
    const lean = Math.abs(s.angle) / LIMIT;
    this.statusText.setText(
      `Vara ${s.length.toFixed(2)} m · Inclinação ${Math.round(lean * 100)}%`,
    );
    this.draw(lean);
  }

  private handle(events: BalanceEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e.type === 'gust') {
        sfx.play('zap');
        this.pop(GAME_WIDTH / 2, 300, e.dir > 0 ? 'Vento →' : '← Vento', '#e0f2fe', 36);
      } else {
        sfx.play('hit');
        sfx.vibrate([60, 30, 60]);
        flash(this, 0xef4444, 0.3, 260);
        const tip = this.sim.tip(BASE_Y);
        burst(this, tip.x, tip.y, 0xef4444, 16, { speed: 260, gravity: 600 });
        this.finish(
          'A vara caiu!',
          [`Tempo: ${(this.sim.score / 10).toFixed(1)}s`],
          { score: this.sim.score, details: { seconds: Math.floor(this.sim.time) } },
          700,
        );
      }
    }
  }

  private draw(lean: number): void {
    const g = this.g.clear();
    const s = this.sim;
    const tip = s.tip(BASE_Y);
    // Wind streaks.
    if (Math.abs(s.wind) > 0.2) {
      g.lineStyle(3, 0xe0f2fe, Math.min(0.6, Math.abs(s.wind) / 4));
      for (let i = 0; i < 6; i++) {
        const y = 320 + i * 110;
        const x = ((this.time.now / 3) * Math.sign(s.wind) + i * 150) % GAME_WIDTH;
        g.lineBetween(x, y, x + 80 * Math.sign(s.wind), y);
      }
    }
    const danger = lean > 0.6 ? 0xef4444 : lean > 0.35 ? 0xfacc15 : 0xfef3c7;
    g.lineStyle(14, 0x78350f, 1).lineBetween(s.x, BASE_Y, tip.x, tip.y);
    g.lineStyle(6, danger, 1).lineBetween(s.x, BASE_Y, tip.x, tip.y);
    this.ball.setPosition(tip.x, tip.y - 24);
    // Fingertip.
    g.fillStyle(0xfcd34d, 1).fillRoundedRect(s.x - 26, BASE_Y, 52, 110, 24);
    g.fillStyle(0xfef3c7, 1).fillCircle(s.x, BASE_Y + 10, 20);
    g.fillStyle(0xffffff, 0.15).fillRect(0, BASE_Y + 110, GAME_WIDTH, 6);
  }
}
