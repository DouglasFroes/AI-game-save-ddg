import type Phaser from 'phaser';
import { bake } from '@/platform/art/textures';

export function generatePianoTextures(scene: Phaser.Scene): void {
  bake(scene, 'piano-icon', 150, 150, (g) => {
    g.fillStyle(0xffffff).fillRoundedRect(0, 0, 150, 150, 22);
    g.lineStyle(3, 0xd0c4e8);
    for (let i = 1; i < 4; i++) g.lineBetween(i * 37.5, 0, i * 37.5, 150);
    g.fillStyle(0x7209b7).fillRect(2, 10, 34, 56).fillRect(76, 70, 34, 56);
    g.fillStyle(0x3a0ca3).fillRect(114, 0, 34, 40).fillRect(39, 110, 34, 40);
  });
}
