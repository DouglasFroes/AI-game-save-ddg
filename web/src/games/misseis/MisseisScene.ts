import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import { ambient, banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { BATTERIES, blastRadius, CITIES, GROUND_Y, MissileSim, type MissileEvent } from './core';

/** "Defesa Antimísseis": tap the sky to detonate interceptors and protect the six cities. */
export class MisseisScene extends MiniScene {
  private sim = new MissileSim();
  private g!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private ammoTexts: Phaser.GameObjects.Text[] = [];
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Misseis, 'misseis', [0x0c0a1d, 0x3b0764]);
  }

  create(): void {
    this.sim = new MissileSim();
    this.frame('0');
    ambient(this, 0xfde68a, 30);
    this.g = this.add.graphics().setDepth(5);
    this.statusText = addText(this, GAME_WIDTH / 2, 170, '', 30, {
      color: '#fed7aa',
      stroke: '#0c0a1d',
      strokeThickness: 6,
    }).setDepth(50);
    this.ammoTexts = BATTERIES.map((x) =>
      addText(this, x, GROUND_Y + 62, '', 26, { color: '#ffffff' }).setDepth(50),
    );
    this.hintBox = hint(
      this,
      ['Toque no céu para explodir os mísseis', 'Explosões em cadeia valem mais!'],
      700,
      4500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.ended || p.y < 140) return;
      this.hintBox?.dismiss();
      this.handle(this.sim.fire(p.x, p.y));
    });
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.handle(this.sim.step(Math.min(deltaMs, 40) / 1000));
    this.setScore(this.sim.score);
    const alive = this.sim.cities.filter(Boolean).length;
    this.statusText.setText(
      `Onda ${this.sim.wave} · 🏙️ ${alive}/${CITIES.length} · Abates ${this.sim.kills}`,
    );
    this.sim.ammo.forEach((a, i) => this.ammoTexts[i]!.setText(a > 0 ? `🚀${a}` : 'VAZIO'));
    this.draw();
  }

  private handle(events: MissileEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      switch (e.type) {
        case 'fire':
          sfx.play('zap');
          break;
        case 'empty':
          sfx.play('locked');
          this.pop(GAME_WIDTH / 2, 900, 'Sem munição!', '#fca5a5', 40);
          break;
        case 'kill':
          sfx.play('pop', Math.min(8, e.chain));
          burst(this, e.x, e.y, 0xfde047, 10, { speed: 220 });
          if (e.chain >= 2)
            this.pop(e.x, e.y - 30, `x${Math.min(5, e.chain)} +${e.points}`, '#fde047', 30);
          break;
        case 'city':
          sfx.play('boom');
          sfx.vibrate([60, 30, 60]);
          flash(this, 0xef4444, 0.3, 260);
          this.cameras.main.shake(220, 0.012);
          shockwave(this, CITIES[e.index]!, GROUND_Y, 0xef4444, 120);
          break;
        case 'battery':
          sfx.play('hit');
          this.cameras.main.shake(160, 0.008);
          break;
        case 'wave':
          sfx.play('level');
          sfx.vibrate([30, 30, 60]);
          banner(this, `ONDA ${e.wave} SALVA!`, '#86efac');
          this.pop(GAME_WIDTH / 2, 700, `Bônus +${e.bonus}`, '#fde047', 44);
          break;
        case 'over':
          this.finish(
            'As cidades caíram!',
            [`Ondas: ${this.sim.wave} · Mísseis abatidos: ${this.sim.kills}`],
            { score: this.sim.score, details: { wave: this.sim.wave, kills: this.sim.kills } },
            1000,
          );
          break;
      }
    }
  }

  private draw(): void {
    const g = this.g.clear();
    const sim = this.sim;
    // Ground and cities.
    g.fillStyle(0x3f2a14, 1).fillRect(0, GROUND_Y, GAME_WIDTH, GAME_HEIGHT - GROUND_Y);
    g.fillStyle(0x65a30d, 1).fillRect(0, GROUND_Y, GAME_WIDTH, 8);
    CITIES.forEach((x, i) => {
      if (!sim.cities[i]) {
        g.fillStyle(0x44403c, 1).fillRect(x - 24, GROUND_Y - 10, 48, 10);
        return;
      }
      g.fillStyle(0x38bdf8, 1);
      g.fillRect(x - 24, GROUND_Y - 30, 14, 30);
      g.fillRect(x - 8, GROUND_Y - 46, 16, 46);
      g.fillRect(x + 10, GROUND_Y - 24, 14, 24);
      g.fillStyle(0xfef08a, 1);
      for (let w = 0; w < 3; w++) g.fillRect(x - 4, GROUND_Y - 40 + w * 12, 8, 5);
    });
    BATTERIES.forEach((x, i) => {
      const live = sim.ammo[i]! > 0;
      g.fillStyle(live ? 0xa3a3a3 : 0x52525b, 1).fillTriangle(
        x - 40,
        GROUND_Y,
        x + 40,
        GROUND_Y,
        x,
        GROUND_Y - 40,
      );
    });
    // Enemy trails.
    for (const m of sim.missiles) {
      g.lineStyle(3, 0xef4444, 0.8).lineBetween(m.sx, m.sy, m.x, m.y);
      g.fillStyle(0xffffff, 1).fillCircle(m.x, m.y, 4);
    }
    // Interceptors.
    for (const s of sim.shots) {
      g.lineStyle(3, 0x38bdf8, 0.9).lineBetween(s.sx, s.sy, s.x, s.y);
      g.lineStyle(2, 0xffffff, 0.8);
      g.lineBetween(s.tx - 10, s.ty - 10, s.tx + 10, s.ty + 10).lineBetween(
        s.tx - 10,
        s.ty + 10,
        s.tx + 10,
        s.ty - 10,
      );
    }
    // Blasts.
    for (const b of sim.blasts) {
      const r = blastRadius(b.t);
      if (r <= 0) continue;
      const hot = Math.floor(b.t * 20) % 2 === 0;
      g.fillStyle(b.friendly ? (hot ? 0xfde047 : 0xf97316) : 0xef4444, 0.85).fillCircle(
        b.x,
        b.y,
        r,
      );
      g.fillStyle(0xffffff, 0.6).fillCircle(b.x, b.y, r * 0.4);
    }
  }
}
