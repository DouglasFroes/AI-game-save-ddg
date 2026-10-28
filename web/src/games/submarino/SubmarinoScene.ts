import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import { ambient, banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { heartsLabel, MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { MAX_ACTIVE_CHARGES, SubmarinoSim, WATER_Y, type SubEvent } from './core';

export class SubmarinoScene extends MiniScene {
  private sim = new SubmarinoSim();
  private g!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Submarino, 'submarino', [0x0c4a6e, 0x020617]);
  }

  create(): void {
    this.sim = new SubmarinoSim();
    this.frame('0');
    ambient(this, 0x38bdf8, 22);

    this.statusText = addText(this, GAME_WIDTH / 2, 165, '', 28, {
      color: '#bae6fd',
      stroke: '#020617',
      strokeThickness: 6,
    }).setDepth(50);

    this.livesText = addText(this, GAME_WIDTH / 2, 208, '', 32, {
      color: '#ffffff',
    }).setDepth(50);

    this.g = this.add.graphics().setDepth(5);

    new Button(
      this,
      GAME_WIDTH / 2,
      1190,
      '💣 Lançar Carga',
      () => {
        this.hintBox?.dismiss();
        this.fireCharge();
      },
      {
        width: 360,
        height: 88,
        fontSize: 30,
        color: 0x0ea5e9,
        shade: 0x0369a1,
      },
    ).setDepth(50);

    this.hintBox = hint(
      this,
      ['Toque na água para mover o navio e lançar cargas', 'Desvie das minas que sobem!'],
      1085,
      4500,
    );

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.ended || p.y < 140 || p.y > 1130) return;
      this.hintBox?.dismiss();
      this.sim.targetX = p.x;
      this.fireCharge(p.x);
    });

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.ended || !p.isDown || p.y > 1130) return;
      this.sim.targetX = p.x;
    });

    this.input.keyboard?.on('keydown-SPACE', () => this.fireCharge());
  }

  private fireCharge(x?: number): void {
    if (this.ended) return;
    if (this.sim.dropCharge(x ?? this.sim.shipX)) {
      getServices(this).sfx.play('pop');
      burst(this, this.sim.shipX, WATER_Y + 18, 0xe0f2fe, 8, { speed: 120, size: 5 });
    } else {
      getServices(this).sfx.play('locked');
    }
  }

  override update(time: number, deltaMs: number): void {
    if (this.ended) return;
    const events = this.sim.step(Math.min(deltaMs, 50) / 1000);
    for (const ev of events) this.handleEvent(ev);

    this.setScore(this.sim.score);
    const ammo = MAX_ACTIVE_CHARGES - this.sim.charges.length;
    this.statusText.setText(
      `Onda ${this.sim.wave}   ·   🚤 ${this.sim.subsSunk} afundados   ·   💣 ${'●'.repeat(ammo)}${'○'.repeat(MAX_ACTIVE_CHARGES - ammo)}`,
    );
    this.livesText.setText(heartsLabel(this.sim.lives, 3));
    this.redraw(time);
  }

  private handleEvent(ev: SubEvent): void {
    const { sfx } = getServices(this);
    switch (ev.type) {
      case 'subHit':
        sfx.play('boom');
        sfx.vibrate(30);
        shockwave(this, ev.x, ev.y, 0xfbbf24, 110);
        burst(this, ev.x, ev.y, 0xf97316, 20, { speed: 320 });
        this.pop(ev.x, ev.y, `+${ev.points}`, '#fde047', 40);
        break;
      case 'mineCleared':
        sfx.play('zap');
        burst(this, ev.x, ev.y, 0x38bdf8, 12, { speed: 200 });
        this.pop(ev.x, ev.y, `+${ev.points}`, '#7dd3fc', 32);
        break;
      case 'shipHit':
        sfx.play('hit');
        sfx.vibrate([50, 30, 50]);
        flash(this, 0xf43f5e, 0.3, 240);
        this.cameras.main.shake(200, 0.01);
        burst(this, ev.x, ev.y, 0xf43f5e, 24, { speed: 340 });
        break;
      case 'waveUp':
        sfx.play('level');
        banner(this, `ONDA ${ev.wave}!`, '#38bdf8');
        this.pop(GAME_WIDTH / 2, 460, `BÔNUS +${ev.bonus}`, '#fde047', 42);
        break;
      case 'gameOver':
        this.finish(
          'Navio afundado!',
          [`Submarinos destruídos: ${this.sim.subsSunk}`, `Onda alcançada: ${this.sim.wave}`],
          {
            score: this.sim.score,
            details: { subs: this.sim.subsSunk, wave: this.sim.wave },
          },
        );
        break;
    }
  }

  private redraw(time: number): void {
    const g = this.g.clear();

    // Ocean depths & sonar grid lines
    g.fillStyle(0x0369a1, 0.32).fillRect(0, WATER_Y, GAME_WIDTH, GAME_HEIGHT - WATER_Y);
    g.lineStyle(2, 0x38bdf8, 0.14);
    for (const ly of [460, 640, 820, 1000]) {
      g.lineBetween(30, ly, GAME_WIDTH - 30, ly);
    }

    // Animated waves at WATER_Y
    g.lineStyle(4, 0x7dd3fc, 0.85);
    g.beginPath();
    for (let x = 0; x <= GAME_WIDTH; x += 24) {
      const wy = WATER_Y + Math.sin(x / 45 + time / 280) * 5;
      if (x === 0) g.moveTo(x, wy);
      else g.lineTo(x, wy);
    }
    g.strokePath();

    // Player Destroyer Ship
    const sx = this.sim.shipX;
    g.fillStyle(0xe2e8f0).fillRoundedRect(sx - 48, WATER_Y - 22, 96, 26, 8);
    g.fillStyle(0x94a3b8).fillRect(sx - 22, WATER_Y - 40, 44, 18);
    g.fillStyle(0x38bdf8).fillRect(sx - 12, WATER_Y - 35, 24, 8);

    // Depth charges
    for (const c of this.sim.charges) {
      g.fillStyle(0x1e293b).fillRoundedRect(c.x - 12, c.y - 16, 24, 32, 6);
      g.lineStyle(2, 0xfbbf24).strokeRoundedRect(c.x - 12, c.y - 16, 24, 32, 6);
      g.fillStyle(0xe0f2fe, 0.5).fillCircle(c.x, c.y - 24, 5);
    }

    // Enemy Submarines
    const subColors = [0x34d399, 0xfbbf24, 0xf97316, 0xf43f5e] as const;
    for (const s of this.sim.subs) {
      const col = subColors[s.lane];
      const dir = s.vx >= 0 ? 1 : -1;
      g.fillStyle(col).fillEllipse(s.x, s.y, 92, 34);
      g.fillStyle(col).fillRoundedRect(s.x - 14 * dir, s.y - 28, 24, 16, 4);
      g.fillStyle(0x020617, 0.5).fillCircle(s.x + 18 * dir, s.y, 7);
    }

    // Rising Mines
    for (const m of this.sim.mines) {
      g.fillStyle(0xf43f5e).fillCircle(m.x, m.y, 14);
      g.lineStyle(3, 0xfda4af).strokeCircle(m.x, m.y, 14);
      g.fillStyle(0xffffff).fillCircle(m.x - 4, m.y - 4, 4);
    }
  }
}
