import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, hint } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  ANCHOR,
  GROUND,
  launch,
  MAX_PULL,
  newStage,
  outcome,
  PIG_R,
  pigsLeft,
  step,
  STONE_R,
  type SlingState,
} from './core';

/** "Estilingue": pull back, aim and let go — pop every pig before the stones run out. */
export class EstilingueScene extends MiniScene {
  private s: SlingState = newStage(1);
  private g!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private total = 0;
  private pull: { x: number; y: number } | null = null;
  private locked = false;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Estilingue, 'estilingue', [0x0369a1, 0x14532d]);
  }

  create(): void {
    this.s = newStage(1);
    this.total = 0;
    this.pull = null;
    this.locked = false;
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.info = addText(this, GAME_WIDTH / 2, 168, '', 30, {
      color: '#e0f2fe',
      stroke: '#082f49',
      strokeThickness: 6,
    }).setDepth(50);
    this.hintBox = hint(
      this,
      ['Arraste para trás e solte', 'Derrube as torres e estoure os porcos'],
      1190,
      4500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.ended || this.locked || this.s.stone || p.y < 140) return;
      this.hintBox?.dismiss();
      this.setPull(p);
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.pull) this.setPull(p);
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => this.release());
  }

  private setPull(p: Phaser.Input.Pointer): void {
    let x = p.x - ANCHOR.x;
    let y = p.y - ANCHOR.y;
    const len = Math.hypot(x, y);
    if (len > MAX_PULL) {
      x = (x / len) * MAX_PULL;
      y = (y / len) * MAX_PULL;
    }
    this.pull = { x, y };
  }

  private release(): void {
    const pull = this.pull;
    this.pull = null;
    if (!pull || this.ended || this.locked) return;
    if (launch(this.s, pull.x, pull.y)) getServices(this).sfx.play('bounce');
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const { sfx } = getServices(this);
    if (this.s.stone) {
      const before = pigsLeft(this.s);
      let over = false;
      for (let i = 0; i < 4 && !over; i++) over = step(this.s, Math.min(deltaMs, 33) / 4000);
      const popped = before - pigsLeft(this.s);
      if (popped > 0) {
        sfx.play('coin');
        for (const pig of this.s.pigs) {
          if (!pig.alive) burst(this, pig.x, pig.y, 0x86efac, 6, { speed: 160 });
        }
      }
      if (over) this.afterShot();
    }
    this.setScore(this.total + this.s.score);
    this.info.setText(
      `Fase ${this.s.stage} · Pedras: ${this.s.shots} · Porcos: ${pigsLeft(this.s)}`,
    );
    this.draw();
  }

  private afterShot(): void {
    const res = outcome(this.s);
    if (res === 'clear') {
      this.locked = true;
      this.total += this.s.score + this.s.shots * 50;
      getServices(this).sfx.play('win');
      banner(this, `FASE ${this.s.stage} CONCLUÍDA!`, '#fde047', 900);
      this.time.delayedCall(1400, () => {
        if (this.ended) return;
        this.s = newStage(this.s.stage + 1);
        this.locked = false;
      });
    } else if (res === 'lost') {
      const stage = this.s.stage;
      const total = this.total + this.s.score;
      this.finish(
        'Acabaram as pedras!',
        [`Fase ${stage} · Pontos ${total}`],
        { score: total, details: { stage } },
        700,
      );
    }
  }

  private draw(): void {
    const g = this.g.clear();
    const s = this.s;
    g.fillStyle(0x15803d, 1).fillRect(0, GROUND, GAME_WIDTH, 400);
    g.fillStyle(0x166534, 1).fillRect(0, GROUND, GAME_WIDTH, 14);
    for (const b of s.blocks) {
      g.fillStyle(b.hp > 1 ? 0x78350f : 0xb45309, 1).fillRect(b.x, b.y, b.w, b.h);
      g.lineStyle(4, 0x451a03, 1).strokeRect(b.x, b.y, b.w, b.h);
    }
    for (const pig of s.pigs) {
      if (!pig.alive) continue;
      g.fillStyle(0x4ade80, 1).fillCircle(pig.x, pig.y, PIG_R);
      g.fillStyle(0x16a34a, 1).fillEllipse(pig.x, pig.y + 8, 26, 18);
      g.fillStyle(0xffffff, 1)
        .fillCircle(pig.x - 11, pig.y - 8, 7)
        .fillCircle(pig.x + 11, pig.y - 8, 7);
      g.fillStyle(0x111827, 1)
        .fillCircle(pig.x - 11, pig.y - 8, 3)
        .fillCircle(pig.x + 11, pig.y - 8, 3);
    }
    // The sling: two posts, a band and the stone.
    g.lineStyle(14, 0x78350f, 1)
      .lineBetween(ANCHOR.x - 18, ANCHOR.y + 140, ANCHOR.x - 18, ANCHOR.y + 6)
      .lineBetween(ANCHOR.x + 18, ANCHOR.y + 140, ANCHOR.x + 18, ANCHOR.y + 6);
    const pull = this.pull;
    const sx = pull ? ANCHOR.x + pull.x : ANCHOR.x;
    const sy = pull ? ANCHOR.y + pull.y : ANCHOR.y;
    if (!s.stone) {
      g.lineStyle(7, 0x451a03, 1)
        .lineBetween(ANCHOR.x - 18, ANCHOR.y + 6, sx, sy)
        .lineBetween(ANCHOR.x + 18, ANCHOR.y + 6, sx, sy);
      g.fillStyle(0x6b7280, 1).fillCircle(sx, sy, STONE_R);
      if (pull) {
        // Preview of the first part of the arc.
        const k = Math.min(1, MAX_PULL / Math.hypot(pull.x, pull.y));
        const vx = -pull.x * k * 7.2;
        const vy = -pull.y * k * 7.2;
        for (let t = 0.07; t < 0.75; t += 0.07) {
          g.fillStyle(0xffffff, 0.8 - t).fillCircle(
            ANCHOR.x + vx * t,
            ANCHOR.y + vy * t + 750 * t * t,
            6,
          );
        }
      }
    } else {
      g.fillStyle(0x6b7280, 1).fillCircle(s.stone.x, s.stone.y, STONE_R);
      g.fillStyle(0xffffff, 0.35).fillCircle(s.stone.x - 7, s.stone.y - 7, 7);
    }
  }
}
