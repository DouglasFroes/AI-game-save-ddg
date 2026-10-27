import type Phaser from 'phaser';
import { bake } from '@/platform/art/textures';

export const SUDOKU_ICON = 'sudoku-icon';
export function generateSudokuTextures(scene: Phaser.Scene): void {
  bake(scene, SUDOKU_ICON, 150, 150, (g) => {
    g.fillStyle(0xffffff).fillRoundedRect(0, 0, 150, 150, 18);
    g.lineStyle(2, 0xa6afc2);
    for (let i = 1; i < 9; i++) {
      g.lineBetween(9 + i * 14.7, 9, 9 + i * 14.7, 141).lineBetween(
        9,
        9 + i * 14.7,
        141,
        9 + i * 14.7,
      );
    }
    g.lineStyle(5, 0x1d2b53).strokeRect(9, 9, 132, 132);
    for (let i = 1; i < 3; i++) {
      g.lineBetween(9 + i * 44, 9, 9 + i * 44, 141).lineBetween(9, 9 + i * 44, 141, 9 + i * 44);
    }
    const filled = [3, 10, 14, 22, 30, 37, 41, 49, 56, 60, 67, 75, 79];
    g.fillStyle(0x4da3ff);
    for (const i of filled) g.fillCircle(16 + (i % 9) * 14.7, 16 + Math.floor(i / 9) * 14.7, 4.5);
  });
}
