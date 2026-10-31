import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { BET, HAND_LABEL, HANDS, PAYOUT, PokerSession, RANK_LABEL, type HandName } from './core';

const CARD_W = 124;
const CARD_H = 180;
const CARDS_Y = 690;
const cardX = (i: number) => GAME_WIDTH / 2 + (i - 2) * (CARD_W + 10);
const TABLE: HandName[] = [
  'royal',
  'straightFlush',
  'four',
  'fullHouse',
  'flush',
  'straight',
  'three',
  'twoPair',
  'jacks',
];

/** "Pôquer": hold the best cards, draw once, and grow your chips over 25 hands. */
export class PoquerScene extends MiniScene {
  private session = new PokerSession();
  private g!: Phaser.GameObjects.Graphics;
  private cardTexts: Phaser.GameObjects.Text[] = [];
  private holdTexts: Phaser.GameObjects.Text[] = [];
  private tableTexts: Phaser.GameObjects.Text[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private button!: Button;
  private lastHand: HandName | null = null;
  private busy = false;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Poquer, 'poquer', [0x14532d, 0x052e16]);
  }

  create(): void {
    this.session = new PokerSession();
    this.lastHand = null;
    this.busy = false;
    this.frame(String(this.session.chips));
    this.g = this.add.graphics().setDepth(4);
    this.statusText = addText(this, GAME_WIDTH / 2, 168, '', 28, {
      color: '#dcfce7',
      stroke: '#052e16',
      strokeThickness: 6,
    }).setDepth(50);
    this.tableTexts = TABLE.map((h, i) =>
      addText(
        this,
        GAME_WIDTH / 2,
        230 + i * 34,
        `${HAND_LABEL[h]} ........ ${PAYOUT[h] * BET}`,
        24,
        { color: '#fef9c3' },
      ).setDepth(6),
    );
    this.cardTexts = [0, 1, 2, 3, 4].map((i) =>
      addText(this, cardX(i), CARDS_Y, '', 46, { color: '#111827' }).setDepth(6),
    );
    this.holdTexts = [0, 1, 2, 3, 4].map((i) =>
      addText(this, cardX(i), CARDS_Y + CARD_H / 2 + 30, '', 26, {
        color: '#fde047',
        stroke: '#052e16',
        strokeThickness: 5,
      }).setDepth(6),
    );
    this.button = new Button(this, GAME_WIDTH / 2, 1060, 'Distribuir', () => this.action(), {
      width: 400,
      height: 104,
      fontSize: 40,
      color: 0xca8a04,
      shade: 0x713f12,
    });
    this.hintBox = hint(
      this,
      ['Toque nas cartas para segurar', 'e troque as outras uma vez'],
      1180,
      5000,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.ended || Math.abs(p.y - CARDS_Y) > CARD_H / 2) return;
      for (let i = 0; i < 5; i++)
        if (Math.abs(p.x - cardX(i)) <= CARD_W / 2) {
          this.session.toggle(i);
          getServices(this).sfx.play('click');
        }
    });
    this.refresh();
  }

  private action(): void {
    if (this.ended || this.busy) return;
    this.hintBox?.dismiss();
    const s = this.session;
    const { sfx } = getServices(this);
    if (s.phase === 'hold') {
      const { name, win } = s.draw();
      this.lastHand = name;
      if (win > 0) {
        sfx.play(PAYOUT[name] >= 9 ? 'win' : 'coin');
        banner(this, `${HAND_LABEL[name]}! +${win}`, PAYOUT[name] >= 9 ? '#fde047' : '#86efac');
        burst(this, GAME_WIDTH / 2, CARDS_Y, 0xfde047, 10 + PAYOUT[name] * 2, { speed: 340 });
        if (PAYOUT[name] >= 25) shockwave(this, GAME_WIDTH / 2, CARDS_Y, 0xfde047, 320);
      } else sfx.play('hit');
      if (s.over) {
        this.busy = true;
        this.time.delayedCall(1200, () =>
          this.finish(
            s.chips >= 100 ? 'Lucro na mesa!' : 'Fim da sessão!',
            [`Fichas: ${s.chips} · Melhor mão: ${HAND_LABEL[s.best]}`],
            { score: s.chips, details: { hands: s.handNo, best: PAYOUT[s.best] } },
            300,
          ),
        );
      }
    } else if (s.deal()) {
      this.lastHand = null;
      sfx.play('draw');
    }
    this.refresh();
  }

  private refresh(): void {
    const s = this.session;
    this.setScore(s.chips);
    this.statusText.setText(`Mão ${s.handNo}/${HANDS} · Aposta ${BET} fichas`);
    this.button.label.setText(s.phase === 'hold' ? 'Trocar' : 'Distribuir');
    this.tableTexts.forEach((t, i) =>
      t.setColor(TABLE[i] === this.lastHand ? '#4ade80' : '#fef9c3'),
    );
  }

  override update(): void {
    const g = this.g.clear();
    const s = this.session;
    g.fillStyle(0x052e16, 0.8).fillRoundedRect(80, 208, 560, 320, 20);
    for (let i = 0; i < 5; i++) {
      const c = s.hand[i];
      const x = cardX(i) - CARD_W / 2;
      const y = CARDS_Y - CARD_H / 2 - (s.held[i] && s.phase === 'hold' ? 16 : 0);
      g.fillStyle(0x000000, 0.35).fillRoundedRect(x + 5, y + 8, CARD_W, CARD_H, 14);
      if (!c) {
        g.fillStyle(0x7f1d1d, 1).fillRoundedRect(x, y, CARD_W, CARD_H, 14);
        g.lineStyle(4, 0xfef3c7, 0.6).strokeRoundedRect(
          x + 10,
          y + 10,
          CARD_W - 20,
          CARD_H - 20,
          10,
        );
        this.cardTexts[i]!.setText('');
      } else {
        g.fillStyle(0xffffff, 1).fillRoundedRect(x, y, CARD_W, CARD_H, 14);
        const red = c.suit === '♥' || c.suit === '♦';
        this.cardTexts[i]!.setText(`${RANK_LABEL(c.rank)}\n${c.suit}`)
          .setColor(red ? '#dc2626' : '#111827')
          .setY(y + CARD_H / 2);
      }
      if (s.held[i]) g.lineStyle(5, 0xfde047, 1).strokeRoundedRect(x, y, CARD_W, CARD_H, 14);
      this.holdTexts[i]!.setText(s.held[i] ? 'SEGURA' : '');
    }
  }
}
