import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { bindSwipe } from '@/platform/ui/swipe';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { COLS, IceSim, ROWS } from './core';

const CELL = 92;
const OX = (GAME_WIDTH - COLS * CELL) / 2;
const OY = 270;
const cx = (i: number) => OX + (i % COLS) * CELL + CELL / 2;
const cy = (i: number) => OY + Math.floor(i / COLS) * CELL + CELL / 2;

/** "Gelo": swipe to slide the penguin; it only stops at walls, so plan the route. */
export class GeloScene extends MiniScene {
  private sim = new IceSim();
  private board!: Phaser.GameObjects.Graphics;
  private walls: Phaser.GameObjects.Text[] = [];
  private flag!: Phaser.GameObjects.Text;
  private penguin!: Phaser.GameObjects.Text;
  private bar!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private moving = false;

  constructor() {
    super(SceneKeys.Gelo, 'gelo', [0x023e8a, 0x48cae4]);
  }

  create(): void {
    this.sim = new IceSim();
    this.moving = false;
    this.frame();
    this.bar = this.add.graphics();
    this.info = addText(this, GAME_WIDTH / 2, 230, '', 34, { color: '#ffffff', stroke: '#0b1430' });
    this.board = this.add.graphics();
    this.flag = emojiText(this, 0, 0, '🚩', 64).setDepth(2);
    this.penguin = emojiText(this, 0, 0, '🐧', 70).setDepth(4);
    new Button(this, GAME_WIDTH / 2, 1170, 'Reiniciar', () => this.restart(), {
      width: 300,
      height: 90,
      color: COLORS.primary,
      shade: COLORS.primaryDark,
      fontSize: 38,
    });
    bindSwipe(this, (d) => this.swipe(d), 300);
    this.build();
  }

  private build(): void {
    const { board } = this.sim;
    for (const w of this.walls) w.destroy();
    this.walls = [];
    const g = this.board.clear();
    g.fillStyle(0xcaf0f8).fillRoundedRect(OX - 8, OY - 8, COLS * CELL + 16, ROWS * CELL + 16, 18);
    for (let i = 0; i < COLS * ROWS; i++) {
      const c = (i % COLS) + Math.floor(i / COLS);
      g.fillStyle(c % 2 ? 0xe0f7ff : 0xd2f1fb).fillRect(
        cx(i) - CELL / 2,
        cy(i) - CELL / 2,
        CELL,
        CELL,
      );
      if (board.walls[i]) this.walls.push(emojiText(this, cx(i), cy(i), '🧊', 74).setDepth(1));
    }
    this.flag.setPosition(cx(board.goal), cy(board.goal));
    this.penguin.setPosition(cx(this.sim.pos), cy(this.sim.pos)).setScale(1);
    this.refreshInfo();
  }

  private refreshInfo(): void {
    this.info.setText(
      `Tabuleiro ${this.sim.level + 1}  ·  Jogadas ${this.sim.moves} (ótimo ${this.sim.board.min})`,
    );
  }

  private swipe(dir: 'up' | 'down' | 'left' | 'right'): void {
    if (this.ended || this.moving) return;
    const r = this.sim.swipe(dir);
    if (!r) return;
    const { sfx } = getServices(this);
    this.moving = true;
    sfx.play('click');
    const last = r.path[r.path.length - 1]!;
    this.tweens.add({
      targets: this.penguin,
      x: cx(last),
      y: cy(last),
      duration: 70 * r.path.length + 60,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.moving = false;
        this.refreshInfo();
        if (!r.reached) return;
        sfx.play('win');
        this.setScore(this.sim.score);
        this.pop(
          GAME_WIDTH / 2,
          700,
          this.sim.moves <= this.sim.board.min ? 'PERFEITO! +15s' : 'Chegou! +14s',
          '#ffe066',
        );
        this.tweens.add({
          targets: this.penguin,
          scale: 1.5,
          duration: 200,
          yoyo: true,
          onComplete: () => {
            this.sim.nextBoard();
            this.build();
          },
        });
      },
    });
  }

  private restart(): void {
    if (this.ended || this.moving || this.sim.solved) return;
    this.sim.restart();
    this.penguin.setPosition(cx(this.sim.pos), cy(this.sim.pos));
    this.refreshInfo();
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.sim.step(Math.min(deltaMs, 50) / 1000);
    const frac = Phaser.Math.Clamp(this.sim.time / 60, 0, 1);
    this.bar
      .clear()
      .fillStyle(0x000000, 0.4)
      .fillRoundedRect(GAME_WIDTH / 2 - 300, 170, 600, 26, 13)
      .fillStyle(frac > 0.25 ? 0xffd23f : 0xff4d4d)
      .fillRoundedRect(GAME_WIDTH / 2 - 300, 170, Math.max(26, 600 * frac), 26, 13);
    if (this.sim.dead && !this.moving) {
      this.finish('Acabou o tempo!', [`Tabuleiros: ${this.sim.level}`], {
        score: this.sim.score,
        details: { boards: this.sim.level, perfect: this.sim.perfect },
      });
    }
  }
}
