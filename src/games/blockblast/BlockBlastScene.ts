import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { Tex } from '@/platform/art/textures';
import { formatNumber } from '@/platform/ranking';
import type { GameOverData } from '@/platform/scenes/GameOverScene';
import { addText, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { BB_CELL, BBTex } from './art';
import { Board, dealTray, hasAnyMove, PALETTE, placementScore, SIZE, type Piece } from './core';

const BOARD_X = (GAME_WIDTH - SIZE * BB_CELL) / 2;
const BOARD_Y = 250;
const TRAY_Y = 1095;
const TRAY_XS = [130, 360, 590] as const;
const PREVIEW_CELL = 42;
/** The dragged piece floats above the finger so it stays visible. */
const DRAG_LIFT = 170;

interface TraySlot {
  piece: Piece | null;
  view: Phaser.GameObjects.Container | null;
}

export class BlockBlastScene extends Phaser.Scene {
  private board = new Board();
  private cellViews: Phaser.GameObjects.Image[] = [];
  private ghost: Phaser.GameObjects.Image[] = [];
  private slots: TraySlot[] = [];
  private dragging: { slot: number; view: Phaser.GameObjects.Container } | null = null;
  private score = 0;
  private combo = 0;
  private lines = 0;
  private over = false;
  private scoreText!: Phaser.GameObjects.Text;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super(SceneKeys.BlockBlast);
  }

  init(): void {
    this.board = new Board();
    this.cellViews = [];
    this.ghost = [];
    this.slots = [];
    this.dragging = null;
    this.score = 0;
    this.combo = 0;
    this.lines = 0;
    this.over = false;
  }

  create(): void {
    const { best } = getServices(this);
    this.cameras.main.setBackgroundColor(0x24346b);
    this.add
      .graphics()
      .fillStyle(0x1d2b53)
      .fillRoundedRect(BOARD_X - 14, BOARD_Y - 14, SIZE * BB_CELL + 28, SIZE * BB_CELL + 28, 24);

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const px = BOARD_X + x * BB_CELL + BB_CELL / 2;
        const py = BOARD_Y + y * BB_CELL + BB_CELL / 2;
        this.add.image(px, py, BBTex.empty);
        this.cellViews.push(this.add.image(px, py, BBTex.block(0)).setVisible(false));
      }
    }
    for (let i = 0; i < 9; i++)
      this.ghost.push(this.add.image(0, 0, BBTex.block(0)).setAlpha(0.45).setVisible(false));

    iconButton(this, 66, 66, '‹', () => this.scene.start(SceneKeys.Hub));
    addText(
      this,
      GAME_WIDTH / 2,
      60,
      `👑 ${formatNumber(best.get('blockblast')?.score ?? 0)}`,
      30,
      {
        color: '#ffd23f',
      },
    );
    this.scoreText = addText(this, GAME_WIDTH / 2, 140, '0', 84, {
      color: COLORS.textLight,
      stroke: '#0b1430',
      strokeThickness: 10,
    });

    this.sparks = this.add.particles(0, 0, Tex.dot, {
      speed: { min: 80, max: 320 },
      lifespan: 520,
      scale: { start: 0.9, end: 0 },
      emitting: false,
    });
    this.sparks.setDepth(20);

    this.add
      .graphics()
      .fillStyle(0x1d2b53, 0.6)
      .fillRoundedRect(30, TRAY_Y - 120, GAME_WIDTH - 60, 240, 30);
    this.newTray();
    this.bindInput();

    if (import.meta.env.DEV) (window as unknown as { __bb?: BlockBlastScene }).__bb = this;
  }

  // ------------------------------------------------------------ tray

  private newTray(): void {
    this.slots.forEach((s) => s.view?.destroy());
    this.slots = dealTray(this.board).map((piece, i) => ({
      piece,
      view: this.makePieceView(piece, i),
    }));
  }

  private makePieceView(piece: Piece, slot: number): Phaser.GameObjects.Container {
    const view = this.add.container(TRAY_XS[slot], TRAY_Y);
    const { w, h, cells } = piece.shape;
    for (const c of cells) {
      view.add(
        this.add.image(
          (c.x - (w - 1) / 2) * BB_CELL,
          (c.y - (h - 1) / 2) * BB_CELL,
          BBTex.block(piece.color),
        ),
      );
    }
    view.setScale(PREVIEW_CELL / BB_CELL).setDepth(10);
    view.setScale(0);
    this.tweens.add({
      targets: view,
      scale: PREVIEW_CELL / BB_CELL,
      duration: 220,
      ease: 'Back.easeOut',
      delay: slot * 60,
    });
    return view;
  }

  private bindInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.over || this.dragging || p.y < TRAY_Y - 130) return;
      const slot = TRAY_XS.findIndex((x) => Math.abs(p.x - x) < 115);
      const view = this.slots[slot]?.view;
      if (slot < 0 || !view) return;
      this.dragging = { slot, view };
      this.tweens.killTweensOf(view);
      view.setScale(1).setDepth(30);
      this.moveDragged(p);
    });
    this.input.on(
      Phaser.Input.Events.POINTER_MOVE,
      (p: Phaser.Input.Pointer) => this.dragging && this.moveDragged(p),
    );
    const drop = (p: Phaser.Input.Pointer) => this.dragging && this.drop(p);
    this.input.on(Phaser.Input.Events.POINTER_UP, drop);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, drop);
  }

  /** Top-left board cell under the dragged piece. */
  private target(p: Phaser.Input.Pointer, piece: Piece): { x: number; y: number } {
    const { w, h } = piece.shape;
    const left = p.x - (w * BB_CELL) / 2;
    const top = p.y - DRAG_LIFT - (h * BB_CELL) / 2;
    return {
      x: Math.round((left - BOARD_X) / BB_CELL),
      y: Math.round((top - BOARD_Y) / BB_CELL),
    };
  }

  private moveDragged(p: Phaser.Input.Pointer): void {
    const drag = this.dragging;
    const piece = drag && this.slots[drag.slot]?.piece;
    if (!drag || !piece) return;
    drag.view.setPosition(p.x, p.y - DRAG_LIFT);
    const { x, y } = this.target(p, piece);
    this.showGhost(piece, x, y);
  }

  private showGhost(piece: Piece, ox: number, oy: number): void {
    this.ghost.forEach((g) => g.setVisible(false));
    this.renderBoard();
    if (!this.board.canPlace(piece.shape, ox, oy)) return;
    piece.shape.cells.forEach((c, i) => {
      this.ghost[i]
        ?.setTexture(BBTex.block(piece.color))
        .setPosition(BOARD_X + (ox + c.x + 0.5) * BB_CELL, BOARD_Y + (oy + c.y + 0.5) * BB_CELL)
        .setVisible(true);
    });
    // Preview the lines this move would clear.
    const preview = this.board.clone().place(piece, ox, oy);
    for (const c of preview.cleared) {
      this.cellViews[c.y * SIZE + c.x]
        ?.setTexture(BBTex.block(piece.color))
        .setVisible(true)
        .setAlpha(0.85);
    }
  }

  private drop(p: Phaser.Input.Pointer): void {
    const drag = this.dragging;
    this.dragging = null;
    this.ghost.forEach((g) => g.setVisible(false));
    const slot = drag ? this.slots[drag.slot] : undefined;
    if (!drag || !slot?.piece) return;
    const piece = slot.piece;
    const { x, y } = this.target(p, piece);

    if (!this.board.canPlace(piece.shape, x, y)) {
      getServices(this).sfx.play('locked');
      this.tweens.add({
        targets: drag.view,
        x: TRAY_XS[drag.slot],
        y: TRAY_Y,
        scale: PREVIEW_CELL / BB_CELL,
        duration: 180,
        onComplete: () => drag.view.setDepth(10),
      });
      this.renderBoard();
      return;
    }

    drag.view.destroy();
    slot.piece = null;
    slot.view = null;
    this.placePiece(piece, x, y);
  }

  // ------------------------------------------------------------ rules

  private placePiece(piece: Piece, x: number, y: number): void {
    const { sfx } = getServices(this);
    const result = this.board.place(piece, x, y);
    const lineCount = result.rows.length + result.cols.length;
    const perfect = lineCount > 0 && this.board.isEmpty;
    const gained = placementScore(piece.shape.cells.length, lineCount, this.combo, perfect);
    this.combo = lineCount > 0 ? this.combo + 1 : 0;
    this.lines += lineCount;
    this.addScore(gained);

    if (lineCount > 0) {
      sfx.play('win');
      sfx.vibrate(30);
      for (const c of result.cleared) {
        const px = BOARD_X + (c.x + 0.5) * BB_CELL;
        const py = BOARD_Y + (c.y + 0.5) * BB_CELL;
        this.sparks.setParticleTint(PALETTE[piece.color]!);
        this.sparks.explode(3, px, py);
      }
      const label = perfect
        ? 'TABULEIRO LIMPO!'
        : this.combo > 1
          ? `Combo x${this.combo}!`
          : lineCount > 1
            ? `${lineCount} linhas!`
            : '';
      this.popText(`+${gained}${label ? `\n${label}` : ''}`, x, y);
      if (lineCount >= 2) this.cameras.main.shake(180, 0.006);
    } else {
      sfx.play('pop');
    }
    this.renderBoard();

    if (this.slots.every((s) => s.piece === null)) this.newTray();
    if (
      !hasAnyMove(
        this.board,
        this.slots.map((s) => s.piece),
      )
    )
      this.gameOver();
  }

  private addScore(n: number): void {
    const from = this.score;
    this.score += n;
    this.tweens.addCounter({
      from,
      to: this.score,
      duration: 300,
      onUpdate: (t) => this.scoreText.setText(formatNumber(t.getValue() ?? 0)),
    });
  }

  private popText(text: string, cx: number, cy: number): void {
    const t = addText(
      this,
      BOARD_X + (cx + 1) * BB_CELL,
      BOARD_Y + (cy + 0.5) * BB_CELL,
      text,
      44,
      {
        color: '#ffd23f',
        stroke: '#1d2b53',
        strokeThickness: 8,
      },
    ).setDepth(40);
    t.setX(Phaser.Math.Clamp(t.x, 200, GAME_WIDTH - 200));
    this.tweens.add({
      targets: t,
      y: t.y - 110,
      alpha: 0,
      duration: 1100,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  private renderBoard(): void {
    this.cellViews.forEach((img, i) => {
      const c = this.board.cells[i] ?? -1;
      img.setAlpha(1).setVisible(c >= 0);
      if (c >= 0) img.setTexture(BBTex.block(c));
    });
  }

  private gameOver(): void {
    this.over = true;
    getServices(this).sfx.play('hit');
    this.cellViews.forEach((img, i) =>
      this.time.delayedCall(i * 8, () => img.visible && img.setTint(0x8892a8)),
    );
    const data: GameOverData = {
      gameId: 'blockblast',
      title: 'Sem espaço!',
      lines: [`Linhas limpas: ${this.lines}`],
      record: { score: this.score, details: { lines: this.lines } },
      parent: SceneKeys.BlockBlast,
      retry: { scene: SceneKeys.BlockBlast },
    };
    this.time.delayedCall(900, () => this.scene.launch(SceneKeys.GameOver, data));
  }
}
