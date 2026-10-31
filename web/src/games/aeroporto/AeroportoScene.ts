import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  HELIPAD,
  LAND_R,
  RUNWAY,
  TowerSim,
  landingSpot,
  type Point,
  type TowerEvent,
} from './core';

/** "Torre de Controle": draw each aircraft's route to its landing spot — and keep them apart. */
export class AeroportoScene extends MiniScene {
  private sim = new TowerSim();
  private g!: Phaser.GameObjects.Graphics;
  private sprites = new Map<number, Phaser.GameObjects.Text>();
  private statusText!: Phaser.GameObjects.Text;
  private drawing: { id: number; points: Point[] } | null = null;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Aeroporto, 'aeroporto', [0x14532d, 0x15803d]);
  }

  create(): void {
    this.sim = new TowerSim();
    this.sprites = new Map();
    this.drawing = null;
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.statusText = addText(this, GAME_WIDTH / 2, 168, '', 28, {
      color: '#dcfce7',
      stroke: '#14532d',
      strokeThickness: 6,
    }).setDepth(50);
    this.hintBox = hint(
      this,
      ['Arraste do avião até a pista ✈️', 'e do helicóptero até o heliponto 🚁'],
      1150,
      5000,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.ended) return;
      const c = this.sim.pick(p.x, p.y);
      if (!c) return;
      this.hintBox?.dismiss();
      this.drawing = { id: c.id, points: [] };
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      const d = this.drawing;
      if (!d || !p.isDown) return;
      const last = d.points.at(-1);
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 14) d.points.push({ x: p.x, y: p.y });
      this.sim.route(d.id, d.points);
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => {
      const d = this.drawing;
      this.drawing = null;
      if (!d) return;
      const c = this.sim.crafts.find((k) => k.id === d.id);
      const end = d.points.at(-1);
      // A route ending on the right spot snaps onto it, so landing is reliable.
      if (c && end) {
        const spot = landingSpot(c.kind);
        if (Math.hypot(end.x - spot.x, end.y - spot.y) < LAND_R * 1.6) {
          this.sim.route(c.id, [...d.points, { x: spot.x, y: spot.y }]);
          getServices(this).sfx.play('click');
        }
      }
    });
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.handle(this.sim.step(Math.min(deltaMs, 40) / 1000));
    for (const c of this.sim.crafts) {
      let s = this.sprites.get(c.id);
      if (!s) {
        s = emojiText(
          this,
          c.x,
          c.y,
          c.kind === 'plane' ? '✈️' : '🚁',
          c.kind === 'plane' ? 58 : 52,
        ).setDepth(7);
        this.sprites.set(c.id, s);
      }
      s.setPosition(c.x, c.y);
      // The plane emoji points up-right (45°).
      if (c.kind === 'plane') s.setRotation(c.heading + Math.PI / 4);
    }
    this.setScore(this.sim.score);
    this.statusText.setText(`Pousos ${this.sim.landed} · No ar ${this.sim.crafts.length}`);
    this.draw();
  }

  private handle(events: TowerEvent[]): void {
    const { sfx } = getServices(this);
    const warned = new Set<number>();
    for (const e of events) {
      if (e.type === 'landed') {
        sfx.play('coin', Math.min(8, this.sim.landed % 9));
        burst(this, e.craft.x, e.craft.y, 0x86efac, 12, { speed: 200 });
        this.pop(e.craft.x, e.craft.y - 40, `+${e.points}`, '#fde047', 30);
        this.sprites.get(e.craft.id)?.destroy();
        this.sprites.delete(e.craft.id);
      } else if (e.type === 'near') {
        warned.add(e.a.id).add(e.b.id);
      } else {
        sfx.play('boom');
        sfx.vibrate([100, 50, 100]);
        flash(this, 0xf97316, 0.45, 360);
        this.cameras.main.shake(320, 0.018);
        burst(this, e.a.x, e.a.y, 0xf97316, 36, { speed: 420 });
        shockwave(this, e.a.x, e.a.y, 0xf97316, 160);
        this.finish(
          'Colisão no ar!',
          [`Pousos: ${this.sim.landed}`],
          { score: this.sim.score, details: { landed: this.sim.landed } },
          900,
        );
      }
    }
    for (const [id, s] of this.sprites) s.setTint(warned.has(id) ? 0xff6666 : 0xffffff);
  }

  private draw(): void {
    const g = this.g.clear();
    // Runway (threshold at RUNWAY, pointing north) and helipad.
    g.fillStyle(0x334155, 1).fillRect(RUNWAY.x - 40, RUNWAY.y - 380, 80, 400);
    g.lineStyle(4, 0xffffff, 0.8);
    for (let y = RUNWAY.y - 360; y < RUNWAY.y - 20; y += 50)
      g.lineBetween(RUNWAY.x, y, RUNWAY.x, y + 24);
    g.fillStyle(0xfacc15, 0.35 + Math.sin(this.time.now / 250) * 0.15).fillCircle(
      RUNWAY.x,
      RUNWAY.y,
      LAND_R,
    );
    g.fillStyle(0x334155, 1).fillCircle(HELIPAD.x, HELIPAD.y, LAND_R + 10);
    g.lineStyle(5, 0xffffff, 1).strokeCircle(HELIPAD.x, HELIPAD.y, LAND_R);
    g.fillStyle(0xffffff, 1)
      .fillRect(HELIPAD.x - 16, HELIPAD.y - 22, 8, 44)
      .fillRect(HELIPAD.x + 8, HELIPAD.y - 22, 8, 44)
      .fillRect(HELIPAD.x - 8, HELIPAD.y - 4, 16, 8);
    for (const c of this.sim.crafts) {
      if (!c.path.length) continue;
      g.lineStyle(4, c.kind === 'plane' ? 0xfde047 : 0x7dd3fc, 0.7);
      g.beginPath();
      g.moveTo(c.x, c.y);
      for (const p of c.path) g.lineTo(p.x, p.y);
      g.strokePath();
    }
  }
}
