import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import { HOW_TO } from '@/platform/howTo';
import { addText, Button, iconButton } from '@/platform/ui/widgets';

/** Scenes that are never the running game: the 💡 button waits for one of the others. */
const PLATFORM: readonly string[] = [
  SceneKeys.Boot,
  SceneKeys.Hub,
  SceneKeys.Leaderboard,
  SceneKeys.Hall,
  SceneKeys.GameOver,
  SceneKeys.HowTo,
];
const SEEN_KEY = 'fliper.howto.seen';

function readSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeSeen(seen: Set<string>): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    // Private mode or blocked storage: the card just opens again next time.
  }
}

/**
 * Overlay that runs on top of any game: a yellow 💡 button next to the back button that opens the
 * "Como jogar" card. The card opens by itself the first time a game is played. While it is open the
 * running game scene is paused (so its clock and input wait). The overlay ends when the hub returns.
 */
export class HowToScene extends Phaser.Scene {
  private gameId = '';
  private button?: Phaser.GameObjects.Container;
  private cardObjects: Phaser.GameObjects.GameObject[] = [];
  private paused: string[] = [];

  constructor() {
    super(SceneKeys.HowTo);
  }

  init(data: { gameId?: string }): void {
    this.gameId = data.gameId ?? '';
    this.cardObjects = [];
    this.paused = [];
    this.button = undefined;
  }

  create(): void {
    if (!HOW_TO[this.gameId]) {
      this.scene.stop();
      return;
    }
    this.button = iconButton(this, 170, 60, '💡', () => this.open(), 0xfde047).setDepth(100);
    const seen = readSeen();
    if (!seen.has(this.gameId)) {
      seen.add(this.gameId);
      writeSeen(seen);
      // Let the game finish loading and drawing its first frame before pausing it.
      this.time.delayedCall(500, () => this.open());
    }
  }

  override update(): void {
    const manager = this.scene.manager;
    const leftGame = [SceneKeys.Hub, SceneKeys.Leaderboard, SceneKeys.Hall].some((k) =>
      manager.isActive(k),
    );
    if (!this.cardObjects.length && leftGame) {
      this.scene.stop();
      return;
    }
    // Hidden while the result card is up, and while the running scene is a menu-less overlay.
    this.button?.setVisible(!manager.isActive(SceneKeys.GameOver) && !this.cardObjects.length);
  }

  private running(): string[] {
    return this.scene.manager
      .getScenes(true)
      .map((s) => s.sys.settings.key)
      .filter((k) => !PLATFORM.includes(k));
  }

  private open(): void {
    const card = HOW_TO[this.gameId];
    if (!card || this.cardObjects.length || this.scene.manager.isActive(SceneKeys.GameOver)) return;
    this.paused = this.running();
    for (const key of this.paused) this.scene.pause(key);

    const W = 620;
    const X = (GAME_WIDTH - W) / 2;
    const title = addText(this, GAME_WIDTH / 2, 0, 'Como jogar', 52, {
      color: '#fde047',
      stroke: '#000000',
      strokeThickness: 8,
    }).setDepth(112);
    const goal = addText(this, GAME_WIDTH / 2, 0, `🎯 ${card.goal}`, 34, {
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 6,
      wrapWidth: 540,
      align: 'center',
    })
      .setOrigin(0.5, 0)
      .setDepth(112);
    const steps = addText(
      this,
      X + 40,
      0,
      card.steps.map((t, i) => `${i + 1}. ${t}`).join('\n\n'),
      30,
      { color: '#e2e8f0', stroke: '#000000', strokeThickness: 5, wrapWidth: 540 },
    )
      .setOrigin(0, 0)
      .setAlign('left')
      .setDepth(112);
    // The card grows with its text and sits in the middle of the screen.
    const H = 40 + title.height + 30 + goal.height + 40 + steps.height + 50 + 90 + 40;
    const top = Math.max(110, (GAME_HEIGHT - H) / 2);
    let y = top + 40;
    title.setY(y + title.height / 2);
    y += title.height + 30;
    goal.setY(y);
    y += goal.height + 40;
    steps.setY(y);
    y += steps.height + 50 + 45;

    const shade = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.78)
      .setDepth(110)
      .setInteractive();
    const panel = this.add.graphics().setDepth(111);
    panel.fillStyle(0x0f172a, 1).fillRoundedRect(X, top, W, H, 32);
    panel.lineStyle(6, 0xfde047, 1).strokeRoundedRect(X, top, W, H, 32);
    const ok = new Button(this, GAME_WIDTH / 2, y, 'Entendi!', () => this.close(), {
      width: 320,
      height: 90,
      fontSize: 40,
      color: 0x22c55e,
      shade: 0x15803d,
    }).setDepth(113);
    this.cardObjects = [shade, panel, title, goal, steps, ok];
    this.button?.setVisible(false);
  }

  private close(): void {
    for (const obj of this.cardObjects) obj.destroy();
    this.cardObjects = [];
    for (const key of this.paused) if (this.scene.isPaused(key)) this.scene.resume(key);
    this.paused = [];
  }
}

/** Starts the 💡 overlay for a game that was just opened (replacing a stale one). */
export function launchHowTo(scene: Phaser.Scene, gameId: string): void {
  if (scene.scene.manager.isActive(SceneKeys.HowTo)) scene.scene.manager.stop(SceneKeys.HowTo);
  scene.scene.launch(SceneKeys.HowTo, { gameId });
  // Above the game's scenes (added later), below the result card.
  scene.scene.manager.bringToTop(SceneKeys.HowTo);
  scene.scene.manager.bringToTop(SceneKeys.GameOver);
}
