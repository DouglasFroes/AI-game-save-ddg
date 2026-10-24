import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { ambient, banner, burst, flash, hint } from '@/platform/ui/juice';
import { heartsLabel, MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  MAX_DROPS,
  MIN_OK,
  PERFECT,
  PIGMENTS,
  TintaSim,
  type Pigment,
  type Rgb,
  type TintaEvent,
} from './core';

const toHex = (c: Rgb): number => (c[0] << 16) | (c[1] << 8) | c[2];

const CUP = { x: 360, y: 700, w: 300, h: 380 };

/** "Mistura": the customer wants a colour — mix the paints and deliver it before the time runs out. */
export class TintaScene extends MiniScene {
  private sim = new TintaSim();
  private g!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private pct!: Phaser.GameObjects.Text;
  private fill = 0;
  private shownColor: Rgb = [255, 255, 255];
  private hintBox?: { dismiss: () => void };
  private locked = false;

  constructor() {
    super(SceneKeys.Tinta, 'tinta', [0x0b1020, 0x1e1b4b]);
  }

  create(): void {
    this.sim = new TintaSim();
    this.fill = 0;
    this.shownColor = [255, 255, 255];
    this.locked = false;
    this.frame();
    ambient(this, 0xf0abfc, 16);
    this.g = this.add.graphics().setDepth(4);
    this.hud = addText(this, GAME_WIDTH / 2, 168, '', 30, {
      color: '#e0e7ff',
      stroke: '#0b1020',
      strokeThickness: 6,
    }).setDepth(50);
    this.pct = addText(this, CUP.x, CUP.y + 20, '', 52, {
      color: '#ffffff',
      stroke: '#0b1020',
      strokeThickness: 9,
    }).setDepth(30);

    // Paint buckets.
    const gap = 126;
    PIGMENTS.forEach((p, i) => {
      const x = 360 + (i - 2) * gap;
      this.bucket(p, x, 1090);
    });

    new Button(this, 130, 1225, '↶ Desfazer', () => this.sim.undo(), {
      width: 220,
      height: 78,
      fontSize: 26,
      color: 0x64748b,
      shade: 0x334155,
    }).setDepth(50);
    new Button(this, 350, 1225, 'Limpar', () => this.sim.clear(), {
      width: 180,
      height: 78,
      fontSize: 26,
      color: 0x64748b,
      shade: 0x334155,
    }).setDepth(50);
    new Button(this, 580, 1225, 'ENTREGAR ✓', () => this.deliver(), {
      width: 250,
      height: 78,
      fontSize: 28,
      color: 0x22c55e,
      shade: 0x15803d,
    }).setDepth(50);

    this.hintBox = hint(
      this,
      ['Misture os pigmentos até igualar a cor do pedido', 'Cada gota conta: a mistura é a média!'],
      470,
      7000,
    );
  }

  override update(time: number, deltaMs: number): void {
    if (this.ended) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    if (!this.locked) this.handle(this.sim.step(dt));
    this.setScore(this.sim.score);
    const { sim } = this;
    this.hud.setText(`${heartsLabel(sim.lives)}  ·  Pedido ${sim.index + 1}  ·  🔥 ${sim.streak}`);

    // Ease the cup towards what's inside it so adding a drop feels like pouring.
    const cur = sim.current;
    this.fill += (sim.drops.length / MAX_DROPS - this.fill) * Math.min(1, dt * 9);
    if (cur) {
      this.shownColor = this.shownColor.map(
        (v, i) => v + (cur[i]! - v) * Math.min(1, dt * 10),
      ) as unknown as Rgb;
    }
    this.draw(time);
    const m = sim.drops.length === 0 ? 0 : sim.liveMatch;
    this.pct.setText(sim.drops.length === 0 ? '' : `${Math.round(m * 100)}%`);
    this.pct.setColor(m >= PERFECT ? '#bbf7d0' : m >= MIN_OK ? '#ffffff' : '#fecaca');
  }

  private bucket(p: Pigment, x: number, y: number): void {
    const view = this.add.container(x, y).setDepth(20);
    const g = this.add.graphics();
    const c = toHex(p.rgb);
    g.fillStyle(0x000000, 0.35).fillEllipse(0, 52, 100, 22);
    g.fillStyle(c, 0.35).fillCircle(0, 0, 66);
    g.fillStyle(c).fillCircle(0, 0, 48);
    g.fillStyle(0xffffff, 0.45).fillEllipse(-15, -20, 34, 20);
    g.lineStyle(5, 0xffffff, 0.6).strokeCircle(0, 0, 48);
    view.add(g);
    view.setSize(116, 116).setInteractive({ useHandCursor: true });
    view.on('pointerdown', () => {
      if (this.locked || this.ended) return;
      this.hintBox?.dismiss();
      this.tweens.add({ targets: view, scale: 0.88, duration: 70, yoyo: true });
      const events = this.sim.add(p.id);
      this.handle(events);
      for (const ev of events) {
        if (ev.type !== 'drop') continue;
        const drop = this.add.circle(x, y - 30, 17, c).setDepth(15);
        this.tweens.add({
          targets: drop,
          x: CUP.x + Phaser.Math.Between(-30, 30),
          y: CUP.y - CUP.h / 2 + 30,
          duration: 280,
          ease: 'Quad.easeIn',
          onComplete: () => {
            drop.destroy();
            burst(this, CUP.x, CUP.y - CUP.h / 2 + 50, c, 6, { speed: 150, size: 5, life: 350 });
          },
        });
      }
    });
  }

