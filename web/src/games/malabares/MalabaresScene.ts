import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { ambient, banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { emojiText, heartsLabel, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { FLOOR_Y, LEFT_WALL, MalabaresSim, RIGHT_WALL, type MalabaresEvent } from './core';

export class MalabaresScene extends MiniScene {
  private sim = new MalabaresSim();
  private g!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private starSprite!: Phaser.GameObjects.Text;
  private ballSprites = new Map<number, Phaser.GameObjects.Text>();
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Malabares, 'malabares', [0x500724, 0x1e1b4b]);
  }

  create(): void {
    this.sim = new MalabaresSim();
    this.ballSprites = new Map();
    this.frame('0');
    ambient(this, 0xf472b6, 20);

    this.statusText = addText(this, GAME_WIDTH / 2, 168, '', 30, {
      color: '#fbcfe8',
      stroke: '#500724',
      strokeThickness: 6,
    }).setDepth(50);

    this.livesText = addText(this, GAME_WIDTH / 2, 218, '', 34, {
      color: '#ffffff',
    }).setDepth(50);

    this.g = this.add.graphics().setDepth(5);
    this.starSprite = emojiText(this, this.sim.star.x, this.sim.star.y, '⭐', 64).setDepth(12);

    this.hintBox = hint(
      this,
      ['Toque nas bolas antes que caiam no chão!', 'A zona dourada dá bônus Perfeito!'],
      1155,
      4500,
    );

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.ended || p.y < 140) return;
      this.hintBox?.dismiss();
      for (const ev of this.sim.tap(p.x, p.y)) this.handleEvent(ev);
    });
  }

  override update(time: number, deltaMs: number): void {
    if (this.ended) return;
    for (const ev of this.sim.step(Math.min(deltaMs, 50) / 1000)) this.handleEvent(ev);

    this.setScore(this.sim.score);
    this.statusText.setText(
      `⚽ Bolas no ar: ${this.sim.balls.length}   ·   👟 Embaixadinhas: ${this.sim.kicks}`,
    );
    this.livesText.setText(heartsLabel(this.sim.lives, 3));
    this.syncSprites(time);
    this.redraw();
  }

  private handleEvent(ev: MalabaresEvent): void {
    const { sfx } = getServices(this);
    switch (ev.type) {
      case 'kicked':
        sfx.play(ev.perfect ? 'star' : 'bounce', Math.min(8, this.sim.balls.length));
        sfx.vibrate(14);
        burst(this, ev.x, ev.y, ev.perfect ? 0xfbbf24 : 0x38bdf8, 14, { speed: 240 });
        this.pop(
          ev.x,
          ev.y - 24,
          ev.perfect ? `PERFEITO +${ev.points}` : `+${ev.points}`,
          ev.perfect ? '#fde047' : '#bae6fd',
          36,
        );
        break;
      case 'starCollected':
        sfx.play('coin', 4);
        shockwave(this, ev.x, ev.y, 0xfde047, 110);
        burst(this, ev.x, ev.y, 0xfde047, 18, { speed: 280 });
        this.pop(ev.x, ev.y, `⭐ +${ev.points}`, '#fde047', 42);
        break;
      case 'newBall':
        sfx.play('level');
        banner(this, `${ev.count} BOLAS NO AR!`, '#f472b6');
        break;
      case 'dropped':
        sfx.play('hit');
        sfx.vibrate([50, 30, 50]);
        flash(this, 0xf43f5e, 0.28, 220);
        this.cameras.main.shake(180, 0.01);
        break;
      case 'gameOver':
        this.finish(
          'Caiu no chão!',
          [`Embaixadinhas: ${this.sim.kicks}`, `Máximo de bolas: ${this.sim.maxBalls}`],
          {
            score: this.sim.score,
            details: { kicks: this.sim.kicks, maxBalls: this.sim.maxBalls },
          },
        );
        break;
    }
  }

  private syncSprites(time: number): void {
    this.starSprite.setPosition(this.sim.star.x, this.sim.star.y + Math.sin(time / 220) * 6);

    const aliveIds = new Set(this.sim.balls.map((b) => b.id));
    for (const [id, sp] of this.ballSprites) {
      if (!aliveIds.has(id)) {
        sp.destroy();
        this.ballSprites.delete(id);
      }
    }
    for (const b of this.sim.balls) {
      let sp = this.ballSprites.get(b.id);
      if (!sp) {
        sp = emojiText(this, b.x, b.y, b.emoji, 76).setDepth(15);
        this.ballSprites.set(b.id, sp);
      }
      sp.setPosition(b.x, b.y);
      sp.setRotation(sp.rotation + b.vx * 0.0005);
    }
  }

  private redraw(): void {
    const g = this.g.clear();
    const w = RIGHT_WALL - LEFT_WALL + 56;
    const x0 = LEFT_WALL - 28;

    // Arena frame
    g.fillStyle(0x0f172a, 0.55).fillRoundedRect(x0, 265, w, FLOOR_Y - 265, 28);
    g.lineStyle(3, 0xf472b6, 0.45).strokeRoundedRect(x0, 265, w, FLOOR_Y - 265, 28);

    // Sweet spot zone (780..1030)
    g.fillStyle(0xfbbf24, 0.1).fillRect(x0 + 4, 780, w - 8, 250);
    g.lineStyle(2, 0xfbbf24, 0.45);
    g.lineBetween(x0 + 10, 780, x0 + w - 10, 780);
    g.lineBetween(x0 + 10, 1030, x0 + w - 10, 1030);

    // Danger floor line
    g.lineStyle(6, 0xf43f5e, 0.85).lineBetween(x0 + 12, FLOOR_Y, x0 + w - 12, FLOOR_Y);

    // Ball ground shadows & kick target rings
    for (const b of this.sim.balls) {
      const sweet = b.y >= 780 && b.y <= 1030;
      g.lineStyle(3, sweet ? 0xfde047 : b.color, sweet ? 0.85 : 0.35).strokeCircle(b.x, b.y, 48);
      const shadowScale = Phaser.Math.Clamp((b.y - 260) / (FLOOR_Y - 260), 0.25, 1);
      g.fillStyle(0x000000, 0.35 * shadowScale).fillEllipse(
        b.x,
        FLOOR_Y - 6,
        74 * shadowScale,
        16 * shadowScale,
      );
    }
  }
}
