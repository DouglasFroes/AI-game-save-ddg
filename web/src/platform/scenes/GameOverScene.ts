import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys, type SceneKey } from '@/config';
import { getGame, type GameDefinition } from '@/games/registry';
import { Tex } from '@/platform/art/textures';
import type { ScoreRecord } from '@/platform/bestScores';
import { LOCAL_TOP } from '@/platform/localTop';
import { autoSubmit, formatNumber, rankMessage } from '@/platform/ranking';
import { shareWithToast } from '@/platform/share';
import {
  addHalo,
  buildGlassActionButton,
  buildTactile3DButton,
  computeRunAchievements,
  computeRunStars,
  fitText,
  parseStatLine,
  prefersReducedMotion,
  pulseRing,
  soraText,
  type ParsedStat,
  type RunAchievement,
} from '@/platform/ui/arcadeUx';
import {
  glassArt,
  mix,
  pillArt,
  posterArt,
  star3DArt,
  sunburstArt,
  UI,
} from '@/platform/ui/hubTheme';
import { drawIcon } from '@/platform/ui/icons';
import { openAccount } from '@/platform/ui/accountDialog';
import { askName } from '@/platform/ui/nameDialog';
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

const CARD_W = 660;
const CARD_H = 1136;
const INNER_W = 608;
const HEADER_H = 208;
const CONFETTI = [0xff5d8f, 0xffd166, 0x34d399, 0x38e1ff, 0xc084fc, 0xff9a2e];

/**
 * Shared AAA end-of-run experience: 3D game medallion, performance stars, monumental animated
 * score counter, record progress bar, Bento stat grid, collectible run achievements, automatic
 * ranking verification and irresistible 3D replay buttons.
 */
export class GameOverScene extends Phaser.Scene {
  private achievementBox: Phaser.GameObjects.Container | null = null;

  constructor() {
    super(SceneKeys.GameOver);
  }

  create(data: GameOverData): void {
    this.achievementBox = null;
    const services = getServices(this);
    services.sessionTracker.completeRun(data.gameId, data.record?.score ?? 0);
    const game = getGame(data.gameId);

    const record = data.record;
    const previous = services.best.get(data.gameId)?.score ?? 0;
    const newBest = record ? services.best.offer(data.gameId, record) : false;
    const place = record ? services.localTop.add(data.gameId, record) : null;
    const stars = computeRunStars(record?.score ?? 0, previous, newBest, place, record !== null);

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2 + 22;
    const top = -CARD_H / 2;

    // 1. Atmospheric dimmed backdrop with volumetric glows
    const dim = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x040612, 0.86)
      .setOrigin(0)
      .setInteractive();
    addHalo(this, cx, 180, game.color, 5.2, 0.32);
    addHalo(this, cx, cy, UI.violet, 5.6, 0.22);
    addHalo(this, cx, GAME_HEIGHT - 160, newBest ? UI.gold : UI.pink, 4.8, 0.25);

    // 2. Main 3D Layered Modal Card
    const card = this.add.container(cx, cy);
    this.buildCardFrame(card, game, top, newBest);
    this.buildHeaderStage(card, game, data.title, top, stars, newBest);

    // 3. Score & Record Vault (-344 .. -104)
    this.buildScoreVault(card, game, record, previous, newBest);

    // 4. Bento Grid for Run Stats (-88 .. +2)
    this.buildStatsBento(card, game, data.lines ?? [], Math.max(previous, record?.score ?? 0));

    // 5. Collectible Run Achievements Row (+16 .. +104)
    this.achievementBox = this.add.container(0, 62);
    card.add(this.achievementBox);
    this.renderAchievements(
      computeRunAchievements({
        hasRecord: record !== null,
        score: record?.score ?? 0,
        previousBest: previous,
        newBest,
        localPlace: place,
        globalRank: null,
      }),
    );

