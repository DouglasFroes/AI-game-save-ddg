import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import { formatTime } from '@/platform/ranking';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  ARENA_H,
  ARENA_W,
  HordaSim,
  type EnemyType,
  type HordaEvent,
  type UpgradeOption,
} from './core';

const ENEMY_EMOJI: Record<EnemyType, string> = {
  bat: '🦇',
  zombie: '🧟',
  golem: '👹',
  boss: '🐉',
};

/**
 * "Sobrevivente da Horda": drag anywhere to steer your mage, dodge monsters,
 * collect XP crystals and pick rogue-lite upgrades on every level up.
 */
export class HordaScene extends MiniScene {
  private sim = new HordaSim();
  private g!: Phaser.GameObjects.Graphics;
  private enemySprites = new Map<number, Phaser.GameObjects.Text>();
  private orbitalSprites: Phaser.GameObjects.Text[] = [];
  private hudText!: Phaser.GameObjects.Text;
  private joyOrigin: { x: number; y: number } | null = null;
  private joyThumb: { x: number; y: number } | null = null;
  private modal: Phaser.GameObjects.Container | null = null;

  constructor() {
    super(SceneKeys.Horda, 'horda', [0x111827, 0x1f2937]);
  }

  create(): void {
    this.sim = new HordaSim();
    this.enemySprites.clear();
    this.orbitalSprites = [];
    this.joyOrigin = null;
    this.joyThumb = null;
    this.modal = null;

    this.frame('0');
    this.g = this.add.graphics().setDepth(5);
    emojiText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, '🧙‍♂️', 66).setDepth(15);

