import { GAME_WIDTH, SceneKeys } from '@/config';
import { PuzzleScene, type RuleCard } from '@/platform/ui/puzzleGame';
import { addText, Button } from '@/platform/ui/widgets';
import { generate, type Question } from './core';

/** "Padrões": find the number that continues the series. A wrong pick costs a life and locks that option. */
export class PadroesScene extends PuzzleScene {
  private q!: Question;
  private g!: Phaser.GameObjects.Graphics;
  private chips: Phaser.GameObjects.Text[] = [];
  private buttons: Button[] = [];
  private msg!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Padroes, 'padroes', [0x4f46e5, 0x1e1b4b]);
  }

  protected override rules(): RuleCard {
    return {
      goal: 'Descobrir o número que continua a sequência.',
      steps: [
        'Observe como os números mudam: somam, multiplicam, alternam…',
        'Toque na alternativa que ocupa o lugar do ?.',
        'Errar custa uma vida e bloqueia aquela alternativa.',
      ],
    };
  }

  create(): void {
    this.g = this.add.graphics().setDepth(3);
    this.msg = addText(this, GAME_WIDTH / 2, 1060, '', 30, {
      color: '#fde047',
      stroke: '#1e1b4b',
      strokeThickness: 6,
    }).setDepth(30);
    this.begin('#c7d2fe', '#1e1b4b');
    for (let i = 0; i < 4; i++) {
      this.buttons.push(
        new Button(
          this,
          190 + (i % 2) * 340,
          780 + Math.floor(i / 2) * 150,
          '',
          () => this.pick(i),
          {
            width: 300,
            height: 120,
            fontSize: 48,
            color: 0x6366f1,
            shade: 0x3730a3,
          },
        ).setDepth(20),
      );
    }
    this.refreshOptions();
  }

  protected startLevel(): void {
    this.q = generate(this.level);
    for (const c of this.chips) c.destroy();
    const n = this.q.terms.length + 1;
    const per = Math.min(110, 660 / n);
    this.chips = Array.from({ length: n }, (_, i) =>
      addText(
        this,
        360 + (i - (n - 1) / 2) * per,
        470,
        i === n - 1 ? '?' : String(this.q.terms[i]),
        n > 6 ? 38 : 46,
        {
          color: i === n - 1 ? '#fde047' : '#ffffff',
          stroke: '#1e1b4b',
          strokeThickness: 7,
        },
      ).setDepth(9),
    );
    this.msg?.setText('');
    if (this.buttons.length) this.refreshOptions();
  }

  private refreshOptions(): void {
    this.q.options.forEach((o, i) => {
      this.buttons[i]!.label.setText(String(o));
      this.buttons[i]!.setEnabled(true).setAlpha(1);
    });
  }

  private pick(i: number): void {
    if (this.locked || this.ended) return;
    if (this.q.options[i] === this.q.answer) {
      this.chips.at(-1)!.setText(String(this.q.answer));
      this.solved('CERTO!');
      return;
    }
    this.buttons[i]!.setEnabled(false).setAlpha(0.35);
    if (this.mistake('Não é esse!')) return;
    this.msg.setText('Não é esse! Pense melhor…');
  }

  override update(t: number, dt: number): void {
    super.update(t, dt);
    const g = this.g.clear();
    const n = this.q.terms.length + 1;
    const per = Math.min(110, 660 / n);
    for (let i = 0; i < n; i++) {
      const x = 360 + (i - (n - 1) / 2) * per;
      g.fillStyle(i === n - 1 ? 0x4338ca : 0x312e81, 1).fillRoundedRect(
        x - per / 2 + 4,
        420,
        per - 8,
        100,
        16,
      );
    }
  }
}
