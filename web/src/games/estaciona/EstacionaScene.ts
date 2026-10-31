import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { EXIT_ROW, N, ParkingRun, slideRange, solved, type Car } from './core';

const CELL = 104;
const X0 = (GAME_WIDTH - CELL * N) / 2;
const Y0 = 330;
const CAR_COLORS = [
  0x3b82f6, 0x22c55e, 0xf59e0b, 0xa855f7, 0x14b8a6, 0xf97316, 0x64748b, 0xeab308, 0x06b6d4,
  0x84cc16, 0xec4899, 0x8b5cf6, 0x10b981,
];

interface Drag {
  id: number;
  startX: number;
  startY: number;
  lo: number;
  hi: number;
  offset: number;
}

/** "Estacionamento": slide the cars out of the way and drive the red one out of the lot. */
export class EstacionaScene extends MiniScene {
  private run = new ParkingRun();
  private g!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private fuelText!: Phaser.GameObjects.Text;
  private drag: Drag | null = null;
  private leaving = 0;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Estaciona, 'estaciona', [0x1c1917, 0x292524]);
  }

  create(): void {
    this.run = new ParkingRun();
    this.drag = null;
    this.leaving = 0;
    this.frame('0');
    this.statusText = addText(this, GAME_WIDTH / 2, 170, '', 30, {
      color: '#fde68a',
      stroke: '#1c1917',
      strokeThickness: 6,
    }).setDepth(50);
    this.fuelText = addText(this, GAME_WIDTH / 2, 1080, '', 30, { color: '#ffffff' }).setDepth(50);
    this.g = this.add.graphics().setDepth(5);
    this.hintBox = hint(
      this,
      ['Arraste os carros e tire o vermelho pela saída →', 'Cada movimento gasta 1 litro!'],
      1180,
      5000,
    );

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.ended || this.leaving) return;
      const c = Math.floor((p.x - X0) / CELL);
      const r = Math.floor((p.y - Y0) / CELL);
      if (r < 0 || c < 0 || r >= N || c >= N) return;
      const car = this.run.lot.find((k) =>
        k.horiz
          ? k.r === r && c >= k.c && c < k.c + k.len
          : k.c === c && r >= k.r && r < k.r + k.len,
      );
      if (!car) return;
      this.hintBox?.dismiss();
      const [lo, hi] = slideRange(this.run.lot, car.id);
      this.drag = { id: car.id, startX: p.x, startY: p.y, lo, hi, offset: 0 };
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      const d = this.drag;
      if (!d) return;
      const car = this.run.lot.find((k) => k.id === d.id)!;
      const raw = (car.horiz ? p.x - d.startX : p.y - d.startY) / CELL;
      d.offset = Phaser.Math.Clamp(raw, d.lo, d.hi);
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => this.release());
    this.refresh();
  }

  private release(): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const moved = this.run.slide(d.id, d.offset);
    const { sfx } = getServices(this);
    if (moved === 0) return;
    sfx.play('click');
    if (solved(this.run.lot)) {
      this.leaving = 0.0001;
      sfx.play('zap');
    } else if (this.run.over) {
      sfx.play('hit');
      flash(this, 0xef4444, 0.3, 300);
      this.finish(
        'Acabou a gasolina!',
        [`Fases: ${this.run.level - 1} · Perfeitas: ${this.run.perfect}`],
        {
          score: this.run.score,
          details: { levels: this.run.level - 1, perfect: this.run.perfect },
        },
        900,
      );
    }
    this.refresh();
  }

  private refresh(): void {
    this.statusText.setText(
      `Fase ${this.run.level} · Mínimo: ${this.run.par} · Movimentos: ${this.run.moves}`,
    );
    const fuel = Math.max(0, this.run.fuel);
    this.fuelText.setText(`⛽ ${fuel} L`);
    this.fuelText.setColor(fuel <= 5 ? '#fca5a5' : '#ffffff');
    this.setScore(this.run.score);
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    if (this.leaving) {
      this.leaving += deltaMs / 1000;
      if (this.leaving > 0.45) {
        this.leaving = 0;
        const { sfx } = getServices(this);
        const res = this.run.complete();
        sfx.play(res.perfect ? 'win' : 'coin');
        sfx.vibrate([30, 20, 50]);
        banner(
          this,
          res.perfect ? 'PERFEITO!' : `+${res.points}`,
          res.perfect ? '#fde047' : '#86efac',
        );
        this.pop(GAME_WIDTH / 2, 1020, `+${res.refill} L`, '#fde68a', 40);
        shockwave(this, X0 + CELL * N, Y0 + EXIT_ROW * CELL + CELL / 2, 0xef4444, 180);
        burst(this, X0 + CELL * N, Y0 + EXIT_ROW * CELL + CELL / 2, 0xfde047, 24, { speed: 380 });
        this.refresh();
      }
    }
    this.draw();
  }

  private draw(): void {
    const g = this.g.clear();
    // Lot with a painted grid and the exit gap.
    g.fillStyle(0x0c0a09, 1).fillRoundedRect(X0 - 18, Y0 - 18, CELL * N + 36, CELL * N + 36, 24);
    g.fillStyle(0x44403c, 1).fillRoundedRect(X0 - 8, Y0 - 8, CELL * N + 16, CELL * N + 16, 18);
    g.lineStyle(2, 0x78716c, 0.6);
    for (let i = 1; i < N; i++) {
      g.lineBetween(X0 + i * CELL, Y0, X0 + i * CELL, Y0 + N * CELL);
      g.lineBetween(X0, Y0 + i * CELL, X0 + N * CELL, Y0 + i * CELL);
    }
    const ey = Y0 + EXIT_ROW * CELL;
    g.fillStyle(0x44403c, 1).fillRect(X0 + N * CELL, ey + 6, 40, CELL - 12);
    g.fillStyle(0x22c55e, 1).fillTriangle(
      X0 + N * CELL + 24,
      ey + CELL / 2 - 16,
      X0 + N * CELL + 24,
      ey + CELL / 2 + 16,
      X0 + N * CELL + 44,
      ey + CELL / 2,
    );
    for (const car of this.run.lot) this.drawCar(car);
  }

  private drawCar(car: Car): void {
    const g = this.g;
    let off = this.drag?.id === car.id ? this.drag.offset : 0;
    if (car.id === 0 && this.leaving) off += (this.leaving / 0.45) * 3;
    const x = X0 + (car.c + (car.horiz ? off : 0)) * CELL;
    const y = Y0 + (car.r + (car.horiz ? 0 : off)) * CELL;
    const w = (car.horiz ? car.len : 1) * CELL;
    const h = (car.horiz ? 1 : car.len) * CELL;
    const color = car.id === 0 ? 0xef4444 : CAR_COLORS[(car.id - 1) % CAR_COLORS.length]!;
    const lift = this.drag?.id === car.id ? 4 : 0;
    g.fillStyle(0x000000, 0.35).fillRoundedRect(x + 8, y + 12, w - 12, h - 12, 18);
    g.fillStyle(color, 1).fillRoundedRect(x + 6, y + 6 - lift, w - 12, h - 12, 18);
    g.fillStyle(0xffffff, 0.22).fillRoundedRect(x + 12, y + 10 - lift, w - 24, (h - 12) / 3, 12);
    // Windscreens show which way the car faces.
    g.fillStyle(0x0f172a, 0.7);
    if (car.horiz) {
      g.fillRoundedRect(x + w - 40, y + 20 - lift, 20, h - 40, 6);
      g.fillRoundedRect(x + 18, y + 24 - lift, 14, h - 48, 6);
    } else {
      g.fillRoundedRect(x + 20, y + 18 - lift, w - 40, 20, 6);
      g.fillRoundedRect(x + 24, y + h - 34 - lift, w - 48, 14, 6);
    }
  }
}
