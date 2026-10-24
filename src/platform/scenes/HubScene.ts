import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import { GAMES, type GameDefinition } from '@/games/registry';
import { canFullscreen, isStandalone, toggleFullscreen } from '@/platform/fullscreen';
import { loadGame } from '@/platform/gameLoader';
import {
  CATEGORY_LABELS,
  filterGames,
  gameOfTheDay,
  type HubFilter,
} from '@/platform/hubCategories';
import { GLOBAL_TOP } from '@/platform/leaderboard';
import { shareWithToast } from '@/platform/share';
import { gameIdFromSearch } from '@/platform/shareLink';
import { formatNumber } from '@/platform/ranking';
import type { Overtake } from '@/platform/rankWatch';
import { drawIcon, type IconKind } from '@/platform/ui/icons';
import { askName } from '@/platform/ui/nameDialog';
import { addBackground, addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';

const MARGIN = 36;
const CONTENT_W = GAME_WIDTH - MARGIN * 2;

const COLS = 3;
const CARD_W = 208;
const CARD_H = 204;
const GAP = 16;
/** Scrollable area for the game grid (between the filters and the footer). */
const VIEW_TOP = 516;
const VIEW_BOTTOM = 1234;
const PAD_TOP = 14;
const PAD_BOTTOM = 28;
/** A finger moving more than this is a scroll, not a tap. */
const DRAG_SLOP = 12;

const SHEET_H = 560;
const NAVY = COLORS.navy;
const GOLD = 0xffd23f;
const ICON_GREY = 0x5b6b8c;

const FILTERS: readonly HubFilter[] = ['todos', 'favoritos', 'acao', 'puzzle', 'mesa', 'reflexo'];

/** Scroll position and filter survive trips into a game and back. */
let savedScroll = 0;
let savedFilter: HubFilter = 'todos';
/** Game asked for by a shared link (`?jogo=id`); opened once, right after the hub appears. */
let pendingLink: string | null =
  typeof window === 'undefined'
    ? null
    : gameIdFromSearch(window.location.search, (id) => GAMES.some((g) => g.id === id));
/** The "what's your name?" modal opens by itself at most once per session. */
let askedName = pendingLink !== null;
/** When the boards were last checked for overtakes (at most once a minute). */
let lastRivalCheck = -Infinity;
const RIVAL_CHECK_MS = 60_000;

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Main menu: continue playing, filter by kind, pick a game, set your nickname, toggle sound. */
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
  private filter: HubFilter = 'todos';
  private chips = new Map<HubFilter, () => void>();
  private sheet: Phaser.GameObjects.Container | null = null;

  create(): void {
    this.opening = false;
    this.drag = null;
    this.dragged = false;
    this.velocity = 0;
    this.sheet = null;
    this.chips = new Map();
    this.filter = savedFilter;
    const { profile, sfx, leaderboard } = getServices(this);
    addBackground(this);

    // Header: title on the left, sound and full screen on the right.
    addText(this, MARGIN, 72, 'Fliperama', 58, {
      color: '#ffd23f',
      stroke: '#1d2b53',
      strokeThickness: 12,
    })
      .setOrigin(0, 0.5)
      .setDepth(10);

    const soundKind = (): IconKind => (sfx.muted ? 'speakerOff' : 'speaker');
    let soundIcon: Phaser.GameObjects.Graphics;
    const sound = this.headerButton(GAME_WIDTH - MARGIN - 40, 72, () => {
      sfx.muted = !sfx.muted;
      profile.update({ muted: sfx.muted });
      soundIcon.destroy();
      soundIcon = drawIcon(this, soundKind(), 0, -2, 40, NAVY);
      sound.add(soundIcon);
    });
    soundIcon = drawIcon(this, soundKind(), 0, -2, 40, NAVY);
    sound.add(soundIcon);

    if (!isStandalone()) {
      const full = this.headerButton(GAME_WIDTH - MARGIN - 40 - 96, 72, () => {
        if (!canFullscreen()) {
          this.toast(
            'No iPhone: toque em Compartilhar e\n"Adicionar à Tela de Início" para tela cheia',
          );
          return;
        }
        void toggleFullscreen();
      });
      full.add(drawIcon(this, 'expand', 0, -2, 38, NAVY));
    }

    // Player chip: who is playing, tap to change the nickname.
    const nameLabel = () =>
      profile.get().name ? `Olá, ${profile.get().name}` : 'Escolha seu nome';
    const nameButton = new Button(
      this,
      GAME_WIDTH / 2,
      172,
      nameLabel(),
      async () => {
        const name = await askName(this, profile.get().name);
        if (name) {
          profile.update({ name });
          nameButton.label.setText(nameLabel());
        }
      },
      {
        width: CONTENT_W,
        height: 72,
        fontSize: 28,
        color: COLORS.panel,
        shade: 0xc7cfdc,
        textColor: COLORS.text,
      },
    ).setDepth(10);
    nameButton.label.setStroke('#000000', 0);
    nameButton.add([
      drawIcon(this, 'user', -CONTENT_W / 2 + 44, -2, 34, ICON_GREY),
      drawIcon(this, 'pencil', CONTENT_W / 2 - 44, -2, 28, ICON_GREY),
    ]);

    // First visit without a nickname: ask for it right away (only once, and only then).
    if (!profile.get().name && !askedName) {
      askedName = true;
      this.time.delayedCall(400, async () => {
        const name = await askName(this, '');
        if (name && this.sys.isActive()) {
          profile.update({ name });
          nameButton.label.setText(nameLabel());
        }
      });
    }

    this.buildHero();
    this.buildChips();
    this.buildScroller();
    this.populateGrid(false);

    addText(
      this,
      GAME_WIDTH / 2,
      1258,
      leaderboard.hasRemote ? 'Ranking global ativo' : 'Ranking salvo neste aparelho',
      20,
      { color: COLORS.textLight, stroke: '#1d2b53', strokeThickness: 5 },
    );

    // A friend's link goes straight into the game (the URL is cleaned so a refresh shows the hub).
    const linked = pendingLink ? GAMES.find((g) => g.id === pendingLink) : undefined;
    if (linked) {
      pendingLink = null;
      window.history.replaceState(null, '', window.location.pathname);
      this.time.delayedCall(300, () => this.open(linked));
    }

    void this.checkRivals();

    // The hub is already on screen: warm the game chunks in the background so taps feel instant.
    this.time.delayedCall(1500, () => {
      for (const game of GAMES) loadGame(this.game, game).catch(() => undefined);
    });
  }

  /** White rounded button (80×68) for the header; the caller adds the icon on top. */
  private headerButton(x: number, y: number, onClick: () => void): Button {
    return new Button(this, x, y, '', onClick, {
      width: 80,
      height: 68,
      color: COLORS.panel,
      shade: 0xc7cfdc,
    }).setDepth(10);
  }

  /** Puts a vector icon and the label side by side, centred as a pair inside a button. */
  private iconWithLabel(
    btn: Button,
    kind: IconKind,
    iconColor: number,
    size: number,
  ): Phaser.GameObjects.Graphics {
    const gap = 12;
    const total = size + gap + btn.label.width;
    const icon = drawIcon(this, kind, -total / 2 + size / 2, -2, size, iconColor);
    btn.label.x = -total / 2 + size + gap + btn.label.width / 2;
    btn.add(icon);
    return icon;
  }

  private toast(text: string): void {
    const t = addText(this, GAME_WIDTH / 2, 1150, text, 26, {
      color: COLORS.textLight,
      stroke: '#1d2b53',
      strokeThickness: 6,
    }).setDepth(40);
    this.tweens.add({
      targets: t,
      alpha: 0,
      delay: 3500,
      duration: 500,
      onComplete: () => t.destroy(),
    });
  }

  // ── "Continue playing" ──────────────────────────────────────────────────

  /** One big card: the last game played (or the game of the day) with a single obvious button. */
  private buildHero(): void {
    const services = getServices(this);
    const last = GAMES.find((g) => g.id === services.recents.last());
    const game = last ?? gameOfTheDay(GAMES, new Date()) ?? GAMES[0]!;
    const w = CONTENT_W;
    const h = 150;
    const c = this.add.container(GAME_WIDTH / 2, 308).setDepth(10);

    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.2).fillRoundedRect(-w / 2 + 4, -h / 2 + 10, w, h, 32);
    g.fillStyle(game.shade).fillRoundedRect(-w / 2, -h / 2 + 7, w, h, 32);
    g.fillStyle(game.color).fillRoundedRect(-w / 2, -h / 2, w, h, 32);
    g.fillStyle(0xffffff, 0.92).fillRoundedRect(-w / 2 + 16, -h / 2 + 16, 118, 118, 24);
    c.add(g);

    const icon = this.add.image(-w / 2 + 75, 0, game.icon);
    icon.setScale(Math.min(94 / icon.width, 94 / icon.height));
    c.add(icon);
    if (!reducedMotion()) {
      this.tweens.add({
        targets: icon,
        y: -5,
        duration: 1000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    const textX = -w / 2 + 156;
    const outline = { color: COLORS.textLight, stroke: '#00000066', strokeThickness: 5 };
    c.add(
      addText(this, textX, -42, last ? 'CONTINUE JOGANDO' : 'JOGO DO DIA', 18, {
        color: '#ffffffdd',
      }).setOrigin(0, 0.5),
    );
    c.add(
      addText(this, textX, -8, game.title, game.title.length > 15 ? 26 : 32, outline).setOrigin(
        0,
        0.5,
      ),
    );
    const record = game.personalBest(services);
    c.add(
      addText(
        this,
        textX,
        34,
        record ? `Recorde ${formatNumber(record.score)}` : game.tagline,
        21,
        { color: '#ffffffee', weight: 'normal' },
      ).setOrigin(0, 0.5),
    );

    // The one primary action: a big round play button.
    const px = w / 2 - 62;
    const play = this.add.graphics();
    play.fillStyle(0x000000, 0.18).fillCircle(px + 2, 6, 46);
    play.fillStyle(0xffffff).fillCircle(px, 0, 46);
    c.add(play);
    c.add(drawIcon(this, 'play', px + 4, 0, 44, game.shade));

    c.setSize(w, h).setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => c.setScale(0.97));
    c.on('pointerout', () => c.setScale(1));
    c.on('pointerup', () => {
      c.setScale(1);
      services.sfx.play('click');
      this.open(game);
    });
  }

  // ── Filters ─────────────────────────────────────────────────────────────

  private buildChips(): void {
    const y = 438;
    const h = 62;
    const chipW = (f: HubFilter): number =>
      f === 'favoritos' ? 66 : CATEGORY_LABELS[f].length * 14 + 38;
    const total = FILTERS.reduce((sum, f) => sum + chipW(f), 0);
    const gap = Phaser.Math.Clamp((CONTENT_W - total) / (FILTERS.length - 1), 6, 14);
    let x = MARGIN + (CONTENT_W - total - gap * (FILTERS.length - 1)) / 2;

    for (const f of FILTERS) {
      const w = chipW(f);
      const c = this.add.container(x + w / 2, y).setDepth(10);
      x += w + gap;
      const bg = this.add.graphics();
      const label =
        f === 'favoritos'
          ? null
          : addText(this, 0, -1, CATEGORY_LABELS[f], 24, { color: COLORS.text });
      let star: Phaser.GameObjects.Graphics | null = null;
      c.add(bg);
      if (label) c.add(label);

      const paint = () => {
        const on = this.filter === f;
        bg.clear();
        bg.fillStyle(0x000000, 0.16).fillRoundedRect(-w / 2 + 2, -h / 2 + 5, w, h, h / 2);
        bg.fillStyle(on ? NAVY : COLORS.panel).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
        label?.setColor(on ? '#ffd23f' : COLORS.text);
        if (f === 'favoritos') {
          star?.destroy();
          star = drawIcon(this, on ? 'star' : 'starOutline', 0, -1, 30, on ? GOLD : ICON_GREY);
          c.add(star);
        }
      };
      paint();
      this.chips.set(f, paint);

      c.setSize(w, h + 8).setInteractive({ useHandCursor: true });
      c.on('pointerdown', () => c.setScale(0.95));
      c.on('pointerout', () => c.setScale(1));
      c.on('pointerup', () => {
        c.setScale(1);
        if (this.filter === f) return;
        getServices(this).sfx.play('click');
        this.filter = f;
        savedFilter = f;
        for (const repaint of this.chips.values()) repaint();
        this.scroll = 0;
        this.velocity = 0;
        this.populateGrid(true);
      });
    }
  }

  // ── Scrollable grid ─────────────────────────────────────────────────────

  /** One-time scroll plumbing: mask, scroll bar, touch / wheel input. */
  private buildScroller(): void {
    this.list = this.add.container(0, 0);
    const mask = this.make.graphics({}, false);
    mask.fillStyle(0xffffff).fillRect(0, VIEW_TOP, GAME_WIDTH, VIEW_BOTTOM - VIEW_TOP);
    this.list.setMask(mask.createGeometryMask());
    this.scrollBar = this.add.graphics().setDepth(5);

    const inView = (p: Phaser.Input.Pointer) => p.y >= VIEW_TOP && p.y <= VIEW_BOTTOM;
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      this.dragged = false;
      this.velocity = 0;
      this.drag =
        inView(p) && !this.sheet
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
        if (this.sheet) return;
        this.velocity = 0;
        this.scroll = Phaser.Math.Clamp(this.scroll + dy, 0, this.maxScroll);
      },
    );
  }

  /** (Re)builds the cards for the current filter. `fresh` animates them in from the top. */
  private populateGrid(fresh: boolean): void {
    for (const child of this.list.list) this.tweens.killTweensOf(child);
    this.list.removeAll(true);

    const { favorites } = getServices(this);
    const favs = favorites.list();
    const games = filterGames(favorites.sort(GAMES), this.filter, favs);

    if (games.length === 0) {
      this.maxScroll = 0;
      this.scroll = 0;
      this.list.add(this.emptyState());
      this.applyScroll();
      return;
    }

    const rows = Math.ceil(games.length / COLS);
    const gridW = COLS * CARD_W + (COLS - 1) * GAP;
    const animate = fresh && !reducedMotion();
    games.forEach((game, i) => {
      const x = (GAME_WIDTH - gridW) / 2 + CARD_W / 2 + (i % COLS) * (CARD_W + GAP);
      const y = VIEW_TOP + PAD_TOP + CARD_H / 2 + Math.floor(i / COLS) * (CARD_H + GAP);
      const card = this.buildCard(game, x, y, favs.includes(game.id));
      if (animate && i < 12) {
        card.setAlpha(0).setScale(0.9);
        this.tweens.add({
          targets: card,
          alpha: 1,
          scale: 1,
          delay: i * 35,
          duration: 220,
          ease: 'Cubic.easeOut',
        });
      }
    });

    const contentH = PAD_TOP + rows * CARD_H + (rows - 1) * GAP + PAD_BOTTOM;
    this.maxScroll = Math.max(0, contentH - (VIEW_BOTTOM - VIEW_TOP));
    this.scroll = Phaser.Math.Clamp(fresh ? 0 : savedScroll, 0, this.maxScroll);

    // First visit: a little nudge shows the grid scrolls.
    if (!fresh && savedScroll === 0 && this.maxScroll > 0 && !reducedMotion()) {
      const hint = { v: 0 };
      this.tweens.add({
        targets: hint,
        v: 60,
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

  /** Nothing starred yet: say what to do instead of showing a blank area. */
  private emptyState(): Phaser.GameObjects.Container {
    const c = this.add.container(GAME_WIDTH / 2, VIEW_TOP + 190);
    c.add([
      drawIcon(this, 'starOutline', 0, -70, 84, 0xffffff),
      addText(this, 0, 20, 'Nenhum favorito ainda', 34, {
        color: COLORS.textLight,
        stroke: '#1d2b53',
        strokeThickness: 7,
      }),
      addText(this, 0, 90, 'Abra um jogo e toque em\n"Favoritar" para fixá-lo aqui', 24, {
        color: COLORS.textLight,
        stroke: '#1d2b53',
        strokeThickness: 5,
        weight: 'normal',
      }),
    ]);
    return c;
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
    g.fillStyle(0xffffff, 0.6).fillRoundedRect(
      GAME_WIDTH - 12,
      VIEW_TOP + 8 + t * (viewH - 16 - barH),
      6,
      barH,
      3,
    );
  }

  /** Taps count only when the gesture wasn't a scroll and happened inside the visible area. */
  private isTap(p: Phaser.Input.Pointer): boolean {
    return !this.dragged && !this.sheet && p.y >= VIEW_TOP && p.y <= VIEW_BOTTOM;
  }

  private open(game: GameDefinition): void {
    if (this.opening) return;
    this.opening = true;
    getServices(this).recents.push(game.id);
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
        }).setDepth(1000);
        this.time.delayedCall(2200, () => msg.destroy());
      },
    );
  }

  /** Compact tile: icon, name and record. Everything else lives in the game sheet. */
  private buildCard(
    game: GameDefinition,
    x: number,
    y: number,
    favorite: boolean,
  ): Phaser.GameObjects.Container {
    const services = getServices(this);
    const card = this.add.container(x, y);
    const g = this.add.graphics();
    const top = -CARD_H / 2;
    g.fillStyle(0x000000, 0.2).fillRoundedRect(-CARD_W / 2 + 3, top + 8, CARD_W, CARD_H, 26);
    g.fillStyle(game.shade).fillRoundedRect(-CARD_W / 2, top + 6, CARD_W, CARD_H, 26);
    g.fillStyle(game.color).fillRoundedRect(-CARD_W / 2, top, CARD_W, CARD_H, 26);
    g.fillStyle(0xffffff, 0.92).fillRoundedRect(-CARD_W / 2 + 12, top + 12, CARD_W - 24, 112, 20);
    card.add(g);

    const icon = this.add.image(0, top + 68, game.icon);
    icon.setScale(Math.min(88 / icon.width, 88 / icon.height));
    card.add(icon);

    if (favorite) card.add(drawIcon(this, 'star', CARD_W / 2 - 34, top + 32, 26, GOLD));

    card.add(
      addText(this, 0, top + 154, game.title, game.title.length > 12 ? 19 : 23, {
        color: COLORS.textLight,
        stroke: '#00000066',
        strokeThickness: 5,
        wrapWidth: CARD_W - 20,
      }),
    );
    const best = game.personalBest(services);
    card.add(
      addText(this, 0, top + 186, best ? `Recorde ${formatNumber(best.score)}` : 'Novo!', 17, {
        color: '#ffffffee',
        weight: 'normal',
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
      this.openSheet(game);
    });
    this.list.add(card);
    return card;
  }

  // ── Game sheet ──────────────────────────────────────────────────────────

  /** Bottom sheet for one game: a big Play button plus ranking, invite and favorite. */
  private openSheet(game: GameDefinition): void {
    if (this.sheet) return;
    const services = getServices(this);
    const top = GAME_HEIGHT - SHEET_H;
    const root = this.add.container(0, 0).setDepth(50);
    this.sheet = root;

    const dim = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55).setOrigin(0);
    dim.setInteractive();
    root.add(dim);

    // The panel is laid out at its final position and slides up from below.
    const panel = this.add.container(0, GAME_HEIGHT);
    root.add(panel);
    const bg = this.add.graphics();
    bg.fillStyle(COLORS.panel).fillRoundedRect(0, top, GAME_WIDTH, SHEET_H + 40, {
      tl: 44,
      tr: 44,
      bl: 0,
      br: 0,
    });
    bg.fillStyle(0xc7cfdc).fillRoundedRect(GAME_WIDTH / 2 - 40, top + 14, 80, 8, 4);
    // Swallows taps on the panel so they don't reach the dim layer (which closes the sheet).
    const body = this.add
      .zone(0, top, GAME_WIDTH, SHEET_H + 40)
      .setOrigin(0)
      .setInteractive();
    panel.add([bg, body]);

    const plate = this.add.graphics();
    plate.fillStyle(game.shade).fillRoundedRect(MARGIN, top + 58, 150, 150, 32);
    plate.fillStyle(game.color).fillRoundedRect(MARGIN, top + 52, 150, 150, 32);
    plate.fillStyle(0xffffff, 0.92).fillRoundedRect(MARGIN + 12, top + 64, 126, 126, 24);
    const icon = this.add.image(MARGIN + 75, top + 127, game.icon);
    icon.setScale(Math.min(102 / icon.width, 102 / icon.height));
    panel.add([plate, icon]);

    const textX = MARGIN + 150 + 24;
    panel.add(
      addText(this, textX, top + 96, game.title, game.title.length > 16 ? 30 : 36, {
        color: COLORS.text,
        wrapWidth: GAME_WIDTH - textX - 90,
        align: 'left',
      }).setOrigin(0, 0.5),
    );
    panel.add(
      addText(this, textX, top + 142, game.tagline, 22, {
        color: COLORS.textMuted,
        weight: 'normal',
        wrapWidth: GAME_WIDTH - textX - MARGIN,
        align: 'left',
      }).setOrigin(0, 0.5),
    );
    const best = game.personalBest(services);
    panel.add(drawIcon(this, 'crown', textX + 14, top + 184, 26, 0xe0a800));
    panel.add(
      addText(
        this,
        textX + 36,
        top + 184,
        best ? `Recorde ${formatNumber(best.score)}` : 'Ainda sem recorde',
        24,
        { color: COLORS.text },
      ).setOrigin(0, 0.5),
    );

    const close = () => this.closeSheet();
    const closeBtn = this.add.container(GAME_WIDTH - MARGIN - 24, top + 62);
    closeBtn.add(drawIcon(this, 'close', 0, 0, 40, ICON_GREY));
    closeBtn.setSize(80, 80).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerup', close);
    panel.add(closeBtn);
    dim.on('pointerup', close);

    // The one primary action.
    const play = new Button(this, GAME_WIDTH / 2, top + 290, 'Jogar', () => this.open(game), {
      width: CONTENT_W,
      height: 104,
      fontSize: 48,
      color: COLORS.success,
      shade: COLORS.successDark,
    });
    this.iconWithLabel(play, 'play', 0xffffff, 40);
    panel.add(play);

    // Secondary actions, equal weight, one row.
    const bw = 204;
    const step = bw + 18;
    const secondary = (cx: number, text: string, onClick: () => void): Button => {
      const b = new Button(this, cx, top + 440, text, onClick, {
        width: bw,
        height: 88,
        fontSize: 24,
        color: 0xeef2f8,
        shade: 0xc7cfdc,
        textColor: COLORS.text,
      });
      b.label.setStroke('#000000', 0);
      panel.add(b);
      return b;
    };
    const rank = secondary(GAME_WIDTH / 2 - step, 'Ranking', () =>
      this.scene.start(SceneKeys.Leaderboard, { gameId: game.id }),
    );
    this.iconWithLabel(rank, 'trophy', ICON_GREY, 34);

    const invite = secondary(GAME_WIDTH / 2, 'Convidar', () => {
      void shareWithToast(this, game.id, game.title, `Joga ${game.title} comigo no Fliperama!`);
    });
    this.iconWithLabel(invite, 'share', ICON_GREY, 32);

    const isFav = () => services.favorites.has(game.id);
    const favText = () => (isFav() ? 'Favorito' : 'Favoritar');
    const favIconKind = (): IconKind => (isFav() ? 'star' : 'starOutline');
    const favIconColor = () => (isFav() ? GOLD : ICON_GREY);
    let favIcon: Phaser.GameObjects.Graphics;
    const fav = secondary(GAME_WIDTH / 2 + step, favText(), () => {
      services.favorites.toggle(game.id);
      fav.label.setText(favText());
      favIcon.destroy();
      favIcon = this.iconWithLabel(fav, favIconKind(), favIconColor(), 34);
      this.populateGrid(false);
    });
    favIcon = this.iconWithLabel(fav, favIconKind(), favIconColor(), 34);

    // Slide up (the exit is faster than the entrance).
    const instant = reducedMotion();
    dim.setAlpha(0);
    this.tweens.add({ targets: dim, alpha: 1, duration: instant ? 0 : 200 });
    this.tweens.add({
      targets: panel,
      y: 0,
      duration: instant ? 0 : 280,
      ease: 'Cubic.easeOut',
    });
  }

  private closeSheet(): void {
    const root = this.sheet;
    if (!root) return;
    this.sheet = null;
    this.tweens.add({
      targets: root,
      alpha: 0,
      duration: reducedMotion() ? 0 : 160,
      onComplete: () => root.destroy(),
    });
  }

  // ── Someone passed you ──────────────────────────────────────────────────

  /** Looks at the global boards the player is on and warns them about anyone who passed them. */
  private async checkRivals(): Promise<void> {
    const { leaderboard, rankWatch } = getServices(this);
    if (!leaderboard.hasRemote || this.time.now - lastRivalCheck < RIVAL_CHECK_MS) return;
    lastRivalCheck = this.time.now;
    const found: Array<{ game: GameDefinition; o: Overtake }> = [];
    for (const id of rankWatch.games()) {
      const entries = await leaderboard.list(id, GLOBAL_TOP).catch(() => null);
      if (!entries || !leaderboard.online) return; // offline: try again next time
      const o = rankWatch.check(id, entries, (e) => leaderboard.isMine(e));
      const game = GAMES.find((g) => g.id === id);
      if (o && game) found.push({ game, o });
    }
    if (this.sys.isActive()) this.showOvertakes(found);
  }

  /** One banner at a time above the footer; tap it to see that ranking. */
  private showOvertakes(queue: Array<{ game: GameDefinition; o: Overtake }>): void {
    const next = queue.shift();
    if (!next) return;
    const { game, o } = next;
    const services = getServices(this);
    services.sfx.play('hit');
    const where = o.to ? `Você caiu de ${o.from}º para ${o.to}º` : `Você saiu do top ${GLOBAL_TOP}`;
    const banner = this.add.container(GAME_WIDTH / 2, 1120).setDepth(30);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.25).fillRoundedRect(-330, -62, 660, 132, 26);
    bg.fillStyle(0x1d2b53).fillRoundedRect(-330, -68, 660, 132, 26);
    bg.lineStyle(4, 0xffd23f).strokeRoundedRect(-330, -68, 660, 132, 26);
    const icon = this.add.image(-262, -2, game.icon);
    icon.setScale(Math.min(92 / icon.width, 92 / icon.height));
    banner.add([
      bg,
      icon,
      addText(this, 40, -26, `${o.by} passou você no ${game.title}!`, 26, {
        color: '#ffd23f',
      }).setWordWrapWidth(500),
      addText(this, 40, 24, `${where} · toque para ver`, 22, {
        color: COLORS.textLight,
        weight: 'normal',
      }),
    ]);
    banner.setSize(660, 132).setInteractive({ useHandCursor: true });
    const close = () => {
      if (!banner.active) return;
      this.tweens.add({
        targets: banner,
        y: 1400,
        duration: 250,
        onComplete: () => {
          banner.destroy();
          this.showOvertakes(queue);
        },
      });
    };
    banner.on('pointerup', () => this.scene.start(SceneKeys.Leaderboard, { gameId: game.id }));
    banner.y = 1400;
    this.tweens.add({ targets: banner, y: 1120, duration: 350, ease: 'Back.easeOut' });
    this.time.delayedCall(5500, close);
  }
}
