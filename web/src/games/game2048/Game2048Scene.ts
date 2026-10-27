import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { formatNumber } from '@/platform/ranking';
import type { GameOverData } from '@/platform/scenes/GameOverScene';
import { bindSwipe } from '@/platform/ui/swipe';
import { addText, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { Game2048, N, WIN_VALUE, type Tile } from './core';

const CELL = 150;
const GAP = 14;
const BOARD = N * CELL + (N + 1) * GAP;
const BOARD_X = (GAME_WIDTH - BOARD) / 2;
const BOARD_Y = 360;
const SLIDE_MS = 110;

const TILE_COLORS: Record<number, [number, string]> = {
  2: [0xeee4da, '#776e65'],
  4: [0xede0c8, '#776e65'],
  8: [0xf2b179, '#ffffff'],
  16: [0xf59563, '#ffffff'],
  32: [0xf67c5f, '#ffffff'],
  64: [0xf65e3b, '#ffffff'],
  128: [0xedcf72, '#ffffff'],
  256: [0xedcc61, '#ffffff'],
  512: [0xedc850, '#ffffff'],
  1024: [0xedc53f, '#ffffff'],
  2048: [0xedc22e, '#ffffff'],
};
const tileStyle = (v: number): [number, string] => TILE_COLORS[v] ?? [0x3c3a32, '#ffffff'];

const cellX = (c: number) => BOARD_X + GAP + c * (CELL + GAP) + CELL / 2;
const cellY = (r: number) => BOARD_Y + GAP + r * (CELL + GAP) + CELL / 2;

export class Game2048Scene extends Phaser.Scene {
  private game2048 = new Game2048();
  private views = new Map<number, Phaser.GameObjects.Container>();
  private busy = false;
  private won = false;
  private over = false;
  private scoreText!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Game2048);
  }

  init(): void {
    this.game2048 = new Game2048();
    this.views = new Map();
    this.busy = false;
    this.won = false;
    this.over = false;
  }

  create(): void {
    const { best } = getServices(this);
    this.cameras.main.setBackgroundColor(0xfaf8ef);

    iconButton(this, 66, 66, '‹', () => this.scene.start(SceneKeys.Hub));
    addText(this, 220, 170, '2048', 96, { color: '#776e65' });
    this.scoreBox(470, 170, 'PONTOS', '0').setName('score');
    this.scoreBox(620, 170, 'RECORDE', formatNumber(best.get('game2048')?.score ?? 0));
    this.scoreText = this.children.getByName('scoreValue') as Phaser.GameObjects.Text;
    addText(this, GAME_WIDTH / 2, 290, 'Deslize para juntar os números iguais!', 26, {
      color: '#8f7a66',
      weight: 'normal',
    });

    const g = this.add.graphics();
    g.fillStyle(0xbbada0).fillRoundedRect(BOARD_X, BOARD_Y, BOARD, BOARD, 18);
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        g.fillStyle(0xcdc1b4).fillRoundedRect(
          cellX(c) - CELL / 2,
          cellY(r) - CELL / 2,
          CELL,
          CELL,
          12,
        );
      }
    }

    this.game2048.start();
    for (const t of this.game2048.tiles) this.appear(t, 0);
    bindSwipe(this, (dir) => this.onMove(dir), 150);

    if (import.meta.env.DEV) (window as unknown as { __g2048?: Game2048Scene }).__g2048 = this;
  }

  private scoreBox(
    x: number,
    y: number,
    label: string,
    value: string,
  ): Phaser.GameObjects.Graphics {
    const g = this.add
      .graphics()
      .fillStyle(0xbbada0)
      .fillRoundedRect(x - 68, y - 50, 136, 100, 14);
    addText(this, x, y - 22, label, 20, { color: '#eee4da' });
    const t = addText(this, x, y + 16, value, 38, { color: '#ffffff' });
    if (label === 'PONTOS') t.setName('scoreValue');
    return g;
  }

  private makeView(t: Tile): Phaser.GameObjects.Container {
    const [bg, fg] = tileStyle(t.value);
    const box = this.add
      .graphics()
      .fillStyle(bg)
      .fillRoundedRect(-CELL / 2, -CELL / 2, CELL, CELL, 12);
    const digits = String(t.value).length;
    const size = digits <= 2 ? 70 : digits === 3 ? 58 : digits === 4 ? 46 : 38;
    const label = addText(this, 0, 2, String(t.value), size, { color: fg });
    const view = this.add.container(cellX(t.c), cellY(t.r), [box, label]).setDepth(2);
    this.views.set(t.id, view);
    return view;
  }

  private appear(t: Tile, delay: number): void {
    const view = this.makeView(t).setScale(0);
    this.tweens.add({ targets: view, scale: 1, duration: 140, delay, ease: 'Back.easeOut' });
  }

  private onMove(dir: 'up' | 'down' | 'left' | 'right'): void {
    if (this.busy || this.over) return;
    const result = this.game2048.move(dir);
    if (!result.moved) return;
    this.busy = true;
    const { sfx } = getServices(this);
    sfx.play(result.merges.length ? 'pop' : 'click');

    for (const t of result.slid) {
      const view = this.views.get(t.id);
      if (view)
        this.tweens.add({ targets: view, x: cellX(t.c), y: cellY(t.r), duration: SLIDE_MS });
    }
    for (const m of result.merges) {
      for (const from of m.from) {
        const view = this.views.get(from.id);
        this.views.delete(from.id);
        if (!view) continue;
        view.setDepth(1);
        this.tweens.add({
          targets: view,
          x: cellX(from.c),
          y: cellY(from.r),
          duration: SLIDE_MS,
          onComplete: () => view.destroy(),
        });
      }
    }

    this.time.delayedCall(SLIDE_MS, () => {
      for (const m of result.merges) {
        const view = this.makeView(m.tile);
        this.tweens.add({
          targets: view,
          scale: { from: 1.22, to: 1 },
          duration: 160,
          ease: 'Back.easeOut',
        });
      }
      const spawned = this.game2048.spawn();
      if (spawned) this.appear(spawned, 0);
      this.updateScore(result.gained);
      this.busy = false;

      if (!this.won && this.game2048.maxTile >= WIN_VALUE) this.celebrate();
      if (!this.game2048.canMove()) this.gameOver();
    });
  }

  private updateScore(gained: number): void {
    this.scoreText.setText(formatNumber(this.game2048.score));
    if (!gained) return;
    const pop = addText(this, 470, 140, `+${gained}`, 34, { color: '#776e65' }).setDepth(10);
    this.tweens.add({
      targets: pop,
      y: 80,
      alpha: 0,
      duration: 700,
      onComplete: () => pop.destroy(),
    });
  }

  private celebrate(): void {
    this.won = true;
    getServices(this).sfx.play('win');
    const t = addText(this, GAME_WIDTH / 2, BOARD_Y + BOARD / 2, '2048!\nContinue jogando', 72, {
      color: '#ffffff',
      stroke: '#edc22e',
      strokeThickness: 12,
    }).setDepth(20);
    this.tweens.add({
      targets: t,
      alpha: 0,
      delay: 1400,
      duration: 600,
      onComplete: () => t.destroy(),
    });
  }

  private gameOver(): void {
    this.over = true;
    getServices(this).sfx.play('hit');
    const data: GameOverData = {
      gameId: 'game2048',
      title: 'Sem movimentos!',
      lines: [`Maior peça: ${this.game2048.maxTile}`],
      record: { score: this.game2048.score, details: { maxTile: this.game2048.maxTile } },
      parent: SceneKeys.Game2048,
      retry: { scene: SceneKeys.Game2048 },
    };
    this.time.delayedCall(900, () => this.scene.launch(SceneKeys.GameOver, data));
  }
}
