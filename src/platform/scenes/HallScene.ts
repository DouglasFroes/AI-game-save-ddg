import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { GAMES, getGame, type GameDefinition } from '@/games/registry';
import { loadGame } from '@/platform/gameLoader';
import {
  loadBoards,
  medalTable,
  placesOf,
  type Medal,
  type Medalist,
  type MedalWin,
} from '@/platform/hallOfFame';
import {
  addHalo,
  attachSpringPress,
  buildAuroraSceneBackdrop,
  buildAvatarOrb,
  buildGlassActionButton,
  buildTactile3DButton,
  fitText,
  formatRunColumns,
  formatRunDate,
  prefersReducedMotion,
  soraText,
} from '@/platform/ui/arcadeUx';
import {
  BRAND,
  dockArt,
  fadeArt,
  glassArt,
  medalArt,
  pillArt,
  podiumPedestalArt,
  sunburstArt,
  UI,
} from '@/platform/ui/hubTheme';
import { openAccount } from '@/platform/ui/accountDialog';
import { drawIcon } from '@/platform/ui/icons';
import { getServices } from '@/services';

export interface HallData {
  /** Opens straight on a player's medals. */
  player?: string;
}

const MARGIN = 30;
const CONTENT_W = GAME_WIDTH - MARGIN * 2;
const VIEW_TOP = 200;
const VIEW_BOTTOM = 1088;
const VIEW_H = VIEW_BOTTOM - VIEW_TOP;
const DRAG_SLOP = 10;
/** How many runs per board are read to find three different players. */
const BOARD_DEPTH = 10;
/** Boards read in parallel (the connection multiplexes them). */
const BOARD_CONCURRENCY = 16;
const CACHE_MS = 180_000;
const MAX_ROWS = 50;

const MEDAL_RIM: Record<Medal, readonly number[]> = {
  1: [0xfff3b0, 0xffd166, 0xf59e0b],
  2: [0xffffff, 0xcbd5e1, 0x64748b],
  3: [0xffedd5, 0xfb923c, 0xb45309],
};
const MEDAL_TINT: Record<Medal, number> = { 1: 0xffd166, 2: 0xd5dbff, 3: 0xffb27a };
const MEDAL_TITLE: Record<Medal, string> = {
  1: '🥇 RECORDES (1º LUGAR)',
  2: '🥈 2º LUGAR',
  3: '🥉 3º LUGAR',
};

/** Survives scene restarts: the table is costly to read, and the open player is kept. */
let cache: { at: number; online: boolean; table: Medalist[]; who: string } | null = null;
let openPlayer: string | null = null;

const medalLine = (m: Medalist): string => `🥇 ${m.gold}   🥈 ${m.silver}   🥉 ${m.bronze}`;

/**
 * "Hall da Fama": the players holding the most records (first places) across every game, with a
 * page per player listing the boards they lead, each one a tap away from playing to beat it.
 */
export class HallScene extends Phaser.Scene {
  private table: Medalist[] = [];
  private places: number[] = [];
  private online = false;
  private loading = false;
  private launching = false;

  private scrollBox!: Phaser.GameObjects.Container;
  private scrollBar!: Phaser.GameObjects.Graphics;
  private top!: Phaser.GameObjects.Container;
  private strip!: Phaser.GameObjects.Container;
  private title!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;

  private scroll = 0;
  private maxScroll = 0;
  private velocity = 0;
  private pointerDown = false;
  private isDragging = false;
  private dragStartY = 0;
  private dragStartScroll = 0;
  private lastDragY = 0;
  private lastDragT = 0;

  constructor() {
    super(SceneKeys.Hall);
  }

  init(data: HallData): void {
    if (data.player) openPlayer = data.player;
    this.launching = false;
    this.loading = false;
    this.scroll = 0;
    this.velocity = 0;
    this.pointerDown = false;
    this.isDragging = false;
  }

