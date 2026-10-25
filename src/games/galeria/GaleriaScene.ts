import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { GallerySim, KINDS, LANES, MAGAZINE, START_TIME, type GalleryEvent } from './core';

const CX = GAME_WIDTH / 2;
const CRATE = { x: 600, y: 1170, w: 190, h: 120 };

/** "Galeria de Tiro": tap the ducks, never the bunnies; reload with the crate. One minute. */
export class GaleriaScene extends MiniScene {
  private sim = new GallerySim();
  private views = new Map<number, Phaser.GameObjects.Text>();
  private hud!: Phaser.GameObjects.Graphics;
  private clockText!: Phaser.GameObjects.Text;
  private multText!: Phaser.GameObjects.Text;
  private crateText!: Phaser.GameObjects.Text;
  private waves!: Phaser.GameObjects.Graphics;
  private tutorial?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Galeria, 'galeria', [0x3b0764, 0x1e1b4b]);
  }

  create(): void {
    this.sim = new GallerySim();
    this.views = new Map();
    this.frame('0');
    this.drawBooth();
    this.waves = this.add.graphics().setDepth(3);
    this.hud = this.add.graphics().setDepth(8);
    this.clockText = addText(this, GAME_WIDTH - 50, 290, '', 30, { color: '#ffffff', stroke: '#1e1b4b' }).setDepth(9);
    this.multText = addText(this, CX, 330, '', 30, { color: '#fde047', stroke: '#1e1b4b' }).setDepth(9);
    this.crateText = addText(this, CRATE.x, CRATE.y, 'RECARREGAR', 24, { color: '#ffffff', stroke: '#422006' }).setDepth(9);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y < 130 || this.ended) return;
      this.tutorial?.dismiss();
      if (Math.abs(p.x - CRATE.x) < CRATE.w / 2 && Math.abs(p.y - CRATE.y) < CRATE.h / 2) this.reload();
      else this.shoot(p.x, p.y);
    });
    this.input.keyboard?.on('keydown-R', () => this.reload());
    this.tutorial = hint(this, ['Toque nos patos e alvos', 'NÃO acerte os coelhos 🐰', 'Recarregue na caixa'], 620, 5500);
  }

  private drawBooth(): void {
    const g = this.add.graphics().setDepth(-5);
    // Curtain and awning.
    for (let x = 0; x < GAME_WIDTH; x += 40) g.fillStyle(x % 80 ? 0x581c87 : 0x6b21a8).fillRect(x, 140, 40, 1000);
    for (let i = 0; i < 9; i++) {
      g.fillStyle(i % 2 ? 0xffffff : 0xdc2626).fillRect(i * 80, 140, 80, 110);
      g.fillStyle(i % 2 ? 0xffffff : 0xdc2626).fillCircle(i * 80 + 40, 250, 40);
    }
    // Light bulbs.
    for (let x = 20; x < GAME_WIDTH; x += 50) g.fillStyle(0xfde047).fillCircle(x, 300, 8);
    // Conveyor rails.
    for (const y of LANES) {
      g.fillStyle(0x000000, 0.3).fillRect(0, y + 44, GAME_WIDTH, 26);
      g.fillStyle(0x92400e).fillRect(0, y + 40, GAME_WIDTH, 22);
      g.fillStyle(0xfbbf24).fillRect(0, y + 40, GAME_WIDTH, 5);
    }
    // Counter.
    g.fillStyle(0x7c2d12).fillRect(0, 1060, GAME_WIDTH, 220);
    g.fillStyle(0xb45309).fillRect(0, 1060, GAME_WIDTH, 26);
    for (let x = 0; x < GAME_WIDTH; x += 90) g.fillStyle(0x9a3412).fillRect(x, 1090, 6, 190);
    // Reload crate.
    g.fillStyle(0x000000, 0.3).fillRoundedRect(CRATE.x - CRATE.w / 2 + 6, CRATE.y - CRATE.h / 2 + 8, CRATE.w, CRATE.h, 14);
    g.fillStyle(0xa16207).fillRoundedRect(CRATE.x - CRATE.w / 2, CRATE.y - CRATE.h / 2, CRATE.w, CRATE.h, 14);
    g.lineStyle(6, 0x713f12).strokeRoundedRect(CRATE.x - CRATE.w / 2, CRATE.y - CRATE.h / 2, CRATE.w, CRATE.h, 14);
    g.lineBetween(CRATE.x - CRATE.w / 2, CRATE.y - CRATE.h / 2, CRATE.x + CRATE.w / 2, CRATE.y + CRATE.h / 2);
  }

  private reload(): void {
    if (this.sim.reload()) {
      getServices(this).sfx.play('tick');
      this.tweens.add({ targets: this.crateText, scale: { from: 1.25, to: 1 }, duration: 200 });
    }
  }

  private shoot(x: number, y: number): void {
    const events = this.sim.shoot(x, y);
    if (!events.length) return;
    if (events[0]!.type !== 'empty') {
      getServices(this).sfx.play('pop');
      shockwave(this, x, y, 0xffffff, 26);
      this.cameras.main.shake(50, 0.002);
    }
    this.handle(events);
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    this.handle(this.sim.step(dt));
    // Item sprites follow the sim; new ones appear, gone ones fade out.
    const alive = new Set<number>();
    for (const it of this.sim.items) {
      alive.add(it.id);
      let v = this.views.get(it.id);
      if (!v) {
        v = emojiText(this, it.x, it.y, KINDS[it.kind].emoji, it.kind === 'target' ? 72 : 88).setDepth(it.kind === 'clown' ? 6 : 2);
        if (it.vx > 0) v.setFlipX(true);
        if (it.kind === 'clown') {
          v.setY(1200);
          this.tweens.add({ targets: v, y: it.y, duration: 160, ease: 'Back.easeOut' });
        }
        this.views.set(it.id, v);
      }
      v.x = it.x;
      if (it.kind !== 'clown') v.y = it.y + Math.sin(this.time.now / 180 + it.id) * 5;
    }
    for (const [id, v] of this.views) {
      if (alive.has(id)) continue;
      this.views.delete(id);
      if (v.getData('shot')) continue;
      this.tweens.add({ targets: v, alpha: 0, y: v.y + 40, duration: 150, onComplete: () => v.destroy() });
    }
    // Water waves in front of the ducks.
    const w = this.waves.clear();
    for (const y of LANES) {
      for (let x = -40; x < GAME_WIDTH + 40; x += 40) {
        const off = (this.time.now / 12 + y) % 40;
        w.fillStyle(0x0ea5e9, 0.85).fillCircle(x + off, y + 44, 16);
      }
    }
    this.drawHud();
  }

  private drawHud(): void {
    const s = this.sim;
    const g = this.hud.clear();
    const frac = Math.min(1, s.clock / START_TIME);
    g.fillStyle(0x000000, 0.5).fillRoundedRect(40, 276, 560, 26, 12);
    g.fillStyle(frac > 0.25 ? 0x22c55e : 0xef4444).fillRoundedRect(40, 276, Math.max(26, 560 * frac), 26, 12);
    this.clockText.setText(`${Math.ceil(s.clock)}s`);
    // Shells left.
    for (let i = 0; i < MAGAZINE; i++) {
      const x = 60 + i * 50;
      const full = i < s.ammo;
      g.fillStyle(full ? 0xfbbf24 : 0x44403c).fillRoundedRect(x - 12, 1130, 24, 60, 8);
      g.fillStyle(full ? 0xb91c1c : 0x292524).fillRoundedRect(x - 12, 1170, 24, 20, 4);
    }
    if (s.reloading > 0) {
      g.fillStyle(0x000000, 0.5).fillRoundedRect(40, 1206, 300, 14, 7);
      g.fillStyle(0xfde047).fillRoundedRect(40, 1206, 300 * (1 - s.reloading / 0.85), 14, 7);
    }
    this.crateText.setText(s.ammo === 0 && s.reloading === 0 ? 'RECARREGUE!' : 'RECARREGAR');
    this.crateText.setScale(s.ammo === 0 && s.reloading === 0 ? 1 + Math.sin(this.time.now / 90) * 0.08 : 1);
    this.multText.setText(s.multiplier > 1 ? `Combo ${s.combo} · x${s.multiplier}` : s.combo >= 2 ? `Combo ${s.combo}` : '');
  }

  private handle(events: GalleryEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e.type === 'hit') {
        const v = this.views.get(e.item.id);
        if (v) {
          v.setData('shot', true);
          this.tweens.add({ targets: v, scaleY: 0, angle: 30, duration: 180, onComplete: () => v.destroy() });
        }
        sfx.play('coin', Math.min(7, e.combo));
        burst(this, e.item.x, e.item.y, e.item.kind === 'gold' ? 0xfde047 : 0xffffff, e.item.kind === 'gold' ? 22 : 10);
        this.pop(e.item.x, e.item.y - 60, `+${e.points}${e.item.kind === 'gold' ? ' +3s' : ''}`, e.item.kind === 'gold' ? '#fde047' : '#ffffff', 38);
        this.setScore(this.sim.score);
      } else if (e.type === 'friend') {
        const v = this.views.get(e.item.id);
        if (v) {
          v.setData('shot', true);
          this.tweens.add({ targets: v, y: v.y - 80, alpha: 0, duration: 400, onComplete: () => v.destroy() });
        }
        sfx.play('hit');
        sfx.vibrate([80]);
        flash(this, 0xdc2626, 0.3, 280);
        this.pop(e.item.x, e.item.y - 60, 'NÃO! -50 -3s', '#fca5a5', 40);
        this.setScore(this.sim.score);
      } else if (e.type === 'miss') sfx.play('tick');
      else if (e.type === 'empty') {
        sfx.play('locked');
        this.pop(CX, 1010, 'Sem balas! Recarregue', '#fde047', 34);
      } else if (e.type === 'reloaded') sfx.play('click');
      else if (e.type === 'over') {
        const s = this.sim;
        this.finish(
          s.accuracy >= 0.8 && s.hits >= 30 ? 'Mira de ouro! 🎯' : 'Fim do tempo!',
          [`Acertos: ${s.hits} · Precisão: ${Math.round(s.accuracy * 100)}% · Combo: ${s.bestCombo}`],
          { score: s.score, details: { hits: s.hits, accuracy: Math.round(s.accuracy * 100) } },
        );
      }
    }
  }
}
