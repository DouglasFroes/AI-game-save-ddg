import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { COLS, Connect4, robotLevel, ROWS } from './core';

const CELL = 92;
const OX = (GAME_WIDTH - COLS * CELL) / 2;
const OY = 360;
const cx = (i: number) => OX + (i % COLS) * CELL + CELL / 2;
const cy = (i: number) => OY + Math.floor(i / COLS) * CELL + CELL / 2;
const DISC = [0, 0xff4d6d, 0xffd23f] as const;

/** "Ligue 4": line up four before the robot does. Every win makes the robot smarter. */
export class Ligue4Scene extends MiniScene {
  private game0 = new Connect4();
  private wins = 0;
  private points = 0;
  private round = 0;
  private myMoves = 0;
  private discs: Phaser.GameObjects.Arc[] = [];
  private status!: Phaser.GameObjects.Text;
  private hover!: Phaser.GameObjects.Arc;
  private busy = false;

  constructor() {
    super(SceneKeys.Ligue4, 'ligue4', [0x03045e, 0x0077b6]);
  }

  create(): void {
    this.wins = 0;
    this.points = 0;
    this.round = 0;
    this.discs = [];
    this.frame();
    this.status = addText(this, GAME_WIDTH / 2, 240, '', 40, {
      color: '#ffffff',
      stroke: '#0b1430',
    });
    this.hover = this.add.circle(0, OY - 50, 36, DISC[1]).setVisible(false);
    for (let i = 0; i < COLS * ROWS; i++)
      this.discs.push(this.add.circle(cx(i), cy(i), 38, 0xffffff).setVisible(false).setDepth(1));
    // Board with holes: a blue frame drawn over the discs, punched with a geometry mask.
    const frame = this.add.graphics().setDepth(2);
    frame
      .fillStyle(0x1d4ed8)
      .fillRoundedRect(OX - 10, OY - 10, COLS * CELL + 20, ROWS * CELL + 20, 24);
    const holes = this.make.graphics({}, false);
    holes.fillStyle(0xffffff);
    for (let i = 0; i < COLS * ROWS; i++) holes.fillCircle(cx(i), cy(i), 40);
    frame.setMask(new Phaser.Display.Masks.GeometryMask(this, holes).setInvertAlpha(true));
    for (let c = 0; c < COLS; c++) {
      this.add
        .rectangle(
          OX + c * CELL + CELL / 2,
          OY + (ROWS * CELL) / 2,
          CELL,
          ROWS * CELL + 120,
          0xffffff,
          0.001,
        )
        .setDepth(5)
        .setInteractive()
        .on(Phaser.Input.Events.POINTER_OVER, () => this.preview(c))
        .on(Phaser.Input.Events.POINTER_DOWN, () => this.tap(c));
    }
    this.newRound();
  }

  private preview(c: number): void {
    if (this.busy || this.ended || this.game0.turn !== 1) return;
    this.hover.setVisible(true).setX(OX + c * CELL + CELL / 2);
  }

  private newRound(): void {
    this.game0 = new Connect4(this.round % 2 === 0 ? 1 : 2);
    this.round++;
    this.myMoves = 0;
    this.busy = false;
    for (const d of this.discs) d.setVisible(false).setStrokeStyle(0);
    this.hover.setVisible(false);
    this.status.setText(this.game0.turn === 1 ? 'Sua vez  🔴' : 'Robô começa  🟡');
    if (this.game0.turn === 2) this.robotTurn();
  }

  private place(col: number): void {
    const idx = this.game0.drop(col);
    if (idx < 0) return;
    const disc = this.discs[idx]!;
    disc
      .setFillStyle(DISC[this.game0.cells[idx]!]!)
      .setVisible(true)
      .setY(OY - 70);
    this.tweens.add({ targets: disc, y: cy(idx), duration: 260, ease: 'Bounce.easeOut' });
    getServices(this).sfx.play('pop', col);
  }

  private tap(c: number): void {
    if (this.ended || this.busy || this.game0.turn !== 1 || this.game0.over) return;
    if (this.game0.rowFor(c) < 0) return;
    this.hover.setVisible(false);
    this.myMoves++;
    this.place(c);
    this.afterMove();
  }

  private robotTurn(): void {
    this.busy = true;
    this.status.setText('O robô está pensando…');
    this.time.delayedCall(650, () => {
      if (this.ended) return;
      const { depth, skill } = robotLevel(this.wins);
      this.place(this.game0.bestMove(Math.random, depth, skill));
      this.busy = false;
      this.status.setText('Sua vez  🔴');
      this.afterMove();
    });
  }

  private afterMove(): void {
    const g = this.game0;
    if (g.winner) for (const i of g.line) this.discs[i]!.setStrokeStyle(8, 0xffffff);
    if (g.winner === 1) {
      this.wins++;
      this.points += 100 + Math.max(0, 22 - this.myMoves);
      this.setScore(this.points);
      this.pop(GAME_WIDTH / 2, 300, 'Você venceu!', '#ffe066');
      getServices(this).sfx.play('win');
      this.busy = true;
      this.time.delayedCall(1500, () => this.newRound());
    } else if (g.winner === 2) {
      this.finish('O robô venceu!', [`Vitórias: ${this.wins}`], {
        score: this.points,
        details: { wins: this.wins },
      });
    } else if (g.full) {
      this.pop(GAME_WIDTH / 2, 300, 'Empate!');
      this.busy = true;
      this.time.delayedCall(1200, () => this.newRound());
    } else if (g.turn === 2 && !this.busy) this.robotTurn();
  }
}
