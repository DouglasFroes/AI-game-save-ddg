import type Phaser from 'phaser';
import { bake } from '@/platform/art/textures';

export function generateMilhaoTextures(scene: Phaser.Scene): void {
  // A gold coin with "1 MILHÃO" on a stage spotlight.
  bake(scene, 'milhao-icon', 150, 150, (g) => {
    g.fillStyle(0x0b1a4a).fillRoundedRect(0, 0, 150, 150, 22);
    g.fillStyle(0x2a52be, 0.5).fillTriangle(75, 0, 10, 150, 140, 150);
    g.fillStyle(0x8a6d00).fillCircle(75, 80, 50);
    g.fillStyle(0xffd23f).fillCircle(75, 76, 50);
    g.lineStyle(5, 0xe0a800).strokeCircle(75, 76, 40);
    g.fillStyle(0xfff3b0, 0.8).fillEllipse(58, 56, 22, 12);
  });
}

/** "R$ 1 mil", "R$ 50 mil", "R$ 1 milhão". */
export function formatPrize(v: number): string {
  if (v >= 1_000_000) return `R$ ${v / 1_000_000} milhão`;
  if (v >= 1_000) return `R$ ${v / 1_000} mil`;
  return `R$ ${v}`;
}
