import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { LightsSim } from './core';

const CX = GAME_WIDTH / 2;
const BOARD = 620;
const TOP = 420;

/** "Acende Tudo": a Lights Out puzzle against the clock. */
export class LuzesScene extends MiniScene {
  private sim = new LightsSim();
  private cells: Phaser.GameObjects.Rectangle[] = [];
  private bar!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Luzes, 'luzes', [0x10002b, 0x3c096c]);
  }

  create(): void {
    this.sim = new LightsSim();
    this.frame();
    this.bar = this.add.graphics();
    this.info = addText(this, CX, 290, '', 36, { color: '#ffffff', stroke: '#0b1430' });
    this.build();
  }

  private build(): void {
    for (const c of this.cells) c.destroy();
    const n = this.sim.grid.n;
    const gap = 12;
    const size = (BOARD - gap * (n - 1)) / n;
    this.cells = this.sim.grid.cells.map((_, i) => {
      const x = CX - BOARD / 2 + (i % n) * (size + gap) + size / 2;
      const y = TOP + Math.floor(i / n) * (size + gap) + size / 2;
      const r = this.add.rectangle(x, y, size, size, 0x2b2d42).setInteractive();
      r.on(Phaser.Input.Events.POINTER_DOWN, () => this.press(i));
      return r;
    });
    this.refresh();
  }

  private refresh(): void {
    this.sim.grid.cells.forEach((on, i) => {
      const c = this.cells[i]!;
      c.setFillStyle(on ? 0xffd23f : 0x2b2d42);
      c.setStrokeStyle(on ? 6 : 3, on ? 0xfff3b0 : 0x4a4e69);
    });
    this.info.setText(`Tabuleiro ${this.sim.level + 1}  ·  ${this.sim.grid.lit} acesas`);
  }

  private press(i: number): void {
    if (this.ended || this.sim.dead) return;
    const { sfx } = getServices(this);
    const solved = this.sim.press(i);
    if (solved) {
      sfx.play('win');
      this.setScore(this.sim.level);
      this.pop(CX, 340, 'Resolvido! +tempo', '#ffe066');
      this.build();
    } else {
      sfx.play('pop', i % 7);
      this.refresh();
    }
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.sim.step(Math.min(deltaMs, 50) / 1000);
    const frac = Phaser.Math.Clamp(this.sim.time / 40, 0, 1);
    this.bar
      .clear()
      .fillStyle(0x000000, 0.4)
      .fillRoundedRect(CX - 300, 190, 600, 26, 13)
      .fillStyle(frac > 0.25 ? 0xffd23f : 0xff4d4d)
      .fillRoundedRect(CX - 300, 190, Math.max(26, 600 * frac), 26, 13);
    if (this.sim.dead) {
      const { level, totalMoves } = this.sim;
      this.finish('Acabou o tempo!', [`Toques: ${totalMoves}`], {
        score: level,
        details: { moves: totalMoves },
      });
    }
  }
}
