import type Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { ambient, banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { BlackjackGame, handValue, type Card, type HandOutcome } from './core';

export class BlackjackScene extends MiniScene {
  private bj = new BlackjackGame();
  private g!: Phaser.GameObjects.Graphics;
  private cardTexts: Phaser.GameObjects.Text[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private dealerLabel!: Phaser.GameObjects.Text;
  private playerLabel!: Phaser.GameObjects.Text;
  private actionBox!: Phaser.GameObjects.Container;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Blackjack, 'blackjack', [0x052e16, 0x064e3b]);
  }

  create(): void {
    this.bj = new BlackjackGame();
    this.cardTexts = [];
    this.frame('500');
    ambient(this, 0x86efac, 18);

    this.statusText = addText(this, GAME_WIDTH / 2, 168, '', 28, {
      color: '#bbf7d0',
      stroke: '#052e16',
      strokeThickness: 6,
    }).setDepth(50);

    this.dealerLabel = addText(this, GAME_WIDTH / 2, 290, '', 30, {
      color: '#fde047',
      stroke: '#052e16',
      strokeThickness: 6,
    }).setDepth(50);

    this.playerLabel = addText(this, GAME_WIDTH / 2, 620, '', 30, {
      color: '#ffffff',
      stroke: '#052e16',
      strokeThickness: 6,
    }).setDepth(50);

    this.g = this.add.graphics().setDepth(5);
    this.actionBox = this.add.container(0, 0).setDepth(50);

    this.hintBox = hint(
      this,
      [
        'Chegue mais perto de 21 que a Banca sem estourar!',
        '10 mãos para multiplicar suas fichas!',
      ],
      995,
      4500,
    );

    this.renderState();
  }

  private placeBet(amount: number): void {
    if (this.ended) return;
    this.hintBox?.dismiss();
    const prevState = this.bj.state;
    if (!this.bj.deal(amount)) return;
    getServices(this).sfx.play('coin', 2);
    this.setScore(this.bj.chips);
    this.renderState();
    if (prevState !== 'playing' && this.bj.lastOutcome) {
      this.celebrateOutcome(this.bj.lastOutcome);
    }
  }

  private doHit(): void {
    if (this.ended || this.bj.state !== 'playing') return;
    getServices(this).sfx.play('pop');
    const out = this.bj.hit();
    this.setScore(this.bj.chips);
    this.renderState();
    if (out) this.celebrateOutcome(out);
  }

  private doStand(): void {
    if (this.ended || this.bj.state !== 'playing') return;
    getServices(this).sfx.play('click');
    const out = this.bj.stand();
    this.setScore(this.bj.chips);
    this.renderState();
    this.celebrateOutcome(out);
  }

  private doDouble(): void {
    if (this.ended || !this.bj.canDouble()) return;
    getServices(this).sfx.play('coin', 5);
    const out = this.bj.doubleDown();
    this.setScore(this.bj.chips);
    this.renderState();
    if (out) this.celebrateOutcome(out);
  }

  private celebrateOutcome(out: HandOutcome): void {
    const { sfx } = getServices(this);
    if (out === 'blackjack') {
      sfx.play('level');
      banner(this, 'BLACKJACK 21! 🔥', '#fde047');
      shockwave(this, GAME_WIDTH / 2, 740, 0xfbbf24, 180);
      burst(this, GAME_WIDTH / 2, 740, 0xfde047, 26, { speed: 360 });
    } else if (out === 'win') {
      sfx.play('win');
      banner(this, `VOCÊ VENCEU! +${this.bj.lastDelta}`, '#6ee7b7');
      burst(this, GAME_WIDTH / 2, 740, 0x34d399, 18, { speed: 280 });
    } else if (out === 'push') {
      sfx.play('tick');
      banner(this, 'EMPATE!', '#e2e8f0');
    } else {
      sfx.play('hit');
      flash(this, 0xf43f5e, 0.25, 200);
      banner(this, out === 'bust' ? 'ESTOUROU (>21)!' : 'BANCA VENCEU!', '#fda4af');
    }

    if (this.bj.state === 'finished') {
      this.time.delayedCall(1200, () => {
        if (this.ended) return;
        this.finish(
          this.bj.chips > 0 ? 'Fim das 10 mãos!' : 'Sem fichas!',
          [`Vitórias: ${this.bj.wins}`, `Blackjacks naturais: ${this.bj.blackjacks}`],
          {
            score: this.bj.chips,
            details: { wins: this.bj.wins, blackjacks: this.bj.blackjacks },
          },
        );
      });
    }
  }

  private renderState(): void {
    for (const t of this.cardTexts) t.destroy();
    this.cardTexts = [];
    this.actionBox.removeAll(true);

    const g = this.g.clear();
    // Casino Felt Table
    g.fillStyle(0x065f46, 0.92).fillRoundedRect(36, 240, GAME_WIDTH - 72, 690, 36);
    g.lineStyle(5, 0xfbbf24, 0.65).strokeRoundedRect(36, 240, GAME_WIDTH - 72, 690, 36);

    this.statusText.setText(
      `Mão ${Math.max(1, this.bj.handIndex)}/${this.bj.maxHands}   ·   🪙 Fichas: ${this.bj.chips}   ·   🏆 Vitórias: ${this.bj.wins}`,
    );

    if (this.bj.player.length > 0) {
      const hideHole = this.bj.state === 'playing';
      const dv = hideHole ? handValue([this.bj.dealer[0]!]) : handValue(this.bj.dealer);
      const pv = handValue(this.bj.player);

      this.dealerLabel.setText(`Banca: ${hideHole ? `${dv.total} + ?` : dv.total}`);
      this.playerLabel.setText(`Sua Mão: ${pv.total}   (Aposta: 🪙 ${this.bj.bet})`);

      this.drawHand(this.bj.dealer, 420, hideHole);
      this.drawHand(this.bj.player, 750, false);
    } else {
      this.dealerLabel.setText('Escolha sua aposta para começar');
      this.playerLabel.setText(`Saldo inicial: 🪙 ${this.bj.chips}`);
    }

    if (this.bj.state === 'betting' || this.bj.state === 'settled') {
      const bets: Array<{ label: string; val: number; x: number; y: number; col: number }> = [
        { label: '🪙 50', val: 50, x: 195, y: 1075, col: 0x10b981 },
        { label: '🪙 100', val: 100, x: 525, y: 1075, col: 0x0ea5e9 },
        { label: '🪙 250', val: 250, x: 195, y: 1185, col: 0x8b5cf6 },
        { label: '🔥 TUDO!', val: this.bj.chips, x: 525, y: 1185, col: 0xf59e0b },
      ];
      for (const b of bets) {
        const btn = new Button(this, b.x, b.y, b.label, () => this.placeBet(b.val), {
          width: 290,
          height: 86,
          fontSize: 30,
          color: b.col,
          shade: 0x0f172a,
        });
        this.actionBox.add(btn);
      }
    } else if (this.bj.state === 'playing') {
      const hitBtn = new Button(this, 195, 1085, '🃏 Pedir Carta', () => this.doHit(), {
        width: 290,
        height: 88,
        fontSize: 28,
        color: 0x10b981,
        shade: 0x047857,
      });
      const standBtn = new Button(this, 525, 1085, '✋ Parar', () => this.doStand(), {
        width: 290,
        height: 88,
        fontSize: 28,
        color: 0xf43f5e,
        shade: 0x9f1239,
      });
      this.actionBox.add([hitBtn, standBtn]);

      if (this.bj.canDouble()) {
        const dblBtn = new Button(
          this,
          GAME_WIDTH / 2,
          1190,
          '⚡ Dobrar Aposta (2×)',
          () => this.doDouble(),
          {
            width: 420,
            height: 84,
            fontSize: 28,
            color: 0xf59e0b,
            shade: 0xb45309,
          },
        );
        this.actionBox.add(dblBtn);
      }
    }
  }

  private drawHand(cards: readonly Card[], cy: number, hideSecond: boolean): void {
    const cw = 112;
    const ch = 156;
    const gap = 18;
    const totalW = cards.length * cw + (cards.length - 1) * gap;
    const startX = (GAME_WIDTH - totalW) / 2;

    cards.forEach((c, idx) => {
      const x = startX + idx * (cw + gap);
      const y = cy - ch / 2;
      const hidden = hideSecond && idx === 1;

      if (hidden) {
        this.g.fillStyle(0x1e3a8a).fillRoundedRect(x, y, cw, ch, 16);
        this.g.lineStyle(4, 0x93c5fd).strokeRoundedRect(x, y, cw, ch, 16);
        const t = addText(this, x + cw / 2, cy, '🂠', 64, { color: '#ffffff' }).setDepth(15);
        this.cardTexts.push(t);
      } else {
        this.g.fillStyle(0x000000, 0.3).fillRoundedRect(x + 4, y + 6, cw, ch, 16);
        this.g.fillStyle(0xffffff).fillRoundedRect(x, y, cw, ch, 16);
        this.g.lineStyle(3, 0xcbd5e1).strokeRoundedRect(x, y, cw, ch, 16);
        const red = c.suit === '♥' || c.suit === '♦';
        const col = red ? '#e11d48' : '#0f172a';
        const topLbl = addText(this, x + 14, y + 12, c.rank, 28, { color: col })
          .setOrigin(0, 0)
          .setDepth(15);
        const suitLbl = addText(this, x + cw / 2, cy + 10, c.suit, 54, { color: col }).setDepth(15);
        this.cardTexts.push(topLbl, suitLbl);
      }
    });
  }
}
