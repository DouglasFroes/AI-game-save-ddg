import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { FlowBoard, generate, levelSpec, type Cell } from './core';

const BOARD = 640;
const X0 = (GAME_WIDTH - BOARD) / 2;
const Y0 = 300;
const COLORS = [
  0xef4444, 0x3b82f6, 0x22c55e, 0xfacc15, 0xf97316, 0x06b6d4, 0xd946ef, 0xa3e635, 0xffffff,
  0x8b5cf6,
];

/** "Liga Pontos": link the pairs of dots before time runs out; filling the board is a bonus. */
export class LigaPontosScene extends MiniScene {
  private board!: FlowBoard;
  private level = 1;
  private timeLeft = 0;
  private score = 0;
  private perfect = 0;
  private drawing = -1;
  private g!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private hintBox?: { dismiss: () => void };
  private lastConnected = 0;

  constructor() {
    super(SceneKeys.LigaPontos, 'ligapontos', [0x082f49, 0x0b1430]);
  }

  create(): void {
    this.level = 1;
    this.score = 0;
    this.perfect = 0;
    this.drawing = -1;
    this.frame('0');
    this.statusText = addText(this, GAME_WIDTH / 2, 170, '', 30, {
      color: '#a5f3fc',
      stroke: '#082f49',
      strokeThickness: 6,
    }).setDepth(50);
    this.g = this.add.graphics().setDepth(5);
    this.loadLevel();
    this.hintBox = hint(
      this,
      ['Ligue cada par de pontos da mesma cor', 'sem cruzar os caminhos!'],
      1120,
      4500,
    );

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.ended) return;
      const cell = this.cellAt(p.x, p.y);
      if (cell === null) return;
      this.hintBox?.dismiss();
      this.drawing = this.board.begin(cell);
      if (this.drawing >= 0) getServices(this).sfx.play('click');
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.drawing < 0 || !p.isDown) return;
      const cell = this.cellAt(p.x, p.y);
      if (cell === null) return;
      if (this.board.extend(this.drawing, cell)) {
        getServices(this).sfx.play('draw');
        this.checkProgress();
      }
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => {
      this.drawing = -1;
    });
  }

  private loadLevel(): void {
    const spec = levelSpec(this.level);
    this.board = new FlowBoard(generate(spec.size, spec.colors));
    this.timeLeft = spec.time;
    this.lastConnected = 0;
  }

  private get cell(): number {
    return BOARD / this.board.size;
  }

  private cellAt(x: number, y: number): Cell | null {
    const c = Math.floor((x - X0) / this.cell);
    const r = Math.floor((y - Y0) / this.cell);
    const n = this.board.size;
    return r < 0 || c < 0 || r >= n || c >= n ? null : r * n + c;
  }

  private center(cell: Cell): [number, number] {
    const n = this.board.size;
    return [X0 + ((cell % n) + 0.5) * this.cell, Y0 + (Math.floor(cell / n) + 0.5) * this.cell];
  }

  private checkProgress(): void {
    const { sfx } = getServices(this);
    const linked = this.board.puzzle.pairs.filter((_, i) => this.board.connected(i)).length;
    if (linked > this.lastConnected) {
      const color = this.drawing;
      sfx.play('pop', linked);
      if (color >= 0) {
        const [x, y] = this.center(this.board.paths[color]!.at(-1)!);
        burst(this, x, y, COLORS[color]!, 12, { speed: 220 });
      }
    }
    this.lastConnected = linked;
    if (!this.board.solved) return;
    const full = this.board.fill >= 1;
    const n = this.board.size;
    const points = n * n * 10 + Math.ceil(this.timeLeft) * 10 + (full ? 300 : 0);
    this.score += points;
    if (full) this.perfect++;
    this.setScore(this.score);
    sfx.play('win');
    sfx.vibrate([30, 30, 60]);
    banner(this, full ? 'TABULEIRO CHEIO!' : `+${points}`, full ? '#fde047' : '#86efac');
    shockwave(this, GAME_WIDTH / 2, Y0 + BOARD / 2, 0x22d3ee, 300);
    this.drawing = -1;
    this.level++;
    this.loadLevel();
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
        [`Desenhos: ${this.level - 1} · Tabuleiros cheios: ${this.perfect}`],
        { score: this.score, details: { levels: this.level - 1, perfect: this.perfect } },
        700,
      );
    }
    const spec = levelSpec(this.level);
    this.statusText.setText(
      `Nível ${this.level} · ${spec.size}×${spec.size} · Preenchido ${Math.round(this.board.fill * 100)}%`,
    );
    this.draw(spec.time);
  }

  private draw(total: number): void {
    const g = this.g.clear();
    const n = this.board.size;
    const cs = this.cell;
    // Timer bar.
    const frac = Math.max(0, this.timeLeft / total);
    g.fillStyle(0x0f172a, 1).fillRoundedRect(X0, 225, BOARD, 22, 11);
    g.fillStyle(frac < 0.25 ? 0xef4444 : 0x22d3ee, 1).fillRoundedRect(
      X0,
      225,
      BOARD * frac,
      22,
      11,
    );

    g.fillStyle(0x020617, 1).fillRoundedRect(X0 - 10, Y0 - 10, BOARD + 20, BOARD + 20, 18);
    // Filled cells get a soft tint of their path.
    this.board.paths.forEach((p, i) => {
      for (const cell of p) {
        const [x, y] = this.center(cell);
        g.fillStyle(COLORS[i]!, 0.18).fillRect(x - cs / 2, y - cs / 2, cs, cs);
      }
    });
    g.lineStyle(2, 0x334155, 1);
    for (let i = 0; i <= n; i++) {
      g.lineBetween(X0 + i * cs, Y0, X0 + i * cs, Y0 + BOARD);
      g.lineBetween(X0, Y0 + i * cs, X0 + BOARD, Y0 + i * cs);
    }
    // Paths.
    this.board.paths.forEach((p, i) => {
      if (p.length < 2) return;
      g.lineStyle(cs * 0.34, COLORS[i]!, 1);
      g.beginPath();
      const [sx, sy] = this.center(p[0]!);
      g.moveTo(sx, sy);
      for (const cell of p.slice(1)) {
        const [x, y] = this.center(cell);
        g.lineTo(x, y);
      }
      g.strokePath();
      for (const cell of p) {
        const [x, y] = this.center(cell);
        g.fillStyle(COLORS[i]!, 1).fillCircle(x, y, cs * 0.17);
      }
    });
    // Dots.
    this.board.puzzle.pairs.forEach(([a, b], i) => {
      const done = this.board.connected(i);
      for (const cell of [a, b]) {
        const [x, y] = this.center(cell);
        if (done) g.fillStyle(COLORS[i]!, 0.35).fillCircle(x, y, cs * 0.46);
        g.fillStyle(COLORS[i]!, 1).fillCircle(x, y, cs * 0.34);
        g.lineStyle(3, 0x000000, 0.25).strokeCircle(x, y, cs * 0.34);
      }
    });
  }
}
