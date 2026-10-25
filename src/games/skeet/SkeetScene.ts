import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { burst, flash, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { CLAYS, clayPos, GROUND, HIT_R, SkeetSim } from './core';

const CX = GAME_WIDTH / 2;

/** "Skeet": shoot the clay pigeons that fly across the sky. */
export class SkeetScene extends MiniScene {
  private sim = new SkeetSim();
  private views = new Map<number, Phaser.GameObjects.Ellipse>();
  private left!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Skeet, 'skeet', [0x7dd3fc, 0xfef3c7]);
  }

  create(): void {
    this.sim = new SkeetSim();
    this.views = new Map();
    this.frame('0');
    const g = this.add.graphics().setDepth(-5);
    g.fillStyle(0x4d7c0f).fillRect(0, GROUND, GAME_WIDTH, 280);
    g.fillStyle(0x65a30d).fillRect(0, GROUND, GAME_WIDTH, 24);
    g.fillStyle(0x78350f)
      .fillRoundedRect(20, GROUND - 40, 90, 50, 8)
      .fillRoundedRect(GAME_WIDTH - 110, GROUND - 40, 90, 50, 8);
    this.left = addText(this, CX, 190, '', 30, { color: '#ffffff', stroke: '#0b1430' });
    addText(this, CX, 1130, 'Toque nos pratos para atirar!', 30, {
      color: '#0b1430',
      weight: 'normal',
    });
    this.refresh();
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y > 130 && !this.ended) this.shoot(p.x, p.y);
    });
  }

  private refresh(): void {
    const s = this.sim;
    this.left.setText(
      `Pratos ${Math.min(CLAYS, s.launched)}/${CLAYS} · Acertos ${s.hits}${s.streak >= 3 ? ` · 🔥 ${s.streak}` : ''}`,
    );
  }

  private shoot(x: number, y: number): void {
    const { sfx } = getServices(this);
    const hit = this.sim.tap(x, y);
    sfx.play(hit ? 'win' : 'hit');
    shockwave(this, x, y, hit ? 0xffe066 : 0xffffff, 30);
    if (hit) {
      const p = clayPos(hit);
      burst(this, p.x, p.y, 0xf97316, 14);
      this.pop(
        p.x,
        p.y - 30,
        this.sim.streak >= 3 ? `+${100 + (this.sim.streak - 2) * 25}` : '+100',
        '#0b1430',
        44,
      );
      this.views.get(hit.id)?.destroy();
      this.views.delete(hit.id);
    }
    this.setScore(this.sim.score);
    this.refresh();
    void HIT_R;
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const lost = this.sim.step(Math.min(deltaMs, 50) / 1000);
    for (const c of lost) {
      this.views.get(c.id)?.destroy();
      this.views.delete(c.id);
      flash(this, 0xdc2626, 0.07, 160);
    }
    if (lost.length) this.refresh();
    for (const c of this.sim.clays) {
      if (c.state !== 'flying') continue;
      let v = this.views.get(c.id);
      if (!v) {
        v = this.add.ellipse(0, 0, 62, 26, 0xf97316).setStrokeStyle(4, 0x7c2d12).setDepth(4);
        this.views.set(c.id, v);
      }
      const p = clayPos(c);
      v.setPosition(p.x, p.y).setAngle(c.age * 400);
    }
    if (this.sim.done) {
      this.finish(
        this.sim.hits >= 22
          ? 'Medalha de ouro! 🥇'
          : this.sim.hits >= 17
            ? 'Boa prova!'
            : 'Fim da prova!',
        [
          `Pratos quebrados: ${this.sim.hits} de ${CLAYS} · Melhor sequência: ${this.sim.bestStreak}`,
        ],
        { score: this.sim.score, details: { hits: this.sim.hits, streak: this.sim.bestStreak } },
      );
    }
  }
}
