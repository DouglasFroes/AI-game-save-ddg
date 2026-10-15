import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, MATTER_PHYSICS, SceneKeys } from '@/config';
import { getGame } from '@/games/registry';
import { submitScore } from '@/platform/ranking';
import {
  BodyLabel,
  DRAW_MIN_SPACING,
  HIVE_RADIUS,
  HUD_HEIGHT,
  LINE_THICKNESS,
  PHYSICS_STEP_MS,
} from '../config';
import { sampleSegment, type Vec } from '@/games/doguinho/core/geometry';
import { InkStroke } from '@/games/doguinho/core/inkStroke';
import { recordDeath, recordWin } from '@/games/doguinho/core/progress';
import { starsForInk, type Stars } from '@/games/doguinho/core/scoring';
import { getLevel, LEVELS } from '@/games/doguinho/data/levels';
import type { LevelDef } from '@/games/doguinho/data/types';
import { Tex } from '../art';
import { addBackground, addText, iconButton } from '@/platform/ui/widgets';
import { Dog } from '@/games/doguinho/world/Dog';
import { InkLine, strokePolyline } from '@/games/doguinho/world/InkLine';
import { Swarm } from '@/games/doguinho/world/Swarm';
import { buildTerrain } from '@/games/doguinho/world/Terrain';
import { getServices, type Services } from '@/services';
import type { ResultData } from './ResultScene';

export interface GameSceneData {
  levelId: number;
}

type Phase = 'draw' | 'attack' | 'won' | 'lost';
export type LossReason = 'bee' | 'spike' | 'fall';

const BAR_X = 150;
const BAR_W = 420;
const BAR_Y = 128;

/**
 * Flow: draw (physics frozen) → attack (survive the timer) → won/lost → Result overlay.
 */
export class GameScene extends Phaser.Scene {
  private services!: Services;
  private level!: LevelDef;
  private phase: Phase = 'draw';
  private stroke!: InkStroke;
  private strokeGfx!: Phaser.GameObjects.Graphics;
  private line: InkLine | null = null;
  private dog!: Dog;
  private swarm!: Swarm;
  private solids: MatterJS.BodyType[] = [];
  private drawing = false;
  private accumulator = 0;
  private timeLeft = 0;

