import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { CAPACITY, CASTS, FishingSim, HOOK_R, lineLength, type FishEvent } from './core';

const HOOK_Y = 520;
const SHALLOW = Phaser.Display.Color.ValueToColor(0x0ea5e9);
const DEEP = Phaser.Display.Color.ValueToColor(0x020617);

/** "Pescaria": dodge the fish on the way down, hook them all on the way up. */
export class PescariaScene extends MiniScene {
  private sim = new FishingSim();
  private water!: Phaser.GameObjects.Rectangle;
  private g!: Phaser.GameObjects.Graphics;
  private sprites = new Map<number, Phaser.GameObjects.Text>();
  private statusText!: Phaser.GameObjects.Text;
  private depthText!: Phaser.GameObjects.Text;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Pescaria, 'pescaria', [0x7dd3fc, 0x0369a1]);
  }

  create(): void {
    this.sim = new FishingSim();
    this.sprites = new Map();
    this.water = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0ea5e9)
      .setOrigin(0)
      .setDepth(-9);
    this.frame('0');
    this.g = this.add.graphics().setDepth(8);
    this.statusText = addText(this, GAME_WIDTH / 2, 170, '', 30, {
      color: '#e0f2fe',
      stroke: '#0c4a6e',
      strokeThickness: 6,
    }).setDepth(50);
    this.depthText = addText(this, GAME_WIDTH / 2, 1220, '', 28, {
      color: '#ffffff',
      stroke: '#0c4a6e',
      strokeThickness: 5,
    }).setDepth(50);
    this.makeSprites();
    this.hintBox = hint(
      this,
      ['Descendo: desvie dos peixes!', 'Subindo: pegue todos — cuidado com a água-viva 🪼'],
      1100,
      5000,
    );
    const aim = (p: Phaser.Input.Pointer) => {
      if (this.ended) return;
      this.hintBox?.dismiss();
      this.sim.aim(p.x);
    };
    this.input.on(Phaser.Input.Events.POINTER_DOWN, aim);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (p.isDown) aim(p);
    });
  }

  private makeSprites(): void {
    for (const s of this.sprites.values()) s.destroy();
    this.sprites.clear();
    for (const f of this.sim.fish)
      this.sprites.set(f.id, emojiText(this, f.x, f.y, f.kind.emoji, f.kind.r * 2).setDepth(6));
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const dt = Math.min(deltaMs, 40) / 1000;
    this.handle(this.sim.step(dt));
    const sim = this.sim;
    const toScreen = (y: number) => y - sim.depth + HOOK_Y;

    const t = Math.min(1, sim.depth / 4500);
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(SHALLOW, DEEP, 100, t * 100);
    this.water.setFillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b));

    for (const f of sim.fish) {
      const s = this.sprites.get(f.id);
      if (!s) continue;
      if (f.caught && !f.kind.jelly) {
        // Hooked fish dangle under the hook.
        const i = sim.catch.indexOf(f);
        s.setVisible(i >= 0).setPosition(sim.hookX + Math.sin(i * 1.7) * 18, HOOK_Y + 40 + i * 16);
        continue;
      }
      const y = toScreen(f.y);
      s.setVisible(y > -60 && y < GAME_HEIGHT + 60).setPosition(f.x, y);
      s.setFlipX(f.vx > 0);
      if (f.caught) s.setAlpha(0.3);
    }

    const g = this.g.clear();
    const surface = toScreen(0);
    if (surface > -40) {
      g.fillStyle(0x7c2d12, 1).fillRoundedRect(GAME_WIDTH / 2 - 90, surface - 50, 180, 40, 14);
      g.fillStyle(0xffffff, 0.5).fillRect(0, surface, GAME_WIDTH, 4);
    }
    g.lineStyle(3, 0xffffff, 0.7).lineBetween(
      GAME_WIDTH / 2,
      Math.max(0, surface - 30),
      sim.hookX,
      HOOK_Y,
    );
    g.lineStyle(6, 0xe5e7eb, 1);
    g.beginPath();
    g.arc(sim.hookX, HOOK_Y + 8, HOOK_R * 0.6, 0, Math.PI, false);
    g.strokePath();
    if (sim.phase === 'down') g.fillStyle(0xef4444, 1).fillCircle(sim.hookX, HOOK_Y - 10, 9);

    this.statusText.setText(
      `Lance ${Math.min(sim.cast, CASTS)}/${CASTS} · 🐟 ${sim.catch.length}/${CAPACITY} · ${
        sim.phase === 'down' ? 'Descendo ⬇' : sim.phase === 'up' ? 'Puxando ⬆' : ''
      }`,
    );
    this.depthText.setText(
      `${Math.round(sim.depth / 10)} m de ${Math.round(lineLength(sim.cast) / 10)} m · Recorde ${Math.round(
        sim.deepest / 10,
      )} m`,
    );
  }

  private handle(events: FishEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e.type === 'bump') {
        sfx.play('bounce');
        sfx.vibrate(40);
        this.cameras.main.shake(120, 0.006);
        this.pop(
          this.sim.hookX,
          HOOK_Y - 50,
          `Esbarrou a ${Math.round(e.depth / 10)} m!`,
          '#fde68a',
          34,
        );
      } else if (e.type === 'turn') {
        sfx.play('level');
        banner(this, 'FUNDO! PUXE!', '#a5f3fc', 420);
      } else if (e.type === 'catch') {
        sfx.play('pop', this.sim.catch.length);
        burst(this, this.sim.hookX, HOOK_Y, 0xffffff, 8, { speed: 160 });
        this.pop(this.sim.hookX + 60, HOOK_Y - 20, `+${e.fish.kind.value}`, '#fde047', 34);
      } else if (e.type === 'sting') {
        sfx.play('zap');
        sfx.vibrate([50, 30, 50]);
        flash(this, 0xd946ef, 0.35, 260);
        this.pop(this.sim.hookX, HOOK_Y - 60, `Choque! -${e.lost} 🐟`, '#f5d0fe', 38);
      } else {
        this.setScore(this.sim.score);
        sfx.play(e.count ? 'coin' : 'hit');
        banner(this, e.count ? `${e.count} peixes · +${e.points}` : 'Nada desta vez…', '#fde047');
        this.time.delayedCall(1300, () => {
          if (this.ended) return;
          this.sim.next();
          if (this.sim.over) {
            this.finish(
              this.sim.score >= 3000 ? 'Pescador lendário! 🎣' : 'Fim da pescaria!',
              [
                `Peixes: ${this.sim.totalFish} · Mais fundo: ${Math.round(this.sim.deepest / 10)} m`,
              ],
              {
                score: this.sim.score,
                details: { fish: this.sim.totalFish, depth: Math.round(this.sim.deepest / 10) },
              },
              300,
            );
          } else this.makeSprites();
        });
      }
    }
  }
}
