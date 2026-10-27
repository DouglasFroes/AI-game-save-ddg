import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  flightTime,
  inTheCorner,
  KEEPER_HOME,
  KICKS,
  Shootout,
  shotFromSwipe,
  STAGES,
  type Kick,
  type Point,
  type Shot,
} from './core';

const CX = GAME_WIDTH / 2;
const HALF_W = 240;
const GOAL_H = 260;
const LINE_Y = 600;
const BAR_Y = LINE_Y - GOAL_H;
const SPOT = { x: CX, y: 1070 };
const gx = (u: number) => CX + u * HALF_W;
const gy = (v: number) => LINE_Y - v * GOAL_H;
const toGoal = (x: number, y: number) => ({ u: (x - CX) / HALF_W, v: (LINE_Y - y) / GOAL_H });

type Phase = 'aim' | 'flying' | 'runup' | 'waiting' | 'between';

/** "Disputa de Pênaltis": a cup decided on penalties. Swipe to shoot, tap the goal to dive. */
export class PenaltiScene extends MiniScene {
  private sim = new Shootout();
  private phase: Phase = 'between';
  private ball!: Phaser.GameObjects.Text;
  private ballShadow!: Phaser.GameObjects.Ellipse;
  private keeper!: Phaser.GameObjects.Container;
  private keeperShirt!: Phaser.GameObjects.Rectangle;
  private shooter!: Phaser.GameObjects.Text;
  private board!: Phaser.GameObjects.Graphics;
  private stageText!: Phaser.GameObjects.Text;
  private message!: Phaser.GameObjects.Text;
  private trail!: Phaser.GameObjects.Graphics;
  private net!: Phaser.GameObjects.Graphics;
  private path: Point[] = [];
  private flight: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    ctrl: { x: number; y: number };
    t: number;
    T: number;
  } | null = null;
  private onLanded: (() => void) | null = null;
  /** The rival's kick, while you have not dived yet. */
  private planned: Shot | null = null;
  private kickAt = 0;
  private dove: { u: number; v: number; at: number } | null = null;
  private tutorial?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Penalti, 'penalti', [0x0b1a3a, 0x14532d]);
  }

  create(): void {
    this.sim = new Shootout();
    this.phase = 'between';
    this.flight = null;
    this.dove = null;
    this.frame('0');
    this.drawPitch();
    this.net = this.add.graphics();
    this.drawGoal(null);
    this.keeper = this.makeKeeper();
    this.ballShadow = this.add.ellipse(SPOT.x, SPOT.y + 34, 70, 18, 0x000000, 0.3);
    this.ball = emojiText(this, SPOT.x, SPOT.y, '⚽', 92).setDepth(6);
    this.shooter = emojiText(this, -100, SPOT.y + 40, '🏃', 120).setDepth(5);
    this.trail = this.add.graphics().setDepth(7);
    this.board = this.add.graphics();
    this.stageText = addText(this, CX, 168, '', 30, { color: '#fde68a', stroke: '#0b1430' });
    this.message = addText(this, CX, 760, '', 34, {
      color: '#ffffff',
      stroke: '#0b1430',
      wrapWidth: 640,
    });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.down(p));
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => this.move(p));
    this.input.on(Phaser.Input.Events.POINTER_UP, () => this.up());
    this.tutorial = hint(
      this,
      ['Deslize o dedo para cima para chutar', 'Curva + força = gol no ângulo'],
      900,
      4500,
    );
    this.nextKick();
  }

  // ---------------------------------------------------------------- drawing

  private drawPitch(): void {
    const g = this.add.graphics().setDepth(-5);
    // Crowd behind the goal.
    g.fillStyle(0x1e293b).fillRect(0, 200, GAME_WIDTH, BAR_Y - 140);
    for (let i = 0; i < 260; i++) {
      const colors = [0xf87171, 0xfde047, 0x60a5fa, 0xffffff, 0x4ade80];
      g.fillStyle(colors[i % colors.length]!, 0.55).fillCircle(
        (i * 37) % GAME_WIDTH,
        215 + ((i * 53) % (BAR_Y - 160)),
        5,
      );
    }
    g.fillStyle(0x0f172a).fillRect(0, BAR_Y + 30, GAME_WIDTH, 30);
    // Grass in stripes, getting wider towards the camera.
    let y = LINE_Y - 40;
    for (let i = 0; y < 1280; i++) {
      const h = 40 + i * 14;
      g.fillStyle(i % 2 ? 0x15803d : 0x16a34a).fillRect(0, y, GAME_WIDTH, h);
      y += h;
    }
    g.lineStyle(5, 0xffffff, 0.85);
    g.lineBetween(0, LINE_Y, GAME_WIDTH, LINE_Y);
    // The six-yard box in perspective.
    g.strokePoints([
      { x: gx(-1.45), y: LINE_Y },
      { x: gx(-1.75), y: LINE_Y + 120 },
      { x: gx(1.75), y: LINE_Y + 120 },
      { x: gx(1.45), y: LINE_Y },
    ]);
    g.fillStyle(0xffffff).fillEllipse(SPOT.x, SPOT.y + 36, 30, 10);
  }

  /** Posts, bar and net; `bulge` pushes the net back where a goal went in. */
  private drawGoal(bulge: { x: number; y: number } | null): void {
    const g = this.net.clear();
    const back = 36;
    g.lineStyle(2, 0xffffff, 0.35);
    for (let i = 0; i <= 16; i++) {
      const x = gx(-1 + i / 8);
      const pull = bulge ? Math.max(0, 1 - Math.abs(x - bulge.x) / 140) * 30 : 0;
      g.lineBetween(x, BAR_Y, x + (x - CX) * 0.04, LINE_Y - back + pull);
    }
    for (let j = 0; j <= 9; j++) {
      const y = BAR_Y + (j / 9) * (GOAL_H - back);
      const pull = bulge ? Math.max(0, 1 - Math.abs(y - bulge.y) / 120) * 26 : 0;
      g.lineBetween(gx(-1) + pull * 0.2, y + pull, gx(1) - pull * 0.2, y + pull);
    }
    g.lineStyle(14, 0xf8fafc);
    g.lineBetween(gx(-1), LINE_Y, gx(-1), BAR_Y);
    g.lineBetween(gx(1), LINE_Y, gx(1), BAR_Y);
    g.lineBetween(gx(-1) - 7, BAR_Y, gx(1) + 7, BAR_Y);
  }

  private makeKeeper(): Phaser.GameObjects.Container {
    this.keeperShirt = this.add.rectangle(0, 0, 66, 92, 0xfacc15).setStrokeStyle(4, 0x0b1430);
    const head = this.add.circle(0, -70, 24, 0xf1c27d).setStrokeStyle(4, 0x0b1430);
    const legs = this.add.rectangle(0, 74, 50, 56, 0x111827);
    const arms = this.add.graphics();
    arms.lineStyle(14, 0xf1c27d).lineBetween(-30, -36, -66, -78).lineBetween(30, -36, 66, -78);
    const gloveL = this.add.circle(-70, -84, 17, 0x22c55e).setStrokeStyle(3, 0x0b1430);
    const gloveR = this.add.circle(70, -84, 17, 0x22c55e).setStrokeStyle(3, 0x0b1430);
    const c = this.add.container(gx(KEEPER_HOME.u), gy(KEEPER_HOME.v) + 40, [
      legs,
      arms,
      this.keeperShirt,
      head,
      gloveL,
      gloveR,
    ]);
    return c.setDepth(4).setScale(0.95);
  }

  private keeperHome(rival: boolean): void {
    this.tweens.killTweensOf(this.keeper);
    this.keeper.setPosition(gx(KEEPER_HOME.u), gy(KEEPER_HOME.v) + 40).setAngle(0);
    this.keeperShirt.setFillStyle(rival ? 0xfacc15 : 0x22d3ee);
    // A little sway on the line.
    this.tweens.add({
      targets: this.keeper,
      x: gx(0.08),
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: 200,
    });
  }

  /** The keeper flies to `spot` (goal units) over `seconds`. */
  private dive(spot: { u: number; v: number }, seconds: number): void {
    this.tweens.killTweensOf(this.keeper);
    const lean = Phaser.Math.Clamp(spot.u * 110, -80, 80);
    this.tweens.add({
      targets: this.keeper,
      x: gx(spot.u),
      y: gy(spot.v) + 40 - Math.abs(spot.u) * 10,
      angle: lean,
      duration: Math.max(90, seconds * 1000),
      ease: 'Cubic.easeOut',
    });
  }

  private drawBoard(): void {
    const g = this.board.clear();
    const n = Math.max(KICKS, this.sim.mine.length, this.sim.theirs.length);
    const rows: Array<[string, boolean[], number]> = [
      ['VOCÊ', this.sim.mine, 214],
      ['RIVAL', this.sim.theirs, 252],
    ];
    for (const [, results, y] of rows) {
      for (let i = 0; i < n; i++) {
        const x = 250 + i * 46;
        const r = results[i];
        g.fillStyle(
          r === undefined ? 0xffffff : r ? 0x22c55e : 0xef4444,
          r === undefined ? 0.25 : 1,
        ).fillCircle(x, y, 15);
        g.lineStyle(3, 0x0b1430).strokeCircle(x, y, 15);
      }
    }
    this.boardLabels ??= [
      addText(this, 160, 214, 'VOCÊ', 22, { color: '#ffffff' }),
      addText(this, 160, 252, 'RIVAL', 22, { color: '#ffffff' }),
    ];
  }
  private boardLabels?: Phaser.GameObjects.Text[];

  // ---------------------------------------------------------------- flow

  private nextKick(): void {
    if (this.ended) return;
    this.stageText.setText(
      `${STAGES[this.sim.stage]} · ${this.sim.turn === 'shoot' ? 'Sua cobrança' : 'Defenda!'}`,
    );
    this.drawBoard();
    this.drawGoal(null);
    this.ball.setPosition(SPOT.x, SPOT.y).setScale(1).setAlpha(1).setAngle(0);
    this.ballShadow
      .setPosition(SPOT.x, SPOT.y + 34)
      .setScale(1)
      .setAlpha(1);
    this.trail.clear();
    this.dove = null;
    this.planned = null;
    if (this.sim.turn === 'shoot') {
      this.keeperHome(true);
      this.shooter.setPosition(-120, SPOT.y + 40);
      this.phase = 'aim';
      this.message.setText('Deslize para chutar');
    } else {
      this.keeperHome(false);
      this.message.setText('Toque no gol para pular!');
      this.phase = 'runup';
      this.planned = this.sim.rivalShot();
      this.shooter
        .setPosition(160, SPOT.y + 150)
        .setFlipX(true)
        .setAlpha(1);
      this.tweens.add({
        targets: this.shooter,
        x: SPOT.x - 70,
        y: SPOT.y + 50,
        duration: 900,
        ease: 'Quad.easeIn',
        onComplete: () => this.rivalKick(),
      });
    }
  }

  private down(p: Phaser.Input.Pointer): void {
    if (this.ended) return;
    this.tutorial?.dismiss();
    if (this.phase === 'aim' && p.y > 640) this.path = [{ x: p.x, y: p.y, t: this.time.now }];
    else if (
      (this.phase === 'runup' || this.phase === 'waiting') &&
      !this.dove &&
      p.y < LINE_Y + 60
    ) {
      const { u, v } = toGoal(p.x, p.y);
      this.dove = { u, v, at: this.time.now };
      if (this.phase === 'waiting') this.resolveSave();
      else
        this.dive(
          { u: Phaser.Math.Clamp(u, -0.66, 0.66), v: Phaser.Math.Clamp(v, 0.12, 0.78) },
          0.4,
        );
    }
  }

  private move(p: Phaser.Input.Pointer): void {
    if (this.phase !== 'aim' || !p.isDown || this.path.length === 0) return;
    this.path.push({ x: p.x, y: p.y, t: this.time.now });
    const g = this.trail.clear();
    g.lineStyle(10, 0xffffff, 0.5).strokePoints(this.path.map((q) => ({ x: q.x, y: q.y })));
  }

  private up(): void {
    if (this.phase !== 'aim' || this.path.length === 0) return;
    const path = this.path;
    this.path = [];
    this.tweens.add({
      targets: this.trail,
      alpha: { from: 1, to: 0 },
      duration: 300,
      onComplete: () => this.trail.clear().setAlpha(1),
    });
    const aim = shotFromSwipe(path);
    if (!aim) {
      this.message.setText('Deslize para CIMA, em direção ao gol');
      return;
    }
    this.phase = 'flying';
    this.message.setText('');
    const kick = this.sim.shoot(aim);
    getServices(this).sfx.play('boom');
    this.cameras.main.shake(80, 0.004);
    // The rival keeper reacts a beat after the kick.
    this.time.delayedCall(80, () => this.dive(kick.keeper, flightTime(kick.shot.power) - 0.08));
    this.fly(kick.shot, () => this.landed(kick, true));
  }

  private rivalKick(): void {
    const shot = this.planned!;
    getServices(this).sfx.play('boom');
    this.kickAt = this.time.now;
    this.tweens.add({ targets: this.shooter, alpha: 0, duration: 400, delay: 200 });
    if (this.dove) {
      // You moved before the kick: decided right now (he may have seen you go).
      const reaction = (this.dove.at - this.kickAt) / 1000;
      const kick = this.sim.save(shot, this.dove, reaction);
      this.phase = 'flying';
      this.fly(kick.shot, () => this.landed(kick, false));
      return;
    }
    this.phase = 'waiting';
    this.fly(shot, () => {
      // Never dove at all.
      if (this.phase === 'waiting') {
        const kick = this.sim.save(shot, null, 0);
        this.landed(kick, false);
      }
    });
  }

  /** You dove after the kick: the keeper gets the time that is left to reach the ball. */
  private resolveSave(): void {
    const shot = this.planned!;
    const reaction = (this.dove!.at - this.kickAt) / 1000;
    const kick = this.sim.save(shot, this.dove, reaction);
    this.phase = 'flying';
    this.dive(kick.keeper, Math.max(0.08, flightTime(shot.power) - reaction));
    // Replaces the "never dove" ending set up by rivalKick.
    this.onLanded = () => this.landed(kick, false);
  }

  /** The ball flies on a bent path to the shot's spot in the goal plane. */
  private fly(shot: Shot, landed: () => void): void {
    const to = { x: gx(shot.u), y: gy(shot.v) };
    const ctrl = {
      x: (SPOT.x + to.x) / 2 - shot.curve * 170,
      y: (SPOT.y + to.y) / 2 - 120 - shot.v * 60,
    };
    this.flight = { from: { ...SPOT }, to, ctrl, t: 0, T: flightTime(shot.power) };
    this.onLanded = landed;
  }

  override update(_t: number, deltaMs: number): void {
    const f = this.flight;
    if (!f) return;
    f.t += Math.min(deltaMs, 50) / 1000;
    const k = Math.min(1, f.t / f.T);
    const a = (1 - k) * (1 - k);
    const b = 2 * (1 - k) * k;
    const c = k * k;
    const x = a * f.from.x + b * f.ctrl.x + c * f.to.x;
    const y = a * f.from.y + b * f.ctrl.y + c * f.to.y;
    this.ball
      .setPosition(x, y)
      .setScale(1 - 0.58 * k)
      .setAngle(k * 720);
    this.ballShadow
      .setPosition(x, SPOT.y + 34 - (SPOT.y - LINE_Y) * k)
      .setScale(1 - 0.6 * k)
      .setAlpha(0.3 * (1 - k));
    if (k >= 1) {
      this.flight = null;
      const done = this.onLanded;
      this.onLanded = null;
      done?.();
    }
  }

  private landed(kick: Kick, mine: boolean): void {
    const { sfx } = getServices(this);
    const at = { x: gx(kick.shot.u), y: gy(kick.shot.v) };
    this.phase = 'between';
    if (kick.outcome === 'gol') {
      this.drawGoal(at);
      shockwave(this, at.x, at.y, 0xffffff, 90);
      burst(this, at.x, at.y, mine ? 0xfde047 : 0xef4444, 22);
      sfx.play(mine ? 'win' : 'hit');
      if (mine) {
        const corner = inTheCorner(kick.shot);
        banner(this, corner ? 'NO ÂNGULO!' : 'GOOOL!', '#fde047', 470);
        if (corner) flash(this, 0xfde047, 0.25, 260);
        sfx.vibrate([40, 30, 60]);
      } else this.message.setText('Gol deles…');
    } else {
      // The ball bounces away from the keeper, the post or wide.
      const away =
        kick.outcome === 'defesa'
          ? { x: at.x + (at.x - CX) * 0.6 + 90 * Math.sign(at.x - CX || 1), y: at.y + 260 }
          : kick.outcome === 'trave'
            ? { x: at.x - Math.sign(at.x - CX || 1) * 120, y: at.y + 300 }
            : { x: at.x + (at.x - CX) * 0.5, y: at.y - 120 };
      this.tweens.add({
        targets: this.ball,
        x: away.x,
        y: away.y,
        angle: 900,
        duration: 600,
        ease: 'Quad.easeOut',
      });
      const text = {
        defesa: mine ? 'DEFENDEU…' : 'DEFESAÇA!',
        trave: 'NA TRAVE!',
        fora: 'PRA FORA!',
      }[kick.outcome];
      banner(this, text, mine ? '#fca5a5' : '#86efac', 470);
      sfx.play(mine ? 'hit' : kick.outcome === 'defesa' ? 'win' : 'bounce');
      if (kick.outcome === 'trave') this.cameras.main.shake(140, 0.006);
      if (!mine && kick.outcome === 'defesa') {
        burst(this, this.keeper.x, this.keeper.y - 60, 0x22d3ee, 18);
        sfx.vibrate([30, 30, 30]);
      }
    }
    this.setScore(this.sim.score);
    this.drawBoard();
    this.time.delayedCall(1500, () => this.afterKick());
  }

  private afterKick(): void {
    const w = this.sim.winner();
    if (!w) return this.nextKick();
    const stage = this.sim.stage;
    this.sim.finishShootout();
    this.setScore(this.sim.score);
    if (this.sim.over) {
      const s = this.sim;
      this.finish(
        s.champion ? 'CAMPEÃO! 🏆' : `Eliminado nas ${STAGES[stage]!.toLowerCase()}`,
        [`Gols: ${s.goals} · Defesas: ${s.saves} · No ângulo: ${s.corners}`],
        { score: s.score, details: { goals: s.goals, saves: s.saves, cups: s.cups } },
      );
      return;
    }
    banner(this, 'CLASSIFICADO!', '#86efac', 470);
    flash(this, 0x22c55e, 0.25, 300);
    getServices(this).sfx.play('level');
    this.message.setText(`Próxima fase: ${STAGES[this.sim.stage]}`);
    this.time.delayedCall(1800, () => this.nextKick());
  }
}
