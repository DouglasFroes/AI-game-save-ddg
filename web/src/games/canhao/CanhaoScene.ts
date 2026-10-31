import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { BlastSim, CANNON_H, CANNON_W, FLOOR, rockRadius, type BlastEvent } from './core';

const ROCK_COLORS = [0xf472b6, 0x60a5fa, 0x34d399, 0xfbbf24, 0xa78bfa, 0xfb923c];

/** "Canhão": slide to dodge and keep firing — break the numbered rocks before they crush you. */
export class CanhaoScene extends MiniScene {
  private sim = new BlastSim();
  private g!: Phaser.GameObjects.Graphics;
  private labels = new Map<number, Phaser.GameObjects.Text>();
  private statusText!: Phaser.GameObjects.Text;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Canhao, 'canhao', [0x1e1b4b, 0x312e81]);
  }

  create(): void {
    this.sim = new BlastSim();
    this.labels = new Map();
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.statusText = addText(this, GAME_WIDTH / 2, 168, '', 28, {
      color: '#c7d2fe',
      stroke: '#1e1b4b',
      strokeThickness: 6,
    }).setDepth(50);
    this.hintBox = hint(
      this,
      ['Arraste para mover o canhão', 'Ele atira sozinho — não deixe as pedras caírem nele!'],
      1180,
      4500,
    );
    const aim = (p: Phaser.Input.Pointer) => {
      if (this.ended) return;
      this.hintBox?.dismiss();
      this.sim.aim(p.x);
    };
    this.input.on(Phaser.Input.Events.POINTER_DOWN, aim);
    this.input.on(
      Phaser.Input.Events.POINTER_MOVE,
      (p: Phaser.Input.Pointer) => p.isDown && aim(p),
    );
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.handle(this.sim.step(Math.min(deltaMs, 33) / 1000));
    this.setScore(this.sim.score);
    this.statusText.setText(`Onda ${this.sim.wave} · ${Math.round(this.sim.fireRate)} tiros/s`);
    this.draw();
  }

  private handle(events: BlastEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e.type === 'split' || e.type === 'pop') {
        const color = ROCK_COLORS[e.rock.id % ROCK_COLORS.length]!;
        sfx.play(e.type === 'pop' ? 'pop' : 'boom');
        burst(this, e.rock.x, e.rock.y, color, 10 + e.rock.size * 6, { speed: 300 });
        if (e.rock.size === 3) shockwave(this, e.rock.x, e.rock.y, color, 140);
        this.labels.get(e.rock.id)?.destroy();
        this.labels.delete(e.rock.id);
      } else if (e.type === 'wave') {
        sfx.play('level');
        banner(this, `ONDA ${e.wave}`, '#c7d2fe', 520);
      } else {
        sfx.play('boom');
        sfx.vibrate([80, 40, 80]);
        flash(this, 0xef4444, 0.4, 300);
        this.cameras.main.shake(260, 0.014);
        this.finish(
          'Esmagado!',
          [`Onda: ${this.sim.wave}`],
          { score: this.sim.score, details: { wave: this.sim.wave } },
          900,
        );
      }
    }
  }

  private draw(): void {
    const g = this.g.clear();
    const s = this.sim;
    g.fillStyle(0x0f0a1e, 1).fillRect(0, FLOOR, GAME_WIDTH, GAME_HEIGHT - FLOOR);
    g.fillStyle(0xfde047, 1);
    for (const b of s.bullets) g.fillRoundedRect(b.x - 4, b.y - 12, 8, 24, 4);
    for (const r of s.rocks) {
      const rad = rockRadius(r.size);
      const color = ROCK_COLORS[r.id % ROCK_COLORS.length]!;
      g.fillStyle(0x000000, 0.3).fillCircle(r.x + 5, r.y + 8, rad);
      g.fillStyle(color, 1).fillCircle(r.x, r.y, rad);
      g.fillStyle(0xffffff, 0.3).fillCircle(r.x - rad * 0.35, r.y - rad * 0.35, rad * 0.3);
      let label = this.labels.get(r.id);
      if (!label) {
        label = addText(this, r.x, r.y, '', rad * 0.75, {
          color: '#ffffff',
          stroke: '#00000088',
          strokeThickness: 6,
        }).setDepth(6);
        this.labels.set(r.id, label);
      }
      label.setText(String(r.hp)).setPosition(r.x, r.y);
    }
    const x = s.cannonX;
    g.fillStyle(0x94a3b8, 1).fillRoundedRect(x - 12, FLOOR - CANNON_H - 30, 24, 50, 8);
    g.fillStyle(0x475569, 1).fillRoundedRect(
      x - CANNON_W / 2,
      FLOOR - CANNON_H,
      CANNON_W,
      CANNON_H - 18,
      16,
    );
    g.fillStyle(0x1e293b, 1)
      .fillCircle(x - 28, FLOOR - 16, 16)
      .fillCircle(x + 28, FLOOR - 16, 16);
  }
}
