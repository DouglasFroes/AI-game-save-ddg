import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene, heartsLabel } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { ArcherySim, BOW, GRAVITY, GROUND_Y, launch, LIVES, MAX_PULL, RINGS, targetY, type ArrowEvent, type Target } from './core';

const CX = GAME_WIDTH / 2;
const RING_COLORS = [0xfacc15, 0xef4444, 0x3b82f6, 0xf8fafc];

/** "Arqueiro Infinito": pull back, read the wind and let go. Endless targets, three lives. */
export class ArqueiroScene extends MiniScene {
  private sim = new ArcherySim();
  private archer!: Phaser.GameObjects.Graphics;
  private targetG!: Phaser.GameObjects.Graphics;
  private arrowG!: Phaser.GameObjects.Graphics;
  private aim!: Phaser.GameObjects.Graphics;
  private windG!: Phaser.GameObjects.Graphics;
  private livesText!: Phaser.GameObjects.Text;
  private multText!: Phaser.GameObjects.Text;
  private windText!: Phaser.GameObjects.Text;
  private drag: { x: number; y: number } | null = null;
  private pull = { x: 0, y: 0 };
  /** Arrows stuck in the current board (offsets from its centre). */
  private stuck: Array<{ dy: number; ang: number }> = [];
  /** The old board sliding away after a hit. */
  private leaving: { t: Target; time: number; k: number; stuck: Array<{ dy: number; ang: number }> } | null = null;
  private trail: Array<{ x: number; y: number }> = [];
  private tutorial?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Arqueiro, 'arqueiro', [0x38bdf8, 0xbae6fd]);
  }

  create(): void {
    this.sim = new ArcherySim();
    this.stuck = [];
    this.leaving = null;
    this.trail = [];
    this.frame('0');
    this.scoreText.setColor('#0f172a').setStroke('#ffffff', 10);
    this.drawScenery();
    this.windG = this.add.graphics().setDepth(1);
    this.targetG = this.add.graphics().setDepth(2);
    this.archer = this.add.graphics().setDepth(3);
    this.arrowG = this.add.graphics().setDepth(4);
    this.aim = this.add.graphics().setDepth(5);
    this.livesText = addText(this, 40, 176, '', 34, {}).setOrigin(0, 0.5).setDepth(6);
    this.multText = addText(this, GAME_WIDTH - 40, 176, '', 30, { color: '#b45309', stroke: '#ffffff', strokeThickness: 6 }).setOrigin(1, 0.5).setDepth(6);
    this.windText = addText(this, CX, 236, '', 26, { color: '#0f172a', stroke: '#ffffff', strokeThickness: 5 }).setDepth(6);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y < 130 || this.sim.arrow || this.ended) return;
      this.tutorial?.dismiss();
      this.drag = { x: p.x, y: p.y };
      this.pull = { x: 0, y: 0 };
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.drag) this.pull = { x: p.x - this.drag.x, y: p.y - this.drag.y };
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => {
      if (!this.drag) return;
      this.drag = null;
      this.aim.clear();
      if (this.sim.shoot(this.pull.x, this.pull.y)) {
        getServices(this).sfx.play('zap');
        this.trail = [];
      }
      this.pull = { x: 0, y: 0 };
    });
    this.tutorial = hint(this, ['Puxe para TRÁS (para a esquerda) e solte', 'Atenção ao vento!', 'Errou 3 vezes, acabou'], 700, 5500);
  }

  private drawScenery(): void {
    const g = this.add.graphics().setDepth(-5);
    g.fillStyle(0xfef9c3).fillCircle(600, 330, 54);
    g.fillStyle(0x86efac).fillEllipse(180, GROUND_Y - 10, 700, 260).fillEllipse(620, GROUND_Y, 600, 300);
    g.fillStyle(0x4ade80).fillRect(0, GROUND_Y - 40, GAME_WIDTH, 400);
    g.fillStyle(0x16a34a).fillRect(0, GROUND_Y - 40, GAME_WIDTH, 10);
    for (let i = 0; i < 40; i++) g.fillStyle(0x15803d).fillTriangle((i * 37) % 720, GROUND_Y - 30, (i * 37) % 720 + 6, GROUND_Y - 48, (i * 37) % 720 + 12, GROUND_Y - 30);
  }

  // ---------------------------------------------------------------- drawing

  private drawArcher(): void {
    const g = this.archer.clear();
    const v = launch(this.pull.x, this.pull.y);
    const ang = v ? Math.atan2(v.vy, v.vx) : -0.15;
    const draw = v ? Math.min(1, Math.hypot(this.pull.x, this.pull.y) / MAX_PULL) : 0;
    // Archer.
    const feet = { x: BOW.x - 34, y: GROUND_Y - 40 };
    g.lineStyle(10, 0x1e293b).lineBetween(feet.x - 14, feet.y, feet.x, feet.y - 80).lineBetween(feet.x + 14, feet.y, feet.x, feet.y - 80);
    g.lineStyle(16, 0x15803d).lineBetween(feet.x, feet.y - 80, BOW.x - 30, BOW.y - 20);
    g.fillStyle(0xf1c27d).fillCircle(BOW.x - 30, BOW.y - 50, 16);
    g.fillStyle(0x166534).fillTriangle(BOW.x - 48, BOW.y - 56, BOW.x - 12, BOW.y - 56, BOW.x - 34, BOW.y - 92);
    // Bow: an arc facing the aim, the string pulled back with the finger.
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const tip1 = { x: BOW.x - s * 70, y: BOW.y + c * 70 };
    const tip2 = { x: BOW.x + s * 70, y: BOW.y - c * 70 };
    const belly = { x: BOW.x + c * 26, y: BOW.y + s * 26 };
    g.lineStyle(7, 0x92400e);
    g.beginPath();
    g.moveTo(tip1.x, tip1.y);
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = (1 - t) * (1 - t) * tip1.x + 2 * (1 - t) * t * (belly.x + c * 30) + t * t * tip2.x;
      const y = (1 - t) * (1 - t) * tip1.y + 2 * (1 - t) * t * (belly.y + s * 30) + t * t * tip2.y;
      g.lineTo(x, y);
    }
    g.strokePath();
    const nock = { x: BOW.x - c * (draw * 70), y: BOW.y - s * (draw * 70) };
    g.lineStyle(2, 0xf8fafc).lineBetween(tip1.x, tip1.y, nock.x, nock.y).lineBetween(nock.x, nock.y, tip2.x, tip2.y);
    g.lineStyle(4, 0xf1c27d).lineBetween(BOW.x - 30, BOW.y - 20, nock.x, nock.y).lineBetween(BOW.x - 30, BOW.y - 20, BOW.x, BOW.y);
    if (!this.sim.arrow && !this.sim.over) this.drawArrow(g, nock.x + c * 95, nock.y + s * 95, ang);
  }

  private drawArrow(g: Phaser.GameObjects.Graphics, x: number, y: number, ang: number): void {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    g.lineStyle(5, 0x78350f).lineBetween(x - c * 90, y - s * 90, x, y);
    g.fillStyle(0x64748b).fillTriangle(x + c * 14, y + s * 14, x - s * 7, y + c * 7, x + s * 7, y - c * 7);
    g.fillStyle(0xef4444).fillTriangle(x - c * 90, y - s * 90, x - c * 72 - s * 10, y - s * 72 + c * 10, x - c * 72, y - s * 72);
    g.fillStyle(0xef4444).fillTriangle(x - c * 90, y - s * 90, x - c * 72 + s * 10, y - s * 72 - c * 10, x - c * 72, y - s * 72);
  }

  private drawBoard(g: Phaser.GameObjects.Graphics, t: Target, time: number, dx: number, stuck: Array<{ dy: number; ang: number }>): void {
    const x = t.x + dx;
    const y = targetY(t, time);
    g.lineStyle(10, 0x78350f).lineBetween(x + 6, y + t.r * 0.6, x + 50, GROUND_Y - 40).lineBetween(x + 6, y + t.r * 0.6, x - 30, GROUND_Y - 40);
    // Rings seen edge-on: colour bands from the edge to the centre.
    for (let i = RINGS.length - 1; i >= 0; i--) {
      const h = RINGS[i]!.upTo * t.r;
      g.fillStyle(RING_COLORS[i]!).fillEllipse(x, y, 34, h * 2);
    }
    g.lineStyle(3, 0x0f172a, 0.6).strokeEllipse(x, y, 34, t.r * 2);
    for (const a of stuck) this.drawArrow(g, x + 6, y + a.dy, a.ang);
  }

  private drawWind(): void {
    const g = this.windG.clear();
    const w = this.sim.target.wind;
    const n = Math.round(Math.abs(w) / 60);
    this.windText.setText(n === 0 ? 'Sem vento' : `Vento ${w > 0 ? '→' : '←'} ${'●'.repeat(Math.min(5, n))}`);
    // Little streaks drifting with the wind.
    if (n === 0) return;
    const t = this.time.now / 1000;
    for (let i = 0; i < 10; i++) {
      const x = ((i * 97 + t * w * 0.8) % 760 + 760) % 760 - 20;
      const y = 300 + ((i * 131) % 600);
      g.lineStyle(2, 0xffffff, 0.6).lineBetween(x, y, x + Math.sign(w) * 28, y);
    }
  }

  // ---------------------------------------------------------------- frame

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    const prev = this.sim.target;
    const prevTime = this.sim.time;
    this.handle(this.sim.step(dt), prev, prevTime);
    this.drawWind();
    this.drawArcher();
    if (this.drag) this.drawAim();
    const tg = this.targetG.clear();
    if (this.leaving) {
      this.leaving.k += dt * 2.2;
      this.drawBoard(tg, this.leaving.t, this.leaving.time, this.leaving.k * this.leaving.k * 500, this.leaving.stuck);
      if (this.leaving.k > 1.2) this.leaving = null;
    }
    const enter = this.leaving ? 400 * (1 - Math.min(1, this.leaving.k)) : 0;
    this.drawBoard(tg, this.sim.target, this.sim.time, enter, this.stuck);
    const ag = this.arrowG.clear();
    const a = this.sim.arrow;
    if (a) {
      this.trail.push({ x: a.x, y: a.y });
      if (this.trail.length > 16) this.trail.shift();
      this.trail.forEach((p, i) => ag.fillStyle(0xffffff, (i / 16) * 0.5).fillCircle(p.x, p.y, 3));
      this.drawArrow(ag, a.x, a.y, Math.atan2(a.vy, a.vx));
    }
    this.livesText.setText(heartsLabel(this.sim.lives, LIVES));
    this.multText.setText(this.sim.multiplier > 1 ? `x${this.sim.multiplier.toFixed(1).replace('.0', '')} 🔥` : this.sim.streak ? `Sequência ${this.sim.streak}` : '');
  }

  /** The first stretch of the flight, as dots (wind included): the rest you have to judge. */
  private drawAim(): void {
    const g = this.aim.clear();
    const v = launch(this.pull.x, this.pull.y);
    if (!v) return;
    const w = this.sim.target.wind;
    for (let i = 1; i <= 10; i++) {
      const t = i * 0.03;
      const x = BOW.x + v.vx * t + 0.5 * w * t * t;
      const y = BOW.y + v.vy * t + 0.5 * GRAVITY * t * t;
      g.fillStyle(0x0f172a, 0.7 - i * 0.06).fillCircle(x, y, 6 - i * 0.35);
    }
  }

  private handle(events: ArrowEvent[], prev: Target, prevTime: number): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e.type === 'hit') {
        const x = prev.x;
        const y = targetY(prev, prevTime) + e.dy;
        const bull = e.ring === 0;
        sfx.play(bull ? 'win' : 'coin', 3 - e.ring);
        burst(this, x, y, RING_COLORS[e.ring]!, bull ? 24 : 12);
        this.pop(x - 30, y - 70, `+${e.points}`, bull ? '#facc15' : '#0f172a', bull ? 50 : 38);
        if (bull) {
          shockwave(this, x, y, 0xfacc15, 90);
          banner(this, e.name, '#facc15', 560);
          flash(this, 0xfde047, 0.18, 200);
        } else this.pop(x - 30, y - 120, e.name, '#0f172a', 28);
        // The board with its arrow slides away; a new one comes in.
        this.leaving = { t: prev, time: prevTime, k: 0, stuck: [...this.stuck, { dy: e.dy, ang: 0.2 }] };
        this.stuck = [];
        this.setScore(this.sim.score);
      } else if (e.type === 'miss') {
        sfx.play('hit');
        sfx.vibrate([60]);
        flash(this, 0xdc2626, 0.25, 240);
        this.cameras.main.shake(140, 0.006);
        this.pop(CX, 640, 'Errou!', '#dc2626', 50);
      } else if (e.type === 'life') {
        sfx.play('level');
        this.pop(120, 230, '+❤️', '#dc2626', 44);
      } else if (e.type === 'over') {
        const s = this.sim;
        this.finish(
          s.hits >= 30 ? 'Robin Hood! 🏹' : 'Sem flechas!',
          [`Acertos: ${s.hits} · Moscas: ${s.bullseyes} · Flechas: ${s.shots}`],
          { score: s.score, details: { hits: s.hits, bullseyes: s.bullseyes } },
        );
      }
    }
  }
}
