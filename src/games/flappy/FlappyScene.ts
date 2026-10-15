import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { Tex } from '@/platform/art/textures';
import type { GameOverData } from '@/platform/scenes/GameOverScene';
import { addText, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { BEE_X, FlappySim, GROUND_Y, PIPE_W, type FlappyEvent } from './core';

const MAX_DT = 1 / 30;
const STRIPE = 48;

export class FlappyScene extends Phaser.Scene {
  private sim = new FlappySim();
  private pipes!: Phaser.GameObjects.Graphics;
  private ground!: Phaser.GameObjects.Graphics;
  private bee!: Phaser.GameObjects.Image;
  private scoreText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private scroll = 0;
  private ended = false;

  constructor() {
    super(SceneKeys.FlappyBee);
  }

  init(): void {
    this.sim = new FlappySim();
    this.scroll = 0;
    this.ended = false;
  }

  create(): void {
    this.add.image(0, 0, Tex.bg).setOrigin(0);
    for (const [x, y, s] of [
      [140, 330, 0.9],
      [520, 520, 0.7],
      [320, 760, 0.5],
    ] as const) {
      const cloud = this.add.image(x, y, Tex.cloud).setScale(s).setAlpha(0.8);
      this.tweens.add({
        targets: cloud,
        x: -200,
        duration: 30000 * s,
        repeat: -1,
        onRepeat: () => cloud.setX(GAME_WIDTH + 200),
      });
    }

    this.pipes = this.add.graphics().setDepth(2);
    this.ground = this.add.graphics().setDepth(3);
    this.bee = this.add.image(BEE_X, this.sim.y, 'bee').setScale(1.7).setDepth(4);
    this.tweens.add({ targets: this.bee, scaleY: 1.5, duration: 90, yoyo: true, repeat: -1 });

    this.scoreText = addText(this, GAME_WIDTH / 2, 230, '0', 110, {
      color: COLORS.textLight,
      stroke: '#1d2b53',
      strokeThickness: 14,
    }).setDepth(10);
    this.hint = addText(this, GAME_WIDTH / 2, 820, 'Toque para voar!', 52, {
      color: '#ffd23f',
      stroke: '#1d2b53',
      strokeThickness: 10,
    }).setDepth(10);
    this.tweens.add({ targets: this.hint, scale: 1.08, duration: 500, yoyo: true, repeat: -1 });

    iconButton(this, 66, 66, '‹', () => this.scene.start(SceneKeys.Hub)).setDepth(20);

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y < 130 && p.x < 130) return;
      this.flap();
    });
    this.input.keyboard?.on('keydown-SPACE', () => this.flap());
    this.input.keyboard?.on('keydown-UP', () => this.flap());

    this.draw();
    if (import.meta.env.DEV) (window as unknown as { __flappy?: FlappyScene }).__flappy = this;
  }

  private flap(): void {
    if (this.sim.dead) return;
    if (!this.sim.started) this.hint.destroy();
    this.handle(this.sim.flap());
  }

  override update(_t: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, MAX_DT);
    this.handle(this.sim.step(dt));
    if (!this.sim.dead) this.scroll += 300 * dt;
    this.draw();
  }

  private handle(events: FlappyEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e === 'flap') sfx.play('click');
      if (e === 'score') {
        sfx.play('star', Math.min(4, this.sim.score % 5));
        this.scoreText.setText(String(this.sim.score));
        this.tweens.add({ targets: this.scoreText, scale: { from: 1.25, to: 1 }, duration: 160 });
      }
      if (e === 'hit') {
        sfx.play('hit');
        sfx.vibrate(80);
        this.cameras.main.shake(220, 0.01);
        this.cameras.main.flash(120, 255, 255, 255);
      }
      if (e === 'ground' && !this.ended) this.end();
    }
  }

  private draw(): void {
    const g = this.pipes.clear();
    for (const p of this.sim.pipes) {
      const left = p.x - PIPE_W / 2;
      const top = p.gapY - p.gapH / 2;
      const bottom = p.gapY + p.gapH / 2;
      this.pipe(g, left, 0, top, true);
      this.pipe(g, left, bottom, GROUND_Y - bottom, false);
    }

    const gr = this.ground.clear();
    gr.fillStyle(0xded895).fillRect(0, GROUND_Y, GAME_WIDTH, 400);
    gr.fillStyle(0x73bf2e).fillRect(0, GROUND_Y, GAME_WIDTH, 26);
    gr.fillStyle(0x5ea024);
    const offset = -(this.scroll % STRIPE);
    for (let x = offset; x < GAME_WIDTH; x += STRIPE)
      gr.fillTriangle(
        x,
        GROUND_Y + 26,
        x + STRIPE / 2,
        GROUND_Y + 26,
        x + STRIPE / 4,
        GROUND_Y + 40,
      );

    this.bee.setY(this.sim.y).setAngle(this.sim.started ? this.sim.angle : 0);
  }

  /** Green pipe with a lip on the end facing the gap. */
  private pipe(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    h: number,
    lipAtBottom: boolean,
  ): void {
    if (h <= 0) return;
    g.fillStyle(0x558c22).fillRect(x + 6, y, PIPE_W - 12, h);
    g.fillStyle(0x73bf2e).fillRect(x + 10, y, PIPE_W - 30, h);
    g.fillStyle(0x9ce659).fillRect(x + 18, y, 10, h);
    const lipY = lipAtBottom ? y + h - 44 : y;
    g.fillStyle(0x558c22).fillRoundedRect(x - 4, lipY, PIPE_W + 8, 44, 6);
    g.fillStyle(0x73bf2e).fillRoundedRect(x, lipY + 4, PIPE_W - 10, 36, 4);
    g.fillStyle(0x9ce659).fillRect(x + 12, lipY + 4, 10, 36);
  }

  private end(): void {
    this.ended = true;
    const score = this.sim.score;
    const medal =
      score >= 40 ? '🥇 Ouro' : score >= 20 ? '🥈 Prata' : score >= 10 ? '🥉 Bronze' : '';
    const data: GameOverData = {
      gameId: 'flappybee',
      title: 'A abelha caiu!',
      lines: medal ? [`Medalha: ${medal}`] : ['Passe 10 colmeias para ganhar medalha'],
      record: { score, details: {} },
      parent: SceneKeys.FlappyBee,
      retry: { scene: SceneKeys.FlappyBee },
    };
    this.time.delayedCall(600, () => this.scene.launch(SceneKeys.GameOver, data));
  }
}
