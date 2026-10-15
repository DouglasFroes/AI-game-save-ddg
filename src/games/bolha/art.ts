import type Phaser from 'phaser';
import { bake } from '@/platform/art/textures';

export function generateBolhaTextures(scene: Phaser.Scene): void {
  bake(scene, 'bolha-icon', 150, 150, (g) => {
    g.fillStyle(0x10132a).fillRoundedRect(0, 0, 150, 150, 22);
    g.lineStyle(1, 0xffffff, 0.08);
    for (let i = 15; i < 150; i += 20) g.lineBetween(i, 0, i, 150).lineBetween(0, i, 150, i);
    for (const [x, y, c] of [
      [24, 30, 0xffd23f],
      [120, 22, 0x5bd46f],
      [130, 120, 0xff4f8b],
      [20, 126, 0x9b5de5],
      [60, 130, 0x4cc9f0],
    ] as const)
      g.fillStyle(c).fillCircle(x, y, 6);
    // A big blob about to swallow a small one.
    g.fillStyle(0xff4f8b).fillCircle(110, 92, 16);
    g.fillStyle(0x1fa2c7).fillCircle(68, 76, 46);
    g.fillStyle(0x35e0ff).fillCircle(68, 76, 41);
    g.fillStyle(0xffffff).fillCircle(56, 64, 10).fillCircle(84, 64, 10);
    g.fillStyle(0x10132a).fillCircle(60, 66, 5).fillCircle(88, 66, 5);
    g.fillStyle(0x10132a).fillEllipse(72, 92, 34, 18);
  });
}
