import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { BubbleSim, LIMIT_ROW, R, ROW0_Y, ROW_H, SHOOTER, type Trace, type Vec } from './core';

const PALETTE = [0xff4d6d, 0x4da3ff, 0x5bd46f, 0xffd23f, 0xb5179e];
const MAX_ANGLE = (78 * Math.PI) / 180;
const SPEED = 2000;

interface Fx {
  x: number;
  y: number;
  vy: number;
  color: number;
  life: number;
  fall: boolean;
}

/** "Atira Bolhas": drag to aim, release to shoot, match three or more. */
export class BolhasScene extends MiniScene {
  private sim = new BubbleSim();
  private g!: Phaser.GameObjects.Graphics;
  private aim: Trace | null = null;
  private flight: { trace: Trace; dist: number; lens: number[]; total: number } | null = null;
  private fx: Fx[] = [];
  private hint?: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Bolhas, 'bolhas', [0x10002b, 0x3c096c]);
  }

  create(): void {
    this.sim = new BubbleSim();
    this.aim = null;
    this.flight = null;
    this.fx = [];
    this.frame();
    this.g = this.add.graphics();
    this.hint = addText(this, GAME_WIDTH / 2, 960, 'Arraste para mirar e solte', 34, {
      color: '#ffffff',
      stroke: '#0b1430',
    });
    const aimAt = (p: Phaser.Input.Pointer) => {
      const dx = p.x - SHOOTER.x;
      const dy = SHOOTER.y - p.y;
      if (dy < 40) return;
      const a = Phaser.Math.Clamp(Math.atan2(dx, dy), -MAX_ANGLE, MAX_ANGLE);
      this.aim = this.sim.trace(a);
    };
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      // Tapping the "next" bubble swaps it with the loaded one.
      if (Math.hypot(p.x - 150, p.y - SHOOTER.y) < 60) {
        this.sim.swap();
        return;
      }
      if (p.y > 140) aimAt(p);
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (p.isDown && p.y > 140) aimAt(p);
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => this.shoot());
  }

  private shoot(): void {
    if (this.ended || this.flight || !this.aim) return;
    this.hint?.destroy();
    this.hint = undefined;
    const trace = this.aim;
    this.aim = null;
    const lens: number[] = [];
    let total = 0;
    for (let i = 1; i < trace.path.length; i++) {
      const l = Math.hypot(
        trace.path[i]!.x - trace.path[i - 1]!.x,
        trace.path[i]!.y - trace.path[i - 1]!.y,
      );
      lens.push(l);
      total += l;
    }
    this.flight = { trace, dist: 0, lens, total };
    getServices(this).sfx.play('click');
  }

  override update(_t: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;
    if (!this.ended && this.flight) {
      this.flight.dist += SPEED * dt;
      if (this.flight.dist >= this.flight.total) this.land(this.flight.trace);
    }
    for (const f of this.fx) {
      f.life -= dt;
      if (f.fall) {
        f.vy += 2200 * dt;
        f.y += f.vy * dt;
      }
    }
    this.fx = this.fx.filter((f) => f.life > 0);
    this.draw();
  }

  private land(trace: Trace): void {
    this.flight = null;
    const { sfx } = getServices(this);
    const res = this.sim.land(trace);
    const at = (r: number, c: number): Vec => this.sim.pos(r, c);
    // pos() already reflects a new top row; effects use the cells' old positions closely enough.
    for (const p of res.popped) {
      const v = at(p.r, p.c);
      this.fx.push({ x: v.x, y: v.y, vy: 0, color: res.color, life: 0.25, fall: false });
    }
    for (const d of res.dropped) {
      const v = at(d.r, d.c);
      this.fx.push({ x: v.x, y: v.y, vy: -200, color: res.color, life: 1, fall: true });
    }
    if (res.popped.length)
      sfx.play(res.dropped.length ? 'win' : 'pop', Math.min(res.popped.length, 8));
    else sfx.play('hit');
    if (res.dropped.length)
      this.pop(GAME_WIDTH / 2, 600, `+${res.dropped.length} caíram!`, '#ffe066');
    if (res.cleared) this.pop(GAME_WIDTH / 2, 500, 'TUDO LIMPO! +500', '#ffe066', 56);
    this.setScore(this.sim.score);
    if (this.sim.dead) {
      this.finish('As bolhas chegaram embaixo!', [`Estouradas: ${this.sim.popped}`], {
        score: this.sim.score,
        details: { popped: this.sim.popped },
      });
    }
  }

  private bubble(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    color: number,
    r = R - 2,
  ): void {
    g.fillStyle(color).fillCircle(x, y, r);
    g.fillStyle(0xffffff, 0.4).fillCircle(x - r * 0.3, y - r * 0.3, r * 0.3);
    g.lineStyle(3, 0x000000, 0.25).strokeCircle(x, y, r);
  }

  private draw(): void {
    const g = this.g.clear();
    g.fillStyle(0xffffff, 0.12).fillRect(0, ROW0_Y - R - 6, GAME_WIDTH, 4);
    const limitY = ROW0_Y + LIMIT_ROW * ROW_H - ROW_H / 2;
    g.fillStyle(0xff4d4d, 0.35).fillRect(0, limitY, GAME_WIDTH, 4);
    this.sim.rows.forEach((row, r) =>
      row.forEach((v, c) => {
        if (v < 0) return;
        const p = this.sim.pos(r, c);
        this.bubble(g, p.x, p.y, PALETTE[v]!);
      }),
    );
    for (const f of this.fx) {
      if (f.fall) this.bubble(g, f.x, f.y, f.color);
      else g.lineStyle(6, f.color, f.life * 4).strokeCircle(f.x, f.y, R + (0.25 - f.life) * 80);
    }
    if (this.aim) {
      const pts = this.aim.path;
      g.lineStyle(5, 0xffffff, 0.55);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!;
        const b = pts[i]!;
        const n = Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / 26);
        for (let k = 0; k < n; k += 2) {
          g.lineBetween(
            a.x + ((b.x - a.x) * k) / n,
            a.y + ((b.y - a.y) * k) / n,
            a.x + ((b.x - a.x) * (k + 1)) / n,
            a.y + ((b.y - a.y) * (k + 1)) / n,
          );
        }
      }
    }
    if (this.flight) {
      const { trace, dist, lens } = this.flight;
      let left = dist;
      for (let i = 0; i < lens.length; i++) {
        if (left <= lens[i]!) {
          const a = trace.path[i]!;
          const b = trace.path[i + 1]!;
          const k = lens[i]! === 0 ? 0 : left / lens[i]!;
          this.bubble(g, a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, PALETTE[this.sim.current]!);
          break;
        }
        left -= lens[i]!;
      }
    } else {
      this.bubble(g, SHOOTER.x, SHOOTER.y, PALETTE[this.sim.current]!);
    }
    this.bubble(g, 150, SHOOTER.y, PALETTE[this.sim.next]!, 26);
  }
}
