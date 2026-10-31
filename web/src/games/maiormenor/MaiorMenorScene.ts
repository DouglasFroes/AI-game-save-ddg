import type Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { ambient, banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { heartsLabel, MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { formatNumber } from '@/platform/ranking';
import { getServices } from '@/services';
import { cardLabel, HiLoGame, isRed, LIVES, type Card, type Guess } from './core';

const CX = GAME_WIDTH / 2;
const CARD_Y = 560;
const CARD_W = 300;
const CARD_H = 420;

/** "Maior ou Menor": guess the next card, grow the pot, and bank it before your luck runs out. */
export class MaiorMenorScene extends MiniScene {
  private hilo = new HiLoGame();
  private card!: Phaser.GameObjects.Container;
  private potText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private hiBtn!: Button;
  private loBtn!: Button;
  private hiInfo!: Phaser.GameObjects.Text;
  private loInfo!: Phaser.GameObjects.Text;
  private busy = false;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.MaiorMenor, 'maiormenor', [0x3b0764, 0x0b1430]);
  }

  create(): void {
    this.hilo = new HiLoGame();
    this.busy = false;
    this.frame('0');
    ambient(this, 0xe9d5ff, 18);
    this.statusText = addText(this, CX, 170, '', 28, {
      color: '#e9d5ff',
      stroke: '#3b0764',
      strokeThickness: 6,
    }).setDepth(50);
    this.livesText = addText(this, CX, 214, '', 30).setDepth(50);
    this.card = this.makeCard(this.hilo.current).setPosition(CX, CARD_Y);
    this.potText = addText(this, CX, 830, '', 44, {
      color: '#fde047',
      stroke: '#3b0764',
      strokeThickness: 8,
    }).setDepth(50);

    this.hiBtn = new Button(this, 190, 960, '▲ Maior', () => this.play('higher'), {
      width: 300,
      height: 110,
      fontSize: 40,
      color: 0x16a34a,
      shade: 0x14532d,
    });
    this.loBtn = new Button(this, 530, 960, '▼ Menor', () => this.play('lower'), {
      width: 300,
      height: 110,
      fontSize: 40,
      color: 0xdc2626,
      shade: 0x7f1d1d,
    });
    this.hiInfo = addText(this, 190, 1040, '', 24, { color: '#bbf7d0' }).setDepth(50);
    this.loInfo = addText(this, 530, 1040, '', 24, { color: '#fecaca' }).setDepth(50);
    new Button(this, CX, 1150, '💰 Guardar o pote', () => this.bank(), {
      width: 460,
      height: 96,
      fontSize: 34,
      color: 0xca8a04,
      shade: 0x713f12,
    });
    this.hintBox = hint(
      this,
      ['A próxima carta é maior ou menor?', 'Guarde o pote antes de errar!'],
      300,
      4500,
    );
    this.refresh();
  }

  private makeCard(c: Card): Phaser.GameObjects.Container {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35).fillRoundedRect(
      -CARD_W / 2 + 8,
      -CARD_H / 2 + 12,
      CARD_W,
      CARD_H,
      26,
    );
    g.fillStyle(0xffffff, 1).fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 26);
    g.lineStyle(4, 0xd4d4d8, 1).strokeRoundedRect(
      -CARD_W / 2 + 10,
      -CARD_H / 2 + 10,
      CARD_W - 20,
      CARD_H - 20,
      20,
    );
    const color = isRed(c) ? '#dc2626' : '#111827';
    const corner = cardLabel(c);
    return this.add
      .container(0, 0, [
        g,
        addText(this, -CARD_W / 2 + 50, -CARD_H / 2 + 44, corner, 38, { color }),
        addText(this, CARD_W / 2 - 50, CARD_H / 2 - 44, corner, 38, { color }).setAngle(180),
        addText(this, 0, 0, c.suit, 170, { color }),
      ])
      .setDepth(20);
  }

  private refresh(): void {
    const gm = this.hilo;
    this.setScore(gm.score);
    this.statusText.setText(
      `🔥 Sequência ${gm.streak} · Melhor ${gm.bestStreak} · Cartas no baralho ${gm.deck.length}`,
    );
    this.livesText.setText(heartsLabel(gm.lives, LIVES));
    this.potText.setText(gm.pot ? `Pote: ${formatNumber(gm.pot)}` : 'Pote vazio');
    const hi = gm.odds('higher');
    const lo = gm.odds('lower');
    this.hiInfo.setText(`${Math.round(hi * 100)}% · +${gm.gainFor('higher')}`);
    this.loInfo.setText(`${Math.round(lo * 100)}% · +${gm.gainFor('lower')}`);
    this.hiBtn.setAlpha(hi > 0 ? 1 : 0.4);
    this.loBtn.setAlpha(lo > 0 ? 1 : 0.4);
  }

  private play(g: Guess): void {
    if (this.ended || this.busy) return;
    if (this.hilo.odds(g) <= 0) return;
    this.hintBox?.dismiss();
    this.busy = true;
    const { sfx } = getServices(this);
    const res = this.hilo.guess(g);
    const next = this.makeCard(res.card)
      .setPosition(GAME_WIDTH + CARD_W, CARD_Y)
      .setAngle(20);
    sfx.play('draw');
    this.tweens.add({
      targets: this.card,
      x: -CARD_W,
      angle: -20,
      duration: 260,
      ease: 'Cubic.easeIn',
      onComplete: (_t, targets: Phaser.GameObjects.Container[]) => targets[0]?.destroy(),
    });
    this.tweens.add({
      targets: next,
      x: CX,
      angle: 0,
      duration: 320,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.busy = false;
        if (res.kind === 'win') {
          sfx.play('coin', Math.min(8, this.hilo.streak));
          burst(this, CX, CARD_Y, 0x86efac, 14, { speed: 260 });
          this.pop(CX, CARD_Y - 260, `+${res.gain}`, '#86efac', 48);
          if (this.hilo.streak % 5 === 0) banner(this, `${this.hilo.streak} SEGUIDAS!`, '#fde047');
        } else if (res.kind === 'tie') {
          sfx.play('tick');
          this.pop(CX, CARD_Y - 260, 'Empate — de graça!', '#e9d5ff', 40);
        } else {
          sfx.play('hit');
          sfx.vibrate([60, 30, 60]);
          flash(this, 0xef4444, 0.3, 260);
          this.cameras.main.shake(200, 0.01);
          if (res.lost)
            this.pop(CX, CARD_Y - 260, `Perdeu ${formatNumber(res.lost)}!`, '#fca5a5', 44);
          if (res.livesLeft <= 0) this.end();
        }
        this.refresh();
      },
    });
    this.card = next;
  }

  private bank(): void {
    if (this.ended || this.busy || this.hilo.pot <= 0) return;
    const { sfx } = getServices(this);
    const total = this.hilo.bank();
    sfx.play('win');
    sfx.vibrate([30, 30, 60]);
    banner(this, `+${formatNumber(total)} GUARDADO!`, '#fde047');
    shockwave(this, CX, 830, 0xfde047, 200);
    this.refresh();
  }

  private end(): void {
    const gm = this.hilo;
    this.finish(
      'Acabou a sorte!',
      [`Maior sequência: ${gm.bestStreak} · Potes guardados: ${gm.banks}`],
      { score: gm.score, details: { streak: gm.bestStreak, banks: gm.banks } },
      900,
    );
  }
}
