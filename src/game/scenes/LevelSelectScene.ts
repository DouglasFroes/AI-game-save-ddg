import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { isUnlocked, summarize } from '@/core/progress';
import { LEVEL_ORDER, LEVELS } from '@/data/levels';
import { addBackground, addText, Button, panel, starRow } from '@/game/ui/widgets';
import { getServices } from '@/services';
import type { GameSceneData } from './GameScene';

const COLS = 4;
const TILE = 140;
const GAP = 22;
const TOP = 330;

export class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.LevelSelect);
  }

  create(): void {
    const { progress, sfx } = getServices(this);
    const p = progress.get();
    const summary = summarize(p);
    addBackground(this);

    panel(this, GAME_WIDTH / 2, 130, 660, 170);
    addText(this, GAME_WIDTH / 2, 100, 'Escolha a fase', 54);
    addText(
      this,
      GAME_WIDTH / 2,
      165,
      `★ ${summary.stars}/${LEVELS.length * 3}   💀 ${summary.deaths}`,
      34,
      {
        color: '#5b6b8c',
      },
    );

    const gridW = COLS * TILE + (COLS - 1) * GAP;
    const x0 = (GAME_WIDTH - gridW) / 2 + TILE / 2;

    LEVELS.forEach((level, i) => {
      const x = x0 + (i % COLS) * (TILE + GAP);
      const y = TOP + Math.floor(i / COLS) * (TILE + GAP + 10);
      const unlocked = isUnlocked(p, level.id, LEVEL_ORDER);
      const result = p.results[level.id];

      const color = !unlocked ? COLORS.locked : result ? COLORS.success : COLORS.primary;
      const shade = !unlocked ? 0x8e97a5 : result ? COLORS.successDark : COLORS.primaryDark;
      const tile = new Button(
        this,
        x,
        y,
        unlocked ? String(level.id) : '🔒',
        () => {
          if (!unlocked) {
            sfx.play('locked');
            this.tweens.add({ targets: tile, x: x + 8, duration: 50, yoyo: true, repeat: 2 });
            return;
          }
          this.scene.start(SceneKeys.Game, { levelId: level.id } satisfies GameSceneData);
        },
        { width: TILE, height: TILE - 10, color, shade, fontSize: 56 },
      );
      tile.label.setY(-14);
      if (unlocked) {
        starRow(this, 0, 38, result?.stars ?? 0, 34, 2).forEach((s) => tile.add(s));
      }
    });

    new Button(this, 200, 1180, '‹ Menu', () => this.scene.start(SceneKeys.Menu), {
      width: 280,
      height: 100,
      color: COLORS.secondary,
      shade: COLORS.secondaryDark,
    });
    new Button(this, 520, 1180, '🏆 Ranking', () => this.scene.start(SceneKeys.Ranking), {
      width: 280,
      height: 100,
      fontSize: 38,
      color: COLORS.secondary,
      shade: COLORS.secondaryDark,
    });
  }
}
