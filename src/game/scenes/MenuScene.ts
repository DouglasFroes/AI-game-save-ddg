import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { setMuted } from '@/core/progress';
import { Tex } from '@/game/art/textures';
import { addBackground, addText, Button, iconButton } from '@/game/ui/widgets';
import { getServices } from '@/services';

export class MenuScene extends Phaser.Scene {
  private bees: Phaser.GameObjects.Image[] = [];

  constructor() {
    super(SceneKeys.Menu);
  }

  create(): void {
    const { progress, sfx } = getServices(this);
    const cx = GAME_WIDTH / 2;
    addBackground(this);

    const title = addText(this, cx, 250, 'Salve o\nDoguinho', 104, {
      color: '#ffd23f',
      stroke: '#1d2b53',
      strokeThickness: 16,
    });
    this.tweens.add({
      targets: title,
      angle: { from: -2, to: 2 },
      duration: 1600,
      yoyo: true,
      repeat: -1,
    });

    const dog = this.add.image(cx, 600, Tex.dog('idle')).setScale(2.4);
    this.tweens.add({
      targets: dog,
      y: 585,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.time.addEvent({
      delay: 2600,
      loop: true,
      callback: () => {
        dog.setTexture(Tex.dog('scared'));
        this.time.delayedCall(500, () => dog.setTexture(Tex.dog('idle')));
      },
    });
    this.bees = [0, 1, 2].map(() => this.add.image(cx, 600, Tex.bee).setScale(1.3));

    new Button(this, cx, 860, '▶  Jogar', () => this.scene.start(SceneKeys.LevelSelect), {
      width: 480,
      height: 124,
      fontSize: 54,
    });
    new Button(this, cx, 1010, '🏆 Ranking', () => this.scene.start(SceneKeys.Ranking), {
      width: 480,
      color: COLORS.secondary,
      shade: COLORS.secondaryDark,
    });

    const sound = iconButton(this, GAME_WIDTH - 70, 70, sfx.muted ? '🔇' : '🔊', () => {
      sfx.muted = !sfx.muted;
      progress.update((p) => setMuted(p, sfx.muted));
      sound.label.setText(sfx.muted ? '🔇' : '🔊');
    });

    addText(this, cx, 1170, 'Desenhe uma linha para proteger\no doguinho das abelhas!', 30, {
      color: COLORS.textLight,
      stroke: '#1d2b53',
      strokeThickness: 6,
    });
  }

  override update(time: number): void {
    this.bees.forEach((bee, i) => {
      const a = time / 600 + (i * Math.PI * 2) / 3;
      bee.setPosition(GAME_WIDTH / 2 + Math.cos(a) * 210, 600 + Math.sin(a * 1.3) * 90);
      bee.setFlipX(Math.sin(a) > 0);
    });
  }
}
