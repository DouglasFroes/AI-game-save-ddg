import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { burst, hint } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { ARENA, DURATION, HoleSim } from './core';

const COLORS = [0xf472b6, 0x38bdf8, 0xfacc15, 0x4ade80, 0xa78bfa, 0xfb923c];

/** "Buraco Negro": drag the hole to swallow everything smaller than you — and grow. */
export class BuracoScene extends MiniScene {
  private sim = new HoleSim();
  private g!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private tx = 360;
  private ty = 730;
  private dragging = false;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Buraco, 'buraco', [0x1e1b4b, 0x020617]);
  }

  create(): void {
    this.sim = new HoleSim();
    this.tx = this.sim.x;
    this.ty = this.sim.y;
    this.dragging = false;
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.info = addText(this, GAME_WIDTH / 2, 168, '', 30, {
      color: '#c4b5fd',
      stroke: '#020617',
      strokeThickness: 6,
    }).setDepth(50);
    this.hintBox = hint(
      this,
      ['Arraste para mover o buraco', 'Engula o que for menor que ele!'],
      1180,
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
    // Aim a little above the finger so it doesn't cover the hole.
    this.ty = p.y - 60;
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const eaten = this.sim.step(Math.min(deltaMs, 33) / 1000, this.tx, this.ty);
    const { sfx } = getServices(this);
    for (const it of eaten) {
      burst(this, it.x, it.y, COLORS[it.kind % COLORS.length]!, 6, { speed: 160 });
      if (it.r > 30) {
        sfx.play('coin');
        this.pop(it.x, it.y, `+${Math.round(it.r)}`, '#fde047', 36);
      } else sfx.play('tick');
    }
    this.setScore(this.sim.score);
    const left = Math.max(0, Math.ceil(DURATION - this.sim.t));
    this.info.setText(`Tempo ${left}s`);
    this.draw();
    if (this.sim.done) {
      this.finish(
        'Tempo esgotado!',
        [`Engoliu ${this.sim.eaten} coisas`, `Tamanho final: ${Math.round(this.sim.r)}`],
        { score: this.sim.score, details: { eaten: this.sim.eaten, size: Math.round(this.sim.r) } },
        500,
      );
    }
  }

  private draw(): void {
    const g = this.g.clear();
    const s = this.sim;
    g.fillStyle(0x0f172a, 1).fillRoundedRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h, 28);
    g.lineStyle(4, 0x4c1d95, 1).strokeRoundedRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h, 28);
    for (const it of s.items) {
      const edible = it.r < s.r * 0.85;
      g.fillStyle(COLORS[it.kind % COLORS.length]!, 1).fillCircle(it.x, it.y, it.r);
      g.fillStyle(0xffffff, 0.35).fillCircle(it.x - it.r * 0.3, it.y - it.r * 0.3, it.r * 0.25);
      if (!edible) g.lineStyle(5, 0xef4444, 0.9).strokeCircle(it.x, it.y, it.r + 2);
    }
    g.fillStyle(0x7c3aed, 0.35).fillCircle(s.x, s.y, s.r + 14);
    g.fillStyle(0x000000, 1).fillCircle(s.x, s.y, s.r);
    g.lineStyle(6, 0xa78bfa, 1).strokeCircle(s.x, s.y, s.r);
  }
}
