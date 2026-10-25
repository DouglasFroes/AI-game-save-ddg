import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import { GAMES, type GameDefinition, type GameId } from '@/games/registry';
import { trendingGames } from '@/platform/trending';
import { HUB_FONT } from '@/platform/fonts';
import { canFullscreen, isStandalone, toggleFullscreen } from '@/platform/fullscreen';
import { loadGame } from '@/platform/gameLoader';
import {
  CATEGORY_LABELS,
  filterGames,
  GAME_CATEGORY,
  gameOfTheDay,
  greeting,
  type CategoryId,
  type HubFilter,
} from '@/platform/hubCategories';
import { GLOBAL_TOP } from '@/platform/leaderboard';
import { shareWithToast } from '@/platform/share';
import { gameIdFromSearch } from '@/platform/shareLink';
import { formatNumber } from '@/platform/ranking';
import type { Overtake } from '@/platform/rankWatch';
import { drawIcon, type IconKind } from '@/platform/ui/icons';
import { askName } from '@/platform/ui/nameDialog';
import {
  ALL,
  auroraBackground,
  BRAND,
  CTA,
  dockArt,
  fadeArt,
  glassArt,
  glowBlob,
  heroArt,
  logoArt,
  mix,
  pillArt,
  posterArt,
  UI,
} from '@/platform/ui/hubTheme';
import { addText, type TextOptions } from '@/platform/ui/widgets';
import { MIN_VOLUME, type SoundPrefs } from '@/platform/profile';
import { getServices } from '@/services';

// ── Layout (world units, 720×1280) ─────────────────────────────────────────
const MARGIN = 30;
const CONTENT_W = GAME_WIDTH - MARGIN * 2;
const HEADER_H = 124;
const CHIPS_H = 96;
const DOCK_W = 624;
const DOCK_H = 104;
const DOCK_CY = GAME_HEIGHT - 34 - DOCK_H / 2;
const DOCK_TOP = DOCK_CY - DOCK_H / 2;
const HERO_Y = 238;
const HERO_W = CONTENT_W;
const HERO_H = 510;
const STAGE = { x: 468, y: 196 };
const POSTER_W = 204;
const POSTER_H = 306;
const POSTER_GAP = 16;
const ROW_H = 410;
const TOP10_NUMBER_W = 112;
const GRID_COLS = 3;
const GRID_GAP = 16;
/** A finger moving more than this is a drag, not a tap. */
const DRAG_SLOP = 12;
const SWIPE_MIN = 60;
const SLIDE_MS = 6500;
const SHEET_H = 840;

type Tab = 'inicio' | 'jogos' | 'lista';
const TAB_LABELS: Readonly<Record<Tab, string>> = {
  inicio: 'Início',
  jogos: 'Jogos',
  lista: 'Minha lista',
};
const TAB_ICONS: Readonly<Record<Tab, IconKind>> = {
  inicio: 'home',
  jogos: 'grid',
  lista: 'bookmark',
};
const TABS: readonly Tab[] = ['inicio', 'jogos', 'lista'];
const ROW_CATEGORIES: readonly CategoryId[] = ['acao', 'puzzle', 'mesa', 'reflexo', 'esporte'];
const FILTERS: readonly HubFilter[] = ['todos', 'acao', 'puzzle', 'mesa', 'reflexo', 'esporte'];
const AVATAR_COLORS = [0x38e1ff, 0x8b5cf6, 0xff5fb8, 0x34d399, 0xfbbf24, 0xfb7185] as const;
const ACCENTS = [UI.cyan, UI.violet, UI.pink] as const;
const RANK_STROKE = ['#ffd166', '#d5dbff', '#ffb27a'] as const;

/** Tab, filter and scroll survive trips into a game and back. */
/** The hub's "most played" list (real sessions), filled in once they load. */
let trend: { ids: GameId[]; global: boolean; at: number } | null = null;
const TREND_REFRESH_MS = 120_000;

let savedTab: Tab = 'inicio';
let savedFilter: HubFilter = 'todos';
const savedScroll: Record<Tab, number> = { inicio: 0, jogos: 0, lista: 0 };
/** Game asked for by a shared link (`?jogo=id`); opened once, after the player has a name. */
let pendingLink: string | null =
  typeof window === 'undefined'
    ? null
    : gameIdFromSearch(window.location.search, (id) => GAMES.some((g) => g.id === id));
/** When the boards were last checked for overtakes (at most once a minute). */
let lastRivalCheck = -Infinity;
const RIVAL_CHECK_MS = 60_000;

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Small stable number from a string, to shuffle the same way all day. */
const hashOf = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** The hub's text: the shared helper, set in the display font. */
const txt = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  value: string,
  size: number,
  opts: TextOptions = {},
): Phaser.GameObjects.Text => addText(scene, x, y, value, size, { family: HUB_FONT, ...opts });

const fontPx = (t: Phaser.GameObjects.Text): number => parseInt(String(t.style.fontSize), 10);

/** Shrinks a text's font until it fits `maxW` (or reaches `minSize`). */
const fit = (t: Phaser.GameObjects.Text, maxW: number, minSize: number): void => {
  while (t.width > maxW && fontPx(t) > minSize) t.setFontSize(fontPx(t) - 2);
};

/** A row of posters that scrolls sideways on its own, or the hero (which swaps slides). */
interface Shelf {
  /** Vertical band in list space where a drag belongs to this shelf. */
  readonly top: number;
  readonly bottom: number;
  readonly box: Phaser.GameObjects.Container | null;
  scroll: number;
  max: number;
  velocity: number;
  readonly onSwipe?: (dir: 1 | -1) => void;
}

interface Gesture {
  sx: number;
  sy: number;
  startScroll: number;
  startShelf: number;
  lastY: number;
  lastX: number;
  lastT: number;
  axis: 'x' | 'y' | null;
  shelf: Shelf | null;
}

interface IconHandle {
  readonly view: Phaser.GameObjects.Container;
  setKind(kind: IconKind, color?: number): void;
}

