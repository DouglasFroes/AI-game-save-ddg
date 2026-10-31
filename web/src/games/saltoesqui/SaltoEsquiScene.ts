import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { FLIGHT_TIME, JUMPS, SkiJump, type JumpResult } from './core';

const RAMP_TOP = { x: 40, y: 330 };
const EDGE = { x: 300, y: 620 };
const LAND_Y = (x: number) => 660 + (x - 300) * 0.55;

/** "Salto de Esqui": nail the take-off, balance in the air and land a clean telemark. */
export class SaltoEsquiScene extends MiniScene {
  private ski = new SkiJump();
  private g!: Phaser.GameObjects.Graphics;
  private skier!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private phaseText!: Phaser.GameObjects.Text;
  private busy = false;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.SaltoEsqui, 'saltoesqui', [0x7dd3fc, 0xe0f2fe]);
  }

  create(): void {
    this.ski = new SkiJump();
    this.busy = false;
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.skier = emojiText(this, RAMP_TOP.x, RAMP_TOP.y, '⛷️', 56).setDepth(6);
    this.statusText = addText(this, GAME_WIDTH / 2, 168, '', 28, {
      color: '#0c4a6e',
      stroke: '#ffffff',
      strokeThickness: 6,
    }).setDepth(50);
    this.phaseText = addText(this, GAME_WIDTH / 2, 1180, '', 34, {
      color: '#ffffff',
      stroke: '#0c4a6e',
      strokeThickness: 7,
    }).setDepth(50);
    this.hintBox = hint(
      this,
      ['1) Toque na beira da rampa', '2) Segure/solte para equilibrar · 3) Toque ao pousar'],
      1060,
      6000,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (this.ended || this.busy) return;
      this.hintBox?.dismiss();
      this.ski.holding = true;
      const wasInrun = this.ski.phase === 'inrun';
      const res = this.ski.tap();
      if (wasInrun) {
        const q = this.ski.takeoff;
        getServices(this).sfx.play(q > 0.8 ? 'star' : 'bounce');
        this.pop(
          EDGE.x,
          EDGE.y - 70,
          q > 0.8 ? 'IMPULSO PERFEITO!' : q > 0.4 ? 'Bom impulso' : 'Impulso fraco',
          q > 0.8 ? '#fde047' : '#ffffff',
          32,
        );
      }
      if (res) this.landed(res);
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => (this.ski.holding = false));
  }

  private landed(r: JumpResult): void {
    const { sfx } = getServices(this);
    this.busy = true;
    if (r.fell) {
      sfx.play('hit');
      flash(this, 0xffffff, 0.4, 260);
      this.cameras.main.shake(220, 0.012);
      banner(this, `CAIU! ${r.distance} m`, '#fca5a5');
    } else {
      sfx.play('win');
      sfx.vibrate([30, 30, 60]);
      banner(this, `${r.distance} m · +${r.points}`, '#fde047');
      shockwave(this, this.skier.x, this.skier.y, 0xffffff, 140);
      burst(this, this.skier.x, this.skier.y, 0xffffff, 20, { speed: 260 });
    }
    this.setScore(this.ski.total);
    this.time.delayedCall(1500, () => {
      if (this.ended) return;
      this.ski.next();
      this.busy = false;
      if (this.ski.over) {
        const best = Math.max(...this.ski.results.map((x) => x.distance));
        this.finish(
          'Fim da competição!',
          [`Melhor salto: ${best} m · Quedas: ${this.ski.results.filter((x) => x.fell).length}`],
          { score: this.ski.total, details: { best: Math.round(best) } },
          300,
        );
      } else banner(this, `SALTO ${this.ski.jump}`, '#0c4a6e', 420);
    });
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    if (!this.busy) {
      const res = this.ski.step(Math.min(deltaMs, 40) / 1000);
      if (res) this.landed(res);
    }
    const s = this.ski;
    const windArrow = s.wind > 0.1 ? '→' : s.wind < -0.1 ? '←' : '·';
    this.statusText.setText(
      `Salto ${Math.min(s.jump, JUMPS)}/${JUMPS} · Vento ${windArrow} ${Math.abs(s.wind).toFixed(1)}`,
    );
    this.phaseText.setText(
      s.phase === 'inrun'
        ? 'Toque na beira da rampa!'
        : s.phase === 'flight'
          ? 'Mantenha no verde!'
          : s.phase === 'landing'
            ? 'POUSE AGORA!'
            : '',
    );
    this.phaseText.setColor(s.phase === 'landing' ? '#fde047' : '#ffffff');
    this.draw();
  }

  private draw(): void {
    const g = this.g.clear();
    const s = this.ski;
    // Snowy hill, ramp and landing slope.
    g.fillStyle(0xffffff, 1).fillPoints(
      [
        { x: 0, y: LAND_Y(0) + 40 },
        { x: GAME_WIDTH, y: LAND_Y(GAME_WIDTH) },
        { x: GAME_WIDTH, y: GAME_HEIGHT },
        { x: 0, y: GAME_HEIGHT },
      ],
      true,
    );
    g.lineStyle(14, 0x78350f, 1).lineBetween(RAMP_TOP.x, RAMP_TOP.y, EDGE.x, EDGE.y);
    g.lineStyle(3, 0xef4444, 1);
    for (let k = 0; k < 4; k++) {
      const x = 420 + k * 70;
      g.lineBetween(x, LAND_Y(x) - 6, x, LAND_Y(x) + 6);
    }
    // Skier position for each phase.
    let x: number;
    let y: number;
    if (s.phase === 'inrun') {
      const p = Math.min(1, s.inrunProgress);
      x = RAMP_TOP.x + (EDGE.x - RAMP_TOP.x) * p;
      y = RAMP_TOP.y + (EDGE.y - RAMP_TOP.y) * p;
    } else {
      const p = s.phase === 'flight' ? s.t / FLIGHT_TIME : 1;
      const reach = 300 + (s.takeoff * 0.4 + 0.3 + (s.lift / FLIGHT_TIME) * 0.3) * 380;
      x = EDGE.x + (reach - EDGE.x) * p;
      const ground = LAND_Y(x);
      y = EDGE.y + (ground - 30 - EDGE.y) * p - Math.sin(p * Math.PI) * (60 + s.takeoff * 60);
    }
    this.skier.setPosition(x, y - 20).setAngle(s.phase === 'flight' ? s.needle * 25 : 0);
    // Balance meter.
    if (s.phase === 'flight' || s.phase === 'landing') {
      g.fillStyle(0x0c4a6e, 0.85).fillRoundedRect(110, 980, 500, 40, 20);
      g.fillStyle(0x22c55e, 1).fillRect(360 - 0.3 * 250, 984, 0.6 * 250, 32);
      g.fillStyle(0xffffff, 1).fillRect(360 + s.needle * 250 - 5, 976, 10, 48);
    }
  }
}
