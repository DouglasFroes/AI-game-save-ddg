import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { Tex } from '@/platform/art/textures';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  BALL_R,
  brickRect,
  clampAimAngle,
  DANGER_Y,
  LAUNCH_Y,
  orbCenter,
  PLAY_LEFT,
  PLAY_RIGHT,
  PLAY_TOP,
  RicocheteSim,
  type RicocheteEvent,
} from './core';

function brickColorForHp(hp: number): number {
  if (hp <= 2) return 0x2ec4b6;
  if (hp <= 5) return 0x5bd46f;
  if (hp <= 10) return 0xffd23f;
  if (hp <= 20) return 0xff7b25;
  if (hp <= 35) return 0xff4d6d;
  return 0x9d4edd;
}

/** "Ricochete Infinito": drag to aim your ball stream, release to shatter numbered blocks. */
export class RicocheteScene extends MiniScene {
  private sim = new RicocheteSim();
  private g!: Phaser.GameObjects.Graphics;
  private brickTexts = new Map<number, Phaser.GameObjects.Text>();
  private turnLabel!: Phaser.GameObjects.Text;
  private ballCountLabel!: Phaser.GameObjects.Text;
  private recallBtn!: Button;
  private aimAngle: number | null = null;
  private clock = 0;

  constructor() {
    super(SceneKeys.Ricochete, 'ricochete', [0x090d16, 0x1b263b]);
  }

