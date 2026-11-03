import Phaser from 'phaser';
import { SceneKeys } from '@/config';
import { hint } from '@/platform/ui/juice';
import { PuzzleScene, type RuleCard } from '@/platform/ui/puzzleGame';
import { Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { discsFor, isSolved, move, newGame, par, type Pegs } from './core';

const PEG_X = [130, 360, 590];
const BASE_Y = 900;
const DISC_H = 46;
const COLORS = [0xef4444, 0xf97316, 0xfacc15, 0x22c55e, 0x06b6d4, 0x3b82f6, 0x8b5cf6, 0xec4899];

/** "Torre de Hanói": move the tower to the right peg, never a big disc on a small one. */
export class HanoiScene extends PuzzleScene {
  private pegs: Pegs = [[], [], []];
  private n = 3;
  private moves = 0;
  private sel = -1;
  private g!: Phaser.GameObjects.Graphics;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Hanoi, 'hanoi', [0x0e7490, 0x082f49]);
  }

  protected override rules(): RuleCard {
    return {
      goal: 'Levar todos os discos para a torre da direita.',
      steps: [
        'Toque numa torre para escolher o disco de cima e toque na torre de destino para movê-lo.',
        'Só se move 1 disco por vez.',
        'Nunca ponha um disco grande em cima de um menor.',
      ],
    };
  }

  create(): void {
    this.g = this.add.graphics().setDepth(3);
    this.begin('#a5f3fc', '#082f49');
    new Button(this, 360, 1130, 'Reiniciar', () => this.restart(), {
      width: 320,
      height: 90,
      fontSize: 32,
      color: 0x6b7280,
      shade: 0x374151,
    }).setDepth(20);
    this.hintBox = hint(
      this,
      ['Toque numa torre e depois na destino', 'Leve todos os discos para a da direita'],
      940,
      5000,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.tap(p));
  }

  protected startLevel(): void {
    this.n = discsFor(this.level);
    this.pegs = newGame(this.n);
    this.moves = 0;
    this.sel = -1;
  }

  protected override hud(): string {
    return `${this.moves}/${par(this.n)}`;
  }

  private restart(): void {
    if (this.locked || this.ended) return;
    this.startLevel();
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.locked || this.ended || p.y < 280 || p.y > 980) return;
    let peg = 0;
    for (let i = 1; i < 3; i++)
      if (Math.abs(p.x - PEG_X[i]!) < Math.abs(p.x - PEG_X[peg]!)) peg = i;
    this.hintBox?.dismiss();
    const { sfx } = getServices(this);
    if (this.sel < 0) {
      if (this.pegs[peg]!.length > 0) {
        this.sel = peg;
        sfx.play('click');
      } else sfx.play('locked');
      return;
    }
    const from = this.sel;
    this.sel = -1;
    if (from === peg) return;
    const next = move(this.pegs, from, peg);
    if (!next) {
      sfx.play('locked');
      return;
    }
    this.pegs = next;
    this.moves++;
    sfx.play('pop');
    if (isSolved(this.pegs, this.n))
      this.solved('TORRE MOVIDA!', this.moves === par(this.n) ? 200 : 0);
  }

  override update(t: number, dt: number): void {
    super.update(t, dt);
    const g = this.g.clear();
    g.fillStyle(0x78350f, 1).fillRoundedRect(30, BASE_Y, 660, 24, 10);
    for (let i = 0; i < 3; i++) {
      const x = PEG_X[i]!;
      g.fillStyle(0xa16207, 1).fillRoundedRect(x - 9, BASE_Y - 560, 18, 560, 8);
      if (i === 2)
        g.lineStyle(5, 0xfde047, 0.8).strokeRoundedRect(x - 120, BASE_Y - 590, 240, 620, 20);
      const pile = this.pegs[i]!;
      pile.forEach((d, k) => {
        const lifted = this.sel === i && k === pile.length - 1;
        const w = 50 + d * (170 / this.n);
        const y = lifted ? BASE_Y - 610 : BASE_Y - (k + 1) * DISC_H;
        g.fillStyle(COLORS[(d - 1) % COLORS.length]!, 1).fillRoundedRect(
          x - w / 2,
          y,
          w,
          DISC_H - 4,
          14,
        );
        g.lineStyle(3, 0xffffff, 0.35).strokeRoundedRect(x - w / 2, y, w, DISC_H - 4, 14);
      });
    }
  }
}
