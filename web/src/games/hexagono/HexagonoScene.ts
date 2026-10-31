import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  blocked,
  CORE_R,
  HexSim,
  PLAYER_R,
  SECTOR,
  SIDES,
  STAGES,
  WALL_T,
  type HexEvent,
} from './core';

const CX = GAME_WIDTH / 2;
const CY = 700;
/** One hue per stage: the whole board re-tints when the player levels up. */
const STAGE_COLORS = [0xec4899, 0x8b5cf6, 0x06b6d4, 0x22c55e, 0xf59e0b, 0xef4444];
/** Corners are further than the apothem: a regular hexagon drawn by its side distance. */
const CORNER = 1 / Math.cos(SECTOR / 2);

/** "Hexágono": hold the left or right side of the screen to slip through the closing walls. */
export class HexagonoScene extends MiniScene {
  private sim = new HexSim();
  private g!: Phaser.GameObjects.Graphics;
  private stageText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private keys?: Phaser.Types.Input.Keyboard.CursorKeys;
  private hintBox?: { dismiss: () => void };
  private pulse = 0;
  private lastBeat = 0;

  constructor() {
    super(SceneKeys.Hexagono, 'hexagono', [0x0b0614, 0x1a0b2e]);
  }

  create(): void {
    this.sim = new HexSim();
    this.pulse = 0;
    this.lastBeat = 0;
    this.frame('0.0');
    this.input.addPointer(2);
    this.g = this.add.graphics().setDepth(5);
    this.stageText = addText(this, CX, 170, STAGES[0]!.name, 34, {
      color: '#f9a8d4',
      stroke: '#0b0614',
      strokeThickness: 6,
    }).setDepth(50);
    this.timeText = addText(this, CX, 1210, '', 26, { color: '#ffffffaa' }).setDepth(50);
    this.keys = this.input.keyboard?.createCursorKeys();
    this.hintBox = hint(
      this,
      ['Segure a esquerda ou a direita da tela', 'para girar e passar pelas aberturas!'],
      1080,
      4200,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => this.hintBox?.dismiss());
  }

  private readInput(): -1 | 0 | 1 {
    let dir = 0;
    for (const p of this.input.manager.pointers) {
      if (!p.isDown || p.y < 130) continue;
      dir += p.x < CX ? -1 : 1;
    }
    if (this.keys?.left.isDown) dir -= 1;
    if (this.keys?.right.isDown) dir += 1;
    return dir < 0 ? -1 : dir > 0 ? 1 : 0;
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const dt = Math.min(deltaMs, 40) / 1000;
    this.handle(this.sim.step(dt, this.readInput()));
    // A beat every half second: the board throbs, like music.
    if (this.sim.time - this.lastBeat > 0.5) {
      this.lastBeat = this.sim.time;
      this.pulse = 1;
    }
    this.pulse = Math.max(0, this.pulse - dt * 4);
    this.setScore((this.sim.score / 10).toFixed(1));
    const next = STAGES[this.sim.stage + 1];
    this.timeText.setText(next ? `Próxima forma em ${(next.at - this.sim.time).toFixed(1)}s` : '');
    this.draw();
  }

  private handle(events: HexEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e.type === 'stage') {
        this.stageText.setText(e.name);
        banner(this, e.name, '#ffffff', 420);
        flash(this, STAGE_COLORS[e.index] ?? 0xffffff, 0.3, 300);
        shockwave(this, CX, CY, 0xffffff, 200);
        sfx.play('level');
        sfx.vibrate(30);
      } else {
        const a = this.sim.angle + this.sim.spin;
        burst(this, CX + Math.cos(a) * PLAYER_R, CY + Math.sin(a) * PLAYER_R, 0xffffff, 26, {
          speed: 420,
        });
        const stage = STAGES[this.sim.stage]!.name;
        this.finish(
          this.sim.time >= 60 ? 'Mestre do Hexágono!' : 'Bateu na parede!',
          [`Tempo: ${(this.sim.score / 10).toFixed(1)}s · Forma: ${stage}`],
          { score: this.sim.score, details: { stage: this.sim.stage + 1 } },
          700,
        );
      }
    }
  }

  private hexPoint(i: number, r: number, spin: number): [number, number] {
    const a = spin + i * SECTOR;
    return [CX + Math.cos(a) * r * CORNER, CY + Math.sin(a) * r * CORNER];
  }

  private draw(): void {
    const g = this.g.clear();
    const color = STAGE_COLORS[this.sim.stage] ?? 0xec4899;
    const dark = Phaser.Display.Color.IntegerToColor(color).darken(70).color;
    const mid = Phaser.Display.Color.IntegerToColor(color).darken(55).color;
    const spin = this.sim.spin;
    const zoom = 1 + this.pulse * 0.04;
    const far = Math.hypot(GAME_WIDTH, GAME_HEIGHT);

    // Background wedges in two alternating tones.
    for (let i = 0; i < SIDES; i++) {
      const [x1, y1] = this.hexPoint(i, far, spin);
      const [x2, y2] = this.hexPoint(i + 1, far, spin);
      g.fillStyle(i % 2 ? dark : mid, 1).fillTriangle(CX, CY, x1, y1, x2, y2);
    }

    // Walls: trapezoids between two hexagons.
    g.fillStyle(color, 1);
    for (const w of this.sim.walls) {
      const r0 = Math.max(CORE_R, w.dist) * zoom;
      const r1 = (w.dist + WALL_T) * zoom;
      for (let i = 0; i < SIDES; i++) {
        if (!blocked(w.mask, i)) continue;
        const [ax, ay] = this.hexPoint(i, r0, spin);
        const [bx, by] = this.hexPoint(i + 1, r0, spin);
        const [cx, cy] = this.hexPoint(i + 1, r1, spin);
        const [dx, dy] = this.hexPoint(i, r1, spin);
        g.fillPoints(
          [
            { x: ax, y: ay },
            { x: bx, y: by },
            { x: cx, y: cy },
            { x: dx, y: dy },
          ],
          true,
        );
      }
    }

    // Central hexagon.
    const core: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i < SIDES; i++) {
      const [x, y] = this.hexPoint(i, (CORE_R - 8) * zoom, spin);
      core.push({ x, y });
    }
    g.fillStyle(dark, 1).fillPoints(core, true);
    g.lineStyle(6, color, 1).strokePoints(core, true);

    // Player arrow.
    const a = this.sim.angle + spin;
    const r = PLAYER_R * zoom;
    const tip = { x: CX + Math.cos(a) * (r + 14), y: CY + Math.sin(a) * (r + 14) };
    const l = { x: CX + Math.cos(a - 0.09) * (r - 4), y: CY + Math.sin(a - 0.09) * (r - 4) };
    const rr = { x: CX + Math.cos(a + 0.09) * (r - 4), y: CY + Math.sin(a + 0.09) * (r - 4) };
    g.fillStyle(0xffffff, 1).fillTriangle(tip.x, tip.y, l.x, l.y, rr.x, rr.y);
  }
}
