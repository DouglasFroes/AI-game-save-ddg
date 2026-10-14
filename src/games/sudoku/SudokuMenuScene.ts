import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { bake } from '@/platform/art/textures';
import { formatNumber } from '@/platform/ranking';
import { addBackground, addText, Button, panel } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { DIFFICULTIES, type Difficulty } from './core';
import type { SudokuData } from './SudokuScene';

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

const ORDER: readonly Difficulty[] = ['easy', 'medium', 'hard'];
const COLORS_BY_LEVEL = [
  [COLORS.success, COLORS.successDark],
  [COLORS.primary, COLORS.primaryDark],
  [COLORS.danger, COLORS.dangerDark],
] as const;

export class SudokuMenuScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.SudokuMenu);
  }

  create(): void {
    const { best } = getServices(this);
    const cx = GAME_WIDTH / 2;
    addBackground(this);
    panel(this, cx, 560, 640, 820);
    this.add.image(cx, 280, SUDOKU_ICON).setScale(1.1);
    addText(this, cx, 420, 'Sudoku', 64);
    addText(this, cx, 480, 'Preencha 1 a 9 sem repetir na linha,\ncoluna ou quadrado.', 26, {
      color: COLORS.textMuted,
      weight: 'normal',
    });

    ORDER.forEach((d, i) => {
      const def = DIFFICULTIES[d];
      const [color, shade] = COLORS_BY_LEVEL[i]!;
      new Button(
        this,
        cx,
        600 + i * 130,
        def.label,
        () => this.scene.start(SceneKeys.Sudoku, { difficulty: d } satisfies SudokuData),
        { width: 480, height: 104, color, shade },
      );
    });
    const record = best.get('sudoku');
    addText(
      this,
      cx,
      930,
      record ? `Recorde: ${formatNumber(record.score)} pontos` : 'Ainda sem recorde',
      28,
      {
        color: COLORS.textMuted,
      },
    );

    new Button(this, 200, 1180, '‹ Menu', () => this.scene.start(SceneKeys.Hub), {
      width: 280,
      height: 96,
      color: COLORS.secondary,
      shade: COLORS.secondaryDark,
    });
    new Button(
      this,
      520,
      1180,
      '🏆 Ranking',
      () =>
        this.scene.start(SceneKeys.Leaderboard, { gameId: 'sudoku', back: SceneKeys.SudokuMenu }),
      {
        width: 280,
        height: 96,
        fontSize: 38,
        color: COLORS.secondary,
        shade: COLORS.secondaryDark,
      },
    );
  }
}
