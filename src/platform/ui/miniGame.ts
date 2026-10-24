import Phaser from 'phaser';
import { FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, SceneKeys, type SceneKey } from '@/config';
import { canvasTexture } from '@/platform/art/textures';
import type { ScoreRecord } from '@/platform/bestScores';
import { formatNumber } from '@/platform/ranking';
import type { GameOverData } from '@/platform/scenes/GameOverScene';
import { getServices } from '@/services';
import { addText, iconButton } from './widgets';

const EMOJI_FONTS = `${FONT_FAMILY}, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"`;

/** Hub icon: a rounded gradient square with a big emoji. */
export function emojiIcon(
  scene: Phaser.Scene,
  key: string,
  emoji: string,
  top: number,
  bottom: number,
): void {
  const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
  canvasTexture(scene, key, 150, 150, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, 0, 150);
    grad.addColorStop(0, hex(top));
    grad.addColorStop(1, hex(bottom));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(0, 0, 150, 150, 22);
    ctx.fill();
    // Soft top gloss so the tile reads as a glossy icon.
    const gloss = ctx.createLinearGradient(0, 0, 0, 75);
    gloss.addColorStop(0, 'rgba(255,255,255,0.28)');
    gloss.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gloss;
    ctx.beginPath();
    ctx.roundRect(0, 0, 150, 75, [22, 22, 0, 0]);
    ctx.fill();
    // WebKit (iOS) draws nothing for a colour emoji while a gradient is the fill, so reset it to
    // a solid colour and name the emoji fonts explicitly.
    ctx.fillStyle = '#ffffff';
    ctx.font = `84px ${EMOJI_FONTS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
    ctx.fillText(emoji, 75, 80);
  });
}

/** An emoji used as a sprite. */
export function emojiText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  emoji: string,
  size: number,
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, emoji, { fontFamily: EMOJI_FONTS, fontSize: `${size}px`, resolution: 2 })
    .setOrigin(0.5);
}

/**
 * Shared shell of the small arcade games: gradient background, back button, big score and the
 * end-of-run hand-off to the generic GameOver overlay. Each game keeps its rules in a pure core.
 */
export abstract class MiniScene extends Phaser.Scene {
  protected ended = false;
  protected scoreText!: Phaser.GameObjects.Text;

  constructor(
    private readonly sceneKey: SceneKey,
    protected readonly gameId: string,
    private readonly colors: readonly [number, number],
  ) {
    super(sceneKey);
  }

  /** Background, back button, score and record. Call first in `create()`. */
  protected frame(initial = '0'): void {
    this.ended = false;
    const [a, b] = this.colors;
    this.add
      .graphics()
      .setDepth(-10)
      .fillGradientStyle(a, a, b, b, 1)
      .fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    iconButton(this, 60, 60, '‹', () => this.scene.start(SceneKeys.Hub)).setDepth(50);
    this.scoreText = addText(this, GAME_WIDTH / 2, 74, initial, 84, {
      color: '#ffffff',
      stroke: '#0b1430',
      strokeThickness: 12,
    }).setDepth(50);
    const best = getServices(this).best.get(this.gameId);
    if (best)
      addText(this, GAME_WIDTH - 20, 40, `Recorde ${formatNumber(best.score)}`, 24, {
        color: '#ffffff',
        stroke: '#0b1430',
        strokeThickness: 5,
      })
        .setOrigin(1, 0.5)
        .setDepth(50);
  }

  protected setScore(value: number | string): void {
    const text = typeof value === 'number' ? formatNumber(value) : value;
    if (this.scoreText.text === text) return;
    this.scoreText.setText(text);
    this.tweens.add({ targets: this.scoreText, scale: { from: 1.15, to: 1 }, duration: 120 });
  }

  /** Floating text that rises and fades (+1, COMBO…). */
  protected pop(x: number, y: number, label: string, color = '#ffffff', size = 44): void {
    const t = addText(this, x, y, label, size, {
      color,
      stroke: '#0b1430',
      strokeThickness: 8,
    }).setDepth(40);
    this.tweens.add({
      targets: t,
      y: y - 90,
      alpha: 0,
      duration: 700,
      onComplete: () => t.destroy(),
    });
  }

  /** Ends the run: feedback, then the shared GameOver overlay with ranking. */
  protected finish(title: string, lines: string[], record: ScoreRecord | null, delay = 900): void {
    if (this.ended) return;
    this.ended = true;
    const { sfx } = getServices(this);
    sfx.play('hit');
    sfx.vibrate([60, 30, 60]);
    this.cameras.main.shake(200, 0.008);
    const data: GameOverData = {
      gameId: this.gameId,
      title,
      lines,
      record,
      parent: this.sceneKey,
      retry: { scene: this.sceneKey },
    };
    this.time.delayedCall(delay, () => this.scene.launch(SceneKeys.GameOver, data));
  }
}

/** A row of hearts (lives) drawn as text. */
export function heartsLabel(lives: number, max = 3): string {
  return '❤️'.repeat(Math.max(0, lives)) + '🖤'.repeat(Math.max(0, max - lives));
}
