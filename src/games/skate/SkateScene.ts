import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  BOTTOM_Y,
  LENGTH,
  LIP_X,
  LIP_Y,
  LIVES,
  rampAt,
  RUN_TIME,
  SkateSim,
  TRICKS,
  type SkateEvent,
  type TrickKind,
} from './core';

const CX = GAME_WIDTH / 2;
const RIGHT_LIP = rampAt(LENGTH).x;

/** "Skate na Rampa": tap on the way down to pump, swipe in the air for tricks, land clean. */
export class SkateScene extends MiniScene {
  private sim = new SkateSim();
  private skater!: Phaser.GameObjects.Container;
  private rider!: Phaser.GameObjects.Container;
  private board!: Phaser.GameObjects.Container;
  private cue!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private hud!: Phaser.GameObjects.Graphics;
  private livesText!: Phaser.GameObjects.Text;
  private press: { x: number; y: number; t: number } | null = null;
  private facing = 1;
  private tutorial?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Skate, 'skate', [0x4c1d95, 0xf97316]);
  }

  create(): void {
    this.sim = new SkateSim();
    this.facing = 1;
    this.frame('0');
    this.drawPark();
    this.skater = this.makeSkater().setDepth(3);
    this.cue = addText(this, CX, 760, '', 34, { color: '#86efac', stroke: '#1e1b4b' }).setDepth(5);
    this.comboText = addText(this, CX, 300, '', 34, {
      color: '#fde047',
      stroke: '#1e1b4b',
      wrapWidth: 640,
    }).setDepth(5);
    this.hud = this.add.graphics().setDepth(5);
    this.livesText = addText(this, GAME_WIDTH - 20, 210, '', 30, { color: '#ffffff' })
      .setOrigin(1, 0.5)
      .setDepth(5);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y < 130) return;
      this.tutorial?.dismiss();
      this.press = { x: p.x, y: p.y, t: this.time.now };
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      const start = this.press;
      this.press = null;
      if (!start || this.ended) return;
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      if (Math.hypot(dx, dy) < 28) this.tap();
      else
        this.swipe(
          Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'spinL' : 'spinR') : dy < 0 ? 'kickflip' : 'grab',
        );
    });
    this.input.keyboard?.on('keydown-SPACE', () => this.tap());
    this.input.keyboard?.on('keydown-LEFT', () => this.swipe('spinL'));
    this.input.keyboard?.on('keydown-RIGHT', () => this.swipe('spinR'));
    this.input.keyboard?.on('keydown-UP', () => this.swipe('kickflip'));
    this.input.keyboard?.on('keydown-DOWN', () => this.swipe('grab'));
    this.tutorial = hint(
      this,
      [
        'Toque quando estiver DESCENDO a rampa',
        'No ar: deslize ← → ↑ ↓ para manobras',
        'Termine a manobra antes de cair!',
      ],
      560,
      6000,
    );
  }

  // ---------------------------------------------------------------- drawing

  private drawPark(): void {
    const g = this.add.graphics().setDepth(-5);
    // City at sunset.
    for (let i = 0; i < 9; i++) {
      const w = 60 + ((i * 37) % 50);
      const h = 120 + ((i * 71) % 220);
      g.fillStyle(0x2e1065, 0.55).fillRect(i * 85 - 10, 760 - h, w, h + 40);
      for (let k = 0; k < 6; k++)
        g.fillStyle(0xfde68a, 0.35).fillRect(
          i * 85 + 6 + (k % 2) * 22,
          780 - h + 14 + Math.floor(k / 2) * 30,
          10,
          12,
        );
    }
    // The halfpipe: surface, side panel and decks.
    const pts: Array<{ x: number; y: number }> = [];
    for (let s = 0; s <= LENGTH; s += 6) pts.push(rampAt(s));
    pts.push(rampAt(LENGTH));
    g.fillStyle(0x92400e).fillPoints(
      [{ x: LIP_X, y: 1180 }, ...pts, { x: RIGHT_LIP, y: 1180 }],
      true,
    );
    g.fillStyle(0x78350f)
      .fillRect(0, LIP_Y, LIP_X, 1180 - LIP_Y)
      .fillRect(RIGHT_LIP, LIP_Y, GAME_WIDTH - RIGHT_LIP, 1180 - LIP_Y);
    g.lineStyle(10, 0xfde68a).strokePoints(pts);
    g.lineStyle(3, 0x451a03, 0.4);
    for (let y = LIP_Y + 40; y < 1180; y += 40) g.lineBetween(0, y, GAME_WIDTH, y);
    // Coping (metal pipes on the lips).
    g.fillStyle(0xe5e7eb).fillCircle(LIP_X, LIP_Y, 9).fillCircle(RIGHT_LIP, LIP_Y, 9);
    g.fillStyle(0x0f172a).fillRect(0, 1180, GAME_WIDTH, 100);
    g.fillStyle(0xffffff, 0.08).fillRect(LIP_X + 40, BOTTOM_Y - 4, RIGHT_LIP - LIP_X - 80, 3);
  }

  private makeSkater(): Phaser.GameObjects.Container {
    const deck = this.add.rectangle(0, 0, 78, 10, 0x22d3ee).setStrokeStyle(2, 0x0e7490);
    const w1 = this.add.circle(-26, 9, 6, 0xf8fafc);
    const w2 = this.add.circle(26, 9, 6, 0xf8fafc);
    this.board = this.add.container(0, 0, [deck, w1, w2]);
    const g = this.add.graphics();
    g.lineStyle(9, 0x1e293b).lineBetween(-14, -6, -6, -36).lineBetween(14, -6, 6, -36); // legs
    g.lineStyle(12, 0xef4444).lineBetween(0, -36, 0, -72); // shirt
    g.lineStyle(7, 0xf1c27d).lineBetween(0, -64, -24, -50).lineBetween(0, -64, 24, -54); // arms
    g.fillStyle(0xf1c27d).fillCircle(0, -86, 13);
    g.fillStyle(0x7c3aed).fillCircle(0, -90, 13).fillRect(-13, -90, 26, 5); // helmet
    this.rider = this.add.container(0, 0, [g]);
    return this.add.container(0, 0, [this.rider, this.board]);
  }

  // ---------------------------------------------------------------- input

  private tap(): void {
    if (this.ended) return;
    const e = this.sim.pump();
    if (!e) return;
    const { sfx } = getServices(this);
    if (e.type === 'pump' && e.good) {
      sfx.play('coin', 2);
      burst(this, this.skater.x, this.skater.y, 0x86efac, 10);
      this.tweens.add({ targets: this.rider, scaleY: { from: 0.8, to: 1 }, duration: 180 });
    } else {
      sfx.play('tick');
      this.pop(this.skater.x, this.skater.y - 120, 'Travou!', '#fca5a5', 30);
    }
  }

  private swipe(kind: TrickKind): void {
    if (this.ended || !this.sim.air) return;
    this.sim.trick(kind);
  }

  // ---------------------------------------------------------------- frame

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    this.handle(this.sim.step(dt));
    const s = this.sim;
    if (s.air) {
      const x = s.air.side === 'L' ? LIP_X + 26 : RIGHT_LIP - 26;
      this.skater.setPosition(x, LIP_Y - s.air.h - 8).setRotation(0);
      // Tricks: spins flip the whole skater, a kickflip flips the board, a grab tucks.
      const d = s.doing;
      const k = d ? Math.min(1, d.t / TRICKS[d.kind].time) : 0;
      if (d && (d.kind === 'spinL' || d.kind === 'spinR'))
        this.skater.setScale(Math.cos(k * Math.PI) * this.facing, 1);
      else this.skater.setScale(this.facing, 1);
      this.board.setScale(1, d?.kind === 'kickflip' ? Math.cos(k * Math.PI * 2) : 1);
      this.rider.setScale(1, d?.kind === 'grab' ? 1 - Math.sin(k * Math.PI) * 0.3 : 1);
      const names = [...s.combo, ...(d ? [d.kind] : []), ...s.queue].map((t) => TRICKS[t].name);
      this.comboText.setText(names.join(' + '));
    } else {
      const p = rampAt(s.s);
      const q = rampAt(Math.min(LENGTH, s.s + 1));
      const r = rampAt(Math.max(0, s.s - 1));
      const ang = Math.atan2(q.y - r.y, q.x - r.x);
      this.skater.setPosition(p.x + Math.sin(ang) * 10, p.y - Math.cos(ang) * 10).setRotation(ang);
      if (Math.abs(s.v) > 30) this.facing = s.v > 0 ? 1 : -1;
      this.skater
        .setScale(this.facing, 1)
        .setAlpha(s.down > 0 ? 0.5 + Math.sin(this.time.now / 60) * 0.3 : 1);
      this.board.setScale(1, 1);
      this.rider.setScale(1, 1);
      this.comboText.setText('');
    }
    this.cue.setText(s.pumpWindow ? 'BOMBE!' : '').setPosition(this.skater.x, this.skater.y - 150);
    // Clock and lives.
    const h = this.hud.clear();
    const frac = s.clock / RUN_TIME;
    h.fillStyle(0x000000, 0.35).fillRoundedRect(40, 164, 500, 22, 11);
    h.fillStyle(frac > 0.2 ? 0xfde047 : 0xef4444).fillRoundedRect(
      40,
      164,
      Math.max(22, 500 * frac),
      22,
      11,
    );
    this.livesText.setText('🛹'.repeat(s.lives) + '·'.repeat(LIVES - s.lives));
  }

  private handle(events: SkateEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e.type === 'air') sfx.play('zap');
      else if (e.type === 'trick') sfx.play('pop');
      else if (e.type === 'land') {
        const big = e.points >= 900;
        sfx.play(big ? 'win' : 'coin', Math.min(6, e.tricks.length));
        this.pop(
          this.skater.x,
          LIP_Y - 120,
          `+${e.points}`,
          big ? '#fde047' : '#ffffff',
          big ? 54 : 40,
        );
        shockwave(this, this.skater.x, LIP_Y, 0xfde68a, 50);
        if (big) {
          banner(this, e.tricks.join(' + '), '#fde047', 520);
          flash(this, 0xfde047, 0.18, 220);
        }
        this.setScore(this.sim.score);
      } else if (e.type === 'bail') {
        sfx.play('hit');
        sfx.vibrate([80, 40, 80]);
        this.cameras.main.shake(260, 0.012);
        banner(this, 'CAIU!', '#fca5a5', 520);
        burst(this, this.skater.x, LIP_Y, 0xef4444, 20);
      } else if (e.type === 'over') {
        const s = this.sim;
        this.finish(
          s.lives <= 0 ? 'Três quedas!' : s.score >= 6000 ? 'Lenda da rampa! 🛹' : 'Fim da sessão!',
          [`Pontos: ${s.score} · Melhor manobra: ${s.best}`],
          { score: s.score, details: { best: s.best } },
        );
      }
    }
  }
}
