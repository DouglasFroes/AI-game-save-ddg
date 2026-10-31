import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { AnagramRun, SKIP_COST, START_TIME } from './core';

const TILE = 112;
const GAP = 14;
const ROW_X = (n: number, i: number) => GAME_WIDTH / 2 + (i - (n - 1) / 2) * (TILE + GAP);
const ANSWER_Y = 470;
const LETTERS_Y = 760;

/** "Anagrama": unscramble the letters into a word — fast, before the clock runs dry. */
export class AnagramaScene extends MiniScene {
  private run = new AnagramRun();
  private g!: Phaser.GameObjects.Graphics;
  private tileTexts: Phaser.GameObjects.Text[] = [];
  private answerTexts: Phaser.GameObjects.Text[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Anagrama, 'anagrama', [0x7c2d12, 0x1c1917]);
  }

  create(): void {
    this.run = new AnagramRun();
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.statusText = addText(this, GAME_WIDTH / 2, 170, '', 30, {
      color: '#fed7aa',
      stroke: '#7c2d12',
      strokeThickness: 6,
    }).setDepth(50);
    this.clockText = addText(this, GAME_WIDTH / 2, 300, '', 64, {
      color: '#ffffff',
      stroke: '#1c1917',
      strokeThickness: 10,
    }).setDepth(50);
    this.tileTexts = [0, 1, 2, 3, 4].map((i) =>
      addText(this, ROW_X(5, i), LETTERS_Y, '', 64, { color: '#7c2d12' }).setDepth(6),
    );
    this.answerTexts = [0, 1, 2, 3, 4].map((i) =>
      addText(this, ROW_X(5, i), ANSWER_Y, '', 64, { color: '#ffffff' }).setDepth(6),
    );
    new Button(this, 200, 1000, '⌫ Voltar', () => this.run.unpick(), {
      width: 260,
      height: 90,
      fontSize: 30,
      color: 0x475569,
      shade: 0x1e293b,
    });
    new Button(this, 520, 1000, `⏭ Pular (-${SKIP_COST}s)`, () => this.skip(), {
      width: 260,
      height: 90,
      fontSize: 28,
      color: 0xb45309,
      shade: 0x78350f,
    });
    this.hintBox = hint(
      this,
      ['Toque nas letras na ordem certa', 'para formar uma palavra!'],
      1150,
      4500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.ended || Math.abs(p.y - LETTERS_Y) > TILE / 2) return;
      for (let i = 0; i < 5; i++) if (Math.abs(p.x - ROW_X(5, i)) <= TILE / 2) this.pick(i);
    });
  }

  private pick(i: number): void {
    this.hintBox?.dismiss();
    const { sfx } = getServices(this);
    const res = this.run.pick(i);
    if (res.kind === 'pick') sfx.play('pop', this.run.picked.length);
    else if (res.kind === 'wrong') {
      sfx.play('hit');
      this.cameras.main.shake(140, 0.008);
      this.pop(GAME_WIDTH / 2, ANSWER_Y - 90, 'Não é uma palavra…', '#fca5a5', 36);
    } else {
      sfx.play('win', Math.min(8, this.run.streak));
      sfx.vibrate(30);
      this.setScore(this.run.score);
      banner(this, `${res.word}! +${res.points}`, '#86efac', 560);
      burst(this, GAME_WIDTH / 2, ANSWER_Y, 0xfde047, 22, { speed: 360 });
    }
  }

  private skip(): void {
    if (this.ended) return;
    const w = this.run.skip();
    getServices(this).sfx.play('locked');
    this.pop(GAME_WIDTH / 2, ANSWER_Y - 90, `Era ${w}`, '#fed7aa', 40);
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.run.tick(deltaMs / 1000);
    const r = this.run;
    if (r.over) {
      getServices(this).sfx.play('hit');
      flash(this, 0xef4444, 0.3, 300);
      this.finish(
        'O tempo acabou!',
        [`Palavras: ${r.solved} · Maior sequência: ${r.bestStreak}`],
        { score: r.score, details: { words: r.solved, streak: r.bestStreak } },
        600,
      );
      return;
    }
    this.statusText.setText(
      `Palavras ${r.solved} · 🔥 Sequência ${r.streak} · x${(1 + 0.2 * r.streak).toFixed(1)}`,
    );
    this.clockText
      .setText(`⏱ ${Math.ceil(r.timeLeft)}`)
      .setColor(r.timeLeft < 10 ? '#fca5a5' : '#ffffff');
    const g = this.g.clear();
    const frac = Math.min(1, r.timeLeft / START_TIME);
    g.fillStyle(0x1c1917, 1).fillRoundedRect(110, 360, 500, 18, 9);
    g.fillStyle(frac < 0.2 ? 0xef4444 : 0xfb923c, 1).fillRoundedRect(110, 360, 500 * frac, 18, 9);
    for (let i = 0; i < 5; i++) {
      const used = r.picked.includes(i);
      const x = ROW_X(5, i) - TILE / 2;
      g.fillStyle(0x000000, 0.3).fillRoundedRect(x + 4, LETTERS_Y - TILE / 2 + 8, TILE, TILE, 20);
      g.fillStyle(used ? 0x57534e : 0xfef3c7, 1).fillRoundedRect(
        x,
        LETTERS_Y - TILE / 2,
        TILE,
        TILE,
        20,
      );
      this.tileTexts[i]!.setText(r.letters[i] ?? '').setAlpha(used ? 0.35 : 1);
      g.lineStyle(4, 0xfdba74, 0.8).strokeRoundedRect(x, ANSWER_Y - TILE / 2, TILE, TILE, 20);
      this.answerTexts[i]!.setText(r.typed[i] ?? '');
    }
  }
}
