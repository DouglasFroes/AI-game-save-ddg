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
  side: 1 | -1;
  /** Spread of the attack: far away, each bee aims a little off the dog so the swarm surrounds it. */
  readonly flank: number;
  /** Direction (rad) picked by the last look-around; reused between the staggered checks. */
  heading: number;
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
  private readonly tuning: BeeTuning;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly opts: SwarmOptions,
  ) {
    // Bees are a bit quicker to react and leave the hive sooner than the level data says.
    this.tuning = {
      speed: opts.tuning.speed * 1.12,
      agility: Math.max(0.14, opts.tuning.agility * 1.4),
      interval: opts.tuning.interval * 0.8,
    };
    this.queue = opts.hives
      .flatMap((hive, h) =>
        Array.from({ length: hive.bees }, (_, i) => ({
          hive,
          at: i * this.tuning.interval + h * 90,
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
      flank: (Math.random() - 0.5) * 1.3,
      heading: 0,
      blocked: false,
    });
  }

  /** The direction toward `target` that is not blocked by the ink: straight, or the way around it. */
  private lookAround(bee: Bee, pos: Vec, target: Vec, direct: number): number {
    const obstacles = this.opts.obstacles();
    if (!obstacles.length) {
      bee.blocked = false;
      return direct;
    }
    const M = this.scene.matter;
    bee.blocked = M.query.ray(obstacles, pos, target, 8).length > 0;
    if (!bee.blocked) return direct;
    // Look for the smallest turn that leaves open air ahead, trying the bee's current side first.
    // Sticking to a side keeps it from jittering back and forth along the wall.
    for (const turn of [0.5, 1, 1.5, 2, 2.6]) {
      for (const sign of [bee.side, -bee.side as 1 | -1]) {
        const a = direct + sign * turn;
        const end = { x: pos.x + Math.cos(a) * 190, y: pos.y + Math.sin(a) * 190 };
        if (M.query.ray(obstacles, pos, end, 12).length === 0) {
          bee.side = sign;
          return a;
        }
      }
    }
    return direct + bee.side * Math.PI * 0.6;
  }

  private steerToTarget(): void {
    const { speed, agility } = this.tuning;
    const target = this.opts.target();

    this.bees.forEach((bee, i) => {
      const body = bee.sprite.body as MatterJS.BodyType;
      const pos = body.position;
      const dist = Math.hypot(target.x - pos.x, target.y - pos.y) || 1;
      let direct = Math.atan2(target.y - pos.y, target.x - pos.x);
      // Far from the dog, come in from an angle; close in, go straight for it.
      direct += bee.flank * Math.min(1, Math.max(0, (dist - 140) / 320));

      // Ray casts are costly: look around only every few steps, staggered across the bees.
      if ((this.stepCount + i) % 5 === 0) bee.heading = this.lookAround(bee, pos, target, direct);
      else if (!bee.blocked) bee.heading = direct;

      const wobble = bee.blocked ? 0 : Math.sin(this.elapsed * bee.freq + bee.phase) * 0.22;
      const a = bee.heading + wobble;
      const ax = Math.cos(a) * speed;
      const ay = Math.sin(a) * speed;

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
