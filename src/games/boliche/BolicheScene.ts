import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  BALL_R,
  BowlingSim,
  FOUL_Y,
  frameOf,
  frameScores,
  GUTTER,
  LANE_L,
  LANE_R,
  PIN_R,
  PIT_Y,
  rollFromSwipe,
  type BowlEvent,
} from './core';

const CX = GAME_WIDTH / 2;
const SHEET_Y = 1182;

/** Marks of each frame on a bowling sheet ("X", "7 /", "9 -"…). */
function marks(rolls: readonly number[]): string[][] {
  const out: string[][] = [];
  let i = 0;
  for (let f = 0; f < 10 && i < rolls.length; f++) {
    const m: string[] = [];
    if (f < 9) {
      if (rolls[i] === 10) {
        m.push('X');
        i++;
      } else {
        const a = rolls[i]!;
        m.push(a === 0 ? '-' : String(a));
        if (i + 1 < rolls.length) {
          const b = rolls[i + 1]!;
          m.push(a + b === 10 ? '/' : b === 0 ? '-' : String(b));
        }
        i += 2;
      }
    } else {
      let rack = 10;
      for (; i < rolls.length; i++) {
        const v = rolls[i]!;
        if (v === 10 && rack === 10) m.push('X');
        else if (v === rack) m.push('/');
        else m.push(v === 0 ? '-' : String(v));
        rack = rack - v === 0 ? 10 : rack - v;
      }
    }
    out.push(m);
  }
  return out;
}

