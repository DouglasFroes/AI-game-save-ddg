import Phaser from 'phaser';
import { SceneKeys } from '@/config';
import { hint } from '@/platform/ui/juice';
import { PuzzleScene, type RuleCard } from '@/platform/ui/puzzleGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { conflicts, generate, isSolved, type Puzzle } from './core';

const BOARD = 640;
const Y0 = 270;
const COLORS = [0xfca5a5, 0x93c5fd, 0x86efac, 0xfde68a, 0xfdba74, 0xc4b5fd, 0x67e8f9, 0xf9a8d4];

/** "Rainhas": one queen per row, column and colour, none touching. Tap a square to place one. */
export class RainhasScene extends PuzzleScene {
  private pz!: Puzzle;
  private queens: boolean[] = [];
  private cell = 80;
  private x0 = 0;
  private g!: Phaser.GameObjects.Graphics;
  private marks: Phaser.GameObjects.Text[] = [];
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Rainhas, 'rainhas', [0x7e22ce, 0x1e1b4b]);
  }

  protected override rules(): RuleCard {
    return {
      goal: 'Pôr 1 rainha em cada linha, coluna e cor.',
      steps: [
        'Toque numa casa para colocar ou tirar uma rainha 👑.',
        'Cada linha, cada coluna e cada região colorida precisa ter exatamente 1 rainha.',
        'Duas rainhas não podem se encostar, nem na diagonal.',
        'Dica: comece pelas cores com poucas casas.',
      ],
    };
  }

  create(): void {
    this.g = this.add.graphics().setDepth(3);
    this.begin('#e9d5ff', '#1e1b4b');
    new Button(this, 360, 1130, 'Limpar', () => this.clear(), {
      width: 320,
      height: 90,
      fontSize: 32,
      color: 0x6b7280,
      shade: 0x374151,
    }).setDepth(20);
    this.hintBox = hint(
      this,
      ['1 rainha por linha, coluna e cor', 'Elas não podem se tocar'],
      940,
      5000,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.tap(p));
  }

  protected startLevel(): void {
    this.pz = generate(this.level);
    this.queens = Array.from({ length: this.pz.n * this.pz.n }, () => false);
    this.cell = Math.floor(BOARD / this.pz.n);
    this.x0 = (720 - this.cell * this.pz.n) / 2;
    for (const m of this.marks) m.destroy();
    this.marks = this.queens.map((_, i) =>
      addText(
        this,
        this.x0 + (i % this.pz.n) * this.cell + this.cell / 2,
        Y0 + Math.floor(i / this.pz.n) * this.cell + this.cell / 2,
        '♛',
        Math.floor(this.cell * 0.8),
        { color: '#1e1b4b', stroke: '#ffffff', strokeThickness: 4 },
      )
        .setDepth(9)
        .setVisible(false),
    );
  }

  protected override hud(): string {
    return `${this.queens.filter(Boolean).length}/${this.pz.n} rainhas`;
  }

  private clear(): void {
    if (this.locked || this.ended) return;
    this.queens = this.queens.map(() => false);
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.locked || this.ended) return;
    const c = Math.floor((p.x - this.x0) / this.cell);
    const r = Math.floor((p.y - Y0) / this.cell);
    if (c < 0 || c >= this.pz.n || r < 0 || r >= this.pz.n) return;
    this.hintBox?.dismiss();
    const i = r * this.pz.n + c;
    this.queens[i] = !this.queens[i];
    getServices(this).sfx.play(this.queens[i] ? 'pop' : 'tick');
    if (isSolved(this.pz, this.queens)) this.solved();
  }

  override update(t: number, dt: number): void {
    super.update(t, dt);
    const g = this.g.clear();
    const n = this.pz.n;
    const bad = conflicts(this.pz, this.queens);
    for (let i = 0; i < n * n; i++) {
      const x = this.x0 + (i % n) * this.cell;
      const y = Y0 + Math.floor(i / n) * this.cell;
      g.fillStyle(COLORS[this.pz.regions[i]! % COLORS.length]!, 1).fillRect(
        x,
        y,
        this.cell,
        this.cell,
      );
      g.lineStyle(2, 0x1e1b4b, 0.5).strokeRect(x, y, this.cell, this.cell);
      if (bad.has(i)) g.fillStyle(0xdc2626, 0.5).fillRect(x, y, this.cell, this.cell);
      this.marks[i]!.setVisible(!!this.queens[i]);
    }
  }
}
