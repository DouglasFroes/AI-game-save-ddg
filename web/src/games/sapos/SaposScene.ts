import Phaser from 'phaser';
import { SceneKeys } from '@/config';
import { hint } from '@/platform/ui/juice';
import { PuzzleScene, type RuleCard } from '@/platform/ui/puzzleGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { frogsFor, GREEN, isSolved, isStuck, move, newGame, par, type Pad } from './core';

const ROW_Y = 620;

/** "Sapos": swap the green and red frogs. They only hop forward, over at most one frog. */
export class SaposScene extends PuzzleScene {
  private pads: Pad[] = [];
  private n = 2;
  private moves = 0;
  private cell = 90;
  private x0 = 0;
  private g!: Phaser.GameObjects.Graphics;
  private stuck!: Phaser.GameObjects.Text;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Sapos, 'sapos', [0x15803d, 0x052e16]);
  }

  protected override rules(): RuleCard {
    return {
      goal: 'Trocar de lugar os sapos verdes e os vermelhos.',
      steps: [
        'Os verdes começam à esquerda e os vermelhos à direita; no meio há uma vitória-régia vazia.',
        'Toque num sapo para ele andar: ele pula para a vitória-régia vazia ao lado ou por cima de 1 sapo.',
        'Sapos só andam para a frente: verdes para a direita, vermelhos para a esquerda.',
        'No fim, os verdes ficam à direita e os vermelhos à esquerda.',
      ],
    };
  }

  create(): void {
    this.g = this.add.graphics().setDepth(3);
    this.stuck = addText(this, 360, 820, '', 40, {
      color: '#fde047',
      stroke: '#052e16',
      strokeThickness: 8,
    }).setDepth(30);
    this.begin('#bbf7d0', '#052e16');
    new Button(this, 360, 1130, 'Reiniciar', () => this.restart(), {
      width: 320,
      height: 90,
      fontSize: 32,
      color: 0x6b7280,
      shade: 0x374151,
    }).setDepth(20);
    this.hintBox = hint(
      this,
      ['Troque de lado: verdes vão para a direita', 'Cada sapo só avança, pulando no máximo 1'],
      940,
      5500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.tap(p));
  }

  protected startLevel(): void {
    this.n = frogsFor(this.level);
    this.pads = newGame(this.n);
    this.moves = 0;
    this.cell = Math.min(100, Math.floor(680 / (2 * this.n + 1)));
    this.x0 = (720 - this.cell * (2 * this.n + 1)) / 2;
  }

  protected override hud(): string {
    return `${this.moves}/${par(this.n)}`;
  }

  private restart(): void {
    if (this.locked || this.ended) return;
    this.startLevel();
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.locked || this.ended || Math.abs(p.y - ROW_Y) > 120) return;
    const i = Math.floor((p.x - this.x0) / this.cell);
    const { sfx } = getServices(this);
    const next = move(this.pads, i);
    this.hintBox?.dismiss();
    if (!next) {
      sfx.play('locked');
      return;
    }
    this.pads = next;
    this.moves++;
    sfx.play('pop');
    if (isSolved(this.pads)) this.solved('TROCARAM!', this.moves === par(this.n) ? 200 : 0);
  }

  override update(t: number, dt: number): void {
    super.update(t, dt);
    const g = this.g.clear();
    this.pads.forEach((f, i) => {
      const x = this.x0 + i * this.cell + this.cell / 2;
      g.fillStyle(0x16a34a, 1).fillEllipse(x, ROW_Y + 30, this.cell * 0.95, this.cell * 0.5);
      if (!f) return;
      const r = this.cell * 0.36;
      g.fillStyle(f === GREEN ? 0x4ade80 : 0xf87171, 1).fillCircle(x, ROW_Y - 6, r);
      g.lineStyle(4, 0x052e16, 1).strokeCircle(x, ROW_Y - 6, r);
      g.fillStyle(0xffffff, 1)
        .fillCircle(x - r * 0.4, ROW_Y - r * 0.7, r * 0.28)
        .fillCircle(x + r * 0.4, ROW_Y - r * 0.7, r * 0.28);
      g.fillStyle(0x111827, 1)
        .fillCircle(x - r * 0.4, ROW_Y - r * 0.7, r * 0.12)
        .fillCircle(x + r * 0.4, ROW_Y - r * 0.7, r * 0.12);
    });
    this.stuck.setText(!this.locked && isStuck(this.pads) ? 'Sem saída! Reinicie' : '');
  }
}
