import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { Tex } from '@/platform/art/textures';
import { formatNumber } from '@/platform/ranking';
import type { GameOverData } from '@/platform/scenes/GameOverScene';
import { addText, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { BALL_R, BrickSim, brickSize, PADDLE_Y, TOP, type BrickEvent, type ItemKind } from './core';

const HP_COLORS = [0x4cc9f0, 0xffd23f, 0xff5d8f];
const ITEM: Record<ItemKind, { label: string; color: number }> = {
  largo: { label: '↔', color: 0x5bd46f },
  multi: { label: '×3', color: 0xff9a2e },
  lento: { label: '◷', color: 0x4cc9f0 },
};

/** "Quebra-Tijolos": drag to move the paddle, tap to launch. */
export class TijolosScene extends Phaser.Scene {
  private sim = new BrickSim();
  private g!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private hud!: {
    score: Phaser.GameObjects.Text;
    info: Phaser.GameObjects.Text;
    hint: Phaser.GameObjects.Text;
  };
  private ended = false;

  constructor() {
    super(SceneKeys.Tijolos);
  }

  init(): void {
    this.sim = new BrickSim();
    this.labels = [];
    this.ended = false;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x111733);
    this.g = this.add.graphics();
    iconButton(this, 60, 60, '‹', () => this.scene.start(SceneKeys.Hub)).setDepth(10);
    this.hud = {
      score: addText(this, GAME_WIDTH / 2, 60, '0', 56, { color: '#ffd23f' }).setDepth(10),
      info: addText(this, GAME_WIDTH / 2, 120, '', 26, { color: COLORS.textLight }).setDepth(10),
      hint: addText(this, GAME_WIDTH / 2, 900, 'Arraste para mover\nToque para lançar', 34, {
        color: COLORS.textLight,
        stroke: '#111733',
        strokeThickness: 8,
      }).setDepth(10),
    };
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) =>
      this.sim.movePaddle(p.x),
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y < 130) return;
      this.sim.movePaddle(p.x);
      this.launch();
    });
    this.input.keyboard?.on('keydown-SPACE', () => this.launch());
    if (import.meta.env.DEV) (window as unknown as { __tijolos?: TijolosScene }).__tijolos = this;
  }

  private launch(): void {
    if (!this.sim.attached || this.ended) return;
    this.hud.hint.setVisible(false);
    this.sim.launch();
    getServices(this).sfx.play('click');
  }

  override update(_t: number, deltaMs: number): void {
    const kb = this.input.keyboard;
    const dir =
      (kb?.checkDown(kb.addKey('RIGHT')) ? 1 : 0) - (kb?.checkDown(kb.addKey('LEFT')) ? 1 : 0);
    if (dir) this.sim.movePaddle(this.sim.paddleX + dir * 900 * (deltaMs / 1000));
    if (!this.ended)
      for (const e of this.sim.step(Math.min(deltaMs / 1000, 1 / 30))) this.onEvent(e);
    this.draw();
  }

  private onEvent(e: BrickEvent): void {
    const { sfx } = getServices(this);
    switch (e.type) {
      case 'bounce':
        sfx.play('click');
        break;
      case 'brick':
        sfx.play(e.broke ? 'pop' : 'click', e.broke ? 2 : 0);
        if (e.broke) {
          const p = this.add.particles(e.brick.x, e.brick.y, Tex.dot, {
            speed: { min: 80, max: 260 },
            lifespan: 350,
            scale: { start: 0.9, end: 0 },
            tint: HP_COLORS[e.brick.maxHp - 1],
            emitting: false,
          });
          p.explode(10);
          this.time.delayedCall(400, () => p.destroy());
        }
        break;
      case 'item':
        sfx.play('star', 3);
        break;
      case 'life':
        sfx.play('hit');
        this.cameras.main.shake(160, 0.008);
        if (!this.sim.over) this.hud.hint.setText('Toque para lançar').setVisible(true);
        break;
      case 'level':
        sfx.play('win');
        this.hud.hint.setText(`FASE ${e.level}!\nToque para lançar`).setVisible(true);
        break;
      case 'over': {
        this.ended = true;
        const data: GameOverData = {
          gameId: 'tijolos',
          title: 'Sem bolas!',
          lines: [`Chegou na fase ${this.sim.level}`],
          record: { score: this.sim.score, details: { level: this.sim.level } },
          parent: SceneKeys.Tijolos,
          retry: { scene: SceneKeys.Tijolos },
        };
        this.time.delayedCall(900, () => this.scene.launch(SceneKeys.GameOver, data));
        break;
      }
    }
  }

  private draw(): void {
    const s = this.sim;
    const g = this.g.clear();
    g.lineStyle(4, 0x2a3570).strokeRect(2, TOP, GAME_WIDTH - 4, 1280 - TOP);
    for (const b of s.bricks) {
      const c = HP_COLORS[b.hp - 1] ?? 0xffffff;
      g.fillStyle(c).fillRoundedRect(
        b.x - brickSize.w / 2 + 3,
        b.y - brickSize.h / 2 + 3,
        brickSize.w - 6,
        brickSize.h - 6,
        8,
      );
      g.fillStyle(0xffffff, 0.3).fillRoundedRect(
        b.x - brickSize.w / 2 + 8,
        b.y - brickSize.h / 2 + 6,
        brickSize.w - 16,
        6,
        3,
      );
      if (b.item) g.fillStyle(0xffffff, 0.9).fillCircle(b.x, b.y + 2, 5);
    }
    g.fillStyle(0xe0e7ff).fillRoundedRect(
      s.paddleX - s.paddleW / 2,
      PADDLE_Y - 12,
      s.paddleW,
      22,
      11,
    );
    g.fillStyle(0x4cc9f0).fillRoundedRect(
      s.paddleX - s.paddleW / 2 + 6,
      PADDLE_Y - 8,
      s.paddleW - 12,
      6,
      3,
    );
    for (const b of s.balls) {
      g.fillStyle(0xffffff, 0.25).fillCircle(b.x, b.y, BALL_R + 6);
      g.fillStyle(0xffffff).fillCircle(b.x, b.y, BALL_R);
    }
    s.items.forEach((it, i) => {
      g.fillStyle(ITEM[it.kind].color).fillRoundedRect(it.x - 30, it.y - 16, 60, 32, 16);
      const t =
        this.labels[i] ??
        (this.labels[i] = addText(this, 0, 0, '', 22, { color: '#111733' }).setDepth(5));
      t.setVisible(true).setText(ITEM[it.kind].label).setPosition(it.x, it.y);
    });
    for (let i = s.items.length; i < this.labels.length; i++) this.labels[i]!.setVisible(false);
    for (let i = 0; i < s.lives; i++)
      g.fillStyle(0xffffff).fillCircle(GAME_WIDTH - 40 - i * 34, 60, 11);
    this.hud.score.setText(formatNumber(s.score));
    this.hud.info.setText(`Fase ${s.level}`);
  }
}
