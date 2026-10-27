import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { emojiText, heartsLabel, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { BASKET_Y, BasketSim, type FallingItem } from './core';

const FRUITS = ['🍎', '🍌', '🍇', '🍊', '🍓', '🍉'];

const glyph = (it: FallingItem) =>
  it.kind === 'bomb'
    ? '💣'
    : it.kind === 'gold'
      ? '🌟'
      : it.kind === 'heart'
        ? '💖'
        : FRUITS[it.variant]!;

/** "Cesto Maluco": drag the basket, catch the fruit, avoid the bombs. */
export class CestoScene extends MiniScene {
  private sim = new BasketSim();
  private basket!: Phaser.GameObjects.Text;
  private hearts!: Phaser.GameObjects.Text;
  private sprites = new Map<FallingItem, Phaser.GameObjects.Text>();
  private hint?: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Cesto, 'cesto', [0x2a9d8f, 0x264653]);
  }

  create(): void {
    this.sim = new BasketSim();
    this.sprites.clear();
    this.frame();
    this.basket = emojiText(this, GAME_WIDTH / 2, BASKET_Y, '🧺', 150).setDepth(5);
    this.hearts = addText(this, GAME_WIDTH / 2, 160, heartsLabel(3), 44).setDepth(50);
    this.hint = addText(this, GAME_WIDTH / 2, 640, 'Arraste para mover o cesto', 38, {
      color: '#ffffff',
      stroke: '#0b1430',
    });
    const move = (p: Phaser.Input.Pointer) => {
      if (p.isDown || p.wasTouch === false) this.sim.moveTo(p.x);
    };
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      this.hint?.destroy();
      this.hint = undefined;
      this.sim.moveTo(p.x);
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, move);
    this.input.keyboard?.on('keydown-LEFT', () => this.sim.moveTo(this.sim.x - 70));
    this.input.keyboard?.on('keydown-RIGHT', () => this.sim.moveTo(this.sim.x + 70));
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const { sfx } = getServices(this);
    // Wait for the first touch so the run starts when the player is ready.
    if (this.hint) return;
    for (const e of this.sim.step(Math.min(deltaMs, 50) / 1000)) {
      if (e.type === 'catch') {
        sfx.play(e.kind === 'gold' ? 'win' : 'pop', this.sim.caught % 6);
        if (e.kind === 'gold') this.pop(e.x, BASKET_Y - 110, '+5', '#ffe066');
        if (e.kind === 'heart') this.pop(e.x, BASKET_Y - 110, '+❤️');
        this.setScore(this.sim.score);
        this.tweens.add({ targets: this.basket, scale: { from: 1.15, to: 1 }, duration: 120 });
      } else {
        sfx.play('hit');
        sfx.vibrate(50);
        this.cameras.main.shake(140, 0.007);
        this.pop(
          e.x,
          e.type === 'boom' ? BASKET_Y - 110 : 1150,
          e.type === 'boom' ? 'BUM!' : 'Caiu!',
          '#ff8080',
        );
      }
      this.hearts.setText(heartsLabel(this.sim.lives));
    }
    this.syncSprites();
    this.basket.x += (this.sim.x - this.basket.x) * Math.min(1, deltaMs / 40);
    if (this.sim.dead) {
      const { score, caught } = this.sim;
      this.finish('Acabaram as vidas!', [`Frutas pegas: ${caught}`], {
        score,
        details: { caught },
      });
    }
  }

  private syncSprites(): void {
    const live = new Set(this.sim.items);
    for (const [it, t] of this.sprites)
      if (!live.has(it)) {
        t.destroy();
        this.sprites.delete(it);
      }
    for (const it of this.sim.items) {
      let t = this.sprites.get(it);
      if (!t) {
        t = emojiText(this, it.x, it.y, glyph(it), 70);
        this.sprites.set(it, t);
      }
      t.setPosition(it.x, it.y).setAngle(it.y * 0.3 * (it.variant % 2 ? 1 : -1));
    }
  }
}
