import type Phaser from 'phaser';
import { bake } from '@/platform/art/textures';

/** A pencil from its tip at (x, y) pointing outwards along `angle`. */
export const drawPencil = (
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  angle: number,
  len = 120,
) => {
  // From the tip at (x,y) outwards along `angle`.
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const px = -uy * 9;
  const py = ux * 9;
  const at = (d: number, side: number) => ({
    x: x + ux * d + px * side,
    y: y + uy * d + py * side,
  });
  g.fillStyle(0x3d2c22).fillTriangle(x, y, at(18, 1).x, at(18, 1).y, at(18, -1).x, at(18, -1).y);
  g.fillStyle(0xffc300).fillPoints(
    [at(18, 1), at(len - 16, 1), at(len - 16, -1), at(18, -1)],
    true,
  );
  g.fillStyle(0xd9d9d9).fillPoints(
    [at(len - 16, 1), at(len - 8, 1), at(len - 8, -1), at(len - 16, -1)],
    true,
  );
  g.fillStyle(0xff8fa3).fillPoints(
    [at(len - 8, 1), at(len, 1), at(len, -1), at(len - 8, -1)],
    true,
  );
};

export function generateAlvoTextures(scene: Phaser.Scene): void {
  bake(scene, 'alvo-icon', 150, 150, (g) => {
    g.fillStyle(0x1d2b53).fillRoundedRect(0, 0, 150, 150, 22);
    g.fillStyle(0xc68642).fillCircle(75, 62, 46);
    g.fillStyle(0x3d2c22).fillCircle(60, 50, 6).fillCircle(88, 70, 6).fillCircle(72, 82, 5);
    drawPencil(g, 75, 108, Math.PI / 2, 40);
    drawPencil(g, 118, 50, -0.2, 30);
  });
}