  private inkBar!: Phaser.GameObjects.Graphics;
  private inkStars: Phaser.GameObjects.Image[] = [];
  private timerText!: Phaser.GameObjects.Text;
  private tipText!: Phaser.GameObjects.Text;
  private hand: Phaser.GameObjects.Text | null = null;
  private puff!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super({ key: SceneKeys.DogGame, physics: MATTER_PHYSICS });
  }

  init(data: GameSceneData): void {
    this.services = getServices(this);
    this.level = getLevel(data.levelId) ?? LEVELS[0]!;
    this.phase = 'draw';
    this.line = null;
    this.drawing = false;
    this.accumulator = 0;
    this.timeLeft = this.level.survive;
    this.stroke = new InkStroke(this.level.ink, DRAW_MIN_SPACING);
  }

  create(): void {
    addBackground(this);
    this.matter.world.setBounds(
      0,
      -800,
      GAME_WIDTH,
      GAME_HEIGHT + 800,
      200,
      true,
      true,
      false,
      false,
    );

    this.solids = buildTerrain(this, this.level.terrain);
    for (const hive of this.level.hives) {
      const img = this.add.image(hive.x, hive.y, Tex.hive).setDepth(2);
      this.tweens.add({
        targets: img,
        angle: { from: -3, to: 3 },
        duration: 1400 + Math.random() * 400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    this.dog = new Dog(this, this.level.dog.x, this.level.dog.y);
    this.swarm = new Swarm(this, {
      hives: this.level.hives,
      tuning: this.level.bees,
      target: () => this.dog.position,
      obstacles: () => (this.line ? [this.line.body] : []),
      onKilled: (at) => {
        this.puff.explode(10, at.x, at.y);
        this.services.sfx.play('pop');
      },
    });

    this.strokeGfx = this.add.graphics().setDepth(5);
    this.puff = this.add.particles(0, 0, Tex.dot, {
      speed: { min: 80, max: 260 },
      lifespan: 500,
      scale: { start: 0.8, end: 0 },
      tint: [0xffd23f, 0x2b2d42, 0xffffff],
      emitting: false,
    });
    this.puff.setDepth(8);

    this.buildHud();
    this.bindInput();
    this.bindCollisions();
    this.cameras.main.fadeIn(250, 29, 43, 83);

    if (import.meta.env.DEV) (window as unknown as { __scene?: GameScene }).__scene = this;
  }

  override update(_time: number, delta: number): void {
    if (this.phase !== 'draw') {
      this.accumulator = Math.min(this.accumulator + delta, 100);
      while (this.accumulator >= PHYSICS_STEP_MS) {
        this.swarm.step(PHYSICS_STEP_MS);
        // Two substeps keep fast bees from tunnelling through the thin ink line.
        this.matter.world.step(PHYSICS_STEP_MS / 2);
        this.matter.world.step(PHYSICS_STEP_MS / 2);
        this.accumulator -= PHYSICS_STEP_MS;
      }
    }

    this.dog.sync();
    this.line?.draw();

    if (this.phase === 'attack') {
      this.timeLeft = Math.max(0, this.timeLeft - delta / 1000);
      this.timerText.setText(this.timeLeft.toFixed(1));
      if (this.dog.position.y > GAME_HEIGHT + 60) this.lose('fall');
      else if (this.timeLeft <= 0) this.win();
    }
  }

  // ---------------------------------------------------------------- HUD

  private buildHud(): void {
    const hud = this.add.graphics().setDepth(20);
    hud.fillStyle(0xffffff, 0.92).fillRoundedRect(16, 14, GAME_WIDTH - 32, HUD_HEIGHT - 20, 30);

    iconButton(this, 72, 62, '‹', () => this.goTo(SceneKeys.DogLevels)).setDepth(21);
    iconButton(this, GAME_WIDTH - 72, 62, '↻', () => this.restart()).setDepth(21);
    addText(this, GAME_WIDTH / 2, 50, `Fase ${this.level.id}`, 26, { color: '#5b6b8c' }).setDepth(
      21,
    );
    addText(this, GAME_WIDTH / 2, 84, this.level.name, 34).setDepth(21);

    addText(this, BAR_X - 62, BAR_Y, 'Tinta', 24, { color: '#5b6b8c' }).setDepth(21);
    this.inkBar = this.add.graphics().setDepth(21);
    this.inkStars = [0, 1, 2].map((i) =>
      this.add
        .image(BAR_X + BAR_W + 34 + i * 32, BAR_Y, Tex.star)
        .setDisplaySize(30, 30)
        .setDepth(21),
    );
    this.renderInk();

    this.tipText = addText(this, GAME_WIDTH / 2, HUD_HEIGHT + 50, this.level.tip, 30, {
      color: COLORS.textLight,
      stroke: '#1d2b53',
      strokeThickness: 7,
      wrapWidth: 640,
    }).setDepth(20);

    this.timerText = addText(this, GAME_WIDTH / 2, HUD_HEIGHT + 70, '', 76, {
      color: COLORS.textLight,
      stroke: '#1d2b53',
      strokeThickness: 10,
    })
      .setDepth(20)
      .setVisible(false);

    // Animated finger hint above the dog until the player starts drawing.
    const { x, y } = this.level.dog;
    this.hand = addText(this, x + 90, y - 150, '👆', 64).setDepth(22);
    this.tweens.add({
      targets: this.hand,
      x: x - 90,
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private renderInk(): void {
    const remaining = 1 - this.stroke.ratio;
    const g = this.inkBar.clear();
    g.fillStyle(0xdfe5ee).fillRoundedRect(BAR_X, BAR_Y - 11, BAR_W, 22, 11);
    if (remaining > 0) {
      const color = remaining > 0.3 ? COLORS.secondary : COLORS.danger;
      g.fillStyle(color).fillRoundedRect(
        BAR_X,
        BAR_Y - 11,
        Math.max(22, BAR_W * remaining),
        22,
        11,
      );
    }
    // Marks where the star rating drops.
    g.fillStyle(0x1d2b53, 0.6);
    for (const t of [this.level.stars.three, this.level.stars.two]) {
      g.fillRect(BAR_X + BAR_W * (1 - t) - 2, BAR_Y - 15, 4, 30);
    }
    const stars = this.currentStars();
    this.inkStars.forEach((img, i) => img.setTexture(i < stars ? Tex.star : Tex.starEmpty));
  }

  private currentStars(): Stars {
    return starsForInk(this.stroke.ratio, this.level.stars);
  }

  // ---------------------------------------------------------------- Drawing

  private bindInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.phase !== 'draw' || p.y < HUD_HEIGHT) return;
      if (!this.stroke.start({ x: p.worldX, y: p.worldY }, this.isBlocked)) {
        this.flashBlocked(p.worldX, p.worldY);
        return;
      }
      this.drawing = true;
      this.hand?.destroy();
      this.hand = null;
      this.redrawStroke();
    });

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (!this.drawing) return;
      const result = this.stroke.extend({ x: p.worldX, y: p.worldY }, this.isBlocked);
      if (result === 'added' || result === 'exhausted') {
        this.services.sfx.play('draw');
        this.redrawStroke();
      }
      if (result === 'exhausted') this.finishStroke();
    });

    const end = () => this.drawing && this.finishStroke();
    this.input.on(Phaser.Input.Events.POINTER_UP, end);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, end);
    this.input.on(Phaser.Input.Events.GAME_OUT, end);
  }

  /** A segment is blocked if it leaves the play area or touches terrain, the dog or a hive. */
  private readonly isBlocked = (from: Vec, to: Vec): boolean => {
    const r = LINE_THICKNESS / 2 + 2;
    const d = r * 0.7;
    const offsets: Array<[number, number]> = [
      [0, 0],
      [r, 0],
      [-r, 0],
      [0, r],
      [0, -r],
      [d, d],
      [-d, d],
      [d, -d],
      [-d, -d],
    ];
    const blockers = [...this.solids, this.dog.body];
    for (const s of sampleSegment(from, to, 6)) {
      if (s.y < HUD_HEIGHT + r || s.x < r || s.x > GAME_WIDTH - r || s.y > GAME_HEIGHT - r)
        return true;
      if (this.level.hives.some((h) => Math.hypot(s.x - h.x, s.y - (h.y + 50)) < HIVE_RADIUS))
        return true;
      for (const [ox, oy] of offsets) {
        if (this.matter.query.point(blockers, { x: s.x + ox, y: s.y + oy }).length > 0) return true;
      }
    }
    return false;
  };

  private redrawStroke(): void {
    this.strokeGfx.clear();
    strokePolyline(this.strokeGfx, this.stroke.points, LINE_THICKNESS, COLORS.inkPreview);
    this.renderInk();
  }

  private flashBlocked(x: number, y: number): void {
    this.services.sfx.play('locked');
    const t = addText(this, x, y - 40, '✋', 48).setDepth(30);
    this.tweens.add({
      targets: t,
      alpha: 0,
      y: y - 90,
      duration: 500,
      onComplete: () => t.destroy(),
    });
  }

  private finishStroke(): void {
    this.drawing = false;
    if (!this.stroke.isDrawable) {
      this.stroke.clear();
      this.redrawStroke();
      return;
    }
    this.strokeGfx.clear();
    this.line = new InkLine(this, this.stroke.points, LINE_THICKNESS);
    this.startAttack();
  }

  // ---------------------------------------------------------------- Round flow

  private startAttack(): void {
    this.phase = 'attack';
    this.dog.setMood('scared');
    this.tipText.setVisible(false);
    this.timerText.setVisible(true).setText(this.timeLeft.toFixed(1));
    this.services.sfx.play('start');
  }

  private bindCollisions(): void {
    this.matter.world.on(
      Phaser.Physics.Matter.Events.COLLISION_START,
      (event: Phaser.Physics.Matter.Events.CollisionStartEvent) => {
        for (const pair of event.pairs) {
          const a = pair.bodyA.parent;
          const b = pair.bodyB.parent;
          this.onContact(a, b);
          this.onContact(b, a);
        }
      },
    );
  }

  private onContact(a: MatterJS.BodyType, b: MatterJS.BodyType): void {
    if (a.label === BodyLabel.bee && b.label === BodyLabel.spike) {
      this.swarm.kill(a);
      return;
    }
    if (this.phase !== 'attack' || a.label !== BodyLabel.dog) return;
    if (b.label === BodyLabel.bee) this.lose('bee');
    else if (b.label === BodyLabel.spike) this.lose('spike');
  }

  private win(): void {
    this.phase = 'won';
    this.swarm.flee();
    this.dog.setMood('happy');
    this.timerText.setText('Salvo!');
    this.services.sfx.play('win');
    this.services.sfx.vibrate(40);
    this.confetti();

    const stars = this.currentStars();
    const inkRatio = this.stroke.ratio;
    this.services.dogProgress.update((p) => recordWin(p, this.level.id, stars, inkRatio));
    const best = getGame('doguinho').personalBest(this.services);
    if (best) void submitScore(this.services, 'doguinho', best);
    this.showResult({ levelId: this.level.id, won: true, stars, inkRatio });
  }

  private lose(reason: LossReason): void {
    this.phase = 'lost';
    this.dog.setMood('hurt');
    this.timerText.setText('Ai!');
    this.cameras.main.shake(300, 0.012);
    this.cameras.main.flash(150, 255, 80, 80);
    this.services.sfx.play('hit');
    this.services.sfx.vibrate([60, 40, 60]);
    this.services.dogProgress.update(recordDeath);
    this.showResult({ levelId: this.level.id, won: false, reason });
  }

  private showResult(data: ResultData): void {
    this.time.delayedCall(data.won ? 1300 : 1000, () =>
      this.scene.launch(SceneKeys.DogResult, data),
    );
  }

  private confetti(): void {
    const { x, y } = this.dog.position;
    const emitter = this.add.particles(x, y - 40, Tex.dot, {
      speed: { min: 250, max: 650 },
      angle: { min: 220, max: 320 },
      gravityY: 900,
      lifespan: 1600,
      scale: { start: 0.9, end: 0.3 },
      rotate: { min: 0, max: 360 },
      tint: [0xff5d5d, 0xffd23f, 0x4da3ff, 0x5bd46f, 0xc77dff],
      emitting: false,
    });
    emitter.setDepth(9).explode(70);
  }

  private restart(): void {
    this.scene.stop(SceneKeys.DogResult);
    this.scene.restart({ levelId: this.level.id } satisfies GameSceneData);
  }

  private goTo(key: string): void {
    this.scene.stop(SceneKeys.DogResult);
    this.scene.start(key);
  }
}
