import Phaser from 'phaser';
import { bake } from '@/platform/art/textures';
import { PALETTE } from './core';

export const BB_CELL = 80;

export const BBTex = {
  block: (color: number) => `bb-block-${color}`,
  empty: 'bb-empty',
  icon: 'bb-icon',
} as const;

function drawBlock(g: Phaser.GameObjects.Graphics, color: number, size: number): void {
  const c = Phaser.Display.Color.IntegerToColor(color);
  const light = c.clone().lighten(22).color;
  const dark = c.clone().darken(22).color;
  const r = size * 0.16;
  g.fillStyle(dark).fillRoundedRect(2, 2, size - 4, size - 4, r);
  g.fillStyle(color).fillRoundedRect(2, 2, size - 4, size - 10, r);
  g.fillStyle(light, 0.9).fillRoundedRect(
    size * 0.16,
    size * 0.12,
    size * 0.68,
    size * 0.18,
    r / 2,
  );
}

export function generateBlockBlastTextures(scene: Phaser.Scene): void {
  PALETTE.forEach((color, i) =>
    bake(scene, BBTex.block(i), BB_CELL, BB_CELL, (g) => drawBlock(g, color, BB_CELL)),
  );
  bake(scene, BBTex.empty, BB_CELL, BB_CELL, (g) => {
    g.fillStyle(0x2c3e73).fillRoundedRect(3, 3, BB_CELL - 6, BB_CELL - 6, 12);
  });
  bake(scene, BBTex.icon, 150, 150, (g) => {
    const pattern = [
      [0, 0, 4],
      [1, 0, 4],
      [2, 0, -1],
      [0, 1, 1],
      [1, 1, 5],
      [2, 1, 5],
      [0, 2, 1],
      [1, 2, 3],
      [2, 2, 5],
    ];
    g.fillStyle(0x1d2b53).fillRoundedRect(0, 0, 150, 150, 22);
    for (const [x, y, color] of pattern) {
      g.save();
      g.translateCanvas(9 + x! * 44, 9 + y! * 44);
      if (color! >= 0) drawBlock(g, PALETTE[color!]!, 44);
      else g.fillStyle(0x2c3e73).fillRoundedRect(2, 2, 40, 40, 8);
      g.restore();
    }
  });
}
