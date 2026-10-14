import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import type { Stars } from '@/core/scoring';
import { nextLevelId } from '@/data/levels';
import { Tex } from '@/game/art/textures';
import { addText, Button, panel } from '@/game/ui/widgets';
import { getServices } from '@/services';
import type { GameSceneData, LossReason } from './GameScene';

export type ResultData =
  | { levelId: number; won: true; stars: Stars; inkRatio: number }
  | { levelId: number; won: false; reason: LossReason };

const LOSS_TEXT: Record<LossReason, string> = {
  bee: 'Uma abelha picou o doguinho!',
  spike: 'O doguinho encostou nos espinhos!',
  fall: 'O doguinho caiu!',
};

/** Overlay shown on top of the (still animating) GameScene. */
export class ResultScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Result);
  }

  create(data: ResultData): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0b1430, 0.55).setOrigin(0).setInteractive();

    const card = this.add.container(cx, cy);
    card.add(panel(this, 0, 0, 600, 640));

    if (data.won) this.buildWin(card, data);
    else this.buildLoss(card, data);

    card.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: card, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' });
  }

  private buildWin(
    card: Phaser.GameObjects.Container,
    data: Extract<ResultData, { won: true }>,
  ): void {
    const sfx = getServices(this).sfx;
    card.add(addText(this, 0, -250, 'Fase concluída!', 52));

    [0, 1, 2].forEach((i) => {
      const earned = i < data.stars;
      const star = this.add
        .image((i - 1) * 140, -130 + (i === 1 ? -20 : 0), earned ? Tex.star : Tex.starEmpty)
        .setDisplaySize(124, 124)
        .setScale(0);
      card.add(star);
      this.tweens.add({
        targets: star,
        scale: 124 / 64,
        delay: 250 + i * 220,
        duration: 300,
        ease: 'Back.easeOut',
        onStart: () => earned && sfx.play('star', i),
      });
    });

    const used = Math.round(data.inkRatio * 100);
    card.add(addText(this, 0, -10, `Tinta usada: ${used}%`, 34, { color: '#5b6b8c' }));

    const next = nextLevelId(data.levelId);
    if (next !== undefined) {
      card.add(new Button(this, 0, 110, 'Próxima ▶', () => this.play(next), { width: 460 }));
    } else {
      card.add(
        new Button(this, 0, 110, '🏆 Ranking', () => this.leave(SceneKeys.Ranking), {
          width: 460,
          color: COLORS.success,
          shade: COLORS.successDark,
        }),
      );
    }
    this.addSecondaryRow(card, data.levelId);
  }

  private buildLoss(
    card: Phaser.GameObjects.Container,
    data: Extract<ResultData, { won: false }>,
  ): void {
    card.add(addText(this, 0, -240, 'Ai!', 72));
    const dog = this.add.image(0, -120, Tex.dog('hurt')).setScale(1.4);
    card.add(dog);
    this.tweens.add({
      targets: dog,
      angle: { from: -8, to: 8 },
      duration: 160,
      yoyo: true,
      repeat: 3,
    });
    card.add(
      addText(this, 0, -10, LOSS_TEXT[data.reason], 34, { color: '#5b6b8c', wrapWidth: 520 }),
    );
    card.add(
      new Button(this, 0, 110, '↻ Tentar de novo', () => this.play(data.levelId), { width: 460 }),
    );
    this.addSecondaryRow(card, data.levelId, false);
  }

  private addSecondaryRow(
    card: Phaser.GameObjects.Container,
    levelId: number,
    withRetry = true,
  ): void {
    const opts = {
      width: 220,
      height: 92,
      fontSize: 34,
      color: COLORS.secondary,
      shade: COLORS.secondaryDark,
    };
    if (withRetry) {
      card.add(new Button(this, -125, 240, '↻ Repetir', () => this.play(levelId), opts));
      card.add(
        new Button(this, 125, 240, '☰ Fases', () => this.leave(SceneKeys.LevelSelect), opts),
      );
    } else {
      card.add(
        new Button(this, 0, 240, '☰ Fases', () => this.leave(SceneKeys.LevelSelect), {
          ...opts,
          width: 460,
        }),
      );
    }
  }

  private play(levelId: number): void {
    this.scene.stop(SceneKeys.Game);
    this.scene.start(SceneKeys.Game, { levelId } satisfies GameSceneData);
  }

  private leave(key: string): void {
    this.scene.stop(SceneKeys.Game);
    this.scene.start(key);
  }
}
