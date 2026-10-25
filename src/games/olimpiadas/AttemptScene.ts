import Phaser from 'phaser';
import { GAME_WIDTH, type SceneKey } from '@/config';
import { burst, flash, shockwave } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { pingPong, type AttemptResult, type AttemptRules, type Stage } from './attempt';

export interface AttemptTheme {
  readonly key: SceneKey;
  readonly gameId: string;
  readonly colors: readonly [number, number];
  /** The athlete, drawn big on the left. */
  readonly actor: string;
  /** What flies away after a good attempt (javelin, ball…). */
  readonly flight: string;
  /** Ground colour of the little track. */
  readonly ground: number;
  readonly intro: string;
  readonly accent: string;
}

const CX = GAME_WIDTH / 2;
const BAR = { x: 70, y: 800, w: 580, h: 56 };
const ACTOR = { x: 130, y: 560 };
const GROUND_Y = 660;

/** Plays any event described by AttemptRules: stages one after the other, result, next attempt. */
export abstract class AttemptScene<C> extends MiniScene {
  private history: AttemptResult[] = [];
  private attempt = 0;
  private stages: readonly Stage[] = [];
  private stage = 0;
  private values: number[] = [];
  private ctx!: C;
  private phase: 'idle' | 'stage' | 'result' = 'idle';
  private t = 0;
  private marker = 0;
  private fill = 0;
  private peak = 0;
  private actor!: Phaser.GameObjects.Text;
  private bar!: Phaser.GameObjects.Graphics;
  private head!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private label!: Phaser.GameObjects.Text;
  private tip!: Phaser.GameObjects.Text;
  private tapButton!: Phaser.GameObjects.Container;
  private tapText!: Phaser.GameObjects.Text;
  private chips: Phaser.GameObjects.Text[] = [];

  constructor(
    private readonly theme: AttemptTheme,
    private readonly rules: AttemptRules<C>,
  ) {
    super(theme.key, theme.gameId, theme.colors);
  }

