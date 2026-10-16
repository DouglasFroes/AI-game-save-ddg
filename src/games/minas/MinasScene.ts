import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { MinesSim } from './core';

const NUM_COLORS = [
  '',
  '#2563eb',
  '#16a34a',
  '#dc2626',
  '#7c3aed',
  '#b45309',
  '#0891b2',
  '#111827',
  '#6b7280',
];
const LONG_PRESS = 350;

/** "Campo Minado": tap to open, long-press (or flag mode) to plant a flag. */
export class MinasScene extends MiniScene {
  private sim = new MinesSim();
  private g!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private zones: Phaser.GameObjects.Rectangle[] = [];
  private info!: Phaser.GameObjects.Text;
  private modeBtn!: Button;
  private flagMode = false;
  private cell = 80;
  private ox = 0;
  private oy = 300;
  private busy = false;

  constructor() {
    super(SceneKeys.Minas, 'minas', [0x344e41, 0x588157]);
  }

  create(): void {
    this.sim = new MinesSim();
    this.flagMode = false;
    this.busy = false;
    this.frame();
    this.g = this.add.graphics();
    this.info = addText(this, GAME_WIDTH / 2, 215, '', 36, { color: '#ffffff', stroke: '#0b1430' });
    this.modeBtn = new Button(this, GAME_WIDTH / 2, 1180, '⛏️ Abrir', () => this.toggleMode(), {
      width: 360,
      height: 96,
      color: COLORS.primary,
      shade: COLORS.primaryDark,
      fontSize: 40,
    });
    this.build();
  }

  private toggleMode(): void {
    this.flagMode = !this.flagMode;
    this.modeBtn.label.setText(this.flagMode ? '🚩 Bandeira' : '⛏️ Abrir');
  }

  private build(): void {
    for (const t of this.labels) t.destroy();
    for (const z of this.zones) z.destroy();
    this.labels = [];
    this.zones = [];
    const f = this.sim.field;
    this.cell = Math.floor(Math.min(660 / f.cols, 800 / f.rows));
    this.ox = (GAME_WIDTH - this.cell * f.cols) / 2;
    this.oy = 270;
    for (let i = 0; i < f.cols * f.rows; i++) {
      const { x, y } = this.center(i);
      this.labels.push(addText(this, x, y, '', Math.round(this.cell * 0.6)).setDepth(2));
      let downAt = 0;
      const z = this.add
        .rectangle(x, y, this.cell, this.cell, 0xffffff, 0.001)
        .setDepth(3)
        .setInteractive();
      z.on(Phaser.Input.Events.POINTER_DOWN, () => (downAt = this.time.now));
      z.on(Phaser.Input.Events.POINTER_UP, () =>
        this.press(i, this.time.now - downAt >= LONG_PRESS),
      );
      this.zones.push(z);
    }
    this.refresh();
  }

  private center(i: number): { x: number; y: number } {
    const f = this.sim.field;
    return {
      x: this.ox + (i % f.cols) * this.cell + this.cell / 2,
      y: this.oy + Math.floor(i / f.cols) * this.cell + this.cell / 2,
    };
  }

  private press(i: number, long: boolean): void {
    if (this.ended || this.busy) return;
    const f = this.sim.field;
    const { sfx } = getServices(this);
    if (long !== this.flagMode && !f.open[i]) {
      // Long-press flips the current mode for this one tap.
      f.toggleFlag(i);
      sfx.play('click');
      this.refresh();
      return;
    }
    const changed = f.open[i] ? f.chord(i) : f.reveal(i);
    if (changed.length === 0) return;
    sfx.play('pop', Math.min(changed.length, 8));
    this.refresh();
    if (f.exploded) {
      sfx.vibrate([80, 40, 80]);
      this.finish('BUM! Pisou numa mina', [`Tabuleiros limpos: ${this.sim.level}`], {
        score: this.sim.score,
        details: { boards: this.sim.level },
      });
    } else if (this.sim.checkWin()) {
      sfx.play('win');
      this.setScore(this.sim.score);
      this.pop(GAME_WIDTH / 2, 280, 'Tabuleiro limpo!', '#ffe066');
      this.busy = true;
      this.time.delayedCall(1100, () => {
        this.sim.nextBoard();
        this.busy = false;
        this.build();
      });
    }
  }

  private refresh(): void {
    const f = this.sim.field;
    const g = this.g.clear();
    const c = this.cell;
    for (let i = 0; i < f.cols * f.rows; i++) {
      const { x, y } = this.center(i);
      const label = this.labels[i]!;
      const x0 = x - c / 2 + 2;
      const y0 = y - c / 2 + 2;
      const shown = f.open[i] || (f.exploded && f.mine[i]);
      if (shown) {
        g.fillStyle(
          f.exploded && f.mine[i] ? (f.open[i] ? 0xff4d4d : 0xf4a261) : 0xe9edc9,
        ).fillRoundedRect(x0, y0, c - 4, c - 4, 8);
        if (f.mine[i]) label.setText('💣').setColor('#000000');
        else label.setText(f.count[i] ? String(f.count[i]) : '').setColor(NUM_COLORS[f.count[i]!]!);
      } else {
        g.fillStyle(0xccd5ae).fillRoundedRect(x0, y0, c - 4, c - 4, 8);
        g.fillStyle(0xffffff, 0.35).fillRoundedRect(x0, y0, c - 4, 10, 6);
        label.setText(f.flag[i] ? '🚩' : '').setColor('#000000');
      }
    }
    this.info.setText(`Tabuleiro ${this.sim.level + 1}  ·  🚩 ${f.mines - f.flags}`);
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.sim.step(deltaMs / 1000);
  }
}
