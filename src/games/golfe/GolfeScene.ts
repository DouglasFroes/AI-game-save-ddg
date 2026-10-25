import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { AREA, BALL_R, CUP_R, GolfSim, MAX_PULL, MAX_STROKES, moverAt, type Rect } from './core';

const CX = GAME_WIDTH / 2;

/** "Mini Golfe": pull back from anywhere and let go to putt. Nine holes, mind the par. */
export class GolfeScene extends MiniScene {
  private sim = new GolfSim();
  private course!: Phaser.GameObjects.Graphics;
  private water!: Phaser.GameObjects.Graphics;
  private movers!: Phaser.GameObjects.Graphics;
  private aim!: Phaser.GameObjects.Graphics;
  private ball!: Phaser.GameObjects.Container;
  private trail: Array<{ x: number; y: number }> = [];
  private trailG!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private card!: Phaser.GameObjects.Text;
  private drag: { x: number; y: number } | null = null;
  private pull = { x: 0, y: 0 };
  private busy = false;
  private lastBounce = 0;
  private tutorial?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Golfe, 'golfe', [0x052e16, 0x14532d]);
  }

  create(): void {
    this.sim = new GolfSim();
    this.busy = false;
    this.drag = null;
    this.trail = [];
    this.frame('0');
    this.course = this.add.graphics();
    this.water = this.add.graphics();
    this.movers = this.add.graphics().setDepth(3);
    this.trailG = this.add.graphics().setDepth(4);
    this.aim = this.add.graphics().setDepth(6);
    const shadow = this.add.circle(3, 5, BALL_R, 0x000000, 0.3);
    const body = this.add.circle(0, 0, BALL_R, 0xffffff).setStrokeStyle(2, 0xcbd5e1);
    const shine = this.add.circle(-4, -4, 4, 0xffffff);
    this.ball = this.add.container(0, 0, [shadow, body, shine]).setDepth(5);
    this.info = addText(this, CX, 160, '', 28, { color: '#ffffff', stroke: '#052e16' });
    this.card = addText(this, CX, 1250, '', 24, { color: '#bbf7d0', weight: 'normal' });
    this.tweens.add({ targets: this.water, alpha: 0.75, duration: 900, yoyo: true, repeat: -1 });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y < 130 || this.busy || this.sim.moving || this.ended) return;
      this.tutorial?.dismiss();
      this.drag = { x: p.x, y: p.y };
      this.pull = { x: 0, y: 0 };
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (!this.drag) return;
      this.pull = { x: p.x - this.drag.x, y: p.y - this.drag.y };
      this.drawAim();
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => this.release());
    this.buildHole();
    this.tutorial = hint(
      this,
      ['Puxe para trás e solte', 'Quanto mais puxar, mais forte'],
      1100,
      4000,
    );
  }

  // ---------------------------------------------------------------- drawing

  private buildHole(): void {
    const h = this.sim.current;
    const g = this.course.clear();
    const a = AREA;
    g.fillStyle(0x3f2a14).fillRoundedRect(a.x - 16, a.y - 16, a.w + 32, a.h + 32, 26);
    g.fillStyle(0x16a34a).fillRect(a.x, a.y, a.w, a.h);
    for (let i = 0; i < a.h / 60; i++)
      g.fillStyle(0x15803d, 0.55).fillRect(a.x, a.y + i * 120, a.w, 60);
    for (const s of h.slopes ?? []) {
      g.fillStyle(0x4ade80, 0.22).fillRect(s.x, s.y, s.w, s.h);
      const ang = Math.atan2(s.ay, s.ax);
      for (let y = s.y + 40; y < s.y + s.h; y += 80)
        for (let x = s.x + 40; x < s.x + s.w; x += 90) this.chevron(g, x, y, ang);
    }
    for (const s of h.sand ?? []) {
      g.fillStyle(0xe9c46a).fillRoundedRect(s.x, s.y, s.w, s.h, 26);
      g.fillStyle(0xd4a373, 0.8);
      for (let i = 0; i < (s.w * s.h) / 700; i++)
        g.fillCircle(s.x + 10 + ((i * 53) % (s.w - 20)), s.y + 10 + ((i * 31) % (s.h - 20)), 2);
    }
    const w = this.water.clear();
    for (const q of h.water ?? []) {
      w.fillStyle(0x0ea5e9).fillRoundedRect(q.x, q.y, q.w, q.h, 14);
      w.lineStyle(3, 0xbae6fd, 0.7);
      for (let y = q.y + 16; y < q.y + q.h - 8; y += 22)
        for (let x = q.x + 12; x < q.x + q.w - 24; x += 46) w.lineBetween(x, y, x + 20, y - 5);
    }
    for (const q of h.walls) this.block(g, q, 0x78716c, 0x44403c);
    // The cup and its flag.
    g.fillStyle(0x052e16, 0.5).fillCircle(h.cup.x, h.cup.y, CUP_R + 6);
    g.fillStyle(0x0b0f0c).fillCircle(h.cup.x, h.cup.y, CUP_R);
    g.lineStyle(5, 0xf8fafc).lineBetween(h.cup.x + 4, h.cup.y, h.cup.x + 4, h.cup.y - 90);
    g.fillStyle(0xef4444).fillTriangle(
      h.cup.x + 6,
      h.cup.y - 90,
      h.cup.x + 56,
      h.cup.y - 74,
      h.cup.x + 6,
      h.cup.y - 58,
    );
    // Tee mark.
    g.fillStyle(0xffffff, 0.35).fillCircle(h.tee.x, h.tee.y, 22);
    this.ball.setPosition(this.sim.x, this.sim.y).setScale(1).setAlpha(1);
    this.trail = [];
    this.refresh();
  }

  private chevron(g: Phaser.GameObjects.Graphics, x: number, y: number, ang: number): void {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const p = (dx: number, dy: number) => ({ x: x + dx * c - dy * s, y: y + dx * s + dy * c });
    g.lineStyle(5, 0xf0fdf4, 0.45);
    const a = p(-12, -14);
    const b = p(8, 0);
    const d = p(-12, 14);
    g.lineBetween(a.x, a.y, b.x, b.y).lineBetween(b.x, b.y, d.x, d.y);
  }

  private block(g: Phaser.GameObjects.Graphics, q: Rect, top: number, side: number): void {
    g.fillStyle(0x000000, 0.25).fillRoundedRect(q.x + 4, q.y + 7, q.w, q.h, 8);
    g.fillStyle(side).fillRoundedRect(q.x, q.y + 4, q.w, q.h, 8);
    g.fillStyle(top).fillRoundedRect(q.x, q.y, q.w, q.h - 4, 8);
  }

  private refresh(): void {
    const s = this.sim;
    const h = s.current;
    this.info.setText(`Buraco ${s.hole + 1}/9 · Par ${h.par} · Tacadas ${s.strokes}`);
    const diff = s.totalStrokes - s.totalPar;
    this.card.setText(
      s.cards.length
        ? `Total: ${s.totalStrokes} tacadas (${diff === 0 ? 'no par' : diff > 0 ? `+${diff}` : diff})`
        : '',
    );
  }

  private drawAim(): void {
    const g = this.aim.clear();
    const len = Math.hypot(this.pull.x, this.pull.y);
    if (len < 12) return;
    const k = Math.min(1, len / MAX_PULL);
    const dx = -this.pull.x / len;
    const dy = -this.pull.y / len;
    const color = k < 0.5 ? 0x4ade80 : k < 0.8 ? 0xfacc15 : 0xef4444;
    // Dotted aim line in the shot direction, as long as the power.
    for (let i = 1; i <= 12 * k + 2; i++) {
      const d = i * 22;
      g.fillStyle(color, 1 - i / 18).fillCircle(
        this.sim.x + dx * d,
        this.sim.y + dy * d,
        6 - i * 0.25,
      );
    }
    // The "club": a short bar behind the ball, pulled back with the finger.
    const back = 20 + k * 50;
    g.lineStyle(8, 0xf8fafc, 0.8).lineBetween(
      this.sim.x - dx * (BALL_R + 4),
      this.sim.y - dy * (BALL_R + 4),
      this.sim.x - dx * back,
      this.sim.y - dy * back,
    );
    g.fillStyle(0x0b1430, 0.6).fillRoundedRect(this.sim.x - 60, this.sim.y + 26, 120, 14, 7);
    g.fillStyle(color).fillRoundedRect(this.sim.x - 60, this.sim.y + 26, 120 * k, 14, 7);
  }

  // ---------------------------------------------------------------- play

  private release(): void {
    if (!this.drag) return;
    this.drag = null;
    this.aim.clear();
    if (this.sim.putt(this.pull.x, this.pull.y)) {
      getServices(this).sfx.play('click');
      this.refresh();
    }
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    const events = this.busy ? [] : this.sim.step(dt);
    if (this.busy) this.sim.time += dt;
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e === 'wall' && this.time.now - this.lastBounce > 90) {
        this.lastBounce = this.time.now;
        sfx.play('bounce');
      } else if (e === 'sand') {
        sfx.play('tick');
        this.pop(this.sim.x, this.sim.y - 40, 'Areia!', '#fde68a', 34);
      } else if (e === 'water') {
        sfx.play('hit');
        burst(this, this.ball.x, this.ball.y, 0x7dd3fc, 22);
        shockwave(this, this.ball.x, this.ball.y, 0xbae6fd, 60);
        this.pop(CX, 700, 'Na água! +1 tacada', '#bae6fd', 40);
        this.trail = [];
        this.refresh();
      } else if (e === 'lip') {
        sfx.play('tick');
        this.pop(this.sim.current.cup.x, this.sim.current.cup.y - 40, 'Quase!', '#ffffff', 34);
      } else if (e === 'sink') this.holed();
    }
    if (!this.busy && !this.sim.moving && !this.sim.sunk && this.sim.strokes >= MAX_STROKES)
      this.holed();
    // Movers.
    const mg = this.movers.clear();
    for (const m of this.sim.current.movers ?? [])
      this.block(mg, moverAt(m, this.sim.time), 0xa855f7, 0x6b21a8);
    // Ball and trail.
    if (!this.busy) this.ball.setPosition(this.sim.x, this.sim.y);
    if (this.sim.moving) {
      this.trail.push({ x: this.sim.x, y: this.sim.y });
      if (this.trail.length > 14) this.trail.shift();
    } else if (this.trail.length) this.trail.shift();
    const tg = this.trailG.clear();
    this.trail.forEach((p, i) =>
      tg
        .fillStyle(0xffffff, (i / this.trail.length) * 0.35)
        .fillCircle(p.x, p.y, BALL_R * (i / this.trail.length)),
    );
  }

  private holed(): void {
    if (this.busy) return;
    this.busy = true;
    const { sfx } = getServices(this);
    const cup = this.sim.current.cup;
    const sunk = this.sim.sunk;
    const result = this.sim.nextHole();
    this.setScore(this.sim.score);
    if (sunk) {
      this.tweens.add({ targets: this.ball, scale: 0.3, alpha: 0, duration: 260 });
      burst(this, cup.x, cup.y, 0xfde047, 24);
      shockwave(this, cup.x, cup.y, 0xffffff, 80);
      sfx.play(result.name.endsWith('!') ? 'win' : 'coin');
      if (result.name.endsWith('!')) flash(this, 0xfde047, 0.2, 260);
      banner(this, result.name, result.name.endsWith('!') ? '#fde047' : '#ffffff', 640);
    } else {
      sfx.play('hit');
      banner(this, 'Limite de tacadas', '#fca5a5', 640);
    }
    this.time.delayedCall(1500, () => {
      if (this.sim.done) {
        const diff = this.sim.totalStrokes - this.sim.totalPar;
        this.finish(
          diff < 0 ? 'Abaixo do par! ⛳' : diff === 0 ? 'No par!' : 'Fim do campo!',
          [
            `${this.sim.totalStrokes} tacadas · par ${this.sim.totalPar} (${diff > 0 ? `+${diff}` : diff})`,
          ],
          { score: this.sim.score, details: { strokes: this.sim.totalStrokes, diff } },
        );
        return;
      }
      this.buildHole();
      this.busy = false;
    });
  }
}
