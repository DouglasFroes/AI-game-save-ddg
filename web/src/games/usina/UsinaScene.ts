import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { burst, flash, hint } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { LIMIT, PlantSim, REACTORS } from './core';

const COL_X = [130, 360, 590];
const TOP = 330;
const H = 640;

/** "Usina": run the reactors hot for more power — and cool them before they blow. */
export class UsinaScene extends MiniScene {
  private sim = new PlantSim();
  private g!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private warn!: Phaser.GameObjects.Text;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Usina, 'usina', [0x7c2d12, 0x1c1917]);
  }

  create(): void {
    this.sim = new PlantSim();
    this.frame('0');
    this.g = this.add.graphics().setDepth(3);
    this.info = addText(this, GAME_WIDTH / 2, 178, '', 30, {
      color: '#fed7aa',
      stroke: '#1c1917',
      strokeThickness: 6,
    }).setDepth(50);
    this.warn = addText(this, GAME_WIDTH / 2, 1090, '', 40, {
      color: '#fde047',
      stroke: '#1c1917',
      strokeThickness: 8,
    }).setDepth(40);
    this.hintBox = hint(
      this,
      ['Toque no reator para resfriar', 'Quanto mais quente, mais energia — até 100°!'],
      1170,
      5500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.tap(p));
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.ended || p.y < 200) return;
    let best = 0;
    for (let i = 1; i < REACTORS; i++)
      if (Math.abs(p.x - COL_X[i]!) < Math.abs(p.x - COL_X[best]!)) best = i;
    this.hintBox?.dismiss();
    const { sfx } = getServices(this);
    if (this.sim.cool(best)) {
      sfx.play('tick');
      burst(this, COL_X[best]!, TOP + H - (this.sim.temps[best]! / LIMIT) * H, 0x7dd3fc, 8, {
        speed: 200,
      });
    } else sfx.play('locked');
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.sim.step(Math.min(deltaMs, 50) / 1000);
    const s = this.sim;
    this.setScore(s.score);
    const rate = s.temps.reduce((a, t) => a + PlantSim.power(t), 0);
    this.info.setText(`⚡ ${rate.toFixed(1)} por segundo`);
    this.warn.setText(s.warn >= 0 ? `⚠️ Reator ${s.warn + 1} vai disparar!` : '');
    const g = this.g.clear();
    for (let i = 0; i < REACTORS; i++) {
      const x = COL_X[i]!;
      const t = s.temps[i]!;
      const hot = t >= 85;
      g.fillStyle(0x000000, 0.4).fillRoundedRect(x - 70, TOP - 10, 140, H + 20, 28);
      const fill = (Math.min(t, LIMIT) / LIMIT) * H;
      const color = t < 30 ? 0x38bdf8 : t < 60 ? 0x4ade80 : t < 90 ? 0xfacc15 : 0xef4444;
      g.fillStyle(color, 1).fillRoundedRect(x - 60, TOP + H - fill, 120, fill, 20);
      g.lineStyle(3, 0xffffff, 0.35);
      for (const mark of [30, 60, 90])
        g.lineBetween(x - 70, TOP + H - (mark / 100) * H, x + 70, TOP + H - (mark / 100) * H);
      if (hot && Math.sin(s.t * 20) > 0)
        g.lineStyle(8, 0xef4444, 1).strokeRoundedRect(x - 72, TOP - 12, 144, H + 24, 28);
      if (s.warn === i)
        g.lineStyle(6, 0xfde047, 1).strokeRoundedRect(x - 76, TOP - 16, 152, H + 32, 30);
      if (s.cd[i]! > 0) g.fillStyle(0x38bdf8, 0.35).fillRoundedRect(x - 60, TOP, 120, H, 20);
      g.fillStyle(0xffffff, 1);
    }
    for (let i = 0; i < REACTORS; i++) {
      // Temperature labels are drawn as text objects once and reused.
      this.label(i, `${Math.round(s.temps[i]!)}°`);
    }
    if (!s.alive) {
      const x = COL_X[s.exploded]!;
      getServices(this).sfx.play('boom');
      flash(this, 0xffffff, 0.6, 300);
      burst(this, x, TOP + 100, 0xf97316, 40, { speed: 520 });
      this.finish(
        'BOOM! O reator explodiu!',
        [`Energia gerada: ${s.score}`, `Resistiu ${Math.floor(s.t)} s`],
        { score: s.score, details: { seconds: Math.floor(s.t) } },
        700,
      );
    }
  }

  private labels: Phaser.GameObjects.Text[] = [];
  private label(i: number, text: string): void {
    if (!this.labels[i]) {
      this.labels[i] = addText(this, COL_X[i]!, TOP + H + 50, text, 44, {
        color: '#ffffff',
        stroke: '#1c1917',
        strokeThickness: 8,
      }).setDepth(8);
    }
    this.labels[i]!.setText(text);
  }
}
