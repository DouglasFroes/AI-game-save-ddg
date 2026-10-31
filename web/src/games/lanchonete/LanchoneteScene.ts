import type Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint } from '@/platform/ui/juice';
import { emojiText, heartsLabel, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { Diner, INGREDIENTS, LIVES, type DinerEvent, type Ingredient } from './core';

const LOOK: Record<Ingredient, { color: number; h: number; label: string }> = {
  pao: { color: 0xd97706, h: 30, label: 'Pão' },
  carne: { color: 0x7c2d12, h: 26, label: 'Carne' },
  queijo: { color: 0xfacc15, h: 12, label: 'Queijo' },
  alface: { color: 0x22c55e, h: 12, label: 'Alface' },
  tomate: { color: 0xef4444, h: 14, label: 'Tomate' },
  bacon: { color: 0xf472b6, h: 12, label: 'Bacon' },
  cebola: { color: 0xc084fc, h: 10, label: 'Cebola' },
  topo: { color: 0xf59e0b, h: 40, label: 'Pão (topo)' },
};
const FACES = ['😀', '🙂', '😐', '😟', '😠'];
const PLATE_Y = 900;
const BTN_Y = 1050;

/** "Lanchonete": build each burger exactly as ordered before the customers run out of patience. */
export class LanchoneteScene extends MiniScene {
  private diner = new Diner();
  private g!: Phaser.GameObjects.Graphics;
  private faces: Phaser.GameObjects.Text[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Lanchonete, 'lanchonete', [0x7c2d12, 0x431407]);
  }

  create(): void {
    this.diner = new Diner();
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.faces = [0, 1, 2, 3].map((i) => emojiText(this, 120 + i * 160, 300, '', 70).setDepth(6));
    this.statusText = addText(this, GAME_WIDTH / 2, 168, '', 28, {
      color: '#fed7aa',
      stroke: '#431407',
      strokeThickness: 6,
    }).setDepth(50);
    // Ingredient buttons: two rows of four.
    INGREDIENTS.forEach((ing, i) => {
      const x = 105 + (i % 4) * 170;
      const y = BTN_Y + Math.floor(i / 4) * 110;
      const zone = this.add.zone(x, y, 160, 100).setInteractive();
      zone.on('pointerdown', () => this.add_(ing));
      addText(this, x, y + 30, LOOK[ing].label, 22, { color: '#ffffff' }).setDepth(6);
    });
    this.hintBox = hint(
      this,
      ['Monte o lanche na ordem do pedido:', 'de baixo para cima!'],
      760,
      5000,
    );
  }

  private add_(ing: Ingredient): void {
    if (this.ended) return;
    this.hintBox?.dismiss();
    this.handle(this.diner.add(ing));
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.handle(this.diner.step(Math.min(deltaMs, 40) / 1000));
    this.setScore(this.diner.score);
    this.statusText.setText(
      `Servidos ${this.diner.served} · ${heartsLabel(this.diner.lives, LIVES)}`,
    );
    this.draw();
  }

  private handle(events: DinerEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e.type === 'add') sfx.play('pop', this.diner.plate.length);
      else if (e.type === 'spoiled') {
        sfx.play('locked');
        this.cameras.main.shake(140, 0.008);
        this.pop(GAME_WIDTH / 2, PLATE_Y - 120, 'Errou o pedido!', '#fca5a5', 36);
      } else if (e.type === 'served') {
        sfx.play('coin');
        sfx.vibrate(25);
        burst(this, GAME_WIDTH / 2, PLATE_Y - 60, 0xfde047, 18, { speed: 280 });
        this.pop(GAME_WIDTH / 2, PLATE_Y - 160, `+${e.points}`, '#fde047', 44);
        if (this.diner.served % 10 === 0)
          banner(this, `${this.diner.served} LANCHES!`, '#fde047', 520);
      } else if (e.type === 'arrived') sfx.play('tick');
      else if (e.type === 'left') {
        sfx.play('hit');
        flash(this, 0xef4444, 0.25, 260);
        this.pop(GAME_WIDTH / 2, 380, 'Cliente foi embora! 😤', '#fca5a5', 36);
      } else {
        this.finish(
          'A lanchonete fechou!',
          [`Lanches servidos: ${this.diner.served}`],
          { score: this.diner.score, details: { served: this.diner.served } },
          900,
        );
      }
    }
  }

  /** Draws a burger stack bottom-up from `y` (its base). */
  private stack(
    items: readonly Ingredient[],
    cx: number,
    y: number,
    w: number,
    scale: number,
    alpha = 1,
  ): void {
    const g = this.g;
    let top = y;
    for (const ing of items) {
      const { color, h } = LOOK[ing];
      const hh = h * scale;
      top -= hh;
      const round = ing === 'topo' ? hh : ing === 'pao' ? hh / 2 : 6 * scale;
      g.fillStyle(color, alpha).fillRoundedRect(cx - w / 2, top, w, hh, round);
      if (ing === 'topo')
        g.fillStyle(0xfef3c7, alpha)
          .fillCircle(cx - w * 0.2, top + hh * 0.35, 3 * scale)
          .fillCircle(cx + w * 0.15, top + hh * 0.3, 3 * scale);
    }
  }

  private draw(): void {
    const g = this.g.clear();
    const d = this.diner;
    // Customers: face, patience bar and their ticket.
    for (let i = 0; i < 4; i++) {
      const c = d.queue[i];
      const x = 120 + i * 160;
      this.faces[i]!.setText(
        c ? FACES[Math.min(4, Math.floor((1 - c.patience / c.maxPatience) * 5))]! : '',
      );
      if (!c) continue;
      const frac = Math.max(0, c.patience / c.maxPatience);
      g.fillStyle(0x1c1917, 1).fillRoundedRect(x - 60, 350, 120, 12, 6);
      g.fillStyle(frac < 0.3 ? 0xef4444 : 0x22c55e, 1).fillRoundedRect(
        x - 60,
        350,
        120 * frac,
        12,
        6,
      );
      g.fillStyle(i === 0 ? 0xfef3c7 : 0xe7e5e4, i === 0 ? 1 : 0.6).fillRoundedRect(
        x - 66,
        380,
        132,
        230,
        14,
      );
      this.stack(c.order, x, 590, 100, 0.85);
      if (i === 0) g.lineStyle(5, 0xfacc15, 1).strokeRoundedRect(x - 66, 380, 132, 230, 14);
    }
    // Counter and plate.
    g.fillStyle(0x92400e, 1).fillRect(0, PLATE_Y + 10, GAME_WIDTH, 40);
    g.fillStyle(0xe5e7eb, 1).fillEllipse(GAME_WIDTH / 2, PLATE_Y + 6, 300, 40);
    this.stack(d.plate, GAME_WIDTH / 2, PLATE_Y, 220, 1.3);
    INGREDIENTS.forEach((ing, i) => {
      const x = 105 + (i % 4) * 170;
      const y = BTN_Y + Math.floor(i / 4) * 110;
      g.fillStyle(0x1c1917, 0.85).fillRoundedRect(x - 78, y - 48, 156, 96, 18);
      this.stack([ing], x, y + 8, 110, 1.3);
    });
  }
}
