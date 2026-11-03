import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { burst, flash, hint } from '@/platform/ui/juice';
import { emojiText, heartsLabel, MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { BrewSim, ING_EMOJI, INGREDIENTS, POTIONS, SLOTS } from './core';

const SLOT_Y = 340;

/** "Poções": mix two ingredients to match what the customer wants, and serve before they leave. */
export class PocoesScene extends MiniScene {
  private sim = new BrewSim();
  private g!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private names: Phaser.GameObjects.Text[] = [];
  private cauldronIcons: Phaser.GameObjects.Text[] = [];
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Pocoes, 'pocoes', [0x581c87, 0x1e1b4b]);
  }

  create(): void {
    this.sim = new BrewSim();
    this.frame('0');
    this.g = this.add.graphics().setDepth(3);
    this.info = addText(this, GAME_WIDTH / 2, 178, '', 32, {
      color: '#e9d5ff',
      stroke: '#1e1b4b',
      strokeThickness: 6,
    }).setDepth(50);
    this.names = Array.from({ length: SLOTS }, (_, i) =>
      addText(this, 120 + i * 240, SLOT_Y + 70, '', 26, {
        color: '#ffffff',
        stroke: '#1e1b4b',
        strokeThickness: 5,
      }).setDepth(8),
    );
    this.cauldronIcons = [0, 1].map((k) => emojiText(this, 300 + k * 120, 690, '', 80).setDepth(8));
    INGREDIENTS.forEach((n, i) => {
      new Button(this, 130 + i * 230, 1010, `${ING_EMOJI[i]!}\n${n}`, () => this.addIngredient(i), {
        width: 200,
        height: 150,
        fontSize: 30,
        color: 0x7c3aed,
        shade: 0x4c1d95,
      }).setDepth(20);
    });
    new Button(this, GAME_WIDTH / 2, 1180, 'Esvaziar caldeirão', () => this.sim.clear(), {
      width: 420,
      height: 80,
      fontSize: 30,
      color: 0x6b7280,
      shade: 0x374151,
    }).setDepth(20);
    this.hintBox = hint(
      this,
      ['Misture 2 ingredientes e toque no cliente', 'Vermelho + Azul = Roxo, e assim por diante'],
      860,
      6000,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.tap(p));
  }

  private addIngredient(i: number): void {
    if (this.ended) return;
    this.hintBox?.dismiss();
    getServices(this).sfx.play(this.sim.add(i) ? 'tick' : 'locked');
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.ended) return;
    for (let i = 0; i < SLOTS; i++) {
      const x = 120 + i * 240;
      if (Math.abs(p.x - x) > 110 || Math.abs(p.y - SLOT_Y) > 130) continue;
      const { sfx } = getServices(this);
      const r = this.sim.serve(i);
      if (r === 'ok') {
        sfx.play('coin');
        burst(this, x, SLOT_Y, 0xfde047, 14, { speed: 280 });
        this.pop(x, SLOT_Y - 60, '+', '#86efac', 56);
        this.setScore(this.sim.score);
      } else if (r === 'wrong') {
        sfx.play('hit');
        this.pop(x, SLOT_Y - 60, 'Não era essa!', '#fca5a5', 34);
      } else sfx.play('locked');
      return;
    }
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const angry = this.sim.step(Math.min(deltaMs, 50) / 1000);
    const { sfx } = getServices(this);
    if (angry > 0) {
      sfx.play('hit');
      flash(this, 0xef4444, 0.25, 180);
    }
    const s = this.sim;
    this.info.setText(`${heartsLabel(s.lives)}  ·  Servidos ${s.served}`);
    const g = this.g.clear();
    for (let i = 0; i < SLOTS; i++) {
      const x = 120 + i * 240;
      const c = s.slots[i];
      g.fillStyle(0x000000, 0.3).fillRoundedRect(x - 105, SLOT_Y - 125, 220, 260, 28);
      g.fillStyle(c ? 0x6d28d9 : 0x3b0764, 1).fillRoundedRect(x - 110, SLOT_Y - 130, 220, 260, 28);
      this.names[i]!.setText(c ? POTIONS[c.potion]!.name : '');
      if (!c) continue;
      const p = POTIONS[c.potion]!;
      g.fillStyle(p.color, 1).fillCircle(x, SLOT_Y - 20, 56);
      g.fillStyle(0xffffff, 0.4).fillCircle(x - 18, SLOT_Y - 38, 14);
      const f = Math.max(0, c.patience / c.max);
      g.fillStyle(0x000000, 0.4).fillRect(x - 80, SLOT_Y + 100, 160, 12);
      g.fillStyle(f > 0.4 ? 0x4ade80 : 0xef4444, 1).fillRect(x - 80, SLOT_Y + 100, 160 * f, 12);
    }
    // Cauldron.
    g.fillStyle(0x1f2937, 1).fillEllipse(360, 770, 420, 190);
    const brewed = s.brewed();
    g.fillStyle(brewed >= 0 ? POTIONS[brewed]!.color : 0x4b5563, 1).fillEllipse(360, 740, 360, 120);
    for (let k = 0; k < 2; k++)
      this.cauldronIcons[k]!.setText(s.cauldron[k] !== undefined ? ING_EMOJI[s.cauldron[k]!]! : '');
    if (s.cauldron.length === 2) {
      const msg = brewed >= 0 ? `Poção ${POTIONS[brewed]!.name} pronta!` : '';
      this.info.setText(`${heartsLabel(s.lives)}  ·  ${msg}`);
    }
    if (!s.alive) {
      this.finish(
        'A loja fechou!',
        [`Poções servidas: ${s.served}`, `Pontos: ${s.score}`],
        { score: s.score, details: { served: s.served } },
        600,
      );
    }
  }
}
