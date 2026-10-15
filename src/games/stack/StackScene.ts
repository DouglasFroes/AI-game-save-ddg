import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import { bake } from '@/platform/art/textures';
import type { GameOverData } from '@/platform/scenes/GameOverScene';
import { addText, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { StackGame, type Layer } from './core';

export const STACK_ICON = 'stack-icon';

const H = 56;
const SIDE = 14;
const BASE_Y = 1150;
const FOCUS_Y = 640;
const MAX_DT = 1 / 30;

const hueAt = (i: number, start: number) => (start + i * 7) % 360;
const hsl = (h: number, s: number, l: number) =>
  Phaser.Display.Color.HSLToColor(h / 360, s, l).color;

export function generateStackTextures(scene: Phaser.Scene): void {
  bake(scene, STACK_ICON, 150, 150, (g) => {
    g.fillStyle(0x1d2b53).fillRoundedRect(0, 0, 150, 150, 22);
    const widths = [110, 96, 96, 80, 70, 70];
    widths.forEach((w, i) => {
      const y = 122 - i * 18;
      const x = 75 - w / 2 + (i % 2 ? 4 : -2);
      g.fillStyle(hsl(hueAt(i, 190), 0.55, 0.45)).fillRect(x, y + 12, w, 5);
      g.fillStyle(hsl(hueAt(i, 190), 0.55, 0.62)).fillRect(x, y, w, 13);
    });
  });
}

export class StackScene extends Phaser.Scene {
  private game_ = new StackGame();
  private startHue = 0;
  private moving!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private started = false;
  private ended = false;

  constructor() {
    super(SceneKeys.Stack);
  }

  init(): void {
    this.game_ = new StackGame();
    this.startHue = Math.floor(Math.random() * 360);
    this.started = false;
    this.ended = false;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(hsl(this.startHue, 0.35, 0.2));
    const base = this.game_.layers[0]!;
    this.add
      .graphics()
      .fillStyle(hsl(this.startHue, 0.5, 0.42))
      .fillRect(base.x, BASE_Y - H, base.w, GAME_HEIGHT)
      .fillStyle(hsl(this.startHue, 0.55, 0.6))
      .fillRect(base.x, BASE_Y - H, base.w, H - SIDE);

    this.moving = this.add.graphics().setDepth(5);
    this.scoreText = addText(this, GAME_WIDTH / 2, 190, '0', 120, {
      color: COLORS.textLight,
      stroke: '#00000044',
      strokeThickness: 10,
    })
      .setScrollFactor(0)
      .setDepth(20);
    this.hint = addText(this, GAME_WIDTH / 2, 330, 'Toque para soltar o bloco', 36, {
      color: COLORS.textLight,
    })
      .setScrollFactor(0)
      .setDepth(20);
    iconButton(this, 66, 66, '‹', () => this.scene.start(SceneKeys.Hub))
      .setScrollFactor(0)
      .setDepth(30);

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y < 130 && p.x < 130) return;
      this.drop();
    });
    this.input.keyboard?.on('keydown-SPACE', () => this.drop());
    if (import.meta.env.DEV) (window as unknown as { __stack?: StackScene }).__stack = this;
  }

  private layerY(index: number): number {
    return BASE_Y - (index + 1) * H;
  }

  private drawBlock(g: Phaser.GameObjects.Graphics, layer: Layer, index: number): void {
    const y = this.layerY(index);
    const hue = hueAt(index, this.startHue);
    g.fillStyle(hsl(hue, 0.5, 0.42)).fillRect(layer.x, y + H - SIDE, layer.w, SIDE);
    g.fillStyle(hsl(hue, 0.55, 0.6)).fillRect(layer.x, y, layer.w, H - SIDE);
    g.fillStyle(0xffffff, 0.18).fillRect(layer.x, y, layer.w, 6);
  }

  override update(_t: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, MAX_DT);
    if (!this.ended) this.game_.step(dt);
    const g = this.moving.clear();
    if (!this.ended) this.drawBlock(g, this.game_.current, this.game_.layers.length);

    const cam = this.cameras.main;
    const target = Math.min(0, this.layerY(this.game_.layers.length) - FOCUS_Y);
    if (!this.ended) cam.scrollY += (target - cam.scrollY) * Math.min(1, dt * 6);
  }

  private drop(): void {
    if (this.ended) return;
    if (!this.started) {
      this.started = true;
      this.hint.destroy();
    }
    const index = this.game_.layers.length;
    const { sfx } = getServices(this);
    const result = this.game_.drop();

    if (result.cut) this.fall(result.cut, index);
    if (!result.placed) {
      this.end();
      return;
    }

    const g = this.add.graphics();
    this.drawBlock(g, result.placed, index);
    this.scoreText.setText(String(this.game_.score));
    this.cameras.main.setBackgroundColor(hsl(hueAt(index, this.startHue), 0.35, 0.2));

    if (result.perfect) {
      sfx.play('star', Math.min(4, this.game_.streak - 1));
      sfx.vibrate(15);
      const ring = this.add
        .rectangle(
          result.placed.x + result.placed.w / 2,
          this.layerY(index) + H / 2,
          result.placed.w,
          H,
        )
        .setStrokeStyle(6, 0xffffff)
        .setDepth(6);
      this.tweens.add({
        targets: ring,
        scaleX: 1.15,
        scaleY: 1.6,
        alpha: 0,
        duration: 450,
        onComplete: () => ring.destroy(),
      });
      if (this.game_.streak >= 2) {
        const t = addText(
          this,
          GAME_WIDTH / 2,
          this.layerY(index) - 40,
          `Perfeito x${this.game_.streak}!`,
          40,
          {
            color: '#ffffff',
          },
        ).setDepth(7);
        this.tweens.add({
          targets: t,
          y: t.y - 80,
          alpha: 0,
          duration: 800,
          onComplete: () => t.destroy(),
        });
      }
    } else {
      sfx.play('pop');
    }
  }

  /** The trimmed piece tumbles off the screen. */
  private fall(piece: Layer, index: number): void {
    const hue = hueAt(index, this.startHue);
    const rect = this.add
      .rectangle(piece.x + piece.w / 2, this.layerY(index) + H / 2, piece.w, H, hsl(hue, 0.55, 0.6))
      .setDepth(4);
    const dir = piece.x + piece.w / 2 < GAME_WIDTH / 2 ? -1 : 1;
    this.tweens.add({
      targets: rect,
      y: rect.y + 900,
      x: rect.x + dir * 120,
      angle: dir * 70,
      alpha: 0,
      duration: 1000,
      ease: 'Quad.easeIn',
      onComplete: () => rect.destroy(),
    });
  }

  private end(): void {
    this.ended = true;
    const { sfx } = getServices(this);
    sfx.play('hit');
    this.cameras.main.shake(200, 0.01);

    // Zoom out to show the whole tower.
    const towerTop = this.layerY(this.game_.layers.length);
    const height = BASE_Y - towerTop + 200;
    const zoom = Math.min(1, GAME_HEIGHT / height);
    this.tweens.add({
      targets: this.cameras.main,
      zoom,
      scrollY: (towerTop + BASE_Y) / 2 - GAME_HEIGHT / 2,
      duration: 900,
      ease: 'Sine.easeInOut',
    });

    const data: GameOverData = {
      gameId: 'stack',
      title: 'A torre parou!',
      lines: [`Andares: ${this.game_.score}`, `Encaixes perfeitos: ${this.game_.perfects}`],
      record: { score: this.game_.score, details: { perfects: this.game_.perfects } },
      parent: SceneKeys.Stack,
      retry: { scene: SceneKeys.Stack },
    };
    this.time.delayedCall(1300, () => this.scene.launch(SceneKeys.GameOver, data));
  }
}
