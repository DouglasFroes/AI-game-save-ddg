import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, MATTER_PHYSICS, SceneKeys } from '@/config';
import { Tex } from '@/platform/art/textures';
import { formatNumber } from '@/platform/ranking';
import type { GameOverData } from '@/platform/scenes/GameOverScene';
import { addText, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { BOX, clampDropX, DROP_Y, FRUITS, merge, nextFruitLevel, OverflowWatch } from './core';
import { fruitKey } from './art';

const STEP_MS = 1000 / 60;
const DROP_COOLDOWN = 450;
/** A new fruit gets this long before it can trigger the overflow check. */
const GRACE_MS = 1500;

interface Fruit {
  readonly img: Phaser.Physics.Matter.Image;
  readonly level: number;
  readonly born: number;
  merging: boolean;
}

export class FruitMergeScene extends Phaser.Scene {
  private fruits = new Map<MatterJS.BodyType, Fruit>();
  private pending: Array<[Fruit, Fruit]> = [];
  private current = 0;
  private next = 0;
  private aimX = GAME_WIDTH / 2;
  private canDrop = true;
  private ended = false;
  private score = 0;
  private biggest = 0;
  private acc = 0;
  private watch = new OverflowWatch();

  private preview!: Phaser.GameObjects.Image;
  private nextPreview!: Phaser.GameObjects.Image;
  private guide!: Phaser.GameObjects.Graphics;
  private danger!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super({ key: SceneKeys.FruitMerge, physics: MATTER_PHYSICS });
  }

  init(): void {
    this.fruits = new Map();
    this.pending = [];
    this.current = nextFruitLevel();
    this.next = nextFruitLevel();
    this.aimX = GAME_WIDTH / 2;
    this.canDrop = true;
    this.ended = false;
    this.score = 0;
    this.biggest = 0;
    this.acc = 0;
    this.watch = new OverflowWatch();
  }

  create(): void {
    const { best } = getServices(this);
    this.cameras.main.setBackgroundColor(0xffe8c2);

    const box = this.add.graphics();
    box
      .fillStyle(0xfff6e5)
      .fillRect(BOX.left, BOX.top - 60, BOX.right - BOX.left, BOX.bottom - BOX.top + 60);
    box
      .fillStyle(0xc68642)
      .fillRoundedRect(BOX.left - 22, BOX.top - 80, 22, BOX.bottom - BOX.top + 102, 8);
    box
      .fillStyle(0xc68642)
      .fillRoundedRect(BOX.right, BOX.top - 80, 22, BOX.bottom - BOX.top + 102, 8);
    box
      .fillStyle(0x8d5524)
      .fillRoundedRect(BOX.left - 22, BOX.bottom, BOX.right - BOX.left + 44, 26, 8);
    this.danger = this.add.graphics().setDepth(1);

    const wall = { isStatic: true, friction: 0.2, label: 'wall' };
    const height = BOX.bottom - BOX.top + 1200;
    this.matter.add.rectangle(BOX.left - 30, BOX.bottom - height / 2, 60, height, wall);
    this.matter.add.rectangle(BOX.right + 30, BOX.bottom - height / 2, 60, height, wall);
    this.matter.add.rectangle(
      GAME_WIDTH / 2,
      BOX.bottom + 30,
      BOX.right - BOX.left + 120,
      60,
      wall,
    );

    this.guide = this.add.graphics().setDepth(2);
    this.preview = this.add.image(this.aimX, DROP_Y, fruitKey(this.current)).setDepth(5);

    iconButton(this, 66, 66, '‹', () => this.scene.start(SceneKeys.Hub));
    this.scoreText = addText(this, 300, 70, '0', 64, {
      color: COLORS.textLight,
      stroke: '#8d5524',
      strokeThickness: 10,
    });
    addText(this, 300, 128, `👑 ${formatNumber(best.get('fruitmerge')?.score ?? 0)}`, 26, {
      color: '#8d5524',
    });
    addText(this, 610, 40, 'Próxima', 24, { color: '#8d5524' });
    this.nextPreview = this.add.image(610, 110, fruitKey(this.next));
    this.fitPreview();

    this.sparks = this.add.particles(0, 0, Tex.dot, {
      speed: { min: 120, max: 380 },
      lifespan: 500,
      scale: { start: 1, end: 0 },
      emitting: false,
    });
    this.sparks.setDepth(10);

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.aim(p));
    this.input.on(
      Phaser.Input.Events.POINTER_MOVE,
      (p: Phaser.Input.Pointer) => p.isDown && this.aim(p),
    );
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      if (p.downY < 160) return;
      this.drop();
    });

    const onPairs = (event: {
      pairs: Array<{ bodyA: MatterJS.BodyType; bodyB: MatterJS.BodyType }>;
    }) => {
      for (const pair of event.pairs) {
        const a = this.fruits.get(pair.bodyA);
        const b = this.fruits.get(pair.bodyB);
        if (!a || !b || a.merging || b.merging || a.level !== b.level) continue;
        a.merging = b.merging = true;
        this.pending.push([a, b]);
      }
    };
    this.matter.world.on(Phaser.Physics.Matter.Events.COLLISION_START, onPairs);
    this.matter.world.on(Phaser.Physics.Matter.Events.COLLISION_ACTIVE, onPairs);

    this.drawGuide();
    if (import.meta.env.DEV) (window as unknown as { __fruit?: FruitMergeScene }).__fruit = this;
  }

  private fitPreview(): void {
    const r = FRUITS[this.next]!.radius;
    this.nextPreview.setTexture(fruitKey(this.next)).setScale(Math.min(1, 44 / r));
  }

  private aim(p: Phaser.Input.Pointer): void {
    if (this.ended || p.downY < 160) return;
    this.aimX = clampDropX(p.x, this.current);
    this.preview.setX(this.aimX);
    this.drawGuide();
  }

  private drawGuide(): void {
    const g = this.guide.clear();
    if (this.ended || !this.canDrop) return;
    g.fillStyle(0xffffff, 0.7);
    for (let y = DROP_Y + 40; y < BOX.bottom; y += 34) g.fillRect(this.aimX - 2, y, 4, 18);
  }

  private drop(): void {
    if (this.ended || !this.canDrop) return;
    this.canDrop = false;
    getServices(this).sfx.play('click');
    this.spawn(this.current, this.aimX, DROP_Y);
    this.preview.setVisible(false);
    this.drawGuide();
    this.current = this.next;
    this.next = nextFruitLevel();
    this.time.delayedCall(DROP_COOLDOWN, () => {
      if (this.ended) return;
      this.canDrop = true;
      this.aimX = clampDropX(this.aimX, this.current);
      this.preview
        .setTexture(fruitKey(this.current))
        .setPosition(this.aimX, DROP_Y)
        .setVisible(true)
        .setScale(0);
      this.tweens.add({ targets: this.preview, scale: 1, duration: 150, ease: 'Back.easeOut' });
      this.fitPreview();
      this.drawGuide();
    });
  }

  private spawn(level: number, x: number, y: number, vx = 0, vy = 0): Fruit {
    const img = this.matter.add.image(x, y, fruitKey(level), undefined, {
      shape: { type: 'circle', radius: FRUITS[level]!.radius },
      restitution: 0.12,
      friction: 0.4,
      frictionStatic: 0.6,
      frictionAir: 0.004,
      density: 0.0012,
      label: 'fruit',
    });
    img.setVelocity(vx, vy).setDepth(3);
    const fruit: Fruit = { img, level, born: this.time.now, merging: false };
    this.fruits.set(img.body as MatterJS.BodyType, fruit);
    this.biggest = Math.max(this.biggest, level);
    return fruit;
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.acc = Math.min(this.acc + deltaMs, 100);
    while (this.acc >= STEP_MS) {
      this.matter.world.step(STEP_MS);
      this.acc -= STEP_MS;
      this.resolveMerges();
    }

    const now = this.time.now;
    let overflowing = false;
    for (const f of this.fruits.values()) {
      if (now - f.born > GRACE_MS && f.img.y - FRUITS[f.level]!.radius < BOX.top)
        overflowing = true;
    }
    const lost = this.watch.update(overflowing, deltaMs / 1000);
    const d = this.watch.danger;
    const blink = d > 0 ? 0.5 + 0.5 * Math.sin(now / 80) : 0;
    this.danger
      .clear()
      .fillStyle(0xff5d5d, 0.35 + 0.65 * Math.max(d, blink * d))
      .fillRect(BOX.left, BOX.top - 3, BOX.right - BOX.left, 6);
    if (lost) this.end();
  }

  private resolveMerges(): void {
    const pairs = this.pending;
    this.pending = [];
    for (const [a, b] of pairs) {
      if (!a.img.active || !b.img.active) continue;
      const ba = a.img.body as MatterJS.BodyType;
      const bb = b.img.body as MatterJS.BodyType;
      const x = (a.img.x + b.img.x) / 2;
      const y = (a.img.y + b.img.y) / 2;
      const vx = (ba.velocity.x + bb.velocity.x) / 2;
      const vy = (ba.velocity.y + bb.velocity.y) / 2;
      this.fruits.delete(ba);
      this.fruits.delete(bb);
      // A fruit can merge again mid pop-in tween; a live tween would scale its destroyed body.
      this.tweens.killTweensOf([a.img, b.img]);
      a.img.destroy();
      b.img.destroy();

      const result = merge(a.level);
      this.addScore(result.points);
      this.sparks.setParticleTint(FRUITS[a.level]!.color);
      this.sparks.explode(10 + a.level * 2, x, y);
      const { sfx } = getServices(this);
      sfx.play(result.level === null ? 'win' : 'pop');
      if (result.level === null) continue;

      const fruit = this.spawn(result.level, x, y, vx, vy);
      fruit.img.setScale(0.6);
      this.tweens.add({ targets: fruit.img, scale: 1, duration: 160, ease: 'Back.easeOut' });
      if (result.level >= 6) {
        sfx.vibrate(40);
        this.cameras.main.shake(150, 0.006);
        const t = addText(this, x, y - 60, `${FRUITS[result.level]!.name}!`, 40, {
          color: '#ffffff',
          stroke: '#8d5524',
        }).setDepth(12);
        this.tweens.add({
          targets: t,
          y: t.y - 70,
          alpha: 0,
          duration: 900,
          onComplete: () => t.destroy(),
        });
      }
    }
  }

  private addScore(points: number): void {
    this.score += points;
    this.scoreText.setText(formatNumber(this.score));
  }

  private end(): void {
    this.ended = true;
    this.preview.setVisible(false);
    this.guide.clear();
    const { sfx } = getServices(this);
    sfx.play('hit');
    for (const f of this.fruits.values()) f.img.setTint(0xb0b0b0);
    const data: GameOverData = {
      gameId: 'fruitmerge',
      title: 'A caixa transbordou!',
      lines: [`Maior fruta: ${FRUITS[this.biggest]!.name}`],
      record: { score: this.score, details: { biggest: this.biggest } },
      parent: SceneKeys.FruitMerge,
      retry: { scene: SceneKeys.FruitMerge },
    };
    this.time.delayedCall(1000, () => this.scene.launch(SceneKeys.GameOver, data));
  }
}
