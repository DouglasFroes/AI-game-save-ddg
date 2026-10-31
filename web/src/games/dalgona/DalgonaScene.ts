import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { CX, CY, DalgonaRound, MAX_CRACKS, roundSpec, type TraceEvent } from './core';

const COOKIE_R = 300;

/** "Biscoito Dalgona": trace the shape slowly and precisely without cracking the candy. */
export class DalgonaScene extends MiniScene {
  private round!: DalgonaRound;
  private level = 1;
  private score = 0;
  private perfect = 0;
  private g!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private needle: { x: number; y: number } | null = null;
  private crackLines: Array<Array<{ x: number; y: number }>> = [];
  private pausing = false;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Dalgona, 'dalgona', [0x451a03, 0x1c1917]);
  }

  create(): void {
    this.level = 1;
    this.score = 0;
    this.perfect = 0;
    this.pausing = false;
    this.frame('0');
    this.g = this.add.graphics().setDepth(5);
    this.statusText = addText(this, GAME_WIDTH / 2, 170, '', 30, {
      color: '#fed7aa',
      stroke: '#451a03',
      strokeThickness: 6,
    }).setDepth(50);
    this.loadLevel();
    this.hintBox = hint(
      this,
      ['Passe o dedo devagar sobre o contorno', 'Saiu da linha ou foi rápido demais? Racha!'],
      1150,
      5000,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.ended || this.pausing || p.y < 140) return;
      this.hintBox?.dismiss();
      this.round.lift();
      this.needle = { x: p.x, y: p.y };
      this.handle(this.round.trace(p.x, p.y, this.time.now / 1000));
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (!p.isDown || this.ended || this.pausing || !this.needle) return;
      this.needle = { x: p.x, y: p.y };
      const before = this.round.progress;
      this.handle(this.round.trace(p.x, p.y, this.time.now / 1000));
      if (this.round.progress > before) getServices(this).sfx.play('draw');
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => {
      this.needle = null;
      this.round.lift();
    });
  }

  private loadLevel(): void {
    this.round = new DalgonaRound(roundSpec(this.level));
    this.crackLines = [];
  }

  private handle(events: TraceEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e.type === 'crack') {
        sfx.play('hit');
        sfx.vibrate([40, 20, 40]);
        this.cameras.main.shake(160, 0.01);
        this.addCrack();
        this.pop(CX, 330, e.why === 'fast' ? 'Devagar!' : 'Fora da linha!', '#fca5a5', 40);
        if (this.round.broken) {
          flash(this, 0xef4444, 0.35, 320);
          sfx.play('boom');
          this.end('O biscoito quebrou!');
        }
      } else {
        const pts = this.round.scoreFor(this.level);
        const clean = this.round.cracks === 0;
        this.score += pts;
        if (clean) this.perfect++;
        this.setScore(this.score);
        sfx.play('win');
        sfx.vibrate([30, 30, 60]);
        banner(this, clean ? 'PERFEITO!' : `+${pts}`, clean ? '#fde047' : '#86efac');
        shockwave(this, CX, CY, 0xfde047, 300);
        burst(this, CX, CY, 0xfbbf24, 30, { speed: 420 });
        this.pausing = true;
        this.needle = null;
        this.time.delayedCall(1200, () => {
          if (this.ended) return;
          this.level++;
          this.loadLevel();
          this.pausing = false;
          banner(this, this.round.spec.shape.toUpperCase(), '#fed7aa', 420);
        });
      }
    }
  }

  /** A jagged crack from the rim towards the middle. */
  private addCrack(): void {
    const a = Math.random() * Math.PI * 2;
    const line = [{ x: CX + Math.cos(a) * COOKIE_R, y: CY + Math.sin(a) * COOKIE_R }];
    const len = 3 + this.round.cracks * 2;
    for (let i = 1; i <= len; i++) {
      const r = COOKIE_R * (1 - i / (len + 2));
      const b = a + (Math.random() - 0.5) * 0.35;
      line.push({ x: CX + Math.cos(b) * r, y: CY + Math.sin(b) * r });
    }
    this.crackLines.push(line);
  }

  private end(title: string): void {
    this.finish(
      title,
      [`Formas: ${this.level - 1} · Perfeitas: ${this.perfect}`],
      { score: this.score, details: { shapes: this.level - 1, perfect: this.perfect } },
      900,
    );
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    if (!this.pausing) {
      this.round.tick(deltaMs / 1000);
      if (this.round.timeLeft <= 0) {
        getServices(this).sfx.play('hit');
        this.end('O tempo acabou!');
      }
    }
    const r = this.round;
    this.statusText.setText(
      `Forma ${this.level}: ${r.spec.shape} · ${Math.round(r.progress * 100)}% · Rachaduras ${r.cracks}/${MAX_CRACKS}`,
    );
    this.draw();
  }

  private draw(): void {
    const g = this.g.clear();
    const r = this.round;
    // Timer.
    const frac = r.timeLeft / r.spec.time;
    g.fillStyle(0x1c1917, 1).fillRoundedRect(110, 222, 500, 20, 10);
    g.fillStyle(frac < 0.25 ? 0xef4444 : 0xfbbf24, 1).fillRoundedRect(110, 222, 500 * frac, 20, 10);
    // Tin and honeycomb candy.
    g.fillStyle(0x52525b, 1).fillCircle(CX, CY, COOKIE_R + 40);
    g.fillStyle(0x71717a, 1).fillCircle(CX, CY, COOKIE_R + 26);
    g.fillStyle(0xd97706, 1).fillCircle(CX, CY, COOKIE_R);
    g.fillStyle(0xf59e0b, 1).fillCircle(CX - 30, CY - 30, COOKIE_R * 0.8);
    g.fillStyle(0xfbbf24, 0.5).fillCircle(CX - 60, CY - 70, COOKIE_R * 0.4);
    // The stamped outline, then what has been traced.
    for (let i = 0; i < r.points.length; i++) {
      const p = r.points[i]!;
      g.fillStyle(0x92400e, 1).fillCircle(p.x, p.y, 6);
    }
    for (let i = 0; i < r.points.length; i++) {
      if (!r.covered[i]) continue;
      const p = r.points[i]!;
      g.fillStyle(0xfef3c7, 1).fillCircle(p.x, p.y, 5);
    }
    // Cracks.
    g.lineStyle(4, 0x451a03, 1);
    for (const line of this.crackLines) g.strokePoints(line, false);
    // Needle.
    if (this.needle) {
      const { x, y } = this.needle;
      g.lineStyle(5, 0xd4d4d8, 1).lineBetween(x, y, x + 60, y - 110);
      g.fillStyle(0xffffff, 1).fillCircle(x, y, 5);
      g.lineStyle(2, 0xffffff, 0.35).strokeCircle(x, y, r.spec.tolerance);
    }
  }
}
