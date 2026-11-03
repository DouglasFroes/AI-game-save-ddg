import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText, TimeBar } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { boardPoints, generate, levelSpec, timeBonus, type LightsBoard } from './core';

const BOARD = 620;
const X0 = (GAME_WIDTH - BOARD) / 2;
const Y0 = 330;
const START_TIME = 45;

/** "Apaga Luzes": every tap flips a light and its neighbours — leave the whole board dark. */
export class LuzesScene extends MiniScene {
  private board!: LightsBoard;
  private level = 1;
  private score = 0;
  private perfect = 0;
  private timeBar!: TimeBar;
  private timeLeft = START_TIME;
  private g!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Luzes, 'luzes', [0x0f172a, 0x1e1b4b]);
  }

  create(): void {
    this.level = 1;
    this.score = 0;
    this.perfect = 0;
    this.timeLeft = START_TIME;
    this.frame('0');
    this.g = this.add.graphics().setDepth(5);
    this.statusText = addText(this, GAME_WIDTH / 2, 170, '', 30, {
      color: '#fef08a',
      stroke: '#0f172a',
      strokeThickness: 6,
    }).setDepth(50);
    this.timeBar = new TimeBar(this, 214);
    this.board = generate(levelSpec(1));
    this.hintBox = hint(
      this,
      ['Toque numa luz: ela e as vizinhas trocam', 'Apague todas!'],
      1100,
      4500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) =>
      this.tap(p.x, p.y),
    );
  }

  private tap(x: number, y: number): void {
    if (this.ended) return;
    const cs = BOARD / this.board.n;
    const c = Math.floor((x - X0) / cs);
    const r = Math.floor((y - Y0) / cs);
    if (r < 0 || c < 0 || r >= this.board.n || c >= this.board.n) return;
    this.hintBox?.dismiss();
    const { sfx } = getServices(this);
    this.board.press(r * this.board.n + c);
    sfx.play('click');
    burst(this, X0 + (c + 0.5) * cs, Y0 + (r + 0.5) * cs, 0xfef08a, 6, { speed: 140 });
    if (!this.board.solved) return;
    const within = this.board.moves <= this.board.par;
    const pts = boardPoints(this.level, this.board);
    const spec = levelSpec(this.level);
    this.score += pts;
    if (within) this.perfect++;
    this.timeLeft += timeBonus(spec);
    this.setScore(this.score);
    sfx.play('win');
    sfx.vibrate([30, 30, 60]);
    banner(this, within ? 'NO PAR! +' + pts : `+${pts}`, within ? '#fde047' : '#86efac');
    this.pop(GAME_WIDTH / 2, 1060, `+${timeBonus(spec)}s`, '#a5f3fc', 40);
    shockwave(this, GAME_WIDTH / 2, Y0 + BOARD / 2, 0xfef08a, 320);
    this.level++;
    this.board = generate(levelSpec(this.level));
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.timeLeft -= deltaMs / 1000;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      getServices(this).sfx.play('hit');
      flash(this, 0xef4444, 0.3, 300);
      this.finish(
        'O tempo acabou!',
        [`Tabuleiros: ${this.level - 1} · No par: ${this.perfect}`],
        { score: this.score, details: { boards: this.level - 1, perfect: this.perfect } },
        600,
      );
    }
    const b = this.board;
    this.timeBar.set(this.timeLeft);
    this.statusText.setText(`Nível ${this.level} · Toques ${b.moves}/${b.par} · Acesas ${b.lit}`);
    this.draw();
  }

  private draw(): void {
    const g = this.g.clear();
    const b = this.board;
    const cs = BOARD / b.n;
    g.fillStyle(0x020617, 1).fillRoundedRect(X0 - 14, Y0 - 14, BOARD + 28, BOARD + 28, 24);
    const glow = 0.25 + Math.sin(this.time.now / 200) * 0.08;
    for (let i = 0; i < b.cells.length; i++) {
      const x = X0 + (i % b.n) * cs;
      const y = Y0 + Math.floor(i / b.n) * cs;
      if (b.cells[i]) {
        g.fillStyle(0xfde047, glow).fillRoundedRect(x - 2, y - 2, cs + 4, cs + 4, 18);
        g.fillStyle(0xfacc15, 1).fillRoundedRect(x + 6, y + 6, cs - 12, cs - 12, 14);
        g.fillStyle(0xffffff, 0.45).fillRoundedRect(x + 14, y + 12, cs - 28, (cs - 24) / 3, 8);
      } else {
        g.fillStyle(0x1e293b, 1).fillRoundedRect(x + 6, y + 6, cs - 12, cs - 12, 14);
        g.lineStyle(2, 0x334155, 1).strokeRoundedRect(x + 6, y + 6, cs - 12, cs - 12, 14);
      }
    }
  }
}
