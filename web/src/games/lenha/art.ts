import type Phaser from 'phaser';
import { bake } from '@/platform/art/textures';

/** Hub icon: a trunk with a branch and an axe. */
export function generateLenhaTextures(scene: Phaser.Scene): void {
  bake(scene, 'lenha-icon', 150, 150, (g) => {
    g.fillStyle(0x8fd3ff).fillRoundedRect(0, 0, 150, 150, 22);
    g.fillStyle(0x6cc551).fillRect(0, 120, 150, 30);
    g.fillStyle(0x8d5524).fillRect(58, 0, 40, 124);
    g.fillStyle(0x6d3f1a).fillRect(66, 0, 6, 124).fillRect(84, 0, 4, 124);
    g.fillStyle(0x8d5524).fillRect(96, 40, 46, 14);
    g.fillStyle(0x2ecc71).fillCircle(140, 40, 16);
    g.fillStyle(0x6d4c41).fillRect(20, 70, 8, 52);
    g.fillStyle(0xd9d9d9).fillTriangle(10, 66, 40, 60, 40, 86);
  });
}
