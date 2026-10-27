import type Phaser from 'phaser';
import { bake } from '@/platform/art/textures';

/** The four colors of the game (index = color id). */
export const PALETTE = [0xff3d7f, 0x35e0ff, 0xffd23f, 0x8c52ff] as const;

export function generateCoresTextures(scene: Phaser.Scene): void {
  bake(scene, 'cores-icon', 150, 150, (g) => {
    g.fillStyle(0x161a2e).fillRoundedRect(0, 0, 150, 150, 22);
    PALETTE.forEach((c, i) => {
      g.lineStyle(14, c)
        .beginPath()
        .arc(75, 70, 44, (i * Math.PI) / 2, ((i + 1) * Math.PI) / 2)
        .strokePath();
    });
    g.fillStyle(PALETTE[1]).fillCircle(75, 128, 11);
    g.fillStyle(0xffffff).fillCircle(75, 70, 8);
  });
}
