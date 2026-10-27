import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { headKey } from '@/games/crush/art';
import { formatNumber } from '@/platform/ranking';
import type { GameOverData } from '@/platform/scenes/GameOverScene';
import { addText, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { COLS, PianoSim, VISIBLE, type PianoEvent } from './core';

const TOP = 160;
const COL_W = GAME_WIDTH / COLS;
const ROW_H = (1280 - TOP) / VISIBLE;
const TILE_COLORS = [0x7209b7, 0x3a0ca3, 0xb5179e, 0x4361ee];

/** "Toque Rápido": tap the turma's tiles in order, faster and faster. */
export class PianoScene extends Phaser.Scene {
  private sim = new PianoSim();
  private grid!: Phaser.GameObjects.Graphics;
  private heads: Phaser.GameObjects.Image[] = [];
  private scoreText!: Phaser.GameObjects.Text;
  private ended = false;
  private flash: { col: number; y: number; t: number } | null = null;

  constructor() {
    super(SceneKeys.Piano);
  }

  init(): void {
    this.sim = new PianoSim();
    this.heads = [];
    this.ended = false;
    this.flash = null;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0xffffff);
    this.grid = this.add.graphics();
    const top = this.add.graphics().setDepth(10);
    top.fillStyle(0x1d2b53).fillRect(0, 0, GAME_WIDTH, TOP);
    iconButton(this, 60, 80, '‹', () => this.scene.start(SceneKeys.Hub)).setDepth(11);
    this.scoreText = addText(this, GAME_WIDTH / 2, 82, '0', 72, { color: '#ffd23f' }).setDepth(11);
    this.input.addPointer(2);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.ended || p.y < TOP) return;
      const col = Math.min(COLS - 1, Math.floor(p.x / COL_W));
      for (const e of this.sim.tap(col, (p.y - TOP) / ROW_H)) this.onEvent(e);
    });
    if (import.meta.env.DEV) (window as unknown as { __piano?: PianoScene }).__piano = this;
  }

  private onEvent(e: PianoEvent): void {
    const { sfx } = getServices(this);
    if (e.type === 'hit') {
      sfx.play('star', this.sim.score % 5);
      this.tweens.add({ targets: this.scoreText, scale: { from: 1.2, to: 1 }, duration: 100 });
      return;
    }
    this.ended = true;
    this.flash = { col: e.col, y: e.y, t: 0 };
    sfx.play('hit');
    sfx.vibrate(120);
    const data: GameOverData = {
      gameId: 'piano',
      title: e.reason === 'wrong' ? 'Errou a peça!' : 'Deixou passar!',
      lines: [`Peças: ${formatNumber(this.sim.score)}`],
      record: { score: this.sim.score, details: {} },
      parent: SceneKeys.Piano,
      retry: { scene: SceneKeys.Piano },
    };
    this.time.delayedCall(1100, () => this.scene.launch(SceneKeys.GameOver, data));
  }

  override update(_t: number, deltaMs: number): void {
    if (!this.ended)
      for (const e of this.sim.step(Math.min(deltaMs / 1000, 1 / 20))) this.onEvent(e);
    const g = this.grid.clear();
    g.lineStyle(2, 0xd8d0ea);
    for (let c = 1; c < COLS; c++) g.lineBetween(c * COL_W, TOP, c * COL_W, 1280);
    let used = 0;
    for (const r of this.sim.rows) {
      const y = TOP + r.y * ROW_H;
      if (y > 1280 || y + ROW_H < TOP) continue;
      const x = r.col * COL_W;
      g.fillStyle(r.done ? 0xe9e3f5 : TILE_COLORS[r.id % TILE_COLORS.length]!).fillRect(
        x + 2,
        y + 2,
        COL_W - 4,
        ROW_H - 4,
      );
      if (r.done) continue;
      const head = this.heads[used] ?? this.add.image(0, 0, headKey(0)).setDepth(2);
      this.heads[used++] = head;
      head
        .setVisible(true)
        .setTexture(headKey(r.id % 6))
        .setPosition(x + COL_W / 2, y + ROW_H / 2)
        .setScale(1.15);
    }
    for (let i = used; i < this.heads.length; i++) this.heads[i]!.setVisible(false);
    const first = this.sim.next;
    if (!this.sim.started && first) {
      const y = TOP + first.y * ROW_H;
      g.fillStyle(0xffd23f).fillRect(first.col * COL_W + 2, y + ROW_H - 70, COL_W - 4, 66);
    }
    if (this.flash) {
      this.flash.t += deltaMs;
      if (Math.floor(this.flash.t / 120) % 2 === 0)
        g.fillStyle(0xff3b3b, 0.85).fillRect(
          this.flash.col * COL_W,
          TOP + this.flash.y * ROW_H,
          COL_W,
          ROW_H,
        );
    }
    this.scoreText.setText(formatNumber(this.sim.score));
    if (!this.sim.started && !this.ended)
      this.scoreText.setText('Toque no amarelo!').setFontSize(40).setColor(COLORS.textLight);
    else this.scoreText.setFontSize(72).setColor('#ffd23f');
  }
}
