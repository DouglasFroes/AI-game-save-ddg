import Phaser from 'phaser';
import { SceneKeys } from '@/config';
import { hint } from '@/platform/ui/juice';
import { PuzzleScene, type RuleCard } from '@/platform/ui/puzzleGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { canJump, generate, isSolved, isStuck, jumps, type Walk } from './core';

const BOARD = 640;
const Y0 = 270;

/** "Passeio do Cavalo": hop to every square once. Tap a highlighted square to jump there. */
export class CavaloScene extends PuzzleScene {
  private size = 5;
  private origin = 0;
  private walk: Walk = [];
  private cell = 100;
  private x0 = 0;
  private g!: Phaser.GameObjects.Graphics;
  private knight!: Phaser.GameObjects.Text;
  private stuck!: Phaser.GameObjects.Text;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Cavalo, 'cavalo', [0x4338ca, 0x1e1b4b]);
  }

  protected override rules(): RuleCard {
    return {
      goal: 'Passar por todas as casas, uma única vez.',
      steps: [
        'O cavalo ♞ anda em L: 2 casas numa direção e 1 para o lado.',
        'Toque numa casa destacada para mover o cavalo até ela.',
        'Casas já visitadas não podem ser usadas de novo.',
        'Termina quando todas as casas forem visitadas.',
      ],
    };
  }

  create(): void {
    this.g = this.add.graphics().setDepth(3);
    this.knight = addText(this, 0, 0, '♞', 80, {
      color: '#111827',
      stroke: '#ffffff',
      strokeThickness: 5,
    }).setDepth(9);
    this.stuck = addText(this, 360, 1060, '', 38, {
      color: '#fde047',
      stroke: '#1e1b4b',
      strokeThickness: 8,
    }).setDepth(30);
    this.begin('#c7d2fe', '#1e1b4b');
    new Button(this, 200, 1160, 'Desfazer', () => this.undo(), {
      width: 280,
      height: 90,
      fontSize: 32,
      color: 0x6b7280,
      shade: 0x374151,
    }).setDepth(20);
    new Button(this, 520, 1160, 'Reiniciar', () => this.restart(), {
      width: 280,
      height: 90,
      fontSize: 32,
      color: 0x6b7280,
      shade: 0x374151,
    }).setDepth(20);
    this.hintBox = hint(
      this,
      ['Passe por todas as casas uma só vez', 'O cavalo anda em L'],
      940,
      5000,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.tap(p));
  }

  protected startLevel(): void {
    const g = generate(this.level);
    this.size = g.size;
    this.origin = g.start;
    this.walk = [g.start];
    this.cell = Math.floor(BOARD / this.size);
    this.x0 = (720 - this.cell * this.size) / 2;
    this.knight.setFontSize(Math.floor(this.cell * 0.8));
  }

  protected override hud(): string {
    return `${this.walk.length}/${this.size * this.size}`;
  }

  private restart(): void {
    if (this.locked || this.ended) return;
    this.walk = [this.origin];
  }

  private undo(): void {
    if (this.locked || this.ended || this.walk.length <= 1) return;
    this.walk.pop();
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.locked || this.ended) return;
    const c = Math.floor((p.x - this.x0) / this.cell);
    const r = Math.floor((p.y - Y0) / this.cell);
    if (c < 0 || c >= this.size || r < 0 || r >= this.size) return;
    this.hintBox?.dismiss();
    const to = r * this.size + c;
    const { sfx } = getServices(this);
    if (!canJump(this.size, this.walk, to)) {
      sfx.play('locked');
      return;
    }
    this.walk.push(to);
    sfx.play('pop');
    if (isSolved(this.size, this.walk)) this.solved('PASSEIO COMPLETO!');
  }

  override update(t: number, dt: number): void {
    super.update(t, dt);
    const g = this.g.clear();
    const s = this.size;
    const here = this.walk[this.walk.length - 1]!;
    const options = new Set(jumps(s, here).filter((j) => !this.walk.includes(j)));
    for (let i = 0; i < s * s; i++) {
      const x = this.x0 + (i % s) * this.cell;
      const y = Y0 + Math.floor(i / s) * this.cell;
      const dark = ((i % s) + Math.floor(i / s)) % 2 === 1;
      const seen = this.walk.includes(i);
      g.fillStyle(seen ? 0x6366f1 : dark ? 0x64748b : 0xe2e8f0, 1).fillRect(
        x,
        y,
        this.cell,
        this.cell,
      );
      if (options.has(i))
        g.fillStyle(0xfacc15, 0.85).fillCircle(
          x + this.cell / 2,
          y + this.cell / 2,
          this.cell * 0.2,
        );
    }
    g.lineStyle(5, 0xfde047, 0.8);
    for (let k = 1; k < this.walk.length; k++) {
      const a = this.walk[k - 1]!;
      const b = this.walk[k]!;
      g.lineBetween(
        this.x0 + (a % s) * this.cell + this.cell / 2,
        Y0 + Math.floor(a / s) * this.cell + this.cell / 2,
        this.x0 + (b % s) * this.cell + this.cell / 2,
        Y0 + Math.floor(b / s) * this.cell + this.cell / 2,
      );
    }
    this.knight.setPosition(
      this.x0 + (here % s) * this.cell + this.cell / 2,
      Y0 + Math.floor(here / s) * this.cell + this.cell / 2,
    );
    this.stuck.setText(!this.locked && isStuck(s, this.walk) ? 'Sem saída! Desfaça' : '');
  }
}
