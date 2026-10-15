import Phaser from 'phaser';
import { bake } from '@/platform/art/textures';
import { FRUITS } from './core';

export const fruitKey = (level: number) => `fruit-${level}`;
export function generateFruitTextures(scene: Phaser.Scene): void {
  FRUITS.forEach((f, level) => {
    const r = f.radius;
    const size = r * 2 + 8;
    const c = size / 2;
    bake(scene, fruitKey(level), size, size, (g) => {
      const base = Phaser.Display.Color.IntegerToColor(f.color);
      g.fillStyle(base.clone().darken(25).color).fillCircle(c, c + 2, r);
      g.fillStyle(f.color).fillCircle(c - 1, c - 1, r - 3);
      if (level === FRUITS.length - 1) {
        g.fillStyle(0x1b5e20, 0.8);
        for (let i = -2; i <= 2; i++)
          g.fillEllipse(c + i * r * 0.36, c, r * 0.14, r * 1.7 - Math.abs(i) * r * 0.35);
      }
      g.fillStyle(0xffffff, 0.45).fillEllipse(c - r * 0.35, c - r * 0.42, r * 0.55, r * 0.32);
      // Cute face.
      const eye = Math.max(2.5, r * 0.08);
      g.fillStyle(0x2b2d42)
        .fillCircle(c - r * 0.28, c + r * 0.02, eye)
        .fillCircle(c + r * 0.28, c + r * 0.02, eye);
      g.lineStyle(Math.max(2, r * 0.05), 0x2b2d42)
        .beginPath()
        .arc(c, c + r * 0.16, r * 0.16, 0.15 * Math.PI, 0.85 * Math.PI)
        .strokePath();
      g.fillStyle(0xff8fa3, 0.6)
        .fillEllipse(c - r * 0.45, c + r * 0.2, r * 0.2, r * 0.12)
        .fillEllipse(c + r * 0.45, c + r * 0.2, r * 0.2, r * 0.12);
      if (level !== 2)
        g.fillStyle(0x4caf50).fillEllipse(c + r * 0.18, c - r + 3, r * 0.42, r * 0.2);
    });
  });
}
