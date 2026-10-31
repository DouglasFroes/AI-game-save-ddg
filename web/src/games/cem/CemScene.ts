import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, shockwave } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { DISTANCE, SprintRace, type RaceEvent } from './core';

const TRACK_X0 = 90;
const TRACK_X1 = 640;
const LANE_Y0 = 360;
const LANE_H = 120;
const BTN_Y = 1110;

/** "Corrida de 100 m": wait for the gun, then tap left-right-left-right as fast as you can. */
export class CemScene extends MiniScene {
  private race = new SprintRace();
  private g!: Phaser.GameObjects.Graphics;
  private runners: Phaser.GameObjects.Text[] = [];
  private names: Phaser.GameObjects.Text[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private callText!: Phaser.GameObjects.Text;
  private busy = false;

  constructor() {
    super(SceneKeys.Cem, 'cem', [0x7c2d12, 0x9a3412]);
  }

  create(): void {
    this.race = new SprintRace();
    this.busy = false;
    this.frame('0');
    this.input.addPointer(2);
    this.g = this.add.graphics().setDepth(4);
    this.runners = [0, 1, 2, 3].map((i) =>
      emojiText(this, TRACK_X0, LANE_Y0 + i * LANE_H, i === 0 ? '🏃' : '🏃‍♂️', 64)
        .setDepth(6)
        .setFlipX(true),
    );
    this.names = [0, 1, 2, 3].map((i) =>
      addText(this, TRACK_X0 - 40, LANE_Y0 + i * LANE_H - 46, '', 20, {
        color: '#ffffff',
        align: 'left',
      })
        .setOrigin(0, 0.5)
        .setDepth(6),
    );
    this.statusText = addText(this, GAME_WIDTH / 2, 168, '', 28, {
      color: '#fed7aa',
      stroke: '#7c2d12',
      strokeThickness: 6,
    }).setDepth(50);
    this.callText = addText(this, GAME_WIDTH / 2, 900, '', 52, {
      color: '#ffffff',
      stroke: '#7c2d12',
      strokeThickness: 9,
    }).setDepth(50);
    addText(this, 190, BTN_Y, 'ESQ', 40, { color: '#ffffff' }).setDepth(51);
    addText(this, 530, BTN_Y, 'DIR', 40, { color: '#ffffff' }).setDepth(51);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.ended || this.busy || p.y < BTN_Y - 120) return;
      this.handle(this.race.tap(p.x < GAME_WIDTH / 2 ? 'L' : 'R'));
    });
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (this.ended || this.busy) return;
      if (e.key === 'ArrowLeft' || e.key === 'z') this.handle(this.race.tap('L'));
      if (e.key === 'ArrowRight' || e.key === 'x') this.handle(this.race.tap('R'));
    });
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    if (!this.busy) this.handle(this.race.step(Math.min(deltaMs, 40) / 1000));
    const r = this.race;
    const all = [r.me, ...r.rivals];
    all.forEach((runner, i) => {
      const x = TRACK_X0 + (runner.pos / DISTANCE) * (TRACK_X1 - TRACK_X0);
      const bob =
        r.phase === 'run' && runner.speed > 1
          ? Math.abs(Math.sin(this.time.now / (60 - runner.speed * 2))) * 8
          : 0;
      this.runners[i]!.setPosition(x, LANE_Y0 + i * LANE_H - bob);
      this.names[i]!.setText(runner.name);
    });
    if (r.phase === 'set')
      this.callText.setText(r.time < r.goAt * 0.5 ? 'Às suas marcas…' : 'Prepara…');
    else if (r.phase === 'run')
      this.callText.setText(`${r.time.toFixed(2)} s · ${r.me.speed.toFixed(1)} m/s`);
    this.statusText.setText(
      `Corrida ${r.race} · Vitórias ${r.wins}${r.bestTime ? ` · Melhor ${r.bestTime.toFixed(2)} s` : ''}`,
    );
    this.setScore(r.score);
    this.draw();
  }

  private handle(events: RaceEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e.type === 'go') {
        sfx.play('boom');
        banner(this, 'JÁ!', '#fde047', 560);
      } else if (e.type === 'false-start') {
        sfx.play('hit');
        flash(this, 0xef4444, 0.3, 260);
        banner(this, 'QUEIMOU A LARGADA!', '#fca5a5', 560);
      } else if (e.type === 'stumble') {
        sfx.play('locked');
        this.cameras.main.shake(100, 0.006);
      } else if (e.type === 'finish') {
        this.busy = true;
        const won = e.place === 1;
        sfx.play(won ? 'win' : 'hit');
        sfx.vibrate(won ? [30, 30, 80] : 60);
        banner(
          this,
          won ? `VITÓRIA! ${e.time.toFixed(2)} s` : `${e.place}º lugar · ${e.time.toFixed(2)} s`,
          won ? '#fde047' : '#fca5a5',
        );
        if (won) {
          shockwave(this, TRACK_X1, LANE_Y0, 0xfde047, 160);
          burst(this, TRACK_X1, LANE_Y0, 0xfde047, 24, { speed: 320 });
          this.time.delayedCall(1700, () => {
            if (this.ended) return;
            this.race.nextRace();
            this.busy = false;
          });
        }
      } else {
        this.finish(
          this.race.wins ? 'Fim da série!' : 'Não foi desta vez!',
          [
            `Vitórias: ${this.race.wins}${this.race.bestTime ? ` · Melhor tempo: ${this.race.bestTime.toFixed(2)} s` : ''}`,
          ],
          { score: this.race.score, details: { wins: this.race.wins } },
          1300,
        );
      }
    }
  }

  private draw(): void {
    const g = this.g.clear();
    for (let i = 0; i < 4; i++) {
      const y = LANE_Y0 + i * LANE_H;
      g.fillStyle(i % 2 ? 0xb45309 : 0xc2410c, 1).fillRect(40, y - LANE_H / 2 + 8, 640, LANE_H - 8);
      g.lineStyle(3, 0xffffff, 0.6).lineBetween(40, y + LANE_H / 2, 680, y + LANE_H / 2);
    }
    g.fillStyle(0xffffff, 1).fillRect(TRACK_X1 + 26, LANE_Y0 - LANE_H / 2, 8, LANE_H * 4);
    for (let k = 0; k < 16; k++)
      g.fillStyle(k % 2 ? 0x000000 : 0xffffff, 1).fillRect(
        TRACK_X1 + 26,
        LANE_Y0 - LANE_H / 2 + k * 30,
        8,
        15,
      );
    // Tap pads.
    for (const [x, color] of [
      [190, 0x2563eb],
      [530, 0xdc2626],
    ] as const) {
      g.fillStyle(0x000000, 0.35).fillRoundedRect(x - 150, BTN_Y - 80, 300, 170, 30);
      g.fillStyle(color, 0.9).fillRoundedRect(x - 145, BTN_Y - 86, 290, 160, 30);
    }
  }
}