  create(): void {
    buildAuroraSceneBackdrop(this, UI.gold);
    this.scrollBox = this.add.container(0, VIEW_TOP);
    const maskShape = this.make.graphics({});
    maskShape.fillStyle(0xffffff).fillRect(0, VIEW_TOP, GAME_WIDTH, VIEW_H);
    this.scrollBox.setMask(maskShape.createGeometryMask());
    this.add
      .image(0, VIEW_TOP - 4, fadeArt(this, GAME_WIDTH, 40, true))
      .setOrigin(0)
      .setDepth(15);
    this.add
      .image(0, VIEW_BOTTOM - 56, fadeArt(this, GAME_WIDTH, 60, false))
      .setOrigin(0)
      .setDepth(15);
    this.top = this.add.container(0, 0).setDepth(25);
    this.scrollBar = this.add.graphics().setDepth(26);
    this.strip = this.add.container(0, 0).setDepth(28);
    this.buildHeader();
    this.buildDock();
    this.buildScrollInput();
    void this.fetchTable(false);
  }

  override update(_t: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 16.6667;
    if (!this.pointerDown && Math.abs(this.velocity) > 0.15) {
      this.scroll = Phaser.Math.Clamp(this.scroll + this.velocity * dt, 0, this.maxScroll);
      this.velocity *= Math.pow(0.92, dt);
      if (this.scroll <= 0 || this.scroll >= this.maxScroll) this.velocity = 0;
      this.applyScroll();
    }
  }

  // ── Data ──────────────────────────────────────────────────────────────────

  private async fetchTable(force: boolean): Promise<void> {
    if (this.loading) return;
    const { leaderboard } = getServices(this);
    const who = getServices(this).account.current()?.email ?? '';
    if (!force && cache && cache.who === who && Date.now() - cache.at < CACHE_MS) {
      this.apply(cache.table, cache.online);
      return;
    }
    this.loading = true;
    this.clearContent();
    const ids = GAMES.map((g) => g.id);
    // Paint at once from the last global boards kept on this device, then refresh behind it.
    const saved = ids.map((id) => ({ gameId: id, entries: leaderboard.snapshot(id) }));
    const shown = saved.every((b) => b.entries !== null);
    if (shown) {
      this.apply(
        medalTable(saved.map((b) => ({ gameId: b.gameId, entries: b.entries ?? [] }))),
        true,
      );
      this.status.setText(`${this.status.text} · ATUALIZANDO…`);
    } else {
      this.status.setText('BUSCANDO OS RECORDES DE TODOS OS JOGOS…');
      this.renderLoading();
    }
    // Every board at once (the connection is shared, so a dead network fails them together
    // instead of one by one); with no network at all, read straight from the device.
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const boards = await loadBoards(
      ids,
      (id) =>
        offline ? leaderboard.listLocal(id, BOARD_DEPTH) : leaderboard.list(id, BOARD_DEPTH),
      BOARD_CONCURRENCY,
    );
    const online = !offline && leaderboard.online;
    this.loading = false;
    if (!this.sys.isActive()) return;
    if (shown && !online) {
      // Keep the last global table rather than swapping it for this device's own boards.
      this.status.setText('📴 SEM CONEXÃO · ÚLTIMO RANKING GLOBAL SALVO');
      return;
    }
    const table = medalTable(boards);
    cache = { at: Date.now(), online, table, who };
    const keep = this.scroll;
    this.apply(table, online);
    if (shown && !openPlayer) {
      this.scroll = Math.min(keep, this.maxScroll);
      this.applyScroll();
    }
  }

  private apply(table: Medalist[], online: boolean): void {
    this.table = table;
    this.places = placesOf(table);
    this.online = online;
    const player = openPlayer ? table.find((m) => m.player === openPlayer) : undefined;
    if (player) this.showPlayer(player);
    else this.showTable();
  }

  private isMine(m: Medalist): boolean {
    const { leaderboard } = getServices(this);
    return m.wins.some((w) => leaderboard.isMine(w.entry));
  }

  private placeOf(m: Medalist): number {
    return this.places[this.table.indexOf(m)] ?? this.table.length;
  }

  // ── Header, dock and personal strip ───────────────────────────────────────

