import type Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { burst, flash, hint } from '@/platform/ui/juice';
import { heartsLabel, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { GROUND, KEY_ROWS, LetterRain, LIVES, type RainEvent } from './core';

const KEY_W = 64;
const KEY_H = 92;
const KEY_GAP = 6;
const KEYS_Y = 925;

/** "Chuva de Letras": tap the letter on the keyboard before it hits the ground. */
export class LetrasScene extends MiniScene {
  private rain = new LetterRain();
  private g!: Phaser.GameObjects.Graphics;
  private labels = new Map<number, Phaser.GameObjects.Text>();
  private keyBoxes = new Map<string, Phaser.GameObjects.Rectangle>();
  private statusText!: Phaser.GameObjects.Text;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Letras, 'letras', [0x0f172a, 0x172554]);
  }

  create(): void {
    this.rain = new LetterRain();
    this.labels = new Map();
    this.keyBoxes = new Map();
    this.frame('0');
    this.input.addPointer(2);
    this.g = this.add.graphics().setDepth(4);
    this.statusText = addText(this, GAME_WIDTH / 2, 168, '', 28, {
      color: '#bfdbfe',
      stroke: '#0f172a',
      strokeThickness: 6,
    }).setDepth(50);
    KEY_ROWS.forEach((row, r) => {
      const total = row.length * KEY_W + (row.length - 1) * KEY_GAP;
      [...row].forEach((ch, i) => {
        const x = (GAME_WIDTH - total) / 2 + i * (KEY_W + KEY_GAP) + KEY_W / 2;
        const y = KEYS_Y + r * (KEY_H + KEY_GAP) + KEY_H / 2;
        const box = this.add.rectangle(x, y, KEY_W, KEY_H, 0x334155).setDepth(5).setInteractive();
        addText(this, x, y, ch, 36, { color: '#ffffff' }).setDepth(6);
        box.on('pointerdown', () => this.press(ch));
        this.keyBoxes.set(ch, box);
      });
    });
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (/^[a-zA-Z]$/.test(e.key)) this.press(e.key.toUpperCase());
    });
    this.hintBox = hint(
      this,
      ['Toque a letra no teclado', 'antes que ela caia no chão!'],
      560,
      4000,
    );
  }

  private press(ch: string): void {
    if (this.ended) return;
    this.hintBox?.dismiss();
    const box = this.keyBoxes.get(ch);
    if (box) {
      box.setFillStyle(0x64748b);
      this.time.delayedCall(90, () => box.setFillStyle(0x334155));
    }
    this.handle(this.rain.press(ch));
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.handle(this.rain.step(Math.min(deltaMs, 40) / 1000));
    const r = this.rain;
    for (const d of r.drops) {
      let t = this.labels.get(d.id);
      if (!t) {
        t = addText(this, d.x, d.y, d.ch, 58, {
          color: '#ffffff',
          stroke: '#1d4ed8',
          strokeThickness: 8,
        }).setDepth(7);
        this.labels.set(d.id, t);
      }
      t.setPosition(d.x, d.y);
      // Letters near the ground turn red.
      t.setColor(d.y > GROUND - 160 ? '#fecaca' : '#ffffff');
    }
    this.setScore(r.score);
    this.statusText.setText(
      `Nível ${r.level} · ${heartsLabel(r.lives, LIVES)}${r.combo >= 3 ? ` · 🔥${r.combo}` : ''}`,
    );
    const g = this.g.clear();
    g.fillStyle(0xef4444, 0.25).fillRect(0, GROUND, GAME_WIDTH, 14);
    g.lineStyle(3, 0xf87171, 0.8).lineBetween(0, GROUND, GAME_WIDTH, GROUND);
  }

  private handle(events: RainEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e.type === 'zap') {
        sfx.play('pop', Math.min(8, Math.floor(this.rain.combo / 3)));
        burst(this, e.drop.x, e.drop.y, 0x60a5fa, 12, { speed: 240 });
        if (this.rain.combo % 10 === 0)
          this.pop(e.drop.x, e.drop.y - 50, `${this.rain.combo} SEGUIDAS!`, '#fde047', 34);
        this.labels.get(e.drop.id)?.destroy();
        this.labels.delete(e.drop.id);
      } else if (e.type === 'wrong') {
        sfx.play('locked');
      } else if (e.type === 'ground') {
        sfx.play('hit');
        sfx.vibrate(40);
        flash(this, 0xef4444, 0.25, 220);
        this.labels.get(e.drop.id)?.destroy();
        this.labels.delete(e.drop.id);
      } else {
        this.finish(
          'A chuva venceu!',
          [`Letras: ${this.rain.zapped} · Maior sequência: ${this.rain.bestCombo}`],
          {
            score: this.rain.score,
            details: { letters: this.rain.zapped, combo: this.rain.bestCombo },
          },
          700,
        );
      }
    }
  }
}
