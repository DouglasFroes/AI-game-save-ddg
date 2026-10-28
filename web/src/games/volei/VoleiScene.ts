import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { ambient, banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  COURT_LEFT,
  COURT_RIGHT,
  NET_TOP_Y,
  NET_X,
  SAND_Y,
  SET_TARGET,
  VoleiSim,
  type VoleiEvent,
} from './core';

export class VoleiScene extends MiniScene {
  private sim = new VoleiSim();
  private g!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private scoreBoardText!: Phaser.GameObjects.Text;
  private ballSprite!: Phaser.GameObjects.Text;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Volei, 'volei', [0x0284c7, 0x0369a1]);
  }

  create(): void {
    this.sim = new VoleiSim();
    this.frame('0');
    ambient(this, 0xfef08a, 18);

    this.statusText = addText(this, GAME_WIDTH / 2, 168, '', 28, {
      color: '#fef08a',
      stroke: '#0369a1',
      strokeThickness: 6,
    }).setDepth(50);

    this.scoreBoardText = addText(this, GAME_WIDTH / 2, 224, '', 42, {
      color: '#ffffff',
      stroke: '#0369a1',
      strokeThickness: 8,
    }).setDepth(50);

    this.g = this.add.graphics().setDepth(5);
    this.ballSprite = emojiText(this, this.sim.bx, this.sim.by, '🏐', 58).setDepth(15);

    new Button(
      this,
      GAME_WIDTH / 2,
      1185,
      '⬆️ Saltar / Cortar!',
      () => {
        if (this.ended) return;
        this.hintBox?.dismiss();
        if (this.sim.jump()) {
          getServices(this).sfx.play('pop');
        }
      },
      {
        width: 360,
        height: 88,
        fontSize: 30,
        color: 0xf59e0b,
        shade: 0xb45309,
      },
    ).setDepth(50);

    this.hintBox = hint(
      this,
      ['Arraste na quadra para se posicionar', 'Salte perto da rede para mandar uma Cortada!'],
      1075,
      4500,
    );

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.ended || p.y < 140 || p.y > 1120) return;
      this.hintBox?.dismiss();
      this.sim.targetPx = p.x;
      if (p.y < 820 && this.sim.jump()) {
        getServices(this).sfx.play('pop');
      }
    });

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.ended || !p.isDown || p.y > 1120) return;
      this.sim.targetPx = p.x;
    });

    this.input.keyboard?.on('keydown-SPACE', () => {
      if (!this.ended && this.sim.jump()) getServices(this).sfx.play('pop');
    });
  }

  override update(_time: number, deltaMs: number): void {
    if (this.ended) return;
    for (const ev of this.sim.step(Math.min(deltaMs, 50) / 1000)) this.handleEvent(ev);

    this.setScore(this.sim.score);
    this.statusText.setText(
      `Set #${this.sim.setsWon + 1} (até ${SET_TARGET} pts)   ·   🏆 Sets vencidos: ${this.sim.setsWon}`,
    );
    this.scoreBoardText.setText(`VOCÊ ${this.sim.myPts}  ×  ${this.sim.aiPts} RIVAL`);
    this.ballSprite.setPosition(this.sim.bx, this.sim.by);
    this.ballSprite.setRotation(this.ballSprite.rotation + this.sim.bvx * 0.0008);
    this.redraw();
  }

  private handleEvent(ev: VoleiEvent): void {
    const { sfx } = getServices(this);
    switch (ev.type) {
      case 'hit':
        sfx.play(ev.spike ? 'zap' : 'bounce');
        sfx.vibrate(ev.spike ? 25 : 12);
        burst(this, ev.x, ev.y, ev.spike ? 0xf97316 : 0xffffff, ev.spike ? 18 : 10, {
          speed: ev.spike ? 300 : 180,
        });
        if (ev.spike && ev.who === 'player') {
          this.pop(ev.x, ev.y - 30, 'CORTADA! 🔥', '#fde047', 38);
        }
        break;
      case 'point':
        if (ev.winner === 'player') {
          sfx.play('coin', 3);
          shockwave(this, this.sim.bx, SAND_Y, 0x34d399, 120);
          this.pop(GAME_WIDTH / 2, 460, 'PONTO SEU! +150', '#6ee7b7', 42);
        } else {
          sfx.play('hit');
          flash(this, 0xf43f5e, 0.22, 180);
          this.pop(GAME_WIDTH / 2, 460, 'PONTO DO RIVAL', '#fda4af', 38);
        }
        break;
      case 'setWon':
        sfx.play('level');
        banner(this, `SET #${ev.setsWon} VENCIDO! 🏆`, '#fde047');
        break;
      case 'matchLost':
        this.finish(
          'Fim de partida!',
          [
            `Sets vencidos: ${this.sim.setsWon}`,
            `Total de pontos na areia: ${this.sim.totalPoints}`,
          ],
          {
            score: this.sim.score,
            details: { sets: this.sim.setsWon, points: this.sim.totalPoints },
          },
        );
        break;
    }
  }

  private redraw(): void {
    const g = this.g.clear();

    // Sun & Ocean horizon
    g.fillStyle(0xfef08a, 0.25).fillCircle(580, 350, 74);
    g.fillStyle(0xfde047, 0.85).fillCircle(580, 350, 48);
    g.fillStyle(0x0284c7, 0.7).fillRect(0, 820, GAME_WIDTH, 140);

    // Golden Beach Sand
    g.fillStyle(0xfbbf24).fillRoundedRect(
      COURT_LEFT - 20,
      SAND_Y,
      COURT_RIGHT - COURT_LEFT + 40,
      90,
      22,
    );
    g.lineStyle(4, 0xf59e0b).strokeRoundedRect(
      COURT_LEFT - 20,
      SAND_Y,
      COURT_RIGHT - COURT_LEFT + 40,
      90,
      22,
    );

    // Net
    g.fillStyle(0xe2e8f0).fillRect(NET_X - 5, NET_TOP_Y, 10, SAND_Y - NET_TOP_Y);
    g.fillStyle(0xf43f5e).fillRect(NET_X - 8, NET_TOP_Y, 16, 18);

    // Ball landing shadow
    g.fillStyle(0x000000, 0.3).fillEllipse(this.sim.bx, SAND_Y + 8, 52, 14);

    // Player (Left - Cyan/Brazil jersey)
    g.fillStyle(0x000000, 0.3).fillEllipse(this.sim.px, SAND_Y + 8, 64, 16);
    g.fillStyle(0x10b981).fillRoundedRect(this.sim.px - 26, this.sim.py - 56, 52, 56, 20);
    g.fillStyle(0xfde047).fillCircle(this.sim.px, this.sim.py - 68, 26);
    g.lineStyle(3, 0xffffff).strokeCircle(this.sim.px, this.sim.py - 68, 26);

    // AI Rival (Right - Red jersey)
    g.fillStyle(0x000000, 0.3).fillEllipse(this.sim.ax, SAND_Y + 8, 64, 16);
    g.fillStyle(0xe11d48).fillRoundedRect(this.sim.ax - 26, this.sim.ay - 56, 52, 56, 20);
    g.fillStyle(0xfda4af).fillCircle(this.sim.ax, this.sim.ay - 68, 26);
    g.lineStyle(3, 0xffffff).strokeCircle(this.sim.ax, this.sim.ay - 68, 26);
  }
}
