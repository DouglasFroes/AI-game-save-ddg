import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { canvasTexture } from '@/platform/art/textures';
import { banner, burst, flash, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { drawMallet } from './art';
import {
  AirHockey,
  GOAL_HALF,
  H,
  MALLET_R,
  matchPoints,
  Opponent,
  opponentLevel,
  PUCK_R,
  W,
  type Point,
} from './core';

const TX = (GAME_WIDTH - W) / 2;
const TY = 258;
const STEP = 1 / 120;
const MATCH_SECONDS = 150;
/** The mallet rides this far above the finger so the hand never hides it. */
const FINGER_LIFT = 64;
const TRAIL = 14;

/** "Hóquei de Mesa": air hockey against the robot, first to 5 goals; each win raises its level. */
export class HoqueiScene extends MiniScene {
  private sim = new AirHockey(0);
  private cpu!: Opponent;
  private wins = 0;
  private points = 0;
  private goals = 0;
  private acc = 0;
  private timeLeft = MATCH_SECONDS;
  private suddenDeath = false;
  private over = false;
  private target: Point = { x: W / 2, y: H - 120 };
  private puckImg!: Phaser.GameObjects.Image;
  private glow!: Phaser.GameObjects.Arc;
  private malletImg: Phaser.GameObjects.Image[] = [];
  private trail!: Phaser.GameObjects.Graphics;
  private trailPts: Point[] = [];
  private scoreYou!: Phaser.GameObjects.Text;
  private scoreCpu!: Phaser.GameObjects.Text;
  private clock!: Phaser.GameObjects.Text;
  private lastWall = 0;

  constructor() {
    super(SceneKeys.Hoquei, 'hoquei', [0x050c1f, 0x0b2a52]);
  }

  create(): void {
    this.wins = 0;
    this.points = 0;
    this.goals = 0;
    this.over = false;
    this.makeTextures();
    this.frame();
    this.drawTable();
    this.trail = this.add.graphics().setDepth(2);
    this.glow = this.add
      .circle(0, 0, PUCK_R * 1.9, 0x67e8f9, 0.22)
      .setDepth(2)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.puckImg = this.add.image(0, 0, 'hoq-puck').setDepth(3);
    this.malletImg = [
      this.add.image(0, 0, 'hoq-mallet-0').setDepth(4),
      this.add.image(0, 0, 'hoq-mallet-1').setDepth(4),
    ];
    this.scoreYou = addText(this, GAME_WIDTH / 2 - 120, 206, '0', 72, {
      color: '#67e8f9',
      stroke: '#050c1f',
      strokeThickness: 10,
    });
    this.scoreCpu = addText(this, GAME_WIDTH / 2 + 120, 206, '0', 72, {
      color: '#f9a8d4',
      stroke: '#050c1f',
      strokeThickness: 10,
    });
    addText(this, GAME_WIDTH / 2, 206, ':', 64, { color: '#ffffff' });
    addText(this, 70, 206, 'VOCÊ', 24, { color: '#67e8f9' }).setOrigin(0, 0.5);
    addText(this, GAME_WIDTH - 70, 206, 'ROBÔ', 24, { color: '#f9a8d4' }).setOrigin(1, 0.5);
    this.clock = addText(this, GAME_WIDTH / 2, 150, '', 30, { color: '#bfdbfe', weight: 'normal' });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => this.aim(p));
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.aim(p));
    this.newMatch();
  }

  private makeTextures(): void {
    const size = (MALLET_R + 8) * 2;
    canvasTexture(this, 'hoq-mallet-0', size, size, (ctx) =>
      drawMallet(ctx, size / 2, size / 2 - 3, MALLET_R, '#67e8f9', '#0e6a8a'),
    );
    canvasTexture(this, 'hoq-mallet-1', size, size, (ctx) =>
      drawMallet(ctx, size / 2, size / 2 - 3, MALLET_R, '#f9a8d4', '#9d174d'),
    );
    const ps = (PUCK_R + 8) * 2;
    canvasTexture(this, 'hoq-puck', ps, ps, (ctx) => {
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = '#0b1220';
      ctx.beginPath();
      ctx.arc(ps / 2, ps / 2 - 2, PUCK_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = '#67e8f9';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(ps / 2, ps / 2 - 2, PUCK_R - 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.ellipse(ps / 2 - 7, ps / 2 - 12, 9, 5, -0.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private drawTable(): void {
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(0x000000, 0.4).fillRoundedRect(TX - 6, TY + 6, W + 12, H + 14, 38);
    g.fillStyle(0x0a1e3d).fillRoundedRect(TX - 14, TY - 14, W + 28, H + 28, 38);
    g.fillStyle(0x0d3158).fillRoundedRect(TX, TY, W, H, 24);
    // Soft light in the middle of the ice.
    for (let k = 0; k < 6; k++) {
      g.fillStyle(0x1e6fb8, 0.05).fillEllipse(
        TX + W / 2,
        TY + H / 2,
        W * (1 - k * 0.12),
        H * (0.95 - k * 0.12),
      );
    }
    g.lineStyle(4, 0x67e8f9, 0.55);
    g.lineBetween(TX + 14, TY + H / 2, TX + W - 14, TY + H / 2);
    g.strokeCircle(TX + W / 2, TY + H / 2, 84);
    g.fillStyle(0x67e8f9, 0.7).fillCircle(TX + W / 2, TY + H / 2, 8);
    for (const top of [true, false]) {
      const y = top ? TY : TY + H;
      g.lineStyle(3, 0x67e8f9, 0.35).beginPath();
      g.arc(TX + W / 2, y, 170, top ? 0 : Math.PI, top ? Math.PI : Math.PI * 2, false);
      g.strokePath();
      // Goal mouth: a glowing slot in the rim.
      for (let k = 4; k >= 0; k--) {
        g.fillStyle(top ? 0xf472b6 : 0x22d3ee, 0.12 + (4 - k) * 0.1).fillRoundedRect(
          TX + W / 2 - GOAL_HALF - k * 3,
          top ? TY - 14 : TY + H - 2 - k * 3,
          GOAL_HALF * 2 + k * 6,
          16 + k * 3,
          8,
        );
      }
    }
    g.lineStyle(6, 0x67e8f9, 0.9).strokeRoundedRect(TX, TY, W, H, 24);
  }

  private aim(p: Phaser.Input.Pointer): void {
    this.target = { x: p.x - TX, y: p.y - TY - FINGER_LIFT };
  }

  // ---------------------------------------------------------------- flow

  private newMatch(): void {
    this.sim = new AirHockey(0);
    this.cpu = new Opponent(1, this.wins, Math.random);
    this.timeLeft = MATCH_SECONDS;
    this.suddenDeath = false;
    this.over = false;
    this.acc = 0;
    this.trailPts = [];
    this.target = { x: W / 2, y: H - 120 };
    this.updateScore();
    banner(this, this.wins === 0 ? 'PRIMEIRO A 5!' : `NÍVEL ${this.wins + 1}`, '#67e8f9');
    getServices(this).sfx.play('start');
  }

  private updateScore(): void {
    this.scoreYou.setText(String(this.sim.score[0]));
    this.scoreCpu.setText(String(this.sim.score[1]));
  }

  override update(_: number, delta: number): void {
    if (this.ended || this.over) {
      this.draw();
      return;
    }
    this.acc += Math.min(0.05, delta / 1000);
    while (this.acc >= STEP && !this.over) {
      this.acc -= STEP;
      this.simStep();
    }
    if (!this.over && this.sim.freeze <= 0) {
      this.timeLeft -= delta / 1000;
      if (this.timeLeft <= 0) this.timeUp();
    }
    this.clock.setText(
      this.suddenDeath
        ? 'MORTE SÚBITA'
        : `${Math.max(0, Math.ceil(this.timeLeft))}s · robô nível ${this.wins + 1}`,
    );
    this.draw();
  }

  private simStep(): void {
    const g = this.sim;
    g.step(STEP, this.target, this.cpu.target(g, STEP), 2400, opponentLevel(this.wins).speed);
    for (const e of g.events) {
      const { sfx } = getServices(this);
      if (e === 'wall') {
        const now = this.time.now;
        if (now - this.lastWall > 90) sfx.play('bounce');
        this.lastWall = now;
      } else if (e === 'mallet') {
        sfx.play('hit');
        sfx.vibrate(10);
        burst(this, TX + g.puck.x, TY + g.puck.y, 0x67e8f9, 8, { speed: 240, size: 5 });
      } else {
        this.goal(e.goal);
        return;
      }
    }
  }

  private goal(scorer: 0 | 1): void {
    const g = this.sim;
    this.updateScore();
    const y = scorer === 0 ? TY : TY + H;
    const color = scorer === 0 ? 0x67e8f9 : 0xf472b6;
    flash(this, color, 0.3, 300);
    shockwave(this, TX + W / 2, y, color, 220);
    burst(this, TX + W / 2, y, color, 36, { speed: 560 });
    this.cameras.main.shake(220, 0.01);
    getServices(this).sfx.play(scorer === 0 ? 'win' : 'boom');
    this.trailPts = [];
    this.pop(
      GAME_WIDTH / 2,
      330,
      scorer === 0 ? 'GOL!' : 'Gol do robô',
      scorer === 0 ? '#67e8f9' : '#f9a8d4',
      64,
    );
    if (g.winner !== null || this.suddenDeath) this.endMatch();
  }

  private timeUp(): void {
    const [a, b] = this.sim.score;
    if (a === b) {
      this.suddenDeath = true;
      this.timeLeft = 0;
      this.pop(GAME_WIDTH / 2, 330, 'Empate! Morte súbita', '#fde047', 44);
      return;
    }
    this.endMatch();
  }

  private endMatch(): void {
    this.over = true;
    const [you, cpu] = this.sim.score;
    this.goals += you;
    if (you > cpu) {
      const gained = matchPoints(this.wins, you, cpu);
      this.wins++;
      this.points += gained;
      this.setScore(this.points);
      banner(this, 'VOCÊ VENCEU!', '#fde047');
      this.pop(GAME_WIDTH / 2, 420, `+${gained}`, '#ffe066', 64);
      burst(this, GAME_WIDTH / 2, 700, 0xfde047, 40, { speed: 600 });
      this.time.delayedCall(2300, () => this.newMatch());
      return;
    }
    this.finish(
      'O robô venceu!',
      [`Vitórias: ${this.wins}`, `Gols: ${this.goals}`],
      { score: this.points, details: { wins: this.wins, goals: this.goals } },
      1200,
    );
  }

  // ---------------------------------------------------------------- drawing

  private draw(): void {
    const g = this.sim;
    const p = g.puck;
    this.puckImg.setPosition(TX + p.x, TY + p.y);
    const speed = Math.hypot(p.vx, p.vy);
    this.glow.setPosition(TX + p.x, TY + p.y).setAlpha(0.12 + Math.min(0.4, speed / 3000));
    g.mallets.forEach((m, i) => this.malletImg[i]!.setPosition(TX + m.x, TY + m.y));
    this.trailPts.push({ x: p.x, y: p.y });
    if (this.trailPts.length > TRAIL) this.trailPts.shift();
    const t = this.trail.clear();
    if (speed > 260) {
      this.trailPts.forEach((q, k) => {
        const a = (k / TRAIL) * Math.min(0.5, speed / 2400);
        t.fillStyle(0x67e8f9, a).fillCircle(
          TX + q.x,
          TY + q.y,
          PUCK_R * (0.35 + (k / TRAIL) * 0.55),
        );
      });
    }
  }
}