/** Main menu: aurora backdrop, a featured-game hero, rows of glass posters and a floating dock. */
export class HubScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Hub);
  }

  private opening = false;
  private tab: Tab = 'inicio';
  private filter: HubFilter = 'todos';
  private list!: Phaser.GameObjects.Container;
  private top!: Phaser.GameObjects.Container;
  private bar!: Phaser.GameObjects.Container;
  private headerSolid!: Phaser.GameObjects.Graphics;
  private avatar!: Phaser.GameObjects.Container;
  private soundIcon: IconHandle | null = null;
  private chips: Phaser.GameObjects.GameObject[] = [];
  private tabItems = new Map<
    Tab,
    { icon: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text }
  >();
  private indicator!: Phaser.GameObjects.Image;
  private scrollBar!: Phaser.GameObjects.Graphics;
  private tapTop = HEADER_H;
  private scroll = 0;
  private maxScroll = 0;
  private velocity = 0;
  private gesture: Gesture | null = null;
  private dragged = false;
  private shelves: Shelf[] = [];
  private sheet: Phaser.GameObjects.Container | null = null;
  private greetName: Phaser.GameObjects.Text | null = null;

  private slides: GameDefinition[] = [];
  private slide = 0;
  private slideT = 0;
  private slideBox: Phaser.GameObjects.Container | null = null;
  private progress: Phaser.GameObjects.Graphics | null = null;
  /** Looping decorations of whatever the list currently shows; stopped when it is rebuilt. */
  private fx: Phaser.Tweens.Tween[] = [];
  private slideFx: Phaser.Tweens.Tween[] = [];

  create(): void {
    this.opening = false;
    this.gesture = null;
    this.dragged = false;
    this.velocity = 0;
    this.sheet = null;
    this.shelves = [];
    this.chips = [];
    this.fx = [];
    this.slideFx = [];
    this.tabItems = new Map();
    this.greetName = null;
    this.slideBox = null;
    this.progress = null;
    this.tab = savedTab;
    this.filter = savedFilter;
    const { profile } = getServices(this);

    // The bands around the game (on screens that aren't 9:16) take the page's black too.
    const roots = [document.documentElement, document.body];
    for (const el of roots) el.style.background = UI.bgCss;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const el of roots) el.style.background = '';
    });
    this.cameras.main.setBackgroundColor(UI.bg);

    this.buildBackdrop();
    this.list = this.add.container(0, 0);
    this.add
      .image(0, GAME_HEIGHT - 300, fadeArt(this, GAME_WIDTH, 300, false))
      .setOrigin(0)
      .setDepth(15);
    this.top = this.add.container(0, 0).setDepth(20);
    this.bar = this.add.container(0, 0).setDepth(20);
    this.scrollBar = this.add.graphics().setDepth(21);

    this.buildHeader();
    this.buildDock();
    this.buildInput();
    this.showTab(false);
    void this.loadTrend();

    if (!reducedMotion()) {
      this.list.setAlpha(0);
      this.top.setAlpha(0);
      this.bar.y = 140;
      this.tweens.add({
        targets: [this.list, this.top],
        alpha: 1,
        duration: 600,
        ease: 'Sine.easeOut',
      });
      this.tweens.add({ targets: this.bar, y: 0, duration: 700, delay: 150, ease: 'Back.easeOut' });
    }

    // A friend's link opens that game's details sheet (the URL is cleaned so a refresh shows the hub).
    const openLinked = () => {
      const linked = pendingLink ? GAMES.find((g) => g.id === pendingLink) : undefined;
      if (!linked) return;
      pendingLink = null;
      window.history.replaceState(null, '', window.location.pathname);
      this.time.delayedCall(300, () => {
        if (this.sys.isActive()) this.openSheet(linked);
      });
    };
    // No name, no hub: the player has to say who they are before touching anything else.
    if (profile.get().name) openLinked();
    else this.time.delayedCall(250, () => void this.requireName().then(openLinked));

    void this.checkRivals();

    // The hub is already on screen: warm the game chunks in the background so taps feel instant.
    this.time.delayedCall(1500, () => {
      for (const game of GAMES) loadGame(this.game, game).catch(() => undefined);
    });
  }

  /** Blocks on the nickname dialog (no way to cancel) until the player types a name. */
  private async requireName(): Promise<void> {
    const { profile } = getServices(this);
    while (!profile.get().name) {
      const name = await askName(this, '', { required: true });
      if (name) profile.update({ name });
    }
    if (this.sys.isActive()) this.refreshName();
  }

  // ── Backdrop ────────────────────────────────────────────────────────────

  /** Night sky with slow colour glows drifting across it and a few twinkling stars. */
  private buildBackdrop(): void {
    this.add
      .image(0, 0, auroraBackground(this, GAME_WIDTH, GAME_HEIGHT))
      .setOrigin(0)
      .setDepth(-10);
    const still = reducedMotion();
    const drift = (x: number, y: number, tint: number, scale: number, dx: number, dy: number) => {
      const b = this.add
        .image(x, y, glowBlob(this))
        .setTint(tint)
        .setAlpha(0.2)
        .setScale(scale)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(-9);
      if (still) return;
      this.tweens.add({
        targets: b,
        x: x + dx,
        y: y + dy,
        alpha: 0.32,
        duration: 9000 + scale * 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    };
    drift(110, 380, UI.violet, 6, 140, 120);
    drift(640, 880, UI.cyan, 5, -150, -140);
    drift(220, 1130, UI.pink, 5, 120, -90);
    if (still) return;
    for (let i = 0; i < 16; i++) {
      const seed = hashOf(`star${i}`);
      const star = this.add
        .circle((seed % 700) + 10, ((seed >>> 8) % 1260) + 10, 1.6 + (seed % 3) * 0.5, 0xffffff)
        .setAlpha(0.1)
        .setDepth(-8);
      this.tweens.add({
        targets: star,
        alpha: 0.85,
        duration: 1400 + (seed % 1800),
        delay: seed % 2600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  // ── Building blocks ─────────────────────────────────────────────────────

  /**
   * Makes a container tappable with a springy press: it dips on touch and bounces back on release.
   * `inList` taps only count when the finger didn't drag.
   */
  private press(
    c: Phaser.GameObjects.Container,
    w: number,
    h: number,
    onTap: () => void,
    opts: { inList?: boolean; down?: number } = {},
  ): void {
    const down = opts.down ?? 0.94;
    let spring: Phaser.Tweens.Tween | undefined;
    c.setSize(w, h).setInteractive({ useHandCursor: true });
    const reset = () => {
      if (c.scale === 1) return;
      spring?.stop();
      spring = this.tweens.add({
        targets: c,
        scale: 1,
        duration: reducedMotion() ? 0 : 260,
        ease: 'Back.easeOut',
      });
    };
    c.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (opts.inList && !this.isTap(p)) return;
      spring?.stop();
      c.setScale(down);
    });
    c.on('pointerout', reset);
    c.on('pointermove', () => {
      if (opts.inList && this.dragged) reset();
    });
    c.on('pointerup', (p: Phaser.Input.Pointer) => {
      reset();
      if (opts.inList && !this.isTap(p)) return;
      const { sfx } = getServices(this);
      sfx.play('click');
      sfx.vibrate(8);
      onTap();
    });
  }

  /** A round glass button with a vector icon. */
  private glassCircle(
    x: number,
    y: number,
    d: number,
    kind: IconKind,
    iconSize: number,
    onTap: () => void,
    opts: { inList?: boolean; color?: number } = {},
  ): IconHandle {
    const c = this.add.container(x, y);
    const base = opts.color ?? 0xffffff;
    const holder = { icon: drawIcon(this, kind, 0, 0, iconSize, base) };
    c.add([this.add.image(0, 0, glassArt(this, d, d, d / 2)), holder.icon]);
    this.press(c, d + 16, d + 16, onTap, { inList: opts.inList, down: 0.88 });
    return {
      view: c,
      setKind: (k, color) => {
        holder.icon.destroy();
        holder.icon = drawIcon(this, k, 0, 0, iconSize, color ?? base);
        c.add(holder.icon);
      },
    };
  }

  /** The primary call to action: a glowing gradient pill with a play icon and a label. */
  private ctaButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    size: number,
    onTap: () => void,
    opts: { inList?: boolean; icon?: boolean } = {},
  ): { view: Phaser.GameObjects.Container; glow: Phaser.GameObjects.Image } {
    const c = this.add.container(x, y);
    const glow = this.add.image(0, 0, pillArt(this, w, h, CTA, true));
    const text = txt(this, 0, -1, label, size, { color: '#ffffff' });
    c.add(glow);
    if (opts.icon === false) c.add(text);
    else {
      const icon = 30 * (size / 34);
      const gap = 14;
      const total = icon + gap + text.width;
      text.x = -total / 2 + icon + gap + text.width / 2;
      c.add([drawIcon(this, 'play', -total / 2 + icon / 2 + 2, -1, icon, 0xffffff), text]);
    }
    this.press(
      c,
      w,
      h,
      () => {
        this.pulse(c, UI.pink);
        onTap();
      },
      { inList: opts.inList, down: 0.95 },
    );
    return { view: c, glow };
  }

  /** A ring that swells and fades from the centre of `parent`, as feedback for a tap. */
  private pulse(parent: Phaser.GameObjects.Container, color: number): void {
    if (reducedMotion()) return;
    const ring = this.add.circle(0, 0, 40).setStrokeStyle(4, color, 0.8);
    parent.add(ring);
    this.tweens.add({
      targets: ring,
      scale: 3.2,
      alpha: 0,
      duration: 520,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  /** A looping decoration owned by the list (stopped when the list is rebuilt). */
  private loop(config: Phaser.Types.Tweens.TweenBuilderConfig, slide = false): void {
    if (reducedMotion()) return;
    (slide ? this.slideFx : this.fx).push(this.tweens.add({ repeat: -1, ...config }));
  }

  private killFx(slideOnly = false): void {
    for (const t of this.slideFx) t.stop();
    this.slideFx = [];
    if (slideOnly) return;
    for (const t of this.fx) t.stop();
    this.fx = [];
  }

  private toast(text: string): void {
    const label = txt(this, 0, 0, text, 24, { color: UI.white, align: 'center' });
    const w = Math.min(660, label.width + 64);
    const h = label.height + 36;
    const c = this.add.container(GAME_WIDTH / 2, DOCK_TOP - 60).setDepth(40);
    const bg = this.add.graphics();
    bg.fillStyle(0x0d0f22, 0.94).fillRoundedRect(-w / 2, -h / 2, w, h, Math.min(30, h / 2));
    bg.lineStyle(2, 0xffffff, 0.16).strokeRoundedRect(-w / 2, -h / 2, w, h, Math.min(30, h / 2));
    c.add([bg, label]);
    c.setAlpha(0).y += 24;
    this.tweens.add({ targets: c, alpha: 1, y: c.y - 24, duration: 260, ease: 'Cubic.easeOut' });
    this.tweens.add({
      targets: c,
      alpha: 0,
      delay: 3200,
      duration: 400,
      onComplete: () => c.destroy(),
    });
  }

  /** A soft contact shadow under a floating icon. */
  private groundShadow(x: number, y: number, w: number): Phaser.GameObjects.Ellipse {
    return this.add.ellipse(x, y, w, w * 0.2, 0x000000, 0.4);
  }

  /** A coloured halo (add-blended glow) behind an icon. */
  private halo(
    x: number,
    y: number,
    color: number,
    scale: number,
    alpha: number,
  ): Phaser.GameObjects.Image {
    return this.add
      .image(x, y, glowBlob(this))
      .setTint(color)
      .setScale(scale)
      .setAlpha(alpha)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  // ── Header and dock ─────────────────────────────────────────────────────

  private buildHeader(): void {
    const { profile } = getServices(this);
    const cy = 66;
    this.top.add(this.add.image(0, 0, fadeArt(this, GAME_WIDTH, 210, true)).setOrigin(0));
    this.headerSolid = this.add.graphics();
    this.top.add(this.headerSolid);

    // Logo: a glowing gradient orb with a bolt, and the tracked-out wordmark.
    const mark = this.add.container(MARGIN + 28, cy);
    mark.add([
      this.add.image(0, 0, pillArt(this, 56, 56, CTA, true)),
      drawIcon(this, 'bolt', 0, 0, 30, 0xffffff),
    ]);
    this.top.add(mark);
    if (!reducedMotion()) {
      this.tweens.add({
        targets: mark,
        scale: 1.07,
        duration: 2200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
    const logo = logoArt(this, 'FLIPERAMA');
    this.top.add(
      this.add
        .image(MARGIN + 68, cy + 1, logo.key)
        .setOrigin(0, 0.5)
        .setScale(0.5),
    );

    // Avatar: a gradient ring around the initial; tap to change the nickname.
    const ax = GAME_WIDTH - MARGIN - 31;
    this.avatar = this.add.container(ax, cy);
    this.press(
      this.avatar,
      84,
      84,
      () => {
        void askName(this, profile.get().name).then((name) => {
          if (!name) return;
          profile.update({ name });
          this.refreshName();
        });
      },
      { down: 0.9 },
    );
    this.top.add(this.avatar);
    this.refreshName();

    const soundKind = (): IconKind => (profile.get().muted ? 'speakerOff' : 'speaker');
    const sound = this.glassCircle(ax - 80, cy, 62, soundKind(), 30, () => this.openSettings());
    this.soundIcon = { view: sound.view, setKind: () => sound.setKind(soundKind()) };
    this.top.add(sound.view);
    if (!isStandalone()) {
      const full = this.glassCircle(ax - 80 - 72, cy, 62, 'expand', 28, () => {
        if (!canFullscreen()) {
          this.toast(
            'No iPhone: toque em Compartilhar e\n"Adicionar à Tela de Início" para tela cheia',
          );
          return;
        }
        void toggleFullscreen();
      });
      this.top.add(full.view);
    }
  }

  private refreshName(): void {
    const name = getServices(this).profile.get().name;
    const seed = [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    const color = name ? AVATAR_COLORS[seed % AVATAR_COLORS.length]! : 0x4a4f7a;
    // `removeAll(true)` would also destroy the container's own input; only the faces are redrawn.
    this.avatar.removeAll(true);
    const g = this.add.graphics();
    g.fillStyle(mix(color, UI.bg, 0.55)).fillCircle(0, 0, 25);
    g.fillStyle(color, 0.5).fillCircle(0, 0, 25);
    g.fillStyle(0xffffff, 0.16).fillEllipse(0, -10, 36, 18);
    this.avatar.add([
      this.add.image(0, 0, pillArt(this, 62, 62, BRAND, false)),
      g,
      name
        ? txt(this, 0, 0, [...name][0]!.toUpperCase(), 28, { color: '#ffffff' })
        : drawIcon(this, 'user', 0, 0, 28, 0xffffff),
    ]);
    if (this.greetName?.active) this.greetName.setText(name || 'Jogador');
  }

  /** The strip behind the header: see-through at the top of the page, frosted once scrolled. */
  private paintHeader(): void {
    const g = this.headerSolid.clear();
    const extra = this.tab === 'jogos' ? CHIPS_H : 0;
    g.fillStyle(UI.bg, 0.9).fillRect(0, 0, GAME_WIDTH, HEADER_H + extra);
    g.fillStyle(0xffffff, 0.08).fillRect(0, HEADER_H + extra - 2, GAME_WIDTH, 2);
    this.tapTop = HEADER_H + extra;
  }

  private buildDock(): void {
    const { key } = dockArt(this, DOCK_W, DOCK_H);
    this.bar.add(this.add.image(GAME_WIDTH / 2, DOCK_CY, key));
    const slotW = DOCK_W / TABS.length;
    const left = (GAME_WIDTH - DOCK_W) / 2;
    this.indicator = this.add.image(
      left + slotW * (TABS.indexOf(this.tab) + 0.5),
      DOCK_CY,
      pillArt(this, slotW - 14, DOCK_H - 22, CTA, true),
    );
    this.bar.add(this.indicator);
    TABS.forEach((t, i) => {
      const cx = left + slotW * (i + 0.5);
      const icon = drawIcon(this, TAB_ICONS[t], cx, DOCK_CY, 36, 0x8d93bd);
      const label = txt(this, cx, DOCK_CY, TAB_LABELS[t], 22, { color: '#ffffff' });
      this.tabItems.set(t, { icon, label });
      const zone = this.add
        .zone(cx, DOCK_CY, slotW, DOCK_H)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerup', () => {
        if (this.sheet || this.tab === t) return;
        const { sfx } = getServices(this);
        sfx.play('click');
        sfx.vibrate(8);
        this.goTab(t);
      });
      this.bar.add([icon, label, zone]);
    });
  }

  /** Active tab: icon and name inside the sliding pill. Others: just the icon. */
  private paintDock(animate: boolean): void {
    const slotW = DOCK_W / TABS.length;
    const left = (GAME_WIDTH - DOCK_W) / 2;
    const iconSize = 36;
    TABS.forEach((t, i) => {
      const item = this.tabItems.get(t);
      if (!item) return;
      const on = t === this.tab;
      const cx = left + slotW * (i + 0.5);
      let iconX = cx;
      if (on) {
        const total = iconSize + 10 + item.label.width;
        iconX = cx - total / 2 + iconSize / 2;
        item.label.setPosition(cx - total / 2 + iconSize + 10 + item.label.width / 2, DOCK_CY);
      }
      this.tweens.killTweensOf(item.label);
      if (on && animate && !reducedMotion()) {
        item.label.setAlpha(0);
        this.tweens.add({ targets: item.label, alpha: 1, duration: 260, delay: 90 });
      } else item.label.setAlpha(on ? 1 : 0);
      item.icon.destroy();
      item.icon = drawIcon(this, TAB_ICONS[t], iconX, DOCK_CY, iconSize, on ? 0xffffff : 0x8d93bd);
      this.bar.add(item.icon);
    });
    const x = left + slotW * (TABS.indexOf(this.tab) + 0.5);
    this.tweens.killTweensOf(this.indicator);
    this.indicator.setScale(1);
    if (animate && !reducedMotion()) {
      this.tweens.add({ targets: this.indicator, x, duration: 380, ease: 'Back.easeOut' });
      this.tweens.add({
        targets: this.indicator,
        scaleX: 1.1,
        scaleY: 0.92,
        duration: 150,
        yoyo: true,
        ease: 'Sine.easeOut',
      });
    } else {
      this.indicator.x = x;
    }
  }

  // ── Tabs ────────────────────────────────────────────────────────────────

  private goTab(t: Tab, filter?: HubFilter): void {
    savedScroll[this.tab] = this.scroll;
    this.tab = t;
    savedTab = t;
    if (filter) {
      this.filter = filter;
      savedFilter = filter;
      savedScroll.jogos = 0;
    }
    this.showTab(true);
  }

  /** Reads the play sessions and, if the ranking changed, redraws the home rows in place. */
  private async loadTrend(): Promise<void> {
    if (trend && Date.now() - trend.at < TREND_REFRESH_MS) return;
    const { telemetry } = getServices(this);
    const sessions = await telemetry.listAll(2000).catch(() => null);
    if (!sessions) return;
    const next = { ids: trendingGames(sessions), global: telemetry.online, at: Date.now() };
    const changed = !trend || trend.global !== next.global || trend.ids.join() !== next.ids.join();
    trend = next;
    // Redraw only when it matters and nothing is being touched.
    if (changed && this.sys.isActive() && this.tab === 'inicio' && !this.sheet && !this.gesture) {
      savedScroll[this.tab] = this.scroll;
      this.showTab(false);
    }
  }

  /** Rebuilds the scrolling area for the current tab. `fade` marks a tab switch. */
  private showTab(fade: boolean): void {
    this.killFx();
    for (const child of this.list.list) this.tweens.killTweensOf(child);
    this.slideBox?.list.forEach((child) => this.tweens.killTweensOf(child));
    this.list.removeAll(true);
    this.shelves = [];
    this.slideBox = null;
    this.progress = null;
    this.greetName = null;
    for (const c of this.chips) c.destroy();
    this.chips = [];
    this.paintHeader();
    this.paintDock(fade);

    let end: number;
    if (this.tab === 'inicio') end = this.buildHome(!fade);
    else if (this.tab === 'jogos') {
      this.buildChips();
      end = this.buildGrid(filterGames(GAMES, this.filter, []), false);
    } else {
      end = this.buildGrid(
        filterGames(GAMES, 'favoritos', getServices(this).favorites.list()),
        true,
      );
    }
    this.maxScroll = Math.max(0, end + 28 - DOCK_TOP);
    this.scroll = Phaser.Math.Clamp(savedScroll[this.tab], 0, this.maxScroll);
    this.velocity = 0;
    this.applyScroll();

    if (fade && !reducedMotion()) {
      this.list.setAlpha(0);
      this.tweens.add({ targets: this.list, alpha: 1, duration: 280, ease: 'Sine.easeOut' });
    }
  }

  // ── Home: greeting, hero, rows ──────────────────────────────────────────

  /** Builds the greeting, the hero and the rows. Returns where the content ends. */
  private buildHome(keepSlide: boolean): number {
    const services = getServices(this);
    const day = Math.floor(Date.now() / 86_400_000);
    const out: GameDefinition[] = [];
    const add = (g: GameDefinition | undefined) => {
      if (g && !out.includes(g)) out.push(g);
    };
    add(GAMES.find((g) => g.id === services.recents.last()));
    add(gameOfTheDay(GAMES, new Date()));
    for (let k = 0; out.length < 5 && k < GAMES.length; k++) {
      add(GAMES[(day * 7 + k * 11) % GAMES.length]);
    }
    this.slides = out;
    this.slide = keepSlide ? Math.min(this.slide, out.length - 1) : 0;
    this.slideT = 0;

    this.buildGreeting();

    this.shelves.push({
      top: HERO_Y,
      bottom: HERO_Y + HERO_H,
      box: null,
      scroll: 0,
      max: 0,
      velocity: 0,
      onSwipe: (dir) => this.goSlide(this.slide + dir, dir),
    });
    this.showSlide(false, 1);
    this.progress = this.add.graphics();
    this.list.add(this.progress);
    this.drawProgress();

    let y = HERO_Y + HERO_H + 30;
    let n = 0;
    const favs = services.favorites.list();
    const recent = services.recents.list().flatMap((id) => GAMES.filter((g) => g.id === id));
    if (recent.length > 0) y = this.row('Continue jogando', recent, y, { accent: n++ });
    if (trend && trend.ids.length >= 3) {
      // Real numbers: the games players spent the most time on this week.
      const hot = trend.ids.flatMap((id) => GAMES.filter((g) => g.id === id));
      y = this.row(
        trend.global ? 'Top 10 · mais jogados da semana' : 'Os que você mais joga',
        hot,
        y,
        {
          numbered: true,
          accent: n++,
        },
      );
    } else {
      // Nobody has played enough yet: say these are just picks for the day, not a ranking.
      const picks = [...GAMES].sort((a, b) => hashOf(a.id + day) - hashOf(b.id + day)).slice(0, 10);
      y = this.row('Sugestões de hoje', picks, y, { accent: n++ });
    }
    const fresh = GAMES.filter((g) => !g.personalBest(services))
      .sort((a, b) => hashOf(b.id + day) - hashOf(a.id + day))
      .slice(0, 12);
    if (fresh.length >= 3) y = this.row('Experimente agora', fresh, y, { accent: n++ });
    const starred = GAMES.filter((g) => favs.includes(g.id));
    if (starred.length > 0) y = this.row('Minha lista', starred, y, { accent: n++ });
    for (const cat of ROW_CATEGORIES) {
      y = this.row(CATEGORY_LABELS[cat], filterGames(GAMES, cat, []), y, {
        category: cat,
        accent: n++,
      });
    }
    this.list.add(
      txt(
        this,
        GAME_WIDTH / 2,
        y + 10,
        services.leaderboard.hasRemote ? 'Ranking global ativo' : 'Ranking salvo neste aparelho',
        20,
        { color: UI.mute, weight: 'normal' },
      ),
    );
    return y + 50;
  }

  /** "Boa noite" over the player's name, and a glass chip counting their records. */
  private buildGreeting(): void {
    const services = getServices(this);
    const name = services.profile.get().name || 'Jogador';
    this.list.add(
      txt(this, MARGIN + 2, 152, greeting(new Date().getHours()).toUpperCase(), 18, {
        color: UI.mute,
      }).setOrigin(0, 0.5),
    );
    const who = txt(this, MARGIN, 192, name, 42, { color: UI.white }).setOrigin(0, 0.5);
    fit(who, 400, 24);
    this.greetName = who;
    this.list.add(who);

    const records = GAMES.filter((g) => g.personalBest(services)).length;
    const label = txt(this, 0, 0, `${records} ${records === 1 ? 'recorde' : 'recordes'}`, 21, {
      color: '#ffe08a',
    });
    const w = Math.ceil(label.width + 78);
    const chip = this.add.container(GAME_WIDTH - MARGIN - w / 2, 176);
    label.x = 20;
    chip.add([
      this.add.image(0, 0, glassArt(this, w, 56, 28)),
      drawIcon(this, 'crown', -w / 2 + 34, 0, 26, UI.gold),
      label,
    ]);
    this.list.add(chip);
  }

  private goSlide(next: number, dir: 1 | -1 = 1): void {
    const n = this.slides.length;
    if (n === 0) return;
    this.slide = ((next % n) + n) % n;
    this.slideT = 0;
    this.showSlide(true, dir);
  }

  /** Stories-style progress: the current slide's bar fills while the hero waits to move on. */
  private drawProgress(): void {
    const g = this.progress?.clear();
    const n = this.slides.length;
    if (!g || n < 2) return;
    const gap = 8;
    const inner = HERO_W - 64;
    const w = (inner - gap * (n - 1)) / n;
    const y = HERO_Y + 28;
    for (let i = 0; i < n; i++) {
      const x = MARGIN + 32 + i * (w + gap);
      g.fillStyle(0xffffff, 0.2).fillRoundedRect(x, y, w, 5, 2.5);
      const fill = i < this.slide ? 1 : i === this.slide ? this.slideT / SLIDE_MS : 0;
      if (fill > 0) {
        g.fillStyle(0xffffff, 0.95).fillRoundedRect(x, y, Math.max(5, w * fill), 5, 2.5);
      }
    }
  }

  /** The hero: the featured game on a glass stage, with Play, My List and Ranking. */
  private showSlide(animate: boolean, dir: 1 | -1): void {
    const game = this.slides[this.slide];
    if (!game) return;
    const services = getServices(this);
    this.killFx(true);

    const prev = this.slideBox;
    if (prev) {
      prev.disableInteractive();
      if (animate && !reducedMotion()) {
        this.tweens.add({
          targets: prev,
          x: prev.x - dir * 70,
          alpha: 0,
          duration: 280,
          ease: 'Cubic.easeIn',
          onComplete: () => prev.destroy(),
        });
      } else prev.destroy();
    }

    const cx = MARGIN + HERO_W / 2;
    const cy = HERO_Y + HERO_H / 2;
    const root = this.add.container(cx, cy);
    this.slideBox = root;
    this.list.add(root);
    // Everything inside is laid out from the card's top-left corner.
    const c = this.add.container(-HERO_W / 2, -HERO_H / 2);
    root.add(c);

    c.add(this.halo(HERO_W / 2, HERO_H / 2, game.color, 5.2, 0.3));
    c.add(this.add.image(HERO_W / 2, HERO_H / 2, heroArt(this, game, HERO_W, HERO_H, STAGE)));

    // The stage: dashed ring, orbiting sparks, halo, and the floating icon.
    c.add(this.halo(STAGE.x, STAGE.y, game.color, 2.6, 0.5));
    const ring = this.add.graphics({ x: STAGE.x, y: STAGE.y });
    ring.lineStyle(2.5, 0xffffff, 0.34);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      ring
        .beginPath()
        .arc(0, 0, 124, a, a + 0.14)
        .strokePath();
    }
    const orbit = this.add.container(STAGE.x, STAGE.y);
    const spark = mix(game.color, 0xffffff, 0.6);
    for (const [r, a, s] of [
      [168, 0.6, 6],
      [168, 3.4, 4],
      [168, 5.0, 5],
    ] as const) {
      orbit.add(this.add.circle(Math.cos(a) * r, Math.sin(a) * r, s, spark, 0.9));
    }
    c.add([ring, orbit]);
    c.add(this.groundShadow(STAGE.x, STAGE.y + 126, 160));
    const icon = this.add.image(STAGE.x, STAGE.y, game.icon);
    icon.setScale(Math.min(196 / icon.width, 196 / icon.height));
    c.add(icon);
    this.loop({ targets: ring, rotation: Math.PI * 2, duration: 28000 }, true);
    this.loop({ targets: orbit, rotation: -Math.PI * 2, duration: 22000 }, true);
    this.loop(
      { targets: icon, y: STAGE.y - 14, duration: 1500, yoyo: true, ease: 'Sine.easeInOut' },
      true,
    );

    // Caption chip.
    const last = services.recents.last() === game.id;
    const today = gameOfTheDay(GAMES, new Date()) === game;
    const caption = last ? 'CONTINUE JOGANDO' : today ? 'JOGO DO DIA' : 'EM DESTAQUE';
    const tag = txt(this, 0, 0, caption, 16, { color: '#ffffff' }).setOrigin(0, 0.5);
    const tagW = Math.ceil(tag.width + 58);
    tag.x = 48 - tagW / 2;
    const dot = this.add.circle(26 - tagW / 2, 0, 6, game.color);
    const chip = this.add.container(36 + tagW / 2, 76);
    chip.add([this.add.image(0, 0, glassArt(this, tagW, 40, 20, { tint: game.color })), dot, tag]);
    c.add(chip);
    this.loop(
      { targets: dot, alpha: 0.25, duration: 900, yoyo: true, ease: 'Sine.easeInOut' },
      true,
    );

    // Personal record.
    const best = game.personalBest(services);
    c.add(txt(this, 38, 150, 'SEU RECORDE', 15, { color: UI.mute }).setOrigin(0, 0.5));
    if (best) {
      c.add(drawIcon(this, 'crown', 56, 198, 34, UI.gold));
      const score = txt(this, 86, 198, formatNumber(best.score), 44, {
        color: '#ffe08a',
      }).setOrigin(0, 0.5);
      fit(score, 230, 26);
      c.add(score);
    } else {
      c.add(txt(this, 38, 192, 'Ainda sem recorde', 28, { color: UI.soft }).setOrigin(0, 0.5));
      c.add(
        txt(this, 38, 226, 'Seja o primeiro!', 20, { color: UI.mute, weight: 'normal' }).setOrigin(
          0,
          0.5,
        ),
      );
    }

    // Title block.
    const title = txt(this, 36, 316, game.title, 54, { color: '#ffffff' }).setOrigin(0, 0.5);
    fit(title, HERO_W - 72, 32);
    title.setShadow(0, 4, 'rgba(0,0,0,0.55)', 12, false, true);
    c.add(title);
    c.add(
      txt(this, 38, 368, `${CATEGORY_LABELS[GAME_CATEGORY[game.id]]}  ·  ${game.tagline}`, 21, {
        color: UI.soft,
        weight: 'normal',
        wrapWidth: HERO_W - 76,
        align: 'left',
      }).setOrigin(0, 0.5),
    );

    // Actions.
    const play = this.ctaButton(36 + 186, 452, 372, 84, 'Jogar', 34, () => this.open(game), {
      inList: true,
    });
    c.add(play.view);
    this.loop(
      {
        targets: play.glow,
        scale: 1.05,
        alpha: 0.82,
        duration: 1500,
        yoyo: true,
        ease: 'Sine.easeInOut',
      },
      true,
    );
    const isFav = () => services.favorites.has(game.id);
    const favBtn: IconHandle = this.glassCircle(
      36 + 372 + 20 + 42,
      452,
      84,
      isFav() ? 'check' : 'bookmark',
      34,
      () => {
        services.favorites.toggle(game.id);
        favBtn.setKind(isFav() ? 'check' : 'bookmark', isFav() ? UI.gold : 0xffffff);
        if (!reducedMotion()) {
          favBtn.view.setScale(1.28);
          this.tweens.add({ targets: favBtn.view, scale: 1, duration: 420, ease: 'Back.easeOut' });
        }
      },
      { inList: true, color: isFav() ? UI.gold : 0xffffff },
    );
    c.add(favBtn.view);
    c.add(
      this.glassCircle(
        36 + 372 + 20 + 42 + 100,
        452,
        84,
        'trophy',
        34,
        () => this.scene.start(SceneKeys.Leaderboard, { gameId: game.id }),
        { inList: true },
      ).view,
    );

    // The card itself opens the game sheet.
    root.setSize(HERO_W, HERO_H).setInteractive();
    root.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.isTap(p)) return;
      getServices(this).sfx.play('click');
      this.openSheet(game);
    });

    if (animate && !reducedMotion()) {
      root.setAlpha(0);
      root.x = cx + dir * 70;
      this.tweens.add({ targets: root, x: cx, alpha: 1, duration: 420, ease: 'Cubic.easeOut' });
    }
  }

  /** A titled row of posters that scrolls sideways. Returns the y where the next row starts. */
  private row(
    title: string,
    games: GameDefinition[],
    top: number,
    opts: { numbered?: boolean; category?: CategoryId; accent?: number } = {},
  ): number {
    const box = this.add.container(0, 0);
    this.list.add(box);
    const accent = ACCENTS[(opts.accent ?? 0) % ACCENTS.length]!;
    const bar = this.add.graphics();
    bar.fillStyle(accent).fillRoundedRect(MARGIN, top + 6, 6, 32, 3);
    this.list.add([this.halo(MARGIN + 3, top + 22, accent, 0.7, 0.55), bar]);
    this.list.add(
      txt(this, MARGIN + 22, top + 22, title, 31, { color: UI.white }).setOrigin(0, 0.5),
    );
    const { category } = opts;
    if (category) {
      // "Ver tudo ›" jumps to the full grid for that category.
      const link = this.add.container(GAME_WIDTH - MARGIN - 70, top + 22);
      link.add([
        txt(this, 0, 0, 'Ver tudo', 20, { color: UI.soft }).setOrigin(1, 0.5),
        drawIcon(this, 'chevron', 18, 0, 22, 0xb6bcdc),
      ]);
      link.setSize(190, 64).setInteractive({ useHandCursor: true });
      link.on('pointerup', (p: Phaser.Input.Pointer) => {
        if (!this.isTap(p)) return;
        getServices(this).sfx.play('click');
        this.goTab('jogos', category);
      });
      this.list.add(link);
    }

    const favs = getServices(this).favorites.list();
    const lead = opts.numbered ? TOP10_NUMBER_W : 0;
    const py = top + 62 + POSTER_H / 2;
    let x = MARGIN;
    games.forEach((game, i) => {
      if (opts.numbered) {
        const digits = String(i + 1);
        const stroke = RANK_STROKE[i] ?? '#5c62c4';
        const num = txt(this, x + (digits.length > 1 ? 62 : 52), py, digits, 190, {
          color: UI.bgCss,
          stroke,
          strokeThickness: 6,
        });
        num.setAlpha(i < 3 ? 1 : 0.9);
        box.add(num);
        x += digits.length > 1 ? 100 : lead - 4;
      }
      box.add(this.poster(game, x + POSTER_W / 2, py, favs.includes(game.id)));
      x += POSTER_W + POSTER_GAP;
    });
    this.shelves.push({
      top: top + 54,
      bottom: top + 62 + POSTER_H + 8,
      box,
      scroll: 0,
      max: Math.max(0, x + MARGIN - POSTER_GAP - GAME_WIDTH),
      velocity: 0,
    });
    return top + ROW_H;
  }

  /** A vertical glass poster: art with the icon, the title over a dark veil and the record. */
  private poster(
    game: GameDefinition,
    x: number,
    y: number,
    favorite: boolean,
  ): Phaser.GameObjects.Container {
    const services = getServices(this);
    const c = this.add.container(x, y);
    const iconY = -POSTER_H / 2 + 120;
    c.add(this.add.image(0, 0, posterArt(this, game, POSTER_W, POSTER_H, ALL(24))));
    c.add(this.halo(0, iconY, game.color, 1.3, 0.42));
    c.add(this.groundShadow(0, iconY + 72, 96));
    const icon = this.add.image(0, iconY, game.icon);
    icon.setScale(Math.min(122 / icon.width, 122 / icon.height));
    c.add(icon);

    const best = game.personalBest(services);
    if (!best) {
      c.add([
        this.add.image(
          -POSTER_W / 2 + 50,
          -POSTER_H / 2 + 30,
          pillArt(this, 64, 28, [UI.pink, UI.violet], false),
        ),
        txt(this, -POSTER_W / 2 + 50, -POSTER_H / 2 + 30, 'NOVO', 14, { color: '#ffffff' }),
      ]);
    }
    if (favorite) {
      c.add([
        this.add.image(
          POSTER_W / 2 - 32,
          -POSTER_H / 2 + 32,
          glassArt(this, 40, 40, 20, { fill: 0.14 }),
        ),
        drawIcon(this, 'star', POSTER_W / 2 - 32, -POSTER_H / 2 + 32, 22, UI.gold),
      ]);
    }

    c.add(
      txt(this, 0, POSTER_H / 2 - 66, game.title, game.title.length > 14 ? 20 : 23, {
        color: '#ffffff',
        wrapWidth: POSTER_W - 26,
      }).setOrigin(0.5, 1),
    );
    if (best) {
      const label = txt(this, 0, 0, formatNumber(best.score), 18, { color: '#ffe08a' });
      const w = Math.ceil(label.width + 62);
      label.setPosition(14, POSTER_H / 2 - 31);
      c.add([
        this.add.image(0, POSTER_H / 2 - 32, glassArt(this, w, 38, 19, { fill: 0.1 })),
        drawIcon(this, 'crown', -w / 2 + 25, POSTER_H / 2 - 32, 20, UI.gold),
        label,
      ]);
    } else {
      c.add(
        txt(this, 0, POSTER_H / 2 - 32, game.tagline, 15, {
          color: UI.soft,
          weight: 'normal',
          wrapWidth: POSTER_W - 28,
        }),
      );
    }

    this.press(c, POSTER_W, POSTER_H, () => this.openSheet(game), { inList: true, down: 0.95 });
    return c;
  }

  // ── Games grid (all games / my list) ────────────────────────────────────

  private buildChips(): void {
    const y = HEADER_H + CHIPS_H / 2 - 4;
    const h = 56;
    const labels = FILTERS.map((f) =>
      txt(this, 0, 0, CATEGORY_LABELS[f], 20, { color: '#ffffff' }),
    );
    const widths = labels.map((l) => Math.ceil(l.width + 34));
    const total = widths.reduce((a, b) => a + b, 0);
    const gap = Phaser.Math.Clamp((CONTENT_W - total) / (FILTERS.length - 1), 6, 14);
    let x = MARGIN + (CONTENT_W - total - gap * (FILTERS.length - 1)) / 2;
    FILTERS.forEach((f, i) => {
      const w = widths[i]!;
      const label = labels[i]!;
      const c = this.add.container(x + w / 2, y);
      x += w + gap;
      const on = this.filter === f;
      label.setPosition(0, -1).setColor(on ? '#ffffff' : '#b6bcdc');
      c.add([
        this.add.image(0, 0, on ? pillArt(this, w, h, CTA, true) : glassArt(this, w, h, h / 2)),
        label,
      ]);
      this.press(
        c,
        w,
        h + 12,
        () => {
          if (this.sheet || this.filter === f) return;
          this.filter = f;
          savedFilter = f;
          savedScroll.jogos = 0;
          this.showTab(true);
        },
        { down: 0.92 },
      );
      this.top.add(c);
      this.chips.push(c);
    });
  }

  private buildGrid(games: GameDefinition[], isList: boolean): number {
    const services = getServices(this);
    const favs = services.favorites.list();
    const top = this.tapTop + 24;
    const count = `${games.length} ${games.length === 1 ? 'jogo' : 'jogos'}`;
    let start: number;
    if (isList) {
      this.list.add(
        txt(this, MARGIN, top + 26, 'Minha lista', 44, { color: UI.white }).setOrigin(0, 0.5),
      );
      this.list.add(
        txt(
          this,
          MARGIN + 2,
          top + 72,
          games.length > 0 ? count : 'Seus favoritos ficam aqui',
          20,
          { color: UI.mute, weight: 'normal' },
        ).setOrigin(0, 0.5),
      );
      start = top + 108;
    } else {
      this.list.add(
        txt(this, MARGIN + 2, top + 12, count.toUpperCase(), 17, { color: UI.mute }).setOrigin(
          0,
          0.5,
        ),
      );
      start = top + 42;
    }

    if (games.length === 0) {
      const c = this.add.container(GAME_WIDTH / 2, start + 270);
      c.add([
        this.halo(0, -70, UI.violet, 3.2, 0.5),
        this.add.image(0, -70, glassArt(this, 150, 150, 75)),
        drawIcon(this, 'bookmark', 0, -70, 64, 0xffffff),
        txt(this, 0, 52, 'Sua lista está vazia', 38, { color: UI.white }),
        txt(this, 0, 118, 'Toque em um jogo e escolha\n"Minha lista" para guardá-lo aqui', 23, {
          color: UI.soft,
          weight: 'normal',
        }),
      ]);
      this.list.add(c);
      const explore = this.ctaButton(
        GAME_WIDTH / 2,
        start + 270 + 230,
        380,
        84,
        'Explorar jogos',
        30,
        () => this.goTab('jogos', 'todos'),
        { icon: false },
      );
      this.list.add(explore.view);
      return start + 620;
    }

    const gridW = GRID_COLS * POSTER_W + (GRID_COLS - 1) * GRID_GAP;
    const rise = !reducedMotion();
    games.forEach((game, i) => {
      const x = (GAME_WIDTH - gridW) / 2 + POSTER_W / 2 + (i % GRID_COLS) * (POSTER_W + GRID_GAP);
      const y = start + POSTER_H / 2 + Math.floor(i / GRID_COLS) * (POSTER_H + GRID_GAP);
      const p = this.poster(game, x, y, favs.includes(game.id));
      this.list.add(p);
      if (rise && i < 12) {
        p.setAlpha(0).y += 28;
        this.tweens.add({
          targets: p,
          y,
          alpha: 1,
          duration: 420,
          delay: 40 + i * 45,
          ease: 'Cubic.easeOut',
        });
      }
    });
    const rows = Math.ceil(games.length / GRID_COLS);
    return start + rows * (POSTER_H + GRID_GAP);
  }

  // ── Scrolling ───────────────────────────────────────────────────────────

  /** Vertical page scroll plus a sideways scroll for whichever row the finger started on. */
  private buildInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      this.dragged = false;
      this.velocity = 0;
      for (const s of this.shelves) s.velocity = 0;
      const inView = p.y >= this.tapTop && p.y <= DOCK_TOP && !this.sheet;
      if (!inView) {
        this.gesture = null;
        return;
      }
      const ly = p.y + this.scroll;
      const shelf = this.shelves.find((s) => ly >= s.top && ly <= s.bottom) ?? null;
      this.gesture = {
        sx: p.x,
        sy: p.y,
        startScroll: this.scroll,
        startShelf: shelf?.scroll ?? 0,
        lastY: p.y,
        lastX: p.x,
        lastT: this.time.now,
        axis: null,
        shelf,
      };
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      const g = this.gesture;
      if (!g || !p.isDown) return;
      const dx = p.x - g.sx;
      const dy = p.y - g.sy;
      if (!g.axis) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_SLOP) return;
        g.axis = g.shelf && Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        this.dragged = true;
      }
      const now = this.time.now;
      const dt = Math.max(1, now - g.lastT) / 1000;
      if (g.axis === 'y') {
        this.velocity = Phaser.Math.Linear(this.velocity, -(p.y - g.lastY) / dt, 0.5);
        this.scroll = this.rubberBand(g.startScroll - dy, this.maxScroll);
      } else if (g.shelf && !g.shelf.onSwipe) {
        g.shelf.velocity = Phaser.Math.Linear(g.shelf.velocity, -(p.x - g.lastX) / dt, 0.5);
        g.shelf.scroll = this.rubberBand(g.startShelf - dx, g.shelf.max);
      }
      g.lastY = p.y;
      g.lastX = p.x;
      g.lastT = now;
    });
    const release = (p: Phaser.Input.Pointer) => {
      const g = this.gesture;
      if (!g) return;
      this.gesture = null;
      if (g.axis === 'x' && g.shelf?.onSwipe) {
        const dx = p.x - g.sx;
        if (Math.abs(dx) > SWIPE_MIN) g.shelf.onSwipe(dx < 0 ? 1 : -1);
      }
      // A finger that stopped before lifting shouldn't fling.
      if (this.time.now - g.lastT > 120) {
        this.velocity = 0;
        if (g.shelf) g.shelf.velocity = 0;
      }
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

  /** Past the ends the content follows the finger at a third of the speed. */
  private rubberBand(v: number, max: number): number {
    if (v < 0) return v / 3;
    if (v > max) return max + (v - max) / 3;
    return v;
  }

  /** Momentum and spring-back for one scrolling axis. Returns the new [offset, velocity]. */
  private glide(pos: number, vel: number, max: number, dt: number): [number, number] {
    if (Math.abs(vel) > 5) {
      pos += vel * dt;
      vel *= Math.exp(-dt * 4);
    } else vel = 0;
    const target = Phaser.Math.Clamp(pos, 0, max);
    if (target !== pos) {
      pos += (target - pos) * (1 - Math.exp(-dt * 12));
      if (Math.abs(target - pos) < 0.5) pos = target;
      vel *= 0.5;
    }
    return [pos, vel];
  }

  override update(_t: number, deltaMs: number): void {
    if (!this.list) return;
    const dt = deltaMs / 1000;
    const g = this.gesture;
    if (!g || g.axis !== 'y') {
      [this.scroll, this.velocity] = this.glide(this.scroll, this.velocity, this.maxScroll, dt);
    }
    for (const s of this.shelves) {
      if (!s.box) continue;
      if (!(g && g.shelf === s && g.axis === 'x')) {
        [s.scroll, s.velocity] = this.glide(s.scroll, s.velocity, s.max, dt);
      }
      s.box.x = -s.scroll;
    }
    this.applyScroll();
    this.tickSlides(deltaMs);
  }

  /** The hero moves on by itself, unless the player is busy with something else. */
  private tickSlides(deltaMs: number): void {
    if (this.tab !== 'inicio' || !this.progress || this.slides.length < 2) return;
    const idle = !this.sheet && !this.gesture && !reducedMotion() && this.scroll < HERO_H / 2;
    if (!idle) return;
    this.slideT += deltaMs;
    if (this.slideT >= SLIDE_MS) this.goSlide(this.slide + 1, 1);
    this.drawProgress();
  }

  private applyScroll(): void {
    this.list.y = -this.scroll;
    savedScroll[this.tab] = Phaser.Math.Clamp(this.scroll, 0, this.maxScroll);
    // On the home page the header is see-through until the page scrolls under it.
    this.headerSolid.setAlpha(
      this.tab === 'inicio' ? Phaser.Math.Clamp((this.scroll - 60) / 160, 0, 1) : 1,
    );
    const g = this.scrollBar.clear();
    if (this.maxScroll <= 0) return;
    const viewH = DOCK_TOP - this.tapTop;
    const barH = Math.max(60, (viewH * viewH) / (viewH + this.maxScroll));
    const t = Phaser.Math.Clamp(this.scroll / this.maxScroll, 0, 1);
    g.fillStyle(UI.violet, 0.55).fillRoundedRect(
      GAME_WIDTH - 9,
      this.tapTop + 8 + t * (viewH - 16 - barH),
      4,
      barH,
      2,
    );
  }

  /** Taps count only when the gesture wasn't a drag and happened inside the visible area. */
  private isTap(p: Phaser.Input.Pointer): boolean {
    return !this.dragged && !this.sheet && p.y >= this.tapTop && p.y <= DOCK_TOP;
  }

  private open(game: GameDefinition): void {
    if (this.opening) return;
    // Nobody plays without a name (the dialog normally blocks the hub before this can happen).
    if (!getServices(this).profile.get().name) {
      void this.requireName().then(() => this.open(game));
      return;
    }
    this.opening = true;
    getServices(this).recents.push(game.id);
    loadGame(this.game, game).then(
      () => {
        if (this.sys.isActive()) this.scene.start(game.entryScene);
      },
      (err: unknown) => {
        console.warn(`Falha ao carregar ${game.id}`, err);
        this.opening = false;
        if (this.sys.isActive()) this.toast('Sem conexão. Tente de novo.');
      },
    );
  }

  // ── Game sheet ──────────────────────────────────────────────────────────

  /** A dimmed backdrop that closes the sheet when tapped. */
  private scrim(): { root: Phaser.GameObjects.Container; dim: Phaser.GameObjects.Rectangle } {
    const root = this.add.container(0, 0).setDepth(50);
    this.sheet = root;
    const dim = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x03040a, 0.8).setOrigin(0);
    dim.setInteractive();
    dim.on('pointerup', () => this.closeSheet());
    root.add(dim);
    return { root, dim };
  }

  /** Details sheet: a banner, the big Play button and the My List / Ranking / Invite actions. */
  private openSheet(game: GameDefinition): void {
    if (this.sheet) return;
    const services = getServices(this);
    const top = GAME_HEIGHT - SHEET_H;
    const { root, dim } = this.scrim();

    // The panel is laid out at its final position and slides up from below.
    const panel = this.add.container(0, GAME_HEIGHT);
    root.add(panel);
    const bg = this.add.graphics();
    const topRound = { tl: 40, tr: 40, bl: 0, br: 0 };
    bg.fillStyle(0x0c0e22).fillRoundedRect(0, top, GAME_WIDTH, SHEET_H + 60, topRound);
    bg.lineStyle(2, 0xffffff, 0.14).strokeRoundedRect(
      1,
      top + 1,
      GAME_WIDTH - 2,
      SHEET_H + 60,
      topRound,
    );
    // Swallows taps on the panel so they don't reach the dim layer (which closes the sheet).
    const body = this.add
      .zone(0, top, GAME_WIDTH, SHEET_H + 60)
      .setOrigin(0)
      .setInteractive();
    panel.add([bg, body]);

    const bannerH = 300;
    panel.add(
      this.add.image(
        GAME_WIDTH / 2,
        top + bannerH / 2,
        posterArt(this, game, GAME_WIDTH, bannerH, [40, 40, 0, 0]),
      ),
    );
    panel.add(this.halo(GAME_WIDTH / 2, top + 140, game.color, 4.4, 0.5));
    panel.add(this.groundShadow(GAME_WIDTH / 2, top + 244, 220));
    const icon = this.add.image(GAME_WIDTH / 2, top + 140, game.icon);
    icon.setScale(Math.min(210 / icon.width, 210 / icon.height));
    panel.add(icon);
    if (!reducedMotion()) {
      this.tweens.add({
        targets: icon,
        y: icon.y - 12,
        duration: 1500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
    panel.add(this.add.image(GAME_WIDTH / 2, top + 16, glassArt(this, 84, 8, 4, { fill: 0.35 })));
    panel.add(
      this.glassCircle(GAME_WIDTH - MARGIN - 32, top + 62, 62, 'close', 24, () => this.closeSheet())
        .view,
    );

    panel.add(
      txt(this, MARGIN, top + 346, game.title, game.title.length > 16 ? 40 : 48, {
        color: '#ffffff',
        wrapWidth: CONTENT_W,
        align: 'left',
      }).setOrigin(0, 0.5),
    );
    panel.add(
      txt(
        this,
        MARGIN + 2,
        top + 396,
        `${CATEGORY_LABELS[GAME_CATEGORY[game.id]]}  ·  ${game.tagline}`,
        22,
        { color: UI.soft, weight: 'normal', wrapWidth: CONTENT_W, align: 'left' },
      ).setOrigin(0, 0.5),
    );

    // Two glass stat cards.
    const best = game.personalBest(services);
    const cardW = (CONTENT_W - 16) / 2;
    const stat = (
      cx: number,
      kind: IconKind,
      tint: number,
      label: string,
      value: string,
      color: string,
    ) => {
      const c = this.add.container(cx, top + 478);
      c.add([
        this.add.image(0, 0, glassArt(this, cardW, 112, 28, { tint })),
        drawIcon(this, kind, -cardW / 2 + 44, 0, 38, tint),
        txt(this, -cardW / 2 + 82, -20, label, 15, { color: UI.mute }).setOrigin(0, 0.5),
        txt(this, -cardW / 2 + 82, 18, value, 28, {
          color,
          wrapWidth: cardW - 100,
          align: 'left',
        }).setOrigin(0, 0.5),
      ]);
      panel.add(c);
    };
    stat(
      MARGIN + cardW / 2,
      'crown',
      UI.gold,
      'SEU RECORDE',
      best ? formatNumber(best.score) : 'Sem recorde',
      best ? '#ffe08a' : UI.soft,
    );
    stat(
      MARGIN + cardW * 1.5 + 16,
      'trophy',
      UI.cyan,
      'RANKING',
      services.leaderboard.hasRemote ? 'Global' : 'Neste aparelho',
      UI.white,
    );

    // The one primary action.
    const play = this.ctaButton(GAME_WIDTH / 2, top + 606, CONTENT_W, 100, 'Jogar', 38, () =>
      this.open(game),
    );
    panel.add(play.view);

    // Round action buttons with a caption underneath.
    const action = (
      cx: number,
      kind: IconKind,
      label: string,
      onTap: () => void,
      color = 0xffffff,
    ) => {
      const btn = this.glassCircle(cx, top + 716, 80, kind, 34, onTap, { color });
      panel.add([
        btn.view,
        txt(this, cx, top + 784, label, 19, { color: UI.soft, weight: 'normal' }),
      ]);
      return btn;
    };
    const isFav = () => services.favorites.has(game.id);
    const fav: IconHandle = action(
      GAME_WIDTH / 2 - 200,
      isFav() ? 'check' : 'bookmark',
      'Minha lista',
      () => {
        services.favorites.toggle(game.id);
        fav.setKind(isFav() ? 'check' : 'bookmark', isFav() ? UI.gold : 0xffffff);
      },
      isFav() ? UI.gold : 0xffffff,
    );
    action(GAME_WIDTH / 2, 'trophy', 'Ranking', () =>
      this.scene.start(SceneKeys.Leaderboard, { gameId: game.id }),
    );
    action(GAME_WIDTH / 2 + 200, 'share', 'Convidar', () => {
      void shareWithToast(this, game.id, game.title, `Joga ${game.title} comigo no Fliperama!`);
    });

    // Slide up (the exit is faster than the entrance).
    const instant = reducedMotion();
    dim.setAlpha(0);
    this.tweens.add({ targets: dim, alpha: 1, duration: instant ? 0 : 220 });
    this.tweens.add({ targets: panel, y: 0, duration: instant ? 0 : 380, ease: 'Cubic.easeOut' });
  }

  /** Sound settings: a master switch, a volume slider and one switch per kind of feedback. */
  private openSettings(): void {
    if (this.sheet) return;
    const { profile, sfx } = getServices(this);
    const save = (patch: Partial<SoundPrefs>) => {
      const next = profile.update(patch);
      sfx.configure(next);
      this.soundIcon?.setKind(next.muted ? 'speakerOff' : 'speaker');
    };
    const { root } = this.scrim();

    const w = 640;
    const h = 860;
    const cx = GAME_WIDTH / 2;
    const top = 190;
    const rowW = w - 48;
    const rowH = 108;
    const card = this.add.graphics();
    card.fillStyle(0x0c0e22).fillRoundedRect(cx - w / 2, top, w, h, 40);
    card.lineStyle(2, 0xffffff, 0.14).strokeRoundedRect(cx - w / 2, top, w, h, 40);
    // Swallows taps on the card so they don't reach the dim layer (which closes the modal).
    const body = this.add.zone(cx, top + h / 2, w, h).setInteractive();
    root.add([card, body, this.halo(cx, top + 30, UI.violet, 4.4, 0.32)]);
    root.add(txt(this, cx, top + 66, 'Som e vibração', 38, { color: '#ffffff' }));
    root.add(
      txt(this, cx, top + 110, 'Deixe o Fliperama do seu jeito', 19, {
        color: UI.mute,
        weight: 'normal',
      }),
    );

    const repaints: Array<() => void> = [];
    const rowY = (i: number) => top + 210 + i * (rowH + 12);
    const frame = (i: number, label: string, hint: string) => {
      const c = this.add.container(cx, rowY(i));
      c.add([
        this.add.image(0, 0, glassArt(this, rowW, rowH, 28)),
        txt(this, -rowW / 2 + 30, -22, label, 28, { color: '#ffffff' }).setOrigin(0, 0.5),
        txt(this, -rowW / 2 + 30, 22, hint, 19, { color: UI.mute, weight: 'normal' }).setOrigin(
          0,
          0.5,
        ),
      ]);
      root.add(c);
      return c;
    };
    /** Rows below the master switch look off (but stay tappable) while everything is muted. */
    const dimWhenMuted = (c: Phaser.GameObjects.Container) =>
      repaints.push(() => c.setAlpha(profile.get().muted ? 0.45 : 1));

    const toggle = (
      i: number,
      label: string,
      hint: string,
      read: () => boolean,
      write: (v: boolean) => void,
      subordinate: boolean,
    ) => {
      const c = frame(i, label, hint);
      const tw = 84;
      const th = 46;
      const tx = rowW / 2 - 30 - tw;
      const off = this.add.graphics();
      off.fillStyle(0x2a2e55).fillRoundedRect(tx, -th / 2, tw, th, th / 2);
      off.lineStyle(2, 0xffffff, 0.12).strokeRoundedRect(tx, -th / 2, tw, th, th / 2);
      const onTrack = this.add.image(tx + tw / 2, 0, pillArt(this, tw, th, CTA, false));
      const knob = this.add.circle(0, 0, 17, 0xffffff);
      c.add([off, onTrack, knob]);
      let shown: boolean | null = null;
      repaints.push(() => {
        const on = read();
        const kx = tx + (on ? tw - 25 : 25);
        onTrack.setVisible(on);
        if (shown === null || reducedMotion()) knob.x = kx;
        else if (shown !== on) {
          this.tweens.killTweensOf(knob);
          this.tweens.add({ targets: knob, x: kx, duration: 220, ease: 'Back.easeOut' });
        }
        shown = on;
      });
      if (subordinate) dimWhenMuted(c);
      c.setSize(rowW, rowH).setInteractive({ useHandCursor: true });
      c.on('pointerup', () => {
        write(!read());
        sfx.play('click');
        repaints.forEach((f) => f());
      });
    };

    toggle(
      0,
      'Som',
      'Liga ou desliga tudo de uma vez',
      () => !profile.get().muted,
      (on) => save({ muted: !on }),
      false,
    );

    // Volume slider.
    const vol = frame(1, 'Volume', '');
    dimWhenMuted(vol);
    const trackW = rowW - 60;
    const trackX = -trackW / 2;
    const bar = this.add.graphics();
    const knob = this.add.circle(0, 24, 17, 0xffffff);
    const knobGlow = this.halo(0, 24, UI.violet, 0.3, 0.8);
    const pct = txt(this, rowW / 2 - 30, -22, '', 26, { color: UI.soft }).setOrigin(1, 0.5);
    vol.add([bar, knobGlow, knob, pct]);
    repaints.push(() => {
      const v = profile.get().volume;
      const x = trackX + ((v - MIN_VOLUME) / (1 - MIN_VOLUME)) * trackW;
      bar.clear();
      bar.fillStyle(0x2a2e55).fillRoundedRect(trackX, 19, trackW, 10, 5);
      bar.fillStyle(UI.violet).fillRoundedRect(trackX, 19, Math.max(10, x - trackX), 10, 5);
      knob.setPosition(x, 24);
      knobGlow.setPosition(x, 24);
      pct.setText(`${Math.round(v * 100)}%`);
    });
    const setFromPointer = (p: Phaser.Input.Pointer) => {
      const t = Phaser.Math.Clamp((p.x - (cx + trackX)) / trackW, 0, 1);
      // 5% steps keep the value tidy and the percentage readable.
      const v = Math.round((MIN_VOLUME + t * (1 - MIN_VOLUME)) * 20) / 20;
      if (v !== profile.get().volume) save({ volume: v });
      repaints.forEach((f) => f());
    };
    vol.setSize(rowW, rowH).setInteractive({ useHandCursor: true });
    vol.on('pointerdown', setFromPointer);
    vol.on('pointermove', (p: Phaser.Input.Pointer) => p.isDown && setFromPointer(p));
    // Plays a sample at the new loudness once the finger lifts.
    vol.on('pointerup', () => sfx.play('click'));

    toggle(
      2,
      'Toques nos botões',
      'Cliques do menu e dos jogos',
      () => profile.get().uiSounds,
      (on) => save({ uiSounds: on }),
      true,
    );
    toggle(
      3,
      'Sons dos jogos',
      'Acertos, batidas, vitória e fim de jogo',
      () => profile.get().gameSounds,
      (on) => save({ gameSounds: on }),
      true,
    );
    toggle(
      4,
      'Vibração',
      'Só em celulares compatíveis',
      () => profile.get().vibration,
      (on) => {
        save({ vibration: on });
        if (on) sfx.vibrate(40);
      },
      false,
    );

    repaints.forEach((f) => f());
    const done = this.ctaButton(
      cx,
      top + h - 62,
      w - 96,
      88,
      'Pronto',
      32,
      () => this.closeSheet(),
      { icon: false },
    );
    root.add(done.view);
    if (!reducedMotion()) {
      root.setAlpha(0);
      this.tweens.add({ targets: root, alpha: 1, duration: 200 });
    }
  }

  private closeSheet(): void {
    const root = this.sheet;
    if (!root) return;
    this.sheet = null;
    // My List may have changed: refresh whatever the tab shows.
    this.showTab(false);
    this.tweens.add({
      targets: root,
      alpha: 0,
      duration: reducedMotion() ? 0 : 180,
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

  /** One banner at a time above the dock; tap it to see that ranking. */
  private showOvertakes(queue: Array<{ game: GameDefinition; o: Overtake }>): void {
    const next = queue.shift();
    if (!next) return;
    const { game, o } = next;
    const services = getServices(this);
    services.sfx.play('hit');
    const where = o.to ? `Você caiu de ${o.from}º para ${o.to}º` : `Você saiu do top ${GLOBAL_TOP}`;
    const rest = DOCK_TOP - 96;
    const banner = this.add.container(GAME_WIDTH / 2, rest).setDepth(30);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.4).fillRoundedRect(-330, -58, 660, 136, 30);
    bg.fillStyle(0x12142b).fillRoundedRect(-330, -68, 660, 136, 30);
    bg.lineStyle(3, UI.pink, 0.9).strokeRoundedRect(-330, -68, 660, 136, 30);
    const icon = this.add.image(-262, -2, game.icon);
    icon.setScale(Math.min(92 / icon.width, 92 / icon.height));
    banner.add([
      bg,
      this.halo(-262, -2, UI.pink, 1.1, 0.5),
      icon,
      txt(this, 40, -26, `${o.by} passou você no ${game.title}!`, 25, {
        color: '#ffd166',
      }).setWordWrapWidth(500),
      txt(this, 40, 24, `${where} · toque para ver`, 21, {
        color: UI.soft,
        weight: 'normal',
      }),
    ]);
    banner.setSize(660, 136).setInteractive({ useHandCursor: true });
    const close = () => {
      if (!banner.active) return;
      this.tweens.add({
        targets: banner,
        y: GAME_HEIGHT + 120,
        duration: 260,
        onComplete: () => {
          banner.destroy();
          this.showOvertakes(queue);
        },
      });
    };
    banner.on('pointerup', () => this.scene.start(SceneKeys.Leaderboard, { gameId: game.id }));
    banner.y = GAME_HEIGHT + 120;
    this.tweens.add({ targets: banner, y: rest, duration: 420, ease: 'Back.easeOut' });
    this.time.delayedCall(5500, close);
  }
}
