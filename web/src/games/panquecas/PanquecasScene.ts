import Phaser from 'phaser';
import { SceneKeys } from '@/config';
import { hint } from '@/platform/ui/juice';
import { PuzzleScene, type RuleCard } from '@/platform/ui/puzzleGame';
import { Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { flip, isSorted, newGame, sizeFor, solve } from './core';

const TOP = 320;
const H = 72;
const SHADES = [
  0xfbbf24, 0xf59e0b, 0xd97706, 0xb45309, 0x92400e, 0xfcd34d, 0xe8a317, 0xc2761a, 0xa8620f,
];

/** "Panquecas": tap a pancake to flip it and everything above it; put the biggest at the bottom. */
export class PanquecasScene extends PuzzleScene {
  private stack: number[] = [];
  private first: number[] = [];
  private flips = 0;
  private par = 0;
  private g!: Phaser.GameObjects.Graphics;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Panquecas, 'panquecas', [0xb45309, 0x431407]);
  }

  protected override rules(): RuleCard {
    return {
      goal: 'Ordenar a pilha: maior embaixo, menor em cima.',
      steps: [
        'Toque numa panqueca: ela e todas as que estão acima dela viram de cabeça para baixo.',
        'Planeje os giros para levar a maior para o fundo e depois as próximas.',
        'Menos giros dão mais pontos.',
      ],
    };
  }

  create(): void {
    this.g = this.add.graphics().setDepth(3);
    this.begin('#fde68a', '#431407');
    new Button(this, 360, 1150, 'Recomeçar', () => this.restart(), {
      width: 320,
      height: 90,
      fontSize: 32,
      color: 0x6b7280,
      shade: 0x374151,
    }).setDepth(20);
    this.hintBox = hint(
      this,
      ['Toque numa panqueca: ela e as de cima viram', 'Maior embaixo, menor em cima'],
      1040,
      5500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.tap(p));
  }

  protected startLevel(): void {
    this.first = newGame(sizeFor(this.level));
    this.stack = this.first.slice();
    this.flips = 0;
    this.par = solve(this.first).length;
  }

  protected override hud(): string {
    return `${this.flips} viradas`;
  }

  private restart(): void {
    if (this.locked || this.ended) return;
    this.stack = this.first.slice();
    this.flips = 0;
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.locked || this.ended) return;
    const k = Math.floor((p.y - TOP) / H);
    if (k < 0 || k >= this.stack.length || Math.abs(p.x - 360) > 300) return;
    this.hintBox?.dismiss();
    this.stack = flip(this.stack, k);
    this.flips++;
    getServices(this).sfx.play('pop');
    if (isSorted(this.stack)) this.solved('EMPILHADAS!', this.flips <= this.par ? 150 : 0);
  }

  override update(t: number, dt: number): void {
    super.update(t, dt);
    const g = this.g.clear();
    const n = this.stack.length;
    g.fillStyle(0xe5e7eb, 1).fillEllipse(360, TOP + n * H + 10, 600, 44);
    this.stack.forEach((s, i) => {
      const w = 90 + s * (400 / n);
      const y = TOP + i * H;
      g.fillStyle(SHADES[(s - 1) % SHADES.length]!, 1).fillRoundedRect(
        360 - w / 2,
        y + 4,
        w,
        H - 8,
        24,
      );
      g.lineStyle(4, 0x78350f, 0.7).strokeRoundedRect(360 - w / 2, y + 4, w, H - 8, 24);
    });
  }
}