  create(): void {
    this.history = [];
    this.attempt = 0;
    this.phase = 'idle';
    this.chips = [];
    this.frame('0');
    const ground = this.add.graphics();
    ground.fillStyle(this.theme.ground).fillRoundedRect(30, GROUND_Y, GAME_WIDTH - 60, 22, 11);
    ground.fillStyle(0xffffff, 0.18).fillRect(30, GROUND_Y + 8, GAME_WIDTH - 60, 4);
    this.actor = emojiText(this, ACTOR.x, ACTOR.y, this.theme.actor, 130);
    this.head = addText(this, CX, 168, '', 34, { color: '#ffffff', stroke: '#0b1430' });
    this.info = addText(this, CX, 232, '', 28, {
      color: this.theme.accent,
      stroke: '#0b1430',
      wrapWidth: 620,
    });
    this.label = addText(this, CX, 732, '', 36, { color: '#ffffff', stroke: '#0b1430' });
    this.tip = addText(this, CX, 890, '', 26, {
      color: '#ffffffcc',
      weight: 'normal',
      wrapWidth: 620,
    });
    this.bar = this.add.graphics();
    this.makeButton();
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y > 130) this.tap();
    });
    this.input.keyboard?.on('keydown-SPACE', () => this.tap());
    this.time.delayedCall(900, () => this.begin());
  }

  private makeButton(): void {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3).fillCircle(0, 8, 118);
    g.fillStyle(0xe8442a).fillCircle(0, 0, 118);
    g.fillStyle(0xffffff, 0.25).fillEllipse(0, -52, 150, 50);
    this.tapText = addText(this, 0, 0, 'TOQUE!', 44, { color: '#ffffff', stroke: '#7a1d0c' });
    this.tapButton = this.add.container(CX, 1070, [g, this.tapText]);
  }

  // ---------------------------------------------------------------- flow

  private begin(): void {
    if (this.ended) return;
    const start = this.rules.begin(this.attempt, this.history, Math.random);
    this.stages = start.stages;
    this.ctx = start.ctx;
    this.stage = 0;
    this.values = [];
    this.head.setText(`Tentativa ${this.attempt + 1} de ${this.rules.attempts}`);
    this.info.setText(start.info);
    this.actor.setPosition(ACTOR.x, ACTOR.y).setAngle(0).setAlpha(1);
    this.startStage();
  }

  private startStage(): void {
    const s = this.stages[this.stage]!;
    this.phase = 'stage';
    this.t = 0;
    this.marker = 0;
    this.fill = 0;
    this.peak = 0;
    this.label.setText(s.label);
    this.tip.setText(s.hint);
    this.tapText
      .setText(s.kind === 'mash' ? 'TOQUE\nTOQUE!' : 'TOQUE!')
      .setFontSize(s.kind === 'mash' ? 36 : 44);
    this.tweens.add({ targets: this.label, scale: { from: 1.25, to: 1 }, duration: 200 });
  }

  private tap(): void {
    if (this.ended || this.phase !== 'stage') return;
    const s = this.stages[this.stage]!;
    const { sfx } = getServices(this);
    this.tweens.add({ targets: this.tapButton, scale: { from: 0.9, to: 1 }, duration: 110 });
    if (s.kind === 'mash') {
      this.fill = Math.min(1, this.fill + 0.075);
      this.peak = Math.max(this.peak, this.fill);
      this.tweens.add({ targets: this.actor, y: ACTOR.y - 18, duration: 60, yoyo: true });
      sfx.play('click');
      return;
    }
    sfx.play('click');
    this.endStage(this.marker);
  }

  private endStage(value: number): void {
    this.values.push(Phaser.Math.Clamp(value, 0, 1));
    this.stage++;
    const { sfx } = getServices(this);
    sfx.play('star');
    if (this.stage < this.stages.length) {
      this.phase = 'idle';
      this.time.delayedCall(450, () => this.startStage());
      return;
    }
    this.phase = 'result';
    this.showResult(this.rules.resolve(this.values, this.ctx, this.attempt));
  }

  private showResult(r: AttemptResult): void {
    this.history.push(r);
    const { sfx } = getServices(this);
    this.setScore(this.rules.summary(this.history).score);
    this.label.setText('');
    this.tip.setText('');
    // The flight: the thing (or the athlete) sails across the track as far as the result allows.
    const endX =
      ACTOR.x + 80 + (GAME_WIDTH - 2 * ACTOR.x - 40) * Phaser.Math.Clamp(r.progress, 0.05, 1);
    const flyer = emojiText(this, ACTOR.x + 40, ACTOR.y - 20, this.theme.flight, 80).setDepth(5);
    this.tweens.add({
      targets: flyer,
      x: endX,
      duration: 900,
      ease: 'Sine.easeOut',
      angle: r.ok ? 360 : 90,
    });
    this.tweens.add({
      targets: flyer,
      y: { from: ACTOR.y - 20, to: r.ok ? GROUND_Y - 36 : GROUND_Y - 30 },
      duration: 900,
      ease: 'Quad.easeIn',
      onComplete: () => {
        if (r.ok) {
          sfx.play('win');
          shockwave(this, endX, GROUND_Y, 0xffe066, 80);
          burst(this, endX, GROUND_Y - 30, 0xffe066, 16);
        } else {
          sfx.play('hit');
          flash(this, 0xdc2626, 0.16, 240);
        }
        this.pop(CX, 470, r.text, r.ok ? '#ffe066' : '#ff8a8a', 56);
        this.addChip(r);
      },
    });
    flyer.setData('t', 1);
    this.time.delayedCall(2300, () => {
      flyer.destroy();
      if (this.attempt + 1 >= this.rules.attempts || !this.rules.goesOn(this.history)) this.done();
      else {
        this.attempt++;
        this.begin();
      }
    });
  }

  private addChip(r: AttemptResult): void {
    const i = this.chips.length;
    const chip = addText(this, 50 + (i % 4) * 160, 300 + Math.floor(i / 4) * 34, r.text, 22, {
      color: r.ok ? '#ffe066' : '#ff9b9b',
      weight: 'normal',
    }).setOrigin(0, 0.5);
    this.chips.push(chip);
  }

  private done(): void {
    const s = this.rules.summary(this.history);
    this.phase = 'idle';
    this.finish(s.title, s.lines, { score: s.score, details: s.details }, 400);
  }

  // ---------------------------------------------------------------- frame

  override update(_t: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;
    if (this.phase === 'stage') {
      const s = this.stages[this.stage]!;
      this.t += dt;
      if (s.kind === 'meter') this.marker = pingPong(this.t, s.speed);
      else if (s.kind === 'sweep') {
        this.marker = Math.min(1, this.t / s.seconds);
        if (this.marker >= 1) this.endStage(1);
      } else {
        this.fill = Math.max(0, this.fill - 0.3 * dt);
        this.marker = this.fill;
        if (this.t >= s.seconds) this.endStage(this.peak);
      }
    }
    this.drawBar();
  }

  private drawBar(): void {
    const g = this.bar.clear();
    const s = this.phase === 'stage' ? this.stages[this.stage] : undefined;
    g.fillStyle(0x000000, 0.35).fillRoundedRect(BAR.x - 6, BAR.y - 6, BAR.w + 12, BAR.h + 12, 22);
    g.fillStyle(0x1b2a4a).fillRoundedRect(BAR.x, BAR.y, BAR.w, BAR.h, 18);
    if (!s) return;
    if (s.kind === 'mash') {
      const w = Math.max(10, BAR.w * this.fill);
      g.fillStyle(
        this.fill > 0.75 ? 0x4ade80 : this.fill > 0.4 ? 0xfacc15 : 0xf97316,
      ).fillRoundedRect(BAR.x, BAR.y, w, BAR.h, 18);
      const left = Math.max(0, s.seconds - this.t);
      g.fillStyle(0xffffff, 0.9).fillRect(
        BAR.x + BAR.w * Math.min(1, this.t / s.seconds) - 2,
        BAR.y - 14,
        4,
        14,
      );
      this.info.setAlpha(1);
      this.tapText.setAlpha(left > 0 ? 1 : 0.5);
      return;
    }
    const [lo, hi] = s.zone;
    g.fillStyle(0x4ade80, 0.85).fillRoundedRect(
      BAR.x + BAR.w * lo,
      BAR.y,
      BAR.w * (hi - lo),
      BAR.h,
      12,
    );
    g.fillStyle(0xffffff).fillRoundedRect(
      BAR.x + BAR.w * this.marker - 7,
      BAR.y - 10,
      14,
      BAR.h + 20,
      7,
    );
  }
}
