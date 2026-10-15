import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { kidKey } from '@/games/bomba/art';
import { favoriteKid } from '@/games/favoriteKid';
import { Tex } from '@/platform/art/textures';
import { formatNumber } from '@/platform/ranking';
import type { GameOverData } from '@/platform/scenes/GameOverScene';
import { addText, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { LenhaSim, VISIBLE, type LenhaEvent, type Side } from './core';

const SEG_H = 112;
const TRUNK_W = 130;
const BASE_Y = 1010; // bottom of segment 0
const CX = GAME_WIDTH / 2;
const BRANCH_LEN = 175;

/** "Lenhador": chop left/right, dodge the branches, beat the clock. */
export class LenhaScene extends Phaser.Scene {
  private sim = new LenhaSim();
  private kid = 0;
  private trunk!: Phaser.GameObjects.Graphics;
  private kidImg!: Phaser.GameObjects.Image;
  private axe!: Phaser.GameObjects.Graphics;
  private bar!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private hint?: Phaser.GameObjects.Text;
  private ended = false;

  constructor() {
    super(SceneKeys.Lenha);
  }

  init(): void {
    this.sim = new LenhaSim();
    this.kid = favoriteKid();
    this.ended = false;
  }

  create(): void {
    const g = this.add.graphics();
    g.fillGradientStyle(0x8fd3ff, 0x8fd3ff, 0xe0f4ff, 0xe0f4ff, 1).fillRect(0, 0, GAME_WIDTH, 1280);
    for (let i = 0; i < 9; i++) {
      const x = i * 90 + 20;
      g.fillStyle(0x5aa469, 0.5).fillTriangle(x - 60, 980, x, 620 + (i % 3) * 60, x + 60, 980);
    }
    g.fillStyle(0x6cc551).fillRect(0, BASE_Y, GAME_WIDTH, 1280 - BASE_Y);
    g.fillStyle(0x4e9f3a).fillRect(0, BASE_Y + 80, GAME_WIDTH, 1280);
    g.fillStyle(0x6d3f1a).fillEllipse(CX, BASE_Y + 6, TRUNK_W + 70, 34);

    this.trunk = this.add.graphics().setDepth(2);
    this.kidImg = this.add
      .image(0, BASE_Y + 40, kidKey(this.kid, 0))
      .setOrigin(0.5, 1)
      .setScale(1.25)
      .setDepth(4);
    this.axe = this.add.graphics().setDepth(5);
    this.bar = this.add.graphics().setDepth(10);
    iconButton(this, 60, 60, '‹', () => this.scene.start(SceneKeys.Hub)).setDepth(11);
    this.scoreText = addText(this, CX, 200, '0', 96, {
      color: COLORS.textLight,
      stroke: '#3d2c22',
      strokeThickness: 14,
    }).setDepth(10);
    this.hint = addText(
      this,
      CX,
      470,
      'Toque à esquerda ou à direita\npara cortar a árvore!\nCuidado com os galhos',
      34,
      {
        color: COLORS.textLight,
        stroke: '#3d2c22',
        strokeThickness: 8,
      },
    ).setDepth(10);

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y < 130) return;
      this.chop(p.x < CX ? 'left' : 'right');
    });
    this.input.keyboard?.on('keydown-LEFT', () => this.chop('left'));
    this.input.keyboard?.on('keydown-RIGHT', () => this.chop('right'));
    this.draw();
    if (import.meta.env.DEV) (window as unknown as { __lenha?: LenhaScene }).__lenha = this;
  }

  private chop(side: Side): void {
    if (this.ended) return;
    this.hint?.destroy();
    this.hint = undefined;
    const events = this.sim.chop(side);
    for (const e of events) this.onEvent(e);
    this.draw();
  }

  private onEvent(e: LenhaEvent): void {
    const { sfx } = getServices(this);
    if (e.type === 'chop') {
      sfx.play('pop', this.sim.score % 5);
      // The chopped log flies away from the kid.
      const dir = e.side === 'left' ? 1 : -1;
      const log = this.add
        .rectangle(CX, BASE_Y - SEG_H / 2, TRUNK_W, SEG_H, 0x8d5524)
        .setStrokeStyle(4, 0x5c3317)
        .setDepth(3);
      this.tweens.add({
        targets: log,
        x: CX + dir * 520,
        y: log.y - 120,
        angle: dir * 160,
        alpha: 0,
        duration: 420,
        onComplete: () => log.destroy(),
      });
      const chips = this.add.particles(CX - dir * 60, BASE_Y - 40, Tex.dot, {
        speed: { min: 120, max: 300 },
        lifespan: 320,
        scale: { start: 0.8, end: 0 },
        tint: 0xd9a066,
        emitting: false,
      });
      chips.setDepth(6).explode(8);
      this.time.delayedCall(400, () => chips.destroy());
      this.tweens.add({ targets: this.scoreText, scale: { from: 1.15, to: 1 }, duration: 120 });
      return;
    }
    this.gameOver(e.reason);
  }

  private draw(): void {
    const g = this.trunk.clear();
    for (let i = 0; i < VISIBLE + 1; i++) {
      const top = BASE_Y - (i + 1) * SEG_H;
      g.fillStyle(i % 2 ? 0x8d5524 : 0x96602b).fillRect(CX - TRUNK_W / 2, top, TRUNK_W, SEG_H + 1);
      g.fillStyle(0x6d3f1a)
        .fillRect(CX - 30, top + 10, 6, SEG_H - 20)
        .fillRect(CX + 22, top + 24, 5, SEG_H - 40);
      const b = this.sim.branches[i];
      if (!b) continue;
      const dir = b === 'left' ? -1 : 1;
      const x0 = CX + dir * (TRUNK_W / 2);
      const x1 = x0 + dir * BRANCH_LEN;
      g.fillStyle(0x7a4a1f).fillRect(Math.min(x0, x1), top + SEG_H / 2 - 13, BRANCH_LEN, 26);
      g.fillStyle(0x2ecc71)
        .fillCircle(x1, top + SEG_H / 2 - 12, 30)
        .fillCircle(x1 - dir * 34, top + SEG_H / 2 - 24, 22);
      g.fillStyle(0x27ae60).fillCircle(x1 + dir * 14, top + SEG_H / 2 + 4, 18);
    }
    const side = this.sim.side === 'left' ? -1 : 1;
    this.kidImg.setX(CX + side * 175).setFlipX(side < 0);
    // Axe swinging at the trunk.
    const a = this.axe.clear();
    const hx = CX + side * 120;
    const hy = BASE_Y - 70;
    a.fillStyle(0x6d4c41).fillRect(hx - (side > 0 ? 50 : 0), hy - 4, 50, 8);
    a.fillStyle(0xd9d9d9).fillTriangle(
      hx - side * 50,
      hy - 26,
      hx - side * 50,
      hy + 26,
      hx - side * 74,
      hy,
    );
    this.kidImg.setTexture(kidKey(this.kid, 1));
    this.time.delayedCall(90, () => this.kidImg.setTexture(kidKey(this.kid, 0)));
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    for (const e of this.sim.step(deltaMs / 1000)) this.onEvent(e);
    const g = this.bar.clear();
    const w = 420;
    g.fillStyle(0x3d2c22, 0.7).fillRoundedRect(CX - w / 2 - 6, 290, w + 12, 40, 20);
    const t = this.sim.time;
    g.fillStyle(t > 0.3 ? 0xffd23f : 0xff5d5d).fillRoundedRect(
      CX - w / 2,
      296,
      Math.max(28, w * t),
      28,
      14,
    );
    this.scoreText.setText(formatNumber(this.sim.score));
  }

  private gameOver(reason: 'branch' | 'time'): void {
    this.ended = true;
    const { sfx } = getServices(this);
    sfx.play('hit');
    sfx.vibrate([60, 30, 60]);
    this.cameras.main.shake(200, 0.01);
    this.tweens.add({
      targets: this.kidImg,
      angle: this.sim.side === 'left' ? -90 : 90,
      duration: 400,
      ease: 'Bounce.easeOut',
    });
    const data: GameOverData = {
      gameId: 'lenha',
      title: reason === 'time' ? 'Acabou o tempo!' : 'Levou uma galhada!',
      lines: [`Cortes: ${formatNumber(this.sim.score)}`],
      record: { score: this.sim.score, details: {} },
      parent: SceneKeys.Lenha,
      retry: { scene: SceneKeys.Lenha },
    };
    this.time.delayedCall(1000, () => this.scene.launch(SceneKeys.GameOver, data));
  }
}
