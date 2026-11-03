import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { hint } from '@/platform/ui/juice';
import { PuzzleScene } from '@/platform/ui/puzzleGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { coinsFor, validWeighing, weigh, weighsFor } from './core';

const Y0 = 300;

/** "Moeda Falsa": one coin is heavier. Weigh groups on the scale, with a limited number of weighings. */
export class MoedaScene extends PuzzleScene {
  private n = 3;
  private odd = 0;
  private side: number[] = []; // 0 off, 1 left pan, 2 right pan
  private used = 0;
  private max = 1;
  private guessing = false;
  private cols = 5;
  private cell = 100;
  private x0 = 0;
  private g!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private log!: Phaser.GameObjects.Text;
  private mode!: Button;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Moeda, 'moeda', [0xa16207, 0x2a1a05]);
  }

  create(): void {
    this.g = this.add.graphics().setDepth(3);
    this.log = addText(this, GAME_WIDTH / 2, 930, '', 28, {
      color: '#fde68a',
      stroke: '#2a1a05',
      strokeThickness: 6,
      wrapWidth: 660,
    }).setDepth(30);
    this.begin('#fef08a', '#2a1a05');
    new Button(this, 190, 1090, 'Pesar', () => this.doWeigh(), {
      width: 300,
      height: 100,
      fontSize: 38,
      color: 0x2563eb,
      shade: 0x1d4ed8,
    }).setDepth(20);
    this.mode = new Button(this, 530, 1090, 'Dar palpite', () => this.toggleGuess(), {
      width: 300,
      height: 100,
      fontSize: 32,
      color: 0xdc2626,
      shade: 0x991b1b,
    }).setDepth(20);
    this.hintBox = hint(
      this,
      ['Toque nas moedas: esquerda, direita ou fora', 'Uma é mais pesada. Poucas pesagens!'],
      660,
      6000,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.tap(p));
  }

  protected startLevel(): void {
    this.n = coinsFor(this.level);
    this.odd = Math.floor(Math.random() * this.n);
    this.side = Array.from({ length: this.n }, () => 0);
    this.used = 0;
    this.max = weighsFor(this.n);
    this.guessing = false;
    this.cols = this.n <= 5 ? this.n : this.n <= 12 ? 6 : 7;
    this.cell = Math.floor(660 / Math.max(this.cols, 1) / 1.0);
    this.cell = Math.min(100, this.cell);
    this.x0 = (720 - this.cols * this.cell) / 2;
    for (const l of this.labels) l.destroy();
    this.labels = this.side.map((_, i) =>
      addText(this, this.pos(i).x, this.pos(i).y, String(i + 1), 30, {
        color: '#2a1a05',
        stroke: '#fef3c7',
        strokeThickness: 4,
      }).setDepth(9),
    );
    this.log.setText(`Pesagens: ${this.used}/${this.max}`);
    this.mode?.label.setText('Dar palpite');
  }

  private pos(i: number): { x: number; y: number } {
    return {
      x: this.x0 + (i % this.cols) * this.cell + this.cell / 2,
      y: Y0 + Math.floor(i / this.cols) * (this.cell + 10) + this.cell / 2,
    };
  }

  private toggleGuess(): void {
    if (this.locked || this.ended) return;
    this.guessing = !this.guessing;
    this.mode.label.setText(this.guessing ? 'Voltar às pesagens' : 'Dar palpite');
    this.log.setText(
      this.guessing ? 'Toque na moeda pesada!' : `Pesagens: ${this.used}/${this.max}`,
    );
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.locked || this.ended) return;
    let hit = -1;
    this.side.forEach((_, i) => {
      const c = this.pos(i);
      if (Math.hypot(p.x - c.x, p.y - c.y) < this.cell * 0.45) hit = i;
    });
    if (hit < 0) return;
    this.hintBox?.dismiss();
    const { sfx } = getServices(this);
    if (!this.guessing) {
      this.side[hit] = (this.side[hit]! + 1) % 3;
      sfx.play('tick');
      return;
    }
    if (hit === this.odd) {
      this.solved('ACHOU A FALSA!', Math.max(0, this.max - this.used) * 40);
      return;
    }
    if (this.mistake('Essa não era!')) return;
    this.log.setText('Essa não era! (-1 vida) Novas moedas.');
    const msg = this.log.text;
    this.startLevel();
    this.log.setText(msg);
  }

  private doWeigh(): void {
    if (this.locked || this.ended) return;
    const { sfx } = getServices(this);
    const left = this.side.flatMap((s, i) => (s === 1 ? [i] : []));
    const right = this.side.flatMap((s, i) => (s === 2 ? [i] : []));
    if (this.used >= this.max) {
      sfx.play('locked');
      this.log.setText('Acabaram as pesagens: dê seu palpite!');
      return;
    }
    if (!validWeighing(left, right)) {
      sfx.play('locked');
      this.log.setText('Ponha o mesmo número de moedas em cada prato.');
      return;
    }
    this.used++;
    const r = weigh(this.odd, left, right);
    sfx.play('bounce');
    this.log.setText(
      `Pesagem ${this.used}/${this.max}: ` +
        (r === 'equal'
          ? 'iguais!'
          : r === 'left'
            ? 'o lado ESQUERDO pesa mais'
            : 'o lado DIREITO pesa mais'),
    );
    this.side = this.side.map(() => 0);
  }

  override update(t: number, dt: number): void {
    super.update(t, dt);
    const g = this.g.clear();
    this.side.forEach((s, i) => {
      const c = this.pos(i);
      g.fillStyle(
        s === 1 ? 0x3b82f6 : s === 2 ? 0xef4444 : 0x000000,
        s === 0 ? 0.3 : 0.9,
      ).fillCircle(c.x, c.y, this.cell * 0.46);
      g.fillStyle(0xfacc15, 1).fillCircle(c.x, c.y, this.cell * 0.38);
      g.lineStyle(4, 0xca8a04, 1).strokeCircle(c.x, c.y, this.cell * 0.38);
    });
    const rows = Math.ceil(this.n / this.cols);
    const by = Y0 + rows * (this.cell + 10) + 20;
    g.fillStyle(0x3b82f6, 0.3).fillRoundedRect(40, by, 300, 40, 12);
    g.fillStyle(0xef4444, 0.3).fillRoundedRect(380, by, 300, 40, 12);
    this.drawPanLabels(by);
  }

  private panTexts: Phaser.GameObjects.Text[] = [];
  private drawPanLabels(y: number): void {
    if (this.panTexts.length === 0) {
      this.panTexts = [
        addText(this, 190, y + 20, 'Prato esquerdo (azul)', 24, {
          color: '#bfdbfe',
          stroke: '#2a1a05',
          strokeThickness: 4,
        }).setDepth(9),
        addText(this, 530, y + 20, 'Prato direito (vermelho)', 24, {
          color: '#fecaca',
          stroke: '#2a1a05',
          strokeThickness: 4,
        }).setDepth(9),
      ];
    }
    this.panTexts[0]!.setY(y + 20);
    this.panTexts[1]!.setY(y + 20);
  }
}
