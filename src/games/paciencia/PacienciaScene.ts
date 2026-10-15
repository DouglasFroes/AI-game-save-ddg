import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { formatNumber, formatTime } from '@/platform/ranking';
import type { GameOverData } from '@/platform/scenes/GameOverScene';
import { addText, Button, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { CARD_BACK, CARD_H, CARD_SLOT, CARD_W, cardKey, ensureCardTextures, SUITS } from './art';
import { Klondike, type Card, type Loc } from './core';

const GAP = (GAME_WIDTH - 7 * CARD_W) / 8;
const colX = (i: number) => GAP + CARD_W / 2 + i * (CARD_W + GAP);
const TOP_Y = 250;
const TAB_Y = 420;
const TAB_BOTTOM = 1150;
const DOWN_STEP = 22;
const UP_STEP = 40;
/** A press that moves less than this is a tap (auto-move), not a drag. */
const TAP_SLOP = 12;

interface Drag {
  from: Loc;
  index: number;
  images: Phaser.GameObjects.Image[];
  startX: number;
  startY: number;
  offsets: Array<{ x: number; y: number }>;
  moved: boolean;
}

/** "Paciência": classic Klondike solitaire. Tap a card to send it to the best place, or drag it. */
export class PacienciaScene extends Phaser.Scene {
  private k = new Klondike();
  private layer!: Phaser.GameObjects.Container;
  private hud!: { score: Phaser.GameObjects.Text; time: Phaser.GameObjects.Text };
  private seconds = 0;
  private started = false;
  private ended = false;
  private autoTimer = 0;
  private drag: Drag | null = null;

  constructor() {
    super(SceneKeys.Paciencia);
  }

  init(): void {
    this.k = new Klondike();
    this.seconds = 0;
    this.started = false;
    this.ended = false;
    this.drag = null;
  }

  create(): void {
    ensureCardTextures(this);
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x1f8a4c, 0x1f8a4c, 0x135e33, 0x135e33, 1).fillRect(
      0,
      0,
      GAME_WIDTH,
      1280,
    );
    iconButton(this, 60, 60, '‹', () => this.scene.start(SceneKeys.Hub)).setDepth(10);
    this.hud = {
      score: addText(this, GAME_WIDTH / 2, 56, '0', 48, { color: '#ffffff' }),
      time: addText(this, GAME_WIDTH / 2, 110, '0:00', 26, { color: '#d8f3dc', weight: 'normal' }),
    };
    addText(this, GAME_WIDTH - 110, 110, 'Toque para mover', 20, {
      color: '#d8f3dc',
      weight: 'normal',
    });
    this.layer = this.add.container(0, 0);
    new Button(this, 200, 1220, '↻ Novo jogo', () => this.scene.restart(), {
      width: 300,
      height: 80,
      fontSize: 30,
      color: COLORS.secondary,
      shade: COLORS.secondaryDark,
    });
    new Button(this, 520, 1220, '🏳 Encerrar', () => this.finish(), {
      width: 300,
      height: 80,
      fontSize: 30,
      color: 0xe0a800,
      shade: 0xa07800,
    });

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => this.dragMove(p));
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => this.dragEnd(p));
    this.render();
    if (import.meta.env.DEV)
      (window as unknown as { __paciencia?: PacienciaScene }).__paciencia = this;
  }

  get state(): Klondike {
    return this.k;
  }

  /** Vertical step of each card in column `t` (squeezed when the column gets tall). */
  private steps(t: number): number[] {
    const pile = this.k.tableau[t]!;
    const raw = pile.map((c) => (c.up ? UP_STEP : DOWN_STEP));
    const total = raw.slice(0, -1).reduce((a, b) => a + b, 0);
    const room = TAB_BOTTOM - TAB_Y - CARD_H;
    const k = total > room ? room / total : 1;
    return raw.map((s) => s * k);
  }

  private cardY(t: number, index: number): number {
    const s = this.steps(t);
    let y = TAB_Y;
    for (let i = 0; i < index; i++) y += s[i]!;
    return y;
  }

  private img(x: number, y: number, card: Card | null, key?: string): Phaser.GameObjects.Image {
    const tex = key ?? (card && card.up ? cardKey(card.suit, card.rank) : CARD_BACK);
    const im = this.add.image(x, y, tex).setDisplaySize(CARD_W, CARD_H);
    this.layer.add(im);
    return im;
  }

  /** Rebuilds the table from the rules state (cheap: 52 images). */
  private render(): void {
    this.layer.removeAll(true);
    const k = this.k;
    // Stock.
    const stock = this.img(colX(0), TOP_Y, null, k.stock.length ? CARD_BACK : CARD_SLOT);
    stock.setInteractive().on('pointerup', () => this.tapStock());
    if (!k.stock.length && k.waste.length)
      this.layer.add(addText(this, colX(0), TOP_Y, '↻', 48, { color: '#ffffffaa' }));
    // Waste: the top three fanned a little.
    const shown = k.waste.slice(-3);
    shown.forEach((c, i) => {
      const im = this.img(colX(1) + i * 16, TOP_Y, c);
      if (i === shown.length - 1) this.pickable(im, { kind: 'waste' }, k.waste.length - 1);
    });
    if (!k.waste.length) this.img(colX(1), TOP_Y, null, CARD_SLOT);
    // Foundations.
    k.foundations.forEach((f, i) => {
      const top = f[f.length - 1];
      const im = this.img(colX(3 + i), TOP_Y, top ?? null, top ? undefined : CARD_SLOT);
      if (!top)
        this.layer.add(addText(this, colX(3 + i), TOP_Y, SUITS[i]!, 44, { color: '#ffffff55' }));
      else this.pickable(im, { kind: 'foundation', i }, f.length - 1);
    });
    // Columns.
    k.tableau.forEach((pile, t) => {
      if (!pile.length) this.img(colX(t), TAB_Y + CARD_H / 2, null, CARD_SLOT);
      pile.forEach((c, i) => {
        const im = this.img(colX(t), this.cardY(t, i) + CARD_H / 2, c);
        if (c.up) this.pickable(im, { kind: 'tableau', i: t }, i);
      });
    });
    this.hud.score.setText(formatNumber(k.score));
  }

  private pickable(im: Phaser.GameObjects.Image, from: Loc, index: number): void {
    im.setInteractive({ useHandCursor: true });
    im.on('pointerdown', (p: Phaser.Input.Pointer) => this.dragStart(p, from, index));
  }

  private tapStock(): void {
    if (this.ended || this.drag) return;
    const r = this.k.draw();
    if (!r) return;
    this.started = true;
    getServices(this).sfx.play(r === 'draw' ? 'click' : 'pop');
    this.render();
  }

  private dragStart(p: Phaser.Input.Pointer, from: Loc, index: number): void {
    if (this.ended || this.drag) return;
    const cards = this.k.movable(from, index);
    if (!cards) return;
    // The images of the picked cards: the last `cards.length` images of that pile on screen.
    const images = this.layer.list.filter(
      (o) => o instanceof Phaser.GameObjects.Image,
    ) as Phaser.GameObjects.Image[];
    const picked = this.imagesOf(from, index, images, cards.length);
    this.drag = {
      from,
      index,
      images: picked,
      startX: p.x,
      startY: p.y,
      offsets: picked.map((im) => ({ x: im.x - p.x, y: im.y - p.y })),
      moved: false,
    };
  }

  private imagesOf(from: Loc, index: number, images: Phaser.GameObjects.Image[], count: number) {
    if (from.kind === 'tableau') {
      const x = colX(from.i);
      const col = images.filter((im) => Math.abs(im.x - x) < 1 && im.y >= TAB_Y);
      return col.slice(index, index + count);
    }
    const x = from.kind === 'waste' ? null : colX(3 + from.i);
    const row = images.filter(
      (im) =>
        Math.abs(im.y - TOP_Y) < 1 &&
        (x === null ? im.x > colX(1) - 2 && im.x < colX(2) : Math.abs(im.x - x) < 1),
    );
    return row.slice(-1);
  }

  private dragMove(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    if (!d || !p.isDown) return;
    if (!d.moved && Math.hypot(p.x - d.startX, p.y - d.startY) < TAP_SLOP) return;
    d.moved = true;
    d.images.forEach((im, i) => {
      im.setPosition(p.x + d.offsets[i]!.x, p.y + d.offsets[i]!.y);
      this.layer.bringToTop(im);
    });
  }

  private dragEnd(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const { sfx } = getServices(this);
    let moved: boolean;
    if (!d.moved) moved = this.k.auto(d.from, d.index) !== null;
    else {
      const to = this.dropTarget(p.x, p.y + (d.offsets[0]?.y ?? 0) + CARD_H / 2);
      moved = !!to && this.k.move(d.from, d.index, to);
    }
    if (moved) {
      this.started = true;
      sfx.play('pop');
    } else if (!d.moved) {
      sfx.play('locked');
      d.images.forEach((im) =>
        this.tweens.add({ targets: im, x: im.x + 6, duration: 40, yoyo: true, repeat: 1 }),
      );
    }
    this.time.delayedCall(moved || d.moved ? 0 : 200, () => this.render());
    if (this.k.won) this.finish();
  }

  /** Which pile is under the dropped cards. */
  private dropTarget(x: number, y: number): Loc | null {
    const col = Math.round((x - colX(0)) / (CARD_W + GAP));
    if (col < 0 || col > 6) return null;
    if (y < TOP_Y + CARD_H) return col >= 3 ? { kind: 'foundation', i: col - 3 } : null;
    return { kind: 'tableau', i: col };
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    const k = this.k;
    const { sfx } = getServices(this);
    sfx.play(k.won ? 'win' : 'hit');
    const score = k.finalScore(this.seconds);
    const cards = k.foundations.reduce((s, f) => s + f.length, 0);
    const data: GameOverData = {
      gameId: 'paciencia',
      title: k.won ? 'Você venceu!' : 'Jogo encerrado',
      lines: [`Cartas na base: ${cards}/52 · Tempo: ${formatTime(this.seconds)}`],
      record: { score, details: { cards, time: Math.round(this.seconds) } },
      parent: SceneKeys.Paciencia,
      retry: { scene: SceneKeys.Paciencia },
    };
    this.time.delayedCall(k.won ? 900 : 200, () => this.scene.launch(SceneKeys.GameOver, data));
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    if (this.started) this.seconds += deltaMs / 1000;
    this.hud.time.setText(formatTime(this.seconds));
    // Everything is open: finish it for the player, one card at a time.
    if (this.k.solvable && !this.drag) {
      this.autoTimer -= deltaMs / 1000;
      if (this.autoTimer <= 0) {
        this.autoTimer = 0.12;
        if (this.k.autoStep()) {
          getServices(this).sfx.play('star', 1);
          this.render();
          if (this.k.won) this.finish();
        }
      }
    }
  }
}
