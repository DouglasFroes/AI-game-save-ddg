import { GAME_WIDTH, SceneKeys } from '@/config';
import { hint } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { LABELS, NEEDS, PetSim, type Need } from './core';

const BAR_COLORS: Readonly<Record<Need, number>> = {
  fome: 0xf97316,
  diversao: 0xf472b6,
  limpeza: 0x38bdf8,
  energia: 0xfacc15,
};

/** "Bichinho": keep your pet fed, happy, clean and rested for as long as you can. */
export class BichinhoScene extends MiniScene {
  private sim = new PetSim();
  private g!: Phaser.GameObjects.Graphics;
  private pet!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private sleepBtn!: Button;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Bichinho, 'bichinho', [0xbe185d, 0x4a044e]);
  }

  create(): void {
    this.sim = new PetSim();
    this.frame('0');
    this.g = this.add.graphics().setDepth(3);
    this.pet = emojiText(this, GAME_WIDTH / 2, 680, '🐶', 260).setDepth(6);
    this.info = addText(this, GAME_WIDTH / 2, 178, '', 30, {
      color: '#fbcfe8',
      stroke: '#4a044e',
      strokeThickness: 6,
    }).setDepth(50);
    NEEDS.forEach((n, i) => {
      addText(this, 130, 280 + i * 54, LABELS[n], 26, {
        color: '#ffffff',
        stroke: '#4a044e',
        strokeThickness: 5,
      })
        .setOrigin(0, 0.5)
        .setDepth(6);
    });
    const buttons: Array<[string, () => boolean]> = [
      ['🍖 Comida', () => this.sim.feed()],
      ['🎾 Brincar', () => this.sim.play()],
      ['🛁 Banho', () => this.sim.wash()],
    ];
    buttons.forEach(([label, act], i) => {
      new Button(this, 130 + i * 230, 1060, label, () => this.act(act), {
        width: 210,
        height: 110,
        fontSize: 30,
        color: 0xec4899,
        shade: 0x9d174d,
      }).setDepth(20);
    });
    this.sleepBtn = new Button(this, GAME_WIDTH / 2, 1190, '💤 Dormir', () => this.toggle(), {
      width: 460,
      height: 90,
      fontSize: 34,
      color: 0x6366f1,
      shade: 0x3730a3,
    }).setDepth(20);
    this.hintBox = hint(
      this,
      ['Cuide das 4 barras', 'Se uma ficar zerada por muito tempo, acabou'],
      900,
      5500,
    );
  }

  private act(fn: () => boolean): void {
    if (this.ended) return;
    this.hintBox?.dismiss();
    const { sfx } = getServices(this);
    if (fn()) {
      sfx.play('pop');
      if (this.sim.note) {
        this.pop(GAME_WIDTH / 2, 520, this.sim.note, '#fde047', 44);
        this.sim.note = '';
      }
    } else sfx.play('locked');
  }

  private toggle(): void {
    if (this.ended) return;
    this.hintBox?.dismiss();
    this.sim.toggleSleep();
    getServices(this).sfx.play('click');
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.sim.step(Math.min(deltaMs, 50) / 1000);
    const s = this.sim;
    this.setScore(s.score);
    const mood = s.mood;
    this.info.setText(`Idade ${Math.floor(s.age)} s · Humor ${Math.round(mood)}%`);
    this.pet.setText(s.sleeping ? '😴' : mood > 60 ? '🐶' : mood > 30 ? '🐕' : '🥺');
    this.pet.setScale(1 + Math.sin(s.age * (s.sleeping ? 1.5 : 4)) * 0.03);
    this.sleepBtn.label.setText(s.sleeping ? '☀️ Acordar' : '💤 Dormir');
    const g = this.g.clear();
    if (s.sleeping) g.fillStyle(0x0f172a, 0.55).fillRect(0, 0, GAME_WIDTH, 1280);
    NEEDS.forEach((n, i) => {
      const y = 280 + i * 54;
      const v = s.needs[n];
      g.fillStyle(0x000000, 0.4).fillRoundedRect(300, y - 14, 300, 28, 14);
      g.fillStyle(v < 25 ? 0xef4444 : BAR_COLORS[n], 1).fillRoundedRect(
        300,
        y - 14,
        300 * (v / 100),
        28,
        14,
      );
    });
    if (!s.alive) {
      this.finish(
        'Seu bichinho ficou doente...',
        [`Viveu ${Math.floor(s.age)} s`, `Pontos: ${s.score}`],
        { score: s.score, details: { seconds: Math.floor(s.age) } },
        600,
      );
    }
  }
}
