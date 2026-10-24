import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import { ambient, burst, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { getServices } from '@/services';
import { OrbitaSim, type OrbitaEvent, type Planet } from './core';

const PALETTE: ReadonlyArray<readonly [number, number]> = [
  [0x38bdf8, 0xbae6fd],
  [0xa78bfa, 0xddd6fe],
  [0x34d399, 0xa7f3d0],
  [0xfbbf24, 0xfde68a],
  [0xf472b6, 0xfbcfe8],
  [0x60a5fa, 0xbfdbfe],
];
const TRAIL = 22;

/** "Órbita": tap to leave orbit, aim at the next planet, grab gems, dodge the red giants. */
export class OrbitaScene extends MiniScene {
  private sim = new OrbitaSim();
  private g!: Phaser.GameObjects.Graphics;
  private trail: Array<{ x: number; y: number }> = [];
  private hintBox?: { dismiss: () => void };
  private streakText!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Orbita, 'orbita', [0x07041a, 0x1e1b4b]);
  }

  create(): void {
    this.sim = new OrbitaSim();
    this.trail = [];
    this.frame();
    ambient(this, 0xa5b4fc, 22);
    this.g = this.add.graphics().setDepth(5);
    this.streakText = this.add
      .text(GAME_WIDTH / 2, 190, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '38px',
        fontStyle: 'bold',
        color: '#7dd3fc',
        stroke: '#07041a',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(50)
      .setAlpha(0);
    this.hintBox = hint(
      this,
      ['Toque para sair da órbita', 'Mire no centro do próximo planeta!'],
      1100,
      60000,
    );

    const tap = () => {
      if (this.ended) return;
      this.hintBox?.dismiss();
      this.handle(this.sim.launch());
    };
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y > 130) tap();
    });
    this.input.keyboard?.on('keydown-SPACE', tap);
  }

  override update(time: number, deltaMs: number): void {
    if (this.ended) return;
    this.handle(this.sim.step(Math.min(deltaMs, 40) / 1000));
    this.setScore(this.sim.score);
    this.trail.push({ x: this.sim.x, y: this.sim.y - this.sim.cam });
    if (this.trail.length > TRAIL) this.trail.shift();
    this.draw(time);
  }

  private handle(events: OrbitaEvent[]): void {
    const { sfx } = getServices(this);
    const cam = this.sim.cam;
    for (const ev of events) {
      switch (ev.type) {
        case 'launch':
          sfx.play('zap');
          sfx.vibrate(8);
          break;
        case 'capture': {
          const color = this.colorOf(ev.planet)[0];
          const y = ev.planet.y - cam;
          shockwave(this, ev.planet.x, y, color, ev.planet.r);
          burst(this, this.sim.x, this.sim.y - cam, color, 10, { speed: 200 });
          sfx.play('bounce', this.sim.streak);
          if (ev.aimed) {
            sfx.play('coin', this.sim.streak);
            this.pop(this.sim.x, this.sim.y - cam - 60, 'DIRETO! +5', '#7dd3fc', 40);
            this.showStreak();
          }
          break;
        }
        case 'gem':
          sfx.play('coin', 4);
          burst(this, ev.x, ev.y - cam, 0x67e8f9, 14, { speed: 260 });
          this.pop(ev.x, ev.y - cam - 30, '+5', '#67e8f9', 36);
          break;
        case 'dead':
          burst(
            this,
            this.sim.x,
            this.sim.y - cam,
            ev.reason === 'burn' ? 0xff5533 : 0xffffff,
            28,
            {
              speed: 480,
              size: 8,
            },
          );
          sfx.play('boom');
          this.finish(
            ev.reason === 'burn' ? 'Virou churrasco espacial!' : 'Perdido no espaço!',
            [`Planetas: ${this.sim.visited}`, `Gemas: ${this.sim.gems}`],
            { score: this.sim.score, details: { planets: this.sim.visited, gems: this.sim.gems } },
          );
          break;
      }
    }
  }

  private showStreak(): void {
    const n = this.sim.streak;
    this.streakText.setText(n > 1 ? `Sequência de ${n} tiros diretos!` : '');
    if (n < 2) return;
    this.streakText.setAlpha(1);
    this.tweens.killTweensOf(this.streakText);
    this.tweens.add({ targets: this.streakText, alpha: 0, delay: 900, duration: 300 });
  }

  private colorOf(p: Planet): readonly [number, number] {
    if (p.hot) return [0xef4444, 0xfca5a5];
    return PALETTE[p.id % PALETTE.length]!;
  }

  private draw(time: number): void {
    const { sim } = this;
    const cam = sim.cam;
    const g = this.g.clear();

    // Parallax starfield: stars are derived from a grid so they never need storing.
    for (const [layer, size, alpha] of [
      [0.25, 2, 0.35],
      [0.5, 3, 0.5],
    ] as const) {
      const cell = 160;
      const off = cam * layer;
      const first = Math.floor(off / cell);
      for (let row = first - 1; row < first + GAME_HEIGHT / cell + 2; row++) {
        for (let col = 0; col < 5; col++) {
          const h = Math.imul(row * 31 + col * 17 + layer * 100, 2654435761) >>> 0;
          const x = col * 150 + (h % 140);
          const y = row * cell + ((h >>> 8) % cell) - off;
          g.fillStyle(0xffffff, alpha * (0.5 + ((h >>> 16) % 50) / 100)).fillCircle(
            x,
            y,
            size * 0.6,
          );
        }
      }
    }

    for (const p of sim.planets) {
      const y = p.y - cam;
      if (y < -200 || y > GAME_HEIGHT + 200) continue;
      this.drawPlanet(g, p, y, time);
    }

    // Guide for the current launch direction.
    if (sim.mode === 'orbit') {
      const tx = -Math.sin(sim.angle) * sim.dir;
      const ty = Math.cos(sim.angle) * sim.dir;
      for (let i = 1; i <= 5; i++) {
        g.fillStyle(0xffffff, 0.5 - i * 0.07).fillCircle(
          sim.x + tx * i * 34,
          sim.y - cam + ty * i * 34,
          4,
        );
      }
    }

    this.trail.forEach((p, i) => {
      const k = i / TRAIL;
      g.fillStyle(0x7dd3fc, k * 0.5).fillCircle(p.x, p.y, 3 + k * 7);
    });
    const sx = sim.x;
    const sy = sim.y - cam;
    g.fillStyle(0xbae6fd, 0.3).fillCircle(sx, sy, 22);
    g.fillStyle(0xffffff).fillCircle(sx, sy, 11);
    g.fillStyle(0x38bdf8).fillCircle(sx, sy, 6);
  }

  private drawPlanet(g: Phaser.GameObjects.Graphics, p: Planet, y: number, time: number): void {
    const [base, light] = this.colorOf(p);
    const current = p === this.sim.cur;
    if (p.hot) {
      const pulse = 1 + Math.sin(time / 160 + p.id) * 0.08;
      g.fillStyle(0xff3b1f, 0.18).fillCircle(p.x, y, (p.r + 34) * pulse);
      g.lineStyle(3, 0xff6b4a, 0.5).strokeCircle(p.x, y, p.r + 16);
    } else {
      // The orbit ring: bright on the planet you're circling, faint on the others.
      g.lineStyle(current ? 4 : 2, base, current ? 0.7 : 0.25).strokeCircle(
        p.x,
        y,
        current ? this.sim.orbitR : p.r + 62,
      );
      g.fillStyle(base, 0.12).fillCircle(p.x, y, p.r + 26);
    }
    g.fillStyle(base).fillCircle(p.x, y, p.r);
    g.fillStyle(light, 0.55).fillCircle(p.x - p.r * 0.28, y - p.r * 0.28, p.r * 0.62);
    g.fillStyle(0x000000, 0.28).fillCircle(p.x + p.r * 0.3, y + p.r * 0.3, p.r * 0.7);
    g.fillStyle(base).fillCircle(p.x, y, p.r * 0.86);
    g.fillStyle(light, 0.6).fillCircle(p.x - p.r * 0.3, y - p.r * 0.3, p.r * 0.4);

    if (!p.hot && p.gem !== null) {
      const gx = p.x + Math.cos(p.gem) * (p.r + 62);
      const gy = y + Math.sin(p.gem) * (p.r + 62);
      const s = 14 + Math.sin(time / 200 + p.id) * 2;
      g.fillStyle(0x67e8f9, 0.3).fillCircle(gx, gy, s * 1.8);
      g.fillStyle(0xa5f3fc).fillPoints(
        [
          new Phaser.Geom.Point(gx, gy - s),
          new Phaser.Geom.Point(gx + s * 0.8, gy),
          new Phaser.Geom.Point(gx, gy + s),
          new Phaser.Geom.Point(gx - s * 0.8, gy),
        ],
        true,
      );
    }
  }
}
