import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { TILE_W, TRAY_SIZE, TrioSim, type Tile } from './core';

const CX = GAME_WIDTH / 2;
const UNIT = 44;
const PILE_Y = 560;
const TRAY_Y = 1060;
const SLOT = 92;
const FACES = ['🍎', '🍋', '🍇', '🍓', '🥕', '🌽', '🐶', '🐱', '🐸', '🦊', '🍩', '⭐'] as const;

/** "Trio de Peças": a tile-match puzzle. Tap free tiles; a full tray ends the run. */
export class TrioScene extends MiniScene {
  private sim = new TrioSim();
  private gfx!: Phaser.GameObjects.Graphics;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private info!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Trio, 'trio', [0x2d6a4f, 0x081c15]);
  }

  create(): void {
    this.sim = new TrioSim();
    this.objs = [];
    this.frame();
    this.gfx = this.add.graphics();
    this.info = addText(this, CX, 190, '', 32, { color: '#ffe066', stroke: '#0b1430' });
    this.render();
  }

  private pos(t: Tile): { x: number; y: number } {
    return { x: CX + t.x * UNIT - t.layer * 3, y: PILE_Y + t.y * UNIT - t.layer * 3 };
  }

  private render(): void {
    for (const o of this.objs) o.destroy();
    this.objs = [];
    const g = this.gfx.clear();
    this.info.setText(`Nível ${this.sim.level + 1}  ·  faltam ${this.sim.remaining}`);

    const trayW = SLOT * TRAY_SIZE;
    g.fillStyle(0x000000, 0.45).fillRoundedRect(
      CX - trayW / 2 - 8,
      TRAY_Y - 58,
      trayW + 16,
      116,
      22,
    );
    for (let i = 0; i < TRAY_SIZE; i++) {
      g.fillStyle(0xffffff, 0.12).fillRoundedRect(
        CX - trayW / 2 + i * SLOT + 6,
        TRAY_Y - 46,
        SLOT - 12,
        92,
        14,
      );
    }
    this.sim.tray.forEach((t, i) => {
      this.drawFace(g, CX - trayW / 2 + i * SLOT + SLOT / 2, TRAY_Y, 78, t.kind, true);
    });

    const pile = this.sim.tiles.filter((t) => !t.taken).sort((a, b) => a.layer - b.layer);
    for (const t of pile) {
      const { x, y } = this.pos(t);
      const free = this.sim.isFree(t);
      this.drawFace(g, x, y, TILE_W * UNIT - 4, t.kind, free);
      if (free) {
        const hit = this.add
          .rectangle(x, y, TILE_W * UNIT, TILE_W * UNIT, 0xffffff, 0.001)
          .setInteractive();
        hit.on(Phaser.Input.Events.POINTER_DOWN, () => this.tap(t.id));
        this.objs.push(hit);
      }
    }
  }

  private drawFace(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    size: number,
    kind: number,
    bright: boolean,
  ): void {
    g.fillStyle(0x6b705c).fillRoundedRect(x - size / 2 + 3, y - size / 2 + 6, size, size, 14);
    g.fillStyle(bright ? 0xfff8e7 : 0x9a9a8f).fillRoundedRect(
      x - size / 2,
      y - size / 2,
      size,
      size,
      14,
    );
    g.lineStyle(3, 0x3d405b).strokeRoundedRect(x - size / 2, y - size / 2, size, size, 14);
    const face = emojiText(this, x, y + 2, FACES[kind % FACES.length]!, size * 0.58);
    if (!bright) face.setAlpha(0.45);
    this.objs.push(face);
  }

  private tap(id: number): void {
    if (this.ended) return;
    const { sfx } = getServices(this);
    const level = this.sim.level;
    const ev = this.sim.pick(id);
    if (!ev) return;
    this.setScore(this.sim.score);
    if (ev.cleared) {
      sfx.play('win');
      this.pop(CX, TRAY_Y - 110, 'TRIO!', '#ffe066');
    } else {
      sfx.play('pop', this.sim.tray.length % 7);
    }
    if (ev.won) this.pop(CX, 420, `Nível ${level + 2}!`, '#8ac926', 56);
    this.render();
    if (ev.lost) {
      this.finish('Bandeja cheia!', [`Trios: ${this.sim.cleared}`, `Nível: ${level + 1}`], {
        score: this.sim.score,
        details: { trios: this.sim.cleared, level: level + 1 },
      });
    }
  }
}
