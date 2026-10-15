import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { kidKey } from '@/games/bomba/art';
import { favoriteKid } from '@/games/favoriteKid';
import { formatNumber } from '@/platform/ranking';
import type { GameOverData } from '@/platform/scenes/GameOverScene';
import { addText, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { PLATFORM_W, PulaSim, type PulaEvent } from './core';

const GROUND = 1180;
/** Kid pixels moved per finger pixel. */
const DRAG_GAIN = 1.4;

/** "Pula Pula": bounce up the notebook page, steering left and right. */
export class PulaScene extends Phaser.Scene {
  private sim = new PulaSim();
  private kid = 0;
  private paper!: Phaser.GameObjects.Graphics;
  private plats!: Phaser.GameObjects.Graphics;
  private kidImg!: Phaser.GameObjects.Image;
  private scoreText!: Phaser.GameObjects.Text;
  private ended = false;
  private started = false;
  private facing = 1;
  private drag: { id: number; lastX: number } | null = null;
  /** Finger movement not applied yet (pixels). */
  private pending = 0;

  constructor() {
    super(SceneKeys.Pula);
  }

  init(): void {
    this.sim = new PulaSim();
    this.kid = favoriteKid();
    this.ended = false;
    this.started = false;
    this.drag = null;
    this.pending = 0;
  }

  private sy(y: number): number {
    return GROUND - (y - this.sim.camera);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0xfdf6e3);
    this.paper = this.add.graphics();
    this.plats = this.add.graphics().setDepth(2);
    this.kidImg = this.add
      .image(0, 0, kidKey(this.kid, 0))
      .setOrigin(0.5, 0.95)
      .setScale(0.75)
      .setDepth(3);
    iconButton(this, 60, 60, '‹', () => this.scene.start(SceneKeys.Hub)).setDepth(10);
    this.scoreText = addText(this, GAME_WIDTH / 2, 64, '0', 58, { color: '#3a5a9b' }).setDepth(10);
    const hint = addText(
      this,
      GAME_WIDTH / 2,
      560,
      'Arraste o dedo para os lados\npara guiar o pulo!',
      34,
      { color: '#3a5a9b', stroke: '#ffffff', strokeThickness: 8 },
    ).setDepth(10);
    // Drag anywhere: the kid follows the finger's sideways movement (relative, like a trackpad).
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y < 130) return;
      this.drag = { id: p.id, lastX: p.x };
      if (!this.started) {
        hint.destroy();
        this.started = true;
      }
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.drag?.id !== p.id) return;
      this.pending += (p.x - this.drag.lastX) * DRAG_GAIN;
      this.drag.lastX = p.x;
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (this.drag?.id === p.id) this.drag = null;
    };
    this.input.on(Phaser.Input.Events.POINTER_UP, release);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, release);
    this.input.keyboard?.once('keydown', () => {
      hint.destroy();
      this.started = true;
    });
    if (import.meta.env.DEV) (window as unknown as { __pula?: PulaScene }).__pula = this;
  }

  private keyDir(): number {
    const kb = this.input.keyboard;
    if (kb?.checkDown(kb.addKey('LEFT'))) return -1;
    if (kb?.checkDown(kb.addKey('RIGHT'))) return 1;
    return 0;
  }

  override update(_t: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 1 / 30);
    if (this.started && !this.ended) {
      const dir = this.keyDir();
      const nudge = this.pending;
      this.pending = 0;
      if (dir || Math.abs(nudge) > 0.5) this.facing = dir || Math.sign(nudge);
      for (const e of this.sim.step(dt, dir, nudge)) this.onEvent(e);
    }
    // Notebook lines scroll with the camera.
    const g = this.paper.clear();
    const off = this.sim.camera % 44;
    g.lineStyle(2, 0xbcd4f6);
    for (let y = -44 + off; y < 1280; y += 44) g.lineBetween(0, y, GAME_WIDTH, y);
    g.lineStyle(3, 0xf4a6a6).lineBetween(70, 0, 70, 1280);

    const p = this.plats.clear();
    for (const pl of this.sim.platforms) {
      const y = this.sy(pl.y);
      if (y < -40 || y > 1320) continue;
      if (pl.broken) continue;
      const color = { normal: 0x5bd46f, moving: 0x4cc9f0, fragile: 0xb08968, spring: 0x5bd46f }[
        pl.kind
      ];
      p.fillStyle(0x1f1f2b, 0.85).fillRoundedRect(pl.x - PLATFORM_W / 2, y - 2, PLATFORM_W, 28, 14);
      p.fillStyle(color).fillRoundedRect(pl.x - PLATFORM_W / 2 + 3, y, PLATFORM_W - 6, 22, 11);
      if (pl.kind === 'fragile')
        p.lineStyle(3, 0x6d4c41).lineBetween(pl.x - 10, y, pl.x + 6, y + 22);
      if (pl.kind === 'spring') {
        p.lineStyle(5, 0x9aa5b8);
        for (let i = 0; i < 3; i++)
          p.lineBetween(pl.x - 12, y - 6 - i * 8, pl.x + 12, y - 10 - i * 8);
        p.fillStyle(0xe63946).fillRoundedRect(pl.x - 16, y - 32, 32, 8, 4);
      }
    }
    const kx = this.sim.x;
    this.kidImg
      .setPosition(kx, this.sy(this.sim.y))
      .setFlipX(this.facing < 0)
      .setTexture(kidKey(this.kid, this.sim.vy > 0 ? 1 : 0));
    this.scoreText.setText(formatNumber(this.sim.score));
  }

  private onEvent(e: PulaEvent): void {
    const { sfx } = getServices(this);
    if (e.type === 'bounce') {
      sfx.play(e.kind === 'spring' ? 'win' : 'pop', e.kind === 'spring' ? 0 : 2);
      this.tweens.add({
        targets: this.kidImg,
        scaleY: { from: 0.55, to: 0.75 },
        scaleX: { from: 0.9, to: 0.75 },
        duration: 160,
      });
    } else if (e.type === 'break') sfx.play('click');
    else this.gameOver();
  }

  private gameOver(): void {
    this.ended = true;
    getServices(this).sfx.play('hit');
    const data: GameOverData = {
      gameId: 'pula',
      title: 'Caiu da folha!',
      lines: [`Altura: ${formatNumber(this.sim.score)}`],
      record: { score: this.sim.score, details: {} },
      parent: SceneKeys.Pula,
      retry: { scene: SceneKeys.Pula },
    };
    this.time.delayedCall(700, () => this.scene.launch(SceneKeys.GameOver, data));
  }
}
