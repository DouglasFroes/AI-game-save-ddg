import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { burst, flash, hint } from '@/platform/ui/juice';
import { heartsLabel, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { CORE, CORE_R, SHIELD_HALF, SHIELD_R, ShieldSim } from './core';

/** "Escudo": turn the shield to block the shots that fly in from every side. */
export class EscudoScene extends MiniScene {
  private sim = new ShieldSim();
  private g!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Escudo, 'escudo', [0x4c1d95, 0x0f0a1e]);
  }

  create(): void {
    this.sim = new ShieldSim();
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.info = addText(this, GAME_WIDTH / 2, 168, '', 30, {
      color: '#ddd6fe',
      stroke: '#0f0a1e',
      strokeThickness: 6,
    }).setDepth(50);
    this.hintBox = hint(
      this,
      ['Toque ou arraste para girar o escudo', 'Bloqueie todos os tiros!'],
      1190,
      4500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.aim(p));
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (p.isDown) this.aim(p);
    });
  }

  private aim(p: Phaser.Input.Pointer): void {
    if (this.ended || p.y < 140) return;
    this.hintBox?.dismiss();
    this.sim.target = Math.atan2(p.y - CORE.y, p.x - CORE.x);
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const r = this.sim.step(Math.min(deltaMs, 33) / 1000);
    const { sfx } = getServices(this);
    if (r.blocked > 0) {
      sfx.play('tick');
      burst(
        this,
        CORE.x + Math.cos(this.sim.angle) * SHIELD_R,
        CORE.y + Math.sin(this.sim.angle) * SHIELD_R,
        0xc4b5fd,
        6,
        { speed: 200 },
      );
    }
    if (r.hits > 0) {
      sfx.play('hit');
      flash(this, 0xef4444, 0.3, 200);
      this.cameras.main.shake(160, 0.01);
    }
    this.setScore(this.sim.score);
    const combo = this.sim.combo > 2 ? ` · Combo ${this.sim.combo}` : '';
    this.info.setText(`${heartsLabel(this.sim.lives)}${combo}`);
    this.draw();
    if (!this.sim.alive) {
      burst(this, CORE.x, CORE.y, 0xf472b6, 30, { speed: 450 });
      this.finish(
        'O núcleo caiu!',
        [`Bloqueios: ${this.sim.blocked} · Melhor combo: ${this.sim.bestCombo}`],
        {
          score: this.sim.score,
          details: { blocked: this.sim.blocked, combo: this.sim.bestCombo },
        },
        600,
      );
    }
  }

  private draw(): void {
    const g = this.g.clear();
    const s = this.sim;
    g.lineStyle(3, 0x6d28d9, 0.4)
      .strokeCircle(CORE.x, CORE.y, SHIELD_R)
      .strokeCircle(CORE.x, CORE.y, 320);
    g.fillStyle(0xf472b6, 1).fillCircle(CORE.x, CORE.y, CORE_R);
    g.fillStyle(0xffffff, 0.5).fillCircle(CORE.x - 12, CORE.y - 12, 12);
    g.lineStyle(22, 0x38bdf8, 1)
      .beginPath()
      .arc(CORE.x, CORE.y, SHIELD_R, s.angle - SHIELD_HALF, s.angle + SHIELD_HALF)
      .strokePath();
    g.lineStyle(8, 0xe0f2fe, 1)
      .beginPath()
      .arc(CORE.x, CORE.y, SHIELD_R + 6, s.angle - SHIELD_HALF, s.angle + SHIELD_HALF)
      .strokePath();
    for (const sh of s.shots) {
      const x = CORE.x + Math.cos(sh.angle) * sh.d;
      const y = CORE.y + Math.sin(sh.angle) * sh.d;
      g.lineStyle(6, 0xfb923c, 0.5).lineBetween(
        x,
        y,
        x + Math.cos(sh.angle) * 34,
        y + Math.sin(sh.angle) * 34,
      );
      g.fillStyle(0xfb923c, 1).fillCircle(x, y, 13);
      g.fillStyle(0xfef3c7, 1).fillCircle(x, y, 6);
    }
  }
}
