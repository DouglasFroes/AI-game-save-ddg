import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { BikeSim, heightAt, RACE_M, SPRINT_M, type BikeEvent, type Rider } from './core';

const CX = GAME_WIDTH / 2;
const PX_PER_M = 24;
const PX_PER_H = 9;
const ME_X = 230;
const ROAD_Y = 860;

/** "Ciclismo": hold to pedal, let go to coast; ride in the draft and keep energy for the sprint. */
export class CiclismoScene extends MiniScene {
  private sim = new BikeSim();
  private far!: Phaser.GameObjects.Graphics;
  private road!: Phaser.GameObjects.Graphics;
  private bikes!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private placeText!: Phaser.GameObjects.Text;
  private draftText!: Phaser.GameObjects.Text;
  private arrows: Phaser.GameObjects.Text[] = [];
  private holding = false;
  private started = false;
  private crank = new Map<string, number>();
  private tutorial?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Ciclismo, 'ciclismo', [0x7dd3fc, 0xe0f2fe]);
  }

  create(): void {
    this.sim = new BikeSim(1 + Math.floor(Math.random() * 50));
    this.holding = false;
    this.started = false;
    this.crank = new Map();
    this.frame('0 m');
    this.scoreText.setFontSize(56).setColor('#0f172a').setStroke('#ffffff', 8);
    this.far = this.add.graphics().setDepth(-4);
    this.road = this.add.graphics().setDepth(-2);
    this.bikes = this.add.graphics().setDepth(2);
    this.hud = this.add.graphics().setDepth(5);
    this.hudText = addText(this, 40, 236, '', 24, { color: '#0f172a' })
      .setOrigin(0, 0.5)
      .setDepth(6);
    this.placeText = addText(this, GAME_WIDTH - 40, 236, '', 40, {
      color: '#1d4ed8',
      stroke: '#ffffff',
      strokeThickness: 6,
    })
      .setOrigin(1, 0.5)
      .setDepth(6);
    this.draftText = addText(this, ME_X, 600, '', 26, {
      color: '#0369a1',
      stroke: '#ffffff',
      strokeThickness: 5,
    }).setDepth(6);
    this.arrows = this.sim.riders.slice(1).map(() =>
      addText(this, 0, 0, '', 22, {
        color: '#0f172a',
        stroke: '#ffffff',
        strokeThickness: 4,
      }).setDepth(6),
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y < 130) return;
      this.tutorial?.dismiss();
      this.holding = true;
      this.started = true;
    });
    const release = () => (this.holding = false);
    this.input.on(Phaser.Input.Events.POINTER_UP, release);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, release);
    this.input.keyboard?.on('keydown-SPACE', () => {
      this.holding = true;
      this.started = true;
    });
    this.input.keyboard?.on('keyup-SPACE', release);
    this.tutorial = hint(
      this,
      [
        'SEGURE para pedalar, SOLTE para descansar',
        'Nas descidas, solte! Atrás de alguém = vácuo',
        'Guarde energia para o sprint final',
      ],
      1060,
      6500,
    );
  }

  private sx(x: number): number {
    return ME_X + (x - this.sim.me.x) * PX_PER_M;
  }

  private sy(x: number): number {
    return (
      ROAD_Y - (heightAt(x, this.sim.seed) - heightAt(this.sim.me.x, this.sim.seed)) * PX_PER_H
    );
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    if (this.started) this.handle(this.sim.step(dt, this.holding));
    this.drawWorld();
    this.drawRiders(dt);
    this.drawHud();
  }

  private drawWorld(): void {
    const me = this.sim.me;
    const f = this.far.clear();
    f.fillStyle(0xfef9c3).fillCircle(580, 300, 60);
    // Far mountains move slowly (parallax).
    f.fillStyle(0x94a3b8, 0.7);
    const pts: Array<{ x: number; y: number }> = [{ x: 0, y: 1280 }];
    for (let x = 0; x <= GAME_WIDTH; x += 20)
      pts.push({
        x,
        y: 620 - 90 * Math.abs(Math.sin((x + me.x * 3) / 160)) - 40 * Math.sin((x + me.x * 3) / 63),
      });
    pts.push({ x: GAME_WIDTH, y: 1280 });
    f.fillPoints(pts, true);
    f.fillStyle(0x65a30d, 0.8);
    const near: Array<{ x: number; y: number }> = [{ x: 0, y: 1280 }];
    for (let x = 0; x <= GAME_WIDTH; x += 20)
      near.push({ x, y: 760 - 40 * Math.sin((x + me.x * 9) / 110) });
    near.push({ x: GAME_WIDTH, y: 1280 });
    f.fillPoints(near, true);
    // The road.
    const r = this.road.clear();
    const road: Array<{ x: number; y: number }> = [];
    for (let px = -20; px <= GAME_WIDTH + 20; px += 8) {
      const x = me.x + (px - ME_X) / PX_PER_M;
      road.push({ x: px, y: this.sy(x) });
    }
    r.fillStyle(0x4d7c0f).fillPoints(
      [
        { x: -20, y: 1280 },
        ...road.map((p) => ({ x: p.x, y: p.y + 30 })),
        { x: GAME_WIDTH + 20, y: 1280 },
      ],
      true,
    );
    r.lineStyle(26, 0x374151).strokePoints(road);
    r.lineStyle(3, 0xfde047, 0.9);
    // Dashed centre line and distance posts.
    for (let i = 0; i < road.length - 1; i += 2)
      r.lineBetween(road[i]!.x, road[i]!.y, road[i + 1]!.x, road[i + 1]!.y);
    for (let m = Math.ceil((me.x - 12) / 50) * 50; m < me.x + 25; m += 50) {
      const x = this.sx(m);
      const y = this.sy(m);
      r.fillStyle(0xffffff).fillRect(x - 3, y - 70, 6, 56);
      r.fillStyle(m >= RACE_M - SPRINT_M ? 0xef4444 : 0x1d4ed8).fillRect(x - 22, y - 92, 44, 24);
    }
    // Finish banner.
    if (RACE_M - me.x < 30) {
      const x = this.sx(RACE_M);
      const y = this.sy(RACE_M);
      r.fillStyle(0xffffff)
        .fillRect(x - 114, y - 260, 8, 250)
        .fillRect(x + 106, y - 260, 8, 250);
      // Chequered banner across the road.
      for (let i = 0; i < 10; i++)
        for (let j = 0; j < 2; j++)
          r.fillStyle((i + j) % 2 ? 0x111827 : 0xffffff).fillRect(
            x - 110 + i * 22,
            y - 290 + j * 17,
            22,
            17,
          );
    }
  }

  /** One rider on a bike, leaning with the road, legs turning with the cranks. */
  private drawBike(g: Phaser.GameObjects.Graphics, r: Rider, dt: number): void {
    const x = this.sx(r.x);
    if (x < -60 || x > GAME_WIDTH + 60) return;
    const y = this.sy(r.x) - 14;
    const ang = Math.atan2(this.sy(r.x + 1) - this.sy(r.x - 1), 2 * PX_PER_M);
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const P = (dx: number, dy: number) => ({ x: x + dx * c - dy * s, y: y + dx * s + dy * c });
    const crank = (this.crank.get(r.name) ?? 0) + (r.pedalling ? r.v * dt * 1.4 : 0);
    this.crank.set(r.name, crank);
    const rear = P(-26, -16);
    const front = P(26, -16);
    const bb = P(0, -16);
    const seat = P(-8, -48);
    const bars = P(20, -50);
    const wheel = (p: { x: number; y: number }) => {
      g.lineStyle(5, 0x111827).strokeCircle(p.x, p.y, 17);
      const a = r.x * 0.9;
      g.lineStyle(2, 0x9ca3af).lineBetween(
        p.x - Math.cos(a) * 15,
        p.y - Math.sin(a) * 15,
        p.x + Math.cos(a) * 15,
        p.y + Math.sin(a) * 15,
      );
    };
    wheel(rear);
    wheel(front);
    g.lineStyle(5, r.color)
      .lineBetween(rear.x, rear.y, bb.x, bb.y)
      .lineBetween(bb.x, bb.y, seat.x, seat.y)
      .lineBetween(seat.x, seat.y, rear.x, rear.y);
    g.lineBetween(bb.x, bb.y, bars.x, bars.y).lineBetween(bars.x, bars.y, front.x, front.y);
    // Rider: legs follow the crank.
    const foot = P(Math.cos(crank) * 10, -16 + Math.sin(crank) * 10);
    const foot2 = P(-Math.cos(crank) * 10, -16 - Math.sin(crank) * 10);
    const hip = P(-6, -58);
    const knee = P(10, -44 + Math.sin(crank) * 6);
    const knee2 = P(8, -44 - Math.sin(crank) * 6);
    g.lineStyle(7, 0x1f2937)
      .lineBetween(hip.x, hip.y, knee2.x, knee2.y)
      .lineBetween(knee2.x, knee2.y, foot2.x, foot2.y);
    g.lineStyle(7, 0x111827)
      .lineBetween(hip.x, hip.y, knee.x, knee.y)
      .lineBetween(knee.x, knee.y, foot.x, foot.y);
    const shoulder = P(14, -82);
    g.lineStyle(13, r.color).lineBetween(hip.x, hip.y, shoulder.x, shoulder.y);
    g.lineStyle(6, 0xf1c27d).lineBetween(shoulder.x, shoulder.y, bars.x, bars.y);
    const head = P(24, -96);
    g.fillStyle(0xf1c27d).fillCircle(head.x, head.y, 10);
    g.fillStyle(r.color).fillEllipse(head.x - 2, head.y - 6, 26, 14);
    if (r.bonked)
      g.fillStyle(0x93c5fd).fillCircle(head.x + 14, head.y + 4 + ((this.time.now / 8) % 12), 4);
  }

  private drawRiders(dt: number): void {
    const g = this.bikes.clear();
    for (const r of this.sim.riders.slice(1)) this.drawBike(g, r, dt);
    this.drawBike(g, this.sim.me, dt);
    // Rivals off screen: arrows with the gap.
    this.sim.riders.slice(1).forEach((r, i) => {
      const a = this.arrows[i]!;
      const x = this.sx(r.x);
      const gap = Math.round(r.x - this.sim.me.x);
      if (x > GAME_WIDTH + 20)
        a.setText(`${r.name} +${gap} m ▶`)
          .setPosition(GAME_WIDTH - 110, 330 + i * 34)
          .setColor('#b91c1c');
      else if (x < -20)
        a.setText(`◀ ${r.name} ${gap} m`)
          .setPosition(110, 330 + i * 34)
          .setColor('#166534');
      else a.setText('');
    });
  }

  private drawHud(): void {
    const s = this.sim;
    const me = s.me;
    const g = this.hud.clear();
    // Energy.
    g.fillStyle(0x0f172a, 0.6).fillRoundedRect(40, 164, 400, 30, 12);
    const e = me.energy / 100;
    g.fillStyle(e > 0.5 ? 0x22c55e : e > 0.25 ? 0xfacc15 : 0xef4444).fillRoundedRect(
      40,
      164,
      Math.max(0, 400 * e),
      30,
      12,
    );
    this.hudText.setText(
      `Energia · ${Math.round(me.v * 3.6)} km/h${me.bonked ? ' · QUEBROU!' : ''}`,
    );
    this.placeText.setText(`${s.place}º`);
    this.setScore(`${Math.max(0, Math.ceil(RACE_M - me.x))} m`);
    this.draftText
      .setText(me.drafting ? '🌬️ no vácuo' : s.inSprint && this.holding ? '🔥 SPRINT!' : '')
      .setPosition(ME_X, this.sy(me.x) - 170);
    // Elevation profile with everyone on it.
    const W = 640;
    const X0 = 40;
    const Y0 = 1220;
    g.fillStyle(0xffffff, 0.75).fillRoundedRect(X0 - 10, Y0 - 76, W + 20, 92, 12);
    g.lineStyle(3, 0x475569);
    let prev: { x: number; y: number } | null = null;
    for (let i = 0; i <= 80; i++) {
      const m = (RACE_M * i) / 80;
      const p = { x: X0 + (W * i) / 80, y: Y0 - 10 - (heightAt(m, s.seed) + 12) * 1.4 };
      if (prev) g.lineBetween(prev.x, prev.y, p.x, p.y);
      prev = p;
    }
    g.fillStyle(0xef4444, 0.5).fillRect(X0 + W * (1 - SPRINT_M / RACE_M), Y0 - 70, 3, 80);
    for (const r of [...s.riders.slice(1), me]) {
      const k = Math.min(1, r.x / RACE_M);
      g.fillStyle(r.color).fillCircle(
        X0 + W * k,
        Y0 - 10 - (heightAt(r.x, s.seed) + 12) * 1.4,
        r === me ? 9 : 6,
      );
    }
  }

  private handle(events: BikeEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e.type === 'draft' && e.on) sfx.play('zap');
      else if (e.type === 'bonk') {
        sfx.play('hit');
        banner(this, 'QUEBROU!', '#ef4444', 520);
        this.cameras.main.shake(200, 0.006);
      } else if (e.type === 'sprint') {
        sfx.play('level');
        banner(this, 'SPRINT FINAL!', '#ef4444', 520);
        flash(this, 0xfde047, 0.2, 240);
      } else if (e.type === 'finish' && e.name !== 'Você')
        this.pop(CX, 470, `${e.name} cruzou a linha (${e.place}º)`, '#0f172a', 30);
      else if (e.type === 'over') {
        burst(this, ME_X, this.sy(this.sim.me.x) - 60, 0xfde047, 30);
        sfx.play(e.place === 1 ? 'win' : 'coin');
        const score = this.sim.score(e.place, e.time);
        this.finish(
          e.place === 1 ? 'Vitória na etapa! 🚴' : `${e.place}º lugar`,
          [`Tempo: ${e.time.toFixed(1).replace('.', ',')} s · ${e.place}º de 4`],
          { score, details: { place: e.place, time: Math.round(e.time * 10) } },
        );
      }
    }
  }
}
