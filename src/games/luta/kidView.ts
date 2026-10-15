import Phaser from 'phaser';
import { drawKidHead, OUTLINE, PANTS, type Kid, type Mood } from '@/games/bomba/art';
import type { Fighter } from './core';
import { poseFor } from './fighterView';

const rad = Phaser.Math.DegToRad;
/** Kids are drawn big-headed: body parts in "kid units" times this scale. */
const SCALE = 1.7;
const HEAD = 1.45;

/** A fighting kid from the "turma": same poses as the street fighters, cartoon-kid proportions. */
export class KidFighterView {
  readonly g: Phaser.GameObjects.Graphics;
  private readonly shadow: Phaser.GameObjects.Ellipse;

  constructor(
    scene: Phaser.Scene,
    private readonly kid: Kid,
    private readonly groundY: number,
  ) {
    this.shadow = scene.add.ellipse(0, groundY, 120, 22, 0x000000, 0.3).setDepth(4);
    this.g = scene.add.graphics().setDepth(5);
  }

  draw(f: Fighter, time: number, flash: boolean): void {
    const s = SCALE;
    const pose = poseFor(f, time);
    const g = this.g.clear();
    g.setPosition(f.x, this.groundY - f.y);
    g.setScale(f.facing, 1);
    this.shadow.setPosition(f.x, this.groundY).setScale(Math.max(0.5, 1 - f.y / 500), 1);

    if (f.state === 'ko') g.setRotation(-f.facing * rad(80) * Math.min(1, f.t / 0.5));
    else if (f.attack === 'dash' && f.state === 'attack') g.setRotation(0);
    else g.setRotation(0);

    const k = this.kid;
    const shirt = flash ? 0xffffff : k.shirt;
    const skin = flash ? 0xffffff : k.skin;
    const pants = flash ? 0xffffff : PANTS;

    const hip = new Phaser.Math.Vector2(0, -(46 - pose.crouch * 0.5) * s);
    const leanR = rad(pose.lean);
    const shoulder = new Phaser.Math.Vector2(
      hip.x + Math.sin(leanR) * 24 * s,
      hip.y - Math.cos(leanR) * 24 * s,
    );
    const head = new Phaser.Math.Vector2(
      shoulder.x + Math.sin(leanR) * 36 * s,
      shoulder.y - Math.cos(leanR) * 36 * s,
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
        mid.x + Math.sin(rad(a1 + a2)) * l2 * s,
        mid.y + Math.cos(rad(a1 + a2)) * l2 * s,
      );
      return [mid, end] as const;
    };
    const capsule = (a: Phaser.Math.Vector2, b: Phaser.Math.Vector2, w: number, color: number) => {
      g.lineStyle(w + 6, OUTLINE).lineBetween(a.x, a.y, b.x, b.y);
      g.fillStyle(OUTLINE)
        .fillCircle(a.x, a.y, (w + 6) / 2)
        .fillCircle(b.x, b.y, (w + 6) / 2);
      g.lineStyle(w, color).lineBetween(a.x, a.y, b.x, b.y);
      g.fillStyle(color)
        .fillCircle(a.x, a.y, w / 2)
        .fillCircle(b.x, b.y, w / 2);
    };
    const darker = (c: number, by: number) => Phaser.Display.Color.ValueToColor(c).darken(by).color;

    // Back leg and arm, body, front leg, head, then the front arm on top (it punches).
    const backHip = hip.clone().add({ x: -5 * s, y: 0 });
    const [bk, bf] = limb(backHip, pose.backLeg, 13, 13);
    capsule(backHip, bk, 11 * s, darker(pants, 10));
    capsule(bk, bf, 10 * s, darker(pants, 10));
    g.fillStyle(OUTLINE).fillEllipse(bf.x + 5 * s, bf.y + 2, 17 * s, 9 * s);

    const backShoulder = shoulder.clone().add({ x: -7 * s, y: 3 });
    const [be, bh] = limb(backShoulder, pose.backArm, 12, 11);
    capsule(backShoulder, be, 8 * s, darker(shirt, 15));
    capsule(be, bh, 7 * s, darker(skin, 12));
    g.fillStyle(OUTLINE).fillCircle(bh.x, bh.y, 6.5 * s);
    g.fillStyle(darker(skin, 12)).fillCircle(bh.x, bh.y, 4.8 * s);

    capsule(hip, shoulder, 26 * s, shirt);

    const frontHip = hip.clone().add({ x: 5 * s, y: 0 });
    const [fk, ff] = limb(frontHip, pose.frontLeg, 13, 13);
    capsule(frontHip, fk, 11 * s, pants);
    capsule(fk, ff, 10 * s, pants);
    g.fillStyle(OUTLINE).fillEllipse(ff.x + 5 * s, ff.y + 2, 17 * s, 9 * s);

    const mood: Mood = f.state === 'ko' ? 'ko' : f.state === 'hit' ? 'hurt' : 'happy';
    g.save();
    g.translateCanvas(head.x, head.y);
    g.rotateCanvas(leanR * 0.6);
    g.scaleCanvas(HEAD, HEAD);
    drawKidHead(g, flash ? { ...k, skin: 0xffffff, hairColor: 0xffffff } : k, 0, 0, mood);
    g.restore();

    const frontShoulder = shoulder.clone().add({ x: 7 * s, y: 3 });
    const [fe, fh] = limb(frontShoulder, pose.frontArm, 12, 11);
    capsule(frontShoulder, fe, 8 * s, shirt);
    capsule(fe, fh, 7 * s, skin);
    g.fillStyle(OUTLINE).fillCircle(fh.x, fh.y, 7 * s);
    g.fillStyle(skin).fillCircle(fh.x, fh.y, 5.2 * s);

    if (pose.glow > 0) {
      g.fillStyle(0xffffff, 0.35 * pose.glow).fillCircle(fh.x, fh.y, 30 * pose.glow);
      g.fillStyle(0xffffff, 0.85 * pose.glow).fillCircle(fh.x, fh.y, 11 * pose.glow);
    }
    // Frozen: a translucent block of ice around the body.
    if (f.frozen > 0) {
      g.fillStyle(0x9be7ff, 0.45).fillRoundedRect(-62, head.y - 70, 124, -head.y + 74, 16);
      g.lineStyle(4, 0xe0f7ff, 0.9).strokeRoundedRect(-62, head.y - 70, 124, -head.y + 74, 16);
    }
    // Furacão: the spinning rush is shown as a whirl around the kid.
    if (f.state === 'attack' && f.attack === 'dash') {
      const spin = time * 30;
      for (let i = 0; i < 3; i++) {
        const a = spin + (i * Math.PI * 2) / 3;
        g.lineStyle(6, 0xffffff, 0.7)
          .beginPath()
          .arc(0, hip.y - 20, 70, a, a + 1.4)
          .strokePath();
      }
    }
  }

  destroy(): void {
    this.g.destroy();
    this.shadow.destroy();
  }
}
