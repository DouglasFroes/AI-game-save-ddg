import type Phaser from 'phaser';
import { bake } from '@/platform/art/textures';

export const GRAU_ICON = 'grau-icon';

/** Hub icon: a bike popping a wheelie against a sunset. */
export function generateGrauTextures(scene: Phaser.Scene): void {
  bake(scene, GRAU_ICON, 150, 150, (g) => {
    g.fillStyle(0xff8c42).fillRoundedRect(0, 0, 150, 150, 22);
    g.fillStyle(0xffd166).fillCircle(112, 46, 22);
    g.fillStyle(0x3d405b).fillRect(0, 118, 150, 32);
    g.fillStyle(0xffffff)
      .fillRect(10, 132, 26, 5)
      .fillRect(62, 132, 26, 5)
      .fillRect(114, 132, 26, 5);
    // Wheels: rear on the ground, front up in the air.
    g.lineStyle(9, 0x1a1a1a).strokeCircle(42, 100, 17).strokeCircle(98, 62, 17);
    g.lineStyle(10, 0xe63946).lineBetween(42, 100, 84, 70).lineBetween(84, 70, 98, 62);
    g.lineStyle(6, 0xd9d9d9).lineBetween(90, 50, 98, 62);
    // Rider leaning back.
    g.lineStyle(10, 0x00b4d8).lineBetween(56, 82, 50, 56);
    g.lineStyle(6, 0x00b4d8).lineBetween(52, 62, 88, 48);
    g.fillStyle(0xffd23f).fillCircle(48, 44, 13);
  });
}
