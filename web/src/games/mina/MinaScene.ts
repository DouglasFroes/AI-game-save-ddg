import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, hint } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { formatNumber } from '@/platform/ranking';
import { getServices } from '@/services';
import { MineRun, TIME, UPGRADES } from './core';

const ROCK_Y = 440;
const SHOP_Y = 650;
const ROW_H = 108;

/** "Mina de Ouro": tap the rock, hire help, and mine as much gold as you can in 90 seconds. */
export class MinaScene extends MiniScene {
  private run = new MineRun();
  private g!: Phaser.GameObjects.Graphics;
  private rock!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private rateText!: Phaser.GameObjects.Text;
  private rowTexts: Array<{ info: Phaser.GameObjects.Text; price: Phaser.GameObjects.Text }> = [];
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Mina, 'mina', [0x422006, 0x1c1917]);
  }

  create(): void {
    this.run = new MineRun();
    this.rowTexts = [];
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.rock = emojiText(this, GAME_WIDTH / 2, ROCK_Y, '🪨', 200).setDepth(6);
    this.goldText = addText(this, GAME_WIDTH / 2, 205, '', 40, {
      color: '#fde047',
      stroke: '#422006',
      strokeThickness: 8,
    }).setDepth(50);
    this.rateText = addText(this, GAME_WIDTH / 2, 575, '', 26, { color: '#fef3c7' }).setDepth(50);
    UPGRADES.forEach((u, i) => {
      const y = SHOP_Y + i * ROW_H;
      emojiText(this, 80, y, u.emoji, 52).setDepth(6);
      const info = addText(this, 130, y, '', 24, { color: '#ffffff', align: 'left' })
        .setOrigin(0, 0.5)
        .setDepth(6);
      const price = addText(this, 590, y, '', 26, { color: '#1c1917' }).setDepth(6);
      this.rowTexts.push({ info, price });
    });
    this.hintBox = hint(
      this,
      ['Toque na pedra para minerar ouro', 'Compre ajudantes — o placar é todo o ouro minerado!'],
      300,
      5000,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) =>
      this.tap(p.x, p.y),
    );
  }

  private tap(x: number, y: number): void {
    if (this.ended) return;
    this.hintBox?.dismiss();
    const { sfx } = getServices(this);
    if (Math.abs(y - ROCK_Y) < 120 && Math.abs(x - GAME_WIDTH / 2) < 140) {
      const n = this.run.tap();
      sfx.play('tick', Math.min(8, this.run.owned.picareta));
      this.tweens.add({ targets: this.rock, scale: { from: 0.9, to: 1 }, duration: 90 });
      burst(this, x, y, 0xfde047, 4, { speed: 200, gravity: 600 });
      this.pop(x + Phaser.Math.Between(-40, 40), y - 60, `+${n}`, '#fde047', 30);
      return;
    }
    const i = Math.round((y - SHOP_Y) / ROW_H);
    const u = UPGRADES[i];
    if (!u || Math.abs(y - (SHOP_Y + i * ROW_H)) > ROW_H / 2) return;
    if (this.run.buy(u.id)) {
      sfx.play('coin');
      burst(this, 590, SHOP_Y + i * ROW_H, 0xfde047, 10, { speed: 180 });
      if (this.run.owned[u.id] === 1) banner(this, `${u.name.toUpperCase()}!`, '#fde047', 520);
    } else sfx.play('locked');
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.run.tick(deltaMs / 1000);
    const r = this.run;
    if (r.over) {
      getServices(this).sfx.play('win');
      this.finish(
        'Fim do expediente!',
        [`Ouro minerado: ${formatNumber(r.total)} · Toques: ${r.taps}`],
        { score: r.total, details: { taps: r.taps, perSec: r.perSec } },
        600,
      );
      return;
    }
    this.setScore(formatNumber(r.total));
    this.goldText.setText(`💰 ${formatNumber(r.gold)} para gastar`);
    this.rateText.setText(`${r.perTap} por toque · ${formatNumber(r.perSec)} por segundo`);
    const g = this.g.clear();
    const frac = r.timeLeft / TIME;
    g.fillStyle(0x1c1917, 1).fillRoundedRect(110, 600, 500, 16, 8);
    g.fillStyle(frac < 0.2 ? 0xef4444 : 0xf59e0b, 1).fillRoundedRect(110, 600, 500 * frac, 16, 8);
    UPGRADES.forEach((u, i) => {
      const y = SHOP_Y + i * ROW_H;
      const price = r.price(u.id);
      const can = r.gold >= price;
      g.fillStyle(0x292524, 0.9).fillRoundedRect(30, y - 48, 660, 96, 18);
      g.fillStyle(can ? 0xfacc15 : 0x57534e, 1).fillRoundedRect(500, y - 34, 180, 68, 16);
      const effect = u.tap ? `+${u.tap}/toque` : `+${u.sec}/s`;
      this.rowTexts[i]!.info.setText(`${u.name} ×${r.owned[u.id]}\n${effect}`);
      this.rowTexts[i]!.price.setText(formatNumber(price)).setColor(can ? '#1c1917' : '#a8a29e');
    });
  }
}
