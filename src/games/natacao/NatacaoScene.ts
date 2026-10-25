import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { burst, shockwave } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { POOL_M, SwimSim, TURN_M, type Judge } from './core';

const CX = GAME_WIDTH / 2;
const X0 = 90;
const X1 = 630;
const POOL_Y = 420;
const LABEL: Record<Judge, [string, string]> = {
  perfect: ['PERFEITO!', '#86efac'],
  good: ['Bom', '#fde68a'],
  miss: ['Fora do ritmo', '#fca5a5'],
};

/** "Natação": tap on the beat for fast strokes; 25 m there, flip, 25 m back. */
export class NatacaoScene extends MiniScene {
  private sim = new SwimSim();
  private swimmer!: Phaser.GameObjects.Text;
  private ring!: Phaser.GameObjects.Graphics;
  private streak!: Phaser.GameObjects.Text;
  private started = false;

  constructor() {
    super(SceneKeys.Natacao, 'natacao', [0x0c4a6e, 0x0ea5e9]);
  }

  create(): void {
    this.sim = new SwimSim();
    this.started = false;
    this.frame('0,00 s');
    this.scoreText.setFontSize(64);
    const pool = this.add.graphics();
    pool.fillStyle(0xbae6fd).fillRoundedRect(40, POOL_Y - 90, GAME_WIDTH - 80, 180, 24);
    pool.fillStyle(0x22d3ee).fillRoundedRect(52, POOL_Y - 78, GAME_WIDTH - 104, 156, 16);
    for (let i = 0; i < 6; i++)
      pool
        .lineStyle(3, 0xffffff, 0.35)
        .lineBetween(52, POOL_Y - 52 + i * 21, GAME_WIDTH - 52, POOL_Y - 52 + i * 21);
    pool
      .fillStyle(0xffffff, 0.6)
      .fillRect(X0 - 28, POOL_Y - 78, 6, 156)
      .fillRect(X1 + 22, POOL_Y - 78, 6, 156);
    this.swimmer = emojiText(this, X0, POOL_Y, '🏊', 84).setFlipX(true);
    addText(this, CX, POOL_Y + 118, '0 m ──────── 25 m ──────── 50 m', 20, {
      color: '#ffffffaa',
      weight: 'normal',
    });
    this.ring = this.add.graphics();
    this.streak = addText(this, CX, 760, 'Toque no ritmo para nadar!', 34, {
      color: '#ffffff',
      stroke: '#0b1430',
    });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y > 130) this.tap();
    });
    this.input.keyboard?.on('keydown-SPACE', () => this.tap());
  }

  private tap(): void {
    if (this.ended) return;
    this.started = true;
    this.judged(this.sim.tap());
  }

  private judged(j: Judge | null): void {
    if (!j) return;
    const { sfx } = getServices(this);
    const [text, color] = LABEL[j];
    sfx.play(j === 'perfect' ? 'win' : j === 'good' ? 'click' : 'hit');
    this.pop(CX, 640, text, color, 52);
    if (j === 'perfect') {
      shockwave(this, CX, 1020, 0x86efac, 90);
      burst(this, this.swimmer.x, POOL_Y, 0xffffff, 10);
    }
    this.streak.setText(this.sim.streak >= 2 ? `🔥 ${this.sim.streak} no ritmo` : '');
    this.tweens.add({ targets: this.swimmer, scale: { from: 1.15, to: 1 }, duration: 160 });
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    if (this.started) this.judged(this.sim.step(Math.min(deltaMs, 50) / 1000));
    const m = this.sim.x;
    const back = m > TURN_M;
    const along = back ? (POOL_M - m) / TURN_M : m / TURN_M;
    this.swimmer
      .setFlipX(!back)
      .setX(X0 + (X1 - X0) * Math.min(1, Math.max(0, back ? 1 - (m - TURN_M) / TURN_M : along)));
    if (this.started) this.setScore(`${this.sim.time.toFixed(2).replace('.', ',')} s`);
    // The beat: a ring closing in on the target ring.
    const g = this.ring.clear();
    const close = this.sim.ring;
    g.lineStyle(8, 0xffffff, 0.9).strokeCircle(CX, 1020, 64);
    g.lineStyle(10, close > 0.9 ? 0x86efac : 0xfde68a, 0.9).strokeCircle(
      CX,
      1020,
      64 + 180 * (1 - close),
    );
    g.fillStyle(0xffffff, 0.12).fillCircle(CX, 1020, 64);
    if (this.sim.done) {
      const ms = Math.round(this.sim.time * 1000);
      this.finish(
        ms < 24000 ? 'Medalha de ouro! 🥇' : ms < 30000 ? 'Prata! 🥈' : 'Chegou ao fim!',
        [
          `Tempo: ${(ms / 1000).toFixed(2).replace('.', ',')} s · Melhor sequência: ${this.sim.best}`,
        ],
        { score: this.sim.score, details: { ms, streak: this.sim.best } },
      );
    }
  }
}
