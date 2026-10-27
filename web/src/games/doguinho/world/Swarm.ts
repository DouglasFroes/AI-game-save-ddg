import Phaser from 'phaser';
import { BEE_RADIUS, BodyLabel } from '../config';
import type { Vec } from '@/games/doguinho/core/geometry';
import type { BeeTuning, HiveDef } from '@/games/doguinho/data/types';
import { Tex } from '../art';

interface Bee {
  readonly sprite: Phaser.Physics.Matter.Image;
  readonly phase: number;
  readonly freq: number;
  /** Which way the bee prefers to go around obstacles. */
  readonly side: 1 | -1;
  blocked: boolean;
}

interface PendingSpawn {
  readonly hive: HiveDef;
  readonly at: number;
}

export interface SwarmOptions {
  readonly hives: readonly HiveDef[];
  readonly tuning: BeeTuning;
  readonly target: () => Vec;
  /** Bodies that block a bee's line of sight (the ink line). */
  readonly obstacles: () => MatterJS.BodyType[];
  readonly onKilled?: (at: Vec) => void;
}

/** Spawns bees from hives and steers them toward the dog, sliding around the barrier. */
export class Swarm {
  private readonly bees: Bee[] = [];
  private readonly queue: PendingSpawn[];
  private elapsed = 0;
  private stepCount = 0;
  private mode: 'chase' | 'flee' = 'chase';

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly opts: SwarmOptions,
  ) {
    this.queue = opts.hives
      .flatMap((hive, h) =>
        Array.from({ length: hive.bees }, (_, i) => ({
          hive,
          at: i * opts.tuning.interval + h * 90,
        })),
      )
      .sort((a, b) => a.at - b.at);
  }

  get alive(): number {
    return this.bees.length;
  }

  step(dtMs: number): void {
    this.elapsed += dtMs;
    this.stepCount++;
    while (this.queue.length && this.queue[0]!.at <= this.elapsed)
      this.spawn(this.queue.shift()!.hive);
    if (this.mode === 'flee') this.steerAway();
    else this.steerToTarget();
  }

  flee(): void {
    this.mode = 'flee';
    this.queue.length = 0;
    for (const bee of this.bees) bee.sprite.setCollidesWith(0);
  }

  /** Removes the bee owning this body (e.g. it hit spikes). */
  kill(body: MatterJS.BodyType): void {
    const i = this.bees.findIndex((b) => b.sprite.body === body);
    if (i < 0) return;
    const [bee] = this.bees.splice(i, 1);
    if (!bee) return;
    this.opts.onKilled?.({ x: bee.sprite.x, y: bee.sprite.y });
    bee.sprite.destroy();
  }

  private spawn(hive: HiveDef): void {
    const sprite = this.scene.matter.add.image(
      hive.x + Phaser.Math.Between(-12, 12),
      hive.y + 40,
      Tex.bee,
      undefined,
      {
        shape: { type: 'circle', radius: BEE_RADIUS },
        label: BodyLabel.bee,
        ignoreGravity: true,
        frictionAir: 0,
        friction: 0,
        restitution: 0.4,
        density: 0.0005,
      },
    );
    sprite.setFixedRotation().setDepth(6).setScale(0.2);
    this.scene.tweens.add({ targets: sprite, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.bees.push({
      sprite,
      phase: Math.random() * Math.PI * 2,
      freq: 0.004 + Math.random() * 0.004,
      side: Math.random() < 0.5 ? 1 : -1,
      blocked: false,
    });
  }

  private steerToTarget(): void {
    const { speed, agility } = this.opts.tuning;
    const target = this.opts.target();
    const obstacles = this.opts.obstacles();
    const M = this.scene.matter;

    this.bees.forEach((bee, i) => {
      const body = bee.sprite.body as MatterJS.BodyType;
      const pos = body.position;
      let dx = target.x - pos.x;
      let dy = target.y - pos.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;

      // Line-of-sight check is expensive: stagger it across steps.
      if ((this.stepCount + i) % 6 === 0) {
        bee.blocked = obstacles.length > 0 && M.query.ray(obstacles, pos, target, 8).length > 0;
      }

      const tx = -dy * bee.side;
      const ty = dx * bee.side;
      const wobble = Math.sin(this.elapsed * bee.freq + bee.phase) * 0.45;
      const slide = bee.blocked ? 0.9 : 0;
      let ax = dx + tx * (wobble + slide);
      let ay = dy + ty * (wobble + slide);
      const n = Math.hypot(ax, ay) || 1;
      ax = (ax / n) * speed;
      ay = (ay / n) * speed;

      const v = body.velocity;
      bee.sprite.setVelocity(v.x + (ax - v.x) * agility, v.y + (ay - v.y) * agility);
      bee.sprite.setFlipX(v.x < 0);
    });
  }

  private steerAway(): void {
    for (const bee of this.bees) {
      const v = (bee.sprite.body as MatterJS.BodyType).velocity;
      bee.sprite.setVelocity(v.x + (bee.side * 6 - v.x) * 0.05, v.y + (-9 - v.y) * 0.05);
      bee.sprite.setFlipX(bee.side < 0);
    }
  }
}
