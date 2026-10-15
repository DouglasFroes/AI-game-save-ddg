import Phaser from 'phaser';
import { ATTACKS, type Fighter } from './core';
import type { FighterLook } from './ladder';

/** Angles in degrees: 0 points straight down, positive swings forward (towards `facing`). */
interface Pose {
  lean: number;
  crouch: number;
  frontArm: [number, number];
  backArm: [number, number];
  frontLeg: [number, number];
  backLeg: [number, number];
  /** Extra hand glow (special move). */
  glow: number;
}

/** Drawing scale over the simulation's body size, so fighters read well on a phone. */
const DRAW_SCALE = 1.3;
const rad = Phaser.Math.DegToRad;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Wind-up → strike → recovery curve (0 → 1 → 0) for the current attack. */
function strike(f: Fighter): number {
  const a = ATTACKS[f.attack!];
  if (f.t < a.startup) return clamp01(f.t / a.startup) * 0.35;
  if (f.t < a.startup + a.active) return 1;
  return 1 - clamp01((f.t - a.startup - a.active) / Math.max(0.01, a.recovery));
}

function poseFor(f: Fighter, time: number): Pose {
  const bob = Math.sin(time * 6) * 3;
  const guard: Pose = {
    lean: 4,
    crouch: 8 + bob,
    frontArm: [55, 150],
    backArm: [35, 140],
    frontLeg: [22, 0],
    backLeg: [-24, -4],
    glow: 0,
  };
  switch (f.state) {
    case 'walk': {
      const s = Math.sin(f.t * 12) * 22;
      return { ...guard, crouch: 6, frontLeg: [10 + s, -5], backLeg: [-12 - s, -5] };
    }
    case 'jump':
      return { ...guard, crouch: 0, frontLeg: [70, -90], backLeg: [30, -100], frontArm: [80, 120] };
    case 'block':
      return { ...guard, lean: -6, crouch: 16, frontArm: [100, 165], backArm: [85, 170] };
    case 'hit': {
      const k = 1 - clamp01(f.t / Math.max(0.05, f.stun));
      return {
        ...guard,
        lean: -22 * k - 4,
        crouch: 10,
        frontArm: [-20, 30],
        backArm: [-40, 20],
        frontLeg: [18, 5],
        backLeg: [-30, 0],
      };
    }
    case 'ko':
      return {
        ...guard,
        lean: -10,
        crouch: 0,
        frontArm: [-60, 0],
        backArm: [-80, 0],
        frontLeg: [10, 0],
        backLeg: [-10, 0],
      };
    case 'attack': {
      const k = strike(f);
      switch (f.attack) {
        case 'punch':
          return { ...guard, lean: lerp(4, 14, k), frontArm: [lerp(55, 90, k), lerp(150, 0, k)] };
        case 'kick':
          return {
            ...guard,
            lean: lerp(4, -18, k),
            frontLeg: [lerp(22, 95, k), lerp(0, 0, k)],
            backLeg: [-14, -4],
            frontArm: [30, 120],
          };
        case 'airKick':
          return {
            ...guard,
            crouch: 0,
            lean: -10,
            frontLeg: [lerp(70, 115, k), lerp(-90, 0, k)],
            backLeg: [20, -110],
            frontArm: [100, 90],
          };
        case 'special':
          return {
            ...guard,
            lean: lerp(-8, 12, k),
            frontArm: [lerp(20, 90, k), lerp(90, 0, k)],
            backArm: [lerp(10, 86, k), lerp(90, 0, k)],
            glow: f.t < ATTACKS.special.startup ? f.t / ATTACKS.special.startup : 1 - k * 0.5,
          };
      }
    }
  }
  return guard;
}

/** Draws a fighter from capsules and circles; one Graphics per fighter, redrawn every frame. */
export class FighterView {
  readonly g: Phaser.GameObjects.Graphics;
  private readonly shadow: Phaser.GameObjects.Ellipse;

  constructor(
    scene: Phaser.Scene,
    private readonly look: FighterLook,
    private readonly groundY: number,
  ) {
    this.shadow = scene.add
      .ellipse(0, groundY, 110 * look.size * DRAW_SCALE, 22, 0x000000, 0.3)
      .setDepth(4);
    this.g = scene.add.graphics().setDepth(5);
  }

