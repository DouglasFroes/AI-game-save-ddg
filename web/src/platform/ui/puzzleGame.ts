import { GAME_WIDTH } from '@/config';
import { banner } from '@/platform/ui/juice';
import { heartsLabel, MiniScene } from '@/platform/ui/miniGame';
import { addText, Button, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';

/** Seconds on the clock at the start of a run, the most it can hold, and what a solved level adds. */
export const START_TIME = 75;
export const MAX_TIME = 90;
export const TIME_BONUS = 15;
/** Wrong guesses a run can survive, and the clock each one burns on top of the life. */
export const START_LIVES = 3;
export const MISTAKE_TIME = 10;

/** A "how to play" card: a goal sentence and a few numbered steps. */
export interface RuleCard {
  goal: string;
  steps: string[];
}

/** Games whose rules card was already shown this session (it opens by itself only once). */
const seenRules = new Set<string>();

/**
 * Shell of the logic puzzles: an endless series of levels against one shared clock. Every solved
 * level scores points and adds time; when the clock runs out the run ends (GameOver + ranking).
 * Each game provides `startLevel()` (build level `this.level`) and calls `solved()` when done.
 */
export abstract class PuzzleScene extends MiniScene {
  protected level = 1;
  protected points = 0;
  protected timeLeft = START_TIME;
  protected lives = START_LIVES;
  /** True between a solved level and the next one: input is ignored and the clock waits. */
  protected locked = false;
  protected statusText!: Phaser.GameObjects.Text;

  private ruleObjects: Phaser.GameObjects.GameObject[] = [];
  private helpOpen = false;

  protected abstract startLevel(): void;

  /** The rules shown on a card the first time, and again from the ? button. */
  protected rules(): RuleCard | undefined {
    return undefined;
  }

  /** Extra text shown after the level and the clock (a move counter, say). */
  protected hud(): string {
    return '';
  }

  /** Call first in `create()`: frame, status line and the first level. */
  protected begin(statusColor = '#e2e8f0', stroke = '#0b1430'): void {
    this.level = 1;
    this.points = 0;
    this.timeLeft = START_TIME;
    this.lives = START_LIVES;
    this.locked = false;
    this.helpOpen = false;
    this.ruleObjects = [];
    this.frame('0');
    this.statusText = addText(this, GAME_WIDTH / 2, 172, '', 30, {
      color: statusColor,
      stroke,
      strokeThickness: 6,
    }).setDepth(50);
    this.startLevel();
    this.refreshStatus();
    const card = this.rules();
    if (card) {
      iconButton(this, 170, 60, '💡', () => this.showRules()).setDepth(50);
      if (!seenRules.has(this.gameId)) this.showRules();
    }
  }

  /** Opens the rules card; the clock waits and the board ignores taps until it is closed. */
  protected showRules(): void {
    const card = this.rules();
    if (!card || this.helpOpen || this.ended || this.locked) return;
    seenRules.add(this.gameId);
    this.helpOpen = true;
    this.locked = true;
    const o = this.ruleObjects;
    const shade = this.add
      .rectangle(GAME_WIDTH / 2, 640, GAME_WIDTH, 1280, 0x000000, 0.78)
      .setDepth(90)
      .setInteractive();
    const panel = this.add.graphics().setDepth(91);
    panel.fillStyle(0x0f172a, 1).fillRoundedRect(50, 230, 620, 760, 32);
    panel.lineStyle(6, 0xfde047, 1).strokeRoundedRect(50, 230, 620, 760, 32);
    const title = addText(this, GAME_WIDTH / 2, 290, 'Como jogar', 52, {
      color: '#fde047',
      stroke: '#000000',
      strokeThickness: 8,
    }).setDepth(92);
    const goal = addText(this, GAME_WIDTH / 2, 400, `🎯 ${card.goal}`, 34, {
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 6,
      wrapWidth: 540,
    }).setDepth(92);
    const steps = addText(
      this,
      90,
      470,
      card.steps.map((t, i) => `${i + 1}. ${t}`).join('\n\n'),
      30,
      { color: '#e2e8f0', stroke: '#000000', strokeThickness: 5, wrapWidth: 540 },
    )
      .setOrigin(0, 0)
      .setAlign('left')
      .setDepth(92);
    const ok = new Button(this, GAME_WIDTH / 2, 920, 'Entendi!', () => this.hideRules(), {
      width: 320,
      height: 90,
      fontSize: 40,
      color: 0x22c55e,
      shade: 0x15803d,
    }).setDepth(93);
    o.push(shade, panel, title, goal, steps, ok);
  }

  private hideRules(): void {
    for (const obj of this.ruleObjects) obj.destroy();
    this.ruleObjects = [];
    this.helpOpen = false;
    this.locked = false;
  }

  protected refreshStatus(): void {
    const extra = this.hud();
    this.statusText.setText(
      `Fase ${this.level} · ⏱ ${Math.max(0, Math.ceil(this.timeLeft))}s · ${heartsLabel(this.lives, START_LIVES)}${extra ? ` · ${extra}` : ''}`,
    );
  }

  /**
   * A wrong guess: costs a life and some clock. Returns true when that was the last life (the run
   * is over), so callers can skip any follow-up.
   */
  protected mistake(message: string): boolean {
    if (this.ended) return true;
    this.lives--;
    this.timeLeft = Math.max(0, this.timeLeft - MISTAKE_TIME);
    getServices(this).sfx.play('hit');
    this.cameras.main.shake(160, 0.006);
    this.refreshStatus();
    if (this.lives <= 0) {
      this.finish(
        'Acabaram as vidas!',
        [`Fases resolvidas: ${this.level - 1}`],
        { score: this.points, details: { levels: this.level - 1 } },
        500,
      );
      return true;
    }
    this.pop(GAME_WIDTH / 2, 260, `${message} (-${MISTAKE_TIME}s)`, '#fca5a5', 40);
    return false;
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