    this.hudText = addText(this, GAME_WIDTH / 2, 188, 'Nv. 1 · ⏱ 0:00 · 💀 0', 26, {
      color: '#e2e8f0',
      stroke: '#090d16',
    }).setDepth(50);

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.ended || this.sim.choices || p.y < 140) return;
      this.joyOrigin = { x: p.x, y: p.y };
      this.joyThumb = { x: p.x, y: p.y };
    });

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.ended || this.sim.choices || !this.joyOrigin || !p.isDown) return;
      const dx = p.x - this.joyOrigin.x;
      const dy = p.y - this.joyOrigin.y;
      const dist = Math.hypot(dx, dy);
      const maxR = 75;
      const clamped = Math.min(dist, maxR);
      const angle = Math.atan2(dy, dx);
      this.joyThumb = {
        x: this.joyOrigin.x + Math.cos(angle) * clamped,
        y: this.joyOrigin.y + Math.sin(angle) * clamped,
      };
      this.sim.setMoveDir(dx, dy);
    });

    const stopJoy = () => {
      this.joyOrigin = null;
      this.joyThumb = null;
      this.sim.setMoveDir(0, 0);
    };
    this.input.on(Phaser.Input.Events.POINTER_UP, stopJoy);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, stopJoy);
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const dt = Math.min(deltaMs, 50) / 1000;

    if (!this.sim.choices) {
      this.readKeyboard();
      for (const ev of this.sim.step(dt)) this.handle(ev);
    }

    this.setScore(this.sim.score);
    this.hudText.setText(
      `Nv. ${this.sim.level} · ⏱ ${formatTime(this.sim.time)} · 💀 ${this.sim.kills}`,
    );
    this.syncSprites();
    this.draw();
  }

  private readKeyboard(): void {
    if (this.joyOrigin) return;
    const kb = this.input.keyboard;
    if (!kb) return;
    const left = kb.addKey('LEFT').isDown || kb.addKey('A').isDown;
    const right = kb.addKey('RIGHT').isDown || kb.addKey('D').isDown;
    const up = kb.addKey('UP').isDown || kb.addKey('W').isDown;
    const down = kb.addKey('DOWN').isDown || kb.addKey('S').isDown;
    const dx = (right ? 1 : 0) - (left ? 1 : 0);
    const dy = (down ? 1 : 0) - (up ? 1 : 0);
    this.sim.setMoveDir(dx, dy);
  }

  private handle(ev: HordaEvent): void {
    const { sfx } = getServices(this);
    switch (ev.type) {
      case 'shoot':
        break;
      case 'kill':
        sfx.play('pop', ev.enemyType === 'boss' ? 1 : 5);
        break;
      case 'gem':
        sfx.play('click');
        if (ev.levelUp && this.sim.choices) {
          sfx.play('win');
          this.joyOrigin = null;
          this.joyThumb = null;
          this.sim.setMoveDir(0, 0);
          this.showUpgradeModal(this.sim.choices);
        }
        break;
      case 'hurt':
        sfx.play('hit');
        sfx.vibrate(50);
        this.cameras.main.shake(160, 0.008);
        break;
      case 'gameOver':
        this.finish(
          'A horda venceu você!',
          [
            `Tempo: ${formatTime(this.sim.time)} · Nível: ${this.sim.level}`,
            `Inimigos derrotados: ${this.sim.kills}`,
          ],
          {
            score: this.sim.score,
            details: {
              kills: this.sim.kills,
              level: this.sim.level,
              time: Math.floor(this.sim.time),
            },
          },
        );
        break;
    }
  }

  private showUpgradeModal(options: UpgradeOption[]): void {
    this.modal?.destroy();
    const c = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(100);
    const backdrop = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x090d16, 0.78)
      .setInteractive();
    const card = this.add.graphics();
    card.fillStyle(0x1e293b).fillRoundedRect(-310, -340, 620, 680, 32);
    card.lineStyle(5, 0xffd23f).strokeRoundedRect(-310, -340, 620, 680, 32);

    c.add([
      backdrop,
      card,
      addText(this, 0, -275, `⬆️ NÍVEL ${this.sim.level}!`, 46, { color: '#ffd23f' }),
      addText(this, 0, -220, 'Escolha um poder para continuar:', 26, {
        color: '#cbd5e1',
        weight: 'normal',
      }),
    ]);

    options.forEach((opt, i) => {
      const y = -100 + i * 165;
      const btn = new Button(
        this,
        0,
        y,
        `${opt.emoji}  ${opt.title}\n${opt.desc}`,
        () => {
          getServices(this).sfx.play('star', 2);
          this.sim.chooseUpgrade(opt.id);
          c.destroy();
          this.modal = null;
        },
        {
          width: 540,
          height: 136,
          fontSize: 28,
          color: COLORS.secondary,
          shade: COLORS.secondaryDark,
        },
      );
      c.add(btn);
    });

    c.setScale(0.75).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 240, ease: 'Back.easeOut' });
    this.modal = c;
  }

  private toScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: GAME_WIDTH / 2 + (wx - this.sim.x),
      y: GAME_HEIGHT / 2 + 40 + (wy - this.sim.y),
    };
  }

  private syncSprites(): void {
    const alive = new Set(this.sim.enemies.map((e) => e.id));
    for (const [id, sp] of this.enemySprites) {
      if (!alive.has(id)) {
        sp.destroy();
        this.enemySprites.delete(id);
      }
    }
    for (const e of this.sim.enemies) {
      const pos = this.toScreen(e.x, e.y);
      let sp = this.enemySprites.get(e.id);
      if (!sp) {
        sp = emojiText(this, pos.x, pos.y, ENEMY_EMOJI[e.type], e.r * 2.1).setDepth(12);
        this.enemySprites.set(e.id, sp);
      }
      sp.setPosition(pos.x, pos.y);
      sp.setVisible(
        pos.x > -80 && pos.x < GAME_WIDTH + 80 && pos.y > 120 && pos.y < GAME_HEIGHT + 80,
      );
    }

    const orbs = this.sim.orbitalPositions();
    while (this.orbitalSprites.length < orbs.length) {
      this.orbitalSprites.push(emojiText(this, 0, 0, '⚔️', 42).setDepth(16));
    }
    orbs.forEach((o, i) => {
      const pos = this.toScreen(o.x, o.y);
      const sp = this.orbitalSprites[i]!;
      sp.setPosition(pos.x, pos.y);
      sp.setRotation(this.sim.orbitalAngle + i);
    });
  }

  private draw(): void {
    const g = this.g.clear();
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2 + 40;

    // Scrolling ground grid for motion sense
    const tile = 110;
    const ox = (((cx - this.sim.x) % tile) + tile) % tile;
    const oy = (((cy - this.sim.y) % tile) + tile) % tile;
    g.lineStyle(2, 0x334155, 0.35);
    for (let x = ox; x < GAME_WIDTH; x += tile) g.lineBetween(x, 140, x, GAME_HEIGHT);
    for (let y = Math.max(140, oy); y < GAME_HEIGHT; y += tile) g.lineBetween(0, y, GAME_WIDTH, y);

    // Arena boundary warning
    const tl = this.toScreen(0, 0);
    const br = this.toScreen(ARENA_W, ARENA_H);
    g.lineStyle(6, 0xff4d6d, 0.65).strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

    // XP Gems
    for (const gem of this.sim.gems) {
      const p = this.toScreen(gem.x, gem.y);
      if (p.x < -20 || p.x > GAME_WIDTH + 20 || p.y < 140 || p.y > GAME_HEIGHT + 20) continue;
      const color = gem.value >= 20 ? 0xffd23f : 0x38bdf8;
      g.fillStyle(color).fillCircle(p.x, p.y, gem.value >= 20 ? 10 : 7);
      g.fillStyle(0xffffff, 0.7).fillCircle(p.x - 2, p.y - 2, 3);
    }

    // Magic Projectiles
    g.fillStyle(0xc084fc);
    for (const pr of this.sim.projectiles) {
      const p = this.toScreen(pr.x, pr.y);
      g.fillCircle(p.x, p.y, 10);
      g.fillStyle(0xffffff).fillCircle(p.x, p.y, 5);
      g.fillStyle(0xc084fc);
    }

    // Hero HP bar under hero
    const hpRatio = Math.max(0, this.sim.hp / this.sim.maxHp);
    g.fillStyle(0x090d16, 0.85).fillRoundedRect(cx - 42, cy + 44, 84, 12, 6);
    g.fillStyle(hpRatio > 0.35 ? 0x5bd46f : 0xff4d6d).fillRoundedRect(
      cx - 40,
      cy + 46,
      Math.max(6, 80 * hpRatio),
      8,
      4,
    );

    // Top XP Bar
    const xpRatio = Math.min(1, this.sim.xp / this.sim.xpNext);
    g.fillStyle(0x090d16, 0.8).fillRoundedRect(60, 142, GAME_WIDTH - 120, 20, 10);
    if (xpRatio > 0) {
      g.fillStyle(0x38bdf8).fillRoundedRect(
        63,
        145,
        Math.max(14, (GAME_WIDTH - 126) * xpRatio),
        14,
        7,
      );
    }

    // Virtual Joystick
    if (this.joyOrigin && this.joyThumb) {
      g.lineStyle(4, 0xffffff, 0.35).strokeCircle(this.joyOrigin.x, this.joyOrigin.y, 75);
      g.fillStyle(0xffffff, 0.45).fillCircle(this.joyThumb.x, this.joyThumb.y, 32);
    }
  }
}