  create(): void {
    this.sim = new RicocheteSim();
    this.brickTexts.clear();
    this.aimAngle = null;
    this.clock = 0;
    this.frame('0');

    this.g = this.add.graphics().setDepth(5);
    this.turnLabel = addText(this, 160, 156, 'Rodada 1', 30, {
      color: '#94a3b8',
      stroke: '#090d16',
    }).setDepth(30);

    this.ballCountLabel = addText(this, GAME_WIDTH - 150, 156, '⚪ ×1', 32, {
      color: '#ffd23f',
      stroke: '#090d16',
    }).setDepth(30);

    this.recallBtn = new Button(
      this,
      GAME_WIDTH / 2,
      1185,
      '⏬ Recolher Bolas',
      () => {
        if (this.sim.phase === 'firing') {
          getServices(this).sfx.play('click');
          for (const e of this.sim.recallBalls()) this.handle(e);
          this.syncLabels();
        }
      },
      {
        width: 340,
        height: 76,
        fontSize: 28,
        color: COLORS.secondary,
        shade: COLORS.secondaryDark,
      },
    );
    this.recallBtn.setVisible(false);

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.ended || this.sim.phase !== 'aim' || p.y < PLAY_TOP || p.y > 1130) return;
      this.updateAim(p);
    });

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.ended || this.sim.phase !== 'aim' || !p.isDown) return;
      this.updateAim(p);
    });

    const release = () => {
      if (this.ended || this.sim.phase !== 'aim' || this.aimAngle === null) return;
      const angle = this.aimAngle;
      this.aimAngle = null;
      for (const e of this.sim.shoot(angle)) this.handle(e);
    };

    this.input.on(Phaser.Input.Events.POINTER_UP, release);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, release);

    this.syncLabels();
    this.draw();
  }

  private updateAim(p: Phaser.Input.Pointer): void {
    const dx = p.x - this.sim.launchX;
    const dy = p.y - LAUNCH_Y;
    // Allow dragging either above the ball (direct aim) or pulling down like a slingshot
    const raw = dy > 20 ? Math.atan2(-dy, -dx) : Math.atan2(dy, dx);
    this.aimAngle = clampAimAngle(raw);
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    this.clock += dt;

    if (this.sim.phase === 'firing') {
      for (const ev of this.sim.step(dt)) this.handle(ev);
    }

    this.recallBtn.setVisible(this.sim.phase === 'firing');
    this.setScore(this.sim.score);
    this.syncLabels();
    this.draw();
  }

  private handle(ev: RicocheteEvent): void {
    const { sfx } = getServices(this);
    switch (ev.type) {
      case 'launch':
        sfx.play('start');
        break;
      case 'hit':
        sfx.play('click');
        break;
      case 'break': {
        sfx.play('pop', 3);
        const p = this.add.particles(ev.x, ev.y, Tex.dot, {
          speed: { min: 90, max: 280 },
          lifespan: 340,
          scale: { start: 0.9, end: 0 },
          tint: [0xffd23f, 0xff4d6d, 0x38bdf8],
          emitting: false,
        });
        p.setDepth(20).explode(10);
        this.time.delayedCall(380, () => p.destroy());
        break;
      }
      case 'extraBall':
        sfx.play('star', 1);
        this.pop(ev.x, ev.y, '+1 BOLA!', '#5bd46f', 28);
        break;
      case 'turnEnd':
        this.turnLabel.setText(`Rodada ${ev.turn}`);
        this.ballCountLabel.setText(`⚪ ×${this.sim.ballCount}`);
        break;
      case 'gameOver':
        this.finish(
          'Os blocos chegaram ao chão!',
          [
            `Rodadas: ${this.sim.turn}`,
            `Bolas: ${this.sim.ballCount} · Blocos: ${this.sim.destroyed}`,
          ],
          {
            score: this.sim.score,
            details: { turns: this.sim.turn, balls: this.sim.ballCount },
          },
        );
        break;
    }
  }

  private syncLabels(): void {
    const aliveIds = new Set(this.sim.bricks.map((b) => b.id));
    for (const [id, txt] of this.brickTexts) {
      if (!aliveIds.has(id)) {
        txt.destroy();
        this.brickTexts.delete(id);
      }
    }
    for (const br of this.sim.bricks) {
      const r = brickRect(br.col, br.row);
      let txt = this.brickTexts.get(br.id);
      if (!txt) {
        txt = addText(this, r.x + r.w / 2, r.y + r.h / 2, String(br.hp), 28, {
          color: '#090d16',
        }).setDepth(12);
        this.brickTexts.set(br.id, txt);
      }
      txt.setPosition(r.x + r.w / 2, r.y + r.h / 2);
      txt.setText(String(br.hp));
    }
  }

  private draw(): void {
    const g = this.g.clear();

    // Arena frame
    g.fillStyle(0x0b132b, 0.75).fillRoundedRect(
      PLAY_LEFT - 6,
      PLAY_TOP - 6,
      PLAY_RIGHT - PLAY_LEFT + 12,
      LAUNCH_Y - PLAY_TOP + 24,
      16,
    );
    g.lineStyle(4, 0x334155).strokeRoundedRect(
      PLAY_LEFT - 6,
      PLAY_TOP - 6,
      PLAY_RIGHT - PLAY_LEFT + 12,
      LAUNCH_Y - PLAY_TOP + 24,
      16,
    );

    // Danger line
    g.lineStyle(3, 0xff4d6d, 0.55);
    for (let x = PLAY_LEFT + 10; x < PLAY_RIGHT - 15; x += 26) {
      g.lineBetween(x, DANGER_Y, x + 14, DANGER_Y);
    }

    // Bricks
    for (const br of this.sim.bricks) {
      const r = brickRect(br.col, br.row);
      const color = brickColorForHp(br.hp);
      g.fillStyle(0x000000, 0.3).fillRoundedRect(r.x + 3, r.y + 5, r.w, r.h, 12);
      g.fillStyle(color).fillRoundedRect(r.x, r.y, r.w, r.h, 12);
      g.fillStyle(0xffffff, 0.25).fillRoundedRect(r.x + 6, r.y + 5, r.w - 12, 10, 5);
    }

    // Bonus ball orbs (+1)
    const pulse = 1 + Math.sin(this.clock * 7) * 0.14;
    for (const orb of this.sim.orbs) {
      const c = orbCenter(orb.col, orb.row);
      g.lineStyle(4, 0x5bd46f, 0.85).strokeCircle(c.x, c.y, 18 * pulse);
      g.fillStyle(0xffffff).fillCircle(c.x, c.y, 10);
    }

    // Aim trajectory dots
    if (this.sim.phase === 'aim' && this.aimAngle !== null) {
      const cos = Math.cos(this.aimAngle);
      const sin = Math.sin(this.aimAngle);
      g.fillStyle(0xffd23f, 0.85);
      for (let step = 1; step <= 16; step++) {
        const px = this.sim.launchX + cos * step * 34;
        const py = LAUNCH_Y + sin * step * 34;
        if (px < PLAY_LEFT + 8 || px > PLAY_RIGHT - 8 || py < PLAY_TOP + 8) break;
        g.fillCircle(px, py, Math.max(3, 8 - step * 0.25));
      }
    }

    // Launcher base & balls
    g.fillStyle(0xffd23f).fillCircle(this.sim.launchX, LAUNCH_Y, BALL_R + 2);
    if (this.sim.nextLaunchX !== null) {
      g.lineStyle(3, 0x38bdf8, 0.8).strokeCircle(this.sim.nextLaunchX, LAUNCH_Y, BALL_R + 4);
    }

    g.fillStyle(0xffffff);
    for (const b of this.sim.balls) {
      if (b.active) g.fillCircle(b.x, b.y, BALL_R);
    }
  }
}
