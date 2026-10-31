import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { RADIUS, RhythmSim, type RhythmEvent } from './core';

const HUES = [0xf472b6, 0x60a5fa, 0x34d399, 0xfbbf24, 0xa78bfa];
const LABEL: Record<string, [string, string]> = {
  perfect: ['PERFEITO', '#fde047'],
  good: ['BOM', '#86efac'],
  ok: ['OK', '#93c5fd'],
};

/** "Círculos do Ritmo": tap each circle right as its ring closes — on the beat. */
export class RitmoScene extends MiniScene {
  private sim = new RhythmSim();
  private g!: Phaser.GameObjects.Graphics;
  private numbers = new Map<number, Phaser.GameObjects.Text>();
  private statusText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private lastBeat = 0;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Ritmo, 'ritmo', [0x1e1b4b, 0x4a044e]);
  }

  create(): void {
    this.sim = new RhythmSim();
    this.numbers = new Map();
    this.lastBeat = 0;
    this.frame('0');
    this.input.addPointer(2);
    this.g = this.add.graphics().setDepth(5);
    this.statusText = addText(this, GAME_WIDTH / 2, 168, '', 28, {
      color: '#f5d0fe',
      stroke: '#1e1b4b',
      strokeThickness: 6,
    }).setDepth(50);
    this.comboText = addText(this, GAME_WIDTH / 2, 1200, '', 44, {
      color: '#ffffff',
      stroke: '#1e1b4b',
      strokeThickness: 8,
    }).setDepth(50);
    this.hintBox = hint(
      this,
      ['Toque no círculo quando o anel', 'encostar nele — no ritmo!'],
      700,
      3000,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.ended || p.y < 140) return;
      this.hintBox?.dismiss();
      this.handle(this.sim.tap(p.x, p.y));
    });
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.handle(this.sim.step(Math.min(deltaMs, 40) / 1000));
    const beat = Math.floor((this.sim.time * this.sim.bpm) / 60);
    if (beat !== this.lastBeat) {
      this.lastBeat = beat;
      getServices(this).sfx.play('tick', beat % 4 === 0 ? 4 : 0);
    }
    this.setScore(this.sim.score);
    this.statusText.setText(
      `♪ ${Math.round(this.sim.bpm)} BPM · Acertos ${this.sim.hits} · Perfeitos ${this.sim.perfects}`,
    );
    this.comboText.setText(this.sim.combo >= 5 ? `${this.sim.combo}x COMBO` : '');
    this.draw();
  }

  private handle(events: RhythmEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e.type === 'hit') {
        const [label, color] = LABEL[e.judgement]!;
        const hue = HUES[e.note.id % HUES.length]!;
        sfx.play(
          e.judgement === 'perfect' ? 'star' : 'pop',
          Math.min(8, Math.floor(this.sim.combo / 5)),
        );
        burst(this, e.note.x, e.note.y, hue, e.judgement === 'perfect' ? 18 : 10, { speed: 260 });
        if (e.judgement === 'perfect') shockwave(this, e.note.x, e.note.y, hue, 90);
        this.pop(e.note.x, e.note.y - 70, label, color, 34);
        this.numbers.get(e.note.id)?.destroy();
        this.numbers.delete(e.note.id);
      } else if (e.type === 'miss') {
        sfx.play('hit');
        this.pop(e.note.x, e.note.y - 60, 'X', '#f87171', 44);
        this.numbers.get(e.note.id)?.destroy();
        this.numbers.delete(e.note.id);
      } else {
        flash(this, 0xef4444, 0.35, 300);
        sfx.vibrate([60, 30, 60]);
        this.finish(
          'Perdeu o ritmo!',
          [`Maior combo: ${this.sim.bestCombo} · Perfeitos: ${this.sim.perfects}`],
          {
            score: this.sim.score,
            details: { combo: this.sim.bestCombo, perfect: this.sim.perfects },
          },
          700,
        );
      }
    }
  }

  private draw(): void {
    const g = this.g.clear();
    const s = this.sim;
    // Health bar.
    g.fillStyle(0x0f0a1e, 1).fillRoundedRect(110, 212, 500, 18, 9);
    g.fillStyle(s.health < 0.3 ? 0xef4444 : 0xe879f9, 1).fillRoundedRect(
      110,
      212,
      500 * s.health,
      18,
      9,
    );
    // Oldest first, so the next circle to hit is drawn on top.
    for (const n of [...s.notes].reverse()) {
      const hue = HUES[n.id % HUES.length]!;
      const left = n.at - s.time;
      const t = Phaser.Math.Clamp(left / s.approach, 0, 1);
      const alpha = Math.min(1, (1 - t) * 3);
      g.fillStyle(hue, 0.25 * alpha).fillCircle(n.x, n.y, RADIUS + 8);
      g.fillStyle(hue, alpha).fillCircle(n.x, n.y, RADIUS);
      g.lineStyle(5, 0xffffff, alpha).strokeCircle(n.x, n.y, RADIUS);
      g.lineStyle(4, 0xffffff, alpha * 0.9).strokeCircle(n.x, n.y, RADIUS * (1 + t * 2.2));
      let label = this.numbers.get(n.id);
      if (!label) {
        label = addText(this, n.x, n.y, String(n.n), 52, {
          color: '#ffffff',
          stroke: '#00000066',
          strokeThickness: 5,
        }).setDepth(6);
        this.numbers.set(n.id, label);
      }
      label.setAlpha(alpha);
    }
  }
}
