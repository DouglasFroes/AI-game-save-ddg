import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { BULLET_R, DodgeSim, FIELD, SHIP_R } from './core';

/** "Esquiva": steer a tiny ship through a rain of bullets and grab the stars. */
export class EsquivaScene extends MiniScene {
  private sim = new DodgeSim();
  private g!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private tx = 360;
  private ty = 1000;
  private dragging = false;
  private lastMilestone = 0;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Esquiva, 'esquiva', [0x0c4a6e, 0x020617]);
  }

  create(): void {
    this.sim = new DodgeSim();
    this.tx = this.sim.x;
    this.ty = this.sim.y;
    this.dragging = false;
    this.lastMilestone = 0;
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.info = addText(this, GAME_WIDTH / 2, 168, '', 28, {
      color: '#bae6fd',
      stroke: '#020617',
      strokeThickness: 6,
    }).setDepth(50);
    this.hintBox = hint(
      this,
      ['Arraste para mover a nave', 'Desvie das balas e pegue as estrelas'],
      1185,
      4500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.aim(p, true));
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) =>
      this.aim(p, false),
    );
    this.input.on(Phaser.Input.Events.POINTER_UP, () => {
      this.dragging = false;
      this.tx = this.sim.x;
      this.ty = this.sim.y;
    });
  }

  private aim(p: Phaser.Input.Pointer, start: boolean): void {
    if (this.ended || (!start && !this.dragging) || p.y < 140) return;
    if (start) {
      this.dragging = true;
      this.hintBox?.dismiss();
    }
    this.tx = p.x;
    // Keep the ship above the finger so it stays visible.
    this.ty = p.y - 110;
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const got = this.sim.step(Math.min(deltaMs, 33) / 1000, this.tx, this.ty);
    const { sfx } = getServices(this);
    if (got > 0) {
      sfx.play('coin');
      this.pop(this.sim.x, this.sim.y - 30, '+50', '#fde047', 40);
    }
    this.setScore(this.sim.score);
    const m = Math.floor(this.sim.t / 20);
    if (m > this.lastMilestone) {
      this.lastMilestone = m;
      banner(this, `${m * 20} s!`, '#bae6fd', 500);
      sfx.play('level');
    }
    this.info.setText(`Tempo ${Math.floor(this.sim.t)}s · Estrelas ${this.sim.starsGot}`);
    this.draw();
    if (!this.sim.alive) {
      sfx.play('boom');
      flash(this, 0xffffff, 0.4, 200);
      burst(this, this.sim.x, this.sim.y, 0x38bdf8, 26, { speed: 420 });
      this.finish(
        'Atingido!',
        [`Sobreviveu ${Math.floor(this.sim.t)} s · Estrelas ${this.sim.starsGot}`],
        {
          score: this.sim.score,
          details: { seconds: Math.floor(this.sim.t), stars: this.sim.starsGot },
        },
        600,
      );
    }
  }

  private draw(): void {
    const g = this.g.clear();
    const s = this.sim;
    g.fillStyle(0x020617, 0.75).fillRoundedRect(FIELD.x, FIELD.y, FIELD.w, FIELD.h, 24);
    g.lineStyle(4, 0x0369a1, 1).strokeRoundedRect(FIELD.x, FIELD.y, FIELD.w, FIELD.h, 24);
    for (const st of s.stars) {
      g.fillStyle(0xfde047, 1);
      const pts: Phaser.Types.Math.Vector2Like[] = [];
      for (let k = 0; k < 10; k++) {
        const r = k % 2 === 0 ? 24 : 10;
        const a = -Math.PI / 2 + (k * Math.PI) / 5 + s.t * 2;
        pts.push({ x: st.x + Math.cos(a) * r, y: st.y + Math.sin(a) * r });
      }
      g.fillPoints(pts, true);
    }
    for (const b of s.bullets) {
      g.fillStyle(0xf472b6, 1).fillCircle(b.x, b.y, BULLET_R);
      g.fillStyle(0xffffff, 1).fillCircle(b.x, b.y, BULLET_R * 0.45);
    }
    g.fillStyle(0x38bdf8, 1).fillTriangle(s.x, s.y - 26, s.x - 20, s.y + 16, s.x + 20, s.y + 16);
    g.fillStyle(0xffffff, 1).fillCircle(s.x, s.y, SHIP_R * 0.5);
  }
}
