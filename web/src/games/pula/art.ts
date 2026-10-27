import type Phaser from 'phaser';
import { bake } from '@/platform/art/textures';

export function generatePulaTextures(scene: Phaser.Scene): void {
  bake(scene, 'pula-icon', 150, 150, (g) => {
    g.fillStyle(0xfdf6e3).fillRoundedRect(0, 0, 150, 150, 22);
    g.lineStyle(2, 0xbcd4f6);
    for (let y = 20; y < 150; y += 20) g.lineBetween(0, y, 150, y);
    g.fillStyle(0x5bd46f)
      .fillRoundedRect(14, 120, 60, 14, 7)
      .fillRoundedRect(80, 70, 60, 14, 7)
      .fillRoundedRect(30, 30, 56, 14, 7);
    g.fillStyle(0xffd23f).fillCircle(108, 46, 16);
    g.fillStyle(0x1f1f2b).fillCircle(103, 44, 2.5).fillCircle(113, 44, 2.5);
  });
}
