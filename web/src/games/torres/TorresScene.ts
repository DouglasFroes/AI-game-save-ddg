import Phaser from 'phaser';
import { SceneKeys } from '@/config';
import { hint } from '@/platform/ui/juice';
import { PuzzleScene, type RuleCard } from '@/platform/ui/puzzleGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { badClues, duplicates, generate, isSolved, newGrid, type Grid, type Puzzle } from './core';

const Y0 = 340;
const BOARD = 480;

/** "Torres": heights 1..n once per row and column; the outer numbers count the towers you can see. */
export class TorresScene extends PuzzleScene {
  private pz!: Puzzle;
  private grid: Grid = [];
  private cell = 80;
  private x0 = 0;
  private g!: Phaser.GameObjects.Graphics;
  private cells: Phaser.GameObjects.Text[] = [];
  private clues = new Map<string, Phaser.GameObjects.Text>();
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Torres, 'torres', [0x475569, 0x0f172a]);
  }

  protected override rules(): RuleCard {
    return {
      goal: 'Preencher a grade com prédios de alturas diferentes.',
      steps: [
        'Toque numa casa para trocar o número: é a altura do prédio (1 é o mais baixo).',
        'Nenhum número pode repetir na mesma linha ou coluna.',
        'O número fora da grade diz quantos prédios você vê olhando daquele lado: um prédio alto esconde os menores atrás dele.',
        'Números errados ficam em vermelho.',
      ],
    };
  }

  create(): void {
    this.g = this.add.graphics().setDepth(3);
    this.begin('#cbd5e1', '#0f172a');
    new Button(this, 360, 1130, 'Limpar', () => this.clear(), {
      width: 320,
      height: 90,
      fontSize: 32,
      color: 0x6b7280,
      shade: 0x374151,
    }).setDepth(20);
    this.hintBox = hint(
      this,
      ['Toque numa casa para mudar a altura', 'O número de fora = torres que você enxerga'],
      940,
      5500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.tap(p));
  }

  protected startLevel(): void {
    this.pz = generate(this.level);
    this.grid = newGrid(this.pz.n);
    const n = this.pz.n;
    this.cell = Math.floor(BOARD / n);
    this.x0 = (720 - this.cell * n) / 2;
    for (const t of this.cells) t.destroy();
    for (const t of this.clues.values()) t.destroy();
    this.clues.clear();
    this.cells = Array.from({ length: n * n }, (_, i) =>
      addText(
        this,
        this.x0 + (i % n) * this.cell + this.cell / 2,
        Y0 + Math.floor(i / n) * this.cell + this.cell / 2,
        '',
        Math.floor(this.cell * 0.6),
        {
          color: '#ffffff',
          stroke: '#0f172a',
          strokeThickness: 6,
        },
      ).setDepth(9),
    );
    const mk = (key: string, x: number, y: number, v: number) => {
      if (v)
        this.clues.set(
          key,
          addText(this, x, y, String(v), 34, {
            color: '#fde68a',
            stroke: '#0f172a',
            strokeThickness: 6,
          }).setDepth(9),
        );
    };
    const half = this.cell / 2;
    for (let i = 0; i < n; i++) {
      mk(`l${i}`, this.x0 - 34, Y0 + i * this.cell + half, this.pz.left[i]!);
      mk(`r${i}`, this.x0 + n * this.cell + 34, Y0 + i * this.cell + half, this.pz.right[i]!);
      mk(`t${i}`, this.x0 + i * this.cell + half, Y0 - 34, this.pz.top[i]!);
      mk(`b${i}`, this.x0 + i * this.cell + half, Y0 + n * this.cell + 34, this.pz.bottom[i]!);
    }
  }

  private clear(): void {
    if (this.locked || this.ended) return;
    this.grid = newGrid(this.pz.n);
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.locked || this.ended) return;
    const c = Math.floor((p.x - this.x0) / this.cell);
    const r = Math.floor((p.y - Y0) / this.cell);
    const n = this.pz.n;
    if (c < 0 || c >= n || r < 0 || r >= n) return;
    this.hintBox?.dismiss();
    this.grid[r]![c] = (this.grid[r]![c]! + 1) % (n + 1);
    getServices(this).sfx.play('tick');
    if (isSolved(this.pz, this.grid)) this.solved();
  }

  override update(t: number, dt: number): void {
    super.update(t, dt);
    const n = this.pz.n;
    const dup = duplicates(this.grid);
    const bad = badClues(this.pz, this.grid);
    const g = this.g.clear();
    g.fillStyle(0x020617, 0.6).fillRoundedRect(
      this.x0 - 8,
      Y0 - 8,
      n * this.cell + 16,
      n * this.cell + 16,
      14,
    );
    for (let i = 0; i < n * n; i++) {
      const x = this.x0 + (i % n) * this.cell;
      const y = Y0 + Math.floor(i / n) * this.cell;
      const v = this.grid[Math.floor(i / n)]![i % n]!;
      g.fillStyle(dup.has(i) ? 0x991b1b : v ? 0x334155 : 0x1e293b, 1).fillRect(
        x + 2,
        y + 2,
        this.cell - 4,
        this.cell - 4,
      );
      if (v)
        g.fillStyle(0x94a3b8, 1).fillRect(
          x + 8,
          y + this.cell - 8 - (v / n) * (this.cell - 16) * 0.2,
          this.cell - 16,
          4,
        );
      this.cells[i]!.setText(v ? String(v) : '');
    }
    for (const [k, txt] of this.clues) txt.setColor(bad.has(k) ? '#f87171' : '#fde68a');
  }
}
