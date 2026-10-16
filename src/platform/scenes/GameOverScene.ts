import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, SceneKeys, type SceneKey } from '@/config';
import { getGame } from '@/games/registry';
import { Tex } from '@/platform/art/textures';
import type { ScoreRecord } from '@/platform/bestScores';
import { autoSubmit, formatNumber, rankMessage } from '@/platform/ranking';
import { shareWithToast } from '@/platform/share';
import { askName } from '@/platform/ui/nameDialog';
import { addText, Button } from '@/platform/ui/widgets';
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

const CARD_W = 640;
const CARD_H = 920;
const BAND_H = 210;
const CONFETTI = [0xff5d8f, 0xffd23f, 0x5bd46f, 0x4cc9f0, 0xc77dff, 0xff9a2e];

/**
 * Shared end-of-run overlay, themed with the game's color and icon: score counting up, a new-record
 * celebration (or how far the record was), the run's stats and automatic ranking submission.
 */
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.GameOver);
  }

  create(data: GameOverData): void {
    const services = getServices(this);
    const game = getGame(data.gameId);
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2 + 20;
    const top = -CARD_H / 2;
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0b1430, 0.72).setOrigin(0).setInteractive();

    const card = this.add.container(cx, cy);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.25).fillRoundedRect(-CARD_W / 2 + 6, top + 14, CARD_W, CARD_H, 36);
    bg.fillStyle(0xffffff).fillRoundedRect(-CARD_W / 2, top, CARD_W, CARD_H, 36);
    // Header band in the game's colors.
    const band = { tl: 36, tr: 36, bl: 0, br: 0 };
    bg.fillStyle(game.shade).fillRoundedRect(-CARD_W / 2, top, CARD_W, BAND_H + 8, band);
    bg.fillStyle(game.color).fillRoundedRect(-CARD_W / 2, top, CARD_W, BAND_H, band);
    bg.fillStyle(0xffffff, 0.14).fillRoundedRect(-CARD_W / 2 + 20, top + 14, CARD_W - 40, 50, 20);
    card.add(bg);

    // Game icon popping out of the top edge.
    const badge = this.add.container(0, top);
    const ring = this.add.graphics();
    ring.fillStyle(game.shade).fillCircle(0, 6, 78);
    ring.fillStyle(0xffffff).fillCircle(0, 0, 74);
    const icon = this.add.image(0, 0, game.icon);
    icon.setScale(Math.min(112 / icon.width, 112 / icon.height));
    badge.add([ring, icon]);
    card.add(badge);
    this.tweens.add({
      targets: badge,
      y: top - 8,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    card.add(
      addText(this, 0, top + 128, data.title, data.title.length > 18 ? 38 : 46, {
        color: COLORS.textLight,
        stroke: '#00000044',
        strokeThickness: 8,
        wrapWidth: 560,
      }),
    );

    let y = top + BAND_H + 40;
    if (data.record) {
      const record = data.record;
      const previous = services.best.get(data.gameId)?.score ?? 0;
      const newBest = services.best.offer(data.gameId, record);
      card.add(addText(this, 0, y, 'PONTOS', 26, { color: COLORS.textMuted }));
      const scoreText = addText(this, 0, y + 64, '0', 96, {
        color: '#ffb703',
        stroke: '#1d2b53',
        strokeThickness: 12,
      });
      card.add(scoreText);
      const celebrateAt = y + 140;
      this.tweens.addCounter({
        from: 0,
        to: record.score,
        duration: 900,
        ease: 'Cubic.easeOut',
        onUpdate: (t) => scoreText.setText(formatNumber(t.getValue() ?? 0)),
        onComplete: () => {
          this.tweens.add({ targets: scoreText, scale: 1.12, duration: 120, yoyo: true });
          if (newBest) this.celebrate(card, celebrateAt);
        },
      });
      y += 140;
      if (!newBest) this.recordBar(card, y, record.score, Math.max(previous, record.score));
      y += 64;
      for (const line of data.lines ?? []) {
        this.chip(card, y, line);
        y += 54;
      }
      const status = addText(this, 0, y, '', 22, { color: COLORS.textMuted, wrapWidth: 560 });
      card.add(status);
      const place = services.localTop.add(data.gameId, record);
      void this.sendToRanking(data, status, card, y + 58, place);
    } else {
      for (const line of data.lines ?? []) {
        this.chip(card, y, line);
        y += 54;
      }
    }

    card.add(
      new Button(
        this,
        0,
        CARD_H / 2 - 170,
        '↻ Jogar de novo',
        () => this.go(data, data.retry.scene, data.retry.data),
        { width: 540, height: 104, fontSize: 42, color: game.color, shade: game.shade },
      ),
    );
    const small = {
      width: 184,
      height: 86,
      fontSize: 26,
      color: 0xe9eef6,
      shade: 0xc7cfdc,
      textColor: COLORS.text,
    };
    card.add(
      new Button(
        this,
        -198,
        CARD_H / 2 - 62,
        '🏆 Ranking',
        () => this.go(data, SceneKeys.Leaderboard, { gameId: data.gameId, back: data.retry.scene }),
        small,
      ),
    );
    const score = data.record?.score;
    // The score plus the run's stats ("Andares: 55 · Perfeitos: 29"), and the link to beat it.
    const stats = (data.lines ?? []).join(' · ');
    const challenge =
      score !== undefined
        ? `Fiz ${formatNumber(score)} pontos em ${game.title} no Fliperama!${stats ? ` (${stats})` : ''} Consegue me superar? 🏆`
        : `Joga ${game.title} comigo no Fliperama! 🎮`;
    card.add(
      new Button(
        this,
        0,
        CARD_H / 2 - 62,
        score !== undefined ? '📤 Enviar' : '🔗 Convidar',
        () => void shareWithToast(this, data.gameId, game.title, challenge),
        small,
      ),
    );
    card.add(
      new Button(this, 198, CARD_H / 2 - 62, '⌂ Menu', () => this.go(data, SceneKeys.Hub), small),
    );

    card.setY(cy + 220).setAlpha(0);
    this.tweens.add({ targets: card, y: cy, alpha: 1, duration: 420, ease: 'Back.easeOut' });
  }

  /** A rounded stat row ("Distância: 1,2 km"). */
  private chip(card: Phaser.GameObjects.Container, y: number, text: string): void {
    const g = this.add.graphics();
    g.fillStyle(0xf1f4fa).fillRoundedRect(-270, y - 23, 540, 46, 23);
    card.add(g);
    card.add(addText(this, 0, y, text, 26, { color: COLORS.text, weight: 'normal' }));
  }

  /** How close the run came to the personal record. */
  private recordBar(
    card: Phaser.GameObjects.Container,
    y: number,
    score: number,
    best: number,
  ): void {
    const w = 440;
    const ratio = best > 0 ? Math.min(1, score / best) : 0;
    const track = this.add.graphics();
    track.fillStyle(0xe6ebf3).fillRoundedRect(-w / 2, y - 12, w, 24, 12);
    const fill = this.add.graphics();
    card.add([track, fill]);
    const progress = { r: 0 };
    this.tweens.add({
      targets: progress,
      r: ratio,
      duration: 900,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        fill
          .clear()
          .fillStyle(0xffb703)
          .fillRoundedRect(-w / 2, y - 12, Math.max(24, w * progress.r), 24, 12);
      },
    });
    card.add(addText(this, w / 2 + 34, y, '👑', 30));
    const missing = best - score;
    const text =
      missing > 0
        ? `Recorde: ${formatNumber(best)} · faltaram ${formatNumber(missing)}`
        : `Recorde: ${formatNumber(best)}`;
    card.add(addText(this, 0, y + 38, text, 24, { color: COLORS.textMuted, weight: 'normal' }));
  }

  /** New record: a golden badge and a burst of confetti. */
  private celebrate(card: Phaser.GameObjects.Container, y: number): void {
    getServices(this).sfx.play('win');
    const pill = this.add.container(0, y);
    const g = this.add.graphics();
    g.fillStyle(0xe09a00).fillRoundedRect(-200, -26, 400, 60, 30);
    g.fillStyle(0xffd23f).fillRoundedRect(-200, -32, 400, 60, 30);
    pill.add([g, addText(this, 0, -2, '★ NOVO RECORDE! ★', 32, { color: '#7a4a00' })]);
    card.add(pill);
    pill.setScale(0);
    this.tweens.add({ targets: pill, scale: 1, duration: 380, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: pill,
      scale: 1.06,
      duration: 500,
      yoyo: true,
      repeat: -1,
      delay: 400,
    });

    for (const tint of CONFETTI) {
      const p = this.add.particles(0, -20, Tex.dot, {
        x: { min: 40, max: GAME_WIDTH - 40 },
        speedY: { min: 260, max: 520 },
        speedX: { min: -90, max: 90 },
        scaleX: { min: 0.5, max: 1.1 },
        scaleY: { min: 0.3, max: 0.7 },
        rotate: { min: 0, max: 360 },
        lifespan: 2600,
        quantity: 2,
        frequency: 90,
        tint,
        gravityY: 120,
      });
      p.setDepth(100);
      this.time.delayedCall(1500, () => p.stop());
      this.time.delayedCall(4500, () => p.destroy());
    }
  }

  /**
   * Every run is recorded in the player's local top 10. If it makes the top 20 it is sent to the
   * ranking automatically — but only with a name: without one, the player is asked first.
   */
  private async sendToRanking(
    data: GameOverData,
    status: Phaser.GameObjects.Text,
    card: Phaser.GameObjects.Container,
    buttonY: number,
    place: number | null,
  ): Promise<void> {
    const services = getServices(this);
    const record = data.record;
    if (!record) return;
    const mine = place ? `${place}º melhor seu · ` : '';
    status.setText(`${mine}Verificando o ranking…`);
    const result = await autoSubmit(services, data.gameId, record).catch(() => null);
    if (!status.active) return;
    if (!result || !('needsName' in result)) {
      status.setText(mine + rankMessage(result, services.leaderboard.online));
      return;
    }
    status.setText(`${mine}Top 20: ${result.rank}º lugar! Escolha um nome:`);
    const btn = new Button(
      this,
      0,
      buttonY,
      '✎ Escolher nome',
      async () => {
        const name = await askName(this, '');
        if (!name) return;
        services.profile.update({ name });
        btn.destroy();
        status.setText('Enviando…');
        const sent = await autoSubmit(services, data.gameId, record).catch(() => null);
        if (status.active)
          status.setText(
            mine +
              rankMessage(
                sent && !('needsName' in sent) ? sent : null,
                services.leaderboard.online,
              ),
          );
      },
      { width: 380, height: 62, fontSize: 28, color: COLORS.success, shade: COLORS.successDark },
    );
    card.add(btn);
  }

  private go(data: GameOverData, scene: SceneKey, sceneData?: object): void {
    this.scene.stop(data.parent);
    this.scene.start(scene, sceneData);
  }
}
