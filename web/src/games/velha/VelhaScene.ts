import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { InfiniteTicTacToe, robotSkill } from './core';

const CELL = 200;
const OX = (GAME_WIDTH - CELL * 3) / 2;
const OY = 400;
const cx = (i: number) => OX + (i % 3) * CELL + CELL / 2;
const cy = (i: number) => OY + Math.floor(i / 3) * CELL + CELL / 2;
const GLYPH = ['', '❌', '⭕'] as const;

/** "Velha Infinita": only 3 marks each, the oldest disappears. Beat the robot as long as you can. */
export class VelhaScene extends MiniScene {
  private game0 = new InfiniteTicTacToe();
  private wins = 0;
  private round = 0;
  private marks: Phaser.GameObjects.Text[] = [];
  private status!: Phaser.GameObjects.Text;
  private busy = false;

  constructor() {
    super(SceneKeys.Velha, 'velha', [0x2b2d42, 0x8d99ae]);
  }

  create(): void {
    this.wins = 0;
    this.round = 0;
    this.frame();
    const g = this.add.graphics();
    g.lineStyle(10, 0xffffff, 0.8);
    for (let i = 1; i < 3; i++) {
      g.lineBetween(OX + i * CELL, OY + 10, OX + i * CELL, OY + CELL * 3 - 10);
      g.lineBetween(OX + 10, OY + i * CELL, OX + CELL * 3 - 10, OY + i * CELL);
    }
    this.status = addText(this, GAME_WIDTH / 2, 280, '', 40, {
      color: '#ffffff',
      stroke: '#0b1430',
    });
    addText(
      this,
      GAME_WIDTH / 2,
      1100,
      'Cada um tem só 3 peças:\na mais antiga some quando você joga a 4ª',
      30,
      {
        color: '#ffffff',
        stroke: '#0b1430',
      },
    );
    for (let i = 0; i < 9; i++) {
      this.marks.push(emojiText(this, cx(i), cy(i), '', 110));
      this.add
        .rectangle(cx(i), cy(i), CELL, CELL, 0xffffff, 0.001)
        .setInteractive()
        .on(Phaser.Input.Events.POINTER_DOWN, () => this.tap(i));
    }
    this.newRound();
  }

  private newRound(): void {
    // The robot opens every other round so neither side owns the first move.
    this.game0 = new InfiniteTicTacToe(this.round % 2 === 0 ? 1 : 2);
    this.round++;
    this.busy = false;
    this.render();
    if (this.game0.turn === 2) this.robotTurn();
  }

  private render(): void {
    const g = this.game0;
    const fading = [g.oldest(1), g.oldest(2)];
    this.marks.forEach((t, i) => {
      t.setText(GLYPH[g.board[i]!]!);
      t.setAlpha(fading.includes(i) ? 0.4 : 1);
    });
    this.status.setText(
      g.turn === 1 ? `Sua vez ❌   ·   Vitórias: ${this.wins}` : 'O robô está pensando…',
    );
  }

  private tap(i: number): void {
    const g = this.game0;
    if (this.ended || this.busy || g.over || g.turn !== 1) return;
    if (!g.play(i)) return;
    getServices(this).sfx.play('pop', 2);
    this.render();
    this.afterMove();
  }

  private robotTurn(): void {
    this.busy = true;
    this.time.delayedCall(550, () => {
      if (this.ended) return;
      const g = this.game0;
      g.play(g.bestMove(Math.random, robotSkill(this.wins)));
      getServices(this).sfx.play('pop', 5);
      this.busy = false;
      this.render();
      this.afterMove();
    });
  }

  private afterMove(): void {
    const g = this.game0;
    if (g.winner === 1) {
      this.wins++;
      this.setScore(this.wins);
      this.pop(GAME_WIDTH / 2, 330, 'Você venceu!', '#ffe066');
      getServices(this).sfx.play('win');
      this.busy = true;
      this.time.delayedCall(1100, () => this.newRound());
    } else if (g.winner === 2) {
      this.finish('O robô venceu!', [`Vitórias seguidas: ${this.wins}`], {
        score: this.wins,
        details: { rounds: this.round },
      });
    } else if (g.draw) {
      this.pop(GAME_WIDTH / 2, 330, 'Empate, de novo!');
      this.busy = true;
      this.time.delayedCall(1000, () => this.newRound());
    } else if (g.turn === 2) this.robotTurn();
  }
}
