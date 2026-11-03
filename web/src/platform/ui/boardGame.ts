import type Phaser from 'phaser';
import { GAME_WIDTH } from '@/config';
import { banner } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';

/**
 * Shell of the board games against the CPU. A run is a series: every win raises the CPU's level and
 * the score, a draw replays the same level, and the first loss ends the run (GameOver + ranking).
 * Each game provides `startMatch()` (reset its board) and its own drawing and input.
 */
export abstract class BoardScene extends MiniScene {
  /** CPU level of the current match (1 = easy; each win adds one). */
  protected level = 1;
  protected wins = 0;
  protected points = 0;
  /** True while the CPU "thinks" or a result is showing: input is ignored. */
  protected busy = false;
  protected statusText!: Phaser.GameObjects.Text;

  /** Resets the board for a new match at `this.level`. */
  protected abstract startMatch(): void;

  /** Call first in `create()`: frame, status line and the first match. */
  protected begin(statusColor = '#e2e8f0', stroke = '#0b1430'): void {
    this.level = 1;
    this.wins = 0;
    this.points = 0;
    this.busy = false;
    this.frame('0');
    this.statusText = addText(this, GAME_WIDTH / 2, 172, '', 30, {
      color: statusColor,
      stroke,
      strokeThickness: 6,
    }).setDepth(50);
    this.startMatch();
  }

  protected say(text: string): void {
    this.statusText.setText(text);
  }

  /** Runs `fn` after `ms`, with input locked meanwhile (and skipped if the run has ended). */
  protected later(ms: number, fn: () => void): void {
    this.busy = true;
    this.time.delayedCall(ms, () => {
      if (this.ended) return;
      this.busy = false;
      fn();
    });
  }

  /** The player won the match: score, banner, next (harder) match. */
  protected win(label: string, bonus = 0): void {
    const gained = 400 + this.level * 100 + bonus;
    this.wins++;
    this.points += gained;
    this.setScore(this.points);
    getServices(this).sfx.play('win');
    banner(this, label, '#fde047');
    this.pop(GAME_WIDTH / 2, 260, `+${gained}`, '#86efac', 52);
    this.level++;
    this.later(1700, () => this.startMatch());
  }

  /** A drawn match: same level again. */
  protected tie(label = 'EMPATE!'): void {
    getServices(this).sfx.play('click');
    banner(this, label, '#e2e8f0');
    this.later(1500, () => this.startMatch());
  }

  /** The player lost: the run is over. */
  protected lose(title: string, lines: string[] = [], extra: Record<string, number> = {}): void {
    this.finish(
      title,
      [`Vitórias seguidas: ${this.wins}`, ...lines],
      { score: this.points, details: { wins: this.wins, ...extra } },
      900,
    );
  }
}