  private buildHeader(): void {
    const cy = 70;
    this.top.add(this.add.image(0, 0, fadeArt(this, GAME_WIDTH, 190, true)).setOrigin(0));
    const back = this.add.container(MARGIN + 32, cy);
    back.add([
      this.add.image(0, 0, glassArt(this, 64, 64, 32, { fill: 0.1 })),
      drawIcon(this, 'back', -2, 0, 28, 0xffffff),
    ]);
    attachSpringPress(this, back, 72, 72, () => this.goBack(), { downScale: 0.88 });

    const badge = this.add.container(MARGIN + 114, cy);
    badge.add([
      addHalo(this, 0, 0, UI.gold, 1.4, 0.55),
      this.add.image(0, 0, glassArt(this, 72, 72, 24, { tint: UI.gold })),
      drawIcon(this, 'trophy', 0, 0, 40, UI.gold),
    ]);
    this.title = soraText(this, MARGIN + 164, cy - 16, 'Hall da Fama', 34, {
      color: UI.white,
      align: 'left',
    }).setOrigin(0, 0.5);
    this.status = soraText(this, MARGIN + 164, cy + 20, '', 15, {
      color: UI.soft,
      weight: 'bold',
      align: 'left',
    }).setOrigin(0, 0.5);

    const refresh = this.add.container(GAME_WIDTH - MARGIN - 32, cy);
    refresh.add([
      this.add.image(0, 0, glassArt(this, 64, 64, 32, { fill: 0.1 })),
      drawIcon(this, 'retry', 0, 0, 28, UI.cyan),
    ]);
    attachSpringPress(this, refresh, 72, 72, () => void this.fetchTable(true), { downScale: 0.88 });
    this.top.add([back, badge, this.title, this.status, refresh]);
    this.top.add(
      soraText(
        this,
        GAME_WIDTH / 2,
        150,
        'Cada 1º lugar em um jogo é um recorde 🥇 · 2º e 3º desempatam',
        17,
        { color: UI.mute, weight: 'normal' },
      ),
    );
  }

  private buildDock(): void {
    const cy = 1216;
    const bar = this.add.container(0, 0).setDepth(28);
    bar.add(this.add.image(GAME_WIDTH / 2, cy, dockArt(this, CONTENT_W + 8, 96).key));
    bar.add(
      buildGlassActionButton(
        this,
        MARGIN + 114,
        cy,
        212,
        74,
        'back',
        UI.cyan,
        'Voltar',
        () => this.goBack(),
        { fontSize: 26, tint: UI.cyan },
      ),
    );
    bar.add(
      buildTactile3DButton(
        this,
        GAME_WIDTH / 2 + 104,
        cy - 2,
        420,
        74,
        'Bater um recorde',
        () => this.playRandomRecord(),
        {
          icon: 'play',
          fontSize: 26,
          shimmer: true,
          pulse: true,
          lipColor: 0x7c2d12,
          colors: [0xf59e0b, 0xf97316, UI.pink],
        },
      ),
    );
  }

  private goBack(): void {
    if (openPlayer) {
      openPlayer = null;
      this.showTable();
    } else this.scene.start(SceneKeys.Hub);
  }

  /** A board whose record isn't the player's own: the quickest way into the competition. */
  private playRandomRecord(): void {
    const { leaderboard } = getServices(this);
    const open = this.openPlayerData();
    const wins = (open ? open.wins : this.table.flatMap((m) => m.wins)).filter(
      (w) => w.medal === 1 && !leaderboard.isMine(w.entry),
    );
    const pick = wins[Math.floor(Math.random() * wins.length)];
    const ids = new Set(
      this.table.flatMap((m) => m.wins.filter((w) => w.medal === 1).map((w) => w.gameId)),
    );
    // No records to beat: an empty board is a free record.
    const free = GAMES.filter((g) => !ids.has(g.id));
    const game = pick ? getGame(pick.gameId) : free[Math.floor(Math.random() * free.length)];
    if (game) this.play(game);
  }

  private openPlayerData(): Medalist | undefined {
    return openPlayer ? this.table.find((m) => m.player === openPlayer) : undefined;
  }

