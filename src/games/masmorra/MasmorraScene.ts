import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { ambient, banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  COLS,
  MasmorraSim,
  MAX_HP,
  WEAPON_USES,
  type Card,
  type CardKind,
  type MasmorraEvent,
} from './core';

const CARD_W = 196;
const CARD_H = 250;
const GAP = 16;
const TOP = 440;

const LOOK: Record<CardKind, { emoji: string; fill: number; edge: number; label: string }> = {
  monster: { emoji: '👹', fill: 0x4c0519, edge: 0xfb7185, label: 'Monstro' },
  weapon: { emoji: '⚔️', fill: 0x1e3a8a, edge: 0x60a5fa, label: 'Arma' },
  potion: { emoji: '🧪', fill: 0x064e3b, edge: 0x34d399, label: 'Poção' },
  shield: { emoji: '🛡️', fill: 0x312e81, edge: 0xa5b4fc, label: 'Escudo' },
  coin: { emoji: '💰', fill: 0x713f12, edge: 0xfacc15, label: 'Ouro' },
  bomb: { emoji: '💣', fill: 0x27272a, edge: 0xf97316, label: 'Bomba' },
};

const valueLabel = (c: Card): string =>
  c.kind === 'bomb' ? '💥' : c.kind === 'potion' ? `+${c.value}` : `${c.value}`;