    // 6. Live Ranking Verification Capsule (+122 .. +256)
    const rankCapsuleY = 158;
    const rankCapsule = this.add.container(0, rankCapsuleY);
    rankCapsule.add([
      this.add.image(0, 0, glassArt(this, INNER_W, 64, 22, { tint: UI.cyan, fill: 0.08 })),
      drawIcon(this, 'trophy', -INNER_W / 2 + 34, 0, 26, UI.gold),
    ]);
    const status = soraText(
      this,
      14,
      0,
      record ? 'Verificando o ranking…' : 'Conclua uma partida para pontuar no ranking',
      19,
      {
        color: UI.soft,
        weight: 'normal',
        wrapWidth: INNER_W - 92,
      },
    );
    rankCapsule.add(status);
    card.add(rankCapsule);

    if (record) {
      void this.sendToRanking(data, status, card, rankCapsuleY + 70, place, previous, newBest);
    }

    // 7. Irresistible 3D Action Buttons
    this.buildActionButtons(card, game, data);

    // 8. Peek at the finished board (to screenshot it or see what went wrong)
    this.buildPeekButtons();

    // Entrance choreography
    if (!prefersReducedMotion()) {
      dim.setAlpha(0);
      this.tweens.add({ targets: dim, alpha: 1, duration: 260 });
      card
        .setY(cy + 200)
        .setScale(0.92)
        .setAlpha(0);
      this.tweens.add({
        targets: card,
        y: cy,
        scale: 1,
        alpha: 1,
        duration: 440,
        ease: 'Back.easeOut',
      });
    }
  }

  // ── Card Frame & Header Stage ─────────────────────────────────────────────

  private buildCardFrame(
    card: Phaser.GameObjects.Container,
    game: GameDefinition,
    top: number,
    newBest: boolean,
  ): void {
    const bg = this.add.graphics();
    // Deep drop shadow
    bg.fillStyle(0x000000, 0.58).fillRoundedRect(-CARD_W / 2 + 6, top + 18, CARD_W, CARD_H, 40);
    // Dark sapphire glass body
    bg.fillStyle(0x0a0c1e, 0.97).fillRoundedRect(-CARD_W / 2, top, CARD_W, CARD_H, 40);
    card.add(bg);

    // Header poster art in the game's colors
    card.add(
      this.add.image(
        0,
        top + HEADER_H / 2,
        posterArt(this, game, CARD_W, HEADER_H, [40, 40, 0, 0]),
      ),
    );

    // Glowing outer border around the entire card
    const rim = this.add.graphics();
    rim
      .lineStyle(2.5, newBest ? UI.gold : game.color, 0.55)
      .strokeRoundedRect(-CARD_W / 2 + 1, top + 1, CARD_W - 2, CARD_H - 2, 40);
    card.add(rim);
  }

  private buildHeaderStage(
    card: Phaser.GameObjects.Container,
    game: GameDefinition,
    title: string,
    top: number,
    stars: 0 | 1 | 2 | 3,
    newBest: boolean,
  ): void {
    const badgeY = top + 16;

    // Rotating sunburst rays behind the game medallion
    const rays = this.add
      .image(0, badgeY, sunburstArt(this, 320))
      .setTint(newBest ? UI.gold : game.color)
      .setAlpha(0.5)
      .setBlendMode(Phaser.BlendModes.ADD);
    card.add(rays);
    if (!prefersReducedMotion()) {
      this.tweens.add({
        targets: rays,
        angle: 360,
        duration: 24000,
        repeat: -1,
      });
    }

    // 3D Game Medallion popping out of the top edge
    const badge = this.add.container(0, badgeY);
    const ring = this.add.graphics();
    ring.fillStyle(0x000000, 0.45).fillCircle(0, 8, 68);
    ring.fillStyle(newBest ? UI.gold : game.color).fillCircle(0, 0, 66);
    ring.fillStyle(0x0e1129).fillCircle(0, 0, 58);
    ring.lineStyle(2, 0xffffff, 0.4).strokeCircle(0, 0, 62);
    const icon = this.add.image(0, 0, game.icon);
    icon.setScale(Math.min(92 / icon.width, 92 / icon.height));
    badge.add([addHalo(this, 0, 0, game.color, 1.4, 0.6), ring, icon]);
    card.add(badge);

    if (!prefersReducedMotion()) {
      this.tweens.add({
        targets: badge,
        y: badgeY - 7,
        duration: 1100,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // 3D Performance Stars flanking the medallion
    const starPositions: Array<{ x: number; y: number; size: number; angle: number }> = [
      { x: -116, y: badgeY + 6, size: 44, angle: -14 },
      { x: 0, y: badgeY - 68, size: 52, angle: 0 },
      { x: 116, y: badgeY + 6, size: 44, angle: 14 },
    ];
    const sfx = getServices(this).sfx;
    starPositions.forEach((sp, i) => {
      const earned = i < stars;
      const st = this.add.image(sp.x, sp.y, star3DArt(this, sp.size, earned)).setAngle(sp.angle);
      card.add(st);
      if (earned && !prefersReducedMotion()) {
        st.setScale(0);
        this.tweens.add({
          targets: st,
          scale: 1,
          delay: 260 + i * 160,
          duration: 340,
          ease: 'Back.easeOut',
          onStart: () => sfx.play('star', i),
        });
      }
    });

    // Game Title Pill & Expressive Result Headline
    card.add(
      soraText(this, 0, top + 104, game.title.toUpperCase(), 15, {
        color: '#ffd166',
        stroke: '#00000088',
        strokeThickness: 4,
      }),
    );

    const headline = soraText(this, 0, top + 150, title, title.length > 18 ? 36 : 44, {
      color: '#ffffff',
      stroke: '#00000099',
      strokeThickness: 8,
      wrapWidth: INNER_W - 24,
    });
    fitText(headline, INNER_W - 24, 28);
    card.add(headline);
  }

  // ── Score Vault, Progress Bar & Celebration ───────────────────────────────

  private buildScoreVault(
    card: Phaser.GameObjects.Container,
    game: GameDefinition,
    record: ScoreRecord | null,
    previous: number,
    newBest: boolean,
  ): void {
    const vaultY = -226;
    const vaultH = 236;
    const vault = this.add.container(0, vaultY);

    vault.add(
      this.add.image(
        0,
        0,
        glassArt(this, INNER_W, vaultH, 30, {
          tint: newBest ? UI.gold : game.color,
          fill: 0.09,
        }),
      ),
    );

    const border = this.add.graphics();
    border
      .lineStyle(2, newBest ? UI.gold : game.color, newBest ? 0.8 : 0.35)
      .strokeRoundedRect(-INNER_W / 2 + 1, -vaultH / 2 + 1, INNER_W - 2, vaultH - 2, 30);
    vault.add(border);
    card.add(vault);

    if (!record) {
      // No numeric score (e.g. lost Sudoku)
      vault.add([
        drawIcon(this, 'flame', 0, -48, 52, UI.pink),
        soraText(this, 0, 12, 'Não desista! Tente mais uma vez!', 26, {
          color: UI.white,
          wrapWidth: INNER_W - 48,
        }),
        soraText(
          this,
          0,
          56,
          previous > 0
            ? `Seu recorde pessoal atual: ${formatNumber(previous)} pts`
            : 'Complete uma partida para estrear no placar!',
          18,
          { color: UI.soft, weight: 'normal' },
        ),
      ]);
      return;
    }

    card.add(
      soraText(this, 0, vaultY - 88, 'PONTUAÇÃO FINAL', 15, {
        color: UI.soft,
      }),
    );

    const scoreText = soraText(this, 0, vaultY - 26, '0', 86, {
      color: '#ffd166',
      stroke: '#2b1600',
      strokeThickness: 10,
    });
    card.add(scoreText);

    const celebrateY = vaultY + 62;
    this.tweens.addCounter({
      from: 0,
      to: record.score,
      duration: prefersReducedMotion() ? 40 : 900,
      ease: 'Cubic.easeOut',
      onUpdate: (t) => {
        scoreText.setText(formatNumber(t.getValue() ?? 0));
        fitText(scoreText, INNER_W - 48, 48);
      },
      onComplete: () => {
        scoreText.setText(formatNumber(record.score));
        fitText(scoreText, INNER_W - 48, 48);
        this.tweens.add({ targets: scoreText, scale: 1.12, duration: 120, yoyo: true });
        if (newBest) this.celebrate(card, celebrateY, record.score, previous);
      },
    });

    if (!newBest) {
      this.recordBar(card, celebrateY - 8, record.score, Math.max(previous, record.score), game);
    }
  }

  /** How close the run came to the personal record, with an animated neon progress bar. */
  private recordBar(
    card: Phaser.GameObjects.Container,
    y: number,
    score: number,
    best: number,
    game: GameDefinition,
  ): void {
    const w = 430;
    const h = 20;
    const leftX = -w / 2 - 36;
    const ratio = best > 0 ? Math.min(1, score / best) : 0;

    const track = this.add.graphics();
    track.fillStyle(0x161936, 0.95).fillRoundedRect(leftX, y - h / 2, w, h, h / 2);
    track.lineStyle(1.5, 0xffffff, 0.16).strokeRoundedRect(leftX, y - h / 2, w, h, h / 2);

    const fill = this.add.graphics();
    card.add([track, fill]);

    const progress = { r: 0 };
    this.tweens.add({
      targets: progress,
      r: ratio,
      duration: prefersReducedMotion() ? 40 : 900,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        const fw = Math.max(h, w * progress.r);
        fill
          .clear()
          .fillStyle(mix(game.color, UI.gold, progress.r))
          .fillRoundedRect(leftX, y - h / 2, fw, h, h / 2);
        fill
          .fillStyle(0xffffff, 0.28)
          .fillRoundedRect(leftX + 6, y - h / 2 + 3, Math.max(8, fw - 12), h * 0.38, 4);
      },
    });

    // Percentage + Crown badge on the right of the bar
    const pctX = leftX + w + 48;
    card.add([
      drawIcon(this, 'crown', pctX - 24, y, 22, UI.gold),
      soraText(this, pctX + 14, y, `${Math.round(ratio * 100)}%`, 18, {
        color: '#ffd166',
      }),
    ]);

    const missing = best - score;
    const text =
      missing > 0
        ? `Recorde: ${formatNumber(best)}  ·  faltaram ${formatNumber(missing)}`
        : `Recorde: ${formatNumber(best)}`;
    card.add(
      soraText(this, 0, y + 34, text, 18, {
        color: UI.soft,
        weight: 'normal',
      }),
    );
  }

  /** New record: a gleaming 3D gold ribbon badge and a multi-color burst of confetti. */
  private celebrate(
    card: Phaser.GameObjects.Container,
    y: number,
    score: number,
    previous: number,
  ): void {
    const { sfx } = getServices(this);
    sfx.play('win');
    sfx.vibrate([30, 50, 60]);

    const pill = this.add.container(0, y);
    const ribbon = this.add.image(
      0,
      -4,
      pillArt(this, 430, 50, [0xfff3b0, 0xffd166, 0xf59e0b], true),
    );
    const label = soraText(this, 0, -4, '★ NOVO RECORDE! ★', 25, {
      color: '#2b1400',
      strokeThickness: 0,
    });
    const diff = score - previous;
    const sub = soraText(
      this,
      0,
      30,
      previous > 0 && diff > 0
        ? `+${formatNumber(diff)} pts acima do recorde anterior (${formatNumber(previous)})`
        : 'Sua melhor pontuação histórica neste jogo!',
      15,
      { color: '#fde68a', weight: 'normal' },
    );
    pill.add([ribbon, label, sub]);
    card.add(pill);

    pulseRing(this, pill, UI.gold, 56);
    pill.setScale(0);
    this.tweens.add({ targets: pill, scale: 1, duration: 380, ease: 'Back.easeOut' });
    if (!prefersReducedMotion()) {
      this.tweens.add({
        targets: ribbon,
        scaleX: 1.05,
        scaleY: 1.05,
        duration: 520,
        yoyo: true,
        repeat: -1,
        delay: 400,
      });
    }

    for (const tint of CONFETTI) {
      const p = this.add.particles(0, -20, Tex.dot, {
        x: { min: 40, max: GAME_WIDTH - 40 },
        speedY: { min: 260, max: 540 },
        speedX: { min: -100, max: 100 },
        scaleX: { min: 0.5, max: 1.15 },
        scaleY: { min: 0.3, max: 0.75 },
        rotate: { min: 0, max: 360 },
        lifespan: 2600,
        quantity: 2,
        frequency: 85,
        tint,
        gravityY: 120,
      });
      p.setDepth(100);
      this.time.delayedCall(1500, () => p.stop());
      this.time.delayedCall(4500, () => p.destroy());
    }
  }

  // ── Bento Stat Grid & Achievements ────────────────────────────────────────

  private buildStatsBento(
    card: Phaser.GameObjects.Container,
    game: GameDefinition,
    rawLines: readonly string[],
    bestScore: number,
  ): void {
    const services = getServices(this);
    const localCount = services.localTop.list(game.id).length;

    const stats: ParsedStat[] =
      rawLines.length > 0
        ? rawLines.slice(0, 3).map(parseStatLine)
        : [
            {
              label: 'RECORDE PESSOAL',
              value: bestScore > 0 ? formatNumber(bestScore) : '-',
            },
            {
              label: `HISTÓRICO TOP ${LOCAL_TOP}`,
              value: `${localCount}/${LOCAL_TOP} partidas`,
            },
          ];

    const count = stats.length;
    const gap = 12;
    const cellW = (INNER_W - gap * (count - 1)) / count;
    const cellH = 84;
    const y = -44;
    const accents = [UI.cyan, UI.violet, UI.pink];

    stats.forEach((st, i) => {
      const x = -INNER_W / 2 + cellW / 2 + i * (cellW + gap);
      const accent = accents[i % accents.length]!;
      const box = this.add.container(x, y);

      box.add(this.add.image(0, 0, glassArt(this, cellW, cellH, 22, { tint: accent, fill: 0.08 })));
      const bar = this.add.graphics();
      bar.fillStyle(accent, 0.85).fillRoundedRect(-22, -cellH / 2 + 6, 44, 4, 2);

      const lbl = soraText(this, 0, -14, st.label, 13, {
        color: UI.soft,
      });
      fitText(lbl, cellW - 24, 10);

      const val = soraText(this, 0, 15, st.value, count >= 3 ? 22 : 25, {
        color: UI.white,
      });
      fitText(val, cellW - 24, 15);

      box.add([bar, lbl, val]);
      card.add(box);
    });
  }

  private renderAchievements(badges: readonly RunAchievement[]): void {
    if (!this.achievementBox) return;
    this.achievementBox.removeAll(true);

    const count = badges.length;
    if (count === 0) return;
    const gap = 12;
    const cellW = (INNER_W - gap * (count - 1)) / count;
    const cellH = 80;

    badges.forEach((b, i) => {
      const x = -INNER_W / 2 + cellW / 2 + i * (cellW + gap);
      const item = this.add.container(x, 0);

      item.add(
        this.add.image(0, 0, glassArt(this, cellW, cellH, 22, { tint: b.color, fill: 0.1 })),
      );

      const orbX = -cellW / 2 + 34;
      const orb = this.add.circle(orbX, 0, 21, b.color, 0.22).setStrokeStyle(1.5, b.color, 0.7);
      const ic = drawIcon(this, b.icon, orbX, 0, 22, b.color);

      const tx = orbX + 30;
      const maxTextW = cellW - (tx - -cellW / 2) - 12;
      const title = soraText(this, tx, -11, b.title, 17, {
        color: UI.white,
        align: 'left',
      }).setOrigin(0, 0.5);
      fitText(title, maxTextW, 13);

      const sub = soraText(this, tx, 13, b.subtitle, 13, {
        color: UI.soft,
        weight: 'normal',
        align: 'left',
      }).setOrigin(0, 0.5);
      fitText(sub, maxTextW, 11);

      item.add([orb, ic, title, sub]);
      if (!prefersReducedMotion()) {
        item.setScale(0.82).setAlpha(0);
        this.tweens.add({
          targets: item,
          scale: 1,
          alpha: 1,
          duration: 300,
          delay: 140 + i * 90,
          ease: 'Back.easeOut',
        });
      }
      this.achievementBox!.add(item);
    });
  }

  /**
   * The card covers the board the run ended on. "Ver partida" hides the whole overlay so the
   * player can look at it (or take a screenshot); "Voltar ao resultado" brings it back.
   */
  private buildPeekButtons(): void {
    const peek = buildGlassActionButton(
      this,
      GAME_WIDTH / 2,
      46,
      300,
      64,
      'expand',
      UI.cyan,
      'Ver partida',
      () => toggle(true),
      { fontSize: 22, tint: UI.cyan },
    );
    const back = buildGlassActionButton(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT - 56,
      360,
      72,
      'back',
      UI.gold,
      'Voltar ao resultado',
      () => toggle(false),
      { fontSize: 24, tint: UI.gold },
    ).setVisible(false);
    peek.setDepth(10);
    back.setDepth(10);

    const toggle = (peeking: boolean): void => {
      for (const child of this.children.list) {
        if (child === peek || child === back) continue;
        (child as Phaser.GameObjects.GameObject & { setVisible(v: boolean): unknown }).setVisible(
          !peeking,
        );
      }
      peek.setVisible(!peeking);
      back.setVisible(peeking);
    };
  }

  // ── Ranking Submission & Action Buttons ───────────────────────────────────

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
    previousBest: number,
    newBest: boolean,
  ): Promise<void> {
    const services = getServices(this);
    const record = data.record;
    if (!record) return;
    const mine = place ? `${place}º melhor seu · ` : '';
    status.setText(`${mine}Verificando o ranking…`);
    const result = await autoSubmit(services, data.gameId, record).catch(() => null);
    if (!status.active) return;

    if (result && 'rank' in result) {
      this.renderAchievements(
        computeRunAchievements({
          hasRecord: true,
          score: record.score,
          previousBest,
          newBest,
          localPlace: place,
          globalRank: result.rank,
        }),
      );
    }

    if (!result || !('needsName' in result)) {
      status.setText(mine + rankMessage(result, services.leaderboard.online));
      if (result) status.setColor('#ffe08a');
      if (result?.result === 'login') this.offerSignIn(status, card, buttonY, mine);
      else if (newBest) this.nudgeSync(status, card, buttonY, mine);
      return;
    }

    status.setText(`${mine}Top 20: ${result.rank}º lugar! Escolha um nome:`);
    status.setColor('#ffd166');

    const btn = buildTactile3DButton(
      this,
      0,
      buttonY,
      440,
      58,
      '✎ Escolher nome',
      async () => {
        const name = await askName(this, '');
        if (!name) return;
        services.profile.update({ name });
        btn.destroy();
        status.setText('Enviando…');
        const sent = await autoSubmit(services, data.gameId, record).catch(() => null);
        if (status.active) {
          status.setText(
            mine +
              rankMessage(
                sent && !('needsName' in sent) ? sent : null,
                services.leaderboard.online,
              ),
          );
          if (newBest && (!sent || !('result' in sent) || sent.result !== 'login')) this.nudgeSync(status, card, buttonY, mine);
        }
      },
      {
        colors: [0x34d399, 0x10b981, 0x059669],
        lipColor: 0x065f46,
        fontSize: 24,
        glow: false,
      },
    );
    card.add(btn);
  }

  /** A new personal best from a signed-out player only lives on this device: ask to sign in. */
  private nudgeSync(
    status: Phaser.GameObjects.Text,
    card: Phaser.GameObjects.Container,
    buttonY: number,
    mine: string,
  ): void {
    const { account } = getServices(this);
    if (!account.available || account.current()) return;
    status.setText(`${mine}Novo recorde! Entre com Google para sincronizar`);
    status.setColor('#ffd166');
    this.offerSignIn(status, card, buttonY, mine, 'Recorde sincronizado!');
  }

  /** The run made the top 20 but stays on the device until the player signs in with Google. */
  private offerSignIn(
    status: Phaser.GameObjects.Text,
    card: Phaser.GameObjects.Container,
    buttonY: number,
    mine: string,
    doneText = 'Enviado ao ranking global!',
  ): void {
    const { account } = getServices(this);
    void account.prepare();
    const btn = buildTactile3DButton(
      this,
      0,
      buttonY,
      440,
      58,
      'G  Entrar com Google',
      () => {
        void openAccount(this).then(() => {
          if (!account.current() || !status.active) return;
          btn.destroy();
          // Signing in sends the runs that were waiting, this one included.
          status.setText(`${mine}${doneText}`);
        });
      },
      { colors: [0x4285f4, 0x2563eb, 0x1d4ed8], lipColor: 0x1e3a8a, fontSize: 24, glow: false },
    );
    card.add(btn);
  }

  private buildActionButtons(
    card: Phaser.GameObjects.Container,
    game: GameDefinition,
    data: GameOverData,
  ): void {
    // Primary CTA: Irresistible 3D Replay Button
    const primaryColors = [game.color, mix(game.color, UI.violet, 0.5), UI.pink];
    const replayBtn = buildTactile3DButton(
      this,
      0,
      348,
      INNER_W,
      104,
      'Jogar de novo',
      () => this.go(data, data.retry.scene, data.retry.data),
      {
        colors: primaryColors,
        lipColor: game.shade,
        icon: 'retry',
        fontSize: 38,
        shimmer: true,
        pulse: true,
      },
    );
    card.add(replayBtn);

    // Secondary Action Bar: Ranking · Enviar/Convidar · Menu
    const secY = 478;
    const secW = 192;
    const secH = 82;
    const gap = 16;

    const rankBtn = buildGlassActionButton(
      this,
      -(secW + gap),
      secY,
      secW,
      secH,
      'trophy',
      UI.gold,
      'Ranking',
      () => this.go(data, SceneKeys.Leaderboard, { gameId: data.gameId, back: data.retry.scene }),
      { fontSize: 24, tint: UI.gold },
    );

    const score = data.record?.score;
    const stats = (data.lines ?? []).join(' · ');
    const challenge =
      score !== undefined
        ? `Fiz ${formatNumber(score)} pontos em ${game.title} no Fliper!${stats ? ` (${stats})` : ''} Consegue me superar? 🏆`
        : `Joga ${game.title} comigo no Fliper! 🎮`;

    const shareBtn = buildGlassActionButton(
      this,
      0,
      secY,
      secW,
      secH,
      'share',
      UI.cyan,
      score !== undefined ? 'Enviar' : 'Convidar',
      () => void shareWithToast(this, data.gameId, game.title, challenge),
      { fontSize: 24, tint: UI.cyan },
    );

    const menuBtn = buildGlassActionButton(
      this,
      secW + gap,
      secY,
      secW,
      secH,
      'home',
      UI.violet,
      'Menu',
      () => this.go(data, SceneKeys.Hub),
      { fontSize: 24, tint: UI.violet },
    );

    card.add([rankBtn, shareBtn, menuBtn]);
  }

  private go(data: GameOverData, scene: SceneKey, sceneData?: object): void {
    this.scene.stop(data.parent);
    this.scene.start(scene, sceneData);
  }
}