  private refreshStrip(): void {
    this.strip.removeAll(true);
    const me = this.table.find((m) => this.isMine(m));
    const name = getServices(this).profile.get().name || 'Você';
    const box = this.add.container(GAME_WIDTH / 2, 1126);
    box.add(this.add.image(0, 0, glassArt(this, CONTENT_W, 62, 22, { tint: UI.gold, fill: 0.1 })));
    box.add(buildAvatarOrb(this, -CONTENT_W / 2 + 36, 0, 42, name, [UI.gold, UI.violet]));
    box.add(
      soraText(this, -CONTENT_W / 2 + 68, -11, `${name} · Sua posição`, 14, {
        color: UI.soft,
        weight: 'normal',
        align: 'left',
      }).setOrigin(0, 0.5),
    );
    const line = soraText(
      this,
      -CONTENT_W / 2 + 68,
      12,
      me ? medalLine(me) : 'Sem medalhas ainda',
      19,
      { color: me ? '#ffd166' : UI.white, align: 'left' },
    ).setOrigin(0, 0.5);
    fitText(line, 300, 13);
    box.add(line);
    const { account } = getServices(this);
    // Signed-out players can't reach the global board: the strip asks them to sign in.
    const login = account.available && !account.current();
    const pillW = 200;
    const px = CONTENT_W / 2 - pillW / 2 - 12;
    const colors = login ? [0x4285f4, 0x2563eb] : me ? [0xf59e0b, 0xd97706] : [0x2a2e55, 0x1d2040];
    box.add(this.add.image(px, 0, pillArt(this, pillW, 42, colors, false)));
    const label = soraText(
      this,
      px,
      0,
      login ? 'G  Entrar com Google' : me ? `🏆 ${this.placeOf(me)}º no Hall` : '🚀 Entre no pódio',
      16,
      { color: '#ffffff' },
    );
    fitText(label, pillW - 20, 12);
    box.add(label);
    if (login) {
      void account.prepare();
      attachSpringPress(
        this,
        box,
        CONTENT_W,
        62,
        () =>
          void openAccount(this).then(() => {
            if (this.sys.isActive() && account.current()) void this.fetchTable(true);
          }),
        { downScale: 0.97 },
      );
    } else if (me)
      attachSpringPress(this, box, CONTENT_W, 62, () => this.openPlayer(me), { downScale: 0.97 });
    this.strip.add(box);
  }

  // ── Table view ────────────────────────────────────────────────────────────

  private showTable(): void {
    openPlayer = null;
    this.clearContent();
    this.title.setText('Hall da Fama');
    const records = this.table.reduce((n, m) => n + m.gold, 0);
    this.status.setText(
      `${this.online ? '🌎 GLOBAL' : '📱 NESTE APARELHO'} · ${records} RECORDES EM ${GAMES.length} JOGOS`,
    );
    fitText(this.status, GAME_WIDTH - MARGIN * 2 - 230, 11);
    let y = 10;
    y = this.renderPodium(y);
    const rows = this.table.slice(0, MAX_ROWS);
    rows.forEach((m, i) => {
      y = this.renderPlayerRow(y, m, i);
    });
    if (this.table.length === 0) {
      y = this.renderCallout(
        y,
        'Nenhum recorde ainda!',
        'Jogue qualquer jogo: o primeiro lugar de cada ranking vale um recorde aqui no Hall da Fama.',
      );
    } else if (this.table.length < 4) {
      y = this.renderCallout(
        y,
        'O pódio ainda tem vaga',
        'Cada jogo sem dono é um recorde fácil. Toque em “Bater um recorde” e escreva seu nome aqui.',
      );
    }
    this.finishLayout(y + 24);
    this.refreshStrip();
  }

  private renderLoading(): void {
    const c = this.add.container(GAME_WIDTH / 2, 170);
    c.add([
      this.add.image(0, 0, glassArt(this, CONTENT_W, 280, 32, { tint: UI.gold, fill: 0.06 })),
      drawIcon(this, 'trophy', 0, -40, 64, UI.gold).setAlpha(0.7),
      soraText(this, 0, 50, 'Contando os recordes…', 26, { color: UI.soft }),
    ]);
    this.scrollBox.add(c);
  }

