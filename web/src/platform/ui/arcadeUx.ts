import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '@/config';
import { HUB_FONT } from '@/platform/fonts';
import { getServices } from '@/services';
import { avatarColorFor, hashString, prefersReducedMotion } from './arcadeFormat';
import {
  auroraBackground,
  BRAND,
  button3DArt,
  glassArt,
  glowBlob,
  mix,
  pillArt,
  UI,
} from './hubTheme';
import { drawIcon, type IconKind } from './icons';
import { addText, type TextOptions } from './widgets';

export * from './arcadeFormat';

/** Crisp text in the Sora display font. */
export function soraText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  value: string,
  size: number,
  opts: TextOptions = {},
): Phaser.GameObjects.Text {
  return addText(scene, x, y, value, size, { family: HUB_FONT, ...opts });
}

/** Shrinks a Phaser Text's font size until its width fits within `maxW`. */
export function fitText(t: Phaser.GameObjects.Text, maxW: number, minSize = 14): void {
  let px = parseInt(String(t.style.fontSize), 10);
  while (t.width > maxW && px > minSize) {
    px -= 2;
    t.setFontSize(px);
  }
}

/** Coloured additive halo behind an icon or card. */
export function addHalo(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: number,
  scale: number,
  alpha: number,
): Phaser.GameObjects.Image {
  return scene.add
    .image(x, y, glowBlob(scene))
    .setTint(color)
    .setScale(scale)
    .setAlpha(alpha)
    .setBlendMode(Phaser.BlendModes.ADD);
}

/** Soft expanding ring shockwave when a primary button or milestone triggers. */
export function pulseRing(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  color: number,
  startRadius = 40,
): void {
  if (prefersReducedMotion()) return;
  const ring = scene.add.circle(0, 0, startRadius).setStrokeStyle(4, color, 0.85);
  parent.add(ring);
  scene.tweens.add({
    targets: ring,
    scale: 3.1,
    alpha: 0,
    duration: 500,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy(),
  });
}

/** Springy touch interaction with click sound and light haptic feedback. */
export function attachSpringPress(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Container,
  w: number,
  h: number,
  onTap: () => void,
  opts: { downScale?: number; guard?: (p: Phaser.Input.Pointer) => boolean } = {},
): void {
  const down = opts.downScale ?? 0.94;
  let spring: Phaser.Tweens.Tween | undefined;
  target.setSize(w, h).setInteractive({ useHandCursor: true });

  const reset = () => {
    if (target.scaleX === 1 && target.scaleY === 1) return;
    spring?.stop();
    spring = scene.tweens.add({
      targets: target,
      scale: 1,
      duration: prefersReducedMotion() ? 0 : 240,
      ease: 'Back.easeOut',
    });
  };

  target.on('pointerdown', (p: Phaser.Input.Pointer) => {
    if (opts.guard && !opts.guard(p)) return;
    spring?.stop();
    target.setScale(down);
  });
  target.on('pointerout', reset);
  target.on('pointerup', (p: Phaser.Input.Pointer) => {
    const wasDown = target.scaleX < 0.99;
    reset();
    if (!wasDown) return;
    if (opts.guard && !opts.guard(p)) return;
    const { sfx } = getServices(scene);
    sfx.play('click');
    sfx.vibrate(8);
    onTap();
  });
}

