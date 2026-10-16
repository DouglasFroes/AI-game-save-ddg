import type Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { heartsLabel, MiniScene } from '@/platform/ui/miniGame';
import { bindSwipe } from '@/platform/ui/swipe';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { COLS, MazeSim, posOf, ROWS, type Ghost, type MazeEvent } from './core';

const TILE = 44;
const OX = (GAME_WIDTH - COLS * TILE) / 2;
const OY = 270;
const GHOST_COLORS = [0xff4d4d, 0xff8fd8, 0x35e0ff, 0xffa62b];
const px = (x: number) => OX + (x + 0.5) * TILE;
const py = (y: number) => OY + (y + 0.5) * TILE;

/** "Come-Come": swipe to steer through a new maze every level. */
export class ComeComeScene extends MiniScene {
  private sim = new MazeSim();
  private maze!: Phaser.GameObjects.Graphics;
  private g!: Phaser.GameObjects.Graphics;
  private hearts!: Phaser.GameObjects.Text;
  private hint?: Phaser.GameObjects.Text;
  private face = { dx: 1, dy: 0 };
  private clock = 0;

  constructor() {
    super(SceneKeys.ComeCome, 'comecome', [0x050a30, 0x000c66]);
  }

  create(): void {
    this.sim = new MazeSim();
    this.face = { dx: 1, dy: 0 };
    this.frame();
    this.maze = this.add.graphics();
    this.g = this.add.graphics().setDepth(2);
    this.hearts = addText(this, GAME_WIDTH / 2, 195, heartsLabel(3), 40);
    this.hint = addText(this, GAME_WIDTH / 2, 1110, 'Deslize para começar', 38, {
      color: '#ffffff',
      stroke: '#0b1430',
    });
    this.buildMaze();
    bindSwipe(
      this,
      (d) => {
        if (this.ended) return;
        this.hint?.destroy();
        this.hint = undefined;
        const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[d] as [
          number,
          number,
        ];
        this.sim.setWant(v[0], v[1]);
        this.face = { dx: v[0], dy: v[1] };
      },
      140,
    );
  }

  private buildMaze(): void {
    const g = this.maze.clear();
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        if (!this.sim.walls[y * COLS + x]) continue;
        g.fillStyle(0x2540ff).fillRoundedRect(OX + x * TILE, OY + y * TILE, TILE, TILE, 8);
        g.fillStyle(0x060b46).fillRoundedRect(
          OX + x * TILE + 5,
          OY + y * TILE + 5,
          TILE - 10,
          TILE - 10,
          5,
        );
      }
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    this.clock += dt;
    if (!this.hint) for (const e of this.sim.step(dt)) this.handle(e);
    this.setScore(this.sim.score);
    this.draw();
  }

  private handle(e: MazeEvent): void {
    const { sfx } = getServices(this);
    switch (e.type) {
      case 'pellet':
        break;
      case 'power':
        sfx.play('star');
        break;
      case 'eat':
        sfx.play('win');
        this.pop(GAME_WIDTH / 2, 230, `+${e.points}`, '#35e0ff');
        break;
      case 'died':
        sfx.play('hit');
        sfx.vibrate([60, 30, 60]);
        this.cameras.main.shake(180, 0.008);
        this.hearts.setText(heartsLabel(this.sim.lives));
        this.hint = addText(this, GAME_WIDTH / 2, 1110, 'Deslize para continuar', 38, {
          color: '#ffffff',
          stroke: '#0b1430',
        });
        break;
      case 'clear':
        sfx.play('win');
        this.pop(GAME_WIDTH / 2, 230, `Fase ${this.sim.level}!`, '#ffe066', 56);
        this.buildMaze();
        break;
      case 'over':
        this.hearts.setText(heartsLabel(0));
        this.finish('Os fantasmas pegaram você!', [`Fase: ${this.sim.level}`], {
          score: this.sim.score,
          details: { level: this.sim.level },
        });
        break;
    }
  }

  private draw(): void {
    const g = this.g.clear();
    const { sim } = this;
    sim.pellets.forEach((v, i) => {
      if (!v) return;
      const x = px(i % COLS);
      const y = py(Math.floor(i / COLS));
      g.fillStyle(0xffe8b0).fillCircle(x, y, v === 2 ? 10 + Math.sin(this.clock * 8) * 2 : 4);
    });
    const p = posOf(sim.player);
    const mouth = (Math.abs(Math.sin(this.clock * 12)) * Math.PI) / 4 + 0.05;
    const dir = Math.atan2(this.face.dy, this.face.dx);
    g.fillStyle(0xffd23f);
    g.beginPath();
    g.moveTo(px(p.x), py(p.y));
    g.arc(px(p.x), py(p.y), 17, dir + mouth, dir - mouth + Math.PI * 2);
    g.closePath();
    g.fillPath();
    for (const gh of sim.ghosts) this.drawGhost(g, gh);
  }

  private drawGhost(g: Phaser.GameObjects.Graphics, gh: Ghost): void {
    const p = posOf(gh);
    const x = px(p.x);
    const y = py(p.y);
    if (gh.mode !== 'eaten') {
      const flash =
        gh.mode === 'afraid' && this.sim.fear < 2 && Math.floor(this.clock * 6) % 2 === 0;
      const color = gh.mode === 'afraid' ? (flash ? 0xffffff : 0x2f4bff) : GHOST_COLORS[gh.id]!;
      g.fillStyle(color)
        .fillCircle(x, y - 2, 17)
        .fillRect(x - 17, y - 2, 34, 17);
      g.fillStyle(0x050a30);
      for (let i = 0; i < 3; i++)
        g.fillTriangle(
          x - 17 + i * 11.3,
          y + 15,
          x - 11.3 + i * 11.3,
          y + 15,
          x - 14 + i * 11.3,
          y + 9,
        );
    }
    if (gh.mode === 'afraid') {
      g.fillStyle(0xffffff)
        .fillCircle(x - 6, y - 4, 3)
        .fillCircle(x + 6, y - 4, 3);
      return;
    }
    g.fillStyle(0xffffff)
      .fillCircle(x - 6, y - 5, 6)
      .fillCircle(x + 6, y - 5, 6);
    g.fillStyle(0x1d3fff)
      .fillCircle(x - 6 + gh.dx * 2.5, y - 5 + gh.dy * 2.5, 3)
      .fillCircle(x + 6 + gh.dx * 2.5, y - 5 + gh.dy * 2.5, 3);
  }
}
