import Phaser from 'phaser';
import { SceneKeys } from '@/config';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { COLS, pieceCells, ROWS, SHAPES, Tetris } from './core';

const CELL = 46;
const OX = 36;
const OY = 160;
const COLORS = [0x00d4ff, 0xffd23f, 0xb15cff, 0x4ade80, 0xff4d4d, 0x4da3ff, 0xff9f1c];
const PAD_Y = 1190;

interface Hold {
  action: () => void;
  wait: number;
}

/** "Blocos": the classic. Buttons below; hold ◀ ▶ ▼ to repeat. */
export class BlocosScene extends MiniScene {
  private sim = new Tetris();
  private g!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private holds = new Map<string, Hold>();

  constructor() {
    super(SceneKeys.Blocos, 'blocos', [0x0b132b, 0x3a506b]);
  }

  create(): void {
    this.sim = new Tetris();
    this.holds.clear();
    this.frame();
    this.g = this.add.graphics();
    addText(this, 620, 190, 'PRÓXIMA', 26, { color: '#ffffff', stroke: '#0b1430' });
    this.info = addText(this, 620, 560, '', 30, {
      color: '#ffffff',
      stroke: '#0b1430',
      align: 'center',
    });
    const pads: Array<[string, string, () => void, boolean]> = [
      ['◀', '◀', () => this.shift(-1), true],
      ['▼', '▼', () => this.down(), true],
      ['▶', '▶', () => this.shift(1), true],
      ['⟳', '⟳', () => this.spin(), false],
      ['⤓', '⤓', () => this.drop(), false],
    ];
    pads.forEach(([id, label, action, repeat], i) =>
      this.pad(id, 72 + i * 144, label, action, repeat),
    );
    const k = this.input.keyboard;
    k?.on('keydown-LEFT', () => this.shift(-1));
    k?.on('keydown-RIGHT', () => this.shift(1));
    k?.on('keydown-DOWN', () => this.down());
    k?.on('keydown-UP', () => this.spin());
    k?.on('keydown-SPACE', () => this.drop());
  }

  private pad(id: string, x: number, label: string, action: () => void, repeat: boolean): void {
    const r = this.add
      .rectangle(x, PAD_Y, 130, 120, 0xffffff, 0.16)
      .setStrokeStyle(4, 0xffffff, 0.5)
      .setInteractive();
    addText(this, x, PAD_Y, label, 58, { color: '#ffffff' });
    const stop = () => this.holds.delete(id);
    r.on(Phaser.Input.Events.POINTER_DOWN, () => {
      action();
      if (repeat) this.holds.set(id, { action, wait: 0.17 });
    });
    r.on(Phaser.Input.Events.POINTER_UP, stop);
    r.on(Phaser.Input.Events.POINTER_OUT, stop);
  }

  private shift(dx: number): void {
    if (!this.ended && this.sim.move(dx)) getServices(this).sfx.play('click');
  }

  private spin(): void {
    if (!this.ended && this.sim.rotate()) getServices(this).sfx.play('pop', 3);
  }

  private down(): void {
    if (!this.ended) this.sim.softDrop();
  }

  private drop(): void {
    if (this.ended) return;
    this.locked(this.sim.hardDrop());
  }

  private locked(cleared: number): void {
    const { sfx } = getServices(this);
    if (cleared) {
      sfx.play(cleared >= 4 ? 'win' : 'star');
      this.pop(
        OX + (COLS * CELL) / 2,
        500,
        ['', 'Linha!', 'Duas!', 'Três!', 'TETRIS!'][cleared]!,
        '#ffe066',
        56,
      );
    } else sfx.play('hit', 0);
    this.setScore(this.sim.score);
    if (this.sim.over) {
      const { score, lines, level } = this.sim;
      this.finish('Chegou no topo!', [`Linhas: ${lines}`, `Nível: ${level}`], {
        score,
        details: { lines, level },
      });
    }
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    for (const h of this.holds.values()) {
      h.wait -= dt;
      if (h.wait <= 0) {
        h.action();
        h.wait = 0.055;
      }
    }
    const cleared = this.sim.step(dt);
    if (cleared !== null) this.locked(cleared);
    this.draw();
  }

  private draw(): void {
    const g = this.g.clear();
    const { sim } = this;
    g.fillStyle(0x000000, 0.45).fillRoundedRect(
      OX - 8,
      OY - 8,
      COLS * CELL + 16,
      ROWS * CELL + 16,
      14,
    );
    g.lineStyle(1, 0xffffff, 0.06);
    for (let x = 1; x < COLS; x++)
      g.lineBetween(OX + x * CELL, OY, OX + x * CELL, OY + ROWS * CELL);
    for (let y = 1; y < ROWS; y++)
      g.lineBetween(OX, OY + y * CELL, OX + COLS * CELL, OY + y * CELL);
    const cell = (x: number, y: number, color: number, alpha = 1) => {
      g.fillStyle(color, alpha).fillRoundedRect(
        OX + x * CELL + 2,
        OY + y * CELL + 2,
        CELL - 4,
        CELL - 4,
        8,
      );
      if (alpha === 1)
        g.fillStyle(0xffffff, 0.28).fillRoundedRect(
          OX + x * CELL + 5,
          OY + y * CELL + 5,
          CELL - 10,
          9,
          4,
        );
    };
    sim.board.forEach((row, y) => row.forEach((v, x) => v && cell(x, y, COLORS[v - 1]!)));
    if (!sim.over) {
      const ghost = { ...sim.piece, y: sim.ghostY() };
      for (const [x, y] of pieceCells(ghost)) cell(x, y, COLORS[sim.piece.type]!, 0.25);
      for (const [x, y] of pieceCells(sim.piece)) if (y >= 0) cell(x, y, COLORS[sim.piece.type]!);
    }
    // Next piece preview.
    const shape = SHAPES[sim.next]!;
    for (const [cx, cy] of shape.cells) {
      const px = 620 - (shape.n * 34) / 2 + cx * 34;
      const py = 230 + cy * 34;
      g.fillStyle(COLORS[sim.next]!).fillRoundedRect(px, py, 30, 30, 6);
    }
    this.info.setText(`Nível\n${sim.level}\n\nLinhas\n${sim.lines}`);
  }
}
