import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { BoardScene } from '@/platform/ui/boardGame';
import { burst, hint } from '@/platform/ui/juice';
import { getServices } from '@/services';
import { cpuMove, N, newBoard, place, winner, type Cell } from './core';

const R = 36;
const W = Math.sqrt(3) * R;
const X0 = (GAME_WIDTH - (N * W + (N - 1) * (W / 2))) / 2 + W / 2;
const Y0 = 400;

const center = (i: number) => {
  const r = Math.floor(i / N);
  const c = i % N;
  return { x: X0 + c * W + r * (W / 2), y: Y0 + r * R * 1.5 };
};

const CYAN = 0x38bdf8;
const PINK = 0xf472b6;

/** "Hex": join your two edges (top and bottom) before the CPU joins left and right. */
export class HexScene extends BoardScene {
  private board: Cell[] = newBoard();
  private g!: Phaser.GameObjects.Graphics;
  private last = -1;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Hex, 'hex', [0x0e7490, 0x082f49]);
  }

  create(): void {
    this.g = this.add.graphics().setDepth(5);
    this.begin('#a5f3fc', '#082f49');
    this.hintBox = hint(
      this,
      ['Ligue o topo ao fundo (azul)', 'antes que o robô ligue os lados (rosa)'],
      1010,
      5200,
    );
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => this.tap(p));
  }

  protected startMatch(): void {
    this.board = newBoard();
    this.last = -1;
    this.say(`Nível ${this.level} · sua vez`);
    this.paint();
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.ended || this.busy) return;
    let best = -1;
    let bestD = R * 0.95;
    for (let i = 0; i < N * N; i++) {
      const c = center(i);
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) return;
    const next = place(this.board, best, 1);
    if (!next) {
      getServices(this).sfx.play('locked');
      return;
    }
    this.hintBox?.dismiss();
    this.board = next;
    this.last = best;
    getServices(this).sfx.play('pop');
    const c = center(best);
    burst(this, c.x, c.y, CYAN, 8, { speed: 150 });
    this.paint();
    if (winner(this.board) === 1) return this.win('LIGOU!', 100);
    this.say('Robô pensando…');
    this.later(520, () => this.cpuTurn());
  }

  private cpuTurn(): void {
    const i = cpuMove(this.board, 2, this.level);
    this.board = place(this.board, i, 2)!;
    this.last = i;
    getServices(this).sfx.play('tick');
    const c = center(i);
    burst(this, c.x, c.y, PINK, 8, { speed: 150 });
    this.paint();
    if (winner(this.board) === 2) return this.lose('O robô ligou os lados!');
    this.say(`Nível ${this.level} · sua vez`);
  }

  private hexPoints(x: number, y: number, r: number): Phaser.Types.Math.Vector2Like[] {
    return Array.from({ length: 6 }, (_, k) => {
      const a = Math.PI / 6 + (k * Math.PI) / 3;
      return { x: x + r * Math.cos(a), y: y + r * Math.sin(a) };
    });
  }

  private paint(): void {
    const g = this.g.clear();
    // Edge bars: blue on top and bottom, pink on the sides.
    const tl = center(0);
    const tr = center(N - 1);
    const bl = center((N - 1) * N);
    const br = center(N * N - 1);
    g.lineStyle(14, CYAN, 0.9);
    g.lineBetween(tl.x - W / 2, tl.y - R - 6, tr.x + W / 2, tr.y - R - 6);
    g.lineBetween(bl.x - W / 2, bl.y + R + 6, br.x + W / 2, br.y + R + 6);
    g.lineStyle(14, PINK, 0.9);
    g.lineBetween(tl.x - W / 2 - 8, tl.y - R, bl.x - W / 2 - 8, bl.y + R);
    g.lineBetween(tr.x + W / 2 + 8, tr.y - R, br.x + W / 2 + 8, br.y + R);
    for (let i = 0; i < N * N; i++) {
      const c = center(i);
      const pts = this.hexPoints(c.x, c.y, R - 2);
      g.fillStyle(0x0b3a52, 1).fillPoints(pts, true);
      g.lineStyle(3, 0x67e8f9, 0.35).strokePoints(pts, true);
      const v = this.board[i]!;
      if (v !== 0) {
        g.fillStyle(0x000000, 0.35).fillCircle(c.x, c.y + 4, R - 9);
        g.fillStyle(v === 1 ? CYAN : PINK, 1).fillCircle(c.x, c.y, R - 9);
        g.fillStyle(0xffffff, 0.45).fillCircle(c.x - 8, c.y - 8, 7);
        if (i === this.last) g.lineStyle(4, 0xffffff, 1).strokeCircle(c.x, c.y, R - 5);
      }
    }
  }
}
