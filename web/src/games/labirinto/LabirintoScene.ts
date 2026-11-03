import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText, TimeBar } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { Maze, sizeFor, timeFor, WALL, type Dir } from './core';

const BOARD = 640;
const X0 = (GAME_WIDTH - BOARD) / 2;
const Y0 = 300;

/** "Labirinto no Escuro": swipe through the dark maze to the exit before time runs out. */
export class LabirintoScene extends MiniScene {
  private maze = new Maze(7);
  private level = 1;
  private score = 0;
  private coins = 0;
  private timeBar!: TimeBar;
  private timeLeft = 0;
  private trail: number[] = [];
  private shown = { x: 0, y: 0 };
  private swipe: { x: number; y: number } | null = null;
  private g!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Labirinto, 'labirinto', [0x020617, 0x111827]);
  }

  create(): void {
    this.level = 1;
    this.score = 0;
    this.coins = 0;
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.statusText = addText(this, GAME_WIDTH / 2, 170, '', 30, {
      color: '#e9d5ff',
      stroke: '#020617',
      strokeThickness: 6,
    }).setDepth(50);
    this.timeBar = new TimeBar(this, 214);
    this.newMaze();
    this.hintBox = hint(
      this,
      ['Deslize para correr pelos corredores', 'Ache a saída verde no escuro!'],
      1100,
      4500,
    );
    this.input.on(
      Phaser.Input.Events.POINTER_DOWN,
      (p: Phaser.Input.Pointer) => (this.swipe = { x: p.x, y: p.y }),
    );
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      const s = this.swipe;
      this.swipe = null;
      if (!s || this.ended) return;
      const dx = p.x - s.x;
      const dy = p.y - s.y;
      if (Math.hypot(dx, dy) < 24) return;
      this.go(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N');
    });
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      const map: Record<string, Dir> = {
        ArrowUp: 'N',
        ArrowRight: 'E',
        ArrowDown: 'S',
        ArrowLeft: 'W',
      };
      const d = map[e.key];
      if (d && !this.ended) this.go(d);
    });
  }

  private newMaze(): void {
    this.maze = new Maze(sizeFor(this.level));
    this.timeLeft = timeFor(this.maze.size);
    this.timeBar?.reset(this.timeLeft);
    this.trail = [0];
    const p = this.center(0);
    this.shown = { x: p[0], y: p[1] };
  }

  private get cs(): number {
    return BOARD / this.maze.size;
  }

  private center(cell: number): [number, number] {
    const n = this.maze.size;
    return [X0 + ((cell % n) + 0.5) * this.cs, Y0 + (Math.floor(cell / n) + 0.5) * this.cs];
  }

  private go(d: Dir): void {
    this.hintBox?.dismiss();
    const { sfx } = getServices(this);
    const res = this.maze.move(d);
    if (!res.cells.length) {
      sfx.play('locked');
      return;
    }
    sfx.play('tick');
    this.trail.push(...res.cells);
    if (res.coins) {
      this.coins += res.coins;
      this.score += res.coins * 25;
      this.timeLeft += res.coins * 2;
      sfx.play('coin');
      const [x, y] = this.center(this.maze.pos);
      this.pop(x, y - 30, `+${res.coins * 25}`, '#fde047', 30);
    }
    if (res.exit) {
      const pts = this.maze.size * 30 + Math.ceil(this.timeLeft) * 8;
      this.score += pts;
      sfx.play('win');
      sfx.vibrate([30, 30, 60]);
      banner(this, `SAÍDA! +${pts}`, '#86efac');
      const [x, y] = this.center(this.maze.exit);
      shockwave(this, x, y, 0x22c55e, 200);
      burst(this, x, y, 0x86efac, 26, { speed: 380 });
      this.level++;
      this.newMaze();
    }
    this.setScore(this.score);
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.timeLeft -= deltaMs / 1000;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      getServices(this).sfx.play('hit');
      flash(this, 0xef4444, 0.3, 300);
      this.finish(
        'Perdido no escuro!',
        [`Labirintos: ${this.level - 1} · Moedas: ${this.coins}`],
        { score: this.score, details: { mazes: this.level - 1, coins: this.coins } },
        600,
      );
    }
    this.timeBar.set(this.timeLeft);
    this.statusText.setText(`Labirinto ${this.level} · ${this.maze.size}×${this.maze.size} · `);
    // The marker glides along the corridor it just ran.
    const [tx, ty] = this.center(this.maze.pos);
    const k = Math.min(1, (deltaMs / 1000) * 14);
    this.shown.x += (tx - this.shown.x) * k;
    this.shown.y += (ty - this.shown.y) * k;
    this.draw();
  }

  private draw(): void {
    const g = this.g.clear();
    const m = this.maze;
    const n = m.size;
    const cs = this.cs;
    g.fillStyle(0x000000, 1).fillRoundedRect(X0 - 10, Y0 - 10, BOARD + 20, BOARD + 20, 16);
    const near = (cell: number) => {
      const [x, y] = this.center(cell);
      return Math.hypot(x - this.shown.x, y - this.shown.y) < cs * 2.2;
    };
    for (let i = 0; i < n * n; i++) {
      if (!m.seen.has(i)) continue;
      const x = X0 + (i % n) * cs;
      const y = Y0 + Math.floor(i / n) * cs;
      const lit = near(i);
      g.fillStyle(lit ? 0x312e81 : 0x1e1b4b, lit ? 1 : 0.55).fillRect(x, y, cs, cs);
      g.lineStyle(Math.max(3, cs * 0.12), lit ? 0xc4b5fd : 0x4c1d95, 1);
      const w = m.walls[i]!;
      if (w & WALL.N) g.lineBetween(x, y, x + cs, y);
      if (w & WALL.S) g.lineBetween(x, y + cs, x + cs, y + cs);
      if (w & WALL.W) g.lineBetween(x, y, x, y + cs);
      if (w & WALL.E) g.lineBetween(x + cs, y, x + cs, y + cs);
      if (m.coins.has(i)) g.fillStyle(0xfacc15, 1).fillCircle(x + cs / 2, y + cs / 2, cs * 0.18);
    }
    // The exit glows faintly even in the dark, once seen.
    const [ex, ey] = this.center(m.exit);
    if (m.seen.has(m.exit))
      g.fillStyle(0x22c55e, 1).fillRoundedRect(
        ex - cs * 0.35,
        ey - cs * 0.35,
        cs * 0.7,
        cs * 0.7,
        6,
      );
    else
      g.fillStyle(0x22c55e, 0.25 + Math.sin(this.time.now / 300) * 0.1).fillCircle(
        ex,
        ey,
        cs * 0.25,
      );
    g.fillStyle(0xf472b6, 0.25).fillCircle(this.shown.x, this.shown.y, cs * 0.6);
    g.fillStyle(0xffffff, 1).fillCircle(this.shown.x, this.shown.y, cs * 0.28);
  }
}
