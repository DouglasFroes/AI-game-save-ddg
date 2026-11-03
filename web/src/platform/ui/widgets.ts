import Phaser from 'phaser';
import { COLORS, FONT_FAMILY, GAME_WIDTH } from '@/config';
import { getServices } from '@/services';
import { Tex } from '@/platform/art/textures';

export interface TextOptions {
  color?: string;
  stroke?: string;
  strokeThickness?: number;
  align?: 'left' | 'center' | 'right';
  wrapWidth?: number;
  weight?: 'normal' | 'bold';
  /** Overrides the shared font family (the hub uses its own display font). */
  family?: string;
}

/** Crisp, consistently styled text. */
export function addText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  value: string,
  size: number,
  opts: TextOptions = {},
): Phaser.GameObjects.Text {
  const text = scene.add.text(x, y, value, {
    fontFamily: opts.family ?? FONT_FAMILY,
    fontSize: `${size}px`,
    fontStyle: opts.weight ?? 'bold',
    color: opts.color ?? COLORS.text,
    stroke: opts.stroke ?? '#000000',
    strokeThickness: opts.stroke ? (opts.strokeThickness ?? Math.round(size / 6)) : 0,
    align: opts.align ?? 'center',
    wordWrap: opts.wrapWidth ? { width: opts.wrapWidth, useAdvancedWrap: true } : undefined,
    resolution: 2,
  });
  text.setOrigin(0.5);
  return text;
}

export interface ButtonOptions {
  width?: number;
  height?: number;
  color?: number;
  shade?: number;
  textColor?: string;
  fontSize?: number;
}

/** Chunky mobile-friendly button with press feedback and click sound. */
export class Button extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  readonly label: Phaser.GameObjects.Text;
  private enabled = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    onClick: () => void,
    opts: ButtonOptions = {},
  ) {
    super(scene, x, y);
    const w = opts.width ?? 420;
    const h = opts.height ?? 110;
    const color = opts.color ?? COLORS.primary;
    const shade = opts.shade ?? COLORS.primaryDark;

    this.bg = scene.add.graphics();
    this.bg.fillStyle(0x000000, 0.18).fillRoundedRect(-w / 2 + 4, -h / 2 + 10, w, h, 30);
    this.bg.fillStyle(shade).fillRoundedRect(-w / 2, -h / 2 + 8, w, h, 30);
    this.bg.fillStyle(color).fillRoundedRect(-w / 2, -h / 2, w, h, 30);
    this.bg.fillStyle(0xffffff, 0.25).fillRoundedRect(-w / 2 + 14, -h / 2 + 8, w - 28, h * 0.3, 16);

    this.label = addText(scene, 0, -2, text, opts.fontSize ?? 44, {
      color: opts.textColor ?? COLORS.textLight,
      stroke: '#00000055',
      strokeThickness: 6,
    });

    this.add([this.bg, this.label]);
    this.setSize(w, h + 8);
    this.setInteractive({ useHandCursor: true });

    this.on('pointerdown', () => {
      if (!this.enabled) return;
      this.setScale(0.94);
    });
    this.on('pointerout', () => this.setScale(1));
    this.on('pointerup', () => {
      if (!this.enabled) return;
      this.setScale(1);
      getServices(scene).sfx.play('click');
      onClick();
    });
    scene.add.existing(this);
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    this.setAlpha(enabled ? 1 : 0.5);
    return this;
  }
}

/** Round icon button (back, retry, sound…). */
export function iconButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  icon: string,
  onClick: () => void,
  color: number = COLORS.panel,
): Button {
  return new Button(scene, x, y, icon, onClick, {
    width: 88,
    height: 80,
    color,
    shade: 0xc7cfdc,
    textColor: COLORS.text,
    fontSize: 42,
  });
}

export function starRow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  earned: number,
  size = 40,
  gap = 6,
): Phaser.GameObjects.Image[] {
  return [0, 1, 2].map((i) =>
    scene.add
      .image(x + (i - 1) * (size + gap), y, i < earned ? Tex.star : Tex.starEmpty)
      .setDisplaySize(size, size),
  );
}

export function panel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number = COLORS.panel,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics({ x, y });
  g.fillStyle(0x000000, 0.2).fillRoundedRect(-w / 2 + 6, -h / 2 + 12, w, h, 36);
  g.fillStyle(color).fillRoundedRect(-w / 2, -h / 2, w, h, 36);
  return g;
}

/** Sky background with slowly drifting clouds. */
export function addBackground(scene: Phaser.Scene): void {
  scene.add.image(0, 0, Tex.bg).setOrigin(0);
  const clouds: Array<[number, number, number]> = [
    [120, 260, 0.9],
    [520, 420, 0.7],
    [300, 620, 0.55],
  ];
  for (const [x, y, s] of clouds) {
    const c = scene.add.image(x, y, Tex.cloud).setScale(s).setAlpha(0.85);
    scene.tweens.add({
      targets: c,
      x: { from: x, to: x + GAME_WIDTH + 200 },
      duration: 90000 / s,
      repeat: -1,
      onRepeat: () => c.setX(-200),
    });
  }
}

/**
 * A rounded countdown bar (full = all the time of the round, purple, red when nearly out) drawn
 * under the status line. `reset(cap)` sets what "full" means; without a cap it grows to the most
 * time seen, so bonuses never overflow it.
 */
export class TimeBar {
  private readonly g: Phaser.GameObjects.Graphics;
  private cap = 1;

  constructor(
    scene: Phaser.Scene,
    private readonly y = 214,
    private readonly fixedCap?: number,
  ) {
    this.g = scene.add.graphics().setDepth(50);
    if (fixedCap) this.cap = fixedCap;
  }

  /** A new round: `cap` seconds is a full bar. */
  reset(cap: number): void {
    this.cap = Math.max(1, cap);
  }

  set(timeLeft: number): void {
    if (!this.fixedCap) this.cap = Math.max(this.cap, timeLeft);
    const k = Math.max(0, Math.min(1, timeLeft / this.cap));
    const g = this.g.clear();
    g.fillStyle(0xffffff, 0.95).fillRoundedRect(60, this.y - 13, GAME_WIDTH - 120, 26, 13);
    g.fillStyle(k > 0.25 ? 0x7209b7 : 0xff3b3b, 1).fillRoundedRect(
      64,
      this.y - 9,
      Math.max(18, (GAME_WIDTH - 128) * k),
      18,
      9,
    );
  }
}
