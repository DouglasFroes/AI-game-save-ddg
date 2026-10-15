import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { GAMES, type GameDefinition } from '@/games/registry';
import { loadGame } from '@/platform/gameLoader';
import { formatNumber } from '@/platform/ranking';
import { askName } from '@/platform/ui/nameDialog';
import { addBackground, addText, Button, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';

const COLS = 3;
const CARD_W = 214;
const CARD_H = 300;
const GAP = 16;
const GRID_TOP = 290;

/** Main menu: pick a game, set your nickname, toggle sound. */
export class HubScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Hub);
  }

  private opening = false;

  create(): void {
    this.opening = false;
    const { profile, sfx, leaderboard } = getServices(this);
    const cx = GAME_WIDTH / 2;
    addBackground(this);

    const title = addText(this, cx, 90, 'Fliperama', 84, {
      color: '#ffd23f',
      stroke: '#1d2b53',
      strokeThickness: 16,
    });
    this.tweens.add({
      targets: title,
      scale: { from: 1, to: 1.04 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const sound = iconButton(this, GAME_WIDTH - 66, 66, sfx.muted ? '🔇' : '🔊', () => {
      sfx.muted = !sfx.muted;
      profile.update({ muted: sfx.muted });
      sound.label.setText(sfx.muted ? '🔇' : '🔊');
    });

    const nameLabel = () => `👤 ${profile.get().name || 'Escolha seu nome'}  ✎`;
    const nameButton = new Button(
      this,
      cx,
      200,
      nameLabel(),
      async () => {
        const name = await askName(this, profile.get().name);
        if (name) {
          profile.update({ name });
          nameButton.label.setText(nameLabel());
        }
      },
      {
        width: 520,
        height: 80,
        fontSize: 30,
        color: COLORS.panel,
        shade: 0xc7cfdc,
        textColor: COLORS.text,
      },
    );

    const gridW = COLS * CARD_W + (COLS - 1) * GAP;
    GAMES.forEach((game, i) => {
      const x = (GAME_WIDTH - gridW) / 2 + CARD_W / 2 + (i % COLS) * (CARD_W + GAP);
      const y = GRID_TOP + CARD_H / 2 + Math.floor(i / COLS) * (CARD_H + GAP);
      this.buildCard(game, x, y);
    });

    addText(
      this,
      cx,
      1255,
      leaderboard.hasRemote ? '🌎 Ranking global ativo' : '📱 Ranking salvo neste aparelho',
      22,
      { color: COLORS.textLight, stroke: '#1d2b53', strokeThickness: 5 },
    );

    // The hub is already on screen: warm the game chunks in the background so taps feel instant.
    this.time.delayedCall(1500, () => {
      for (const game of GAMES) loadGame(this.game, game).catch(() => undefined);
    });
  }

  private open(game: GameDefinition): void {
    if (this.opening) return;
    this.opening = true;
    loadGame(this.game, game).then(
      () => {
        if (this.sys.isActive()) this.scene.start(game.entryScene);
      },
      (err: unknown) => {
        console.warn(`Falha ao carregar ${game.id}`, err);
        this.opening = false;
        if (!this.sys.isActive()) return;
        const msg = addText(this, GAME_WIDTH / 2, 1200, 'Sem conexão. Tente de novo.', 26, {
          color: COLORS.textLight,
          stroke: '#1d2b53',
          strokeThickness: 6,
        });
        this.time.delayedCall(2200, () => msg.destroy());
      },
    );
  }

  private buildCard(game: GameDefinition, x: number, y: number): void {
    const services = getServices(this);
    const card = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.2).fillRoundedRect(
      -CARD_W / 2 + 4,
      -CARD_H / 2 + 8,
      CARD_W,
      CARD_H,
      28,
    );
    g.fillStyle(game.shade).fillRoundedRect(-CARD_W / 2, -CARD_H / 2 + 6, CARD_W, CARD_H, 28);
    g.fillStyle(game.color).fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 28);
    g.fillStyle(0xffffff, 0.92).fillRoundedRect(
      -CARD_W / 2 + 12,
      -CARD_H / 2 + 12,
      CARD_W - 24,
      150,
      20,
    );
    card.add(g);

    const icon = this.add.image(0, -CARD_H / 2 + 87, game.icon);
    icon.setScale(Math.min(116 / icon.width, 116 / icon.height));
    card.add(icon);
    this.tweens.add({
      targets: icon,
      y: icon.y - 6,
      duration: 900 + Math.random() * 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    card.add(
      addText(this, 0, 42, game.title, game.title.length > 12 ? 21 : 27, {
        color: COLORS.textLight,
        stroke: '#00000055',
        strokeThickness: 5,
      }),
    );
    card.add(addText(this, 0, 80, game.tagline, 18, { color: '#ffffffdd', weight: 'normal' }));
    const best = game.personalBest(services);
    card.add(
      addText(this, 0, 116, best ? `👑 ${formatNumber(best.score)}` : 'Sem recorde', 21, {
        color: COLORS.textLight,
      }),
    );

    card.setSize(CARD_W, CARD_H);
    card.setInteractive({ useHandCursor: true });
    card.on('pointerdown', () => card.setScale(0.96));
    card.on('pointerout', () => card.setScale(1));
    card.on('pointerup', () => {
      card.setScale(1);
      services.sfx.play('click');
      this.open(game);
    });

    // Separate object (not a child) so its tap is not also a card tap.
    new Button(
      this,
      x + CARD_W / 2 - 36,
      y - CARD_H / 2 + 34,
      '🏆',
      () => this.scene.start(SceneKeys.Leaderboard, { gameId: game.id }),
      { width: 58, height: 52, fontSize: 26, color: COLORS.panel, shade: 0xc7cfdc },
    );
  }
}
