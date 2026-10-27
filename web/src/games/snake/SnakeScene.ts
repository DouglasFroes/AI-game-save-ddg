import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { formatNumber } from '@/platform/ranking';
import type { GameOverData } from '@/platform/scenes/GameOverScene';
import { bindSwipe } from '@/platform/ui/swipe';
import { addText, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { COLS, ROWS, SnakeGame, type Cell, type SnakeEvent } from './core';
import { drawApple } from './art';

const CELL = 38;
const BX = (GAME_WIDTH - COLS * CELL) / 2;
const BY = 230;

const px = (c: Cell) => ({ x: BX + c.x * CELL + CELL / 2, y: BY + c.y * CELL + CELL / 2 });

export class SnakeScene extends Phaser.Scene {
  private game_ = new SnakeGame();
  private prev: Cell[] = [];
  private acc = 0;
  private started = false;
  private ended = false;
  private gfx!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Snake);
  }

  init(): void {
    this.game_ = new SnakeGame();
    this.prev = this.game_.body.map((c) => ({ ...c }));
    this.acc = 0;
    this.started = false;
    this.ended = false;
  }

  create(): void {
    const { best } = getServices(this);
    this.cameras.main.setBackgroundColor(0x2d6a4f);

    const board = this.add.graphics();
    board
      .fillStyle(0x1b4332)
      .fillRoundedRect(BX - 10, BY - 10, COLS * CELL + 20, ROWS * CELL + 20, 18);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        board
          .fillStyle((x + y) % 2 ? 0xa8e063 : 0xb5e878)
          .fillRect(BX + x * CELL, BY + y * CELL, CELL, CELL);
      }
    }
    this.gfx = this.add.graphics();

    iconButton(this, 66, 66, '‹', () => this.scene.start(SceneKeys.Hub));
    this.scoreText = addText(this, GAME_WIDTH / 2, 70, '0', 64, {
      color: COLORS.textLight,
      stroke: '#1b4332',
      strokeThickness: 10,
    });
    addText(this, GAME_WIDTH / 2, 150, `👑 ${formatNumber(best.get('snake')?.score ?? 0)}`, 30, {
      color: '#ffd23f',
    });
    this.hint = addText(this, GAME_WIDTH / 2, 1200, 'Deslize o dedo para mudar de direção', 30, {
      color: COLORS.textLight,
    });

    bindSwipe(this, (dir) => {
      if (!this.game_.alive) return;
      this.started = true;
      this.game_.turn(dir);
    });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => (this.started = true));

    this.draw(1);
    if (import.meta.env.DEV) (window as unknown as { __snake?: SnakeScene }).__snake = this;
  }

  override update(_t: number, deltaMs: number): void {
    if (!this.started || this.ended) {
      this.draw(1);
      return;
    }
    this.acc += Math.min(deltaMs, 100);
    while (this.acc >= this.game_.interval && this.game_.alive) {
      this.acc -= this.game_.interval;
      this.prev = this.game_.body.map((c) => ({ ...c }));
      this.handle(this.game_.tick());
    }
    this.draw(this.game_.alive ? this.acc / this.game_.interval : 1);
  }

  private handle(events: SnakeEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e === 'eat' || e === 'bonus') {
        sfx.play(e === 'bonus' ? 'win' : 'pop');
        this.scoreText.setText(formatNumber(this.game_.score));
        this.tweens.add({ targets: this.scoreText, scale: { from: 1.3, to: 1 }, duration: 160 });
        if (this.game_.eaten === 1) this.hint.setVisible(false);
      }
      if (e === 'bonus-spawn') sfx.play('star', 3);
      if (e === 'die') this.die();
    }
  }

  /** Interpolates between the previous and current body for smooth movement. */
  private draw(t: number): void {
    const g = this.gfx.clear();
    const { body, food, bonus, dir } = this.game_;
    const pulse = 1 + Math.sin(this.time.now / 160) * 0.08;
    const f = px(food);
    drawApple(g, f.x, f.y, 14 * pulse);
    if (bonus) {
      const b = px(bonus.cell);
      g.lineStyle(4, 0xffffff, 0.8)
        .beginPath()
        .arc(b.x, b.y, 20, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * bonus.ticks) / 45)
        .strokePath();
      g.fillStyle(0xffd23f).fillCircle(b.x, b.y, 14 * pulse);
      g.fillStyle(0xffffff, 0.7).fillCircle(b.x - 4, b.y - 4, 4);
    }

    const pts = body.map((c, i) => {
      const from = this.prev[i] ?? this.prev[this.prev.length - 1] ?? c;
      const a = px(from);
      const b = px(c);
      // Do not interpolate across a wrap-free jump (e.g. right after a grow).
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    });
    const dead = !this.game_.alive;
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i]!;
      const shade = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(dead ? 0x6c757d : 0x40916c),
        Phaser.Display.Color.ValueToColor(dead ? 0x343a40 : 0x1b4332),
        Math.max(1, pts.length),
        i,
      );
      const color = Phaser.Display.Color.GetColor(shade.r, shade.g, shade.b);
      const r = i === 0 ? 18 : 16 - Math.min(5, (i / pts.length) * 5);
      g.fillStyle(color).fillCircle(p.x, p.y, r);
      const next = pts[i - 1];
      if (next) g.lineStyle(r * 2, color).lineBetween(p.x, p.y, next.x, next.y);
    }

    const head = pts[0]!;
    const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    const side = [-d[1]!, d[0]!];
    for (const s of [-1, 1]) {
      const ex = head.x + d[0]! * 6 + side[0]! * 8 * s;
      const ey = head.y + d[1]! * 6 + side[1]! * 8 * s;
      g.fillStyle(0xffffff).fillCircle(ex, ey, 6);
      g.fillStyle(0x000000).fillCircle(ex + d[0]! * 2, ey + d[1]! * 2, dead ? 1 : 3);
    }
  }

  private die(): void {
    this.ended = true;
    const { sfx } = getServices(this);
    sfx.play('hit');
    sfx.vibrate([60, 40, 60]);
    this.cameras.main.shake(250, 0.012);
    const data: GameOverData = {
      gameId: 'snake',
      title: 'Bateu!',
      lines: [`Tamanho: ${this.game_.body.length}`],
      record: { score: this.game_.score, details: { length: this.game_.body.length } },
      parent: SceneKeys.Snake,
      retry: { scene: SceneKeys.Snake },
    };
    this.time.delayedCall(900, () => this.scene.launch(SceneKeys.GameOver, data));
  }
}
