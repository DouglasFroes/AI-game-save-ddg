import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { burst, flash } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { rivalAt, SprintSim, TRACK_M } from './core';

const X0 = 90;
const X1 = 640;
const LANE_Y = (i: number) => 330 + i * 120;
const px = (m: number) => X0 + ((X1 - X0) * m) / TRACK_M;

/** "100 Metros Rasos": alternate the two pads; wait for the gun. */
export class CemScene extends MiniScene {
  private sim = new SprintSim();
  private runners: Phaser.GameObjects.Text[] = [];
  private banner!: Phaser.GameObjects.Text;
  private clock!: Phaser.GameObjects.Text;
  private pads: Phaser.GameObjects.Graphics[] = [];

  constructor() {
    super(SceneKeys.Cem, 'cem', [0x14532d, 0x16a34a]);
  }

  create(): void {
    this.sim = new SprintSim();
    this.runners = [];
    this.pads = [];
    this.frame('0,00 s');
    this.scoreText.setFontSize(64);
    const track = this.add.graphics();
    for (let i = 0; i < 4; i++) {
      track
        .fillStyle(i % 2 ? 0xb45309 : 0xc2410c)
        .fillRoundedRect(40, LANE_Y(i) - 52, GAME_WIDTH - 80, 104, 14);
      track
        .lineStyle(3, 0xffffff, 0.5)
        .lineBetween(40, LANE_Y(i) + 52, GAME_WIDTH - 40, LANE_Y(i) + 52);
    }
    track
      .fillStyle(0xffffff, 0.9)
      .fillRect(X0 - 6, 270, 6, 4 * 120 + 10)
      .fillRect(X1 + 28, 270, 10, 4 * 120 + 10);
    const names = ['Você', ...this.sim.rivals.map((r) => r.name)];
    for (let i = 0; i < 4; i++) {
      this.runners.push(
        emojiText(this, X0, LANE_Y(i) - 4, i === 0 ? '🏃' : '🏃🏽', 76).setFlipX(true),
      );
      addText(this, 36, LANE_Y(i) - 40, names[i]!, 16, {
        color: '#ffffffcc',
        weight: 'normal',
      }).setOrigin(0, 0.5);
    }
    this.banner = addText(this, GAME_WIDTH / 2, 780, 'A POSTOS…', 76, {
      color: '#ffe066',
      stroke: '#0b1430',
    });
    this.clock = addText(this, GAME_WIDTH / 2, 870, 'Só corra depois do tiro!', 28, {
      color: '#ffffff',
      weight: 'normal',
    });
    for (const [i, label] of ['◀  ESQ', 'DIR  ▶'].entries()) {
      const g = this.add.graphics();
      this.pads.push(g);
      this.padStyle(i, 0);
      addText(this, 190 + i * 340, 1090, label, 48, { color: '#ffffff', stroke: '#052e16' });
    }
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y > 130) this.tap(p.x < GAME_WIDTH / 2 ? 'L' : 'R');
    });
    this.input.keyboard?.on('keydown-LEFT', () => this.tap('L'));
    this.input.keyboard?.on('keydown-RIGHT', () => this.tap('R'));
  }

  private padStyle(i: number, glow: number): void {
    const g = this.pads[i]!.clear();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(40 + i * 340, 968, 300, 250, 36);
    g.fillStyle(glow ? 0xfacc15 : 0x15803d).fillRoundedRect(40 + i * 340, 958, 300, 250, 36);
  }

  private tap(side: 'L' | 'R'): void {
    if (this.ended) return;
    const before = this.sim.phase;
    this.sim.tap(side);
    const i = side === 'L' ? 0 : 1;
    this.padStyle(i, 1);
    this.time.delayedCall(70, () => this.padStyle(i, 0));
    getServices(this).sfx.play('click');
    if (before === 'wait' && this.sim.phase === 'false') {
      flash(this, 0xdc2626, 0.3, 300);
      this.finish('Queimou a largada!', ['Largou antes do tiro'], {
        score: 0,
        details: { ms: 0, place: 0 },
      });
    }
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const ev = this.sim.step(Math.min(deltaMs, 50) / 1000);
    if (ev === 'gun') {
      this.banner.setText('JÁ!').setColor('#86efac');
      this.clock.setText('Alterne os lados! Mesmo lado duas vezes = tropeço');
      getServices(this).sfx.play('win');
      this.cameras.main.flash(120, 255, 255, 255);
    }
    const t = this.sim.time;
    this.runners[0]!.x = px(this.sim.x);
    this.sim.rivals.forEach((r, i) => (this.runners[i + 1]!.x = px(rivalAt(r, t))));
    // A little bounce sells the speed.
    this.runners.forEach(
      (r, i) =>
        (r.y = LANE_Y(i) - 4 - (this.sim.phase === 'run' ? Math.abs(Math.sin(t * 14 + i)) * 7 : 0)),
    );
    if (this.sim.phase === 'run') this.setScore(`${t.toFixed(2).replace('.', ',')} s`);
    if (ev === 'finish') {
      const place = this.sim.place;
      const ms = Math.round(this.sim.finish * 1000);
      burst(this, px(TRACK_M), LANE_Y(0), 0xffe066, 24);
      this.finish(
        place === 1
          ? 'Medalha de ouro! 🥇'
          : place === 2
            ? 'Prata! 🥈'
            : place === 3
              ? 'Bronze! 🥉'
              : '4º lugar',
        [`Tempo: ${(ms / 1000).toFixed(2).replace('.', ',')} s · ${place}º lugar`],
        { score: this.sim.score, details: { ms, place } },
      );
    }
  }
}