/** Full-screen Aurora Neon backdrop with drifting glows and twinkling starfield. */
export function buildAuroraSceneBackdrop(
  scene: Phaser.Scene,
  accentColor: number = UI.violet,
): void {
  const roots = typeof document !== 'undefined' ? [document.documentElement, document.body] : [];
  for (const el of roots) el.style.background = UI.bgCss;
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    for (const el of roots) el.style.background = '';
  });
  scene.cameras.main.setBackgroundColor(UI.bg);

  scene.add
    .image(0, 0, auroraBackground(scene, GAME_WIDTH, GAME_HEIGHT))
    .setOrigin(0)
    .setDepth(-10);

  const still = prefersReducedMotion();
  const drift = (x: number, y: number, tint: number, scale: number, dx: number, dy: number) => {
    const b = addHalo(scene, x, y, tint, scale, 0.22).setDepth(-9);
    if (still) return;
    scene.tweens.add({
      targets: b,
      x: x + dx,
      y: y + dy,
      alpha: 0.34,
      duration: 8500 + scale * 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  };
  drift(130, 280, accentColor, 5.8, 130, 100);
  drift(610, 760, UI.cyan, 4.8, -140, -110);
  drift(200, 1120, UI.pink, 5.0, 120, -80);

  if (still) return;
  for (let i = 0; i < 14; i++) {
    const seed = hashString(`aurora-star-${i}`);
    const star = scene.add
      .circle((seed % 700) + 10, ((seed >>> 8) % 1260) + 10, 1.5 + (seed % 3) * 0.5, 0xffffff)
      .setAlpha(0.12)
      .setDepth(-8);
    scene.tweens.add({
      targets: star,
      alpha: 0.82,
      duration: 1300 + (seed % 1600),
      delay: seed % 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}

/** 3D avatar orb with a gradient rim and player initial (or user icon). */
export function buildAvatarOrb(
  scene: Phaser.Scene,
  x: number,
  y: number,
  diameter: number,
  name: string,
  rimColors: readonly number[] = BRAND,
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const color = avatarColorFor(name);
  const innerR = Math.round(diameter * 0.4);
  const g = scene.add.graphics();
  g.fillStyle(mix(color, UI.bg, 0.52)).fillCircle(0, 0, innerR);
  g.fillStyle(color, 0.52).fillCircle(0, 0, innerR);
  g.fillStyle(0xffffff, 0.18).fillEllipse(0, -innerR * 0.38, innerR * 1.35, innerR * 0.65);
  const initial = name.trim() ? [...name.trim()][0]!.toUpperCase() : '';
  c.add([
    scene.add.image(0, 0, pillArt(scene, diameter, diameter, rimColors, false)),
    g,
    initial
      ? soraText(scene, 0, 0, initial, Math.round(diameter * 0.44), {
          color: '#ffffff',
          stroke: '#00000055',
          strokeThickness: 4,
        })
      : drawIcon(scene, 'user', 0, 0, Math.round(diameter * 0.44), 0xffffff),
  ]);
  return c;
}

export interface TactileButtonOptions {
  readonly colors?: readonly number[];
  readonly lipColor?: number;
  readonly glow?: boolean;
  readonly icon?: IconKind;
  readonly iconSize?: number;
  readonly iconColor?: number;
  readonly fontSize?: number;
  readonly textColor?: string;
  readonly pulse?: boolean;
  readonly shimmer?: boolean;
}

/**
 * Irresistible 3D tactile arcade button with extruded bottom lip, glossy reflection,
 * optional vector icon, shimmer sweep and breathing animation.
 */
export function buildTactile3DButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  onTap: () => void,
  opts: TactileButtonOptions = {},
): Phaser.GameObjects.Container {
  const colors = opts.colors ?? [0x7c5cff, 0xc04bff, 0xff5fb8];
  const lipColor = opts.lipColor ?? mix(colors[0] ?? UI.violet, 0x000000, 0.48);
  const glow = opts.glow ?? true;
  const fontSize = opts.fontSize ?? 36;
  const c = scene.add.container(x, y);

  const bg = scene.add.image(0, 0, button3DArt(scene, w, h, colors, lipColor, glow));
  c.add(bg);

  const txt = soraText(scene, 0, -3, label, fontSize, {
    color: opts.textColor ?? '#ffffff',
    stroke: '#00000066',
    strokeThickness: 6,
  });
  fitText(txt, w - (opts.icon ? 110 : 48), 18);

  if (opts.icon) {
    const isz = opts.iconSize ?? Math.round(fontSize * 0.88);
    const gap = 14;
    const total = isz + gap + txt.width;
    const ic = drawIcon(
      scene,
      opts.icon,
      -total / 2 + isz / 2 + 2,
      -3,
      isz,
      opts.iconColor ?? 0xffffff,
    );
    txt.x = -total / 2 + isz + gap + txt.width / 2;
    c.add([ic, txt]);
  } else {
    c.add(txt);
  }

  if (opts.shimmer && !prefersReducedMotion()) {
    const glint = scene.add
      .ellipse(-w * 0.36, -h * 0.16, 44, h * 0.55, 0xffffff, 0.24)
      .setAngle(22);
    c.add(glint);
    scene.tweens.add({
      targets: glint,
      x: w * 0.36,
      alpha: { from: 0, to: 0.28 },
      duration: 1400,
      hold: 1600,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  if (opts.pulse && !prefersReducedMotion()) {
    scene.tweens.add({
      targets: bg,
      scaleX: 1.022,
      scaleY: 1.032,
      duration: 950,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  attachSpringPress(
    scene,
    c,
    w,
    h + 10,
    () => {
      pulseRing(scene, c, colors[colors.length - 1] ?? UI.pink);
      onTap();
    },
    { downScale: 0.94 },
  );

  return c;
}

/** Frosted glass button with a colored vector icon and crisp label. */
export function buildGlassActionButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  icon: IconKind,
  iconColor: number,
  label: string,
  onTap: () => void,
  opts: { fontSize?: number; tint?: number } = {},
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const fSize = opts.fontSize ?? 24;
  c.add(
    scene.add.image(
      0,
      0,
      glassArt(scene, w, h, Math.min(28, h / 2), { tint: opts.tint ?? iconColor, fill: 0.08 }),
    ),
  );
  const txt = soraText(scene, 0, 0, label, fSize, { color: UI.white });
  fitText(txt, w - 72, 16);
  const isz = Math.round(fSize * 1.08);
  const gap = 10;
  const total = isz + gap + txt.width;
  const ic = drawIcon(scene, icon, -total / 2 + isz / 2, 0, isz, iconColor);
  txt.x = -total / 2 + isz + gap + txt.width / 2;
  c.add([ic, txt]);

  attachSpringPress(scene, c, w, h, onTap, { downScale: 0.92 });
  return c;
}
