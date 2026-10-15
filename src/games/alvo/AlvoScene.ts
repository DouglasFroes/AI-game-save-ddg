import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { headKey } from '@/games/crush/art';
import { favoriteKid } from '@/games/favoriteKid';
import { Tex } from '@/platform/art/textures';
import { formatNumber } from '@/platform/ranking';
import type { GameOverData } from '@/platform/scenes/GameOverScene';
import { addText, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { drawPencil } from './art';
import { AlvoSim, FLIGHT_S, IMPACT, type AlvoEvent } from './core';

const CX = GAME_WIDTH / 2;
const CY = 520;
const R = 160;
const START_Y = 1080;

/** "Acerta o Alvo": throw pencils into the spinning cookie without hitting the others. */
export class AlvoScene extends Phaser.Scene {
  private sim = new AlvoSim();
  private target!: Phaser.GameObjects.Container;
  private cookie!: Phaser.GameObjects.Graphics;
  private pins!: Phaser.GameObjects.Graphics;
  private hud!: { score: Phaser.GameObjects.Text; level: Phaser.GameObjects.Text };
  private ended = false;

  constructor() {
    super(SceneKeys.Alvo);
  }

  init(): void {
    this.sim = new AlvoSim();
    this.ended = false;
  }

  create(): void {
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x1d2b53, 0x1d2b53, 0x3a0ca3, 0x3a0ca3, 1).fillRect(
      0,
      0,
      GAME_WIDTH,
      1280,
    );
    this.cookie = this.add.graphics();
    this.cookie.fillStyle(0x8d5524).fillCircle(0, 0, R + 6);
    this.cookie.fillStyle(0xd9a066).fillCircle(0, 0, R);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const d = 60 + (i % 3) * 30;
      this.cookie.fillStyle(0x3d2c22).fillCircle(Math.cos(a) * d, Math.sin(a) * d, 9);
    }
    this.cookie.fillStyle(0xffffff, 0.9).fillCircle(0, 0, 62);
    const face = this.add.image(0, 4, headKey(favoriteKid() % 6)).setScale(1.05);
    this.target = this.add.container(CX, CY, [this.cookie, face]).setDepth(3);
    this.pins = this.add.graphics().setDepth(2);
    iconButton(this, 60, 60, '‹', () => this.scene.start(SceneKeys.Hub)).setDepth(10);
    this.hud = {
      score: addText(this, CX, 120, '0', 72, { color: '#ffd23f' }).setDepth(10),
      level: addText(this, CX, 200, 'FASE 1', 30, { color: COLORS.textLight }).setDepth(10),
    };
    addText(this, CX, 1210, 'Toque para atirar o lápis', 28, { color: '#ffffffaa' });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y > 130 && !this.ended) {
        this.sim.throw();
        getServices(this).sfx.play('click');
      }
    });
    this.input.keyboard?.on('keydown-SPACE', () => this.sim.throw());
    if (import.meta.env.DEV) (window as unknown as { __alvo?: AlvoScene }).__alvo = this;
  }

  override update(_t: number, deltaMs: number): void {
    if (!this.ended)
      for (const e of this.sim.step(Math.min(deltaMs / 1000, 1 / 30))) this.onEvent(e);
    this.target.setRotation(this.sim.angle);
    const g = this.pins.clear();
    const a = this.sim.angle;
    for (const s of this.sim.stuck) {
      const ang = s + a;
      drawPencil(g, CX + Math.cos(ang) * (R - 22), CY + Math.sin(ang) * (R - 22), ang);
    }
    for (const f of this.sim.fruit) {
      const ang = f + a;
      const x = CX + Math.cos(ang) * (R + 18);
      const y = CY + Math.sin(ang) * (R + 18);
      g.fillStyle(0xe63946).fillCircle(x, y, 20);
      g.fillStyle(0x2ecc71).fillEllipse(x + 6, y - 20, 14, 8);
    }
    // The pencil waiting (or flying) at the bottom.
    if (!this.ended && this.sim.left > 0) {
      const k = this.sim.flying === null ? 0 : 1 - this.sim.flying / FLIGHT_S;
      const tipY = Phaser.Math.Linear(START_Y, CY + R - 22 + (IMPACT ? 0 : 0), k);
      drawPencil(g, CX, tipY, Math.PI / 2);
    }
    // Pencils left in this level.
    for (let i = 0; i < this.sim.left - 1; i++) drawPencil(g, 60, 1150 - i * 34, 0, 60);
    this.hud.score.setText(formatNumber(this.sim.score));
    this.hud.level.setText(`FASE ${this.sim.level}`);
  }

  private onEvent(e: AlvoEvent): void {
    const { sfx } = getServices(this);
    switch (e.type) {
      case 'stick':
        sfx.play('pop');
        this.tweens.add({ targets: this.target, y: CY - 10, duration: 50, yoyo: true });
        break;
      case 'apple':
        sfx.play('star', 3);
        break;
      case 'level': {
        sfx.play('win');
        const burst = this.add.particles(CX, CY, Tex.dot, {
          speed: { min: 200, max: 600 },
          lifespan: 600,
          scale: { start: 2, end: 0 },
          tint: [0xd9a066, 0x8d5524, 0x3d2c22],
          emitting: false,
        });
        burst.setDepth(6).explode(40);
        this.time.delayedCall(700, () => burst.destroy());
        const t = addText(this, CX, CY, `FASE ${e.level}!`, 80, {
          color: '#ffd23f',
          stroke: '#1d2b53',
          strokeThickness: 12,
        }).setDepth(8);
        this.tweens.add({
          targets: t,
          scale: { from: 0.4, to: 1.1 },
          alpha: { from: 1, to: 0 },
          duration: 1100,
          onComplete: () => t.destroy(),
        });
        this.target.setScale(0.2);
        this.tweens.add({ targets: this.target, scale: 1, duration: 350, ease: 'Back.easeOut' });
        break;
      }
      case 'over':
        this.gameOver();
        break;
    }
  }

  private gameOver(): void {
    this.ended = true;
    const { sfx } = getServices(this);
    sfx.play('hit');
    sfx.vibrate([60, 30, 60]);
    this.cameras.main.shake(220, 0.012);
    const bounce = this.add.graphics().setDepth(5);
    drawPencil(bounce, 0, 0, Math.PI / 2);
    bounce.setPosition(CX, CY + R);
    this.tweens.add({ targets: bounce, x: CX + 160, y: 1300, angle: 380, duration: 700 });
    const data: GameOverData = {
      gameId: 'alvo',
      title: 'Bateu no lápis!',
      lines: [`Fase ${this.sim.level} · Maçãs: ${this.sim.apples}`],
      record: { score: this.sim.score, details: { level: this.sim.level } },
      parent: SceneKeys.Alvo,
      retry: { scene: SceneKeys.Alvo },
    };
    this.time.delayedCall(1100, () => this.scene.launch(SceneKeys.GameOver, data));
  }
}
