import type Phaser from 'phaser';
import { COLORS, GAME_HEIGHT } from '@/config';
import { BodyLabel } from '../config';
import { distance, rotate, type Vec } from '@/games/doguinho/core/geometry';

/** Draws a polyline with round joints. */
export function strokePolyline(
  g: Phaser.GameObjects.Graphics,
  pts: readonly Vec[],
  thickness: number,
  color: number,
  alpha = 1,
): void {
  if (pts.length === 0) return;
  g.fillStyle(color, alpha);
  for (const p of pts) g.fillCircle(p.x, p.y, thickness / 2);
  if (pts.length < 2) return;
  g.lineStyle(thickness, color, alpha);
  g.beginPath();
  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
  g.strokePath();
}

/** The committed drawing: one compound Matter body made of capsule-like segments. */
export class InkLine {
  readonly body: MatterJS.BodyType;
  private readonly local: Vec[];
  private readonly gfx: Phaser.GameObjects.Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    points: readonly Vec[],
    private readonly thickness: number,
  ) {
    const M = scene.matter;
    const parts: MatterJS.BodyType[] = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      const len = distance(a, b);
      if (len < 1) continue;
      parts.push(
        M.bodies.rectangle((a.x + b.x) / 2, (a.y + b.y) / 2, len + thickness * 0.6, thickness, {
          angle: Math.atan2(b.y - a.y, b.x - a.x),
          chamfer: { radius: thickness / 2 - 1 },
          density: 0.0022,
        }),
      );
    }
    this.body = M.body.create({
      parts,
      label: BodyLabel.ink,
      friction: 0.8,
      frictionStatic: 1,
      frictionAir: 0.012,
      restitution: 0,
    });
    scene.matter.world.add(this.body);

    const c = this.body.position;
    this.local = points.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
    this.gfx = scene.add.graphics().setDepth(5);
    this.draw();
  }

  get isGone(): boolean {
    return this.body.position.y > GAME_HEIGHT + 400;
  }

  draw(): void {
    const { position, angle } = this.body;
    const world = this.local.map((p) => {
      const r = rotate(p, angle);
      return { x: r.x + position.x, y: r.y + position.y };
    });
    this.gfx.clear();
    strokePolyline(this.gfx, world, this.thickness, COLORS.ink);
  }

  destroy(): void {
    this.scene.matter.world.remove(this.body);
    this.gfx.destroy();
  }
}
