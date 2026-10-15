import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { kidKey } from '@/games/bomba/art';
import { headKey } from '@/games/crush/art';
import { formatNumber } from '@/platform/ranking';
import type { GameOverData } from '@/platform/scenes/GameOverScene';
import { addText, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { CARD_BACK } from './art';
import { MemorySim, type Card, type MemoryEvent } from './core';

const AREA = { top: 230, bottom: 1240 };

/** Faces 0–5 are the kids' heads, 6–12 the whole kids. */
const faceKey = (face: number) => (face < 6 ? headKey(face) : kidKey(face - 6, 0));

/** "Memória da Turma": find the pairs before the clock runs out. */
export class MemoriaScene extends Phaser.Scene {
  private sim = new MemorySim();
  private views = new Map<number, Phaser.GameObjects.Container>();
  private hud!: {
    score: Phaser.GameObjects.Text;
    level: Phaser.GameObjects.Text;
    bar: Phaser.GameObjects.Graphics;
  };
  private maxTime = 1;
  private ended = false;

  constructor() {
    super(SceneKeys.Memoria);
  }

  init(): void {
    this.sim = new MemorySim();
    this.views = new Map();
    this.ended = false;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0xffe3f3);
    iconButton(this, 60, 60, '‹', () => this.scene.start(SceneKeys.Hub)).setDepth(10);
    this.hud = {
      score: addText(this, GAME_WIDTH / 2, 62, '0', 54, { color: '#7209b7' }).setDepth(10),
      level: addText(this, GAME_WIDTH / 2, 120, '', 26, { color: COLORS.textMuted }).setDepth(10),
      bar: this.add.graphics().setDepth(10),
    };
    this.layout();
    if (import.meta.env.DEV) (window as unknown as { __memoria?: MemoriaScene }).__memoria = this;
  }

  /** Lays out the deck for the current level. */
  private layout(): void {
    for (const v of this.views.values()) v.destroy();
    this.views.clear();
    const { cols, rows } = this.sim.layout;
    this.maxTime = this.sim.time;
    const w = Math.min(150, (GAME_WIDTH - 60) / cols - 14);
    const h = Math.min(w * 1.2, (AREA.bottom - AREA.top) / rows - 14);
    const s = Math.min(w / 140, h / 170);
    const gx = (GAME_WIDTH - cols * (140 * s + 14)) / 2 + (140 * s) / 2 + 7;
    this.sim.cards.forEach((card, i) => {
      const x = gx + (i % cols) * (140 * s + 14);
      const y = AREA.top + (170 * s) / 2 + Math.floor(i / cols) * (170 * s + 14);
      const face = this.add.graphics();
      face.fillStyle(0xffffff).fillRoundedRect(-70, -85, 140, 170, 18);
      face.lineStyle(5, 0xffd23f).strokeRoundedRect(-70, -85, 140, 170, 18);
      const pic = this.add.image(0, 0, faceKey(card.face));
      pic.setScale(Math.min(110 / pic.width, 140 / pic.height));
      const back = this.add.image(0, 0, CARD_BACK);
      const c = this.add.container(x, y, [face, pic, back]).setScale(0);
      c.setSize(140, 170).setInteractive({ useHandCursor: true });
      c.on('pointerup', () => this.flip(i));
      this.views.set(card.id, c);
      this.tweens.add({ targets: c, scale: s, duration: 220, delay: i * 25, ease: 'Back.easeOut' });
      c.setData('s', s);
    });
    this.hud.level.setText(`Fase ${this.sim.level}`);
  }

  private flip(i: number): void {
    if (this.ended) return;
    for (const e of this.sim.flip(i)) this.onEvent(e);
  }

  /** Card-flip animation (squash, swap side, unsquash). */
  private turn(card: Card, up: boolean): void {
    const v = this.views.get(card.id);
    if (!v) return;
    const s = v.getData('s') as number;
    this.tweens.add({
      targets: v,
      scaleX: 0,
      duration: 90,
      onComplete: () => {
        (v.list[2] as Phaser.GameObjects.Image).setVisible(!up);
        this.tweens.add({ targets: v, scaleX: s, duration: 90 });
      },
    });
  }

  private onEvent(e: MemoryEvent): void {
    const { sfx } = getServices(this);
    switch (e.type) {
      case 'flip':
        sfx.play('click');
        this.turn(e.card, true);
        break;
      case 'match':
        sfx.play('star', Math.min(4, e.combo - 1));
        for (const c of [e.a, e.b]) {
          const v = this.views.get(c.id);
          if (v)
            this.tweens.add({
              targets: v,
              scale: (v.getData('s') as number) * 1.12,
              duration: 120,
              yoyo: true,
              delay: 180,
            });
        }
        if (e.combo >= 2) {
          const t = addText(this, GAME_WIDTH / 2, 180, `Combo ×${e.combo}!`, 40, {
            color: '#ff4f8b',
            stroke: '#ffffff',
            strokeThickness: 8,
          }).setDepth(20);
          this.tweens.add({
            targets: t,
            alpha: 0,
            y: 150,
            delay: 500,
            duration: 400,
            onComplete: () => t.destroy(),
          });
        }
        break;
      case 'miss':
        sfx.play('locked');
        break;
      case 'hide':
        for (const c of this.sim.cards)
          if (
            !c.up &&
            this.views.get(c.id)?.list[2] &&
            !(this.views.get(c.id)!.list[2] as Phaser.GameObjects.Image).visible
          )
            this.turn(c, false);
        break;
      case 'level': {
        sfx.play('win');
        const t = addText(
          this,
          GAME_WIDTH / 2,
          700,
          `FASE ${e.level}!\n+${formatNumber(e.bonus)}`,
          64,
          { color: '#7209b7', stroke: '#ffffff', strokeThickness: 12 },
        ).setDepth(30);
        this.tweens.add({
          targets: t,
          alpha: 0,
          delay: 900,
          duration: 400,
          onComplete: () => t.destroy(),
        });
        this.time.delayedCall(700, () => this.layout());
        break;
      }
      case 'over': {
        this.ended = true;
        sfx.play('hit');
        const data: GameOverData = {
          gameId: 'memoria',
          title: 'Acabou o tempo!',
          lines: [`Chegou na fase ${this.sim.level}`],
          record: { score: this.sim.score, details: { level: this.sim.level } },
          parent: SceneKeys.Memoria,
          retry: { scene: SceneKeys.Memoria },
        };
        this.time.delayedCall(700, () => this.scene.launch(SceneKeys.GameOver, data));
        break;
      }
    }
  }

  override update(_t: number, deltaMs: number): void {
    if (!this.ended) for (const e of this.sim.step(deltaMs / 1000)) this.onEvent(e);
    const k = this.sim.time / this.maxTime;
    const g = this.hud.bar.clear();
    g.fillStyle(0xffffff).fillRoundedRect(60, 160, GAME_WIDTH - 120, 26, 13);
    g.fillStyle(k > 0.25 ? 0x7209b7 : 0xff3b3b).fillRoundedRect(
      64,
      164,
      Math.max(18, (GAME_WIDTH - 128) * k),
      18,
      9,
    );
    this.hud.score.setText(formatNumber(this.sim.score));
  }
}
