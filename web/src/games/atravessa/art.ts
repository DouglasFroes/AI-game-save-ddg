import type Phaser from 'phaser';
import { bake } from '@/platform/art/textures';

export function generateAtravessaTextures(scene: Phaser.Scene): void {
  bake(scene, 'atravessa-icon', 150, 150, (g) => {
    g.fillStyle(0x7bd389).fillRect(0, 0, 150, 50);
    g.fillStyle(0x5c5f73).fillRect(0, 50, 150, 50);
    g.fillStyle(0x4cc9f0).fillRect(0, 100, 150, 50);
    g.fillStyle(0xffffff).fillRect(10, 73, 24, 4).fillRect(60, 73, 24, 4).fillRect(110, 73, 24, 4);
    g.fillStyle(0xe63946).fillRoundedRect(84, 56, 50, 36, 8);
    g.fillStyle(0x8d5524).fillRoundedRect(20, 112, 80, 26, 12);
    g.fillStyle(0x2e7d32).fillCircle(120, 24, 18);
    g.fillStyle(0xffd23f).fillCircle(40, 24, 15);
  });
}
