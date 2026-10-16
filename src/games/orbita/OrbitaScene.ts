import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { OrbitSim } from './core';

const CX = GAME_WIDTH / 2;
const CY = 700;
const RADII = [170, 285] as const;

const starPoints = (x: number, y: number, r: number): Phaser.Math.Vector2[] =>
  Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    return new Phaser.Math.Vector2(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  });

/** "Órbita": tap to hop between two rings, grab stars, dodge the rocks. */
export class OrbitaScene extends MiniScene {
  private sim = new OrbitSim();
  private g!: Phaser.GameObjects.Graphics;
  private hint?: Phaser.GameObjects.Text;
  private shipR: number = RADII[0];

  constructor() {
    super(SceneKeys.Orbita, 'orbita', [0x14123a, 0x3a1c71]);
  }

  create(): void {
    this.sim = new OrbitSim();
    this.shipR = RADII[0];
    this.frame();
    this.g = this.add.graphics();
    this.hint = addText(this, CX, 1120, 'Toque para trocar de órbita', 36, {
      color: '#ffffff',
      stroke: '#0b1430',
    });
    const tap = () => {
      if (this.ended) return;
      this.hint?.destroy();
      this.hint = undefined;
      this.sim.tap();
      getServices(this).sfx.play('click');
    };
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y > 130) tap();
    });
    this.input.keyboard?.on('keydown-SPACE', tap);
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    for (const e of this.sim.step(dt)) {
      if (e.type === 'star') {
        getServices(this).sfx.play('star');
        this.setScore(this.sim.score);
      } else {
        this.finish(
          'Bateu numa pedra!',
          [`Estrelas: ${this.sim.score}`],
          { score: this.sim.score, details: { seconds: Math.floor(this.sim.time) } },
          700,
        );
      }
    }
    this.shipR += (RADII[this.sim.ring] - this.shipR) * Math.min(1, dt * 16);
    this.draw();
  }

  private draw(): void {
    const g = this.g.clear();
    g.fillStyle(0xffc857).fillCircle(CX, CY, 60);
    g.fillStyle(0xff9f1c, 0.6).fillCircle(CX, CY, 90);
    for (const r of RADII) g.lineStyle(6, 0xffffff, 0.22).strokeCircle(CX, CY, r);
    for (const it of this.sim.items) {
      const x = CX + Math.cos(it.a) * RADII[it.ring];
      const y = CY + Math.sin(it.a) * RADII[it.ring];
      if (it.kind === 'star') g.fillStyle(0xffe066).fillPoints(starPoints(x, y, 26), true);
      else {
        g.fillStyle(0x8d99ae).fillCircle(x, y, 26);
        g.fillStyle(0x5c677d)
          .fillCircle(x - 8, y + 6, 9)
          .fillCircle(x + 9, y - 8, 6);
      }
    }
    const sx = CX + Math.cos(this.sim.angle) * this.shipR;
    const sy = CY + Math.sin(this.sim.angle) * this.shipR;
    for (let i = 1; i <= 6; i++) {
      const a = this.sim.angle - i * 0.09;
      g.fillStyle(0x35e0ff, 0.5 - i * 0.07).fillCircle(
        CX + Math.cos(a) * this.shipR,
        CY + Math.sin(a) * this.shipR,
        18 - i * 2,
      );
    }
    g.fillStyle(0x35e0ff).fillCircle(sx, sy, 20);
    g.fillStyle(0xffffff).fillCircle(sx + 5, sy - 5, 7);
  }
}
