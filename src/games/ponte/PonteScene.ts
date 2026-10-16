import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { BridgeSim, type BridgeResult } from './core';

const EDGE = 220; // x of the current platform's right edge on screen
const TOP = 860; // y of the platforms' top
const WALK = 460; // px/s
const SCROLL = 700; // px/s

type Stage = 'idle' | 'grow' | 'fall' | 'walk' | 'scroll' | 'drop' | 'over';

/** "Ponte Certa": hold to stretch the bridge, let go when it fits. */
export class PonteScene extends MiniScene {
  private sim = new BridgeSim();
  private g!: Phaser.GameObjects.Graphics;
  private hero!: Phaser.GameObjects.Text;
  private hint?: Phaser.GameObjects.Text;
  private stage: Stage = 'idle';
  private angle = 0; // stick rotation: 0 = upright, 90 = flat
  private heroX = EDGE - 24;
  private heroY = TOP - 30;
  private heroVy = 0;
  private shift = 0;
  private result: BridgeResult | null = null;

  constructor() {
    super(SceneKeys.Ponte, 'ponte', [0x5f0f40, 0xfb8b24]);
  }

  create(): void {
    this.sim = new BridgeSim();
    this.stage = 'idle';
    this.angle = 0;
    this.heroX = EDGE - 24;
    this.heroY = TOP - 30;
    this.heroVy = 0;
    this.shift = 0;
    this.result = null;
    this.frame();
    this.g = this.add.graphics();
    this.hero = emojiText(this, this.heroX, this.heroY, '🥷', 56);
    this.hint = addText(
      this,
      GAME_WIDTH / 2,
      520,
      'Segure para esticar a ponte\nsolte para ela cair',
      36,
      { color: '#ffffff', stroke: '#0b1430' },
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y > 130 && this.stage === 'idle') {
        this.stage = 'grow';
        this.hint?.destroy();
        this.hint = undefined;
      }
    });
    const release = () => {
      if (this.stage !== 'grow') return;
      this.result = this.sim.release();
      this.stage = 'fall';
      this.angle = 0;
    };
    this.input.on(Phaser.Input.Events.POINTER_UP, release);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, release);
  }

  override update(_t: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;
    const sim = this.sim;
    const res = this.result;
    switch (this.stage) {
      case 'grow':
        sim.grow(dt);
        break;
      case 'fall':
        this.angle += dt * 330;
        if (this.angle >= 90 && res) {
          this.angle = 90;
          if (res.ok) {
            getServices(this).sfx.play(res.perfect ? 'win' : 'pop');
            if (res.perfect)
              this.pop(EDGE + sim.gap + sim.nextW / 2, TOP - 120, 'PERFEITO +2', '#ffe066');
            this.setScore(sim.score);
          }
          this.stage = 'walk';
        }
        break;
      case 'walk': {
        if (!res) break;
        const target = res.ok ? EDGE + sim.gap + sim.nextW - 24 : EDGE + res.reach + 10;
        this.heroX = Math.min(target, this.heroX + WALK * dt);
        if (this.heroX >= target) this.stage = res.ok ? 'scroll' : 'drop';
        break;
      }
      case 'scroll': {
        const total = sim.gap + sim.nextW;
        this.shift = Math.min(total, this.shift + SCROLL * dt);
        if (this.shift >= total) {
          sim.advance();
          this.shift = 0;
          this.heroX = EDGE - 24;
          this.angle = 0;
          this.result = null;
          this.stage = 'idle';
        }
        break;
      }
      case 'drop':
        this.heroVy += 2200 * dt;
        this.heroY += this.heroVy * dt;
        if (this.heroY > 1400) {
          this.stage = 'over';
          this.finish(
            'Caiu no buraco!',
            [`Perfeitas: ${sim.perfects}`],
            { score: sim.score, details: { perfects: sim.perfects } },
            100,
          );
        }
        break;
      default:
        break;
    }
    this.draw();
  }

  private draw(): void {
    const g = this.g.clear();
    const sim = this.sim;
    const s = this.shift;
    g.fillStyle(0x10002b).fillRect(EDGE - sim.curW - s, TOP, sim.curW, 500);
    const nx = EDGE + sim.gap - s;
    g.fillStyle(0x10002b).fillRect(nx, TOP, sim.nextW, 500);
    g.fillStyle(0xe63946).fillRect(nx + sim.nextW / 2 - 8, TOP, 16, 10);
    // The stick pivots on the platform's right edge.
    if (sim.stick > 0) {
      const rad = Phaser.Math.DegToRad(this.angle);
      g.lineStyle(10, 0xf1faee).lineBetween(
        EDGE - s,
        TOP,
        EDGE - s + Math.sin(rad) * sim.stick,
        TOP - Math.cos(rad) * sim.stick,
      );
    }
    this.hero.setPosition(this.heroX - s, this.heroY);
  }
}
