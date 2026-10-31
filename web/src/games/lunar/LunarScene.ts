import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import { ambient, banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { LunarSim, SAFE_VX, SAFE_VY, SHIP_R, type LunarEvent } from './core';

/** "Pouso Lunar": hold the left/right side to fire the engines and land softly on a pad. */
export class LunarScene extends MiniScene {
  private sim = new LunarSim();
  private g!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private padLabels: Phaser.GameObjects.Text[] = [];
  private keys?: Phaser.Types.Input.Keyboard.CursorKeys;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Lunar, 'lunar', [0x020617, 0x1e1b4b]);
  }

  create(): void {
    this.sim = new LunarSim();
    this.frame('0');
    ambient(this, 0xffffff, 40);
    this.input.addPointer(2);
    this.g = this.add.graphics().setDepth(5);
    this.hud = addText(this, GAME_WIDTH / 2, 175, '', 26, {
      color: '#e2e8f0',
      stroke: '#020617',
      strokeThickness: 5,
    }).setDepth(50);
    this.keys = this.input.keyboard?.createCursorKeys();
    this.labelPads();
    this.hintBox = hint(
      this,
      [
        'Segure a esquerda ou a direita para acionar os motores',
        'Os dois juntos sobem reto. Pouse devagar!',
      ],
      560,
      5000,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => this.hintBox?.dismiss());
  }

  private labelPads(): void {
    for (const t of this.padLabels) t.destroy();
    this.padLabels = this.sim.terrain.pads.map((p) =>
      addText(this, (p.x0 + p.x1) / 2, p.y + 26, `x${p.mult}`, 26, {
        color: p.mult >= 4 ? '#fde047' : p.mult >= 2 ? '#86efac' : '#e2e8f0',
        stroke: '#020617',
        strokeThickness: 5,
      }).setDepth(7),
    );
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    let left = !!this.keys?.left.isDown;
    let right = !!this.keys?.right.isDown;
    if (this.keys?.up.isDown) left = right = true;
    for (const p of this.input.manager.pointers) {
      if (!p.isDown || p.y < 130) continue;
      if (p.x < GAME_WIDTH / 2) left = true;
      else right = true;
    }
    this.sim.left = left;
    this.sim.right = right;
    this.handle(this.sim.step(Math.min(deltaMs, 40) / 1000));
    this.draw();
  }

  private handle(events: LunarEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e.type === 'landed') {
        this.setScore(this.sim.score);
        sfx.play('win');
        sfx.vibrate([30, 30, 60]);
        banner(this, e.soft ? 'POUSO PERFEITO!' : 'POUSOU!', e.soft ? '#fde047' : '#86efac');
        this.pop(this.sim.x, this.sim.y - 60, `+${e.points}`, '#fde047', 44);
        shockwave(this, this.sim.x, this.sim.y + SHIP_R, 0x86efac, 140);
        this.time.delayedCall(1300, () => {
          if (this.ended) return;
          this.sim.next();
          this.labelPads();
          banner(this, `NÍVEL ${this.sim.level}`, '#a5b4fc', 420);
        });
      } else {
        sfx.play('boom');
        sfx.vibrate([80, 40, 80]);
        flash(this, 0xf97316, 0.4, 320);
        this.cameras.main.shake(300, 0.015);
        burst(this, this.sim.x, this.sim.y, 0xf97316, 40, { speed: 460, gravity: 500 });
        burst(this, this.sim.x, this.sim.y, 0xfde047, 20, { speed: 300 });
        this.finish(
          e.reason === 'fast' ? 'Pousou rápido demais!' : 'Bateu nas rochas!',
          [`Pousos: ${this.sim.landings} · Nível: ${this.sim.level}`],
          {
            score: this.sim.score,
            details: { landings: this.sim.landings, level: this.sim.level },
          },
          900,
        );
      }
    }
  }

  private draw(): void {
    const g = this.g.clear();
    const sim = this.sim;
    // Ground.
    const pts = [
      ...sim.terrain.points,
      { x: GAME_WIDTH, y: GAME_HEIGHT },
      { x: 0, y: GAME_HEIGHT },
    ];
    g.fillStyle(0x334155, 1).fillPoints(pts, true);
    g.lineStyle(3, 0x94a3b8, 1).strokePoints([...sim.terrain.points], false);
    for (const p of sim.terrain.pads) {
      const color = p.mult >= 4 ? 0xfde047 : p.mult >= 2 ? 0x86efac : 0xe2e8f0;
      g.fillStyle(color, 1).fillRect(p.x0, p.y - 4, p.x1 - p.x0, 8);
    }

    if (sim.state !== 'crashed') {
      const tilt = (sim.left ? 0.18 : 0) - (sim.right ? 0.18 : 0);
      const { x, y } = sim;
      const rot = (dx: number, dy: number) => ({
        x: x + dx * Math.cos(tilt) - dy * Math.sin(tilt),
        y: y + dx * Math.sin(tilt) + dy * Math.cos(tilt),
      });
      if (sim.state === 'flying' && sim.fuel > 0) {
        const flame = 18 + Math.random() * 14;
        if (sim.left) {
          const a = rot(-14, SHIP_R);
          g.fillStyle(0xf97316, 1).fillTriangle(a.x - 7, a.y, a.x + 7, a.y, a.x, a.y + flame);
        }
        if (sim.right) {
          const a = rot(14, SHIP_R);
          g.fillStyle(0xf97316, 1).fillTriangle(a.x - 7, a.y, a.x + 7, a.y, a.x, a.y + flame);
        }
      }
      const top = rot(0, -SHIP_R - 6);
      const bl = rot(-SHIP_R, SHIP_R - 4);
      const br = rot(SHIP_R, SHIP_R - 4);
      g.fillStyle(0xe2e8f0, 1).fillTriangle(top.x, top.y, bl.x, bl.y, br.x, br.y);
      const win = rot(0, -2);
      g.fillStyle(0x38bdf8, 1).fillCircle(win.x, win.y, 7);
      const l1 = rot(-SHIP_R + 2, SHIP_R - 4);
      const l2 = rot(-SHIP_R - 6, SHIP_R + 6);
      const r1 = rot(SHIP_R - 2, SHIP_R - 4);
      const r2 = rot(SHIP_R + 6, SHIP_R + 6);
      g.lineStyle(4, 0xcbd5e1, 1)
        .lineBetween(l1.x, l1.y, l2.x, l2.y)
        .lineBetween(r1.x, r1.y, r2.x, r2.y);
    }

    // Fuel bar.
    g.fillStyle(0x0f172a, 1).fillRoundedRect(110, 222, 500, 20, 10);
    g.fillStyle(sim.fuel < 20 ? 0xef4444 : 0xfacc15, 1).fillRoundedRect(
      110,
      222,
      5 * sim.fuel,
      20,
      10,
    );
    const okV = Math.abs(sim.vy) <= SAFE_VY;
    const okH = Math.abs(sim.vx) <= SAFE_VX;
    const wind = sim.wind ? ` · Vento ${sim.wind > 0 ? '→' : '←'}` : '';
    this.hud.setText(
      `Nível ${sim.level} · ↓ ${Math.round(sim.vy)} ${okV ? '✅' : '⚠️'} · ↔ ${Math.round(sim.vx)} ${
        okH ? '✅' : '⚠️'
      }${wind}`,
    );
  }
}
