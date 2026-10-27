import type Phaser from 'phaser';
import { drawKidHead, KIDS } from '@/games/bomba/art';
import { bake } from '@/platform/art/textures';

export const CARD_BACK = 'memoria-back';

export function generateMemoriaTextures(scene: Phaser.Scene): void {
  bake(scene, CARD_BACK, 140, 170, (g) => {
    g.fillStyle(0x7209b7).fillRoundedRect(0, 0, 140, 170, 18);
    g.lineStyle(6, 0xffffff, 0.85).strokeRoundedRect(8, 8, 124, 154, 14);
    g.fillStyle(0xffffff, 0.18);
    for (let y = 18; y < 160; y += 22) for (let x = 18; x < 130; x += 22) g.fillCircle(x, y, 4);
    g.fillStyle(0xffd23f).fillCircle(70, 85, 22);
    g.fillStyle(0x7209b7).fillCircle(70, 85, 10);
  });
  bake(scene, 'memoria-icon', 150, 150, (g) => {
    g.fillStyle(0xffd6ff).fillRoundedRect(0, 0, 150, 150, 22);
    g.fillStyle(0x7209b7).fillRoundedRect(14, 30, 56, 70, 10);
    g.fillStyle(0xffffff).fillRoundedRect(80, 30, 56, 70, 10);
    g.save();
    g.translateCanvas(108, 64);
    g.scaleCanvas(0.62, 0.62);
    drawKidHead(g, KIDS[4]!, 0, 0);
    g.restore();
    g.fillStyle(0xffd23f).fillCircle(42, 65, 12);
  });
}
