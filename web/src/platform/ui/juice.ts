import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '@/config';
import { addText } from './widgets';

/** Small, reusable "game feel" helpers: particles, shockwaves, flashes, ambient motion. */

export interface BurstOptions {
  /** Pixels per second of the fastest particle. */
  speed?: number;
  /** Particle radius. */
  size?: number;
  /** Milliseconds. */
  life?: number;
  /** Downward pull applied to the particles (px/s²). */
  gravity?: number;
  depth?: number;
}

/** A spray of glowing dots that fly out from a point and fade. */
export function burst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: number,
  count = 14,
  opts: BurstOptions = {},
): void {
  const { speed = 320, size = 7, life = 520, gravity = 0, depth = 30 } = opts;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const v = speed * (0.35 + Math.random() * 0.65);
    const r = size * (0.5 + Math.random() * 0.8);
    const dot = scene.add
      .circle(x, y, r, color)
      .setDepth(depth)
      .setBlendMode(Phaser.BlendModes.ADD);
    const t = life * (0.7 + Math.random() * 0.6);
    const dx = Math.cos(angle) * v * (t / 1000);
    const dy = Math.sin(angle) * v * (t / 1000) + 0.5 * gravity * (t / 1000) ** 2;
    scene.tweens.add({
      targets: dot,
      x: x + dx,
      y: y + dy,
      alpha: 0,
      scale: 0.2,
      duration: t,
      ease: 'Cubic.easeOut',
      onComplete: () => dot.destroy(),
    });
  }
}

/** An expanding ring, for impacts and "perfect" moments. */
export function shockwave(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: number,
  radius = 140,
  depth = 29,
): void {
  const ring = scene.add
    .circle(x, y, radius * 0.25)
    .setStrokeStyle(6, color, 0.9)
    .setDepth(depth)
    .setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: ring,
    scale: 4,
    alpha: 0,
    duration: 460,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy(),
  });
}

/** A brief full-screen tint (hits, level-ups). */
export function flash(scene: Phaser.Scene, color: number, alpha = 0.25, ms = 220): void {
  const veil = scene.add
    .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, color, alpha)
    .setOrigin(0)
    .setDepth(60);
  scene.tweens.add({
    targets: veil,
    alpha: 0,
    duration: ms,
    onComplete: () => veil.destroy(),
  });
}

/** Slow floating motes behind the action, so empty space never looks dead. */
export function ambient(scene: Phaser.Scene, color = 0xffffff, count = 18): void {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * GAME_WIDTH;
    const y = Math.random() * GAME_HEIGHT;
    const mote = scene.add
      .circle(x, y, 2 + Math.random() * 3, color, 0.18)
      .setDepth(-8)
      .setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: mote,
      y: y - 120 - Math.random() * 200,
      alpha: 0.02,
      duration: 4000 + Math.random() * 5000,
      repeat: -1,
      yoyo: true,
      ease: 'Sine.easeInOut',
    });
  }
}

/** A how-to-play banner that fades itself out (or on `dismiss()`). */
export function hint(
  scene: Phaser.Scene,
  lines: string[],
  y = 1100,
  ms = 3200,
): { dismiss: () => void } {
  const t = addText(scene, GAME_WIDTH / 2, y, lines.join('\n'), 34, {
    color: '#ffffff',
    stroke: '#0b1430',
    strokeThickness: 8,
    wrapWidth: 640,
  }).setDepth(45);
  scene.tweens.add({ targets: t, alpha: 0.55, duration: 700, yoyo: true, repeat: -1 });
  const dismiss = () => {
    timer.remove(false);
    if (!t.active) return;
    scene.tweens.killTweensOf(t);
    scene.tweens.add({ targets: t, alpha: 0, duration: 300, onComplete: () => t.destroy() });
  };
  const timer = scene.time.delayedCall(ms, dismiss);
  return { dismiss };
}

/** Big centred callout ("NÍVEL 3", "PERFEITO!") that scales in and drifts away. */
export function banner(
  scene: Phaser.Scene,
  label: string,
  color = '#ffd23f',
  y = GAME_HEIGHT / 2 - 120,
): void {
  const t = addText(scene, GAME_WIDTH / 2, y, label, 72, {
    color,
    stroke: '#0b1430',
    strokeThickness: 12,
  }).setDepth(55);
  t.setScale(0.3).setAlpha(0);
  scene.tweens.add({
    targets: t,
    scale: 1,
    alpha: 1,
    duration: 220,
    ease: 'Back.easeOut',
    onComplete: () =>
      scene.tweens.add({
        targets: t,
        y: y - 60,
        alpha: 0,
        delay: 450,
        duration: 420,
        onComplete: () => t.destroy(),
      }),
  });
}
