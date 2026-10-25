import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  HALF_W,
  LENGTH,
  NET_H,
  NET_Y,
  RIVALS,
  SERVICE_DEPTH,
  swingFromSwipe,
  TennisSim,
  type Swing,
  type TennisEvent,
} from './core';

const CX = GAME_WIDTH / 2;
const PX_PER_M = 63;
const scaleAt = (y: number) => 1 / (1 + y / 14);
const sx = (x: number, y: number) => CX + x * PX_PER_M * scaleAt(y);
const sy = (y: number, z = 0) => -124 + 1224 * scaleAt(y) - z * PX_PER_M * scaleAt(y);
const REASON: Record<string, string> = {
  fora: 'Fora!',
  rede: 'Na rede!',
  'dois quiques': 'Não alcançou!',
  'dupla falta': 'Dupla falta!',
  ace: 'ACE!',
  winner: 'Bola vencedora!',
};

interface PlayerView {
  c: Phaser.GameObjects.Container;
  racket: Phaser.GameObjects.Container;
}

/** "Tênis": a tie-break against each rival of the ladder. Swipe up to hit when the ball comes. */
export class TenisScene extends MiniScene {
  private sim = new TennisSim();
  private court!: Phaser.GameObjects.Graphics;
  private zone!: Phaser.GameObjects.Ellipse;
  private ballShadow!: Phaser.GameObjects.Ellipse;
  private ball!: Phaser.GameObjects.Arc;
  private me!: PlayerView;
  private them!: PlayerView;
  private scoreLine!: Phaser.GameObjects.Text;
  private rivalLine!: Phaser.GameObjects.Text;
  private message!: Phaser.GameObjects.Text;
  private swipeStart: { x: number; y: number; t: number } | null = null;
  /** A swing made a moment too early waits for the ball for a short while. */
  private buffered: { swing: Swing; until: number } | null = null;
  private waiting = false;
  private tutorial?: { dismiss: () => void };
  private trail: Array<{ x: number; y: number }> = [];
  private trailG!: Phaser.GameObjects.Graphics;

  constructor() {
    super(SceneKeys.Tenis, 'tenis', [0x0c4a6e, 0x065f46]);
  }

