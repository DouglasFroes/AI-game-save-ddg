import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { burst, hint } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { DURATION, FactorySim, UPGRADE_KEYS, type Upgrade } from './core';

const COOKIE = { x: 360, y: 500, r: 150 };
const LABELS: Readonly<Record<Upgrade, string>> = {
  click: '👆 Mais por toque',
  oven: '🔥 Forno',
  factory: '🏭 Fábrica',
  mult: '⭐ Receita secreta',
};

/** "Fábrica de Biscoitos": tap to bake, buy upgrades that bake for you, catch the golden one. */
export class FabricaScene extends MiniScene {
  private sim = new FactorySim();
  private cookie!: Phaser.GameObjects.Text;
  private gold!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private buttons = new Map<Upgrade, Button>();
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Fabrica, 'fabrica', [0xb45309, 0x451a03]);
  }

  create(): void {
    this.sim = new FactorySim();
    this.buttons.clear();
    this.frame('0');
    this.add
      .graphics()
      .setDepth(1)
      .fillStyle(0x000000, 0.25)
      .fillCircle(COOKIE.x + 6, COOKIE.y + 12, COOKIE.r);
    this.cookie = emojiText(this, COOKIE.x, COOKIE.y, '🍪', 300).setDepth(5);
    this.gold = emojiText(this, 0, 0, '🌟', 110).setDepth(8).setVisible(false);
    this.info = addText(this, GAME_WIDTH / 2, 178, '', 30, {
      color: '#fde68a',
      stroke: '#451a03',
      strokeThickness: 6,
    }).setDepth(50);
    UPGRADE_KEYS.forEach((k, i) => {
      const b = new Button(this, GAME_WIDTH / 2, 800 + i * 112, '', () => this.buy(k), {
        width: 660,
        height: 88,
        fontSize: 28,
        color: 0xf59e0b,
        shade: 0xb45309,
      }).setDepth(20);
      this.buttons.set(k, b);
    });
    this.hintBox = hint(
      this,
      ['Toque no biscoito!', 'Compre melhorias para assar sozinho'],
      700,
      4500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.tap(p));
  }

  private buy(k: Upgrade): void {
    if (this.ended) return;
    const { sfx } = getServices(this);
    if (this.sim.buy(k)) sfx.play('coin');
    else sfx.play('locked');
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.ended || p.y < 140) return;
    const g = this.sim.golden;
    if (g && Math.hypot(p.x - g.x, p.y - g.y) < 70) {
      const bonus = this.sim.tapGolden();
      getServices(this).sfx.play('level');
      burst(this, g.x, g.y, 0xfde047, 20, { speed: 380 });
      this.pop(g.x, g.y, `+${Math.round(bonus)}!`, '#fde047', 56);
      return;
    }
    if (Math.hypot(p.x - COOKIE.x, p.y - COOKIE.y) < COOKIE.r + 30) {
      this.hintBox?.dismiss();
      const n = this.sim.click();
      getServices(this).sfx.play('pop');
      burst(this, p.x, p.y, 0xfbbf24, 4, { speed: 200, size: 5 });
      this.pop(p.x, p.y - 20, `+${Math.round(n)}`, '#ffffff', 36);
      this.tweens.add({ targets: this.cookie, scale: { from: 0.92, to: 1 }, duration: 90 });
    }
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.sim.step(Math.min(deltaMs, 50) / 1000);
    const s = this.sim;
    this.setScore(s.score);
    this.info.setText(
      `🍪 ${Math.floor(s.cookies)} · ${s.cps.toFixed(1)}/s · ⏱ ${Math.max(0, Math.ceil(DURATION - s.t))}s`,
    );
    for (const k of UPGRADE_KEYS) {
      const b = this.buttons.get(k)!;
      b.label.setText(`${LABELS[k]}  Nv ${s.levels[k]}  ·  ${s.cost(k)}`);
      b.setEnabled(s.cookies >= s.cost(k));
    }
    const g = s.golden;
    this.gold.setVisible(!!g);
    if (g) {
      this.gold.setPosition(g.x, g.y).setAngle(Math.sin(s.t * 6) * 12);
      this.gold.setScale(1 + Math.sin(s.t * 8) * 0.08);
    }
    if (s.done) {
      this.finish(
        'Fim do expediente!',
        [`Biscoitos assados: ${s.score}`, `Toques: ${s.clicks}`],
        { score: s.score, details: { clicks: s.clicks, cps: Math.round(s.cps) } },
        500,
      );
    }
  }
}
