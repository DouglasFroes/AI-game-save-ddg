import type Phaser from 'phaser';
import { bake } from '@/platform/art/textures';

export const SNAKE_ICON = 'snake-icon';
export function drawApple(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number): void {
  g.fillStyle(0xd62828).fillCircle(x, y + 2, r);
  g.fillStyle(0xff5d5d).fillCircle(x - r * 0.3, y - r * 0.15, r * 0.45);
  g.fillStyle(0x6b3e26).fillRect(x - 1.5, y - r - 4, 3, 8);
  g.fillStyle(0x5bd46f).fillEllipse(x + 6, y - r - 1, 12, 6);
}

export function generateSnakeTextures(scene: Phaser.Scene): void {
  bake(scene, SNAKE_ICON, 150, 150, (g) => {
    g.fillStyle(0xa8e063).fillRoundedRect(0, 0, 150, 150, 22);
    const path = [
      [30, 110],
      [60, 110],
      [90, 110],
      [90, 80],
      [90, 50],
      [120, 50],
    ];
    g.fillStyle(0x2d6a4f);
    path.forEach(
      ([x, y], i) =>
        i &&
        g.fillRect(
          Math.min(x!, path[i - 1]![0]!) - 11,
          Math.min(y!, path[i - 1]![1]!) - 11,
          Math.abs(x! - path[i - 1]![0]!) + 22,
          Math.abs(y! - path[i - 1]![1]!) + 22,
        ),
    );
    g.fillStyle(0x40916c).fillCircle(120, 50, 15);
    g.fillStyle(0xffffff).fillCircle(124, 44, 5).fillCircle(124, 56, 5);
    g.fillStyle(0x000000).fillCircle(126, 44, 2.5).fillCircle(126, 56, 2.5);
    drawApple(g, 40, 45, 14);
  });
}
