import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { dropAt, driftPerWind, SHOTS, SniperSim, STEADY, targetRadius, type SniperEvent } from './core';

const CX = GAME_WIDTH / 2;
const CY = 650;
const SCOPE_R = 290;
/** Screen pixels per mil inside the scope. */
const PX = 42;
const FIRE = { x: 570, y: 1130, r: 88 };
const fmt = (n: number, d = 1): string => n.toFixed(d).replace('.', ',');

/** "Tiro de Precisão": drag to aim, hold the button to steady the breath, let go to fire. */
export class SniperScene extends MiniScene {
  private sim = new SniperSim();
  private world!: Phaser.GameObjects.Graphics;
  private reticle!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private ballistics!: Phaser.GameObjects.Text;
  private fireText!: Phaser.GameObjects.Text;
  private breathText!: Phaser.GameObjects.Text;
  private onButton = false;
  private last: { x: number; y: number } | null = null;
  private tracer: { t: number } | null = null;
  private holeVisible = false;
  private cards: Phaser.GameObjects.Text[] = [];
  private tutorial?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Sniper, 'sniper', [0x0b0f0b, 0x111827]);
  }

  create(): void {
    this.sim = new SniperSim();
    this.onButton = false;
    this.last = null;
    this.tracer = null;
    this.holeVisible = false;
    this.frame('0');
    this.world = this.add.graphics().setDepth(1);
    const mask = this.make.graphics({}, false).fillStyle(0xffffff).fillCircle(CX, CY, SCOPE_R);
    this.world.setMask(mask.createGeometryMask());
    this.reticle = this.add.graphics().setDepth(3);
    this.drawReticle();
    this.hud = this.add.graphics().setDepth(4);
    this.info = addText(this, CX, 196, '', 32, { color: '#ffffff' }).setDepth(5);
    this.ballistics = addText(this, CX, 250, '', 26, { color: '#86efac' }).setDepth(5);
    this.fireText = addText(this, FIRE.x, FIRE.y, 'SEGURE\nE SOLTE', 26, { color: '#ffffff', stroke: '#450a0a', align: 'center' }).setDepth(5);
    this.cards = Array.from({ length: SHOTS }, (_, i) => addText(this, 72 + i * 64, 1232, '', 24, { color: '#ffffff' }).setDepth(5));
    this.breathText = addText(this, 230, 1080, '', 24, { color: '#cbd5e1' }).setDepth(5);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y < 130 || this.ended) return;
      this.tutorial?.dismiss();
      this.last = { x: p.x, y: p.y };
      this.onButton = Math.hypot(p.x - FIRE.x, p.y - FIRE.y) < FIRE.r + 20;
      if (this.onButton) this.sim.hold(true);
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (!p.isDown || !this.last || this.ended) return;
      // Fine adjustments while the breath is held, coarse ones otherwise.
      const k = this.onButton ? 0.35 : 0.6;
      this.sim.aim(((p.x - this.last.x) / PX) * k, ((p.y - this.last.y) / PX) * k);
      this.last = { x: p.x, y: p.y };
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => {
      this.last = null;
      if (this.onButton && this.sim.holding) this.handle(this.sim.fire());
      this.onButton = false;
      this.sim.hold(false);
    });
    this.tutorial = hint(
      this,
      ['Arraste para mirar', 'Segure o botão: prende a respiração', 'Solte para atirar · mire acima (a bala cai)'],
      1000,
      7000,
    );
  }

  /** World mils → screen, around the point the rifle points at. */
  private sx(mx: number, view: number): number {
    return CX + (mx - view) * PX;
  }

  private drawReticle(): void {
    const g = this.reticle;
    g.lineStyle(3, 0x000000, 0.9);
    g.lineBetween(CX - SCOPE_R, CY, CX - 24, CY).lineBetween(CX + 24, CY, CX + SCOPE_R, CY);
    g.lineBetween(CX, CY - SCOPE_R, CX, CY - 24).lineBetween(CX, CY + 24, CX, CY + SCOPE_R);
    g.lineStyle(1.5, 0x000000, 0.9).lineBetween(CX - 24, CY, CX + 24, CY).lineBetween(CX, CY - 24, CX, CY + 24);
    // Mil marks, every half mil, longer every mil.
    for (let m = -6; m <= 6; m += 0.5) {
      if (m === 0) continue;
      const len = Number.isInteger(m) ? 9 : 5;
      g.lineBetween(CX + m * PX, CY - len, CX + m * PX, CY + len);
      g.lineBetween(CX - len, CY + m * PX, CX + len, CY + m * PX);
    }
    for (let m = 2; m <= 6; m += 2) {
      addText(this, CX + 16, CY + m * PX, `${m}`, 18, { color: '#000000', stroke: '#ffffff' }).setDepth(3).setOrigin(0, 0.5);
      addText(this, CX + m * PX, CY - 22, `${m}`, 18, { color: '#000000', stroke: '#ffffff' }).setDepth(3);
    }
    // Scope tube.
    g.lineStyle(26, 0x020617).strokeCircle(CX, CY, SCOPE_R + 12);
    g.lineStyle(4, 0x334155).strokeCircle(CX, CY, SCOPE_R + 26);
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    this.handle(this.sim.step(dt));
    this.drawWorld();
    this.drawHud();
  }

  private drawWorld(): void {
    const s = this.sim;
    const tg = s.target;
    const sway = s.sway;
    const vx = s.aimX + sway.x;
    const vy = s.aimY + sway.y;
    const X = (m: number) => this.sx(m, vx);
    const Y = (m: number) => CY + (m - vy) * PX;
    const r = targetRadius(tg.distance);
    const g = this.world.clear();
    const ground = r * 1.9;
    // Sky, far hills, grass.
    g.fillStyle(0x7dd3fc).fillRect(0, 0, GAME_WIDTH, 1280);
    g.fillStyle(0xbae6fd).fillRect(0, Y(-9), GAME_WIDTH, PX * 6);
    g.fillStyle(0x4d7c0f);
    for (let m = -16; m < 16; m += 2) g.fillTriangle(X(m - 3), Y(ground - 1), X(m), Y(ground - 3.5 - Math.abs(Math.sin(m)) * 2), X(m + 3), Y(ground - 1));
    g.fillStyle(0x65a30d).fillRect(0, Y(ground - 1), GAME_WIDTH, 2000);
    g.fillStyle(0x84cc16).fillRect(0, Y(ground), GAME_WIDTH, 2000);
    for (let m = -14; m < 14; m += 1.3) g.fillStyle(0x3f6212).fillEllipse(X(m), Y(ground + 0.1 + (Math.abs(m * 7) % 3) * 0.6), 18, 6);
    // Wind flags.
    const wind = s.wind;
    for (const fx of [-6, 5.5]) {
      const bx = X(fx);
      const top = Y(ground - 3);
      g.lineStyle(3, 0x1f2937).lineBetween(bx, Y(ground), bx, top);
      const len = 14 + Math.min(1, Math.abs(wind) / 8) * 40;
      const droop = (1 - Math.min(1, Math.abs(wind) / 8)) * 30;
      const flap = Math.sin(this.time.now / 90 + fx) * 4;
      g.fillStyle(0xf97316).fillTriangle(bx, top, bx, top + 22, bx + Math.sign(wind || 1) * len, top + 11 + droop + flap);
    }
    // Target board on its stand.
    const tx = X(tg.x);
    const ty = Y(0);
    const rp = r * PX;
    g.lineStyle(Math.max(3, rp * 0.1), 0x78350f).lineBetween(tx - rp * 0.6, ty, tx - rp * 0.8, Y(ground)).lineBetween(tx + rp * 0.6, ty, tx + rp * 0.8, Y(ground));
    g.fillStyle(0xd6d3d1).fillRect(tx - rp * 1.15, ty - rp * 1.15, rp * 2.3, rp * 2.3);
    for (let ring = 1; ring <= 10; ring++) {
      const rr = rp * (1 - (ring - 1) / 10);
      const dark = ring >= 7;
      g.fillStyle(dark ? 0x111827 : 0xfafaf9).fillCircle(tx, ty, rr);
      g.lineStyle(1, dark ? 0xfafaf9 : 0x111827, 0.7).strokeCircle(tx, ty, rr);
    }
    g.fillStyle(0xef4444).fillCircle(tx, ty, Math.max(2, rp * 0.05));
    // Hole of the latest shot (on this board).
    const lastHit = this.holeVisible && !s.flight ? s.impacts[s.impacts.length - 1] : undefined;
    if (lastHit && lastHit.ring > 0) {
      g.fillStyle(0xfde047).fillCircle(X(tg.x + lastHit.dx), Y(lastHit.dy), 9);
      g.fillStyle(0x000000).fillCircle(X(tg.x + lastHit.dx), Y(lastHit.dy), 5);
    } else if (lastHit) g.fillStyle(0x713f12, 0.8).fillCircle(X(tg.x + lastHit.dx), Y(Math.max(lastHit.dy, ground)), 10);
    // Training aid on the first two shots: where to hold.
    if (s.shot < 2 && s.ready) {
      const hx = X(tg.x - s.target.wind * driftPerWind(tg.distance));
      const hy = Y(-dropAt(tg.distance));
      g.lineStyle(3, 0x22c55e, 0.5 + 0.3 * Math.sin(this.time.now / 150)).strokeCircle(hx, hy, 14);
    }
    // Tracer.
    if (this.tracer && s.flight) {
      const k = Math.min(1, this.tracer.t / s.timeOfFlight);
      const ex = X(s.flight.x);
      const ey = Y(s.flight.y);
      const px = Phaser.Math.Linear(CX, ex, k);
      const py = Phaser.Math.Linear(CY + 40, ey, k) - Math.sin(k * Math.PI) * 30;
      g.fillStyle(0xfef08a).fillCircle(px, py, 5 - k * 3);
      this.tracer.t += Math.min(this.game.loop.delta, 50) / 1000;
    }
    // Vignette ring inside the lens.
    for (let i = 0; i < 12; i++) g.lineStyle(5, 0x000000, 0.045 * (i + 1)).strokeCircle(CX, CY, SCOPE_R - 54 + i * 5);
  }

  private drawHud(): void {
    const s = this.sim;
    const tg = s.target;
    const g = this.hud.clear();
    const wind = s.wind;
    this.info.setText(`Tiro ${tg.n + 1}/${SHOTS} · ${tg.distance} m${tg.speed ? ' · ALVO ANDANDO' : ''}`);
    this.ballistics.setText(
      `Queda ↓${fmt(dropAt(tg.distance))} mil · Vento ${wind >= 0 ? '→' : '←'} ${fmt(Math.abs(wind))} m/s (${fmt(driftPerWind(tg.distance), 2)} mil cada)`,
    );
    // Fire button.
    const ready = s.ready;
    const pressed = this.onButton && s.holding;
    g.fillStyle(0x000000, 0.4).fillCircle(FIRE.x + 6, FIRE.y + 8, FIRE.r);
    g.fillStyle(!ready ? 0x44403c : pressed ? 0x991b1b : 0xdc2626).fillCircle(FIRE.x, FIRE.y, FIRE.r * (pressed ? 0.94 : 1));
    g.lineStyle(6, 0xfca5a5, ready ? 0.8 : 0.2).strokeCircle(FIRE.x, FIRE.y, FIRE.r * (pressed ? 0.94 : 1));
    this.fireText.setText(!ready ? '...' : pressed ? 'SOLTE\nP/ ATIRAR' : 'SEGURE\nE SOLTE');
    // Breath meter: steady window in green, then shaking.
    const x0 = 50;
    const w = 360;
    const max = STEADY + 1.5;
    g.fillStyle(0x000000, 0.5).fillRoundedRect(x0, 1110, w, 30, 12);
    g.fillStyle(0x16a34a, 0.35).fillRect(x0 + (0.5 / max) * w, 1110, ((STEADY - 0.5) / max) * w, 30);
    const frac = Math.min(1, s.breath / max);
    const color = !s.holding ? 0x64748b : s.breath < 0.5 ? 0xfacc15 : s.breath < STEADY ? 0x22c55e : 0xef4444;
    g.fillStyle(color).fillRoundedRect(x0, 1110, Math.max(24, w * frac), 30, 12);
    this.breathText.setText(
      !s.holding ? 'Respiração' : s.breath < 0.5 ? 'Prendendo…' : s.breath < STEADY ? 'Firme!' : 'Tremendo! Solte',
    );
    // Scorecard of previous shots.
    for (let i = 0; i < SHOTS; i++) {
      const cx = 72 + i * 64;
      const imp = s.impacts[i];
      g.fillStyle(imp ? (imp.ring >= 9 ? 0xfacc15 : imp.ring >= 6 ? 0x22c55e : imp.ring ? 0x64748b : 0x7f1d1d) : 0x1f2937).fillCircle(cx, 1232, 24);
      if (i === s.shot && !s.over) g.lineStyle(3, 0xffffff).strokeCircle(cx, 1232, 26);
    }
    this.cards.forEach((t, i) => {
      const imp = s.impacts[i];
      t.setText(imp ? (imp.x ? 'X' : `${imp.ring}`) : '');
    });
  }

  private handle(events: SniperEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e.type === 'fired') {
        sfx.play('boom');
        sfx.vibrate([40]);
        flash(this, 0xfffbeb, 0.25, 120);
        this.cameras.main.shake(140, 0.01);
        this.tracer = { t: 0 };
      } else if (e.type === 'impact') {
        const imp = e.impact;
        this.holeVisible = true;
        this.tracer = null;
        if (imp.ring === 0) {
          sfx.play('hit');
          this.pop(CX, CY - 200, 'Errou!', '#fca5a5', 52);
        } else {
          sfx.play(imp.ring >= 9 ? 'win' : 'coin', imp.ring - 1);
          const label = imp.x ? 'X! NO CENTRO' : imp.ring === 10 ? 'DEZ!' : `${imp.ring}`;
          this.pop(CX, CY - 200, `${label} +${imp.points}`, imp.ring >= 9 ? '#fde047' : '#ffffff', imp.ring >= 9 ? 56 : 46);
          if (imp.ring >= 9) burst(this, CX, CY - 200, 0xfde047, 20);
        }
        this.setScore(this.sim.score);
      } else if (e.type === 'next') {
        this.holeVisible = false;
        sfx.play('click');
        if (e.target.speed && e.target.n === 5) banner(this, 'Alvos andando! Antecipe', '#fde047', 420);
      } else if (e.type === 'over') {
        const s = this.sim;
        this.finish(
          s.xs >= 3 || s.tens >= 6 ? 'Atirador de elite! 🎯' : 'Fim da série',
          [`Dez: ${s.tens} · X: ${s.xs} · Pontos: ${s.score}`],
          { score: s.score, details: { tens: s.tens, xs: s.xs } },
        );
      }
    }
  }
}