  private renderPodium(topY: number): number {
    const h = 300;
    const stage = this.add.container(GAME_WIDTH / 2, topY + h / 2);
    stage.add(
      this.add.image(0, 0, glassArt(this, CONTENT_W, h, 34, { tint: UI.gold, fill: 0.07 })),
    );
    const first = this.table[0];
    const rays = this.add
      .image(0, -30, sunburstArt(this, 300))
      .setTint(UI.gold)
      .setAlpha(first ? 0.45 : 0.15)
      .setBlendMode(Phaser.BlendModes.ADD);
    stage.add([rays, addHalo(this, 0, -20, UI.gold, 2.4, first ? 0.3 : 0.1)]);
    if (!prefersReducedMotion())
      this.tweens.add({ targets: rays, angle: 360, duration: 28000, repeat: -1 });
    const specs = [
      { m: this.table[1], rank: 2 as Medal, x: -208, w: 192, ph: 118, d: 64 },
      { m: this.table[0], rank: 1 as Medal, x: 0, w: 216, ph: 150, d: 80 },
      { m: this.table[2], rank: 3 as Medal, x: 208, w: 192, ph: 104, d: 60 },
    ];
    const floor = h / 2 - 10;
    for (const s of specs) {
      const col = this.add.container(s.x, 0);
      const pedTop = floor - s.ph;
      col.add(
        this.add.image(0, pedTop + s.ph / 2, podiumPedestalArt(this, s.w, s.ph, s.rank, !!s.m)),
      );
      const orbY = pedTop - s.d * 0.46;
      if (s.m) {
        const m = s.m;
        if (s.rank === 1) col.add(drawIcon(this, 'crown', 0, orbY - s.d * 0.68, 30, UI.gold));
        col.add(buildAvatarOrb(this, 0, orbY, s.d, m.name, MEDAL_RIM[s.rank]));
        col.add(
          this.add.image(
            s.d * 0.34,
            orbY + s.d * 0.28,
            medalArt(this, s.rank, s.rank === 1 ? 40 : 34),
          ),
        );
        const name = soraText(this, 0, pedTop + 32, m.name, s.rank === 1 ? 20 : 18, {
          color: this.isMine(m) ? '#ffe08a' : '#ffffff',
          stroke: '#00000088',
          strokeThickness: 4,
        });
        fitText(name, s.w - 22, 12);
        const count = soraText(this, 0, pedTop + 66, `${m.gold} 🏆`, s.rank === 1 ? 30 : 24, {
          color: s.rank === 1 ? '#ffd166' : '#e2e8f0',
          stroke: '#000000aa',
          strokeThickness: 5,
        });
        const sub = soraText(
          this,
          0,
          pedTop + (s.rank === 1 ? 100 : 94),
          `🥈${m.silver} 🥉${m.bronze}`,
          14,
          {
            color: UI.soft,
            weight: 'normal',
          },
        );
        col.add([name, count, sub]);
        attachSpringPress(this, col, s.w, h - 20, () => this.openPlayer(m), {
          downScale: 0.95,
          guard: (p) => this.tapAllowed(p),
        });
      } else {
        col.add([
          soraText(this, 0, pedTop + 42, `${s.rank}º Lugar`, 18, { color: UI.soft }),
          soraText(this, 0, pedTop + 68, 'Em aberto', 14, { color: UI.mute, weight: 'normal' }),
        ]);
        col.add(
          drawIcon(this, 'trophy', 0, orbY, Math.round(s.d * 0.45), MEDAL_TINT[s.rank]).setAlpha(
            0.4,
          ),
        );
      }
      if (!prefersReducedMotion()) {
        col.setY(26).setAlpha(0);
        this.tweens.add({
          targets: col,
          y: 0,
          alpha: 1,
          duration: 380,
          delay: 60 * s.rank,
          ease: 'Back.easeOut',
        });
      }
      stage.add(col);
    }
    this.scrollBox.add(stage);
    return topY + h + 14;
  }

