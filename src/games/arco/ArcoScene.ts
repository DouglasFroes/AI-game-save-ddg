import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { burst, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { ARROWS, ArcherySim, RING_W } from './core';

const CX = GAME_WIDTH / 2;
const CY = 600;
const R = 300;
const RING_COLORS = [
  0xf8fafc, 0xf8fafc, 0x1e293b, 0x1e293b, 0x38bdf8, 0x38bdf8, 0xef4444, 0xef4444, 0xfacc15,
  0xfacc15,
];

/** "Tiro com Arco": tap when the sight is on the gold, minding the wind. */
export class ArcoScene extends MiniScene {
  private sim = new ArcherySim();
  private sight!: Phaser.GameObjects.Graphics;
  private marks!: Phaser.GameObjects.Graphics;
  private windText!: Phaser.GameObjects.Text;
  private left!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Arco, 'arco', [0x1e3a8a, 0x3b82f6]);
  }

  create(): void {
    this.sim = new ArcherySim();
    this.frame('0');
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.25).fillCircle(CX + 6, CY + 12, R + 14);
    g.fillStyle(0x78350f).fillRect(CX - 14, CY + R - 20, 28, 330);
    for (let i = 0; i < 10; i++) {
      g.fillStyle(RING_COLORS[i]!).fillCircle(CX, CY, R * (1 - i * RING_W));
      g.lineStyle(2, 0x0b1430, 0.5).strokeCircle(CX, CY, R * (1 - i * RING_W));
    }
    this.marks = this.add.graphics().setDepth(3);
    this.sight = this.add.graphics().setDepth(5);
    this.windText = addText(this, CX, 215, '', 34, { color: '#ffffff', stroke: '#0b1430' });
    this.left = addText(this, CX, 1180, '', 30, { color: '#ffffff', stroke: '#0b1430' });
    this.refresh();
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y > 130) this.shoot();
    });
    this.input.keyboard?.on('keydown-SPACE', () => this.shoot());
    addText(this, CX, 1110, 'Toque quando a mira estiver no centro', 26, {
      color: '#ffffffcc',
      weight: 'normal',
    });
  }

  private refresh(): void {
    const w = this.sim.wind;
    this.windText.setText(
      Math.abs(w) < 0.02
        ? 'Vento: calmo'
        : `Vento ${w < 0 ? '◀' : '▶'} ${'»'.repeat(1 + Math.floor(Math.abs(w) / 0.09))}`,
    );
    this.left.setText(`Flechas: ${Math.min(ARROWS, this.sim.shots.length + 1)} de ${ARROWS}`);
  }

  private shoot(): void {
    if (this.ended) return;
    const aim = this.sim.aim();
    const shot = this.sim.shoot();
    if (!shot) return;
    const { sfx } = getServices(this);
    sfx.play(shot.ring >= 9 ? 'win' : 'click');
    const x = CX + shot.x * R;
    const y = CY + shot.y * R;
    this.marks.fillStyle(0x0b1430).fillCircle(x, y, 9).lineStyle(3, 0xffffff).strokeCircle(x, y, 9);
    shockwave(this, x, y, shot.ring >= 9 ? 0xfacc15 : 0xffffff, 40);
    if (shot.ring >= 9) burst(this, x, y, 0xfacc15, 14);
    this.pop(
      CX,
      330,
      shot.ring === 0 ? 'Fora!' : shot.ring === 10 ? 'DEZ! 🎯' : `${shot.ring}`,
      shot.ring >= 9 ? '#ffe066' : '#ffffff',
      64,
    );
    this.setScore(this.sim.score);
    void aim;
    if (this.sim.done) {
      const tens = this.sim.shots.filter((s) => s.ring === 10).length;
      this.finish(
        this.sim.shots.reduce((n, s) => n + s.ring, 0) >= 85
          ? 'Medalha de ouro! 🥇'
          : 'Fim da prova!',
        [`Anéis: ${this.sim.shots.reduce((n, s) => n + s.ring, 0)} de 100 · Dez: ${tens}`],
        {
          score: this.sim.score,
          details: { rings: this.sim.shots.reduce((n, s) => n + s.ring, 0), tens },
        },
      );
    } else this.refresh();
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.sim.step(Math.min(deltaMs, 50) / 1000);
    const a = this.sim.aim();
    const x = CX + a.x * R;
    const y = CY + a.y * R;
    const g = this.sight.clear();
    g.lineStyle(5, 0xffffff).strokeCircle(x, y, 34);
    g.lineStyle(3, 0x0b1430).strokeCircle(x, y, 38);
    g.lineStyle(4, 0xffffff)
      .lineBetween(x - 54, y, x - 14, y)
      .lineBetween(x + 14, y, x + 54, y);
    g.lineBetween(x, y - 54, x, y - 14).lineBetween(x, y + 14, x, y + 54);
  }
}
