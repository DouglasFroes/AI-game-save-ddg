import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { ambient, banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { heartsLabel, MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  ARENA_BOTTOM,
  ARENA_LEFT,
  ARENA_RIGHT,
  ARENA_TOP,
  AsteroidesSim,
  type AsteroidEvent,
} from './core';

export class AsteroidesScene extends MiniScene {
  private sim = new AsteroidesSim();
  private g!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private aiming = false;
  private aimX = 360;
  private aimY = 400;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Asteroides, 'asteroides', [0x090d16, 0x1e1b4b]);
  }

  create(): void {
    this.sim = new AsteroidesSim();
    this.aiming = false;
    this.frame('0');
    ambient(this, 0xc4b5fd, 24);

    this.statusText = addText(this, GAME_WIDTH / 2, 165, '', 28, {
      color: '#ddd6fe',
      stroke: '#090d16',
      strokeThickness: 6,
    }).setDepth(50);

    this.livesText = addText(this, GAME_WIDTH / 2, 206, '', 32, {
      color: '#ffffff',
    }).setDepth(50);

    this.g = this.add.graphics().setDepth(5);

    new Button(
      this,
      GAME_WIDTH / 2,
      1190,
      '🚀 Impulso Turbo',
      () => {
        if (this.ended) return;
        this.hintBox?.dismiss();
        this.sim.thrust();
        getServices(this).sfx.play('zap');
        burst(this, this.sim.shipX, this.sim.shipY, 0x38bdf8, 12, { speed: 200, size: 5 });
      },
      {
        width: 360,
        height: 88,
        fontSize: 30,
        color: 0x8b5cf6,
        shade: 0x5b21b6,
      },
    ).setDepth(50);

    this.hintBox = hint(
      this,
      ['Toque ou segure no espaço para mirar e atirar', 'Use o Impulso para escapar das rochas!'],
      1060,
      4500,
    );

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.ended || p.y < ARENA_TOP || p.y > ARENA_BOTTOM) return;
      this.hintBox?.dismiss();
      this.aiming = true;
      this.aimX = p.x;
      this.aimY = p.y;
      if (this.sim.aimAndFire(p.x, p.y)) {
        getServices(this).sfx.play('tick');
      }
    });

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.ended || !p.isDown) return;
      this.aimX = p.x;
      this.aimY = p.y;
    });

    this.input.on(Phaser.Input.Events.POINTER_UP, () => {
      this.aiming = false;
    });
  }

  override update(time: number, deltaMs: number): void {
    if (this.ended) return;
    if (this.aiming) {
      if (this.sim.aimAndFire(this.aimX, this.aimY)) {
        getServices(this).sfx.play('tick');
      }
    }

    const events = this.sim.step(Math.min(deltaMs, 50) / 1000);
    for (const ev of events) this.handleEvent(ev);

    this.setScore(this.sim.score);
    this.statusText.setText(
      `Onda ${this.sim.wave}   ·   ☄️ ${this.sim.rocksDestroyed} destruídos   ·   Restam: ${this.sim.rocks.length}`,
    );
    this.livesText.setText(heartsLabel(this.sim.lives, 3));
    this.redraw(time);
  }

  private handleEvent(ev: AsteroidEvent): void {
    const { sfx } = getServices(this);
    switch (ev.type) {
      case 'rockSplit':
        sfx.play(ev.size === 1 ? 'pop' : 'boom');
        sfx.vibrate(18);
        burst(this, ev.x, ev.y, ev.size === 1 ? 0x38bdf8 : 0xc084fc, 14, { speed: 260 });
        this.pop(ev.x, ev.y, `+${ev.points}`, '#e9d5ff', 34);
        break;
      case 'shipHit':
        sfx.play('hit');
        sfx.vibrate([50, 30, 50]);
        flash(this, 0xf43f5e, 0.32, 240);
        this.cameras.main.shake(220, 0.01);
        shockwave(this, ev.x, ev.y, 0xf43f5e, 140);
        break;
      case 'waveCleared':
        sfx.play('level');
        banner(this, `ONDA ${ev.wave}!`, '#c084fc');
        this.pop(GAME_WIDTH / 2, 480, `BÔNUS +${ev.bonus}`, '#fde047', 42);
        break;
      case 'gameOver':
        this.finish(
          'Nave destruída!',
          [`Rochas destruídas: ${this.sim.rocksDestroyed}`, `Onda alcançada: ${this.sim.wave}`],
          {
            score: this.sim.score,
            details: { rocks: this.sim.rocksDestroyed, wave: this.sim.wave },
          },
        );
        break;
    }
  }

  private redraw(time: number): void {
    const g = this.g.clear();
    const w = ARENA_RIGHT - ARENA_LEFT;
    const h = ARENA_BOTTOM - ARENA_TOP;

    g.fillStyle(0x030712, 0.86).fillRoundedRect(ARENA_LEFT, ARENA_TOP, w, h, 24);
    g.lineStyle(3, 0x8b5cf6, 0.5).strokeRoundedRect(ARENA_LEFT, ARENA_TOP, w, h, 24);

    // Rocks
    for (const r of this.sim.rocks) {
      const col = r.size === 3 ? 0xa855f7 : r.size === 2 ? 0xec4899 : 0x38bdf8;
      g.fillStyle(col, 0.22).fillCircle(r.x, r.y, r.radius);
      g.lineStyle(4, col, 0.95).strokeCircle(r.x, r.y, r.radius);
      g.fillStyle(0xffffff, 0.35).fillCircle(
        r.x - r.radius * 0.28,
        r.y - r.radius * 0.28,
        r.radius * 0.22,
      );
    }

    // Laser bolts
    for (const b of this.sim.bolts) {
      g.fillStyle(0x38bdf8).fillCircle(b.x, b.y, 6);
      g.fillStyle(0xffffff).fillCircle(b.x, b.y, 3);
    }

    // Player Ship
    const blink = this.sim.invuln > 0 && Math.floor(time / 90) % 2 === 0;
    if (!blink) {
      const a = this.sim.shipAngle;
      const sx = this.sim.shipX;
      const sy = this.sim.shipY;
      const noseX = sx + Math.cos(a) * 24;
      const noseY = sy + Math.sin(a) * 24;
      const leftX = sx + Math.cos(a + 2.45) * 22;
      const leftY = sy + Math.sin(a + 2.45) * 22;
      const rightX = sx + Math.cos(a - 2.45) * 22;
      const rightY = sy + Math.sin(a - 2.45) * 22;

      g.fillStyle(0x38bdf8, 0.3).fillTriangle(noseX, noseY, leftX, leftY, rightX, rightY);
      g.lineStyle(4, 0x38bdf8, 1).strokeTriangle(noseX, noseY, leftX, leftY, rightX, rightY);
      if (this.sim.invuln > 0) {
        g.lineStyle(2, 0xfde047, 0.65).strokeCircle(sx, sy, 32);
      }
    }
  }
}
