import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { Tex } from '@/platform/art/textures';
import { emojiText, heartsLabel, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  SHIP_Y,
  ShipSim,
  type Enemy,
  type EnemyKind,
  type NaveEvent,
  type Power,
  type PowerKind,
} from './core';

const ENEMY_GLYPH: Record<EnemyKind, string> = { grunt: '👾', tank: '🛸', shooter: '👽' };
const POWER_GLYPH: Record<PowerKind, string> = { double: '⚡', shield: '🛡️', heart: '💖' };

/** "Nave": drag to steer; the ship shoots on its own. */
export class NaveScene extends MiniScene {
  private sim = new ShipSim();
  private g!: Phaser.GameObjects.Graphics;
  private hearts!: Phaser.GameObjects.Text;
  private wave!: Phaser.GameObjects.Text;
  private hint?: Phaser.GameObjects.Text;
  private enemySprites = new Map<Enemy, Phaser.GameObjects.Text>();
  private powerSprites = new Map<Power, Phaser.GameObjects.Text>();
  private grab: { px: number; sx: number } | null = null;

  constructor() {
    super(SceneKeys.Nave, 'nave', [0x03071e, 0x370617]);
  }

  create(): void {
    this.sim = new ShipSim();
    this.enemySprites.clear();
    this.powerSprites.clear();
    this.grab = null;
    this.frame();
    // A few static stars for depth.
    const stars = this.add.graphics().setDepth(-5);
    for (let i = 0; i < 60; i++)
      stars
        .fillStyle(0xffffff, 0.2 + Math.random() * 0.5)
        .fillCircle(Math.random() * 720, 140 + Math.random() * 1140, 1 + Math.random() * 2);
    this.g = this.add.graphics().setDepth(5);
    this.hearts = addText(this, GAME_WIDTH / 2, 160, heartsLabel(3), 40).setDepth(50);
    this.wave = addText(this, 90, 160, '', 28, { color: '#ffffff', stroke: '#0b1430' }).setDepth(
      50,
    );
    this.hint = addText(
      this,
      GAME_WIDTH / 2,
      900,
      'Arraste para mover a nave\nela atira sozinha',
      36,
      {
        color: '#ffffff',
        stroke: '#0b1430',
      },
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y < 140) return;
      this.grab = { px: p.x, sx: this.sim.x };
      this.hint?.destroy();
      this.hint = undefined;
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.grab && p.isDown) this.sim.moveTo(this.grab.sx + (p.x - this.grab.px));
    });
    const up = () => (this.grab = null);
    this.input.on(Phaser.Input.Events.POINTER_UP, up);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, up);
    this.input.keyboard?.on('keydown-LEFT', () => this.sim.moveTo(this.sim.x - 60));
    this.input.keyboard?.on('keydown-RIGHT', () => this.sim.moveTo(this.sim.x + 60));
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    if (!this.hint) for (const e of this.sim.step(Math.min(deltaMs, 50) / 1000)) this.handle(e);
    this.setScore(this.sim.score);
    this.sync();
    this.draw();
    if (this.sim.dead) {
      const { score, wave, kills } = this.sim;
      this.finish('Nave destruída!', [`Onda: ${wave}`, `Inimigos: ${kills}`], {
        score,
        details: { wave, kills },
      });
    }
  }

  private handle(e: NaveEvent): void {
    const { sfx } = getServices(this);
    switch (e.type) {
      case 'kill': {
        sfx.play('pop', e.kind === 'tank' ? 1 : 6);
        const p = this.add.particles(e.x, e.y, Tex.dot, {
          speed: { min: 80, max: 300 },
          lifespan: 380,
          scale: { start: 1, end: 0 },
          tint: [0xffd23f, 0xff7b54, 0xffffff],
          emitting: false,
        });
        p.setDepth(6).explode(12);
        this.time.delayedCall(450, () => p.destroy());
        break;
      }
      case 'hurt':
        sfx.play('hit');
        sfx.vibrate(80);
        this.cameras.main.shake(220, 0.01);
        this.hearts.setText(heartsLabel(this.sim.lives));
        break;
      case 'shield':
        sfx.play('locked');
        break;
      case 'power':
        sfx.play('win');
        this.hearts.setText(heartsLabel(this.sim.lives));
        this.pop(
          this.sim.x,
          SHIP_Y - 90,
          e.kind === 'double' ? 'TIRO DUPLO!' : e.kind === 'shield' ? 'ESCUDO!' : '+❤️',
          '#ffe066',
        );
        break;
      case 'wave':
        this.wave.setText(`Onda ${e.n}`);
        break;
    }
  }

  private sync(): void {
    const live = new Set(this.sim.enemies);
    for (const [e, t] of this.enemySprites)
      if (!live.has(e)) {
        t.destroy();
        this.enemySprites.delete(e);
      }
    for (const e of this.sim.enemies) {
      let t = this.enemySprites.get(e);
      if (!t) {
        t = emojiText(this, e.x, e.y, ENEMY_GLYPH[e.kind], e.r * 2);
        this.enemySprites.set(e, t);
      }
      t.setPosition(e.x, e.y);
    }
    const livePowers = new Set(this.sim.powers);
    for (const [p, t] of this.powerSprites)
      if (!livePowers.has(p)) {
        t.destroy();
        this.powerSprites.delete(p);
      }
    for (const p of this.sim.powers) {
      let t = this.powerSprites.get(p);
      if (!t) {
        t = emojiText(this, p.x, p.y, POWER_GLYPH[p.kind], 56);
        this.powerSprites.set(p, t);
      }
      t.setPosition(p.x, p.y);
    }
  }

  private draw(): void {
    const g = this.g.clear();
    const { sim } = this;
    g.fillStyle(0x7ae7ff);
    for (const b of sim.bullets) g.fillRoundedRect(b.x - 4, b.y - 16, 8, 32, 4);
    g.fillStyle(0xff4d6d);
    for (const s of sim.enemyShots) g.fillCircle(s.x, s.y, 10);
    const blink = sim.invuln > 0 && Math.floor(sim.invuln * 12) % 2 === 0;
    if (blink) return;
    const x = sim.x;
    g.fillStyle(0xff9f1c).fillTriangle(
      x - 12,
      SHIP_Y + 28,
      x + 12,
      SHIP_Y + 28,
      x,
      SHIP_Y + 54 + Math.random() * 10,
    );
    g.fillStyle(0xe9ecef).fillTriangle(x, SHIP_Y - 36, x - 30, SHIP_Y + 28, x + 30, SHIP_Y + 28);
    g.fillStyle(0x4da3ff).fillTriangle(x, SHIP_Y - 20, x - 12, SHIP_Y + 10, x + 12, SHIP_Y + 10);
    g.fillStyle(0xff4d6d).fillTriangle(
      x - 30,
      SHIP_Y + 28,
      x - 46,
      SHIP_Y + 36,
      x - 22,
      SHIP_Y + 10,
    );
    g.fillTriangle(x + 30, SHIP_Y + 28, x + 46, SHIP_Y + 36, x + 22, SHIP_Y + 10);
    if (sim.shieldLeft > 0) g.lineStyle(5, 0x7ae7ff, 0.8).strokeCircle(x, SHIP_Y, 52);
  }
}
