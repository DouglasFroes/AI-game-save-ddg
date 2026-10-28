import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { ambient, banner, burst, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  applyMove,
  BOARD_SIZE,
  chooseAiMove,
  countDiscs,
  createInitialBoard,
  validMoves,
  type Disc,
} from './core';

const CELL = 76;
const BOARD_W = BOARD_SIZE * CELL;
const X0 = (GAME_WIDTH - BOARD_W) / 2;
const Y0 = 290;

export class ReversiScene extends MiniScene {
  private board: Disc[][] = createInitialBoard();
  private g!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private countText!: Phaser.GameObjects.Text;
  private turn: 1 | 2 = 1;
  private score = 0;
  private wins = 0;
  private totalDiscs = 0;
  private busy = false;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Reversi, 'reversi', [0x064e3b, 0x022c22]);
  }

  create(): void {
    this.board = createInitialBoard();
    this.turn = 1;
    this.score = 0;
    this.wins = 0;
    this.totalDiscs = 0;
    this.busy = false;
    this.frame('0');
    ambient(this, 0x6ee7b7, 18);

    this.statusText = addText(this, GAME_WIDTH / 2, 175, 'Sua vez (Peças Brancas)', 30, {
      color: '#a7f3d0',
      stroke: '#022c22',
      strokeThickness: 6,
    }).setDepth(50);

    this.countText = addText(this, GAME_WIDTH / 2, 232, '', 28, {
      color: '#ffffff',
      stroke: '#022c22',
      strokeThickness: 6,
    }).setDepth(50);

    this.g = this.add.graphics().setDepth(5);

    new Button(this, GAME_WIDTH / 2, 1185, '↺ Nova Partida', () => this.resetBoard(), {
      width: 340,
      height: 88,
      fontSize: 30,
      color: 0x10b981,
      shade: 0x047857,
    }).setDepth(50);

    this.hintBox = hint(
      this,
      ['Toque nos círculos marcados para cercar', 'e virar as peças do robô!'],
      1085,
      4200,
    );

    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      if (this.ended || this.busy || this.turn !== 1) return;
      const c = Math.floor((p.x - X0) / CELL);
      const r = Math.floor((p.y - Y0) / CELL);
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return;
      this.playHuman(r, c);
    });

    this.redraw();
  }

  private resetBoard(): void {
    if (this.ended || this.busy) return;
    getServices(this).sfx.play('click');
    this.board = createInitialBoard();
    this.turn = 1;
    this.statusText.setText('Sua vez (Peças Brancas)');
    this.redraw();
  }

  private playHuman(r: number, c: number): void {
    const res = applyMove(this.board, r, c, 1);
    if (!res) {
      getServices(this).sfx.play('locked');
      return;
    }
    this.hintBox?.dismiss();
    this.board = res.board;
    const { sfx } = getServices(this);
    sfx.play('pop');
    const px = this.cellCenter(r, c);
    burst(this, px.x, px.y, 0x38e1ff, 12);
    for (const f of res.flipped) {
      const fp = this.cellCenter(f.r, f.c);
      burst(this, fp.x, fp.y, 0xa7f3d0, 6, { speed: 160, size: 5 });
    }
    const pts = res.flipped.length * 25 + (this.isCorner(r, c) ? 150 : 0);
    this.score += pts;
    this.setScore(this.score);
    this.pop(px.x, px.y, `+${pts}`, '#6ee7b7', 38);

    this.advanceTurn(2);
  }

  private advanceTurn(next: 1 | 2): void {
    const nextMoves = validMoves(this.board, next);
    const other: 1 | 2 = next === 1 ? 2 : 1;
    const otherMoves = validMoves(this.board, other);

    if (nextMoves.length === 0 && otherMoves.length === 0) {
      this.redraw();
      this.endMatch();
      return;
    }

    if (nextMoves.length === 0) {
      this.turn = other;
      banner(this, next === 1 ? 'SEM JOGADAS!' : 'ROBÔ PASSOU!', '#fde047');
      this.redraw();
      if (this.turn === 2) this.scheduleAi();
      else this.statusText.setText('Sua vez (Peças Brancas)');
      return;
    }

    this.turn = next;
    this.redraw();
    if (next === 2) {
      this.statusText.setText('Robô pensando…');
      this.scheduleAi();
    } else {
      this.statusText.setText('Sua vez (Peças Brancas)');
    }
  }

  private scheduleAi(): void {
    this.busy = true;
    this.time.delayedCall(460, () => {
      if (this.ended) return;
      const move = chooseAiMove(this.board, this.wins + 1);
      this.busy = false;
      if (!move) {
        this.advanceTurn(1);
        return;
      }
      const res = applyMove(this.board, move.pos.r, move.pos.c, 2);
      if (res) {
        this.board = res.board;
        getServices(this).sfx.play('tick');
        const px = this.cellCenter(move.pos.r, move.pos.c);
        burst(this, px.x, px.y, 0xf43f5e, 10, { speed: 180 });
      }
      this.advanceTurn(1);
    });
  }

  private endMatch(): void {
    const { p1, p2 } = countDiscs(this.board);
    const { sfx } = getServices(this);
    if (p1 > p2) {
      this.wins++;
      this.totalDiscs += p1;
      const bonus = 500 + (p1 - p2) * 35;
      this.score += bonus;
      this.setScore(this.score);
      sfx.play('win');
      banner(this, `VITÓRIA! ${p1}×${p2}`, '#6ee7b7');
      shockwave(this, GAME_WIDTH / 2, Y0 + BOARD_W / 2, 0x34d399, 180);
      this.busy = true;
      this.time.delayedCall(1500, () => {
        if (this.ended) return;
        this.board = createInitialBoard();
        this.turn = 1;
        this.busy = false;
        this.statusText.setText(`Rodada ${this.wins + 1} · Sua vez`);
        this.redraw();
      });
    } else {
      this.totalDiscs += p1;
      const title = p1 === p2 ? `Empate ${p1}×${p2}!` : `Fim de jogo (${p1}×${p2})`;
      this.finish(
        title,
        [`Vitórias seguidas: ${this.wins}`, `Peças conquistadas: ${this.totalDiscs}`],
        {
          score: this.score,
          details: { wins: this.wins, discs: this.totalDiscs },
        },
      );
    }
  }

  private isCorner(r: number, c: number): boolean {
    return (r === 0 || r === BOARD_SIZE - 1) && (c === 0 || c === BOARD_SIZE - 1);
  }

  private cellCenter(r: number, c: number): { x: number; y: number } {
    return { x: X0 + c * CELL + CELL / 2, y: Y0 + r * CELL + CELL / 2 };
  }

  private redraw(): void {
    const g = this.g.clear();
    const { p1, p2 } = countDiscs(this.board);
    this.countText.setText(`⚪ Você: ${p1}   ·   🔴 Robô: ${p2}   ·   🏆 Vitórias: ${this.wins}`);

    g.fillStyle(0x022c22, 0.95).fillRoundedRect(X0 - 14, Y0 - 14, BOARD_W + 28, BOARD_W + 28, 24);
    g.lineStyle(3, 0x34d399, 0.5).strokeRoundedRect(
      X0 - 14,
      Y0 - 14,
      BOARD_W + 28,
      BOARD_W + 28,
      24,
    );

    const legal = this.turn === 1 ? validMoves(this.board, 1) : [];
    const legalSet = new Set(legal.map((m) => `${m.r},${m.c}`));

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const x = X0 + c * CELL;
        const y = Y0 + r * CELL;
        const dark = (r + c) % 2 === 1;
        g.fillStyle(dark ? 0x065f46 : 0x047857).fillRoundedRect(
          x + 3,
          y + 3,
          CELL - 6,
          CELL - 6,
          12,
        );

        const cell = this.board[r]![c]!;
        const cx = x + CELL / 2;
        const cy = y + CELL / 2;
        if (cell === 1) {
          g.fillStyle(0x000000, 0.35).fillCircle(cx, cy + 4, 28);
          g.fillStyle(0xf8fafc).fillCircle(cx, cy, 28);
          g.lineStyle(3, 0x38bdf8).strokeCircle(cx, cy, 28);
          g.fillStyle(0xffffff, 0.6).fillCircle(cx - 8, cy - 8, 8);
        } else if (cell === 2) {
          g.fillStyle(0x000000, 0.35).fillCircle(cx, cy + 4, 28);
          g.fillStyle(0xe11d48).fillCircle(cx, cy, 28);
          g.lineStyle(3, 0xfda4af).strokeCircle(cx, cy, 28);
          g.fillStyle(0xffffff, 0.25).fillCircle(cx - 8, cy - 8, 7);
        } else if (legalSet.has(`${r},${c}`)) {
          g.fillStyle(0x6ee7b7, 0.32).fillCircle(cx, cy, 12);
          g.lineStyle(2, 0xa7f3d0, 0.85).strokeCircle(cx, cy, 12);
        }
      }
    }
  }
}
