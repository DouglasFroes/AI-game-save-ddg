import { GAME_WIDTH } from '@/config';
import { banner } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';

/** Seconds on the clock at the start of a run, the most it can hold, and what a solved level adds. */
export const START_TIME = 150;
export const MAX_TIME = 200;
export const TIME_BONUS = 30;

/**
 * Shell of the logic puzzles: an endless series of levels against one shared clock. Every solved
 * level scores points and adds time; when the clock runs out the run ends (GameOver + ranking).
 * Each game provides `startLevel()` (build level `this.level`) and calls `solved()` when done.
 */
export abstract class PuzzleScene extends MiniScene {
  protected level = 1;
  protected points = 0;
  protected timeLeft = START_TIME;
  /** True between a solved level and the next one: input is ignored and the clock waits. */
  protected locked = false;
  protected statusText!: Phaser.GameObjects.Text;

  protected abstract startLevel(): void;

  /** Extra text shown after the level and the clock (a move counter, say). */
  protected hud(): string {
    return '';
  }

  /** Call first in `create()`: frame, status line and the first level. */
  protected begin(statusColor = '#e2e8f0', stroke = '#0b1430'): void {
    this.level = 1;
    this.points = 0;
    this.timeLeft = START_TIME;
    this.locked = false;
    this.frame('0');
    this.statusText = addText(this, GAME_WIDTH / 2, 172, '', 30, {
      color: statusColor,
      stroke,
      strokeThickness: 6,
    }).setDepth(50);
    this.startLevel();
    this.refreshStatus();
  }

  protected refreshStatus(): void {
    const extra = this.hud();
    this.statusText.setText(
      `Fase ${this.level} · ⏱ ${Math.max(0, Math.ceil(this.timeLeft))}s${extra ? ` · ${extra}` : ''}`,
    );
  }

  /** The level is solved: score, banner, a little more time, then the next level. */
  protected solved(label = 'RESOLVIDO!', bonus = 0): void {
    if (this.locked || this.ended) return;
    const gained = 250 + this.level * 50 + bonus;
    this.points += gained;
    this.setScore(this.points);
    getServices(this).sfx.play('win');
    banner(this, label, '#fde047');
    this.pop(GAME_WIDTH / 2, 260, `+${gained}`, '#86efac', 52);
    this.timeLeft = Math.min(MAX_TIME, this.timeLeft + TIME_BONUS);
    this.level++;
    this.locked = true;
    this.time.delayedCall(1400, () => {
      if (this.ended) return;
      this.locked = false;
      this.startLevel();
      this.refreshStatus();
    });
  }

  /** Ends the run right away (used by games with a fixed number of levels). */
  protected complete(title: string): void {
    this.finish(title, [`Fases resolvidas: ${this.level - 1}`], {
      score: this.points,
      details: { levels: this.level - 1 },
    });
  }

  override update(_time: number, deltaMs: number): void {
    if (this.ended) return;
    if (!this.locked) this.timeLeft -= Math.min(deltaMs, 100) / 1000;
    this.refreshStatus();
    if (this.timeLeft <= 0) {
      this.finish(
        'Tempo esgotado!',
        [`Fases resolvidas: ${this.level - 1}`],
        { score: this.points, details: { levels: this.level - 1 } },
        500,
      );
    }
  }
}
