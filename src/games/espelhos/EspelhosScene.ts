import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { ambient, banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { EspelhosSim, type EspelhosEvent } from './core';

const BOARD_TOP = 300;
const BOARD_SIZE = 600;

/** "Espelhos": tap the mirrors to bend the laser through every crystal. */
export class EspelhosScene extends MiniScene {
  private sim = new EspelhosSim();
  private g!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private cell = 100;
  private x0 = 30;
  private y0 = BOARD_TOP;
  private locked = false;
  /** Smoothly animated mirror angle per cell, in radians. */
  private angles = new Map<number, { cur: number; to: number }>();
  private litSince = new Map<number, number>();
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Espelhos, 'espelhos', [0x020617, 0x1e1b4b]);
  }

  create(): void {
    this.sim = new EspelhosSim();
    this.locked = false;
    this.frame();
    ambient(this, 0x67e8f9, 16);
    this.g = this.add.graphics().setDepth(4);
    this.info = addText(this, GAME_WIDTH / 2, 168, '', 30, {
      color: '#cffafe',
      stroke: '#020617',
      strokeThickness: 6,
    }).setDepth(50);
    this.timeText = addText(this, GAME_WIDTH / 2, 236, '', 36, {
      color: '#ffffff',
      stroke: '#020617',
      strokeThickness: 7,
    }).setDepth(50);
    this.layout();
    this.hintBox = hint(
      this,
      ['Toque nos espelhos para girá-los', 'Acenda todos os cristais com o laser!'],
      1110,
      7000,
    );

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.locked || this.ended) return;
      const x = Math.floor((p.x - this.x0) / this.cell);
      const y = Math.floor((p.y - this.y0) / this.cell);
      if (x < 0 || y < 0 || x >= this.sim.level.size || y >= this.sim.level.size) return;
      this.hintBox?.dismiss();
      this.handleAll(this.sim.tap(x, y));
    });
  }

  override update(time: number, deltaMs: number): void {
    if (this.ended) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    this.handleAll(this.sim.step(dt));
    this.setScore(this.sim.score);
    this.info.setText(
      `Fase ${this.sim.index} · ${this.sim.trace.hit.size}/${this.sim.level.crystals.length} cristais`,
    );
    const low = this.sim.time < 10;
    this.timeText.setText(`⏱ ${Math.ceil(this.sim.time)}s`).setColor(low ? '#fecaca' : '#ffffff');
    for (const a of this.angles.values()) a.cur += (a.to - a.cur) * Math.min(1, dt * 16);
    this.draw(time);
  }

  private layout(): void {
    const { size, grid } = this.sim.level;
    this.cell = Math.floor(BOARD_SIZE / size);
    this.x0 = (GAME_WIDTH - this.cell * size) / 2;
    this.y0 = BOARD_TOP + (BOARD_SIZE - this.cell * size) / 2;
    this.angles.clear();
    this.litSince.clear();
    grid.forEach((row, y) =>
      row.forEach((c, x) => {
        if (c === '') return;
        const a = this.angleOf(c);
        this.angles.set(y * size + x, { cur: a, to: a });
      }),
    );
  }

  private angleOf(c: '/' | '\\' | ''): number {
    return c === '/' ? -Math.PI / 4 : Math.PI / 4;
  }

  private handleAll(events: EspelhosEvent[]): void {
    const { sfx } = getServices(this);
    for (const ev of events) {
      switch (ev.type) {
        case 'rotate': {
          sfx.play('click');
          const a = this.angles.get(ev.y * this.sim.level.size + ev.x)!;
          // A quarter turn each tap; a line looks the same every half turn, so this always lines up.
          a.to = a.cur + Math.PI / 2;
          break;
        }
        case 'solved': {
          sfx.play('level');
          sfx.vibrate([20, 30, 20]);
          this.locked = true;
          flash(this, 0x67e8f9, 0.25);
          banner(this, 'ACENDEU TUDO!', '#67e8f9');
          this.pop(GAME_WIDTH / 2, 560, `+${ev.points}  ⏱+${ev.bonusTime}s`, '#ffffff', 44);
          for (const c of this.sim.level.crystals) {
            const p = this.center(c.x, c.y);
            shockwave(this, p.x, p.y, 0x67e8f9, 90);
            burst(this, p.x, p.y, 0xa5f3fc, 16, { speed: 320 });
          }
          this.time.delayedCall(1300, () => {
            if (this.ended) return;
            this.sim.nextLevel();
            this.layout();
            this.locked = false;
          });
          break;
        }
        case 'timeUp':
          this.finish('Acabou o tempo!', [`Fases: ${this.sim.levelsDone}`], {
            score: this.sim.score,
            details: { levels: this.sim.levelsDone },
          });
          break;
      }
    }
    // Chime for crystals that just lit up.
    const prevLit = new Set(this.litSince.keys());
    this.sim.trace.hit.forEach((i) => {
      if (prevLit.has(i)) return;
      this.litSince.set(i, this.time.now);
      if (events.some((e) => e.type === 'rotate')) {
        sfx.play('coin', this.litSince.size);
        const c = this.sim.level.crystals[i]!;
        const p = this.center(c.x, c.y);
        burst(this, p.x, p.y, 0x67e8f9, 8, { speed: 200, size: 5 });
      }
    });
    for (const i of [...this.litSince.keys()])
      if (!this.sim.trace.hit.has(i)) this.litSince.delete(i);
  }

  private center(x: number, y: number): { x: number; y: number } {
    return { x: this.x0 + (x + 0.5) * this.cell, y: this.y0 + (y + 0.5) * this.cell };
  }

  private draw(time: number): void {
    const { level, trace } = this.sim;
    const c = this.cell;
    const n = level.size;
    const g = this.g.clear();
    g.fillStyle(0x000000, 0.4).fillRoundedRect(
      this.x0 - 12,
      this.y0 - 12,
      c * n + 24,
      c * n + 24,
      24,
    );
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        g.fillStyle(0x0f172a).fillRoundedRect(
          this.x0 + x * c + 3,
          this.y0 + y * c + 3,
          c - 6,
          c - 6,
          10,
        );
        g.lineStyle(1, 0x334155, 0.6).strokeRoundedRect(
          this.x0 + x * c + 3,
          this.y0 + y * c + 3,
          c - 6,
          c - 6,
          10,
        );
      }
    }

    // Laser emitter.
    const e = this.center(0, level.entryRow);
    g.fillStyle(0xf43f5e).fillRoundedRect(this.x0 - 42, e.y - 22, 44, 44, 10);
    g.fillStyle(0xffffff, 0.8).fillCircle(this.x0 - 6, e.y, 8);

    // Beam: a wide soft stroke, then a bright core.
    const pts = trace.points.map((p) => this.center(p.x, p.y));
    const wobble = 1 + Math.sin(time / 90) * 0.12;
    for (const [w, a, col] of [
      [18 * wobble, 0.14, 0xf43f5e],
      [9, 0.35, 0xfb7185],
      [3.5, 1, 0xffffff],
    ] as const) {
      g.lineStyle(w, col, a);
      g.beginPath();
      pts.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
      g.strokePath();
    }

    // Crystals.
    level.crystals.forEach((cr, i) => {
      const p = this.center(cr.x, cr.y);
      const lit = trace.hit.has(i);
      const r = c * 0.28;
      const pulse = lit ? 1 + Math.sin(time / 140 + i) * 0.1 : 1;
      if (lit) g.fillStyle(0x67e8f9, 0.25).fillCircle(p.x, p.y, r * 2.1 * pulse);
      g.fillStyle(lit ? 0xa5f3fc : 0x475569).fillPoints(
        [
          new Phaser.Geom.Point(p.x, p.y - r * pulse),
          new Phaser.Geom.Point(p.x + r * 0.75 * pulse, p.y),
          new Phaser.Geom.Point(p.x, p.y + r * pulse),
          new Phaser.Geom.Point(p.x - r * 0.75 * pulse, p.y),
        ],
        true,
      );
      g.fillStyle(0xffffff, lit ? 0.9 : 0.25).fillTriangle(
        p.x,
        p.y - r * 0.8,
        p.x + r * 0.4,
        p.y - r * 0.1,
        p.x - r * 0.1,
        p.y - r * 0.1,
      );
    });

    // Mirrors.
    for (const [key, anim] of this.angles) {
      const a = anim.cur;
      const x = key % n;
      const y = Math.floor(key / n);
      const p = this.center(x, y);
      const len = c * 0.42;
      // The mirror lies along (cos a, sin a): -45° is '/', +45° is '\\'.
      const ax = p.x - Math.cos(a) * len;
      const ay = p.y - Math.sin(a) * len;
      const bx = p.x + Math.cos(a) * len;
      const by = p.y + Math.sin(a) * len;
      g.lineStyle(14, 0x38bdf8, 0.25).lineBetween(ax, ay, bx, by);
      g.lineStyle(8, 0xe0f2fe, 1).lineBetween(ax, ay, bx, by);
      g.lineStyle(3, 0xffffff, 0.9).lineBetween(ax, ay, bx, by);
      g.fillStyle(0x0ea5e9).fillCircle(p.x, p.y, 7);
    }
  }
}