/** "Masmorra de Cartas": tap the cards, manage your HP, weapon and armor, and dive as deep as you can. */
export class MasmorraScene extends MiniScene {
  private sim = new MasmorraSim();
  private views = new Map<number, Phaser.GameObjects.Container>();
  private hud!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private gearText!: Phaser.GameObjects.Text;
  private depthText!: Phaser.GameObjects.Text;
  private busy = false;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Masmorra, 'masmorra', [0x0c0a1a, 0x2e1065]);
  }

  create(): void {
    this.sim = new MasmorraSim();
    this.views.clear();
    this.busy = false;
    this.frame();
    ambient(this, 0xc4b5fd, 14);
    this.hud = this.add.graphics().setDepth(10);
    this.depthText = addText(this, GAME_WIDTH / 2, 168, '', 30, {
      color: '#ddd6fe',
      stroke: '#0c0a1a',
      strokeThickness: 6,
    }).setDepth(50);
    this.hpText = addText(this, 210, 262, '', 34, {
      color: '#ffffff',
      stroke: '#0c0a1a',
      strokeThickness: 7,
    }).setDepth(50);
    this.gearText = addText(this, 530, 262, '', 30, {
      color: '#ffffff',
      stroke: '#0c0a1a',
      strokeThickness: 7,
    }).setDepth(50);
    this.sync(true);
    this.hintBox = hint(
      this,
      [
        'Toque num monstro para lutar: a arma reduz o dano',
        'Pegue armas, poções e escudos. Cuidado com o HP!',
      ],
      390,
      9000,
    );
  }

  override update(): void {
    if (this.ended) return;
    this.setScore(this.sim.score);
    const { sim } = this;
    this.depthText.setText(`Andar ${sim.depth} · ☠ ${sim.kills} · 💰 ${sim.coins}`);
    this.hpText.setText(`❤️ ${sim.hp}/${MAX_HP}`);
    this.gearText.setText(
      `${sim.weapon > 0 ? `⚔️ ${sim.weapon} (${sim.uses}/${WEAPON_USES})` : '⚔️ —'}  🛡️ ${sim.armor}`,
    );
    this.drawHud();
  }

  private pos(col: number, row: number): { x: number; y: number } {
    const w = COLS * CARD_W + (COLS - 1) * GAP;
    return {
      x: (GAME_WIDTH - w) / 2 + CARD_W / 2 + col * (CARD_W + GAP),
      y: TOP + CARD_H / 2 + row * (CARD_H + GAP),
    };
  }

  private makeCard(card: Card): Phaser.GameObjects.Container {
    const look = LOOK[card.kind];
    const c = this.add.container(0, 0).setDepth(20);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.4).fillRoundedRect(
      -CARD_W / 2 + 4,
      -CARD_H / 2 + 8,
      CARD_W,
      CARD_H,
      22,
    );
    g.fillStyle(look.fill).fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 22);
    g.fillStyle(0xffffff, 0.08).fillRoundedRect(
      -CARD_W / 2 + 6,
      -CARD_H / 2 + 6,
      CARD_W - 12,
      70,
      18,
    );
    g.lineStyle(4, look.edge, 0.95).strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 22);
    c.add([
      g,
      addText(this, 0, -CARD_H / 2 + 28, look.label, 22, { color: '#e2e8f0' }),
      emojiText(this, 0, -14, look.emoji, 92),
      addText(this, 0, CARD_H / 2 - 44, valueLabel(card), card.kind === 'bomb' ? 40 : 58, {
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 8,
      }),
    ]);
    c.setSize(CARD_W, CARD_H).setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => {
      if (!this.busy) this.tap(card.id);
    });
    return c;
  }

  /** Reconciles the card sprites with the sim: new cards fall in, kept ones slide to their slot. */
  private sync(instant = false): void {
    const live = new Set<number>();
    this.sim.grid.forEach((column, col) =>
      column.forEach((card, row) => {
        live.add(card.id);
        const p = this.pos(col, row);
        let v = this.views.get(card.id);
        if (!v) {
          v = this.makeCard(card);
          this.views.set(card.id, v);
          if (instant) v.setPosition(p.x, p.y);
          else {
            v.setPosition(p.x, p.y - 520).setAlpha(0);
            this.tweens.add({
              targets: v,
              y: p.y,
              alpha: 1,
              duration: 360,
              ease: 'Bounce.easeOut',
              delay: col * 40,
            });
            return;
          }
        }
        if (!instant)
          this.tweens.add({ targets: v, x: p.x, y: p.y, duration: 300, ease: 'Cubic.easeIn' });
      }),
    );
    for (const [id, v] of [...this.views]) {
      if (live.has(id)) continue;
      this.views.delete(id);
      this.tweens.add({
        targets: v,
        scale: 0.2,
        alpha: 0,
        angle: 20,
        duration: 220,
        onComplete: () => v.destroy(),
      });
    }
  }

  private findCard(id: number): { col: number; row: number } | null {
    for (let col = 0; col < COLS; col++) {
      const row = this.sim.grid[col]!.findIndex((c) => c.id === id);
      if (row >= 0) return { col, row };
    }
    return null;
  }

  private tap(id: number): void {
    if (this.ended) return;
    const at = this.findCard(id);
    if (!at) return;
    this.hintBox?.dismiss();
    const events = this.sim.tap(at.col, at.row);
    this.busy = true;
    this.handle(events);
    this.time.delayedCall(180, () => {
      this.sync();
      this.time.delayedCall(380, () => (this.busy = false));
    });
  }

  private handle(events: MasmorraEvent[]): void {
    const { sfx } = getServices(this);
    for (const ev of events) {
      switch (ev.type) {
        case 'fight': {
          const p = this.pos(ev.col, ev.row);
          burst(this, p.x, p.y, 0xfb7185, 16, { speed: 320 });
          if (ev.taken > 0) {
            sfx.play('hit');
            sfx.vibrate(40);
            this.cameras.main.shake(160, 0.007);
            flash(this, 0xef4444, 0.2);
            this.pop(p.x, p.y - 40, `-${ev.taken}`, '#fca5a5', 60);
          } else {
            sfx.play('boom');
            this.pop(p.x, p.y - 40, ev.absorbed > 0 ? 'Bloqueou!' : 'Limpo!', '#86efac', 44);
          }
          if (ev.absorbed > 0) this.pop(p.x, p.y + 20, `🛡️ -${ev.absorbed}`, '#a5b4fc', 32);
          if (ev.weaponBroke) {
            this.time.delayedCall(250, () => {
              sfx.play('locked');
              banner(this, 'Arma quebrou!', '#fdba74');
            });
          }
          break;
        }
        case 'equip': {
          const p = this.pos(ev.col, ev.row);
          sfx.play('zap');
          shockwave(this, p.x, p.y, 0x60a5fa, 90);
          this.pop(p.x, p.y - 40, `⚔️ ${ev.power}`, '#93c5fd', 52);
          break;
        }
        case 'heal': {
          const p = this.pos(ev.col, ev.row);
          sfx.play('star');
          burst(this, p.x, p.y, 0x34d399, 14, { speed: 220, gravity: -200 });
          this.pop(p.x, p.y - 40, ev.amount > 0 ? `+${ev.amount} ❤️` : 'Cheio', '#6ee7b7', 48);
          break;
        }
        case 'armor': {
          const p = this.pos(ev.col, ev.row);
          sfx.play('bounce');
          shockwave(this, p.x, p.y, 0xa5b4fc, 80);
          this.pop(p.x, p.y - 40, `+${ev.amount} 🛡️`, '#c7d2fe', 48);
          break;
        }
        case 'coin': {
          const p = this.pos(ev.col, ev.row);
          sfx.play('coin', 3);
          burst(this, p.x, p.y, 0xfde047, 14, { speed: 260 });
          this.pop(p.x, p.y - 40, `+${ev.amount}`, '#fde047', 52);
          break;
        }
        case 'bomb': {
          const p = this.pos(ev.col, ev.row);
          sfx.play('boom');
          sfx.vibrate([30, 20, 40]);
          this.cameras.main.shake(260, 0.012);
          shockwave(this, p.x, p.y, 0xf97316, 260);
          flash(this, 0xf97316, 0.3);
          for (const c of ev.cells) {
            const q = this.pos(c.col, c.row);
            burst(this, q.x, q.y, 0xfb923c, 12, { speed: 340 });
          }
          if (ev.kills > 0)
            this.pop(
              p.x,
              p.y - 60,
              `${ev.kills} monstro${ev.kills > 1 ? 's' : ''}!`,
              '#fdba74',
              46,
            );
          break;
        }
        case 'depth':
          this.time.delayedCall(350, () => {
            sfx.play('level');
            banner(this, `ANDAR ${ev.depth}`, '#c4b5fd');
          });
          break;
        case 'dead':
          sfx.play('boom');
          this.cameras.main.shake(400, 0.015);
          this.finish(
            'Você caiu na masmorra!',
            [`Andar: ${this.sim.depth}`, `Monstros: ${this.sim.kills}`, `Ouro: ${this.sim.coins}`],
            { score: this.sim.score, details: { depth: this.sim.depth, kills: this.sim.kills } },
            700,
          );
          break;
      }
    }
  }

  private drawHud(): void {
    const g = this.hud.clear();
    const k = Phaser.Math.Clamp(this.sim.hp / MAX_HP, 0, 1);
    const low = k < 0.3;
    g.fillStyle(0x000000, 0.4).fillRoundedRect(60, 300, 600, 34, 17);
    g.fillStyle(low ? 0xef4444 : 0xf43f5e).fillRoundedRect(64, 304, Math.max(16, 592 * k), 26, 13);
    if (this.sim.armor > 0) {
      g.fillStyle(0xa5b4fc, 0.9).fillRoundedRect(
        64,
        304,
        Math.min(592 * k, 592 * (this.sim.armor / MAX_HP)),
        10,
        5,
      );
    }
    // Weapon durability pips.
    if (this.sim.weapon > 0) {
      for (let i = 0; i < WEAPON_USES; i++) {
        g.fillStyle(i < this.sim.uses ? 0x60a5fa : 0x334155).fillCircle(520 + i * 30 - 30, 360, 9);
      }
    }
  }
}
