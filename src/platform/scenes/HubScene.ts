import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { GAMES, type GameDefinition } from '@/games/registry';
import { loadGame } from '@/platform/gameLoader';
import { formatNumber } from '@/platform/ranking';
import { askName } from '@/platform/ui/nameDialog';
import { addBackground, addText, Button, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';

const COLS = 3;
const CARD_W = 214;
const CARD_H = 300;
const GAP = 16;
/** Scrollable area for the game grid (between the header and the footer). */
const VIEW_TOP = 262;
const VIEW_BOTTOM = 1228;
const PAD_TOP = 24;
const PAD_BOTTOM = 36;
/** A finger moving more than this is a scroll, not a tap. */
const DRAG_SLOP = 12;

/** Scroll position survives trips into a game and back. */
let savedScroll = 0;

/** Main menu: pick a game, set your nickname, toggle sound. */
export class HubScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Hub);
  }

  private opening = false;
  private list!: Phaser.GameObjects.Container;
  private scrollBar!: Phaser.GameObjects.Graphics;
  private scroll = 0;
  private maxScroll = 0;
  private velocity = 0;
  private drag: { startY: number; startScroll: number; lastY: number; lastT: number } | null = null;
  /** The current gesture became a scroll: taps on cards are ignored until the next press. */
  private dragged = false;

  create(): void {
    this.opening = false;
    this.drag = null;
    this.dragged = false;
    this.velocity = 0;
    const { profile, sfx, leaderboard } = getServices(this);
    const cx = GAME_WIDTH / 2;
    addBackground(this);

    const title = addText(this, cx, 90, 'Fliperama', 84, {
      color: '#ffd23f',
      stroke: '#1d2b53',
      strokeThickness: 16,
    });
    this.tweens.add({
      targets: title,
      scale: { from: 1, to: 1.04 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const sound = iconButton(this, GAME_WIDTH - 66, 66, sfx.muted ? '🔇' : '🔊', () => {
      sfx.muted = !sfx.muted;
      profile.update({ muted: sfx.muted });
      sound.label.setText(sfx.muted ? '🔇' : '🔊');
    });

    const nameLabel = () => `👤 ${profile.get().name || 'Escolha seu nome'}  ✎`;
    const nameButton = new Button(
      this,
      cx,
      200,
      nameLabel(),
      async () => {
        const name = await askName(this, profile.get().name);
        if (name) {
          profile.update({ name });
          nameButton.label.setText(nameLabel());
        }
      },
      {
        width: 520,
        height: 80,
        fontSize: 30,
        color: COLORS.panel,
        shade: 0xc7cfdc,
        textColor: COLORS.text,
      },
    );
    // Header stays above the scrolling grid (also for input: hidden cards must not steal taps).
    nameButton.setDepth(10);
    sound.setDepth(10);

    this.buildGrid();

    addText(
      this,
      cx,
      1255,
      leaderboard.hasRemote ? '🌎 Ranking global ativo' : '📱 Ranking salvo neste aparelho',
      22,
      { color: COLORS.textLight, stroke: '#1d2b53', strokeThickness: 5 },
    );

    // The hub is already on screen: warm the game chunks in the background so taps feel instant.
    this.time.delayedCall(1500, () => {
      for (const game of GAMES) loadGame(this.game, game).catch(() => undefined);
    });
  }

  // ── Scrollable grid ─────────────────────────────────────────────────────

  private buildGrid(): void {
    this.list = this.add.container(0, 0);
    const mask = this.make.graphics({}, false);
    mask.fillStyle(0xffffff).fillRect(0, VIEW_TOP, GAME_WIDTH, VIEW_BOTTOM - VIEW_TOP);
    this.list.setMask(mask.createGeometryMask());

    const rows = Math.ceil(GAMES.length / COLS);
    const gridW = COLS * CARD_W + (COLS - 1) * GAP;
    GAMES.forEach((game, i) => {
      const x = (GAME_WIDTH - gridW) / 2 + CARD_W / 2 + (i % COLS) * (CARD_W + GAP);
      const y = VIEW_TOP + PAD_TOP + CARD_H / 2 + Math.floor(i / COLS) * (CARD_H + GAP);
      this.buildCard(game, x, y);
    });
    const contentH = PAD_TOP + rows * CARD_H + (rows - 1) * GAP + PAD_BOTTOM;
    this.maxScroll = Math.max(0, contentH - (VIEW_BOTTOM - VIEW_TOP));
    this.scroll = Phaser.Math.Clamp(savedScroll, 0, this.maxScroll);
    this.scrollBar = this.add.graphics().setDepth(5);

    const inView = (p: Phaser.Input.Pointer) => p.y >= VIEW_TOP && p.y <= VIEW_BOTTOM;
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      this.dragged = false;
      this.velocity = 0;
      this.drag = inView(p)
        ? { startY: p.y, startScroll: this.scroll, lastY: p.y, lastT: this.time.now }
        : null;
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      const d = this.drag;
      if (!d || !p.isDown) return;
      if (!this.dragged && Math.abs(p.y - d.startY) > DRAG_SLOP) this.dragged = true;
      if (!this.dragged) return;
      const now = this.time.now;
      const dt = Math.max(1, now - d.lastT) / 1000;
      this.velocity = Phaser.Math.Linear(this.velocity, -(p.y - d.lastY) / dt, 0.5);
      d.lastY = p.y;
      d.lastT = now;
      this.scroll = this.rubberBand(d.startScroll - (p.y - d.startY));
    });
    const release = () => {
      const d = this.drag;
      if (!d) return;
      this.drag = null;
      // A finger that stopped before lifting shouldn't fling.
      if (this.time.now - d.lastT > 120) this.velocity = 0;
    };
    this.input.on(Phaser.Input.Events.POINTER_UP, release);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, release);
    this.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
        this.velocity = 0;
        this.scroll = Phaser.Math.Clamp(this.scroll + dy, 0, this.maxScroll);
      },
    );

    // First visit: a little nudge shows the grid scrolls.
    if (savedScroll === 0 && this.maxScroll > 0) {
      const hint = { v: 0 };
      this.tweens.add({
        targets: hint,
        v: 70,
        delay: 600,
        duration: 380,
        yoyo: true,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          if (!this.drag) this.scroll = hint.v;
        },
      });
    }
    this.applyScroll();
  }

  /** Past the ends the content follows the finger at a third of the speed. */
  private rubberBand(v: number): number {
    if (v < 0) return v / 3;
    if (v > this.maxScroll) return this.maxScroll + (v - this.maxScroll) / 3;
    return v;
  }

  override update(_t: number, deltaMs: number): void {
    if (!this.list) return;
    const dt = deltaMs / 1000;
    if (!this.drag) {
      if (Math.abs(this.velocity) > 5) {
        this.scroll += this.velocity * dt;
        this.velocity *= Math.exp(-dt * 4);
      } else this.velocity = 0;
      // Spring back from an overscroll.
      const target = Phaser.Math.Clamp(this.scroll, 0, this.maxScroll);
      if (target !== this.scroll) {
        this.scroll += (target - this.scroll) * (1 - Math.exp(-dt * 12));
        if (Math.abs(target - this.scroll) < 0.5) this.scroll = target;
        this.velocity *= 0.5;
      }
    }
    this.applyScroll();
  }

  private applyScroll(): void {
    this.list.y = -this.scroll;
    savedScroll = Phaser.Math.Clamp(this.scroll, 0, this.maxScroll);
    const g = this.scrollBar.clear();
    if (this.maxScroll <= 0) return;
    const viewH = VIEW_BOTTOM - VIEW_TOP;
    const barH = Math.max(60, (viewH * viewH) / (viewH + this.maxScroll));
    const t = Phaser.Math.Clamp(this.scroll / this.maxScroll, 0, 1);
    g.fillStyle(0xffffff, 0.55).fillRoundedRect(
      GAME_WIDTH - 12,
      VIEW_TOP + 8 + t * (viewH - 16 - barH),
      6,
      barH,
      3,
    );
  }

  /** Taps count only when the gesture wasn't a scroll and happened inside the visible area. */
  private isTap(p: Phaser.Input.Pointer): boolean {
    return !this.dragged && p.y >= VIEW_TOP && p.y <= VIEW_BOTTOM;
  }

  private open(game: GameDefinition): void {
    if (this.opening) return;
    this.opening = true;
    loadGame(this.game, game).then(
      () => {
        if (this.sys.isActive()) this.scene.start(game.entryScene);
      },
      (err: unknown) => {
        console.warn(`Falha ao carregar ${game.id}`, err);
        this.opening = false;
        if (!this.sys.isActive()) return;
        const msg = addText(this, GAME_WIDTH / 2, 1200, 'Sem conexão. Tente de novo.', 26, {
          color: COLORS.textLight,
          stroke: '#1d2b53',
          strokeThickness: 6,
        });
        this.time.delayedCall(2200, () => msg.destroy());
      },
    );
  }

  private buildCard(game: GameDefinition, x: number, y: number): void {
    const services = getServices(this);
    const card = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.2).fillRoundedRect(
      -CARD_W / 2 + 4,
      -CARD_H / 2 + 8,
      CARD_W,
      CARD_H,
      28,
    );
    g.fillStyle(game.shade).fillRoundedRect(-CARD_W / 2, -CARD_H / 2 + 6, CARD_W, CARD_H, 28);
    g.fillStyle(game.color).fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 28);
    g.fillStyle(0xffffff, 0.92).fillRoundedRect(
      -CARD_W / 2 + 12,
      -CARD_H / 2 + 12,
      CARD_W - 24,
      150,
      20,
    );
    card.add(g);

    const icon = this.add.image(0, -CARD_H / 2 + 87, game.icon);
    icon.setScale(Math.min(116 / icon.width, 116 / icon.height));
    card.add(icon);
    this.tweens.add({
      targets: icon,
      y: icon.y - 6,
      duration: 900 + Math.random() * 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    card.add(
      addText(this, 0, 42, game.title, game.title.length > 12 ? 21 : 27, {
        color: COLORS.textLight,
        stroke: '#00000055',
        strokeThickness: 5,
      }),
    );
    card.add(addText(this, 0, 80, game.tagline, 18, { color: '#ffffffdd', weight: 'normal' }));
    const best = game.personalBest(services);
    card.add(
      addText(this, 0, 116, best ? `👑 ${formatNumber(best.score)}` : 'Sem recorde', 21, {
        color: COLORS.textLight,
      }),
    );

    card.setSize(CARD_W, CARD_H);
    card.setInteractive({ useHandCursor: true });
    card.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.isTap(p)) card.setScale(0.96);
    });
    card.on('pointerout', () => card.setScale(1));
    card.on('pointermove', () => {
      if (this.dragged) card.setScale(1);
    });
    card.on('pointerup', (p: Phaser.Input.Pointer) => {
      card.setScale(1);
      if (!this.isTap(p)) return;
      services.sfx.play('click');
      this.open(game);
    });
    this.list.add(card);

    // Separate object (not a child) so its tap is not also a card tap.
    const ranking = new Button(
      this,
      x + CARD_W / 2 - 36,
      y - CARD_H / 2 + 34,
      '🏆',
      () => {
        if (this.isTap(this.input.activePointer))
          this.scene.start(SceneKeys.Leaderboard, { gameId: game.id });
      },
      { width: 58, height: 52, fontSize: 26, color: COLORS.panel, shade: 0xc7cfdc },
    );
    this.list.add(ranking);
  }
}
