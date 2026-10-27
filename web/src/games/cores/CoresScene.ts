import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { Tex } from '@/platform/art/textures';
import type { GameOverData } from '@/platform/scenes/GameOverScene';
import { addText, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { PALETTE } from './art';
import { BALL_R, ColorSim, SWITCH_OFFSET, type ColorEvent } from './core';

const BASE = 1100;
const CX = GAME_WIDTH / 2;
const TAU = Math.PI * 2;

/** "Pula Cor": tap to hop through the part of each obstacle that has your color. */
export class CoresScene extends Phaser.Scene {
  private sim = new ColorSim();
  private g!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private ended = false;

  constructor() {
    super(SceneKeys.Cores);
  }

  init(): void {
    this.sim = new ColorSim();
    this.ended = false;
  }

  private sy(y: number): number {
    return BASE - (y - this.sim.camera);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x161a2e);
    this.g = this.add.graphics();
    iconButton(this, 60, 60, '‹', () => this.scene.start(SceneKeys.Hub)).setDepth(10);
    this.scoreText = addText(this, GAME_WIDTH / 2, 70, '0', 64, {
      color: COLORS.textLight,
    }).setDepth(10);
    this.hint = addText(this, GAME_WIDTH / 2, 880, 'Toque para pular\nPasse só pela sua cor', 34, {
      color: COLORS.textLight,
    }).setDepth(10);
    const hop = () => {
      if (this.ended) return;
      this.hint.setVisible(false);
      for (const e of this.sim.hop()) this.onEvent(e);
    };
    this.input.on(
      Phaser.Input.Events.POINTER_DOWN,
      (p: Phaser.Input.Pointer) => p.y > 130 && hop(),
    );
    this.input.keyboard?.on('keydown-SPACE', hop);
    this.input.keyboard?.on('keydown-UP', hop);
    if (import.meta.env.DEV) (window as unknown as { __cores?: CoresScene }).__cores = this;
  }

  private onEvent(e: ColorEvent): void {
    const { sfx } = getServices(this);
    switch (e.type) {
      case 'hop':
        sfx.play('click');
        break;
      case 'star':
        sfx.play('star', e.score % 5);
        this.tweens.add({ targets: this.scoreText, scale: { from: 1.25, to: 1 }, duration: 140 });
        break;
      case 'switch':
        sfx.play('pop', 2);
        break;
      case 'over': {
        this.ended = true;
        sfx.play('hit');
        sfx.vibrate(100);
        const p = this.add.particles(CX, this.sy(this.sim.y), Tex.dot, {
          speed: { min: 100, max: 420 },
          lifespan: 700,
          scale: { start: 1.2, end: 0 },
          tint: [...PALETTE],
          emitting: false,
        });
        p.explode(40);
        const data: GameOverData = {
          gameId: 'cores',
          title: e.reason === 'color' ? 'Cor errada!' : 'Caiu!',
          lines: [`Estrelas: ${this.sim.score}`],
          record: { score: this.sim.score, details: {} },
          parent: SceneKeys.Cores,
          retry: { scene: SceneKeys.Cores },
        };
        this.time.delayedCall(900, () => this.scene.launch(SceneKeys.GameOver, data));
        break;
      }
    }
  }

  override update(_t: number, deltaMs: number): void {
    if (!this.ended)
      for (const e of this.sim.step(Math.min(deltaMs / 1000, 1 / 30))) this.onEvent(e);
    const g = this.g.clear();
    for (const o of this.sim.obstacles) {
      const y = this.sy(o.y);
      if (y < -400 || y > 1700) continue;
      if (o.kind === 'ring') {
        // Same angle convention as the rules (screen angles, -π/2 = up): color i covers
        // [angle + i·τ/4, angle + (i+1)·τ/4).
        for (let i = 0; i < 4; i++) {
          const a0 = o.angle + i * (TAU / 4);
          g.lineStyle(o.thick, PALETTE[i]!)
            .beginPath()
            .arc(CX, y, o.r, a0, a0 + TAU / 4)
            .strokePath();
        }
      } else {
        const seg = GAME_WIDTH / 4;
        const off = ((o.angle % GAME_WIDTH) + GAME_WIDTH) % GAME_WIDTH;
        for (let k = -1; k < 5; k++) {
          const x = off + k * seg - GAME_WIDTH;
          for (let rep = 0; rep < 2; rep++) {
            const xx = x + rep * GAME_WIDTH;
            const color = PALETTE[((k % 4) + 4) % 4]!;
            g.fillStyle(color).fillRect(xx, y - o.thick / 2, seg, o.thick);
          }
        }
      }
      if (o.star) {
        const pts = [];
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 9 : 22;
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          pts.push({ x: CX + Math.cos(a) * r, y: y + Math.sin(a) * r });
        }
        g.fillStyle(0xffffff).fillPoints(pts, true);
      }
      if (o.switcher) {
        const sy = this.sy(o.y + SWITCH_OFFSET);
        for (let i = 0; i < 4; i++)
          g.fillStyle(PALETTE[i]!)
            .slice(CX, sy, 20, (i * TAU) / 4, ((i + 1) * TAU) / 4, false)
            .fillPath();
      }
    }
    const by = this.sy(this.sim.y);
    g.fillStyle(PALETTE[this.sim.color]!, 0.3).fillCircle(CX, by, BALL_R + 8);
    g.fillStyle(PALETTE[this.sim.color]!).fillCircle(CX, by, BALL_R);
    this.scoreText.setText(String(this.sim.score));
  }
}
