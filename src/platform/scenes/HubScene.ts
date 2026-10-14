import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { GAMES, type GameDefinition } from '@/games/registry';
import { formatNumber } from '@/platform/ranking';
import { askName } from '@/platform/ui/nameDialog';
import { addBackground, addText, Button, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';

const CARD_W = 316;
const CARD_H = 380;

/** Main menu: pick a game, set your nickname, toggle sound. */
export class HubScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Hub);
  }

  create(): void {
    const { profile, sfx, leaderboard } = getServices(this);
    const cx = GAME_WIDTH / 2;
    addBackground(this);

    const title = addText(this, cx, 110, 'Fliperama', 92, {
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
      232,
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
        height: 84,
        fontSize: 32,
        color: COLORS.panel,
        shade: 0xc7cfdc,
        textColor: COLORS.text,
      },
    );

    GAMES.forEach((game, i) => {
      const x = cx + (i % 2 === 0 ? -1 : 1) * (CARD_W / 2 + 12);
      const y = 520 + Math.floor(i / 2) * (CARD_H + 28);
      this.buildCard(game, x, y);
    });

    addText(
      this,
      cx,
      1250,
      leaderboard.hasRemote ? '🌎 Ranking global ativo' : '📱 Ranking salvo neste aparelho',
      24,
      { color: COLORS.textLight, stroke: '#1d2b53', strokeThickness: 5 },
    );
  }

  private buildCard(game: GameDefinition, x: number, y: number): void {
    const services = getServices(this);
    const card = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.2).fillRoundedRect(
      -CARD_W / 2 + 5,
      -CARD_H / 2 + 10,
      CARD_W,
      CARD_H,
      34,
    );
    g.fillStyle(game.shade).fillRoundedRect(-CARD_W / 2, -CARD_H / 2 + 6, CARD_W, CARD_H, 34);
    g.fillStyle(game.color).fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 34);
    g.fillStyle(0xffffff, 0.92).fillRoundedRect(
      -CARD_W / 2 + 16,
      -CARD_H / 2 + 16,
      CARD_W - 32,
      178,
      24,
    );
    card.add(g);

    const icon = this.add.image(0, -CARD_H / 2 + 105, game.icon);
    icon.setScale(Math.min(150 / icon.width, 140 / icon.height));
    card.add(icon);
    this.tweens.add({
      targets: icon,
      y: icon.y - 8,
      duration: 900 + Math.random() * 300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    card.add(
      addText(this, 0, 40, game.title, 30, {
        color: COLORS.textLight,
        stroke: '#00000055',
        strokeThickness: 6,
        wrapWidth: CARD_W - 20,
      }),
    );
    card.add(addText(this, 0, 86, game.tagline, 22, { color: '#ffffffdd', weight: 'normal' }));
    const best = game.personalBest(services);
    card.add(
      addText(this, 0, 128, best ? `Recorde: ${formatNumber(best.score)}` : 'Sem recorde', 24, {
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
      this.scene.start(game.entryScene);
    });

    // Separate object (not a child) so its tap is not also a card tap.
    new Button(
      this,
      x + CARD_W / 2 - 44,
      y - CARD_H / 2 + 42,
      '🏆',
      () => this.scene.start(SceneKeys.Leaderboard, { gameId: game.id }),
      { width: 72, height: 64, fontSize: 32, color: COLORS.panel, shade: 0xc7cfdc },
    );
  }
}
