import Phaser from 'phaser';
import { bake } from '@/platform/art/textures';

export const STACK_ICON = 'stack-icon';
export const hueAt = (i: number, start: number) => (start + i * 7) % 360;
export const hsl = (h: number, s: number, l: number) =>
  Phaser.Display.Color.HSLToColor(h / 360, s, l).color;

export function generateStackTextures(scene: Phaser.Scene): void {
  bake(scene, STACK_ICON, 150, 150, (g) => {
    g.fillStyle(0x1d2b53).fillRoundedRect(0, 0, 150, 150, 22);
    const widths = [110, 96, 96, 80, 70, 70];
    widths.forEach((w, i) => {
      const y = 122 - i * 18;
      const x = 75 - w / 2 + (i % 2 ? 4 : -2);
      g.fillStyle(hsl(hueAt(i, 190), 0.55, 0.45)).fillRect(x, y + 12, w, 5);
      g.fillStyle(hsl(hueAt(i, 190), 0.55, 0.62)).fillRect(x, y, w, 13);
    });
  });
}
