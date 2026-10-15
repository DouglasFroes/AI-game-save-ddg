import type Phaser from 'phaser';
import { bake } from '@/platform/art/textures';

export function generateTijolosTextures(scene: Phaser.Scene): void {
  bake(scene, 'tijolos-icon', 150, 150, (g) => {
    g.fillStyle(0x1d2b53).fillRoundedRect(0, 0, 150, 150, 22);
    const colors = [0xff5d8f, 0xffd23f, 0x4cc9f0, 0x5bd46f];
    colors.forEach((c, r) => {
      for (let i = 0; i < 4; i++)
        g.fillStyle(c).fillRoundedRect(10 + i * 33, 16 + r * 18, 30, 14, 4);
    });
    g.fillStyle(0xffffff).fillCircle(90, 104, 9);
    g.fillStyle(0xe0e7ff).fillRoundedRect(42, 124, 66, 12, 6);
  });
}
