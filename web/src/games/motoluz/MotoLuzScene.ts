import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { COLS, ROWS, TronSim, type Dir, type TronEvent } from './core';

const CELL = 18;
const X0 = (GAME_WIDTH - COLS * CELL) / 2;
const Y0 = 280;
const COLORS = [0x22d3ee, 0xf97316, 0xd946ef, 0xfacc15, 0x4ade80, 0xf43f5e];

/** "Moto de Luz": swipe to turn, trap the rivals behind your light wall and outlast them. */
export class MotoLuzScene extends MiniScene {
  private sim = new TronSim();
  private g!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private swipe: { x: number; y: number } | null = null;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.MotoLuz, 'motoluz', [0x020617, 0x0b1120]);
  }

  create(): void {
    this.sim = new TronSim();
    this.swipe = null;
    this.frame('0');
    this.g = this.add.graphics().setDepth(5);
    this.statusText = addText(this, GAME_WIDTH / 2, 170, '', 30, {
      color: '#a5f3fc',
      stroke: '#020617',
      strokeThickness: 6,
    }).setDepth(50);
    this.hintBox = hint(
      this,
      ['Deslize para virar a moto azul', 'Não bata em nenhum rastro — prenda os rivais!'],
      1230,
      5000,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      this.swipe = { x: p.x, y: p.y };
      this.hintBox?.dismiss();
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (!this.swipe || !p.isDown) return;
      const dx = p.x - this.swipe.x;
      const dy = p.y - this.swipe.y;
      if (Math.hypot(dx, dy) < 28) return;
      this.steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
      this.swipe = { x: p.x, y: p.y };
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => (this.swipe = null));
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      const map: Record<string, Dir> = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
      const d = map[e.key];
      if (d !== undefined) this.steer(d);
    });
    this.time.delayedCall(10, () => banner(this, 'RODADA 1', '#a5f3fc', 640));
  }

  private steer(d: Dir): void {
    if (this.ended) return;
    this.sim.steer(d);
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.handle(this.sim.step(Math.min(deltaMs, 50) / 1000));
    this.setScore(this.sim.score);
    const alive = this.sim.bikes.filter((b) => b.id !== 0 && b.alive).length;
    this.statusText.setText(
      `Rodada ${this.sim.round} · Rivais ${alive}/${this.sim.rivals} · Abates ${this.sim.kills}`,
    );
    this.draw();
  }

  private handle(events: TronEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e.type === 'crash') {
        const x = X0 + (e.x + 0.5) * CELL;
        const y = Y0 + (e.y + 0.5) * CELL;
        burst(this, x, y, COLORS[e.id] ?? 0xffffff, 22, { speed: 320 });
        shockwave(this, x, y, COLORS[e.id] ?? 0xffffff, 90);
        sfx.play(e.id === 0 ? 'boom' : 'pop');
        if (e.id !== 0) {
          sfx.vibrate(25);
          this.pop(x, y - 30, `+${250 * this.sim.round}`, '#fde047', 32);
        }
      } else if (e.type === 'round') {
        sfx.play('win');
        sfx.vibrate([30, 30, 60]);
        banner(this, 'VOCÊ VENCEU A RODADA!', '#86efac', 560);
        this.pop(GAME_WIDTH / 2, 720, `Bônus +${e.bonus}`, '#fde047', 44);
        this.time.delayedCall(1500, () => {
          if (this.ended) return;
          this.sim.nextRound();
          banner(this, `RODADA ${this.sim.round}`, '#a5f3fc', 640);
        });
      } else {
        sfx.vibrate([80, 40, 80]);
        flash(this, 0x22d3ee, 0.35, 300);
        this.cameras.main.shake(260, 0.012);
        this.finish(
          'Sua moto bateu!',
          [`Rodadas vencidas: ${this.sim.round - 1} · Rivais derrubados: ${this.sim.kills}`],
          { score: this.sim.score, details: { rounds: this.sim.round - 1, kills: this.sim.kills } },
          900,
        );
      }
    }
  }

  private draw(): void {
    const g = this.g.clear();
    g.fillStyle(0x000000, 1).fillRect(X0 - 6, Y0 - 6, COLS * CELL + 12, ROWS * CELL + 12);
    g.lineStyle(3, 0x22d3ee, 0.8).strokeRect(X0 - 6, Y0 - 6, COLS * CELL + 12, ROWS * CELL + 12);
    g.lineStyle(1, 0x0e7490, 0.25);
    for (let c = 0; c <= COLS; c += 3)
      g.lineBetween(X0 + c * CELL, Y0, X0 + c * CELL, Y0 + ROWS * CELL);
    for (let r = 0; r <= ROWS; r += 3)
      g.lineBetween(X0, Y0 + r * CELL, X0 + COLS * CELL, Y0 + r * CELL);
    const grid = this.sim.grid;
    for (let i = 0; i < grid.length; i++) {
      const o = grid[i]!;
      if (!o) continue;
      const alive = this.sim.bikes[o - 1]?.alive;
      g.fillStyle(COLORS[o - 1] ?? 0xffffff, alive ? 0.75 : 0.25);
      g.fillRect(
        X0 + (i % COLS) * CELL + 2,
        Y0 + Math.floor(i / COLS) * CELL + 2,
        CELL - 4,
        CELL - 4,
      );
    }
    for (const b of this.sim.bikes) {
      if (!b.alive) continue;
      const x = X0 + (b.x + 0.5) * CELL;
      const y = Y0 + (b.y + 0.5) * CELL;
      g.fillStyle(COLORS[b.id] ?? 0xffffff, 0.3).fillCircle(x, y, CELL);
      g.fillStyle(0xffffff, 1).fillCircle(x, y, CELL * 0.42);
    }
  }
}
