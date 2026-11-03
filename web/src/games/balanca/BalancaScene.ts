import Phaser from 'phaser';
import { SceneKeys } from '@/config';
import { hint } from '@/platform/ui/juice';
import { PuzzleScene } from '@/platform/ui/puzzleGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { cycle, generate, isSolved, newSides, total, type Puzzle, type Side } from './core';

const PIVOT = { x: 360, y: 400 };
const ARM = 200;
const TOKEN = 78;

/** "Balança": tap a weight to send it to the left pan, the right pan, or back to the table. */
export class BalancaScene extends PuzzleScene {
  private pz!: Puzzle;
  private sides: Side[] = [];
  private g!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private totals: Phaser.GameObjects.Text[] = [];
  private spots: Array<{ x: number; y: number }> = [];
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Balanca, 'balanca', [0xb45309, 0x451a03]);
  }

  create(): void {
    this.g = this.add.graphics().setDepth(3);
    this.totals = [100, 620].map((x) =>
      addText(this, x, 250, '0', 44, {
        color: '#fde68a',
        stroke: '#451a03',
        strokeThickness: 8,
      }).setDepth(9),
    );
    this.begin('#fde68a', '#451a03');
    new Button(this, 360, 1190, 'Limpar', () => this.clear(), {
      width: 300,
      height: 80,
      fontSize: 30,
      color: 0x6b7280,
      shade: 0x374151,
    }).setDepth(20);
    this.hintBox = hint(
      this,
      ['Toque nos pesos para pôr nos pratos', 'Os dois lados devem pesar o mesmo'],
      560,
      5500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.tap(p));
  }

  protected startLevel(): void {
    this.pz = generate(this.level);
    this.sides = newSides(this.pz);
    for (const l of this.labels) l.destroy();
    this.labels = this.pz.weights.map((w) =>
      addText(this, 0, 0, String(w), 34, {
        color: '#ffffff',
        stroke: '#451a03',
        strokeThickness: 6,
      }).setDepth(9),
    );
    this.spots = this.pz.weights.map(() => ({ x: 0, y: 0 }));
  }

  private clear(): void {
    if (this.locked || this.ended) return;
    this.sides = newSides(this.pz);
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.locked || this.ended) return;
    let best = -1;
    let bestD = TOKEN * 0.65;
    this.spots.forEach((s, i) => {
      const d = Math.hypot(p.x - s.x, p.y - s.y);
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    });
    if (best < 0) return;
    this.hintBox?.dismiss();
    this.sides = cycle(this.sides, best);
    getServices(this).sfx.play('pop');
    if (isSolved(this.pz, this.sides)) this.solved('EQUILIBRADO!');
  }

  override update(t: number, dt: number): void {
    super.update(t, dt);
    const left = total(this.pz, this.sides, -1);
    const right = total(this.pz, this.sides, 1);
    const tilt = Math.max(-0.28, Math.min(0.28, (right - left) * 0.012));
    const lx = PIVOT.x - Math.cos(tilt) * ARM;
    const ly = PIVOT.y - Math.sin(tilt) * ARM;
    const rx = PIVOT.x + Math.cos(tilt) * ARM;
    const ry = PIVOT.y + Math.sin(tilt) * ARM;
    const g = this.g.clear();
    g.fillStyle(0x78350f, 1).fillTriangle(PIVOT.x, PIVOT.y, PIVOT.x - 60, 600, PIVOT.x + 60, 600);
    g.lineStyle(14, 0xfcd34d, 1).lineBetween(lx, ly, rx, ry);
    g.fillStyle(0xfcd34d, 1).fillCircle(PIVOT.x, PIVOT.y, 18);
    const pans: Array<{ x: number; y: number; side: -1 | 1 }> = [
      { x: lx, y: ly + 150, side: -1 },
      { x: rx, y: ry + 150, side: 1 },
    ];
    this.totals[0]!.setPosition(lx, ly - 40).setText(String(left));
    this.totals[1]!.setPosition(rx, ry - 40).setText(String(right));
    let table = 0;
    const counts = { '-1': 0, '1': 0 };
    this.pz.weights.forEach((_, i) => {
      const s = this.sides[i]!;
      let x: number;
      let y: number;
      if (s === 0) {
        x = 100 + (table % 5) * 130;
        y = 780 + Math.floor(table / 5) * 100;
        table++;
      } else {
        const pan = pans[s === -1 ? 0 : 1]!;
        const k = counts[String(s) as '-1' | '1']++;
        x = pan.x - 78 + (k % 3) * 78;
        y = pan.y - 20 - Math.floor(k / 3) * 80;
      }
      this.spots[i] = { x, y };
      g.fillStyle(s === 0 ? 0x92400e : s === -1 ? 0x2563eb : 0xdc2626, 1).fillRoundedRect(
        x - TOKEN / 2 + 4,
        y - TOKEN / 2 + 4,
        TOKEN - 8,
        TOKEN - 8,
        12,
      );
      this.labels[i]!.setPosition(x, y);
    });
    for (const pan of pans) {
      g.lineStyle(4, 0xfcd34d, 1)
        .lineBetween(pan.x, pan.y - 150, pan.x - 120, pan.y + 40)
        .lineBetween(pan.x, pan.y - 150, pan.x + 120, pan.y + 40);
      g.fillStyle(0xfcd34d, 1).fillRoundedRect(pan.x - 130, pan.y + 40, 260, 20, 10);
    }
  }
}
