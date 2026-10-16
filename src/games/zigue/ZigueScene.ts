import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { ZigueSim } from './core';

const CX = GAME_WIDTH / 2;
const BALL_Y = 880;
const TW = 56;
const TH = 32;
const DEPTH = 14;

const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);

/** "Zigue-Zague": tap to turn, stay on the path. */
export class ZigueScene extends MiniScene {
  private sim = new ZigueSim();
  private g!: Phaser.GameObjects.Graphics;
  private hint?: Phaser.GameObjects.Text;
  private fall = 0;

  constructor() {
    super(SceneKeys.Zigue, 'zigue', [0x0b3d5c, 0x1b998b]);
  }

  create(): void {
    this.sim = new ZigueSim();
    this.fall = 0;
    this.frame();
    this.g = this.add.graphics();
    this.hint = addText(this, CX, 1130, 'Toque para começar e virar', 38, {
      color: '#ffffff',
      stroke: '#0b1430',
    });
    const tap = () => {
      if (this.ended) return;
      getServices(this).sfx.play('click');
      // The first tap only starts the run; turning on it would drop the ball off the start.
      if (this.hint) {
        this.hint.destroy();
        this.hint = undefined;
        return;
      }
      this.sim.tap();
    };
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y > 130) tap();
    });
    this.input.keyboard?.on('keydown-SPACE', tap);
  }

  override update(_t: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;
    // The ball waits for the first tap, so the player is ready.
    if (!this.ended && this.hint === undefined) {
      const r = this.sim.step(dt);
      if (r === 'gem') {
        getServices(this).sfx.play('star');
        this.pop(CX, BALL_Y - 90, '+5', '#ffe066');
      } else if (r === 'dead') {
        this.finish('Caiu da pista!', [`Gemas: ${this.sim.gems}`], {
          score: this.sim.score,
          details: { gems: this.sim.gems },
        });
      }
      this.setScore(this.sim.score);
    }
    if (this.sim.dead) this.fall += dt * 900 * (1 + this.fall / 300);
    this.draw();
  }

  private draw(): void {
    const g = this.g.clear();
    const { x, y, index, tiles } = this.sim;
    const sx = (tx: number, ty: number) => CX + (tx - x - (ty - y)) * TW;
    const sy = (tx: number, ty: number) => BALL_Y - (tx - x + (ty - y)) * TH;
    const last = Math.min(tiles.length - 1, index + 24);
    const here = this.sim.tileAt(x, y);
    for (let i = last; i >= Math.max(0, index - 8); i--) {
      const t = tiles[i]!;
      const px = sx(t.x, t.y);
      const py = sy(t.x, t.y);
      g.fillStyle(0x1d3557).fillPoints(
        [
          V(px - TW, py),
          V(px, py + TH),
          V(px + TW, py),
          V(px + TW, py + DEPTH),
          V(px, py + TH + DEPTH),
          V(px - TW, py + DEPTH),
        ],
        true,
      );
      g.fillStyle(i % 2 === 0 ? 0xf1faee : 0xdcefe6).fillPoints(
        [V(px, py - TH), V(px + TW, py), V(px, py + TH), V(px - TW, py)],
        true,
      );
      if (t.gem && t !== here) {
        g.fillStyle(0xffd23f).fillCircle(px, py - 12, 14);
        g.lineStyle(3, 0xb8860b).strokeCircle(px, py - 12, 14);
      }
    }
    g.fillStyle(0x000000, 0.25).fillEllipse(CX, BALL_Y + 8 + this.fall, 44, 18);
    g.fillStyle(0xe63946).fillCircle(CX, BALL_Y - 22 + this.fall, 24);
    g.fillStyle(0xffffff, 0.7).fillCircle(CX - 8, BALL_Y - 30 + this.fall, 7);
  }
}
