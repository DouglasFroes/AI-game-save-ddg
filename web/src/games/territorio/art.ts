import type Phaser from 'phaser';
import { bake } from '@/platform/art/textures';

/** 12.34% from a score in hundredths of a percent. */
export const formatShare = (v: number) => `${(v / 100).toFixed(1).replace('.', ',')}%`;

export function generateTerritorioTextures(scene: Phaser.Scene): void {
  bake(scene, 'territorio-icon', 150, 150, (g) => {
    g.fillStyle(0xf1f3f8).fillRoundedRect(0, 0, 150, 150, 22);
    g.fillStyle(0xff4f8b, 0.85).fillRect(84, 14, 52, 50);
    g.fillStyle(0x35e0ff, 0.9).fillRect(14, 60, 70, 76);
    // A trail looping out of the blue land.
    g.fillStyle(0x35e0ff, 0.45)
      .fillRect(84, 74, 12, 50)
      .fillRect(84, 112, 44, 12)
      .fillRect(116, 84, 12, 40);
    g.fillStyle(0x1fa2c7).fillRoundedRect(110, 72, 24, 24, 6);
    g.fillStyle(0xffffff).fillCircle(117, 82, 4).fillCircle(127, 82, 4);
  });
}
