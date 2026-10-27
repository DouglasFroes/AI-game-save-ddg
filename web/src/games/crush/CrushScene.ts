import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { Tex } from '@/platform/art/textures';
import { formatNumber } from '@/platform/ranking';
import type { GameOverData } from '@/platform/scenes/GameOverScene';
import { addText, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { headKey, KIND_COLORS, XTex } from './art';
import { COLS, CrushGame, levelGoal, ROWS, type Cell, type Phase, type Piece } from './core';

export interface CrushData {
  level?: number;
  total?: number;
}

const CELL = 94;
const BOARD_X = (GAME_WIDTH - COLS * CELL) / 2;
const BOARD_Y = 330;
const MOVE_BONUS = 150;
const PRAISE = ['', '', 'Boa!', 'Muito bom!', 'Incrível!', 'Espetacular!', 'TURMA CRUSH!'];

const px = (x: number) => BOARD_X + x * CELL + CELL / 2;
const py = (y: number) => BOARD_Y + y * CELL + CELL / 2;

/** "Turma Crush": match the turma's faces, reach the target before the moves run out. */
export class CrushScene extends Phaser.Scene {
  private game_!: CrushGame;
  private level = 1;
  private total = 0;
  private levelScore = 0;
  private moves = 0;
  private target = 0;
  private busy = false;
  private finished = false;
  private views = new Map<number, Phaser.GameObjects.Container>();
  private layer!: Phaser.GameObjects.Container;
  private selected: Cell | null = null;
  private drag: { cell: Cell; x: number; y: number } | null = null;
  private selection!: Phaser.GameObjects.Graphics;
  private idle = 0;
  private hud!: {
    score: Phaser.GameObjects.Text;
    moves: Phaser.GameObjects.Text;
    bar: Phaser.GameObjects.Graphics;
  };

  constructor() {
    super(SceneKeys.Crush);
  }

  init(data: CrushData): void {
    this.level = data.level ?? 1;
    this.total = data.total ?? 0;
    const goal = levelGoal(this.level);
    this.game_ = new CrushGame(goal.kinds);
    this.moves = goal.moves;
    this.target = goal.target;
    this.levelScore = 0;
    this.busy = false;
    this.finished = false;
    this.views = new Map();
    this.selected = null;
    this.drag = null;
    this.idle = 0;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0xffe3f3);
    this.drawBackground();
    this.buildHud();
    this.layer = this.add.container(0, 0).setDepth(5);
    const mask = this.make.graphics({}, false);
    mask.fillStyle(0xffffff).fillRect(BOARD_X, BOARD_Y, COLS * CELL, ROWS * CELL);
    this.layer.setMask(mask.createGeometryMask());
    this.selection = this.add.graphics().setDepth(6);
    this.syncAll();
    this.bindInput();
    this.intro();
    if (import.meta.env.DEV) (window as unknown as { __crush?: CrushScene }).__crush = this;
  }

  // ── Drawing ─────────────────────────────────────────────────────────────

  private drawBackground(): void {
    const g = this.add.graphics().setDepth(0);
    g.fillGradientStyle(0xffd1ec, 0xffd1ec, 0xc9e7ff, 0xc9e7ff, 1).fillRect(0, 0, GAME_WIDTH, 1280);
    for (let i = 0; i < 14; i++) {
      g.fillStyle(0xffffff, 0.35).fillCircle(
        Phaser.Math.Between(0, GAME_WIDTH),
        Phaser.Math.Between(0, 1280),
        Phaser.Math.Between(10, 40),
      );
    }
    g.fillStyle(0x7a3e9d, 0.25).fillRoundedRect(
      BOARD_X - 12,
      BOARD_Y - 12,
      COLS * CELL + 24,
      ROWS * CELL + 24,
      28,
    );
    g.fillStyle(0xffffff, 0.85).fillRoundedRect(
      BOARD_X - 6,
      BOARD_Y - 6,
      COLS * CELL + 12,
      ROWS * CELL + 12,
      24,
    );
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        g.fillStyle((x + y) % 2 ? 0xf3e8ff : 0xfdf2ff).fillRoundedRect(
          BOARD_X + x * CELL + 3,
          BOARD_Y + y * CELL + 3,
          CELL - 6,
          CELL - 6,
          14,
        );
  }

  private makeView(p: Piece, x: number, y: number): Phaser.GameObjects.Container {
    const parts: Phaser.GameObjects.GameObject[] = [];
    if (p.special === 'rainbow') {
      parts.push(this.add.image(0, 0, XTex.rainbow).setScale(0.8));
    } else {
      const bubble = this.add.graphics();
      bubble.fillStyle(KIND_COLORS[p.kind]!).fillCircle(0, 2, 42);
      parts.push(bubble, this.add.image(0, 0, headKey(p.kind)).setScale(0.74));
      const fx = this.add.graphics();
      if (p.special === 'row' || p.special === 'col') {
        for (const o of [-14, 0, 14]) {
          fx.fillStyle(0xffffff, 0.85);
          if (p.special === 'row') fx.fillRoundedRect(-44, o - 3, 88, 6, 3);
          else fx.fillRoundedRect(o - 3, -44, 6, 88, 3);
        }
        fx.lineStyle(4, 0xff4f8b).strokeCircle(0, 2, 43);
      } else if (p.special === 'bomb') {
        fx.lineStyle(7, 0x1f1f2b).strokeCircle(0, 2, 42);
        fx.lineStyle(4, 0xffd23f).strokeCircle(0, 2, 42);
        fx.fillStyle(0xff7b00).fillCircle(30, -32, 9);
        fx.fillStyle(0xffd23f).fillCircle(30, -32, 5);
      }
      parts.push(fx);
    }
    const c = this.add.container(px(x), py(y), parts);
    if (p.special)
      this.tweens.add({
        targets: c,
        scale: 1.08,
        duration: 420,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    this.layer.add(c);
    this.views.set(p.id, c);
    return c;
  }

  /** Rebuilds every piece from the board (start, reshuffle). */
  private syncAll(): void {
    for (const v of this.views.values()) v.destroy();
    this.views.clear();
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        const p = this.game_.at({ x, y });
        if (p) this.makeView(p, x, y);
      }
  }

  // ── HUD ─────────────────────────────────────────────────────────────────

  private buildHud(): void {
    iconButton(this, 60, 60, '‹', () => this.scene.start(SceneKeys.Hub)).setDepth(20);
    const dark = { color: '#5a2a7a' };
    addText(this, 210, 46, `FASE ${this.level}`, 30, dark).setDepth(20);
    const score = addText(this, 210, 96, formatNumber(this.total), 40, {
      color: '#ff4f8b',
      stroke: '#ffffff',
      strokeThickness: 8,
    }).setDepth(20);
    const panel = this.add.graphics().setDepth(19);
    panel.fillStyle(0xffffff, 0.9).fillRoundedRect(GAME_WIDTH - 200, 22, 176, 120, 26);
    addText(this, GAME_WIDTH - 112, 50, 'JOGADAS', 22, { color: COLORS.textMuted }).setDepth(20);
    const moves = addText(this, GAME_WIDTH - 112, 102, '', 58, { color: '#5a2a7a' }).setDepth(20);
    addText(
      this,
      GAME_WIDTH / 2,
      186,
      `Meta: ${formatNumber(this.target)} pontos`,
      26,
      dark,
    ).setDepth(20);
    this.hud = { score, moves, bar: this.add.graphics().setDepth(20) };
    this.updateHud();
  }

  private updateHud(): void {
    this.hud.score.setText(formatNumber(this.total + this.levelScore));
    this.hud.moves.setText(String(this.moves)).setColor(this.moves <= 5 ? '#e63946' : '#5a2a7a');
    // Progress to the target, with three stars at 100%, 150% and 200%.
    const g = this.hud.bar.clear();
    const x = 70;
    const w = GAME_WIDTH - 140;
    const y = 232;
    const ratio = Math.min(1, this.levelScore / (this.target * 2));
    g.fillStyle(0xffffff).fillRoundedRect(x - 4, y - 4, w + 8, 36, 18);
    g.fillStyle(0xf0dcff).fillRoundedRect(x, y, w, 28, 14);
    g.fillStyle(0xff4f8b).fillRoundedRect(x, y, Math.max(28, w * ratio), 28, 14);
    for (const k of [0.5, 0.75, 1]) {
      const sx = x + w * k;
      const on = ratio >= k;
      g.fillStyle(on ? 0xffd23f : 0xd9c6ea).fillCircle(sx - 14, y + 14, 18);
      g.lineStyle(3, on ? 0xe09a00 : 0xb79ad0).strokeCircle(sx - 14, y + 14, 18);
    }
  }

  // ── Input ───────────────────────────────────────────────────────────────

  private cellAt(x: number, y: number): Cell | null {
    const cx = Math.floor((x - BOARD_X) / CELL);
    const cy = Math.floor((y - BOARD_Y) / CELL);
    return cx >= 0 && cy >= 0 && cx < COLS && cy < ROWS ? { x: cx, y: cy } : null;
  }

  private bindInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.busy || this.finished) return;
      const cell = this.cellAt(p.x, p.y);
      if (!cell) return;
      this.idle = 0;
      // Tap mode: a selected piece then a neighbour.
      if (
        this.selected &&
        Math.abs(this.selected.x - cell.x) + Math.abs(this.selected.y - cell.y) === 1
      ) {
        const from = this.selected;
        this.select(null);
        void this.trySwap(from, cell);
        return;
      }
      this.drag = { cell, x: p.x, y: p.y };
      this.select(cell);
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      const d = this.drag;
      if (!d || !p.isDown || this.busy) return;
      const dx = p.x - d.x;
      const dy = p.y - d.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
      const to =
        Math.abs(dx) > Math.abs(dy)
          ? { x: d.cell.x + Math.sign(dx), y: d.cell.y }
          : { x: d.cell.x, y: d.cell.y + Math.sign(dy) };
      this.drag = null;
      this.select(null);
      if (to.x >= 0 && to.y >= 0 && to.x < COLS && to.y < ROWS) void this.trySwap(d.cell, to);
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => (this.drag = null));
  }

  private select(cell: Cell | null): void {
    this.selected = cell;
    const g = this.selection.clear();
    if (cell)
      g.lineStyle(6, 0xff4f8b).strokeRoundedRect(
        BOARD_X + cell.x * CELL + 4,
        BOARD_Y + cell.y * CELL + 4,
        CELL - 8,
        CELL - 8,
        16,
      );
  }

  // ── Turn ────────────────────────────────────────────────────────────────

  private tween(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((resolve) => this.tweens.add({ ...config, onComplete: () => resolve() }));
  }

  private async trySwap(a: Cell, b: Cell): Promise<void> {
    const pa = this.game_.at(a);
    const pb = this.game_.at(b);
    if (!pa || !pb) return;
    this.busy = true;
    const va = this.views.get(pa.id)!;
    const vb = this.views.get(pb.id)!;
    const { sfx } = getServices(this);
    sfx.play('click');
    await Promise.all([
      this.tween({ targets: va, x: px(b.x), y: py(b.y), duration: 150 }),
      this.tween({ targets: vb, x: px(a.x), y: py(a.y), duration: 150 }),
    ]);
    const result = this.game_.swap(a, b);
    if (!result.ok) {
      // Wobble back: no match.
      sfx.play('locked');
      await Promise.all([
        this.tween({ targets: va, x: px(a.x), y: py(a.y), duration: 180, ease: 'Back.easeOut' }),
        this.tween({ targets: vb, x: px(b.x), y: py(b.y), duration: 180, ease: 'Back.easeOut' }),
      ]);
      this.busy = false;
      return;
    }
    this.moves--;
    for (const phase of result.phases) await this.playPhase(phase);
    if (result.shuffled) {
      this.banner('Embaralhando!', '#7a3e9d');
      await this.tween({ targets: this.layer, alpha: 0, duration: 200 });
      this.syncAll();
      await this.tween({ targets: this.layer, alpha: 1, duration: 200 });
    }
    this.updateHud();
    this.busy = false;
    this.checkEnd();
  }

  private async playPhase(phase: Phase): Promise<void> {
    const { sfx } = getServices(this);
    sfx.play(phase.cascade > 1 ? 'star' : 'pop', Math.min(4, phase.cascade - 1));
    if (phase.cleared.length >= 9) this.cameras.main.shake(160, 0.006);
    // Pop the cleared pieces.
    const pops = phase.cleared.map((c) => {
      const v = this.views.get(c.piece.id);
      this.views.delete(c.piece.id);
      if (!v) return Promise.resolve();
      this.burst(px(c.x), py(c.y), KIND_COLORS[c.piece.kind] ?? 0xffffff);
      return this.tween({ targets: v, scale: 1.35, alpha: 0, duration: 200 }).then(() =>
        v.destroy(),
      );
    });
    await Promise.all(pops);
    for (const c of phase.created) {
      const v = this.makeView(c.piece, c.x, c.y);
      v.setScale(0);
      this.tweens.add({ targets: v, scale: 1, duration: 220, ease: 'Back.easeOut' });
    }
    this.levelScore += phase.points;
    this.floatPoints(phase);
    if (PRAISE[Math.min(phase.cascade + (phase.cleared.length >= 7 ? 1 : 0), PRAISE.length - 1)])
      this.banner(
        PRAISE[Math.min(phase.cascade + (phase.cleared.length >= 7 ? 1 : 0), PRAISE.length - 1)]!,
        '#ff4f8b',
      );
    this.updateHud();

    // Fall and refill.
    const moves: Promise<void>[] = [];
    for (const f of phase.falls) {
      const v = this.views.get(f.id);
      if (v)
        moves.push(
          this.tween({
            targets: v,
            y: py(f.to),
            duration: 120 + (f.to - f.from) * 45,
            ease: 'Bounce.easeOut',
          }),
        );
    }
    for (const s of phase.spawned) {
      const v = this.makeView(s.piece, s.x, s.from);
      moves.push(
        this.tween({
          targets: v,
          y: py(s.y),
          duration: 160 + (s.y - s.from) * 45,
          ease: 'Bounce.easeOut',
        }),
      );
    }
    await Promise.all(moves);
  }

  private checkEnd(): void {
    if (this.finished) return;
    if (this.levelScore >= this.target) {
      this.finished = true;
      void this.levelClear();
    } else if (this.moves <= 0) {
      this.finished = true;
      this.fail();
    }
  }

  // ── Effects ─────────────────────────────────────────────────────────────

  private burst(x: number, y: number, tint: number): void {
    const p = this.add.particles(x, y, Tex.dot, {
      speed: { min: 80, max: 260 },
      lifespan: 380,
      scale: { start: 1, end: 0 },
      tint: [tint, 0xffffff],
      emitting: false,
    });
    p.setDepth(8).explode(7);
    this.time.delayedCall(450, () => p.destroy());
  }

  private floatPoints(phase: Phase): void {
    if (!phase.cleared.length) return;
    const cx = phase.cleared.reduce((s, c) => s + px(c.x), 0) / phase.cleared.length;
    const cy = phase.cleared.reduce((s, c) => s + py(c.y), 0) / phase.cleared.length;
    const t = addText(this, cx, cy, `+${phase.points}`, 34, {
      color: '#ffffff',
      stroke: '#ff4f8b',
      strokeThickness: 8,
    }).setDepth(12);
    this.tweens.add({
      targets: t,
      y: cy - 70,
      alpha: 0,
      duration: 800,
      onComplete: () => t.destroy(),
    });
  }

  private banner(text: string, color: string): void {
    const t = addText(this, GAME_WIDTH / 2, 760, text, 66, {
      color,
      stroke: '#ffffff',
      strokeThickness: 12,
    })
      .setDepth(15)
      .setScale(0.4);
    this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: t,
      alpha: 0,
      y: 700,
      delay: 550,
      duration: 350,
      onComplete: () => t.destroy(),
    });
  }

  override update(_t: number, deltaMs: number): void {
    if (this.busy || this.finished) return;
    this.idle += deltaMs;
    // A gentle hint after a few idle seconds.
    if (this.idle > 6000) {
      this.idle = 0;
      const h = this.game_.hint();
      if (!h) return;
      for (const c of h) {
        const v = this.views.get(this.game_.at(c)!.id);
        if (v)
          this.tweens.add({
            targets: v,
            angle: { from: -12, to: 12 },
            duration: 90,
            yoyo: true,
            repeat: 3,
            onComplete: () => v.setAngle(0),
          });
      }
    }
  }

  // ── Flow ────────────────────────────────────────────────────────────────

  private intro(): void {
    this.busy = true;
    const t = addText(
      this,
      GAME_WIDTH / 2,
      720,
      `FASE ${this.level}\nFaça ${formatNumber(this.target)} pontos\nem ${this.moves} jogadas!`,
      52,
      {
        color: '#7a3e9d',
        stroke: '#ffffff',
        strokeThickness: 12,
      },
    ).setDepth(30);
    getServices(this).sfx.play('start');
    this.time.delayedCall(1600, () => {
      this.tweens.add({ targets: t, alpha: 0, duration: 300, onComplete: () => t.destroy() });
      this.busy = false;
    });
  }

  /** Target reached: leftover moves become bonus points, then the next level. */
  private async levelClear(): Promise<void> {
    const { sfx } = getServices(this);
    sfx.play('win');
    this.banner('META ALCANÇADA!', '#5bd46f');
    while (this.moves > 0) {
      await new Promise((r) => this.time.delayedCall(140, r));
      this.moves--;
      this.levelScore += MOVE_BONUS;
      sfx.play('star', Math.min(4, this.moves % 5));
      this.updateHud();
    }
    const total = this.total + this.levelScore;
    const stars =
      this.levelScore >= this.target * 2 ? 3 : this.levelScore >= this.target * 1.5 ? 2 : 1;
    const t = addText(
      this,
      GAME_WIDTH / 2,
      700,
      `FASE ${this.level} COMPLETA!\n${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`,
      58,
      {
        color: '#ff4f8b',
        stroke: '#ffffff',
        strokeThickness: 12,
      },
    )
      .setDepth(30)
      .setScale(0.5);
    this.tweens.add({ targets: t, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.time.delayedCall(2000, () =>
      this.scene.restart({ level: this.level + 1, total } satisfies CrushData),
    );
  }

  private fail(): void {
    getServices(this).sfx.play('hit');
    const score = this.total + this.levelScore;
    const data: GameOverData = {
      gameId: 'crush',
      title: this.level > 1 ? `Chegou na fase ${this.level}!` : 'Acabaram as jogadas!',
      lines: [
        `Faltaram ${formatNumber(this.target - this.levelScore)} pontos na fase ${this.level}`,
      ],
      record: { score, details: { level: this.level } },
      parent: SceneKeys.Crush,
      retry: { scene: SceneKeys.Crush, data: {} },
    };
    this.time.delayedCall(900, () => this.scene.launch(SceneKeys.GameOver, data));
  }
}
