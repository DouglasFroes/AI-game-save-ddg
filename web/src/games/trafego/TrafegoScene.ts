import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { heartsLabel, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  BOX,
  CAR_LEN,
  LIVES,
  MAX_QUEUE,
  STOP,
  TrafficSim,
  vertical,
  type Car,
  type Dir,
  type TrafficEvent,
} from './core';

const CX = GAME_WIDTH / 2;
const CY = 700;
const HALF = BOX / 2;
const CAR_COLORS = [0xef4444, 0x3b82f6, 0xfacc15, 0x22c55e, 0xa855f7, 0xf97316, 0xf8fafc];

/** Front-centre of a car on screen, and the direction it faces. */
function carPose(c: Car): { x: number; y: number; dx: number; dy: number } {
  switch (c.dir) {
    case 'N':
      return { x: CX - 45, y: CY - HALF - STOP + c.pos, dx: 0, dy: 1 };
    case 'S':
      return { x: CX + 45, y: CY + HALF + STOP - c.pos, dx: 0, dy: -1 };
    case 'W':
      return { x: CX - HALF - STOP + c.pos, y: CY + 45, dx: 1, dy: 0 };
    default:
      return { x: CX + HALF + STOP - c.pos, y: CY - 45, dx: -1, dy: 0 };
  }
}

/** "Controle de Tráfego": tap each road to switch its light — no crashes, no jams. */
export class TrafegoScene extends MiniScene {
  private sim = new TrafficSim();
  private g!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Trafego, 'trafego', [0x14532d, 0x166534]);
  }

  create(): void {
    this.sim = new TrafficSim();
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.statusText = addText(this, GAME_WIDTH / 2, 168, '', 28, {
      color: '#dcfce7',
      stroke: '#14532d',
      strokeThickness: 6,
    }).setDepth(50);
    this.hintBox = hint(
      this,
      ['Toque numa rua para trocar o sinal', 'Não deixe carros se cruzarem!'],
      1180,
      5000,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.ended || p.y < 220) return;
      this.hintBox?.dismiss();
      const dx = p.x - CX;
      const dy = p.y - CY;
      const d: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N';
      this.sim.toggle(d);
      getServices(this).sfx.play('click');
    });
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.handle(this.sim.step(Math.min(deltaMs, 40) / 1000));
    this.setScore(this.sim.score);
    this.statusText.setText(`Carros ${this.sim.passed} · ${heartsLabel(this.sim.lives, LIVES)}`);
    this.draw();
  }

  private handle(events: TrafficEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e.type === 'passed') {
        if (this.sim.passed % 10 === 0) {
          sfx.play('coin');
          this.pop(CX, 300, `${this.sim.passed} carros!`, '#fde047', 36);
        }
      } else if (e.type === 'crash') {
        sfx.play('boom');
        sfx.vibrate([100, 50, 100]);
        flash(this, 0xf97316, 0.45, 360);
        this.cameras.main.shake(320, 0.018);
        const p = carPose(e.a);
        burst(this, p.x, p.y, 0xf97316, 36, { speed: 420 });
        shockwave(this, CX, CY, 0xf97316, 200);
      } else if (e.type === 'jam') {
        sfx.play('hit');
        sfx.vibrate(60);
        flash(this, 0xef4444, 0.25, 260);
        this.pop(CX, 300, 'Fila desistiu! 😤', '#fca5a5', 40);
      } else {
        this.finish(
          this.sim.lives <= 0 ? 'Trânsito parado!' : 'Batida!',
          [`Carros que passaram: ${this.sim.passed}`],
          { score: this.sim.score, details: { cars: this.sim.passed } },
          900,
        );
      }
    }
  }

  private draw(): void {
    const g = this.g.clear();
    // Roads.
    g.fillStyle(0x334155, 1)
      .fillRect(CX - HALF, 220, BOX, 1060)
      .fillRect(0, CY - HALF, GAME_WIDTH, BOX);
    g.fillStyle(0x475569, 1).fillRect(CX - HALF, CY - HALF, BOX, BOX);
    g.lineStyle(4, 0xfacc15, 0.7);
    for (let y = 230; y < CY - HALF; y += 50) g.lineBetween(CX, y, CX, y + 26);
    for (let y = CY + HALF + 10; y < 1280; y += 50) g.lineBetween(CX, y, CX, y + 26);
    for (let x = 0; x < CX - HALF; x += 50) g.lineBetween(x, CY, x + 26, CY);
    for (let x = CX + HALF + 10; x < GAME_WIDTH; x += 50) g.lineBetween(x, CY, x + 26, CY);
    // Lights at each stop line, plus a queue warning.
    const lights: Record<Dir, [number, number]> = {
      N: [CX - HALF - 34, CY - HALF - 34],
      S: [CX + HALF + 34, CY + HALF + 34],
      W: [CX - HALF - 34, CY + HALF + 34],
      E: [CX + HALF + 34, CY - HALF - 34],
    };
    for (const d of ['N', 'S', 'E', 'W'] as Dir[]) {
      const [x, y] = lights[d];
      const on = this.sim.green[d];
      g.fillStyle(0x0f172a, 1).fillRoundedRect(x - 26, y - 26, 52, 52, 12);
      g.fillStyle(on ? 0x22c55e : 0xef4444, 1).fillCircle(x, y, 18);
      const q = this.sim.queue(d);
      if (q >= MAX_QUEUE - 2)
        g.lineStyle(5, 0xfacc15, 0.6 + Math.sin(this.time.now / 90) * 0.4).strokeCircle(x, y, 32);
    }
    for (const c of this.sim.cars) {
      const p = carPose(c);
      const len = CAR_LEN;
      const w = 46;
      const color = CAR_COLORS[c.id % CAR_COLORS.length]!;
      const x = vertical(c.dir) ? p.x - w / 2 : p.dx > 0 ? p.x - len : p.x;
      const y = vertical(c.dir) ? (p.dy > 0 ? p.y - len : p.y) : p.y - w / 2;
      const bw = vertical(c.dir) ? w : len;
      const bh = vertical(c.dir) ? len : w;
      g.fillStyle(0x000000, 0.3).fillRoundedRect(x + 4, y + 6, bw, bh, 10);
      g.fillStyle(color, 1).fillRoundedRect(x, y, bw, bh, 10);
      g.fillStyle(0x0f172a, 0.6);
      // Windscreen at the front.
      if (p.dy > 0) g.fillRect(x + 8, y + len - 22, w - 16, 12);
      else if (p.dy < 0) g.fillRect(x + 8, y + 10, w - 16, 12);
      else if (p.dx > 0) g.fillRect(x + len - 22, y + 8, 12, w - 16);
      else g.fillRect(x + 10, y + 8, 12, w - 16);
    }
  }
}
