import Phaser from 'phaser';
import { SceneKeys } from '@/config';
import { hint } from '@/platform/ui/juice';
import { PuzzleScene } from '@/platform/ui/puzzleGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { degree, generate, isSolved, toggle, type Puzzle } from './core';

const BOARD = 640;
const Y0 = 270;

/** "Pontes": tap two islands in line to build a bridge (tap again for a double one). */
export class PontesScene extends PuzzleScene {
  private pz!: Puzzle;
  private counts: number[] = [];
  private cell = 100;
  private x0 = 0;
  private sel = -1;
  private g!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Pontes, 'pontes', [0x0f766e, 0x042f2e]);
  }

  create(): void {
    this.g = this.add.graphics().setDepth(3);
    this.begin('#99f6e4', '#042f2e');
    new Button(this, 360, 1130, 'Limpar', () => this.clear(), {
      width: 320,
      height: 90,
      fontSize: 32,
      color: 0x6b7280,
      shade: 0x374151,
    }).setDepth(20);
    this.hintBox = hint(
      this,
      ['Ligue as ilhas com pontes', 'O número = pontes que a ilha precisa'],
      940,
      5500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.tap(p));
  }

  protected startLevel(): void {
    this.pz = generate(this.level);
    this.counts = this.pz.links.map(() => 0);
    this.sel = -1;
    this.cell = Math.floor(BOARD / this.pz.size);
    this.x0 = (720 - this.cell * this.pz.size) / 2;
    for (const l of this.labels) l.destroy();
    this.labels = this.pz.islands.map((is) => {
      const t = addText(this, 0, 0, String(is.n), 40, {
        color: '#ffffff',
        stroke: '#042f2e',
        strokeThickness: 6,
      }).setDepth(9);
      return t;
    });
  }

  private pos(i: number): { x: number; y: number } {
    const is = this.pz.islands[i]!;
    return {
      x: this.x0 + is.c * this.cell + this.cell / 2,
      y: Y0 + is.r * this.cell + this.cell / 2,
    };
  }

  private clear(): void {
    if (this.locked || this.ended) return;
    this.counts = this.pz.links.map(() => 0);
    this.sel = -1;
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.locked || this.ended) return;
    let hit = -1;
    this.pz.islands.forEach((_, i) => {
      const c = this.pos(i);
      if (Math.hypot(p.x - c.x, p.y - c.y) < this.cell * 0.5) hit = i;
    });
    if (hit < 0) {
      this.sel = -1;
      return;
    }
    this.hintBox?.dismiss();
    const { sfx } = getServices(this);
    if (this.sel < 0 || this.sel === hit) {
      this.sel = this.sel === hit ? -1 : hit;
      sfx.play('click');
      return;
    }
    const k = this.pz.links.findIndex(
      ([a, b]) => (a === this.sel && b === hit) || (a === hit && b === this.sel),
    );
    if (k < 0) {
      this.sel = hit;
      sfx.play('click');
      return;
    }
    const next = toggle(this.pz, this.counts, k);
    if (!next) {
      sfx.play('locked');
      this.sel = -1;
      return;
    }
    this.counts = next;
    this.sel = -1;
    sfx.play('pop');
    if (isSolved(this.pz, this.counts)) this.solved();
  }

  override update(t: number, dt: number): void {
    super.update(t, dt);
    const g = this.g.clear();
    const s = this.pz.size;
    g.fillStyle(0x020617, 0.45).fillRoundedRect(
      this.x0 - 8,
      Y0 - 8,
      s * this.cell + 16,
      s * this.cell + 16,
      14,
    );
    this.pz.links.forEach(([a, b], k) => {
      const n = this.counts[k]!;
      if (n === 0) return;
      const A = this.pos(a);
      const B = this.pos(b);
      const horizontal = A.y === B.y;
      const offs = n === 1 ? [0] : [-7, 7];
      for (const o of offs) {
        g.lineStyle(6, 0xe2e8f0, 1).lineBetween(
          A.x + (horizontal ? 0 : o),
          A.y + (horizontal ? o : 0),
          B.x + (horizontal ? 0 : o),
          B.y + (horizontal ? o : 0),
        );
      }
    });
    this.pz.islands.forEach((is, i) => {
      const c = this.pos(i);
      const d = degree(this.pz, this.counts, i);
      const col = d === is.n ? 0x16a34a : d > is.n ? 0xdc2626 : 0x0369a1;
      g.fillStyle(col, 1).fillCircle(c.x, c.y, this.cell * 0.36);
      g.lineStyle(this.sel === i ? 8 : 3, this.sel === i ? 0xfde047 : 0xffffff, 1).strokeCircle(
        c.x,
        c.y,
        this.cell * 0.36,
      );
      this.labels[i]!.setPosition(c.x, c.y);
    });
  }
}
