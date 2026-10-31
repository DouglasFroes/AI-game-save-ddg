import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, shockwave } from '@/platform/ui/juice';
import { heartsLabel, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { DefuseRun, LIVES, RULES, type CutResult, type Wire } from './core';

const COLOR: Record<Wire, number> = {
  vermelho: 0xef4444,
  azul: 0x3b82f6,
  amarelo: 0xfacc15,
  branco: 0xf8fafc,
  preto: 0x111827,
};
const WIRE_Y0 = 330;
const WIRE_GAP = 74;

/** "Desarme a Bomba": read the rule card and cut the right wire before it blows. */
export class DesarmeScene extends MiniScene {
  private run = new DefuseRun();
  private g!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private serialText!: Phaser.GameObjects.Text;
  private rulesText!: Phaser.GameObjects.Text;
  private cutAt = -1;
  private busy = false;

  constructor() {
    super(SceneKeys.Desarme, 'desarme', [0x1c1917, 0x292524]);
  }

  create(): void {
    this.run = new DefuseRun();
    this.busy = false;
    this.cutAt = -1;
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.statusText = addText(this, GAME_WIDTH / 2, 168, '', 28, {
      color: '#fde68a',
      stroke: '#1c1917',
      strokeThickness: 6,
    }).setDepth(50);
    this.timerText = addText(this, 560, 262, '', 48, {
      color: '#ef4444',
      stroke: '#000000',
      strokeThickness: 6,
    }).setDepth(50);
    this.serialText = addText(this, 230, 262, '', 30, { color: '#e7e5e4' }).setDepth(50);
    this.rulesText = addText(this, GAME_WIDTH / 2, 0, '', 25, {
      color: '#fef3c7',
      align: 'left',
      wrapWidth: 620,
    })
      .setOrigin(0.5, 0)
      .setDepth(50);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.tap(p.y));
    this.refresh();
  }

  private refresh(): void {
    const b = this.run.bomb;
    this.serialText.setText(`Série: ${b.serial}`);
    this.rulesText
      .setText(
        `📋 ${b.wires.length} FIOS (conte de cima para baixo)\n` +
          RULES[b.wires.length]!.map((r, i) => `${i + 1}. ${r}`).join('\n'),
      )
      .setY(WIRE_Y0 + b.wires.length * WIRE_GAP + 40);
    this.cutAt = -1;
  }

  private tap(y: number): void {
    if (this.ended || this.busy) return;
    const i = Math.round((y - WIRE_Y0) / WIRE_GAP);
    if (
      i < 0 ||
      i >= this.run.bomb.wires.length ||
      Math.abs(y - (WIRE_Y0 + i * WIRE_GAP)) > WIRE_GAP / 2
    )
      return;
    this.cutAt = i;
    getServices(this).sfx.play('click');
    this.resolve(this.run.cut(i));
  }

  private resolve(res: CutResult): void {
    const { sfx } = getServices(this);
    this.busy = true;
    if (res.kind === 'defused') {
      sfx.play('win');
      sfx.vibrate([30, 30, 60]);
      banner(this, `DESARMADA! +${res.points}`, '#86efac');
      shockwave(this, GAME_WIDTH / 2, 500, 0x22c55e, 260);
      this.setScore(this.run.score);
    } else {
      sfx.play('boom');
      sfx.vibrate([100, 50, 100]);
      flash(this, 0xf97316, 0.5, 400);
      this.cameras.main.shake(400, 0.02);
      burst(this, GAME_WIDTH / 2, 500, 0xf97316, 40, { speed: 520 });
      this.cutAt = res.correct;
      banner(this, `BUM! Era o fio ${res.correct + 1}`, '#fca5a5');
      if (res.livesLeft <= 0) {
        this.finish(
          'A bomba explodiu!',
          [`Bombas desarmadas: ${this.run.defused}`],
          { score: this.run.score, details: { bombs: this.run.defused } },
          1300,
        );
        return;
      }
    }
    this.time.delayedCall(1300, () => {
      if (this.ended) return;
      this.run.next();
      this.refresh();
      this.busy = false;
    });
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    if (!this.busy) {
      const res = this.run.tick(deltaMs / 1000);
      if (res) this.resolve(res);
      else if (
        this.run.timeLeft < 5 &&
        Math.floor(this.run.timeLeft * 2) !== Math.floor((this.run.timeLeft + deltaMs / 1000) * 2)
      )
        getServices(this).sfx.play('tick');
    }
    this.statusText.setText(`Bomba ${this.run.bombNo} · ${heartsLabel(this.run.lives, LIVES)}`);
    this.timerText.setText(`${Math.max(0, this.run.timeLeft).toFixed(1)}`);
    this.draw();
  }

  private draw(): void {
    const g = this.g.clear();
    const b = this.run.bomb;
    const h = b.wires.length * WIRE_GAP + 120;
    g.fillStyle(0x44403c, 1).fillRoundedRect(50, 220, 620, h, 24);
    g.fillStyle(0x000000, 1).fillRoundedRect(470, 236, 180, 54, 10);
    b.wires.forEach((w, i) => {
      const y = WIRE_Y0 + i * WIRE_GAP;
      g.fillStyle(0x78716c, 1).fillCircle(110, y, 14).fillCircle(610, y, 14);
      addWire(g, w, y, i === this.cutAt);
    });
    function addWire(gr: Phaser.GameObjects.Graphics, w: Wire, y: number, cut: boolean): void {
      gr.lineStyle(18, 0x000000, 0.35);
      if (cut) {
        gr.lineBetween(124, y + 4, 330, y + 18).lineBetween(390, y + 18, 596, y + 4);
        gr.lineStyle(14, COLOR[w], 1)
          .lineBetween(124, y, 330, y + 14)
          .lineBetween(390, y + 14, 596, y);
      } else {
        gr.lineBetween(124, y + 4, 596, y + 4);
        gr.lineStyle(14, COLOR[w], 1).lineBetween(124, y, 596, y);
        if (w === 'preto') gr.lineStyle(2, 0x6b7280, 1).lineBetween(124, y - 7, 596, y - 7);
      }
    }
  }
}
