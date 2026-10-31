import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { heartsLabel, MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { CodeRun, LIVES, MAX_TRIES, PALETTE } from './core';

const ROW_Y = 262;
const ROW_H = 90;
const PEG_R = 26;

/** "Senha das Cores": crack the colour code with black/white clues, code after code. */
export class SenhaScene extends MiniScene {
  private run = new CodeRun();
  private g!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private reveal: number[] | null = null;
  private busy = false;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Senha, 'senha', [0x2e1065, 0x0b1430]);
  }

  create(): void {
    this.run = new CodeRun();
    this.reveal = null;
    this.busy = false;
    this.frame('0');
    this.g = this.add.graphics().setDepth(5);
    this.statusText = addText(this, GAME_WIDTH / 2, 168, '', 28, {
      color: '#ddd6fe',
      stroke: '#2e1065',
      strokeThickness: 6,
    }).setDepth(50);
    this.livesText = addText(this, GAME_WIDTH / 2, 212, '', 28).setDepth(50);
    // Palette (tap a colour to add it to the guess).
    // The palette widens as codes use more colours, so hits are found from the tap position.
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (Math.abs(p.y - 1060) > 46) return;
      for (let i = 0; i < this.run.spec.colors; i++)
        if (Math.abs(p.x - this.paletteX(i)) <= 44) this.pick(i);
    });
    new Button(this, 200, 1175, '⌫ Apagar', () => this.run.undo(), {
      width: 260,
      height: 88,
      fontSize: 30,
      color: 0x475569,
      shade: 0x1e293b,
    });
    new Button(this, 520, 1175, '✔ Testar', () => this.submit(), {
      width: 260,
      height: 88,
      fontSize: 30,
      color: 0x16a34a,
      shade: 0x14532d,
    });
    this.hintBox = hint(
      this,
      ['● preto: cor e lugar certos', '○ branco: cor certa, lugar errado'],
      640,
      5000,
    );
  }

  private paletteX(i: number): number {
    const n = this.run.spec.colors;
    return GAME_WIDTH / 2 + (i - (n - 1) / 2) * 92;
  }

  private pick(i: number): void {
    if (this.ended || this.busy || i >= this.run.spec.colors) return;
    this.hintBox?.dismiss();
    this.run.pick(i);
    getServices(this).sfx.play('pop', this.run.current.length);
  }

  private submit(): void {
    if (this.ended || this.busy) return;
    const { sfx } = getServices(this);
    const res = this.run.submit();
    if (res.kind === 'incomplete') {
      sfx.play('locked');
      return;
    }
    if (res.kind === 'guess') {
      sfx.play(res.fb.exact ? 'coin' : 'tick');
      return;
    }
    this.busy = true;
    if (res.kind === 'cracked') {
      sfx.play('win');
      sfx.vibrate([30, 30, 60]);
      banner(this, `SENHA QUEBRADA! +${res.points}`, '#86efac');
      shockwave(this, GAME_WIDTH / 2, 600, 0xa855f7, 280);
      burst(this, GAME_WIDTH / 2, 600, 0xfde047, 24, { speed: 380 });
      this.setScore(this.run.score);
      this.reveal = this.run.guesses.at(-1) ?? null;
    } else {
      sfx.play('hit');
      flash(this, 0xef4444, 0.3, 300);
      banner(this, 'Era esta a senha…', '#fca5a5');
      this.reveal = res.code;
      if (res.livesLeft <= 0) {
        this.finish(
          'Sem tentativas!',
          [`Senhas quebradas: ${this.run.cracked}`],
          { score: this.run.score, details: { codes: this.run.cracked } },
          1500,
        );
        return;
      }
    }
    this.time.delayedCall(1400, () => {
      if (this.ended) return;
      this.reveal = null;
      this.run.newCode();
      this.busy = false;
    });
  }

  override update(): void {
    if (this.ended) return;
    const r = this.run;
    this.statusText.setText(
      `Senha ${r.codeNo} · ${r.spec.len} cores · Tentativa ${Math.min(r.guesses.length + 1, MAX_TRIES)}/${MAX_TRIES}`,
    );
    this.livesText.setText(heartsLabel(r.lives, LIVES));
    this.draw();
  }

  private draw(): void {
    const g = this.g.clear();
    const r = this.run;
    const len = r.spec.len;
    const pegX = (i: number) => 110 + i * 82;
    for (let row = 0; row < MAX_TRIES; row++) {
      const y = ROW_Y + row * ROW_H;
      const guess =
        row < r.guesses.length ? r.guesses[row]! : row === r.guesses.length ? r.current : null;
      const active = row === r.guesses.length && !this.reveal;
      g.fillStyle(active ? 0x312e81 : 0x1e1b4b, active ? 1 : 0.7).fillRoundedRect(
        50,
        y - ROW_H / 2 + 6,
        620,
        ROW_H - 12,
        20,
      );
      for (let i = 0; i < len; i++) {
        const c = guess?.[i];
        if (c === undefined) g.lineStyle(3, 0x4c1d95, 1).strokeCircle(pegX(i), y, PEG_R - 4);
        else {
          g.fillStyle(PALETTE[c]!, 1).fillCircle(pegX(i), y, PEG_R);
          g.fillStyle(0xffffff, 0.35).fillCircle(pegX(i) - 8, y - 8, 7);
        }
      }
      const fb = r.feedbacks[row];
      if (fb) {
        for (let k = 0; k < len; k++) {
          const fx = 540 + (k % 3) * 32;
          const fy = y - 14 + Math.floor(k / 3) * 28;
          if (k < fb.exact)
            g.fillStyle(0x0f172a, 1)
              .fillCircle(fx, fy, 11)
              .lineStyle(2, 0xffffff, 0.6)
              .strokeCircle(fx, fy, 11);
          else if (k < fb.exact + fb.near) g.fillStyle(0xffffff, 1).fillCircle(fx, fy, 11);
          else g.lineStyle(2, 0x6d28d9, 1).strokeCircle(fx, fy, 9);
        }
      }
    }
    if (this.reveal) {
      const y = ROW_Y + Math.min(r.guesses.length, MAX_TRIES - 1) * ROW_H;
      g.lineStyle(5, 0xfde047, 1).strokeRoundedRect(50, y - ROW_H / 2 + 6, 620, ROW_H - 12, 20);
      this.reveal.forEach((c, i) =>
        g
          .fillStyle(PALETTE[c]!, 1)
          .fillCircle(pegX(i), y, PEG_R)
          .lineStyle(4, 0xfde047, 1)
          .strokeCircle(pegX(i), y, PEG_R),
      );
    }
    for (let i = 0; i < r.spec.colors; i++) {
      g.fillStyle(PALETTE[i]!, 1).fillCircle(this.paletteX(i), 1060, 36);
      g.fillStyle(0xffffff, 0.35).fillCircle(this.paletteX(i) - 10, 1050, 10);
    }
  }
}