  private renderPlayerRow(topY: number, m: Medalist, index: number): number {
    const rowH = 86;
    const place = this.places[index] ?? index + 1;
    const mine = this.isMine(m);
    const top3 = place <= 3 ? (place as Medal) : null;
    const row = this.add.container(GAME_WIDTH / 2, topY + rowH / 2);
    row.add(
      this.add.image(
        0,
        0,
        glassArt(this, CONTENT_W, rowH, 24, {
          tint: mine ? UI.gold : top3 ? MEDAL_TINT[top3] : undefined,
          fill: mine ? 0.14 : top3 ? 0.09 : 0.06,
        }),
      ),
    );
    if (mine) {
      row.add(
        this.add
          .graphics()
          .lineStyle(2.5, UI.gold, 0.9)
          .strokeRoundedRect(-CONTENT_W / 2 + 1, -rowH / 2 + 1, CONTENT_W - 2, rowH - 2, 24),
      );
    }
    const posX = -CONTENT_W / 2 + 40;
    if (top3) row.add(this.add.image(posX, 0, medalArt(this, top3, 46)));
    else row.add(soraText(this, posX, 0, `${place}º`, 22, { color: mine ? '#ffd166' : UI.soft }));
    row.add(
      buildAvatarOrb(this, -CONTENT_W / 2 + 100, 0, 48, m.name, top3 ? MEDAL_RIM[top3] : BRAND),
    );

    const tx = -CONTENT_W / 2 + 138;
    const name = soraText(this, tx, -14, m.name, 23, {
      color: mine ? '#ffe08a' : UI.white,
      align: 'left',
    }).setOrigin(0, 0.5);
    fitText(name, mine ? 190 : 260, 15);
    row.add(name);
    if (mine) {
      const bx = tx + name.width + 10;
      row.add(this.add.graphics().fillStyle(UI.gold).fillRoundedRect(bx, -25, 60, 22, 11));
      row.add(soraText(this, bx + 30, -14, 'VOCÊ', 12, { color: '#1f1300', strokeThickness: 0 }));
    }
    // A few of the boards they lead, as tiny game icons.
    const golds = m.wins.filter((w) => w.medal === 1).slice(0, 5);
    golds.forEach((w, i) => {
      const icon = this.add.image(tx + 14 + i * 34, 18, getGame(w.gameId).icon);
      icon.setScale(Math.min(28 / icon.width, 28 / icon.height));
      row.add(icon);
    });
    const subX = tx + (golds.length ? golds.length * 34 + 4 : 0);
    const more = m.gold - golds.length;
    const sub = soraText(
      this,
      subX,
      18,
      `${more > 0 ? `+${more}  ` : ''}🥈${m.silver} 🥉${m.bronze}`,
      15,
      { color: UI.soft, weight: 'normal', align: 'left' },
    ).setOrigin(0, 0.5);
    fitText(sub, 330 - (subX - tx), 11);
    row.add(sub);

    const rx = CONTENT_W / 2 - 48;
    row.add(
      soraText(this, rx, -8, `${m.gold}`, 30, {
        color: m.gold && (mine || place === 1) ? '#ffd166' : UI.white,
        align: 'right',
      }).setOrigin(1, 0.5),
    );
    row.add(
      soraText(this, rx, 20, m.gold === 1 ? 'RECORDE' : 'RECORDES', 11, {
        color: UI.mute,
        align: 'right',
      }).setOrigin(1, 0.5),
    );
    row.add(drawIcon(this, 'chevron', CONTENT_W / 2 - 22, 0, 20, 0xb6bcdc));

    attachSpringPress(this, row, CONTENT_W, rowH, () => this.openPlayer(m), {
      downScale: 0.97,
      guard: (p) => this.tapAllowed(p),
    });
    this.slideIn(row, index);
    this.scrollBox.add(row);
    return topY + rowH + 10;
  }

  // ── Player view ───────────────────────────────────────────────────────────

  private openPlayer(m: Medalist): void {
    openPlayer = m.player;
    this.showPlayer(m);
  }

  private showPlayer(m: Medalist): void {
    this.clearContent();
    const mine = this.isMine(m);
    this.title.setText(mine ? 'Suas medalhas' : m.name);
    fitText(this.title, 380, 20);
    this.status.setText(
      `${this.placeOf(m)}º NO HALL DA FAMA · ${m.gold} ${m.gold === 1 ? 'RECORDE' : 'RECORDES'}`,
    );
    fitText(this.status, GAME_WIDTH - MARGIN * 2 - 230, 11);

    let y = 10;
    // Profile card.
    const h = 190;
    const card = this.add.container(GAME_WIDTH / 2, y + h / 2);
    card.add(this.add.image(0, 0, glassArt(this, CONTENT_W, h, 32, { tint: UI.gold, fill: 0.08 })));
    card.add(addHalo(this, -CONTENT_W / 2 + 100, 0, UI.gold, 2, 0.4));
    card.add(buildAvatarOrb(this, -CONTENT_W / 2 + 100, 0, 112, m.name, MEDAL_RIM[1]));
    const nm = soraText(this, -CONTENT_W / 2 + 186, -48, m.name, 32, {
      color: '#ffffff',
      align: 'left',
    }).setOrigin(0, 0.5);
    fitText(nm, CONTENT_W - 220, 18);
    card.add(nm);
    card.add(
      soraText(
        this,
        -CONTENT_W / 2 + 186,
        -10,
        mine ? 'Defenda seus recordes!' : `Toque em um jogo para tentar bater`,
        17,
        { color: UI.soft, weight: 'normal', align: 'left' },
      ).setOrigin(0, 0.5),
    );
    ([1, 2, 3] as const).forEach((medal, i) => {
      const x = -CONTENT_W / 2 + 230 + i * 130;
      card.add(this.add.image(x, 44, medalArt(this, medal, 44)));
      card.add(
        soraText(this, x + 32, 44, `${[m.gold, m.silver, m.bronze][i]}`, 30, {
          color: medal === 1 ? '#ffd166' : '#ffffff',
          align: 'left',
        }).setOrigin(0, 0.5),
      );
    });
    this.scrollBox.add(card);
    y += h + 16;

    let n = 0;
    for (const medal of [1, 2, 3] as const) {
      const wins = m.wins.filter((w) => w.medal === medal);
      if (!wins.length) continue;
      y = this.renderSection(y, `${MEDAL_TITLE[medal]} · ${wins.length}`);
      for (const w of wins) y = this.renderWin(y, w, mine, n++);
    }
    this.finishLayout(y + 24);
    this.refreshStrip();
  }

