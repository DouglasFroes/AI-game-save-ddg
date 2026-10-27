import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import { formatNumber } from '@/platform/ranking';
import { ambient, banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  BALL_R,
  BOARD_L,
  BOARD_R,
  DROP_Y,
  PEG_R,
  PlinkoSim,
  quotaFor,
  SLOT_TOP,
  SLOT_W,
  SLOTS,
  type PlinkoEvent,
  type UpgradeInfo,
} from './core';

const SLOT_H = 96;

/** Colour of a slot from how much it pays: cold blue for the pits, hot gold for the jackpots. */
const slotColor = (mult: number): number =>
  mult >= 8
    ? 0xfacc15
    : mult >= 3
      ? 0xf472b6
      : mult >= 1.4
        ? 0x34d399
        : mult >= 0.45
          ? 0x38bdf8
          : 0x64748b;

/** "Chuva de Bolas": aim, drop, watch the bounce — then spend the winnings on upgrades. */
export class PlinkoScene extends MiniScene {
  private sim = new PlinkoSim();
  private g!: Phaser.GameObjects.Graphics;
  private slotLabels: Phaser.GameObjects.Text[] = [];
  private slotGlow = new Array<number>(SLOTS).fill(0);
  private hud!: Phaser.GameObjects.Text;
  private aimX = (BOARD_L + BOARD_R) / 2;
  private holding = false;
  private shop: Phaser.GameObjects.Container | null = null;
  private hintBox?: { dismiss: () => void };
  private lastTick = 0;

  constructor() {
    super(SceneKeys.Plinko, 'plinko', [0x12041f, 0x3b0764]);
  }

