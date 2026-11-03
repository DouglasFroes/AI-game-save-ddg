import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { burst, hint } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { apply, CENTER, movesFrom, moves, newBoard, pegs, score, SIZE, type Board } from './core';

const CELL = 88;
const X0 = (GAME_WIDTH - SIZE * CELL) / 2;
const Y0 = 330;

const center = (i: number) => ({
  x: X0 + (i % SIZE) * CELL + CELL / 2,
  y: Y0 + Math.floor(i / SIZE) * CELL + CELL / 2,
});

/** "Resta Um": jump pegs over each other to clear the board; leave as few as you can. */
export class RestaUmScene extends MiniScene {
  private board: Board = newBoard();
  private g!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private selected = -1;
  private jumps = 0;
  private busy = false;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.RestaUm, 'restaum', [0x365314, 0x1a2e05]);
  }

  create(): void {
    this.board = newBoard();
    this.selected = -1;
    this.jumps = 0;
    this.busy = false;
    this.frame('0');
    this.g = this.add.graphics().setDepth(5);
    this.info = addText(this, GAME_WIDTH / 2, 190, '', 32, {
      color: '#d9f99d',
      stroke: '#1a2e05',
      strokeThickness: 6,
    }).setDepth(50);
    this.hintBox = hint(
      this,
      ['Toque num pino e depois no buraco', 'do outro lado de um pino vizinho'],
      1130,
      5200,
    );
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => this.tap(p));
    this.paint();
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.ended || this.busy) return;
    const col = Math.floor((p.x - X0) / CELL);
    const row = Math.floor((p.y - Y0) / CELL);
    if (col < 0 || col >= SIZE || row < 0 || row >= SIZE) return;
    const i = row * SIZE + col;
    const { sfx } = getServices(this);
    const jump =
      this.selected >= 0 ? movesFrom(this.board, this.selected).find((m) => m.to === i) : undefined;
    if (jump) {
      this.hintBox?.dismiss();
      this.board = apply(this.board, jump);
      this.selected = -1;
      this.jumps++;
      sfx.play('pop');
      const over = center(jump.over);
      burst(this, over.x, over.y, 0xfde047, 10, { speed: 180 });
      this.setScore(score(this.board));
      this.paint();
      if (moves(this.board).length === 0) this.end();
      return;
    }
    if (this.board[i] === 2 && movesFrom(this.board, i).length > 0) {
      this.selected = this.selected === i ? -1 : i;
      sfx.play('click');
    } else if (this.selected >= 0) {
      this.selected = -1;
      sfx.play('locked');
    } else sfx.play('locked');
    this.paint();
  }

  private end(): void {
    this.busy = true;
    const left = pegs(this.board);
    const points = score(this.board);
    const title =
      left === 1
        ? this.board[CENTER] === 2
          ? 'Perfeito! Rei do Resta Um!'
          : 'Só um pino!'
        : left <= 3
          ? 'Quase perfeito!'
          : 'Sem mais jogadas';
    this.finish(title, [`Pinos que sobraram: ${left}`], { score: points, details: { left } }, 700);
  }

  private paint(): void {
    const g = this.g.clear();
    const left = pegs(this.board);
    this.info.setText(`Pinos: ${left}  ·  Pulos: ${this.jumps}`);
    g.fillStyle(0x000000, 0.3).fillRoundedRect(
      X0 - 14,
      Y0 - 14,
      SIZE * CELL + 28,
      SIZE * CELL + 28,
      36,
    );
    const targets = this.selected >= 0 ? movesFrom(this.board, this.selected).map((m) => m.to) : [];
    for (let i = 0; i < SIZE * SIZE; i++) {
      const v = this.board[i]!;
      if (v === 0) continue;
      const c = center(i);
      g.fillStyle(0x14270a, 1).fillCircle(c.x, c.y, 36);
      if (v === 2) {
        g.fillStyle(0x000000, 0.35).fillCircle(c.x, c.y + 4, 31);
        g.fillStyle(i === this.selected ? 0xfde047 : 0x38bdf8, 1).fillCircle(c.x, c.y, 31);
        g.fillStyle(0xffffff, 0.5).fillCircle(c.x - 9, c.y - 9, 9);
      } else if (targets.includes(i)) {
        g.fillStyle(0xfde047, 0.8).fillCircle(c.x, c.y, 16);
      }
    }
  }
}