  create(): void {
    this.sim = new TennisSim();
    this.buffered = null;
    this.waiting = false;
    this.frame('0');
    this.court = this.add.graphics();
    this.drawCourt();
    this.zone = this.add.ellipse(0, 0, 210, 60, 0xffffff, 0.12).setStrokeStyle(3, 0xffffff, 0.4);
    this.them = this.makePlayer(0xef4444);
    this.ballShadow = this.add.ellipse(0, 0, 22, 8, 0x000000, 0.3);
    this.trailG = this.add.graphics();
    this.ball = this.add.circle(0, 0, 11, 0xd9f99d).setStrokeStyle(2, 0x65a30d);
    this.me = this.makePlayer(0x22d3ee);
    this.scoreLine = addText(this, CX, 166, '', 34, { color: '#ffffff', stroke: '#0b1430' });
    this.rivalLine = addText(this, CX, 210, '', 22, { color: '#bae6fd', weight: 'normal' });
    this.message = addText(this, CX, 1236, '', 26, { color: '#ffffff', stroke: '#0b1430' });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y < 130) return;
      this.tutorial?.dismiss();
      this.swipeStart = { x: p.x, y: p.y, t: this.time.now };
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      const s = this.swipeStart;
      this.swipeStart = null;
      if (!s) return;
      const swing = swingFromSwipe(p.x - s.x, p.y - s.y, this.time.now - s.t);
      if (swing) this.swing(swing);
    });
    this.tutorial = hint(
      this,
      ['Deslize para CIMA para rebater', 'Para o lado mira; rápido = forte'],
      760,
      4500,
    );
    this.newRival();
  }

  // ---------------------------------------------------------------- drawing

  private drawCourt(): void {
    const g = this.court.clear();
    const quad = (x0: number, x1: number, y0: number, y1: number, color: number, alpha = 1) =>
      g.fillStyle(color, alpha).fillPoints(
        [
          { x: sx(x0, y0), y: sy(y0) },
          { x: sx(x1, y0), y: sy(y0) },
          { x: sx(x1, y1), y: sy(y1) },
          { x: sx(x0, y1), y: sy(y1) },
        ],
        true,
      );
    quad(-9, 9, -4, LENGTH + 5, 0x166534);
    quad(-6.2, 6.2, -2.5, LENGTH + 2.5, 0x1d4ed8);
    quad(-HALF_W, HALF_W, 0, LENGTH, 0x2563eb);
    const line = (x0: number, y0: number, x1: number, y1: number) =>
      g.lineBetween(sx(x0, y0), sy(y0), sx(x1, y1), sy(y1));
    g.lineStyle(4, 0xffffff, 0.95);
    line(-HALF_W, 0, HALF_W, 0);
    line(-HALF_W, LENGTH, HALF_W, LENGTH);
    line(-HALF_W, 0, -HALF_W, LENGTH);
    line(HALF_W, 0, HALF_W, LENGTH);
    line(-5.485, 0, -5.485, LENGTH);
    line(5.485, 0, 5.485, LENGTH);
    line(-HALF_W, NET_Y - SERVICE_DEPTH, HALF_W, NET_Y - SERVICE_DEPTH);
    line(-HALF_W, NET_Y + SERVICE_DEPTH, HALF_W, NET_Y + SERVICE_DEPTH);
    line(0, NET_Y - SERVICE_DEPTH, 0, NET_Y + SERVICE_DEPTH);
    // The net.
    const left = sx(-5.5, NET_Y);
    const right = sx(5.5, NET_Y);
    const netTop = sy(NET_Y, NET_H);
    const netFoot = sy(NET_Y);
    g.fillStyle(0x0b1430, 0.55).fillRect(left, netTop, right - left, netFoot - netTop);
    g.lineStyle(1, 0xffffff, 0.25);
    for (let x = left; x <= right; x += 12) g.lineBetween(x, netTop, x, netFoot);
    for (let i = 1; i < 5; i++)
      g.lineBetween(left, sy(NET_Y, (NET_H * i) / 5), right, sy(NET_Y, (NET_H * i) / 5));
    g.lineStyle(5, 0xffffff).lineBetween(left, netTop, right, netTop);
    g.fillStyle(0xcbd5e1)
      .fillRect(left - 8, netTop - 4, 8, netFoot - netTop + 4)
      .fillRect(right, netTop - 4, 8, netFoot - netTop + 4);
  }

  private makePlayer(shirt: number): PlayerView {
    const shadow = this.add.ellipse(0, 4, 70, 18, 0x000000, 0.3);
    const legs = this.add.rectangle(0, -26, 30, 40, 0xf8fafc);
    const body = this.add.rectangle(0, -66, 44, 52, shirt).setStrokeStyle(3, 0x0b1430);
    const head = this.add.circle(0, -108, 17, 0xf1c27d).setStrokeStyle(3, 0x0b1430);
    const cap = this.add.rectangle(0, -120, 34, 9, shirt);
    const head2 = this.add.ellipse(0, 0, 34, 44, 0x000000, 0).setStrokeStyle(5, 0x0b1430);
    const strings = this.add.ellipse(0, 0, 28, 38, 0xffffff, 0.25);
    const handle = this.add.rectangle(0, 30, 6, 26, 0x0b1430);
    const racket = this.add.container(30, -70, [handle, strings, head2]);
    const c = this.add.container(0, 0, [shadow, legs, body, head, cap, racket]);
    return { c, racket };
  }

  private place(v: PlayerView, x: number, y: number): void {
    const s = scaleAt(y);
    v.c.setPosition(sx(x, y), sy(y)).setScale(s * 1.25);
  }

  private swingAnim(v: PlayerView): void {
    this.tweens.add({ targets: v.racket, angle: { from: -70, to: 80 }, duration: 160, yoyo: true });
  }

  // ---------------------------------------------------------------- flow

  private newRival(): void {
    const r = this.sim.rivalInfo;
    this.rivalLine.setText(`Rival ${this.sim.rival + 1}/${RIVALS.length}: ${r.name}`);
    this.refresh();
    banner(this, `vs ${r.name}`, '#fde047', 640);
    this.time.delayedCall(1300, () => this.point());
  }

  private refresh(): void {
    this.scoreLine.setText(
      `VOCÊ ${this.sim.myPoints}  ×  ${this.sim.theirPoints} ${this.sim.rivalInfo.name.toUpperCase()}`,
    );
  }

  private point(): void {
    if (this.ended) return;
    this.sim.setupPoint();
    this.trail = [];
    this.serveCue();
  }

  private serveCue(): void {
    if (this.sim.serving === 'me') {
      this.message.setText(
        this.sim.serveTry === 2
          ? 'Segundo saque: deslize para cima'
          : 'Seu saque: deslize para cima',
      );
    } else {
      this.message.setText('Saque do rival…');
      this.waiting = true;
      this.time.delayedCall(900, () => {
        this.waiting = false;
        this.handle(this.sim.rivalServe());
        this.swingAnim(this.them);
      });
    }
  }

  private swing(swing: Swing): void {
    if (this.ended || this.waiting) return;
    if (!this.sim.live && this.sim.serving === 'me') {
      const ev = this.sim.serve(swing);
      if (ev.length) {
        this.swingAnim(this.me);
        this.handle(ev);
      }
      return;
    }
    // Swiping while the ball is still on its way: wait for the sweet spot.
    const ev = this.sim.inReach('me') && this.sim.timing('me') < 0.6 ? this.sim.swing(swing) : [];
    if (ev.length) {
      this.swingAnim(this.me);
      this.handle(ev);
    } else if (this.sim.live) this.buffered = { swing, until: this.time.now + 450 };
  }

  private handle(events: TennisEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e.type === 'hit') {
        sfx.play(e.pace > 0.7 ? 'boom' : 'pop');
        this.message.setText(e.by === 'me' ? '' : 'Prepare-se…');
        if (e.by === 'them') this.swingAnim(this.them);
        if (e.by === 'me') {
          const x = this.ball.x;
          const y = this.ball.y;
          burst(this, x, y, 0xd9f99d, e.pace > 0.7 ? 14 : 6);
        }
      } else if (e.type === 'bounce') {
        sfx.play('bounce');
        shockwave(this, sx(e.x, e.y), sy(e.y), e.ok ? 0xffffff : 0xef4444, 30 * scaleAt(e.y) + 10);
      } else if (e.type === 'net') sfx.play('hit');
      else if (e.type === 'fault') {
        banner(this, 'Falta!', '#fca5a5', 640);
        this.time.delayedCall(900, () => this.serveCue());
      } else if (e.type === 'point') {
        const mine = e.winner === 'me';
        sfx.play(mine ? 'win' : 'hit');
        banner(
          this,
          mine ? (REASON[e.reason] ?? 'Ponto!') : (REASON[e.reason] ?? 'Ponto deles'),
          mine ? '#86efac' : '#fca5a5',
          640,
        );
        if (mine) burst(this, CX, 640, 0x86efac, 16);
        this.setScore(this.sim.score);
        this.refresh();
        if (!events.some((x) => x.type === 'match'))
          this.time.delayedCall(1300, () => this.point());
      } else if (e.type === 'match') {
        this.time.delayedCall(900, () => {
          if (this.sim.over) {
            this.finish(
              e.winner === 'me'
                ? 'CAMPEÃO DO TORNEIO! 🏆'
                : `Perdeu para ${RIVALS[this.sim.rival]!.name}`,
              [
                `Rivais vencidos: ${this.sim.matchesWon} · Pontos ganhos: ${this.sim.pointsWon}`,
                `Aces: ${this.sim.aces} · Bolas vencedoras: ${this.sim.winners}`,
              ],
              {
                score: this.sim.score,
                details: { matches: this.sim.matchesWon, points: this.sim.pointsWon },
              },
            );
            return;
          }
          flash(this, 0x22c55e, 0.25, 300);
          sfx.play('level');
          this.newRival();
        });
      }
    }
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    if (this.buffered) {
      if (this.time.now > this.buffered.until) this.buffered = null;
      // An early swipe waits for the ball to be in the sweet spot (or about to pass).
      else if (this.sim.inReach('me') && this.sim.timing('me') < 0.25) {
        const ev = this.sim.swing(this.buffered.swing);
        if (ev.length) {
          this.buffered = null;
          this.swingAnim(this.me);
          this.handle(ev);
        }
      }
    }
    this.handle(this.sim.step(dt));
    const s = this.sim;
    const b = s.ball;
    this.place(this.them, s.them.x, s.them.y);
    this.place(this.me, s.me.x, s.me.y);
    const bs = scaleAt(b.y);
    this.ball.setPosition(sx(b.x, b.y), sy(b.y, b.z)).setScale(bs * 1.15);
    this.ballShadow
      .setPosition(sx(b.x, b.y), sy(b.y))
      .setScale(bs)
      .setAlpha(s.live ? 0.35 : 0.15);
    // Ball over/behind the far player: draw order follows depth.
    this.ball.setDepth(b.y > NET_Y ? 1 : 3);
    this.ballShadow.setDepth(b.y > NET_Y ? 0.5 : 2.5);
    this.them.c.setDepth(1.5);
    this.me.c.setDepth(4);
    if (s.live) {
      this.trail.push({ x: this.ball.x, y: this.ball.y });
      if (this.trail.length > 8) this.trail.shift();
    } else this.trail = [];
    const tg = this.trailG.clear().setDepth(this.ball.depth - 0.1);
    this.trail.forEach((p, i) =>
      tg.fillStyle(0xd9f99d, (i / 8) * 0.4).fillCircle(p.x, p.y, 8 * bs * (i / 8)),
    );
    // Your hitting zone lights up when the ball can be hit.
    const ready = s.live && s.lastHit === 'them' && s.inReach('me');
    this.zone
      .setPosition(sx(s.me.x, s.me.y), sy(s.me.y))
      .setScale(scaleAt(s.me.y))
      .setFillStyle(ready ? 0x4ade80 : 0xffffff, ready ? 0.35 : 0.1);
    if (ready && !this.message.text) this.message.setText('AGORA!');
    else if (!ready && this.message.text === 'AGORA!') this.message.setText('');
  }
}
