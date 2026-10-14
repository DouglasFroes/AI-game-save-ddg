import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, SceneKeys, type SceneKey } from '@/config';
import type { ScoreRecord } from '@/platform/bestScores';
import { formatNumber, submitMessage, submitScore } from '@/platform/ranking';
import { askName } from '@/platform/ui/nameDialog';
import { addText, Button, panel } from '@/platform/ui/widgets';
import { getServices } from '@/services';

export interface GameOverData {
  gameId: string;
  title: string;
  /** Extra lines under the score (time, distance…). */
  lines?: string[];
  /** Null when there is no score to rank (e.g. a lost Sudoku). */
  record: ScoreRecord | null;
  /** Scene that launched this overlay; it is stopped when leaving. */
  parent: SceneKey;
  retry: { scene: SceneKey; data?: object };
}

/** Shared end-of-run overlay: score, personal best and automatic ranking submission. */
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.GameOver);
  }

  create(data: GameOverData): void {
    const services = getServices(this);
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0b1430, 0.6).setOrigin(0).setInteractive();

    const card = this.add.container(cx, cy);
    card.add(panel(this, 0, 0, 620, 860));
    card.add(addText(this, 0, -355, data.title, 50, { wrapWidth: 560 }));

    if (data.record) {
      const newBest = services.best.offer(data.gameId, data.record);
      const best = services.best.get(data.gameId);
      card.add(addText(this, 0, -270, 'Pontos', 30, { color: COLORS.textMuted }));
      const scoreText = addText(this, 0, -205, '0', 92, { color: '#ffb703', stroke: '#1d2b53' });
      card.add(scoreText);
      this.tweens.addCounter({
        from: 0,
        to: data.record.score,
        duration: 700,
        ease: 'Cubic.easeOut',
        onUpdate: (t) => scoreText.setText(formatNumber(t.getValue() ?? 0)),
      });
      card.add(
        addText(
          this,
          0,
          -130,
          newBest ? '🎉 Novo recorde!' : `Recorde: ${formatNumber(best?.score ?? 0)}`,
          32,
          { color: newBest ? '#35a249' : COLORS.textMuted },
        ),
      );
      const status = addText(this, 0, 160, '', 26, { color: COLORS.textMuted, wrapWidth: 560 });
      card.add(status);
      if (newBest) void this.sendToRanking(data, status, card);
    }

    (data.lines ?? []).forEach((line, i) => {
      card.add(addText(this, 0, -70 + i * 44, line, 30, { color: COLORS.text, weight: 'normal' }));
    });

    card.add(
      new Button(
        this,
        0,
        260,
        '↻ Jogar de novo',
        () => this.go(data, data.retry.scene, data.retry.data),
        {
          width: 500,
        },
      ),
    );
    const small = {
      width: 240,
      height: 88,
      fontSize: 32,
      color: COLORS.secondary,
      shade: COLORS.secondaryDark,
    };
    card.add(
      new Button(
        this,
        -130,
        360,
        '🏆 Ranking',
        () => this.go(data, SceneKeys.Leaderboard, { gameId: data.gameId, back: data.retry.scene }),
        small,
      ),
    );
    card.add(new Button(this, 130, 360, '⌂ Menu', () => this.go(data, SceneKeys.Hub), small));

    card.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: card, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });
  }

  private async sendToRanking(
    data: GameOverData,
    status: Phaser.GameObjects.Text,
    card: Phaser.GameObjects.Container,
  ): Promise<void> {
    const services = getServices(this);
    const record = data.record;
    if (!record) return;
    if (!services.profile.get().name) {
      status.setText('Escolha um nome para entrar no ranking:');
      const btn = new Button(
        this,
        0,
        90,
        '✎ Escolher nome',
        async () => {
          const name = await askName(this, '');
          if (!name) return;
          services.profile.update({ name });
          btn.destroy();
          status.setText('Enviando…');
          status.setText(submitMessage(await submitScore(services, data.gameId, record)));
        },
        { width: 360, height: 76, fontSize: 30, color: COLORS.success, shade: COLORS.successDark },
      );
      card.add(btn);
      return;
    }
    status.setText('Enviando ao ranking…');
    const result = await submitScore(services, data.gameId, record);
    if (status.active) status.setText(submitMessage(result));
  }

  private go(data: GameOverData, scene: SceneKey, sceneData?: object): void {
    this.scene.stop(data.parent);
    this.scene.start(scene, sceneData);
  }
}
