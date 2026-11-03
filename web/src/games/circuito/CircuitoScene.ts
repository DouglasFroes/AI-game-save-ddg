import Phaser from 'phaser';
import { SceneKeys } from '@/config';
import { hint } from '@/platform/ui/juice';
import { PuzzleScene } from '@/platform/ui/puzzleGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { evaluate, generate, lamp, type Puzzle } from './core';

const IN_Y = 1040;
const LAMP_Y = 330;

/** "Circuito": flip the switches so the signal flows through the logic gates and lights the lamp. */
export class CircuitoScene extends PuzzleScene {
  private pz!: Puzzle;
  private sw: boolean[] = [];
  private pts: Array<{ x: number; y: number }> = [];
  private g!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Circuito, 'circuito', [0x1e3a8a, 0x020617]);
  }

  create(): void {
    this.g = this.add.graphics().setDepth(3);
    this.begin('#bfdbfe', '#020617');
    this.hintBox = hint(
      this,
      ['Ligue as chaves de baixo', 'Faça a lâmpada de cima acender'],
      600,
      6000,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.locked || this.ended) return;
      for (let i = 0; i < this.pz.inputs; i++) {
        const c = this.pts[i]!;
        if (Math.hypot(p.x - c.x, p.y - c.y) < 44) {
          this.hintBox?.dismiss();
          this.sw[i] = !this.sw[i];
          getServices(this).sfx.play('click');
          if (lamp(this.pz, this.sw)) this.solved('ACENDEU!');
          return;
        }
      }
    });
  }

  protected startLevel(): void {
    this.pz = generate(this.level);
    this.sw = Array.from({ length: this.pz.inputs }, () => false);
    const { inputs, gates } = this.pz;
    this.pts = [];
    for (let i = 0; i < inputs; i++)
      this.pts.push({ x: 90 + (i * 540) / Math.max(1, inputs - 1), y: IN_Y });
    const rowH = (IN_Y - 90 - LAMP_Y) / gates.length;
    gates.forEach((gt, k) => {
      const a = this.pts[gt.a]!;
      const b = gt.op === 'NOT' ? a : this.pts[gt.b]!;
      const x = Math.max(110, Math.min(610, (a.x + b.x) / 2 + (k % 2 === 0 ? 24 : -24)));
      this.pts.push({ x, y: IN_Y - 90 - (k + 1) * rowH + (k === gates.length - 1 ? 0 : 0) });
    });
    for (const l of this.labels) l.destroy();
    this.labels = gates.map((gt, k) =>
      addText(this, this.pts[inputs + k]!.x, this.pts[inputs + k]!.y, gt.op, 22, {
        color: '#ffffff',
        stroke: '#020617',
        strokeThickness: 4,
      }).setDepth(9),
    );
  }

  override update(t: number, dt: number): void {
    super.update(t, dt);
    const v = evaluate(this.pz, this.sw);
    const g = this.g.clear();
    const col = (on: boolean) => (on ? 0xfacc15 : 0x475569);
    this.pz.gates.forEach((gt, k) => {
      const to = this.pts[this.pz.inputs + k]!;
      for (const src of gt.op === 'NOT' ? [gt.a] : [gt.a, gt.b]) {
        const f = this.pts[src]!;
        g.lineStyle(5, col(v[src]!), 1).lineBetween(f.x, f.y, to.x, to.y);
      }
    });
    this.pz.gates.forEach((_, k) => {
      const c = this.pts[this.pz.inputs + k]!;
      const on = v[this.pz.inputs + k]!;
      const last = k === this.pz.gates.length - 1;
      g.fillStyle(0x0f172a, 1).fillRoundedRect(c.x - 44, c.y - 20, 88, 40, 12);
      g.lineStyle(4, col(on), 1).strokeRoundedRect(c.x - 44, c.y - 20, 88, 40, 12);
      if (last) {
        g.fillStyle(on ? 0xfef08a : 0x334155, 1).fillCircle(c.x, c.y - 70, 40);
        g.lineStyle(5, on ? 0xfacc15 : 0x64748b, 1).strokeCircle(c.x, c.y - 70, 40);
        g.lineBetween(c.x, c.y - 20, c.x, c.y - 30);
      }
    });
    for (let i = 0; i < this.pz.inputs; i++) {
      const c = this.pts[i]!;
      g.fillStyle(this.sw[i] ? 0x16a34a : 0x7f1d1d, 1).fillCircle(c.x, c.y, 38);
      g.lineStyle(5, 0xffffff, 0.8).strokeCircle(c.x, c.y, 38);
      g.fillStyle(0xffffff, 1).fillCircle(c.x, c.y + (this.sw[i] ? -12 : 12), 12);
    }
  }
}