  private deliver(): void {
    if (this.locked || this.ended) return;
    this.handle(this.sim.deliver());
  }

  private handle(events: TintaEvent[]): void {
    const { sfx } = getServices(this);
    for (const ev of events) {
      switch (ev.type) {
        case 'drop':
          sfx.play('pop');
          break;
        case 'full':
          sfx.play('locked');
          break;
        case 'delivered': {
          const at = CUP.y - CUP.h / 2;
          if (ev.ok) {
            sfx.play(ev.perfect ? 'level' : 'coin', this.sim.streak);
            burst(this, CUP.x, at, toHex(this.sim.order.target), ev.perfect ? 30 : 16, {
              speed: 380,
            });
            if (ev.perfect) {
              banner(this, 'COR PERFEITA!', '#fde047');
              flash(this, 0xffffff, 0.25);
            }
            this.pop(CUP.x, at - 30, `+${ev.points}`, '#ffffff', 52);
          } else {
            sfx.play('hit');
            this.cameras.main.shake(200, 0.007);
            banner(this, `Só ${Math.round(ev.accuracy * 100)}%…`, '#fda4af');
          }
          this.locked = true;
          this.time.delayedCall(ev.ok ? 650 : 900, () => (this.locked = false));
          break;
        }
        case 'timeUp':
          sfx.play('hit');
          banner(this, 'Tempo esgotado!', '#fda4af');
          this.cameras.main.shake(160, 0.006);
          break;
        case 'newOrder':
          sfx.play('tick');
          this.fill = 0;
          break;
        case 'over':
          this.finish(
            'Pedidos encerrados!',
            [`Pedidos entregues: ${this.sim.orders}`, `Cores perfeitas: ${this.sim.perfect}`],
            {
              score: this.sim.score,
              details: { orders: this.sim.orders, perfect: this.sim.perfect },
            },
            this.locked ? 900 : 500,
          );
          break;
      }
    }
  }

  private draw(time: number): void {
    const { sim } = this;
    const g = this.g.clear();
    const t = sim.order.target;

    // Order card with a time bar.
    const cx = GAME_WIDTH / 2;
    g.fillStyle(0x000000, 0.35).fillRoundedRect(cx - 300, 210, 600, 150, 28);
    g.lineStyle(3, 0xffffff, 0.18).strokeRoundedRect(cx - 300, 210, 600, 150, 28);
    g.fillStyle(toHex(t)).fillRoundedRect(cx - 280, 230, 190, 110, 20);
    g.lineStyle(4, 0xffffff, 0.7).strokeRoundedRect(cx - 280, 230, 190, 110, 20);
    g.fillStyle(0xffffff, 0.22).fillRoundedRect(cx - 270, 238, 170, 24, 12);
    const k = Phaser.Math.Clamp(sim.time / sim.order.seconds, 0, 1);
    const hot = k < 0.25;
    g.fillStyle(0xffffff, 0.12).fillRoundedRect(cx - 70, 290, 350, 24, 12);
    g.fillStyle(hot ? 0xef4444 : 0x38bdf8).fillRoundedRect(
      cx - 68,
      292,
      Math.max(18, 346 * k),
      20,
      10,
    );
    if (hot)
      g.fillStyle(0xef4444, 0.12 + Math.abs(Math.sin(time / 150)) * 0.18).fillRoundedRect(
        cx - 300,
        210,
        600,
        150,
        28,
      );

    // The cup.
    const x = CUP.x - CUP.w / 2;
    const y = CUP.y - CUP.h / 2;
    g.fillStyle(0xffffff, 0.07).fillRoundedRect(x, y, CUP.w, CUP.h, 34);
    const level = CUP.h * (0.18 + 0.82 * this.fill) * (sim.drops.length ? 1 : 0);
    if (level > 2) {
      const col = toHex(this.shownColor.map(Math.round) as unknown as Rgb);
      const top = y + CUP.h - level;
      g.fillStyle(col).fillRoundedRect(x + 6, top, CUP.w - 12, level - 4, {
        tl: 8,
        tr: 8,
        bl: 30,
        br: 30,
      });
      const wave = Math.sin(time / 260) * 4;
      g.fillStyle(0xffffff, 0.3).fillEllipse(CUP.x, top + wave, CUP.w - 24, 16);
    }
    g.lineStyle(6, 0xffffff, 0.75).strokeRoundedRect(x, y, CUP.w, CUP.h, 34);
    for (let i = 1; i < MAX_DROPS; i++) {
      const ly = y + CUP.h - CUP.h * (0.18 + (0.82 * i) / MAX_DROPS);
      g.lineStyle(2, 0xffffff, 0.18).lineBetween(x + CUP.w - 34, ly, x + CUP.w - 8, ly);
    }

    // Small swatch of the target sits beside the cup so the eye can compare directly.
    g.fillStyle(toHex(t)).fillRoundedRect(x + CUP.w + 24, y + 30, 36, CUP.h - 60, 18);
    g.lineStyle(3, 0xffffff, 0.6).strokeRoundedRect(x + CUP.w + 24, y + 30, 36, CUP.h - 60, 18);
  }
}
