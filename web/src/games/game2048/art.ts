import type Phaser from 'phaser';
import { FONT_FAMILY } from '@/config';
import { canvasTexture } from '@/platform/art/textures';

export const G2048_ICON = 'g2048-icon';
export function generate2048Textures(scene: Phaser.Scene): void {
  canvasTexture(scene, G2048_ICON, 150, 150, (ctx) => {
    ctx.fillStyle = '#edc22e';
    ctx.beginPath();
    ctx.roundRect(4, 4, 142, 142, 26);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 50px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('2048', 75, 80);
  });
}
