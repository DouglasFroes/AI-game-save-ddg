import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import { ambient, banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { DadosSim, DICE, JOKERS, MAX_JOKERS, type DadosEvent, type Joker } from './core';

const DIE = 112;
const DIE_Y = 700;
const PIPS: Record<number, Array<[number, number]>> = {
  1: [[0, 0]],
  2: [
    [-1, -1],
    [1, 1],
  ],
  3: [
    [-1, -1],
    [0, 0],
    [1, 1],
  ],
  4: [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ],
  5: [
    [-1, -1],
    [1, -1],
    [0, 0],
    [-1, 1],
    [1, 1],
  ],
  6: [
    [-1, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
  ],
};

/** "Dados Loucos": roll, hold what you like, score chips × mult, and collect jokers between rounds. */
export class DadosScene extends MiniScene {
  private sim = new DadosSim();
  private dice: Phaser.GameObjects.Container[] = [];
  private faces: Phaser.GameObjects.Graphics[] = [];
  private info!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private bar!: Phaser.GameObjects.Graphics;
  private jokerRow!: Phaser.GameObjects.Text;
  private rollBtn!: Button;
  private playBtn!: Button;
  private shop: Phaser.GameObjects.Container | null = null;
  private busy = false;
  private progress!: Phaser.GameObjects.Text;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Dados, 'dados', [0x022c22, 0x064e3b]);
  }

  create(): void {
    this.sim = new DadosSim();
    this.dice = [];
    this.faces = [];
    this.shop = null;
    this.busy = false;
    this.frame();
    ambient(this, 0xfde68a, 14);
    this.bar = this.add.graphics().setDepth(10);
    this.info = addText(this, GAME_WIDTH / 2, 168, '', 30, {
      color: '#d1fae5',
      stroke: '#022c22',
      strokeThickness: 6,
    }).setDepth(50);
    this.comboText = addText(this, GAME_WIDTH / 2, 505, '', 38, {
      color: '#fde68a',
      stroke: '#022c22',
      strokeThickness: 8,
    }).setDepth(50);
    this.progress = addText(this, GAME_WIDTH / 2, 240, '', 24, {
      color: '#ffffff',
      stroke: '#022c22',
      strokeThickness: 5,
    }).setDepth(51);
    this.jokerRow = addText(this, GAME_WIDTH / 2, 1010, '', 44, { color: '#ffffff' }).setDepth(30);

    // Felt table.
    const felt = this.add.graphics().setDepth(1);
    felt.fillStyle(0x000000, 0.28).fillRoundedRect(40, 560, 640, 360, 40);
    felt.lineStyle(4, 0xfde68a, 0.35).strokeRoundedRect(40, 560, 640, 360, 40);

    const gap = 8;
    const total = DICE * DIE + (DICE - 1) * gap;
    for (let i = 0; i < DICE; i++) {
      const x = (GAME_WIDTH - total) / 2 + DIE / 2 + i * (DIE + gap);
      const c = this.add.container(x, DIE_Y).setDepth(20);
      const g = this.add.graphics();
      c.add(g);
      c.setSize(DIE, DIE).setInteractive({ useHandCursor: true });
      c.on('pointerdown', () => this.hold(i));
      this.dice.push(c);
      this.faces.push(g);
      this.drawDie(i);
    }

    this.rollBtn = new Button(this, 195, 1150, '🎲 ROLAR', () => this.doRoll(), {
      width: 300,
      height: 100,
      fontSize: 38,
      color: 0xf59e0b,
      shade: 0xb45309,
    }).setDepth(50);
    this.playBtn = new Button(this, 525, 1150, 'JOGAR ✓', () => this.doPlay(), {
      width: 300,
      height: 100,
      fontSize: 38,
      color: 0x22c55e,
      shade: 0x15803d,
    }).setDepth(50);
    this.hintBox = hint(
      this,
      ['Role os dados e toque nos que quer guardar', 'Fichas × multiplicador = pontos da mão'],
      440,
      9000,
    );
  }

  override update(): void {
    if (this.ended) return;
    const { sim } = this;
    this.setScore(sim.score);
    this.info.setText(`Rodada ${sim.round} · Mãos ${sim.handsLeft} · Rolagens ${sim.rollsLeft}`);
    const pv = sim.preview;
    this.comboText.setText(pv ? `${pv.label}  ${pv.chips} × ${pv.mult} = ${pv.total}` : '');
    this.jokerRow.setText(sim.jokers.map((j) => JOKERS.find((x) => x.id === j)!.emoji).join(' '));
    const canAct = !this.busy && !this.shop && sim.state === 'hand';
    this.rollBtn.setAlpha(canAct && sim.rollsLeft > 0 ? 1 : 0.4);
    this.playBtn.setAlpha(canAct && sim.rolled ? 1 : 0.4);
    const k = Phaser.Math.Clamp(sim.roundScore / sim.target, 0, 1);
    const g = this.bar.clear();
    g.fillStyle(0x000000, 0.4).fillRoundedRect(60, 220, 600, 40, 20);
    g.fillStyle(k >= 1 ? 0x86efac : 0xfbbf24).fillRoundedRect(
      64,
      224,
      Math.max(18, 592 * k),
      32,
      16,
    );
    g.lineStyle(2, 0xffffff, 0.2).strokeRoundedRect(60, 220, 600, 40, 20);
    this.progress.setText(`${sim.roundScore} / ${sim.target}`);
    for (let i = 0; i < DICE; i++) this.drawDie(i);
  }

  private drawDie(i: number): void {
    const g = this.faces[i]!;
    const held = this.sim.held[i]!;
    const v = this.sim.dice[i]!;
    g.clear();
    g.fillStyle(0x000000, 0.35).fillRoundedRect(-DIE / 2 + 3, -DIE / 2 + 8, DIE, DIE, 22);
    g.fillStyle(held ? 0xfef3c7 : 0xffffff).fillRoundedRect(-DIE / 2, -DIE / 2, DIE, DIE, 22);
    g.lineStyle(held ? 7 : 3, held ? 0xf59e0b : 0xcbd5e1).strokeRoundedRect(
      -DIE / 2,
      -DIE / 2,
      DIE,
      DIE,
      22,
    );
    if (v === 0) {
      g.fillStyle(0x94a3b8, 0.6).fillCircle(0, 0, 10);
      return;
    }
    for (const [px, py] of PIPS[v]!)
      g.fillStyle(v === 1 ? 0xdc2626 : 0x0f172a).fillCircle(px * 28, py * 28, v === 1 ? 17 : 11);
    if (held) g.fillStyle(0xf59e0b).fillRoundedRect(-24, DIE / 2 - 12, 48, 14, 7);
  }

  private hold(i: number): void {
    if (this.busy || this.shop || this.ended) return;
    this.hintBox?.dismiss();
    if (!this.sim.toggle(i)) return;
    getServices(this).sfx.play('click');
    this.tweens.add({
      targets: this.dice[i],
      y: DIE_Y + (this.sim.held[i] ? -26 : 0),
      duration: 120,
      ease: 'Back.easeOut',
    });
  }

  private doRoll(): void {
    if (this.busy || this.shop || this.ended) return;
    this.hintBox?.dismiss();
    this.handle(this.sim.roll());
  }

  private doPlay(): void {
    if (this.busy || this.shop || this.ended) return;
    this.handle(this.sim.play());
  }

  private handle(events: DadosEvent[]): void {
    const { sfx } = getServices(this);
    for (const ev of events) {
      switch (ev.type) {
        case 'roll':
          this.busy = true;
          sfx.play('tick');
          for (const i of ev.rolled) {
            const d = this.dice[i]!;
            this.tweens.add({
              targets: d,
              angle: 360 * (Math.random() < 0.5 ? 1 : -1),
              y: DIE_Y - 90,
              duration: 220,
              yoyo: true,
              ease: 'Quad.easeOut',
              onComplete: () => (d.angle = 0),
            });
          }
          this.time.delayedCall(440, () => {
            this.busy = false;
            sfx.play('pop');
            const pv = this.sim.preview;
            if (pv && pv.mult >= 4) {
              sfx.play('coin', pv.mult);
              burst(this, GAME_WIDTH / 2, DIE_Y, 0xfde68a, 14, { speed: 260 });
            }
          });
          break;
        case 'played': {
          const b = ev.breakdown;
          this.busy = true;
          sfx.play(b.mult >= 7 ? 'level' : 'coin', b.mult);
          sfx.vibrate(b.mult >= 7 ? [30, 30, 30] : 15);
          shockwave(this, GAME_WIDTH / 2, DIE_Y, 0xfde68a, 220);
          burst(this, GAME_WIDTH / 2, DIE_Y, 0xfde68a, 10 + b.mult * 2, { speed: 340 });
          this.pop(GAME_WIDTH / 2, DIE_Y - 100, `+${b.total}`, '#fde68a', b.mult >= 7 ? 84 : 64);
          if (b.mult >= 7) {
            flash(this, 0xfde68a, 0.3);
            banner(this, b.label.toUpperCase(), '#fde68a');
          }
          this.time.delayedCall(900, () => {
            this.resetDice();
            if (this.sim.state === 'hand') this.busy = false;
          });
          break;
        }
        case 'roundWon':
          this.time.delayedCall(1100, () => {
            sfx.play('win');
            banner(this, `RODADA ${ev.round} VENCIDA!  +${ev.bonus}`, '#86efac');
            this.time.delayedCall(900, () => this.openShop());
          });
          break;
        case 'gameOver':
          this.time.delayedCall(900, () => {
            sfx.play('hit');
            this.finish(
              'Sem mãos!',
              [`Rodada: ${this.sim.round}`, `Melhor mão: ${this.sim.bestHand}`],
              { score: this.sim.score, details: { rounds: this.sim.round - 1 } },
              100,
            );
          });
          break;
        case 'newHand':
          break;
      }
    }
  }

  private resetDice(): void {
    this.dice.forEach((d) => this.tweens.add({ targets: d, y: DIE_Y, duration: 150 }));
  }

  private openShop(): void {
    if (this.ended) return;
    const root = this.add.container(0, 0).setDepth(100);
    this.shop = root;
    root.add(
      this.add
        .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x01140f, 0.9)
        .setOrigin(0)
        .setInteractive(),
    );
    root.add(
      addText(this, GAME_WIDTH / 2, 250, 'Escolha um coringa', 52, {
        color: '#ffffff',
        stroke: '#022c22',
        strokeThickness: 10,
      }),
    );
    root.add(
      addText(
        this,
        GAME_WIDTH / 2,
        315,
        `Próxima meta: ${this.nextTarget()}  ·  Coringas ${this.sim.jokers.length}/${MAX_JOKERS}`,
        26,
        {
          color: '#a7f3d0',
          stroke: '#022c22',
          strokeThickness: 6,
        },
      ),
    );
    this.sim.offer.forEach((j, i) => {
      const card = this.jokerCard(j, GAME_WIDTH / 2, 480 + i * 210);
      card.setScale(0.6).setAlpha(0);
      this.tweens.add({
        targets: card,
        scale: 1,
        alpha: 1,
        delay: 100 + i * 110,
        duration: 300,
        ease: 'Back.easeOut',
      });
      root.add(card);
    });
  }

  private nextTarget(): number {
    return Math.round((140 * 1.6 ** this.sim.round) / 5) * 5;
  }

  private jokerCard(j: Joker, x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(-310, -78, 620, 178, 30);
    g.fillStyle(0x064e3b).fillRoundedRect(-310, -88, 620, 178, 30);
    g.lineStyle(4, 0xfde68a, 0.9).strokeRoundedRect(-310, -88, 620, 178, 30);
    g.fillStyle(0xffffff, 0.08).fillRoundedRect(-300, -80, 600, 56, 24);
    c.add([
      g,
      emojiText(this, -235, 0, j.emoji, 78),
      addText(this, -170, -26, j.name, 38, { color: '#ffffff' }).setOrigin(0, 0.5),
      addText(this, -170, 28, j.desc, 24, {
        color: '#d1fae5',
        weight: 'normal',
        wrapWidth: 450,
        align: 'left',
      }).setOrigin(0, 0.5),
    ]);
    c.setSize(620, 178).setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => c.setScale(0.97));
    c.on('pointerout', () => c.setScale(1));
    c.on('pointerup', () => {
      if (!this.sim.pick(j.id)) return;
      getServices(this).sfx.play('win');
      this.shop?.destroy();
      this.shop = null;
      this.busy = false;
      this.resetDice();
      banner(this, `Rodada ${this.sim.round}`, '#a7f3d0');
    });
    return c;
  }
}