/** "Boliche": slide to place the ball, swipe up to roll; a curved swipe hooks it into the pocket. */
export class BolicheScene extends MiniScene {
  private sim = new BowlingSim();
  private pinsG!: Phaser.GameObjects.Graphics;
  private ball!: Phaser.GameObjects.Container;
  private holes!: Phaser.GameObjects.Graphics;
  private sheet!: Phaser.GameObjects.Graphics;
  private sheetTexts: Phaser.GameObjects.Text[] = [];
  private trailG!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private gesture: {
    kind: 'none' | 'place' | 'throw';
    x0: number;
    y0: number;
    path: Array<{ x: number; y: number; t: number }>;
  } | null = null;
  private roll = 0;
  private lastTick = 0;
  private trail: Array<{ x: number; y: number }> = [];
  private tutorial?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Boliche, 'boliche', [0x1e1b4b, 0x312e81]);
  }

  create(): void {
    this.sim = new BowlingSim();
    this.trail = [];
    this.sheetTexts = [];
    this.frame('0');
    this.drawLane();
    this.trailG = this.add.graphics().setDepth(1);
    this.pinsG = this.add.graphics().setDepth(2);
    const shadow = this.add.circle(4, 6, BALL_R, 0x000000, 0.35);
    const body = this.add.circle(0, 0, BALL_R, 0x1d4ed8).setStrokeStyle(3, 0x172554);
    const swirl = this.add.circle(-8, -6, 14, 0x60a5fa, 0.45);
    this.holes = this.add.graphics();
    const shine = this.add.circle(-11, -12, 6, 0xffffff, 0.5);
    this.ball = this.add
      .container(this.sim.ball.x, FOUL_Y, [shadow, body, swirl, this.holes, shine])
      .setDepth(3);
    this.sheet = this.add.graphics().setDepth(5);
    this.info = addText(this, CX, 1140, '', 24, { color: '#e0e7ff', weight: 'normal' }).setDepth(5);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y < 130 || this.sim.ball.rolling || this.ended) return;
      this.tutorial?.dismiss();
      this.gesture = {
        kind: 'none',
        x0: p.x,
        y0: p.y,
        path: [{ x: p.x, y: p.y, t: this.time.now }],
      };
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      const g = this.gesture;
      if (!g || !p.isDown) return;
      g.path.push({ x: p.x, y: p.y, t: this.time.now });
      if (g.kind === 'none') {
        const dx = p.x - g.x0;
        const dy = p.y - g.y0;
        if (dy < -28 && -dy > Math.abs(dx)) g.kind = 'throw';
        else if (Math.abs(dx) > 14) g.kind = 'place';
      }
      if (g.kind === 'place') {
        this.sim.place(p.x);
        this.ball.x = this.sim.ball.x;
      } else if (g.kind === 'throw') this.drawSwipe(g.path);
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => {
      const g = this.gesture;
      this.gesture = null;
      this.trailG.clear();
      if (!g || g.kind !== 'throw') return;
      const r = rollFromSwipe(this.sim.ball.x, g.path);
      if (r && this.sim.roll(r)) getServices(this).sfx.play('boom');
    });
    this.tutorial = hint(
      this,
      [
        'Arraste para o lado para posicionar',
        'Deslize para cima para jogar',
        'Curva no gesto = efeito na bola',
      ],
      760,
      5000,
    );
    this.drawSheet();
  }

  private drawLane(): void {
    const g = this.add.graphics().setDepth(-5);
    // Pit and gutters.
    g.fillStyle(0x0b0f19).fillRect(
      LANE_L - GUTTER - 20,
      120,
      LANE_R - LANE_L + GUTTER * 2 + 40,
      40,
    );
    g.fillStyle(0x374151).fillRect(LANE_L - GUTTER, 130, GUTTER, FOUL_Y + 60 - 130);
    g.fillStyle(0x374151).fillRect(LANE_R, 130, GUTTER, FOUL_Y + 60 - 130);
    g.fillStyle(0x1f2937)
      .fillRect(LANE_L - GUTTER + 6, 130, GUTTER - 12, FOUL_Y + 60 - 130)
      .fillRect(LANE_R + 6, 130, GUTTER - 12, FOUL_Y + 60 - 130);
    // Maple boards.
    g.fillStyle(0xe7b67a).fillRect(LANE_L, 150, LANE_R - LANE_L, FOUL_Y + 60 - 150);
    for (let i = 0; i <= 39; i++) {
      const x = LANE_L + ((LANE_R - LANE_L) * i) / 39;
      g.lineStyle(1, 0xc08a50, 0.5).lineBetween(x, 150, x, FOUL_Y + 60);
    }
    g.fillStyle(0xf3d9b1, 0.6).fillRect(LANE_L, 160, LANE_R - LANE_L, 300);
    // Arrows and dots used for aiming.
    for (let i = 1; i <= 7; i++) {
      const x = LANE_L + ((LANE_R - LANE_L) * (i * 5 - 0.5)) / 39;
      const y = 790 + Math.abs(i - 4) * 22;
      g.fillStyle(0x7c2d12).fillTriangle(x - 7, y + 16, x + 7, y + 16, x, y - 8);
      g.fillStyle(0x7c2d12).fillCircle(x, 980, 3);
    }
    g.lineStyle(4, 0x991b1b).lineBetween(LANE_L, FOUL_Y + 40, LANE_R, FOUL_Y + 40);
    g.fillStyle(0x111827, 0.4).fillRect(0, PIT_Y - 120, GAME_WIDTH, 2);
  }

  private drawSwipe(path: Array<{ x: number; y: number }>): void {
    const g = this.trailG.clear();
    g.lineStyle(8, 0xffffff, 0.45).strokePoints(path);
  }

  private drawPins(): void {
    const g = this.pinsG.clear();
    // Fallen pins first (under the standing ones), drawn lying along their motion.
    for (const p of this.sim.pins) {
      if (p.gone || !p.down) continue;
      const ang = Math.atan2(p.vy, p.vx || 0.001);
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const tip = { x: p.x + c * 26, y: p.y + s * 26 };
      g.lineStyle(18, 0xf1f5f9, 0.95).lineBetween(p.x - c * 18, p.y - s * 18, tip.x, tip.y);
      g.fillStyle(0xdc2626).fillCircle(p.x + c * 6, p.y + s * 6, 7);
      g.fillStyle(0xffffff).fillCircle(tip.x, tip.y, 8);
    }
    for (const p of this.sim.pins) {
      if (p.gone || p.down) continue;
      g.fillStyle(0x000000, 0.25).fillCircle(p.x + 3, p.y + 5, PIN_R);
      g.fillStyle(0xf8fafc).fillCircle(p.x, p.y, PIN_R);
      g.lineStyle(4, 0xdc2626).strokeCircle(p.x, p.y, PIN_R * 0.62);
      g.fillStyle(0xffffff).fillCircle(p.x - 3, p.y - 3, 5);
    }
  }

  private drawSheet(): void {
    const g = this.sheet.clear();
    for (const t of this.sheetTexts) t.destroy();
    this.sheetTexts = [];
    const m = marks(this.sim.rolls);
    const now = frameOf(this.sim.rolls);
    const totals = frameScores(this.sim.rolls);
    const w = 64;
    const x0 = (GAME_WIDTH - w * 10) / 2;
    for (let f = 0; f < 10; f++) {
      const x = x0 + f * w;
      const current = f === now.frame;
      g.fillStyle(current && !this.sim.over ? 0xfde68a : 0xffffff, 0.95).fillRoundedRect(
        x + 2,
        SHEET_Y,
        w - 4,
        70,
        8,
      );
      g.lineStyle(2, 0x1e1b4b).strokeRoundedRect(x + 2, SHEET_Y, w - 4, 70, 8);
      const marksText = (m[f] ?? []).join(' ');
      const total = totals[f];
      this.sheetTexts.push(
        addText(this, x + w / 2, SHEET_Y + 20, marksText, 20, { color: '#1e1b4b' }).setDepth(6),
        addText(
          this,
          x + w / 2,
          SHEET_Y + 50,
          total === null || total === undefined ? '' : String(total),
          22,
          { color: '#4338ca' },
        ).setDepth(6),
      );
    }
    this.info.setText(
      this.sim.over
        ? ''
        : `Frame ${now.frame + 1} · ${now.ball + 1}ª bola · Pinos em pé: ${this.sim.standing}`,
    );
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const events = this.sim.step(Math.min(deltaMs, 50) / 1000);
    this.handle(events);
    const b = this.sim.ball;
    if (b.rolling) {
      this.ball.setPosition(b.x, b.y);
      this.roll += Math.hypot(b.vx, b.vy) * Math.min(deltaMs, 50) * 0.00002;
      this.trail.push({ x: b.x, y: b.y });
      if (this.trail.length > 12) this.trail.shift();
      this.ball.setAlpha(b.y < PIT_Y - 60 ? 0 : 1);
    } else if (!this.gesture || this.gesture.kind !== 'place')
      this.ball.setPosition(b.x, FOUL_Y).setAlpha(1);
    // Finger holes turn with the roll.
    const hg = this.holes.clear();
    const ang = this.roll * 8;
    for (let i = 0; i < 3; i++) {
      const a = ang + i * 0.5;
      const y = Math.sin(a) * 14;
      if (Math.cos(a) > -0.2) hg.fillStyle(0x0b1430).fillCircle(i === 2 ? -8 : 4 + i * 8, y - 4, 4);
    }
    if (!b.rolling && this.trail.length) this.trail.shift();
    if (!this.gesture || this.gesture.kind !== 'throw') {
      const tg = this.trailG.clear();
      this.trail.forEach((p, i) =>
        tg.fillStyle(0x93c5fd, (i / 12) * 0.3).fillCircle(p.x, p.y, BALL_R * (i / 12)),
      );
    }
    this.drawPins();
  }

  private handle(events: BowlEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e.type === 'pin') {
        if (this.time.now - this.lastTick > 40) {
          this.lastTick = this.time.now;
          sfx.play('tick');
        }
        const p = this.sim.pins.find((q) => q.id === e.id)!;
        burst(this, p.x, p.y, 0xffffff, 5);
        if (this.sim.standing === 0) this.cameras.main.shake(120, 0.006);
      } else if (e.type === 'gutter') {
        sfx.play('hit');
        this.pop(CX, 700, 'Canaleta!', '#fca5a5', 44);
      } else if (e.type === 'done') {
        if (e.strike) {
          banner(this, 'STRIKE!', '#fde047', 640);
          flash(this, 0xfde047, 0.25, 300);
          shockwave(this, CX, 330, 0xfde047, 140);
          sfx.play('win');
          sfx.vibrate([40, 30, 80]);
        } else if (e.spare) {
          banner(this, 'SPARE!', '#86efac', 640);
          sfx.play('coin');
        } else if (e.knocked > 0)
          this.pop(CX, 640, `${e.knocked} pino${e.knocked > 1 ? 's' : ''}`, '#ffffff', 48);
        else this.pop(CX, 640, 'Nenhum pino…', '#fca5a5', 44);
        this.trail = [];
        this.setScore(this.sim.score);
        this.drawSheet();
        if (this.sim.over) {
          const strikes = marks(this.sim.rolls)
            .flat()
            .filter((x) => x === 'X').length;
          const spares = marks(this.sim.rolls)
            .flat()
            .filter((x) => x === '/').length;
          this.finish(
            this.sim.score >= 200
              ? 'Jogo de profissional! 🎳'
              : this.sim.score >= 120
                ? 'Belo jogo!'
                : 'Fim de jogo!',
            [`Pontos: ${this.sim.score} · Strikes: ${strikes} · Spares: ${spares}`],
            { score: this.sim.score, details: { strikes, spares } },
            1200,
          );
        }
      }
    }
  }
}