  draw(f: Fighter, time: number, flash: boolean): void {
    const s = this.look.size * DRAW_SCALE;
    const pose = poseFor(f, time);
    const g = this.g.clear();
    g.setPosition(f.x, this.groundY - f.y);
    g.setScale(f.facing, 1);
    this.shadow.setPosition(f.x, this.groundY).setScale(Math.max(0.5, 1 - f.y / 500), 1);

    if (f.state === 'ko') {
      // Falls backwards over half a second.
      const k = clamp01(f.t / 0.5);
      g.setRotation(-f.facing * rad(80) * k);
    } else g.setRotation(0);

    const L = this.look;
    const outline = 0x14142b;
    const skin = flash ? 0xffffff : L.skin;
    const outfit = flash ? 0xffffff : L.outfit;

    const hip = new Phaser.Math.Vector2(0, -(92 - pose.crouch) * s);
    const leanR = rad(pose.lean);
    const torsoLen = 62 * s;
    const shoulder = new Phaser.Math.Vector2(
      hip.x + Math.sin(leanR) * torsoLen,
      hip.y - Math.cos(leanR) * torsoLen,
    );
    const head = new Phaser.Math.Vector2(
      shoulder.x + Math.sin(leanR) * 30 * s,
      shoulder.y - Math.cos(leanR) * 30 * s,
    );

    const limb = (
      from: Phaser.Math.Vector2,
      [a1, a2]: [number, number],
      l1: number,
      l2: number,
    ) => {
      const mid = new Phaser.Math.Vector2(
        from.x + Math.sin(rad(a1)) * l1 * s,
        from.y + Math.cos(rad(a1)) * l1 * s,
      );
      const end = new Phaser.Math.Vector2(
        mid.x + Math.sin(rad(a1 + a2 - 0)) * l2 * s,
        mid.y + Math.cos(rad(a1 + a2)) * l2 * s,
      );
      return [mid, end] as const;
    };
    const capsule = (a: Phaser.Math.Vector2, b: Phaser.Math.Vector2, w: number, color: number) => {
      g.lineStyle(w + 6, outline).lineBetween(a.x, a.y, b.x, b.y);
      g.fillStyle(outline)
        .fillCircle(a.x, a.y, (w + 6) / 2)
        .fillCircle(b.x, b.y, (w + 6) / 2);
      g.lineStyle(w, color).lineBetween(a.x, a.y, b.x, b.y);
      g.fillStyle(color)
        .fillCircle(a.x, a.y, w / 2)
        .fillCircle(b.x, b.y, w / 2);
    };

    // Back limbs first (darker), then body, then front limbs.
    const backHip = hip.clone().add({ x: -6 * s, y: 0 });
    const [bk, bf] = limb(backHip, pose.backLeg, 46, 46);
    capsule(backHip, bk, 22 * s, Phaser.Display.Color.ValueToColor(outfit).darken(18).color);
    capsule(bk, bf, 18 * s, Phaser.Display.Color.ValueToColor(outfit).darken(18).color);
    g.fillStyle(outline).fillEllipse(bf.x + 8 * s, bf.y + 2, 30 * s, 14 * s);

    const backShoulder = shoulder.clone().add({ x: -8 * s, y: 4 });
    const [be, bh] = limb(backShoulder, pose.backArm, 32, 30);
    capsule(backShoulder, be, 15 * s, Phaser.Display.Color.ValueToColor(skin).darken(12).color);
    capsule(be, bh, 13 * s, Phaser.Display.Color.ValueToColor(skin).darken(12).color);
    g.fillStyle(outline).fillCircle(bh.x, bh.y, 12 * s);
    g.fillStyle(L.trim).fillCircle(bh.x, bh.y, 9 * s);

    capsule(hip, shoulder, 40 * s, outfit);
    g.lineStyle(8 * s, L.trim).lineBetween(hip.x - 18 * s, hip.y - 4, hip.x + 18 * s, hip.y - 4);

    const frontHip = hip.clone().add({ x: 6 * s, y: 0 });
    const [fk, ff] = limb(frontHip, pose.frontLeg, 46, 46);
    capsule(frontHip, fk, 22 * s, outfit);
    capsule(fk, ff, 18 * s, outfit);
    g.fillStyle(outline).fillEllipse(ff.x + 8 * s, ff.y + 2, 30 * s, 14 * s);

    // Head: skin, hair, headband.
    g.fillStyle(outline).fillCircle(head.x, head.y, 25 * s);
    g.fillStyle(skin).fillCircle(head.x, head.y, 22 * s);
    g.fillStyle(L.hair).fillEllipse(head.x - 4 * s, head.y - 12 * s, 40 * s, 20 * s);
    g.fillStyle(L.trim).fillRect(head.x - 22 * s, head.y - 8 * s, 44 * s, 7 * s);
    g.fillStyle(outline).fillCircle(head.x + 11 * s, head.y + 1 * s, 3.2 * s);

    const frontShoulder = shoulder.clone().add({ x: 8 * s, y: 4 });
    const [fe, fh] = limb(frontShoulder, pose.frontArm, 32, 30);
    capsule(frontShoulder, fe, 15 * s, skin);
    capsule(fe, fh, 13 * s, skin);
    g.fillStyle(outline).fillCircle(fh.x, fh.y, 13 * s);
    g.fillStyle(L.trim).fillCircle(fh.x, fh.y, 10 * s);

    if (pose.glow > 0) {
      g.fillStyle(0x7df9ff, 0.35 * pose.glow).fillCircle(fh.x, fh.y, 34 * pose.glow);
      g.fillStyle(0xffffff, 0.8 * pose.glow).fillCircle(fh.x, fh.y, 14 * pose.glow);
    }
  }

  destroy(): void {
    this.g.destroy();
    this.shadow.destroy();
  }
}
