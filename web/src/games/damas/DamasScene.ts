import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { canvasTexture } from '@/platform/art/textures';
import { burst, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { drawChecker } from './art';
import {
  Checkers,
  chooseMove,
  col,
  isDark,
  N,
  robotLevel,
  row,
  sideOf,
  winPoints,
  type Move,
} from './core';

const CELL = 80;
const OX = (GAME_WIDTH - N * CELL) / 2;
const OY = 350;
const px = (i: number) => OX + col(i) * CELL + CELL / 2;
const py = (i: number) => OY + row(i) * CELL + CELL / 2;
const HOP_MS = 170;
const PIECE = (cell: number) => `damas-piece-${cell}`;

/** "Damas": Brazilian draughts against the robot; every win makes it sharper. */
export class DamasScene extends MiniScene {
  private g = new Checkers();
  private wins = 0;
  private points = 0;
  private round = 0;
  private busy = false;
  private selected: number | null = null;
  private legal: Move[] = [];
  private last: readonly number[] = [];
  private sprites = new Map<number, Phaser.GameObjects.Image>();
  private marks!: Phaser.GameObjects.Graphics;
  private status!: Phaser.GameObjects.Text;
  private mine!: Phaser.GameObjects.Text;
  private theirs!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Damas, 'damas', [0x2b1608, 0x6b3b17]);
  }

  create(): void {
    this.wins = 0;
    this.points = 0;
    this.round = 0;
    this.busy = false;
    this.selected = null;
    this.legal = [];
    this.sprites = new Map();
    this.makeTextures();
    this.frame();
    this.status = addText(this, GAME_WIDTH / 2, 252, '', 40, {
      color: '#ffffff',
      stroke: '#2b1608',
      strokeThickness: 8,
    });
    this.drawBoard();
    this.marks = this.add.graphics().setDepth(2);
    this.buildFooter();
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.tap(p));
    this.newRound();
  }

  private makeTextures(): void {
    const look: Record<number, [string, string, boolean]> = {
      1: ['#ff8f7e', '#b3131f', false],
      2: ['#6b7384', '#0d111c', false],
      3: ['#ff8f7e', '#b3131f', true],
      4: ['#6b7384', '#0d111c', true],
    };
    for (const [cell, [light, dark, crown]] of Object.entries(look)) {
      canvasTexture(this, PIECE(Number(cell)), 88, 88, (ctx) =>
        drawChecker(ctx, 44, 42, 33, light, dark, crown),
      );
    }
  }

  private drawBoard(): void {
    const g = this.add.graphics().setDepth(0);
    const size = N * CELL;
    g.fillStyle(0x000000, 0.35).fillRoundedRect(OX - 6, OY - 2, size + 24, size + 28, 24);
    g.fillStyle(0x3d1f0a).fillRoundedRect(OX - 18, OY - 18, size + 36, size + 36, 22);
    g.fillStyle(0x6b3b17).fillRoundedRect(OX - 12, OY - 12, size + 24, size + 24, 18);
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const dark = isDark(r, c);
        g.fillStyle(dark ? 0x7a431b : 0xf0d9ac).fillRect(OX + c * CELL, OY + r * CELL, CELL, CELL);
        if (dark) g.fillStyle(0x000000, 0.18).fillRect(OX + c * CELL, OY + r * CELL, CELL, 5);
      }
    }
    g.lineStyle(3, 0x2b1608, 0.6).strokeRect(OX, OY, size, size);
  }

  private buildFooter(): void {
    const y = OY + N * CELL + 70;
    this.add.image(GAME_WIDTH / 2 - 190, y, PIECE(1)).setScale(0.8);
    this.add.image(GAME_WIDTH / 2 + 110, y, PIECE(2)).setScale(0.8);
    const count = (x: number) =>
      addText(this, x, y, '12', 44, {
        color: '#ffffff',
        stroke: '#2b1608',
        strokeThickness: 8,
      }).setOrigin(0, 0.5);
    this.mine = count(GAME_WIDTH / 2 - 130);
    this.theirs = count(GAME_WIDTH / 2 + 170);
    addText(
      this,
      GAME_WIDTH / 2,
      y + 74,
      'Capturar é obrigatório · chegue ao fundo para virar dama',
      22,
      { color: '#e9c897', weight: 'normal' },
    );
  }

  // ---------------------------------------------------------------- flow

  private newRound(): void {
    this.g = new Checkers(this.round % 2 === 0 ? 1 : 2);
    this.round++;
    this.busy = false;
    this.selected = null;
    this.legal = [];
    this.last = [];
    this.sync();
    this.afterMove(false);
  }

  /** Rebuilds the piece sprites from the position. */
  private sync(): void {
    for (const s of this.sprites.values()) s.destroy();
    this.sprites.clear();
    this.g.cells.forEach((c, i) => {
      if (c === 0) return;
      this.sprites.set(i, this.add.image(px(i), py(i), PIECE(c)).setDepth(3));
    });
    this.mine.setText(String(this.g.count(1)));
    this.theirs.setText(String(this.g.count(2)));
    this.paintMarks();
  }

  private paintMarks(): void {
    const m = this.marks.clear();
    for (const i of this.last) {
      m.fillStyle(0xfde047, 0.28).fillRect(OX + col(i) * CELL, OY + row(i) * CELL, CELL, CELL);
    }
    if (this.g.turn !== 1 || this.busy) return;
    // When a capture is forced, the pieces that can make it are ringed so the rule is never a surprise.
    const forced = this.legal.length > 0 && this.legal[0]!.captured.length > 0;
    if (forced) {
      for (const i of new Set(this.legal.map((x) => x.from))) {
        m.lineStyle(4, 0xfb7185, 0.9).strokeCircle(px(i), py(i), 36);
      }
    }
    if (this.selected === null) return;
    const s = this.selected;
    m.fillStyle(0x34d399, 0.35).fillRect(OX + col(s) * CELL, OY + row(s) * CELL, CELL, CELL);
    m.lineStyle(5, 0x34d399, 1).strokeCircle(px(s), py(s), 38);
    for (const mv of this.legal) {
      if (mv.from !== s) continue;
      m.fillStyle(0x34d399, 0.9).fillCircle(px(mv.to), py(mv.to), 12);
      m.lineStyle(3, 0xffffff, 0.9).strokeCircle(px(mv.to), py(mv.to), 12);
    }
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.ended || this.busy || this.g.turn !== 1) return;
    const c = Math.floor((p.x - OX) / CELL);
    const r = Math.floor((p.y - OY) / CELL);
    if (c < 0 || c >= N || r < 0 || r >= N) return;
    const i = r * N + c;
    const move =
      this.selected === null
        ? null
        : this.legal.find((m) => m.from === this.selected && m.to === i);
    if (move) {
      this.selected = null;
      this.play(move);
      return;
    }
    if (sideOf(this.g.cells[i]!) === 1 && this.legal.some((m) => m.from === i)) {
      this.selected = i;
      getServices(this).sfx.play('click');
    } else this.selected = null;
    this.paintMarks();
  }

  /** Hops the piece along the path, then applies the move. */
  private play(move: Move): void {
    this.busy = true;
    const sprite = this.sprites.get(move.from);
    this.last = [move.from, move.to];
    this.paintMarks();
    const { sfx } = getServices(this);
    const hop = (k: number): void => {
      if (k >= move.path.length || !sprite) {
        for (const s of move.captured) {
          burst(this, px(s), py(s), 0xfde047, 12);
          this.sprites.get(s)?.destroy();
        }
        if (move.captured.length > 0) {
          shockwave(this, px(move.to), py(move.to), 0xfde047, 70);
          sfx.play('hit');
        }
        this.g.apply(move);
        this.busy = false;
        this.sync();
        this.afterMove(true);
        return;
      }
      sprite.setDepth(10);
      const to = move.path[k]!;
      sfx.play(move.captured.length > 0 ? 'pop' : 'click', k);
      this.tweens.add({
        targets: sprite,
        x: px(to),
        y: py(to),
        duration: HOP_MS,
        ease: 'Sine.easeInOut',
        onComplete: () => hop(k + 1),
      });
    };
    hop(1);
  }

  private afterMove(played: boolean): void {
    const g = this.g;
    const out = g.outcome();
    if (out === 1) {
      this.wins++;
      this.points += winPoints(this.wins - 1, g.count(1), g.count(2));
      this.setScore(this.points);
      this.pop(GAME_WIDTH / 2, 300, 'Você venceu!', '#ffe066');
      getServices(this).sfx.play('win');
      burst(this, GAME_WIDTH / 2, OY + 300, 0xfde047, 30, { speed: 520 });
      this.busy = true;
      this.time.delayedCall(1700, () => this.newRound());
      return;
    }
    if (out === 2) {
      this.finish('O robô venceu!', [`Vitórias: ${this.wins}`], {
        score: this.points,
        details: { wins: this.wins },
      });
      return;
    }
    if (out === 3) {
      this.pop(GAME_WIDTH / 2, 300, 'Empate!');
      this.busy = true;
      this.time.delayedCall(1400, () => this.newRound());
      return;
    }
    if (g.turn === 1) {
      this.legal = g.moves();
      const forced = this.legal[0]?.captured.length;
      this.status.setText(forced ? 'Capture! É obrigatório' : played ? 'Sua vez' : 'Você começa');
      this.paintMarks();
    } else {
      this.legal = [];
      this.status.setText('O robô está pensando…');
      this.busy = true;
      this.time.delayedCall(played ? 550 : 800, () => this.robotMove());
    }
  }

  private robotMove(): void {
    if (this.ended) return;
    const move = chooseMove(this.g, robotLevel(this.wins), Math.random);
    this.busy = false;
    this.play(move);
  }
}
