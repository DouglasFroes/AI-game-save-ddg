import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { burst, flash } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { HURDLES, HurdleSim, hurdleAt, TRACK_M } from './core';

const GROUND = 880;
const RUNNER_X = 190;
const PX_PER_M = 62;

/** "Corrida com Barreiras": tap to jump over every hurdle on the way to the line. */
export class BarreirasScene extends MiniScene {
  private sim = new HurdleSim();
  private runner!: Phaser.GameObjects.Text;
  private track!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private started = false;

  constructor() {
    super(SceneKeys.Barreiras, 'barreiras', [0x312e81, 0xf472b6]);
  }

  create(): void {
    this.sim = new HurdleSim();
    this.started = false;
    this.frame('0,00 s');
    this.scoreText.setFontSize(64);
    this.track = this.add.graphics();
    this.runner = emojiText(this, RUNNER_X, GROUND - 50, '🏃', 110)
      .setFlipX(true)
      .setDepth(4);
    this.info = addText(this, GAME_WIDTH / 2, 190, 'Toque para pular a barreira!', 30, {
      color: '#ffffff',
      stroke: '#0b1430',
    });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y > 130) this.jump();
    });
    this.input.keyboard?.on('keydown-SPACE', () => this.jump());
  }

  private jump(): void {
    if (this.ended) return;
    this.started = true;
    this.sim.jump();
    getServices(this).sfx.play('click');
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const { sfx } = getServices(this);
    const events = this.started ? this.sim.step(Math.min(deltaMs, 50) / 1000) : [];
    for (const e of events) {
      if (e === 'perfect') {
        this.pop(RUNNER_X + 140, GROUND - 260, 'PERFEITO!', '#86efac', 44);
        sfx.play('win');
        burst(this, RUNNER_X, GROUND - 100, 0x86efac, 10);
      } else if (e === 'clear') sfx.play('star');
      else if (e === 'hit') {
        sfx.play('hit');
        flash(this, 0xdc2626, 0.2, 240);
        this.cameras.main.shake(160, 0.006);
        this.pop(RUNNER_X + 140, GROUND - 260, 'Bateu!', '#fca5a5', 44);
      }
    }
    const s = this.sim;
    const g = this.track.clear();
    g.fillStyle(0xc2410c).fillRect(0, GROUND, GAME_WIDTH, 300);
    g.fillStyle(0xffffff, 0.5).fillRect(0, GROUND + 4, GAME_WIDTH, 5);
    // Lane marks scroll with the distance.
    const off = (s.x * PX_PER_M) % 120;
    g.fillStyle(0xffffff, 0.35);
    for (let x = -off; x < GAME_WIDTH; x += 120) g.fillRect(x, GROUND + 70, 60, 6);
    for (let i = 0; i < HURDLES; i++) {
      const x = RUNNER_X + (hurdleAt(i) - s.x) * PX_PER_M;
      if (x < -60 || x > GAME_WIDTH + 60) continue;
      const down = i < s.next && s.stumble > 0 && i === s.next - 1;
      g.fillStyle(0x000000, 0.25).fillEllipse(x, GROUND + 8, 70, 12);
      g.lineStyle(10, 0xf8fafc).lineBetween(
        x - 28,
        GROUND - (down ? 10 : 78),
        x + 28,
        GROUND - (down ? 10 : 78),
      );
      g.lineStyle(8, 0x94a3b8)
        .lineBetween(x - 28, GROUND, x - 28, GROUND - 78)
        .lineBetween(x + 28, GROUND, x + 28, GROUND - 78);
    }
    const fx = RUNNER_X + (TRACK_M - s.x) * PX_PER_M;
    if (fx < GAME_WIDTH + 40)
      g.fillStyle(0xffffff)
        .fillRect(fx, GROUND - 260, 12, 260)
        .fillStyle(0xfacc15)
        .fillRect(fx, GROUND - 260, 120, 30);
    this.runner.setY(
      GROUND -
        50 -
        s.height * 200 -
        (s.air < 0 && this.started && s.stumble === 0 ? Math.abs(Math.sin(s.time * 15)) * 8 : 0),
    );
    this.runner.setAngle(s.stumble > 0 ? -18 : 0);
    if (this.started) {
      this.setScore(`${s.time.toFixed(2).replace('.', ',')} s`);
      this.info.setText(
        `Faltam ${Math.max(0, Math.ceil(TRACK_M - s.x))} m · Barreiras ${Math.min(s.next, HURDLES)}/${HURDLES}`,
      );
    }
    if (s.done) {
      const ms = Math.round(s.time * 1000);
      this.finish(
        s.hits === 0 ? 'Prova perfeita! 🥇' : ms < 15500 ? 'Boa corrida!' : 'Chegou ao fim!',
        [`Tempo: ${(ms / 1000).toFixed(2).replace('.', ',')} s · Batidas: ${s.hits}`],
        { score: s.score, details: { ms, hits: s.hits } },
      );
    }
  }
}
