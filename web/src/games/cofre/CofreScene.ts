import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { ambient, banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { heartsLabel, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { CofreSim } from './core';

const DIAL_X = GAME_WIDTH / 2;
const DIAL_Y = 670;
const DIAL_R = 215;

export class CofreScene extends MiniScene {
  private sim = new CofreSim();
  private g!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private pinsText!: Phaser.GameObjects.Text;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Cofre, 'cofre', [0x1c1917, 0x451a03]);
  }

  create(): void {
    this.sim = new CofreSim();
    this.frame('0');
    ambient(this, 0xfde047, 20);

    this.statusText = addText(this, GAME_WIDTH / 2, 170, '', 30, {
      color: '#fde68a',
      stroke: '#1c1917',
      strokeThickness: 6,
    }).setDepth(50);

    this.livesText = addText(this, GAME_WIDTH / 2, 220, '', 34, {
      color: '#ffffff',
    }).setDepth(50);

    this.pinsText = addText(this, DIAL_X, DIAL_Y, '', 92, {
      color: '#ffffff',
      stroke: '#1c1917',
      strokeThickness: 12,
    }).setDepth(20);

    this.g = this.add.graphics().setDepth(10);

    this.hintBox = hint(
      this,
      ['Toque na tela no instante exato em que', 'o ponteiro passar pela trava dourada!'],
      1115,
      4500,
    );

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.ended || p.y < 140) return;
      this.hintBox?.dismiss();
      this.onTap();
    });
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (!this.ended) this.onTap();
    });
  }

  private onTap(): void {
    const prevTarget = this.sim.targetAngle;
    const res = this.sim.tap();
    const { sfx } = getServices(this);

    const tx = DIAL_X + Math.cos(prevTarget) * DIAL_R;
    const ty = DIAL_Y + Math.sin(prevTarget) * DIAL_R;

    if (res.kind === 'hit') {
      this.setScore(this.sim.score);
      if (res.vaultCracked) {
        sfx.play('level');
        sfx.vibrate([25, 30, 25]);
        banner(this, `COFRE #${this.sim.vaultsCracked} ABERTO! 💰`, '#fde047');
        shockwave(this, DIAL_X, DIAL_Y, 0xfbbf24, 240);
        burst(this, DIAL_X, DIAL_Y, 0xfde047, 30, { speed: 420 });
      } else {
        sfx.play(res.perfect ? 'star' : 'pop', Math.min(8, this.sim.streak));
        sfx.vibrate(15);
        burst(this, tx, ty, res.perfect ? 0x38bdf8 : 0xfbbf24, 16, { speed: 240 });
        this.pop(
          tx,
          ty - 20,
          res.perfect ? `PERFEITO +${res.points}` : `+${res.points}`,
          res.perfect ? '#7dd3fc' : '#fde047',
          36,
        );
      }
      this.tweens.add({
        targets: this.pinsText,
        scale: { from: 1.3, to: 1 },
        duration: 150,
      });
    } else {
      sfx.play('hit');
      sfx.vibrate([60, 30, 60]);
      flash(this, 0xf43f5e, 0.3, 220);
      this.cameras.main.shake(180, 0.01);
      if (res.livesLeft <= 0) {
        this.finish(
          'Alarme disparou!',
          [`Cofres abertos: ${this.sim.vaultsCracked}`, `Maior sequência: ${this.sim.bestStreak}`],
          {
            score: this.sim.score,
            details: { vaults: this.sim.vaultsCracked, streak: this.sim.bestStreak },
          },
        );
      }
    }
  }

  override update(_time: number, deltaMs: number): void {
    if (this.ended) return;
    this.sim.step(Math.min(deltaMs, 50) / 1000);
    this.statusText.setText(
      `Cofre #${this.sim.vault}   ·   🔥 Sequência: ${this.sim.streak}   ·   💰 Abertos: ${this.sim.vaultsCracked}`,
    );
    this.livesText.setText(heartsLabel(this.sim.lives, 3));
    this.pinsText.setText(String(this.sim.pinsLeft));
    this.redraw();
  }

  private redraw(): void {
    const g = this.g.clear();

    // Shackle (top arch of the padlock)
    g.lineStyle(32, 0x94a3b8);
    g.beginPath();
    g.arc(DIAL_X, DIAL_Y - 140, 125, Math.PI, 0, false);
    g.strokePath();

    // Outer Vault Ring
    g.fillStyle(0x0f172a, 0.96).fillCircle(DIAL_X, DIAL_Y, DIAL_R + 52);
    g.lineStyle(8, 0xf59e0b, 0.7).strokeCircle(DIAL_X, DIAL_Y, DIAL_R + 52);

    // Track groove
    g.lineStyle(42, 0x1e293b).strokeCircle(DIAL_X, DIAL_Y, DIAL_R);

    // Tick marks
    g.lineStyle(3, 0x475569, 0.7);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      g.lineBetween(
        DIAL_X + Math.cos(a) * (DIAL_R - 26),
        DIAL_Y + Math.sin(a) * (DIAL_R - 26),
        DIAL_X + Math.cos(a) * (DIAL_R - 36),
        DIAL_Y + Math.sin(a) * (DIAL_R - 36),
      );
    }

    // Target Gold Pin
    const tx = DIAL_X + Math.cos(this.sim.targetAngle) * DIAL_R;
    const ty = DIAL_Y + Math.sin(this.sim.targetAngle) * DIAL_R;
    g.fillStyle(0xfbbf24, 0.3).fillCircle(tx, ty, 34);
    g.fillStyle(0xfbbf24).fillCircle(tx, ty, 22);
    g.lineStyle(4, 0xffffff).strokeCircle(tx, ty, 22);

    // Rotating Needle
    const nx = DIAL_X + Math.cos(this.sim.needleAngle) * DIAL_R;
    const ny = DIAL_Y + Math.sin(this.sim.needleAngle) * DIAL_R;
    g.lineStyle(14, 0xf43f5e, 1);
    g.lineBetween(
      DIAL_X + Math.cos(this.sim.needleAngle) * (DIAL_R - 28),
      DIAL_Y + Math.sin(this.sim.needleAngle) * (DIAL_R - 28),
      DIAL_X + Math.cos(this.sim.needleAngle) * (DIAL_R + 28),
      DIAL_Y + Math.sin(this.sim.needleAngle) * (DIAL_R + 28),
    );
    g.fillStyle(0xffffff).fillCircle(nx, ny, 9);

    // Center Hub
    g.fillStyle(0x334155).fillCircle(DIAL_X, DIAL_Y, 108);
    g.lineStyle(5, 0xfbbf24, 0.85).strokeCircle(DIAL_X, DIAL_Y, 108);
  }
}
