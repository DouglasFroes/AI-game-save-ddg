import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { Tex } from '@/platform/art/textures';
import { emojiText, heartsLabel, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { SliceSim, type Flyer } from './core';

const FRUITS = ['🍉', '🍊', '🍎', '🍍', '🥝', '🍋'];
const JUICE = [0xff5d73, 0xffa62b, 0xe63946, 0xffe066, 0x8ac926, 0xf9f871];
const TRAIL_MS = 180;

/** "Corta Frutas": swipe to slice the fruit, avoid the bombs. */
export class CortaScene extends MiniScene {
  private sim = new SliceSim();
  private sprites = new Map<Flyer, Phaser.GameObjects.Text>();
  private trail: Array<{ x: number; y: number; t: number }> = [];
  private g!: Phaser.GameObjects.Graphics;
  private hearts!: Phaser.GameObjects.Text;
  private last: { x: number; y: number } | null = null;

  constructor() {
    super(SceneKeys.Corta, 'corta', [0x3a0ca3, 0xf72585]);
  }

  create(): void {
    this.sim = new SliceSim();
    this.sprites.clear();
    this.trail = [];
    this.last = null;
    this.frame();
    this.g = this.add.graphics().setDepth(20);
    this.hearts = addText(this, GAME_WIDTH / 2, 190, heartsLabel(3), 46).setDepth(50);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      this.last = { x: p.x, y: p.y };
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (!p.isDown || this.ended) return;
      if (this.last) this.cut(this.last.x, this.last.y, p.x, p.y);
      this.trail.push({ x: p.x, y: p.y, t: this.time.now });
      this.last = { x: p.x, y: p.y };
    });
    const up = () => (this.last = null);
    this.input.on(Phaser.Input.Events.POINTER_UP, up);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, up);
  }

  private cut(ax: number, ay: number, bx: number, by: number): void {
    const { sfx } = getServices(this);
    const res = this.sim.slice(ax, ay, bx, by);
    for (const f of res.fruits) {
      sfx.play('pop', Math.floor(Math.random() * 6));
      this.splash(f.x, f.y, JUICE[f.variant]!);
    }
    if (res.fruits.length >= 3) this.pop(bx, by - 40, `COMBO x${res.fruits.length}!`, '#ffe066');
    if (res.fruits.length) this.setScore(this.sim.score);
    for (const b of res.bombs) {
      this.splash(b.x, b.y, 0xffffff);
      this.finish('Cortou uma bomba!', [`Frutas: ${this.sim.sliced}`], {
        score: this.sim.score,
        details: { fruits: this.sim.sliced, combo: this.sim.bestCombo },
      });
    }
  }

  private splash(x: number, y: number, tint: number): void {
    const p = this.add.particles(x, y, Tex.dot, {
      speed: { min: 120, max: 380 },
      lifespan: 450,
      scale: { start: 1, end: 0 },
      tint,
      gravityY: 600,
      emitting: false,
    });
    p.setDepth(15).explode(14);
    this.time.delayedCall(500, () => p.destroy());
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const missed = this.sim.step(Math.min(deltaMs, 50) / 1000);
    if (missed.length) {
      const { sfx } = getServices(this);
      sfx.play('hit');
      this.hearts.setText(heartsLabel(this.sim.lives));
    }
    if (this.sim.dead && !this.sim.exploded) {
      this.finish('Deixou cair demais!', [`Frutas: ${this.sim.sliced}`], {
        score: this.sim.score,
        details: { fruits: this.sim.sliced, combo: this.sim.bestCombo },
      });
    }
    this.syncSprites();
    this.drawTrail();
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
        t = emojiText(this, it.x, it.y, it.kind === 'bomb' ? '💣' : FRUITS[it.variant]!, 120);
        this.sprites.set(it, t);
      }
      t.setPosition(it.x, it.y).setAngle(it.x * 0.5 + it.y * 0.2);
    }
  }

  private drawTrail(): void {
    const now = this.time.now;
    this.trail = this.trail.filter((p) => now - p.t < TRAIL_MS);
    const g = this.g.clear();
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1]!;
      const b = this.trail[i]!;
      const life = 1 - (now - b.t) / TRAIL_MS;
      g.lineStyle(14 * life + 2, 0xffffff, life).lineBetween(a.x, a.y, b.x, b.y);
    }
  }
}
