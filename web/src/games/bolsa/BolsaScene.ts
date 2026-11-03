import type Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { hint } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { DURATION, EMOJIS, MarketSim, NAMES, NEWS_DELAY, START_CASH } from './core';

const ROW_Y = [330, 570, 810];

/** "Bolsa": read the headlines, buy before the jump and sell before the crash. */
export class BolsaScene extends MiniScene {
  private sim = new MarketSim();
  private g!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private news!: Phaser.GameObjects.Text;
  private rows: Array<{ price: Phaser.GameObjects.Text; held: Phaser.GameObjects.Text }> = [];
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Bolsa, 'bolsa', [0x0f766e, 0x042f2e]);
  }

  create(): void {
    this.sim = new MarketSim();
    this.rows = [];
    this.frame(String(START_CASH));
    this.g = this.add.graphics().setDepth(3);
    this.info = addText(this, GAME_WIDTH / 2, 178, '', 30, {
      color: '#99f6e4',
      stroke: '#042f2e',
      strokeThickness: 6,
    }).setDepth(50);
    for (let i = 0; i < 3; i++) {
      const y = ROW_Y[i]!;
      emojiText(this, 90, y - 20, EMOJIS[i]!, 80).setDepth(6);
      addText(this, 160, y - 70, NAMES[i]!, 28, {
        color: '#ffffff',
        stroke: '#042f2e',
        strokeThickness: 5,
      })
        .setOrigin(0, 0.5)
        .setDepth(6);
      const price = addText(this, 160, y - 28, '', 36, {
        color: '#fde68a',
        stroke: '#042f2e',
        strokeThickness: 6,
      })
        .setOrigin(0, 0.5)
        .setDepth(6);
      const held = addText(this, 160, y + 10, '', 24, {
        color: '#a7f3d0',
        stroke: '#042f2e',
        strokeThickness: 4,
      })
        .setOrigin(0, 0.5)
        .setDepth(6);
      this.rows.push({ price, held });
      new Button(this, 415, y + 62, 'Comprar ½', () => this.trade(i, true), {
        width: 190,
        height: 70,
        fontSize: 28,
        color: 0x22c55e,
        shade: 0x15803d,
      }).setDepth(20);
      new Button(this, 600, y + 62, 'Vender', () => this.trade(i, false), {
        width: 160,
        height: 70,
        fontSize: 28,
        color: 0xef4444,
        shade: 0xb91c1c,
      }).setDepth(20);
    }
    this.news = addText(this, GAME_WIDTH / 2, 1040, 'Sem notícias…', 32, {
      color: '#ffffff',
      stroke: '#042f2e',
      strokeThickness: 7,
      wrapWidth: 640,
    }).setDepth(30);
    this.hintBox = hint(
      this,
      ['Leia a notícia: ela quase sempre acerta', 'Compre antes de subir, venda antes de cair'],
      1150,
      5500,
    );
  }

  private trade(i: number, buy: boolean): void {
    if (this.ended) return;
    this.hintBox?.dismiss();
    const { sfx } = getServices(this);
    const ok = buy ? this.sim.buy(i, 0.5) > 0 : this.sim.sell(i) > 0;
    sfx.play(ok ? (buy ? 'pop' : 'coin') : 'locked');
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.sim.step(Math.min(deltaMs, 50) / 1000);
    const s = this.sim;
    this.setScore(s.score);
    this.info.setText(`💵 ${Math.floor(s.cash)} · ⏱ ${Math.max(0, Math.ceil(DURATION - s.t))}s`);
    const g = this.g.clear();
    for (let i = 0; i < 3; i++) {
      const y = ROW_Y[i]!;
      g.fillStyle(0x000000, 0.28).fillRoundedRect(30, y - 100, 660, 220, 28);
      const hist = s.history[i]!.slice(-40);
      const lo = Math.min(...hist, 60);
      const hi = Math.max(...hist, 140);
      g.lineStyle(5, s.prices[i]! >= 100 ? 0x4ade80 : 0xf87171, 1).beginPath();
      hist.forEach((v, k) => {
        const x = 420 + (k / 39) * 240;
        const yy = y - 20 - ((v - lo) / (hi - lo)) * 70;
        if (k === 0) g.moveTo(x, yy);
        else g.lineTo(x, yy);
      });
      g.strokePath();
      const row = this.rows[i]!;
      row.price.setText(`$ ${s.prices[i]!.toFixed(1)}`);
      row.held.setText(`Você tem ${s.shares[i]!.toFixed(1)}`);
    }
    const n = s.news;
    if (n) {
      const word = n.dir === 1 ? 'vai SUBIR 📈' : 'vai CAIR 📉';
      this.news.setText(`📰 ${NAMES[n.stock]} ${word}\n(em ${Math.max(0, n.wait).toFixed(1)}s)`);
      this.news.setColor(n.dir === 1 ? '#86efac' : '#fca5a5');
      g.fillStyle(0xffffff, 0.8).fillRect(60, 1090, 600 * Math.max(0, n.wait / NEWS_DELAY), 8);
    } else {
      this.news.setText('Sem notícias…').setColor('#ffffff');
    }
    if (s.done) {
      const profit = s.score - START_CASH;
      this.finish(
        profit >= 0 ? 'Fechou no lucro!' : 'Fechou no prejuízo',
        [`Patrimônio: ${s.score}`, `Resultado: ${profit >= 0 ? '+' : ''}${profit}`],
        { score: s.score, details: { profit } },
        500,
      );
    }
  }
}
