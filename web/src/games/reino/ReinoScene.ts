import Phaser from 'phaser';
import { SceneKeys } from '@/config';
import { hint } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { EMOJIS, KingdomSim, STATS } from './core';

const CARD = { x: 360, y: 700, w: 520, h: 440 };

/** "Reino": answer every request, keep the four gauges balanced and reign as long as you can. */
export class ReinoScene extends MiniScene {
  private sim = new KingdomSim();
  private g!: Phaser.GameObjects.Graphics;
  private who!: Phaser.GameObjects.Text;
  private body!: Phaser.GameObjects.Text;
  private leftLabel!: Phaser.GameObjects.Text;
  private rightLabel!: Phaser.GameObjects.Text;
  private dragX = 0;
  private dragging = false;
  private busy = false;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Reino, 'reino', [0x6d28d9, 0x1e1b4b]);
  }

  create(): void {
    this.sim = new KingdomSim();
    this.dragX = 0;
    this.dragging = false;
    this.busy = false;
    this.frame('0');
    this.g = this.add.graphics().setDepth(3);
    for (let i = 0; i < 4; i++) {
      emojiText(this, 105 + i * 170, 262, EMOJIS[i]!, 56).setDepth(6);
      addText(this, 105 + i * 170, 338, STATS[i]!, 22, {
        color: '#ddd6fe',
        stroke: '#1e1b4b',
        strokeThickness: 4,
      }).setDepth(6);
    }
    this.who = addText(this, CARD.x, CARD.y - 150, '', 38, {
      color: '#fde68a',
      stroke: '#1e1b4b',
      strokeThickness: 7,
    }).setDepth(8);
    this.body = addText(this, CARD.x, CARD.y - 20, '', 40, {
      color: '#ffffff',
      stroke: '#1e1b4b',
      strokeThickness: 7,
      wrapWidth: 440,
    }).setDepth(8);
    this.leftLabel = addText(this, 160, CARD.y + 170, '', 34, {
      color: '#fca5a5',
      stroke: '#1e1b4b',
      strokeThickness: 6,
    }).setDepth(8);
    this.rightLabel = addText(this, 560, CARD.y + 170, '', 34, {
      color: '#86efac',
      stroke: '#1e1b4b',
      strokeThickness: 6,
    }).setDepth(8);
    new Button(this, 190, 1130, '◀', () => this.choose('left'), {
      width: 280,
      height: 100,
      fontSize: 52,
      color: 0xef4444,
      shade: 0xb91c1c,
    }).setDepth(20);
    new Button(this, 530, 1130, '▶', () => this.choose('right'), {
      width: 280,
      height: 100,
      fontSize: 52,
      color: 0x22c55e,
      shade: 0x15803d,
    }).setDepth(20);
    this.hintBox = hint(
      this,
      ['Arraste a carta ou use os botões', 'Mantenha os medidores longe de 0 e 100'],
      1015,
      5500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (
        !this.ended &&
        !this.busy &&
        Math.abs(p.x - CARD.x) < CARD.w / 2 &&
        Math.abs(p.y - CARD.y) < CARD.h / 2
      ) {
        this.dragging = true;
        this.dragX = 0;
      }
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.dragging) this.dragX = Math.max(-260, Math.min(260, p.x - CARD.x));
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => {
      if (!this.dragging) return;
      this.dragging = false;
      if (Math.abs(this.dragX) > 110) this.choose(this.dragX < 0 ? 'left' : 'right');
      this.dragX = 0;
    });
    this.show();
  }

  private choose(side: 'left' | 'right'): void {
    if (this.ended || this.busy) return;
    this.hintBox?.dismiss();
    this.busy = true;
    getServices(this).sfx.play('pop');
    this.sim.answer(side);
    this.setScore(this.sim.years);
    this.time.delayedCall(120, () => {
      this.busy = false;
      if (this.sim.over) this.end();
      else this.show();
    });
  }

  private show(): void {
    const c = this.sim.card;
    this.who.setText(c.who);
    this.body.setText(c.text);
    this.leftLabel.setText(c.left.label);
    this.rightLabel.setText(c.right.label);
  }

  private end(): void {
    const o = this.sim.over!;
    const what = `${STATS[o.stat]} ${o.high ? 'demais' : 'acabou'}`;
    this.finish(
      'O reinado terminou!',
      [`Causa: ${what}`, `Decisões: ${this.sim.years}`],
      { score: this.sim.years, details: { years: this.sim.years } },
      500,
    );
  }

  override update(): void {
    const g = this.g.clear();
    const s = this.sim;
    // Gauges, and a dot under each gauge the card in your hand would move.
    const lean = this.dragX < -30 ? 'left' : this.dragX > 30 ? 'right' : null;
    for (let i = 0; i < 4; i++) {
      const x = 105 + i * 170;
      const v = s.stats[i]!;
      g.fillStyle(0x000000, 0.4).fillRoundedRect(x - 60, 372, 120, 22, 11);
      const danger = v < 20 || v > 80;
      g.fillStyle(danger ? 0xef4444 : 0xfacc15, 1).fillRoundedRect(
        x - 60,
        372,
        120 * (v / 100),
        22,
        11,
      );
      if (lean) {
        const fx = s.card[lean].fx[i]!;
        if (fx !== 0) g.fillStyle(0xffffff, 1).fillCircle(x, 412, Math.abs(fx) > 8 ? 11 : 7);
      }
    }
    const x = CARD.x + this.dragX;
    const rot = this.dragX * 0.0006;
    g.fillStyle(0x000000, 0.35).fillRoundedRect(
      x - CARD.w / 2 + 8,
      CARD.y - CARD.h / 2 + 14,
      CARD.w,
      CARD.h,
      36,
    );
    g.fillStyle(0x4c1d95, 1).fillRoundedRect(
      x - CARD.w / 2,
      CARD.y - CARD.h / 2,
      CARD.w,
      CARD.h,
      36,
    );
    g.lineStyle(
      6,
      lean === 'left' ? 0xef4444 : lean === 'right' ? 0x22c55e : 0xa78bfa,
      1,
    ).strokeRoundedRect(x - CARD.w / 2, CARD.y - CARD.h / 2, CARD.w, CARD.h, 36);
    for (const t of [this.who, this.body]) t.setX(x).setRotation(rot);
  }
}