  private renderSection(topY: number, label: string): number {
    this.scrollBox.add(
      soraText(this, MARGIN + 8, topY + 18, label, 18, { color: UI.mute, align: 'left' }).setOrigin(
        0,
        0.5,
      ),
    );
    return topY + 42;
  }

  private renderWin(topY: number, w: MedalWin, mine: boolean, index: number): number {
    const def = getGame(w.gameId);
    const h = 108;
    const card = this.add.container(GAME_WIDTH / 2, topY + h / 2);
    card.add(
      this.add.image(0, 0, glassArt(this, CONTENT_W, h, 26, { tint: def.color, fill: 0.1 })),
    );
    const ix = -CONTENT_W / 2 + 62;
    card.add(addHalo(this, ix, 0, def.color, 1.2, 0.45));
    const icon = this.add.image(ix, 0, def.icon);
    icon.setScale(Math.min(76 / icon.width, 76 / icon.height));
    card.add(icon);
    card.add(this.add.image(ix + 30, 30, medalArt(this, w.medal, 30)));

    const tx = -CONTENT_W / 2 + 118;
    const title = soraText(this, tx, -28, def.title, 23, {
      color: '#ffffff',
      align: 'left',
    }).setOrigin(0, 0.5);
    fitText(title, 290, 15);
    const cols = formatRunColumns(def.columns, w.entry.score, w.entry.details);
    const value = soraText(
      this,
      tx,
      4,
      `${cols.primary.value} ${cols.primary.label.toLowerCase()}`,
      22,
      {
        color: w.medal === 1 ? '#ffd166' : '#e2e8f0',
        align: 'left',
      },
    ).setOrigin(0, 0.5);
    fitText(value, 290, 14);
    const extra = [
      ...cols.extras.map((x) => `${x.label}: ${x.value}`),
      formatRunDate(w.entry.date).short,
    ]
      .filter((s) => s && s !== '-')
      .join(' · ');
    const sub = soraText(this, tx, 32, extra || 'Ranking oficial', 14, {
      color: UI.mute,
      weight: 'normal',
      align: 'left',
    }).setOrigin(0, 0.5);
    fitText(sub, 290, 11);
    card.add([title, value, sub]);

    // Opens that game's ranking; the button jumps straight into the game.
    attachSpringPress(
      this,
      card,
      CONTENT_W,
      h,
      () => this.scene.start(SceneKeys.Leaderboard, { gameId: def.id, back: SceneKeys.Hall }),
      { downScale: 0.97, guard: (p) => this.tapAllowed(p) && p.x < GAME_WIDTH - 200 },
    );
    const btn = this.add.container(CONTENT_W / 2 - 86, 0);
    btn.add(
      this.add.image(
        0,
        0,
        pillArt(this, 148, 58, mine ? [0x22c55e, 0x16a34a] : [0xf59e0b, 0xf97316], true),
      ),
    );
    btn.add(drawIcon(this, 'play', -46, 0, 20, 0xffffff));
    btn.add(soraText(this, 12, -1, mine ? 'Jogar' : 'Bater', 22, { color: '#ffffff' }));
    attachSpringPress(this, btn, 160, 80, () => this.play(def), {
      downScale: 0.9,
      guard: (p) => this.tapAllowed(p),
    });
    card.add(btn);
    this.slideIn(card, index);
    this.scrollBox.add(card);
    return topY + h + 12;
  }

