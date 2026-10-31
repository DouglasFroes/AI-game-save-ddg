import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { emojiText, heartsLabel, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { BONUS_ALT, DIVER_Y, LIVES, radiusOf, SAFE_ALT, SkySim, type SkyEvent } from './core';

const EMOJI = { bird: '🐦', plane: '✈️', cloud: '⛈️' } as const;
const BUTTON_Y = 1180;

/** "Paraquedas": fly through the rings, dodge the sky, and open the chute as late as you dare. */
export class ParaquedasScene extends MiniScene {
  private sim = new SkySim();
  private g!: Phaser.GameObjects.Graphics;
  private sprites = new Map<number, Phaser.GameObjects.Text>();
  private diver!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private altText!: Phaser.GameObjects.Text;
  private openText!: Phaser.GameObjects.Text;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Paraquedas, 'paraquedas', [0x38bdf8, 0x0369a1]);
  }

  create(): void {
    this.sim = new SkySim();
    this.sprites = new Map();
    this.frame('0');
    this.g = this.add.graphics().setDepth(3);
    this.diver = emojiText(this, 360, DIVER_Y, '🪂', 70).setDepth(8);
    this.statusText = addText(this, GAME_WIDTH / 2, 168, '', 28, {
      color: '#ffffff',
      stroke: '#0c4a6e',
      strokeThickness: 6,
    }).setDepth(50);
    this.altText = addText(this, GAME_WIDTH / 2, 260, '', 40, {
      color: '#ffffff',
      stroke: '#0c4a6e',
      strokeThickness: 7,
    }).setDepth(50);
    this.openText = addText(this, GAME_WIDTH / 2, BUTTON_Y, 'ABRIR O PARAQUEDAS', 36, {
      color: '#ffffff',
      stroke: '#7f1d1d',
      strokeThickness: 7,
    }).setDepth(51);
    this.makeSprites();
    this.hintBox = hint(
      this,
      ['Arraste para passar pelos anéis', 'Abra o paraquedas o mais baixo que puder!'],
      640,
      5000,
    );
    const steer = (p: Phaser.Input.Pointer) => {
      if (this.ended || p.y > BUTTON_Y - 60) return;
      this.sim.aim(p.x);
    };
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      this.hintBox?.dismiss();
      if (!this.ended && p.y > BUTTON_Y - 60) this.handle(this.sim.open());
      else steer(p);
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (p.isDown) steer(p);
    });
  }

  private makeSprites(): void {
    for (const s of this.sprites.values()) s.destroy();
    this.sprites.clear();
    for (const t of this.sim.things)
      if (t.kind !== 'ring')
        this.sprites.set(
          t.id,
          emojiText(this, t.x, -100, EMOJI[t.kind], radiusOf(t.kind) * 1.6).setDepth(6),
        );
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.handle(this.sim.step(Math.min(deltaMs, 40) / 1000));
    const s = this.sim;
    const toY = (alt: number) => DIVER_Y + (s.alt - alt);
    for (const t of s.things) {
      const spr = this.sprites.get(t.id);
      if (!spr) continue;
      spr
        .setPosition(t.x, toY(t.alt))
        .setFlipX(t.vx > 0)
        .setAlpha(t.done ? 0.35 : 1);
    }
    this.diver.setPosition(s.x, DIVER_Y).setText(s.state === 'open' ? '🪂' : '🤸');
    this.diver.setAngle(s.state === 'open' ? 0 : (s.targetX - s.x) * 0.15);
    this.statusText.setText(
      `Salto ${s.jump} · ${heartsLabel(s.lives, LIVES)} · Anéis ${s.rings}${s.combo > 1 ? ` · x${s.combo}` : ''}`,
    );
    this.altText
      .setText(`${Math.max(0, Math.round(s.alt))} m`)
      .setColor(s.alt < BONUS_ALT && s.state === 'fall' ? '#fde047' : '#ffffff');
    this.openText.setVisible(s.state === 'fall');
    this.setScore(s.score);
    this.draw(toY);
  }

  private handle(events: SkyEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e.type === 'ring') {
        sfx.play('coin', Math.min(8, e.combo));
        burst(this, this.sim.x, DIVER_Y, 0xfde047, 12, { speed: 220 });
        this.pop(this.sim.x, DIVER_Y - 70, `+${e.points}`, '#fde047', 32);
      } else if (e.type === 'hit') {
        sfx.play('hit');
        sfx.vibrate([50, 30, 50]);
        flash(this, 0xef4444, 0.3, 240);
        this.cameras.main.shake(180, 0.01);
      } else if (e.type === 'opened') {
        sfx.play('zap');
        banner(
          this,
          e.points ? `ABRIU A ${Math.round(e.alt)} m! +${e.points}` : 'ABRIU CEDO…',
          e.points ? '#fde047' : '#e0f2fe',
          520,
        );
      } else if (e.type === 'landed') {
        sfx.play('win');
        sfx.vibrate([30, 30, 60]);
        banner(this, 'POUSO!', '#86efac');
        shockwave(this, this.sim.x, DIVER_Y, 0x86efac, 160);
        this.time.delayedCall(1300, () => {
          if (this.ended) return;
          this.sim.next();
          this.makeSprites();
          banner(this, `SALTO ${this.sim.jump}`, '#ffffff', 420);
        });
      } else {
        sfx.play('boom');
        sfx.vibrate([80, 40, 80]);
        flash(this, 0xf97316, 0.4, 320);
        this.finish(
          this.sim.alt <= SAFE_ALT ? 'Abriu tarde demais!' : 'Bateu demais no caminho!',
          [`Saltos: ${this.sim.jump - 1} · Anéis: ${this.sim.rings}`],
          { score: this.sim.score, details: { jumps: this.sim.jump - 1, rings: this.sim.rings } },
          800,
        );
      }
    }
  }

  private draw(toY: (alt: number) => number): void {
    const g = this.g.clear();
    const s = this.sim;
    for (const t of s.things) {
      if (t.kind !== 'ring' || t.done) continue;
      const y = toY(t.alt);
      if (y < -80 || y > GAME_HEIGHT + 80) continue;
      g.lineStyle(10, 0xfde047, 1).strokeEllipse(t.x, y, radiusOf('ring') * 2, 46);
      g.lineStyle(4, 0xffffff, 0.8).strokeEllipse(t.x, y, radiusOf('ring') * 2 - 14, 34);
    }
    const ground = toY(0);
    if (ground < GAME_HEIGHT) {
      g.fillStyle(0x16a34a, 1).fillRect(0, ground, GAME_WIDTH, GAME_HEIGHT - ground);
      g.fillStyle(0xffffff, 1)
        .fillCircle(360, ground, 40)
        .fillStyle(0xef4444, 1)
        .fillCircle(360, ground, 26);
    }
    // The late-open zone is marked on the side.
    const bonus = toY(BONUS_ALT);
    if (bonus < GAME_HEIGHT && s.state === 'fall')
      g.fillStyle(0xfde047, 0.18).fillRect(0, bonus, 24, Math.max(0, ground - bonus));
    if (s.state === 'fall') {
      const pulse = 0.85 + Math.sin(this.time.now / 120) * 0.15 * (s.alt < BONUS_ALT ? 1 : 0);
      g.fillStyle(0xdc2626, 1).fillRoundedRect(110, BUTTON_Y - 48 * pulse, 500, 96 * pulse, 30);
    }
  }
}