  create(): void {
    this.sim = new PlinkoSim();
    this.slotGlow.fill(0);
    this.shop = null;
    this.holding = false;
    this.frame();
    ambient(this, 0xe9d5ff, 18);
    this.g = this.add.graphics().setDepth(5);
    this.hud = addText(this, GAME_WIDTH / 2, 168, '', 28, {
      color: '#f3e8ff',
      stroke: '#12041f',
      strokeThickness: 6,
    }).setDepth(50);
    this.slotLabels = [];
    for (let i = 0; i < SLOTS; i++) {
      this.slotLabels.push(
        addText(this, BOARD_L + SLOT_W * (i + 0.5), SLOT_TOP + SLOT_H / 2, '', 21, {
          color: '#ffffff',
          stroke: '#12041f',
          strokeThickness: 5,
        }).setDepth(7),
      );
    }
    this.refreshSlots();
    this.hintBox = hint(
      this,
      ['Deslize para mirar, solte para largar', 'Segure para chover bolas!'],
      1190,
      6000,
    );

    const aim = (p: Phaser.Input.Pointer) => {
      this.aimX = Phaser.Math.Clamp(p.x, BOARD_L + 20, BOARD_R - 20);
    };
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y < 130 || this.shop) return;
      aim(p);
      this.holding = true;
      this.hintBox?.dismiss();
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, aim);
    const up = () => (this.holding = false);
    this.input.on(Phaser.Input.Events.POINTER_UP, up);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, up);
  }

  override update(time: number, deltaMs: number): void {
    if (this.ended) return;
    const dt = Math.min(deltaMs, 40) / 1000;
    if (this.holding && !this.shop) this.handle(this.sim.drop(this.aimX));
    this.handle(this.sim.step(dt));
    for (let i = 0; i < SLOTS; i++) this.slotGlow[i] = Math.max(0, this.slotGlow[i]! - dt * 2.5);
    this.setScore(this.sim.total);
    const { sim } = this;
    this.hud.setText(`Rodada ${sim.round} · Meta ${sim.earned}/${sim.quota} · 🎱 ${sim.dropsLeft}`);
    this.draw(time);
  }

  private handle(events: PlinkoEvent[]): void {
    const { sfx } = getServices(this);
    for (const ev of events) {
      switch (ev.type) {
        case 'drop':
          sfx.play('pop');
          break;
        case 'peg':
          if (ev.gold && ev.coins > 0) {
            sfx.play('coin', 2);
            burst(this, ev.x, ev.y, 0xfde047, 6, { speed: 150, size: 4, life: 350 });
            this.pop(ev.x, ev.y - 18, `+${ev.coins}`, '#fde047', 26);
          } else if (this.time.now - this.lastTick > 45) {
            this.lastTick = this.time.now;
            sfx.play('tick');
          }
          break;
        case 'land': {
          this.slotGlow[ev.slot] = 1;
          const y = SLOT_TOP;
          const color = slotColor(ev.mult);
          sfx.play('coin', Math.min(12, Math.round(ev.mult * 1.2)));
          burst(this, ev.x, y, color, ev.mult >= 3 ? 20 : 8, { speed: 280, gravity: 700 });
          this.pop(
            ev.x,
            y - 40,
            `+${ev.coins}`,
            ev.mult >= 3 ? '#fde047' : '#ffffff',
            ev.mult >= 3 ? 52 : 36,
          );
          if (ev.mult >= 8) {
            shockwave(this, ev.x, y, color, 120);
            flash(this, color, 0.22);
            sfx.play('level');
            sfx.vibrate([30, 20, 30]);
            banner(this, `JACKPOT +${ev.coins}!`, '#fde047');
          } else if (ev.mult >= 3) {
            sfx.vibrate(15);
          }
          break;
        }
        case 'roundEnd':
          this.onRoundEnd(ev.success, ev.earned, ev.quota);
          break;
      }
    }
  }

  private onRoundEnd(success: boolean, earned: number, quota: number): void {
    const { sfx } = getServices(this);
    if (success) {
      sfx.play('level');
      banner(this, 'META BATIDA!', '#86efac');
      this.time.delayedCall(1100, () => this.openShop());
    } else {
      sfx.play('hit');
      banner(this, `Faltaram ${quota - earned}`, '#fda4af');
      this.finish(
        'Meta não atingida!',
        [`Rodada: ${this.sim.round}`, `Maior pouso: ${this.sim.bestLanding} moedas`],
        { score: this.sim.total, details: { round: this.sim.round } },
        1200,
      );
    }
  }

  private openShop(): void {
    if (this.ended) return;
    const root = this.add.container(0, 0).setDepth(100);
    this.shop = root;
    root.add(
      this.add
        .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0b0214, 0.88)
        .setOrigin(0)
        .setInteractive(),
    );
    root.add(
      addText(this, GAME_WIDTH / 2, 250, 'Escolha um upgrade', 52, {
        color: '#ffffff',
        stroke: '#12041f',
        strokeThickness: 10,
      }),
    );
    root.add(
      addText(
        this,
        GAME_WIDTH / 2,
        316,
        `Próxima meta: ${formatNumber(quotaFor(this.sim.round + 1))} moedas`,
        28,
        {
          color: '#d8b4fe',
          stroke: '#12041f',
          strokeThickness: 6,
        },
      ),
    );
    this.sim.shopChoices.forEach((u, i) => {
      const card = this.upgradeCard(u, GAME_WIDTH / 2, 480 + i * 210);
      card.setScale(0.6).setAlpha(0);
      this.tweens.add({
        targets: card,
        scale: 1,
        alpha: 1,
        delay: 120 + i * 110,
        duration: 300,
        ease: 'Back.easeOut',
      });
      root.add(card);
    });
  }

  private upgradeCard(u: UpgradeInfo, x: number, y: number): Phaser.GameObjects.Container {
    const level = this.sim.levels[u.id];
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(-310, -78, 620, 178, 30);
    g.fillStyle(0x2e1065).fillRoundedRect(-310, -88, 620, 178, 30);
    g.lineStyle(4, 0xc084fc, 0.9).strokeRoundedRect(-310, -88, 620, 178, 30);
    g.fillStyle(0xffffff, 0.08).fillRoundedRect(-300, -80, 600, 56, 24);
    c.add([
      g,
      emojiText(this, -235, 0, u.emoji, 78),
      addText(this, -170, -34, u.name, 38, { color: '#ffffff' }).setOrigin(0, 0.5),
      addText(this, -170, 18, u.desc, 24, {
        color: '#e9d5ff',
        weight: 'normal',
        wrapWidth: 440,
        align: 'left',
      }).setOrigin(0, 0.5),
      addText(this, -170, 60, `Nv. ${level} → ${level + 1}`, 22, { color: '#fde047' }).setOrigin(
        0,
        0.5,
      ),
    ]);
    c.setSize(620, 178).setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => c.setScale(0.97));
    c.on('pointerout', () => c.setScale(1));
    c.on('pointerup', () => {
      if (!this.sim.choose(u.id)) return;
      const { sfx } = getServices(this);
      sfx.play('win');
      this.shop?.destroy();
      this.shop = null;
      this.refreshSlots();
      this.holding = false;
      banner(this, `Rodada ${this.sim.round}`, '#e9d5ff');
    });
    return c;
  }

  private refreshSlots(): void {
    this.slotLabels.forEach((t, i) => {
      const m = this.sim.slotMult(i);
      t.setText(`${Number.isInteger(m) ? m : m.toFixed(1)}x`).setFontSize(m >= 10 ? 22 : 21);
    });
  }

  private draw(time: number): void {
    const { sim } = this;
    const g = this.g.clear();
    const left = BOARD_L - 14;
    const right = BOARD_R + 14;
    g.fillStyle(0x000000, 0.32).fillRoundedRect(
      left,
      DROP_Y - 56,
      right - left,
      SLOT_TOP + SLOT_H - DROP_Y + 84,
      30,
    );
    g.lineStyle(3, 0xc084fc, 0.4).strokeRoundedRect(
      left,
      DROP_Y - 56,
      right - left,
      SLOT_TOP + SLOT_H - DROP_Y + 84,
      30,
    );

    // Slots.
    for (let i = 0; i < SLOTS; i++) {
      const x = BOARD_L + i * SLOT_W;
      const m = sim.slotMult(i);
      const c = slotColor(m);
      const glow = this.slotGlow[i]!;
      g.fillStyle(c, 0.22 + glow * 0.5).fillRoundedRect(x + 3, SLOT_TOP, SLOT_W - 6, SLOT_H, 14);
      g.lineStyle(3, c, 0.8).strokeRoundedRect(x + 3, SLOT_TOP, SLOT_W - 6, SLOT_H, 14);
    }

    // Aim guide and the ghost ball.
    if (sim.state === 'play' && sim.dropsLeft > 0) {
      for (let y = DROP_Y + 20; y < DROP_Y + 190; y += 22) {
        g.fillStyle(0xffffff, 0.3 - (y - DROP_Y) / 700).fillCircle(this.aimX, y, 3);
      }
      g.fillStyle(0xffffff, sim.canDrop() ? 0.9 : 0.35).fillCircle(this.aimX, DROP_Y - 18, BALL_R);
    }

    // Pegs.
    for (const p of sim.pegs) {
      if (p.gold) {
        const pulse = 1 + Math.sin(time / 220 + p.x) * 0.15;
        g.fillStyle(0xfde047, 0.25).fillCircle(p.x, p.y, PEG_R * 2 * pulse);
        g.fillStyle(0xfde047).fillCircle(p.x, p.y, PEG_R);
        g.fillStyle(0xffffff, 0.8).fillCircle(p.x - 2, p.y - 2, 3);
      } else {
        g.fillStyle(0xe9d5ff, 0.18).fillCircle(p.x, p.y, PEG_R * 1.7);
        g.fillStyle(0xf5f3ff).fillCircle(p.x, p.y, PEG_R * 0.85);
      }
    }

    // Balls.
    for (const b of sim.balls) {
      g.fillStyle(0xc084fc, 0.3).fillCircle(b.x, b.y - b.vy * 0.012, BALL_R * 1.4);
      g.fillStyle(0xf472b6).fillCircle(b.x, b.y, BALL_R);
      g.fillStyle(0xffffff, 0.8).fillCircle(b.x - 3, b.y - 3, 3.5);
    }

    // Progress toward the quota.
    const k = Phaser.Math.Clamp(sim.earned / sim.quota, 0, 1);
    g.fillStyle(0x000000, 0.4).fillRoundedRect(BOARD_L, 202, BOARD_R - BOARD_L, 22, 11);
    g.fillStyle(k >= 1 ? 0x86efac : 0xc084fc).fillRoundedRect(
      BOARD_L + 3,
      205,
      Math.max(16, (BOARD_R - BOARD_L - 6) * k),
      16,
      8,
    );
  }
}
