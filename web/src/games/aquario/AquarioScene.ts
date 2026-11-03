import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { burst, hint } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { DURATION, FISH_PRICE, MAX_FISH, NEED, TANK, TankSim } from './core';

const HUES = [0xfb923c, 0x38bdf8, 0xf472b6, 0xfacc15, 0xa78bfa];

/** "Aquário": drop pellets to grow your fish, sell the big ones, buy more. Hungry fish are lost. */
export class AquarioScene extends MiniScene {
  private sim = new TankSim();
  private g!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private buy!: Button;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Aquario, 'aquario', [0x0e7490, 0x082f49]);
  }

  create(): void {
    this.sim = new TankSim();
    this.frame('30');
    this.g = this.add.graphics().setDepth(3);
    this.info = addText(this, GAME_WIDTH / 2, 178, '', 30, {
      color: '#a5f3fc',
      stroke: '#082f49',
      strokeThickness: 6,
    }).setDepth(50);
    this.buy = new Button(
      this,
      GAME_WIDTH / 2,
      1190,
      `🐠 Comprar peixe (${FISH_PRICE})`,
      () => this.buyFish(),
      {
        width: 520,
        height: 84,
        fontSize: 32,
        color: 0x06b6d4,
        shade: 0x0e7490,
      },
    ).setDepth(20);
    this.hintBox = hint(
      this,
      ['Toque na água para soltar ração (1 moeda)', 'Toque num peixe grande para vendê-lo'],
      1000,
      5500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.tap(p));
  }

  private buyFish(): void {
    if (this.ended) return;
    const { sfx } = getServices(this);
    sfx.play(this.sim.buyFish() ? 'pop' : 'locked');
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.ended || p.y < TANK.y || p.y > TANK.y + TANK.h) return;
    const { sfx } = getServices(this);
    for (const f of this.sim.fish) {
      if (f.stage >= 3 && Math.hypot(p.x - f.x, p.y - f.y) < 90) {
        const got = this.sim.sell(f.id);
        sfx.play('coin');
        burst(this, f.x, f.y, 0xfde047, 14, { speed: 300 });
        this.pop(f.x, f.y - 40, `+${got}`, '#fde047', 48);
        return;
      }
    }
    this.hintBox?.dismiss();
    sfx.play(this.sim.drop(p.x) ? 'tick' : 'locked');
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const r = this.sim.step(Math.min(deltaMs, 50) / 1000);
    const { sfx } = getServices(this);
    if (r.died > 0) {
      sfx.play('hit');
      this.cameras.main.shake(140, 0.006);
    }
    const s = this.sim;
    this.setScore(s.score);
    this.info.setText(
      `🪙 ${s.coins} · 🐟 ${s.fish.length}/${MAX_FISH} · ⏱ ${Math.max(0, Math.ceil(DURATION - s.t))}s`,
    );
    this.buy.setEnabled(s.coins >= FISH_PRICE && s.fish.length < MAX_FISH);
    const g = this.g.clear();
    g.fillStyle(0x0891b2, 0.55).fillRoundedRect(TANK.x, TANK.y, TANK.w, TANK.h, 30);
    g.fillStyle(0xfde68a, 1).fillRoundedRect(TANK.x, TANK.y + TANK.h - 36, TANK.w, 36, 18);
    g.lineStyle(6, 0xa5f3fc, 1).strokeRoundedRect(TANK.x, TANK.y, TANK.w, TANK.h, 30);
    for (const p of s.pellets) g.fillStyle(0xb45309, 1).fillCircle(p.x, p.y, 9);
    for (const f of s.fish) {
      const size = 26 + f.stage * 14;
      const dir = f.vx >= 0 ? 1 : -1;
      const hungry = f.hunger > 9;
      g.fillStyle(hungry ? 0xef4444 : HUES[f.hue % HUES.length]!, 1);
      g.fillEllipse(f.x, f.y, size * 2, size * 1.3);
      g.fillTriangle(
        f.x - dir * size * 0.8,
        f.y,
        f.x - dir * size * 1.7,
        f.y - size * 0.7,
        f.x - dir * size * 1.7,
        f.y + size * 0.7,
      );
      g.fillStyle(0xffffff, 1).fillCircle(f.x + dir * size * 0.55, f.y - size * 0.2, size * 0.22);
      g.fillStyle(0x111827, 1).fillCircle(f.x + dir * size * 0.62, f.y - size * 0.2, size * 0.1);
      if (f.stage >= 3) {
        g.lineStyle(5, 0xfde047, 1).strokeEllipse(f.x, f.y, size * 2 + 12, size * 1.3 + 12);
      } else {
        // Growth progress under the fish.
        g.fillStyle(0x000000, 0.4).fillRect(f.x - 24, f.y + size * 0.9, 48, 7);
        g.fillStyle(0x4ade80, 1).fillRect(
          f.x - 24,
          f.y + size * 0.9,
          48 * (f.fed / NEED[f.stage]!),
          7,
        );
      }
    }
    if (s.done) {
      this.finish(
        'Fim do dia!',
        [`Peixes vendidos: ${s.sold}`, `Moedas e peixes: ${s.score}`],
        { score: s.score, details: { sold: s.sold } },
        500,
      );
    }
  }
}
