import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import type { Stars } from '@/games/doguinho/core/scoring';
import { nextLevelId } from '@/games/doguinho/data/levels';
import {
  addHalo,
  buildGlassActionButton,
  buildTactile3DButton,
  prefersReducedMotion,
  soraText,
} from '@/platform/ui/arcadeUx';
import { glassArt, star3DArt, sunburstArt, UI } from '@/platform/ui/hubTheme';
import { getServices } from '@/services';
import { Tex } from '../art';
import type { GameSceneData, LossReason } from './GameScene';

export type ResultData =
  | { levelId: number; won: true; stars: Stars; inkRatio: number }
  | { levelId: number; won: false; reason: LossReason };

const LOSS_TEXT: Record<LossReason, string> = {
  bee: 'Uma abelha picou o doguinho!',
  spike: 'O doguinho encostou nos espinhos!',
  fall: 'O doguinho caiu!',
};

const CARD_W = 620;
const CARD_H = 740;

/** AAA Aurora Neon overlay shown on top of the (still animating) Doguinho GameScene. */
export class ResultScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.DogResult);
  }

  create(data: ResultData): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x040612, 0.8).setOrigin(0).setInteractive();

    const accent = data.won ? UI.gold : COLORS.danger;
    addHalo(this, cx, cy - 80, accent, 4.8, 0.3);

    const card = this.add.container(cx, cy);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.55).fillRoundedRect(
      -CARD_W / 2 + 6,
      -CARD_H / 2 + 16,
      CARD_W,
      CARD_H,
      40,
    );
    bg.fillStyle(0x0b0d20, 0.97).fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 40);
    bg.lineStyle(2.5, accent, 0.65).strokeRoundedRect(
      -CARD_W / 2 + 1,
      -CARD_H / 2 + 1,
      CARD_W - 2,
      CARD_H - 2,
      40,
    );
    card.add([
      bg,
      this.add.image(
        0,
        0,
        glassArt(this, CARD_W - 36, CARD_H - 36, 32, { tint: accent, fill: 0.07 }),
      ),
    ]);

    if (data.won) this.buildWin(card, data);
    else this.buildLoss(card, data);

    card.setScale(0.68).setAlpha(0);
    this.tweens.add({ targets: card, scale: 1, alpha: 1, duration: 340, ease: 'Back.easeOut' });
  }

  private buildWin(
    card: Phaser.GameObjects.Container,
    data: Extract<ResultData, { won: true }>,
  ): void {
    const sfx = getServices(this).sfx;

    const rays = this.add
      .image(0, -140, sunburstArt(this, 320))
      .setTint(UI.gold)
      .setAlpha(0.42)
      .setBlendMode(Phaser.BlendModes.ADD);
    card.add(rays);
    if (!prefersReducedMotion()) {
      this.tweens.add({ targets: rays, angle: 360, duration: 22000, repeat: -1 });
    }

    card.add(
      soraText(this, 0, -296, `FASE ${data.levelId} · VITÓRIA`, 16, {
        color: '#ffd166',
      }),
    );
    card.add(
      soraText(this, 0, -248, 'Fase concluída!', 48, {
        color: '#ffffff',
        stroke: '#00000088',
        strokeThickness: 8,
      }),
    );

    [0, 1, 2].forEach((i) => {
      const earned = i < data.stars;
      const star = this.add
        .image(
          (i - 1) * 136,
          -124 + (i === 1 ? -20 : 0),
          star3DArt(this, i === 1 ? 108 : 94, earned),
        )
        .setAngle((i - 1) * 10)
        .setScale(0);
      card.add(star);
      this.tweens.add({
        targets: star,
        scale: 1,
        delay: 220 + i * 200,
        duration: 320,
        ease: 'Back.easeOut',
        onStart: () => earned && sfx.play('star', i),
      });
    });

    const used = Math.round(data.inkRatio * 100);
    const saved = Math.max(0, 100 - used);
    const statBox = this.add.container(0, -4);
    statBox.add([
      this.add.image(0, 0, glassArt(this, 500, 74, 22, { tint: UI.cyan, fill: 0.09 })),
      soraText(this, 0, -12, `Tinta usada: ${used}%`, 24, { color: UI.white }),
      soraText(this, 0, 18, `Economia de tinta: ${saved}%`, 16, {
        color: '#38e1ff',
        weight: 'normal',
      }),
    ]);
    card.add(statBox);

    const next = nextLevelId(data.levelId);
    if (next !== undefined) {
      card.add(
        buildTactile3DButton(this, 0, 126, 500, 96, 'Próxima ▶', () => this.play(next), {
          colors: [0xffb703, 0xf59e0b, 0xff5fb8],
          lipColor: 0xb45309,
          fontSize: 38,
          shimmer: true,
          pulse: true,
        }),
      );
    } else {
      card.add(
        buildTactile3DButton(
          this,
          0,
          126,
          500,
          96,
          'Ranking',
          () => this.leave(SceneKeys.Leaderboard, { gameId: 'doguinho' }),
          {
            colors: [0x34d399, 0x10b981, 0x059669],
            lipColor: 0x065f46,
            icon: 'trophy',
            fontSize: 36,
            shimmer: true,
            pulse: true,
          },
        ),
      );
    }
    this.addSecondaryRow(card, data.levelId, true);
  }

  private buildLoss(
    card: Phaser.GameObjects.Container,
    data: Extract<ResultData, { won: false }>,
  ): void {
    card.add(
      soraText(this, 0, -264, 'Ai!', 64, {
        color: '#ff7b9c',
        stroke: '#00000088',
        strokeThickness: 8,
      }),
    );
    const dog = this.add.image(0, -132, Tex.dog('hurt')).setScale(1.42);
    card.add([addHalo(this, 0, -132, COLORS.danger, 1.8, 0.4), dog]);
    this.tweens.add({
      targets: dog,
      angle: { from: -8, to: 8 },
      duration: 160,
      yoyo: true,
      repeat: 3,
    });
    card.add(
      soraText(this, 0, -8, LOSS_TEXT[data.reason], 28, {
        color: UI.soft,
        weight: 'normal',
        wrapWidth: 500,
      }),
    );
    card.add(
      buildTactile3DButton(this, 0, 126, 500, 96, 'Tentar de novo', () => this.play(data.levelId), {
        colors: [0xffb703, 0xf59e0b, 0xff5fb8],
        lipColor: 0xb45309,
        icon: 'retry',
        fontSize: 36,
        shimmer: true,
        pulse: true,
      }),
    );
    this.addSecondaryRow(card, data.levelId, false);
  }

  private addSecondaryRow(
    card: Phaser.GameObjects.Container,
    levelId: number,
    withRetry = true,
  ): void {
    const y = 264;
    if (withRetry) {
      card.add(
        buildGlassActionButton(
          this,
          -130,
          y,
          240,
          80,
          'retry',
          UI.cyan,
          'Repetir',
          () => this.play(levelId),
          { fontSize: 26, tint: UI.cyan },
        ),
      );
      card.add(
        buildGlassActionButton(
          this,
          130,
          y,
          240,
          80,
          'grid',
          UI.violet,
          'Fases',
          () => this.leave(SceneKeys.DogLevels),
          { fontSize: 26, tint: UI.violet },
        ),
      );
    } else {
      card.add(
        buildGlassActionButton(
          this,
          0,
          y,
          500,
          80,
          'grid',
          UI.violet,
          'Voltar às Fases',
          () => this.leave(SceneKeys.DogLevels),
          { fontSize: 26, tint: UI.violet },
        ),
      );
    }
  }

  private play(levelId: number): void {
    this.scene.stop(SceneKeys.DogGame);
    this.scene.start(SceneKeys.DogGame, { levelId } satisfies GameSceneData);
  }

  private leave(key: string, data?: object): void {
    this.scene.stop(SceneKeys.DogGame);
    this.scene.start(key, data);
  }
}
