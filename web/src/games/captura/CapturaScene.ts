import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { BoardScene } from '@/platform/ui/boardGame';
import { burst, hint } from '@/platform/ui/juice';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { cpuMove, inAtari, N, newGame, play, TO_WIN, winner, type State } from './core';

const STEP = 96;
const X0 = (GAME_WIDTH - (N - 1) * STEP) / 2;
const Y0 = 360;
const STONE = 40;

const at = (i: number) => ({ x: X0 + (i % N) * STEP, y: Y0 + Math.floor(i / N) * STEP });

/** "Captura": surround enemy stones (Go rules, 7×7) — first to capture three wins. */
export class CapturaScene extends BoardScene {
  private s: State = newGame();
  private g!: Phaser.GameObjects.Graphics;
  private info: Phaser.GameObjects.Text | undefined;
  private last = -1;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Captura, 'captura', [0x374151, 0x111827]);
  }

  create(): void {
    this.g = this.add.graphics().setDepth(5);
    this.begin('#e5e7eb', '#111827');
    this.info = addText(this, GAME_WIDTH / 2, 236, '', 28, {
      color: '#ffffff',
      stroke: '#111827',
      strokeThickness: 6,
    }).setDepth(50);
    this.hintBox = hint(
      this,
      [
        'Cerque as pedras do robô para capturar',
        'Pedras sem saída (anel vermelho) estão em perigo',
      ],
      1130,
      5600,
    );
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => this.tap(p));
    // begin() painted before the info line existed.
    this.paint();
  }

  protected startMatch(): void {
    this.s = newGame();
    this.last = -1;
    this.say(`Nível ${this.level} · sua vez (brancas)`);
    this.paint();
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.ended || this.busy || this.s.turn !== 1) return;
    let best = -1;
    let bestD = STEP / 2;
    for (let i = 0; i < N * N; i++) {
      const c = at(i);
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0 || !play(this.s, best)) {
      if (best >= 0) getServices(this).sfx.play('locked');
      return;
    }
    this.hintBox?.dismiss();
    this.place(best);
  }

  private place(i: number): void {
    const who = this.s.turn;
    const res = play(this.s, i)!;
    this.s = res.state;
    this.last = i;
    const { sfx } = getServices(this);
    const c = at(i);
    sfx.play('pop');
    burst(this, c.x, c.y, who === 1 ? 0xffffff : 0x94a3b8, 6, { speed: 130 });
    for (const st of res.captured) {
      const q = at(st);
      burst(this, q.x, q.y, who === 1 ? 0xfde047 : 0xf472b6, 12, { speed: 220 });
    }
    if (res.captured.length > 0) {
      sfx.play('coin');
      this.pop(
        c.x,
        c.y - 30,
        who === 1 ? 'CAPTUROU!' : 'ELE CAPTUROU',
        who === 1 ? '#fde047' : '#fda4af',
        38,
      );
    }
    this.paint();
    const w = winner(this.s);
    if (w === 1) return this.win('VITÓRIA!', this.s.caps[0] * 10);
    if (w === 2)
      return this.lose('O robô capturou três pedras!', [`Suas capturas: ${this.s.caps[0]}`], {
        caps: this.s.caps[0],
      });
    if (w === 3) return this.tie();
    if (this.s.turn === 2) {
      this.say('Robô pensando…');
      this.later(560, () => this.place(cpuMove(this.s, this.level)));
    } else this.say(`Nível ${this.level} · sua vez (brancas)`);
  }

  private paint(): void {
    const g = this.g.clear();
    this.info?.setText(
      `Capturas  ·  Você ${this.s.caps[0]}/${TO_WIN}   Robô ${this.s.caps[1]}/${TO_WIN}`,
    );
    g.fillStyle(0xb45309, 1).fillRoundedRect(
      X0 - 70,
      Y0 - 70,
      (N - 1) * STEP + 140,
      (N - 1) * STEP + 140,
      24,
    );
    g.lineStyle(3, 0x431407, 0.9);
    for (let k = 0; k < N; k++) {
      g.lineBetween(X0, Y0 + k * STEP, X0 + (N - 1) * STEP, Y0 + k * STEP);
      g.lineBetween(X0 + k * STEP, Y0, X0 + k * STEP, Y0 + (N - 1) * STEP);
    }
    const danger = new Set([
      ...inAtari(this.s.board, 1).flat(),
      ...inAtari(this.s.board, 2).flat(),
    ]);
    for (let i = 0; i < N * N; i++) {
      const v = this.s.board[i]!;
      const c = at(i);
      if (v === 0) {
        g.fillStyle(0x431407, 0.5).fillCircle(c.x, c.y, 5);
        continue;
      }
      g.fillStyle(0x000000, 0.35).fillCircle(c.x + 2, c.y + 5, STONE - 4);
      g.fillStyle(v === 1 ? 0xf8fafc : 0x1f2937, 1).fillCircle(c.x, c.y, STONE - 4);
      g.fillStyle(0xffffff, v === 1 ? 0.7 : 0.18).fillCircle(c.x - 10, c.y - 10, 8);
      if (danger.has(i)) g.lineStyle(5, 0xef4444, 1).strokeCircle(c.x, c.y, STONE);
      if (i === this.last) g.lineStyle(4, 0xfde047, 1).strokeCircle(c.x, c.y, STONE - 12);
    }
  }
}
