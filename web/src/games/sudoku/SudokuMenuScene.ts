import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { formatNumber } from '@/platform/ranking';
import { addBackground, addText, Button, panel } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { DIFFICULTIES, type Difficulty } from './core';
import type { SudokuData } from './SudokuScene';
import { SUDOKU_ICON } from './art';

const ORDER: readonly Difficulty[] = ['easy', 'medium', 'hard', 'expert'];
const COLORS_BY_LEVEL = [
  [COLORS.success, COLORS.successDark],
  [COLORS.primary, COLORS.primaryDark],
  [COLORS.danger, COLORS.dangerDark],
  [0x9b5de5, 0x7038b8],
] as const;

export class SudokuMenuScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.SudokuMenu);
  }

  create(): void {
    const { best } = getServices(this);
    const cx = GAME_WIDTH / 2;
    addBackground(this);
    panel(this, cx, 600, 640, 940);
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
        590 + i * 116,
        d === 'expert' ? `${def.label} · 1 vida` : def.label,
        () => this.scene.start(SceneKeys.Sudoku, { difficulty: d } satisfies SudokuData),
        { width: 480, height: 96, color, shade },
      );
    });
    const record = best.get('sudoku');
    addText(
      this,
      cx,
      1040,
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