  private renderCallout(topY: number, headline: string, body: string): number {
    const h = 170;
    const c = this.add.container(GAME_WIDTH / 2, topY + 6 + h / 2);
    c.add(this.add.image(0, 0, glassArt(this, CONTENT_W, h, 30, { tint: UI.violet, fill: 0.08 })));
    c.add(drawIcon(this, 'crown', -CONTENT_W / 2 + 70, 0, 56, UI.gold));
    c.add(
      soraText(this, -CONTENT_W / 2 + 130, -40, headline, 24, {
        color: '#ffffff',
        align: 'left',
      }).setOrigin(0, 0.5),
    );
    c.add(
      soraText(this, -CONTENT_W / 2 + 130, 20, body, 17, {
        color: UI.soft,
        weight: 'normal',
        align: 'left',
        wrapWidth: CONTENT_W - 160,
      }).setOrigin(0, 0.5),
    );
    this.scrollBox.add(c);
    return topY + h + 18;
  }

  private slideIn(target: Phaser.GameObjects.Container, index: number): void {
    if (prefersReducedMotion() || index >= 12) return;
    target.setAlpha(0).setX(GAME_WIDTH / 2 + 24);
    this.tweens.add({
      targets: target,
      alpha: 1,
      x: GAME_WIDTH / 2,
      duration: 260,
      delay: Math.min(360, index * 32),
      ease: 'Cubic.easeOut',
    });
  }

  private play(def: GameDefinition): void {
    if (this.launching) return;
    this.launching = true;
    getServices(this).recents.push(def.id);
    loadGame(this.game, def).then(
      () => {
        if (this.sys.isActive()) this.scene.start(def.entryScene);
      },
      () => {
        this.launching = false;
      },
    );
  }

  // ── Scrolling ─────────────────────────────────────────────────────────────

  /** Taps on list items only count inside the visible area and when the finger didn't drag. */
  private tapAllowed(p: Phaser.Input.Pointer): boolean {
    return !this.isDragging && p.y >= VIEW_TOP && p.y <= VIEW_BOTTOM;
  }

  private clearContent(): void {
    for (const child of this.scrollBox.list) this.tweens.killTweensOf(child);
    this.scrollBox.removeAll(true);
    this.scroll = 0;
    this.maxScroll = 0;
    this.velocity = 0;
    this.applyScroll();
  }

  private finishLayout(contentHeight: number): void {
    this.maxScroll = Math.max(0, contentHeight - VIEW_H);
    this.scroll = Phaser.Math.Clamp(this.scroll, 0, this.maxScroll);
    this.applyScroll();
  }

  private applyScroll(): void {
    this.scrollBox.y = VIEW_TOP - this.scroll;
    const g = this.scrollBar.clear();
    if (this.maxScroll <= 0) return;
    const barH = Math.max(54, (VIEW_H * VIEW_H) / (VIEW_H + this.maxScroll));
    const t = Phaser.Math.Clamp(this.scroll / this.maxScroll, 0, 1);
    g.fillStyle(UI.gold, 0.55).fillRoundedRect(
      GAME_WIDTH - 9,
      VIEW_TOP + 8 + t * (VIEW_H - 16 - barH),
      4,
      barH,
      2,
    );
  }

  private buildScrollInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      // Reset here, not on release: item taps read it on their own pointerup.
      this.isDragging = false;
      if (p.y < VIEW_TOP || p.y > VIEW_BOTTOM) return;
      this.pointerDown = true;
      this.velocity = 0;
      this.dragStartY = p.y;
      this.dragStartScroll = this.scroll;
      this.lastDragY = p.y;
      this.lastDragT = p.event.timeStamp || performance.now();
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.pointerDown || !p.isDown) return;
      const dy = this.dragStartY - p.y;
      if (!this.isDragging && Math.abs(dy) > DRAG_SLOP) this.isDragging = true;
      if (!this.isDragging) return;
      const now = p.event.timeStamp || performance.now();
      const dt = Math.max(1, now - this.lastDragT);
      this.velocity = Phaser.Math.Clamp(((this.lastDragY - p.y) / dt) * 16.67, -48, 48);
      this.lastDragY = p.y;
      this.lastDragT = now;
      this.scroll = Phaser.Math.Clamp(this.dragStartScroll + dy, 0, this.maxScroll);
      this.applyScroll();
    });
    const end = () => {
      this.pointerDown = false;
    };
    this.input.on('pointerup', end);
    this.input.on('pointerupoutside', end);
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.maxScroll <= 0) return;
      this.velocity = 0;
      this.scroll = Phaser.Math.Clamp(this.scroll + dy * 0.65, 0, this.maxScroll);
      this.applyScroll();
    });
  }
}
