import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys, type SceneKey } from '@/config';
import { getGame, type GameDefinition } from '@/games/registry';
import { loadGame } from '@/platform/gameLoader';
import { GLOBAL_TOP, type LeaderboardEntry } from '@/platform/leaderboard';
import { LOCAL_TOP, type LocalRun } from '@/platform/localTop';
import { formatNumber } from '@/platform/ranking';
import { shareWithToast } from '@/platform/share';
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
  ALL,
  BRAND,
  dockArt,
  fadeArt,
  glassArt,
  medalArt,
  mix,
  pillArt,
  podiumPedestalArt,
  posterArt,
  sunburstArt,
  UI,
} from '@/platform/ui/hubTheme';
import { drawIcon, type IconKind } from '@/platform/ui/icons';
import { openAccount } from '@/platform/ui/accountDialog';
import { getServices } from '@/services';

export interface LeaderboardData {
  gameId: string;
  /** Scene to return to (defaults to the hub). */
  back?: SceneKey;
}

type Tab = 'global' | 'mine';

interface PodiumSlot {
  readonly rank: 1 | 2 | 3;
  readonly name: string;
  readonly primaryValue: string;
  readonly primaryLabel: string;
  readonly extraText: string;
  readonly isMine: boolean;
}

const MARGIN = 30;
const CONTENT_W = GAME_WIDTH - MARGIN * 2;
const VIEW_TOP = 216;
const VIEW_BOTTOM = 1088;
const VIEW_H = VIEW_BOTTOM - VIEW_TOP;
const DRAG_SLOP = 10;

const PODIUM_COLORS: Record<1 | 2 | 3, { rim: readonly number[]; score: string; tint: number }> = {
  1: { rim: [0xfff3b0, 0xffd166, 0xf59e0b], score: '#ffd166', tint: 0xffd166 },
  2: { rim: [0xffffff, 0xcbd5e1, 0x64748b], score: '#e2e8f0', tint: 0xd5dbff },
  3: { rim: [0xffedd5, 0xfb923c, 0xb45309], score: '#fed7aa', tint: 0xffb27a },
};

/**
 * Competitive AAA mobile leaderboard: 3D champions podium, metallic medals, glass rank cards,
 * momentum scrolling, personal standing dock and instant game launch.
 */
export class LeaderboardScene extends Phaser.Scene {
  private def!: GameDefinition;
  private back: SceneKey = SceneKeys.Hub;
  private tab: Tab = 'global';

  private topBar!: Phaser.GameObjects.Container;
  private avatarBox!: Phaser.GameObjects.Container;
  private statusDot!: Phaser.GameObjects.Arc;
  private statusLabel!: Phaser.GameObjects.Text;
  private tabIndicator!: Phaser.GameObjects.Image;
  private tabLabels!: Record<
    Tab,
    { icon: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text }
  >;

  private scrollBox!: Phaser.GameObjects.Container;
  private scrollBar!: Phaser.GameObjects.Graphics;
  private personalStrip!: Phaser.GameObjects.Container;

  private scroll = 0;
  private maxScroll = 0;
  private velocity = 0;
  private dragStartY = 0;
  private dragStartScroll = 0;
  private lastDragY = 0;
  private lastDragT = 0;
  private isDragging = false;
  private pointerDown = false;
  private launching = false;
  private cachedGlobalEntries: LeaderboardEntry[] | null = null;

  constructor() {
    super(SceneKeys.Leaderboard);
  }

  init(data: LeaderboardData): void {
    this.def = getGame(data.gameId);
    this.back = data.back ?? SceneKeys.Hub;
    this.tab = 'global';
    this.scroll = 0;
    this.maxScroll = 0;
    this.velocity = 0;
    this.isDragging = false;
    this.pointerDown = false;
    this.launching = false;
    this.cachedGlobalEntries = null;
  }

  create(): void {
    buildAuroraSceneBackdrop(this, this.def.color);

    // Scrollable content container with geometry mask
    this.scrollBox = this.add.container(0, VIEW_TOP);
    const maskShape = this.make.graphics({});
    maskShape.fillStyle(0xffffff).fillRect(0, VIEW_TOP, GAME_WIDTH, VIEW_H);
    this.scrollBox.setMask(maskShape.createGeometryMask());

    // Top and bottom edge fades so scrolled cards melt smoothly
    this.add
      .image(0, VIEW_TOP - 4, fadeArt(this, GAME_WIDTH, 44, true))
      .setOrigin(0)
      .setDepth(15);
    this.add
      .image(0, VIEW_BOTTOM - 56, fadeArt(this, GAME_WIDTH, 60, false))
      .setOrigin(0)
      .setDepth(15);

    this.topBar = this.add.container(0, 0).setDepth(25);
    this.scrollBar = this.add.graphics().setDepth(26);
    this.personalStrip = this.add.container(0, 0).setDepth(28);

    this.buildHeader();
    this.buildTabSwitcher();
    this.buildBottomDock();
    this.buildScrollInput();

    this.show('global', true);
  }

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 16.6667;
    if (!this.pointerDown && Math.abs(this.velocity) > 0.15) {
      this.scroll = Phaser.Math.Clamp(this.scroll + this.velocity * dt, 0, this.maxScroll);
      this.velocity *= Math.pow(0.92, dt);
      if (this.scroll <= 0 || this.scroll >= this.maxScroll) this.velocity = 0;
      this.applyScroll();
    }
  }

  // ── Header & Segmented Tabs ───────────────────────────────────────────────

  private buildHeader(): void {
    const cy = 72;
    this.topBar.add(this.add.image(0, 0, fadeArt(this, GAME_WIDTH, 190, true)).setOrigin(0));

    // Back button
    const backBtn = this.add.container(MARGIN + 32, cy);
    backBtn.add([
      this.add.image(0, 0, glassArt(this, 64, 64, 32, { fill: 0.1 })),
      drawIcon(this, 'back', -2, 0, 28, 0xffffff),
    ]);
    attachSpringPress(this, backBtn, 72, 72, () => this.scene.start(this.back), {
      downScale: 0.88,
    });
    this.topBar.add(backBtn);

    // Floating 3D game icon badge
    const badgeX = MARGIN + 114;
    const badge = this.add.container(badgeX, cy);
    const halo = addHalo(this, 0, 0, this.def.color, 1.35, 0.55);
    const ring = this.add.image(0, 0, glassArt(this, 72, 72, 24, { tint: this.def.color }));
    const icon = this.add.image(0, 0, this.def.icon);
    icon.setScale(Math.min(54 / icon.width, 54 / icon.height));
    badge.add([halo, ring, icon]);
    this.topBar.add(badge);
    if (!prefersReducedMotion()) {
      this.tweens.add({
        targets: icon,
        y: -4,
        duration: 1400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Game Title & Live Status
    const titleX = badgeX + 50;
    const title = soraText(this, titleX, cy - 15, this.def.title, 32, {
      color: UI.white,
      align: 'left',
    }).setOrigin(0, 0.5);
    fitText(title, 330, 22);

    this.statusDot = this.add.circle(titleX + 7, cy + 19, 5, UI.cyan);
    this.statusLabel = soraText(this, titleX + 20, cy + 19, 'CARREGANDO PLACAR…', 15, {
      color: UI.soft,
      weight: 'bold',
      align: 'left',
    }).setOrigin(0, 0.5);
    if (!prefersReducedMotion()) {
      this.tweens.add({
        targets: this.statusDot,
        alpha: 0.35,
        scale: 1.25,
        duration: 900,
        yoyo: true,
        repeat: -1,
      });
    }
    this.topBar.add([title, this.statusDot, this.statusLabel]);

    // Player Avatar (tap to edit nickname)
    const avatarX = GAME_WIDTH - MARGIN - 32;
    this.avatarBox = this.add.container(avatarX, cy);
    this.refreshAvatar();
    attachSpringPress(
      this,
      this.avatarBox,
      76,
      76,
      () => {
        void openAccount(this).then(() => {
          if (!this.sys.isActive()) return;
          this.refreshAvatar();
          this.show(this.tab, false);
        });
      },
      { downScale: 0.9 },
    );
    this.topBar.add(this.avatarBox);
  }

  private refreshAvatar(): void {
    const { profile } = getServices(this);
    const name = profile.get().name;
    this.avatarBox.removeAll(true);
    const orb = buildAvatarOrb(this, 0, 0, 62, name, BRAND);
    const editBadge = this.add.circle(20, 20, 12, 0x12142b).setStrokeStyle(2, UI.cyan, 0.8);
    const pencil = drawIcon(this, 'pencil', 20, 20, 12, 0xffffff);
    this.avatarBox.add([orb, editBadge, pencil]);
  }

  private buildTabSwitcher(): void {
    const cy = 166;
    const trackW = CONTENT_W;
    const trackH = 66;
    const pillW = (trackW - 12) / 2;
    const pillH = 54;
    const leftX = GAME_WIDTH / 2 - pillW / 2 - 2;
    const rightX = GAME_WIDTH / 2 + pillW / 2 + 2;

    this.topBar.add(
      this.add.image(
        GAME_WIDTH / 2,
        cy,
        glassArt(this, trackW, trackH, trackH / 2, { fill: 0.09 }),
      ),
    );

    const activeColors = [mix(this.def.color, UI.violet, 0.35), UI.violet, UI.pink];
    this.tabIndicator = this.add.image(leftX, cy, pillArt(this, pillW, pillH, activeColors, true));
    this.topBar.add(this.tabIndicator);

    const makeTab = (
      tab: Tab,
      x: number,
      iconKind: IconKind,
      label: string,
    ): { icon: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text } => {
      const hit = this.add.container(x, cy);
      const text = soraText(this, 16, 0, label, 22, { color: UI.white });
      const icon = drawIcon(this, iconKind, -text.width / 2 - 8, 0, 24, 0xffffff);
      hit.add([icon, text]);
      attachSpringPress(
        this,
        hit,
        pillW,
        trackH,
        () => {
          if (this.tab !== tab) this.show(tab, false);
        },
        { downScale: 0.96 },
      );
      this.topBar.add(hit);
      return { icon, text };
    };

    this.tabLabels = {
      global: makeTab('global', leftX, 'trophy', `Top ${GLOBAL_TOP} Placar`),
      mine: makeTab('mine', rightX, 'crown', `Meus ${LOCAL_TOP} Recordes`),
    };
  }

  // ── Tab Switching & Data Loading ──────────────────────────────────────────

  private show(tab: Tab, instant = false): void {
    this.tab = tab;
    this.scroll = 0;
    this.velocity = 0;

    const pillW = (CONTENT_W - 12) / 2;
    const targetX =
      tab === 'global' ? GAME_WIDTH / 2 - pillW / 2 - 2 : GAME_WIDTH / 2 + pillW / 2 + 2;

    this.tweens.killTweensOf(this.tabIndicator);
    if (instant || prefersReducedMotion()) {
      this.tabIndicator.x = targetX;
    } else {
      this.tweens.add({
        targets: this.tabIndicator,
        x: targetX,
        duration: 280,
        ease: 'Back.easeOut',
      });
    }

    this.tabLabels.global.text.setColor(tab === 'global' ? '#ffffff' : UI.soft);
    this.tabLabels.mine.text.setColor(tab === 'mine' ? '#ffffff' : UI.soft);
    this.tabLabels.global.icon.setAlpha(tab === 'global' ? 1 : 0.65);
    this.tabLabels.mine.icon.setAlpha(tab === 'mine' ? 1 : 0.65);

    if (tab === 'global') void this.showGlobal();
    else this.showMine();
  }

  private clearContent(): void {
    this.scrollBox.removeAll(true);
    this.scroll = 0;
    this.maxScroll = 0;
    this.applyScroll();
  }

  private async showGlobal(): Promise<void> {
    const services = getServices(this);
    const { leaderboard } = services;
    this.clearContent();
    this.statusDot.setFillStyle(UI.cyan);
    this.statusLabel.setText('SINCRONIZANDO RANKING…');
    this.renderLoadingSkeleton();

    const entries = await leaderboard.list(this.def.id, GLOBAL_TOP);
    // The player saw the board: that's the new baseline for "someone passed you" warnings.
    if (leaderboard.online) {
      services.rankWatch.check(this.def.id, entries, (e) => leaderboard.isMine(e));
    }
    if (!this.scene.isActive() || this.tab !== 'global') return;

    this.cachedGlobalEntries = entries;
    this.clearContent();

    this.statusDot.setFillStyle(leaderboard.online ? 0x34d399 : UI.cyan);
    this.statusLabel.setText(
      leaderboard.online
        ? `🌎 RANKING GLOBAL AO VIVO · TOP ${GLOBAL_TOP}`
        : `📱 RANKING LOCAL · TOP ${GLOBAL_TOP} NESTE APARELHO`,
    );

    const podiumSlots: Array<PodiumSlot | null> = ([0, 1, 2] as const).map((idx) => {
      const e = entries[idx];
      if (!e) return null;
      const cols = formatRunColumns(this.def.columns, e.score, e.details);
      return {
        rank: (idx + 1) as 1 | 2 | 3,
        name: e.name,
        primaryValue: cols.primary.value,
        primaryLabel: cols.primary.label,
        extraText: cols.extras.map((x) => `${x.label}: ${x.value}`).join(' · '),
        isMine: leaderboard.isMine(e),
      };
    });

    let y = 10;
    y = this.renderPodiumStage(y, podiumSlots, 'global');
    y = this.renderListHeader(y, 'JOGADOR');

    entries.forEach((e: LeaderboardEntry, i) => {
      const mine = leaderboard.isMine(e);
      const cols = formatRunColumns(this.def.columns, e.score, e.details);
      const d = formatRunDate(e.date);
      const extraParts = cols.extras.map((x) => `${x.label}: ${x.value}`);
      if (d.short !== '-') extraParts.push(d.short);
      y = this.renderRankRow(y, {
        index: i,
        title: e.name,
        avatarName: e.name,
        subtitle: extraParts.join('  ·  ') || 'Partida oficial registrada',
        primaryValue: cols.primary.value,
        primaryLabel: cols.primary.label,
        highlight: mine,
        badgeText: mine ? 'VOCÊ' : undefined,
      });
    });

    if (entries.length < 5) {
      y = this.renderArenaCallout(
        y + 6,
        entries.length === 0
          ? 'Ninguém aqui ainda. Seja o primeiro campeão!'
          : `Restam ${GLOBAL_TOP - entries.length} vagas abertas no Top ${GLOBAL_TOP}!`,
        entries.length === 0
          ? `Jogue uma partida de ${this.def.title} para inaugurar o pódio e cravar seu nome no topo.`
          : 'Qualquer partida que entrar entre os 20 melhores aparece automaticamente no placar.',
      );
    }

    this.finishScrollLayout(y + 24);
    this.refreshPersonalStrip(entries);
  }

  private showMine(): void {
    const services = getServices(this);
    const runs = services.localTop.list(this.def.id);
    const playerName = services.profile.get().name || 'Você';
    this.clearContent();

    this.statusDot.setFillStyle(UI.gold);
    this.statusLabel.setText(`⭐ SUAS ${LOCAL_TOP} MELHORES PARTIDAS NESTE APARELHO`);

    const podiumSlots: Array<PodiumSlot | null> = ([0, 1, 2] as const).map((idx) => {
      const r = runs[idx];
      if (!r) return null;
      const cols = formatRunColumns(this.def.columns, r.score, r.details);
      const d = formatRunDate(r.date);
      return {
        rank: (idx + 1) as 1 | 2 | 3,
        name: d.short !== '-' ? d.short : `${idx + 1}ª Marca`,
        primaryValue: cols.primary.value,
        primaryLabel: cols.primary.label,
        extraText: cols.extras.map((x) => `${x.label}: ${x.value}`).join(' · '),
        isMine: idx === 0,
      };
    });

    let y = 10;
    y = this.renderPodiumStage(y, podiumSlots, 'mine');
    y = this.renderListHeader(y, 'DATA DA PARTIDA');

    runs.forEach((r: LocalRun, i) => {
      const cols = formatRunColumns(this.def.columns, r.score, r.details);
      const d = formatRunDate(r.date);
      const extraParts = cols.extras.map((x) => `${x.label}: ${x.value}`);
      y = this.renderRankRow(y, {
        index: i,
        title: d.full !== '-' ? d.full : d.short,
        avatarName: playerName,
        subtitle:
          extraParts.join('  ·  ') ||
          (i === 0 ? 'Melhor resultado pessoal neste aparelho' : `${i + 1}º melhor resultado seu`),
        primaryValue: cols.primary.value,
        primaryLabel: cols.primary.label,
        highlight: i === 0,
        badgeText: i === 0 ? 'RECORDE' : undefined,
      });
    });

    if (runs.length < 5) {
      y = this.renderArenaCallout(
        y + 6,
        runs.length === 0
          ? 'Jogue uma partida para começar sua lista!'
          : `Você tem ${runs.length} de ${LOCAL_TOP} recordes pessoais salvos`,
        runs.length === 0
          ? `Suas ${LOCAL_TOP} melhores partidas de ${this.def.title} ficam guardadas aqui com todos os detalhes.`
          : 'Continue jogando para preencher seu histórico pessoal e superar sua própria marca!',
      );
    }

    this.finishScrollLayout(y + 24);
    this.refreshPersonalStrip(this.cachedGlobalEntries);
  }

  // ── Podium, Rows & Empty/Challenge Fillers ────────────────────────────────

  private renderLoadingSkeleton(): void {
    const stage = this.add.container(GAME_WIDTH / 2, 160);
    stage.add([
      this.add.image(
        0,
        0,
        glassArt(this, CONTENT_W, 280, 32, { tint: this.def.color, fill: 0.06 }),
      ),
      soraText(this, 0, 0, 'Carregando placar…', 26, { color: UI.soft }),
    ]);
    this.scrollBox.add(stage);
  }

  /**
   * 3D Champions Podium Stage featuring 1st (center, elevated), 2nd (left) and 3rd (right) places.
   */
  private renderPodiumStage(
    topY: number,
    slots:
      readonly [PodiumSlot | null, PodiumSlot | null, PodiumSlot | null] | Array<PodiumSlot | null>,
    mode: Tab,
  ): number {
    const stageH = 304;
    const cy = topY + stageH / 2;
    const stage = this.add.container(GAME_WIDTH / 2, cy);

    // Stage glass backdrop with subtle game-color wash
    stage.add(
      this.add.image(
        0,
        0,
        glassArt(this, CONTENT_W, stageH, 34, { tint: this.def.color, fill: 0.07 }),
      ),
    );

    // Sunburst rays rotating behind 1st place
    const rays = this.add
      .image(0, -28, sunburstArt(this, 310))
      .setTint(UI.gold)
      .setAlpha(slots[0] ? 0.45 : 0.16)
      .setBlendMode(Phaser.BlendModes.ADD);
    stage.add(rays);
    if (!prefersReducedMotion()) {
      this.tweens.add({
        targets: rays,
        angle: 360,
        duration: 28000,
        repeat: -1,
      });
    }

    stage.add(addHalo(this, 0, -20, UI.gold, 2.5, slots[0] ? 0.32 : 0.12));

    // Layout specs for #2 (left), #1 (center), #3 (right)
    const specs: Array<{
      slot: PodiumSlot | null;
      rank: 1 | 2 | 3;
      x: number;
      pedW: number;
      pedH: number;
      orbD: number;
    }> = [
      { slot: slots[1] ?? null, rank: 2, x: -208, pedW: 192, pedH: 122, orbD: 64 },
      { slot: slots[0] ?? null, rank: 1, x: 0, pedW: 216, pedH: 154, orbD: 78 },
      { slot: slots[2] ?? null, rank: 3, x: 208, pedW: 192, pedH: 108, orbD: 60 },
    ];

    const floorY = stageH / 2 - 10;

    for (const sp of specs) {
      const { slot, rank, x, pedW, pedH, orbD } = sp;
      const pal = PODIUM_COLORS[rank];
      const occupied = slot !== null;
      const pedTopY = floorY - pedH;
      const col = this.add.container(x, 0);

      // 3D Podium Pedestal
      const ped = this.add.image(
        0,
        pedTopY + pedH / 2,
        podiumPedestalArt(this, pedW, pedH, rank, occupied),
      );
      col.add(ped);

      // Avatar orb sitting above the pedestal top deck
      const orbY = pedTopY - orbD * 0.44;
      if (occupied) {
        if (rank === 1) {
          const crown = drawIcon(this, 'crown', 0, orbY - orbD * 0.66, 30, UI.gold);
          col.add(crown);
          if (!prefersReducedMotion()) {
            this.tweens.add({
              targets: crown,
              y: crown.y - 5,
              duration: 1100,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut',
            });
          }
        }
        const orb = buildAvatarOrb(
          this,
          0,
          orbY,
          orbD,
          mode === 'mine' ? getServices(this).profile.get().name || '★' : slot.name,
          pal.rim,
        );
        const medal = this.add
          .image(orbD * 0.34, orbY + orbD * 0.28, medalArt(this, rank, rank === 1 ? 40 : 34))
          .setScale(0.95);
        col.add([orb, medal]);

        if (slot.isMine) {
          const tag = this.add.container(-orbD * 0.34, orbY - orbD * 0.34);
          const tagBg = this.add.graphics();
          tagBg.fillStyle(UI.gold).fillRoundedRect(-30, -11, 60, 22, 11);
          tag.add([
            tagBg,
            soraText(this, 0, 0, mode === 'mine' ? 'TOP 1' : 'VOCÊ', 11, {
              color: '#1a1000',
              strokeThickness: 0,
            }),
          ]);
          col.add(tag);
        }

        // Name & Score inside the pedestal front face
        const nameTxt = soraText(this, 0, pedTopY + 34, slot.name, rank === 1 ? 20 : 18, {
          color: '#ffffff',
          stroke: '#00000088',
          strokeThickness: 4,
        });
        fitText(nameTxt, pedW - 22, 13);

        const scoreTxt = soraText(
          this,
          0,
          pedTopY + (rank === 1 ? 66 : 60),
          slot.primaryValue,
          rank === 1 ? 26 : 22,
          {
            color: pal.score,
            stroke: '#000000aa',
            strokeThickness: 5,
          },
        );
        fitText(scoreTxt, pedW - 18, 15);

        col.add([nameTxt, scoreTxt]);

        if (slot.extraText) {
          const extraTxt = soraText(this, 0, pedTopY + (rank === 1 ? 96 : 86), slot.extraText, 13, {
            color: UI.soft,
            weight: 'normal',
          });
          fitText(extraTxt, pedW - 18, 11);
          col.add(extraTxt);
        }
      } else {
        // Unoccupied podium slot: sleek mystery silhouette
        const emptyOrb = this.add.container(0, orbY);
        emptyOrb.add([
          this.add.image(
            0,
            0,
            glassArt(this, orbD, orbD, orbD / 2, { tint: pal.tint, fill: 0.05 }),
          ),
          drawIcon(this, 'trophy', 0, 0, Math.round(orbD * 0.42), pal.tint).setAlpha(0.45),
        ]);
        const openTxt = soraText(this, 0, pedTopY + 42, `${rank}º Lugar`, 18, {
          color: UI.soft,
        });
        const subTxt = soraText(this, 0, pedTopY + 68, 'Em aberto', 14, {
          color: UI.mute,
          weight: 'normal',
        });
        col.add([emptyOrb, openTxt, subTxt]);
      }

      if (!prefersReducedMotion()) {
        col.setY(28).setAlpha(0);
        this.tweens.add({
          targets: col,
          y: 0,
          alpha: 1,
          duration: 380,
          delay: rank === 1 ? 60 : rank === 2 ? 120 : 180,
          ease: 'Back.easeOut',
        });
      }
      stage.add(col);
    }

    this.scrollBox.add(stage);
    return topY + stageH + 14;
  }

  private renderListHeader(topY: number, nameLabel: string): number {
    const h = 38;
    const cy = topY + h / 2;
    const row = this.add.container(GAME_WIDTH / 2, cy);
    row.add(this.add.image(0, 0, glassArt(this, CONTENT_W, h, 19, { fill: 0.05 })));

    const primaryCol = this.def.columns.find((c) => c.key === 'score') ?? this.def.columns[0];
    const extraLabels = this.def.columns
      .filter((c) => c !== primaryCol)
      .map((c) => c.label.toUpperCase())
      .join(' · ');

    row.add([
      soraText(this, -CONTENT_W / 2 + 38, 0, 'POS', 13, { color: UI.mute }),
      soraText(
        this,
        -CONTENT_W / 2 + 104,
        0,
        extraLabels ? `${nameLabel}  (${extraLabels})` : nameLabel,
        13,
        { color: UI.mute, align: 'left' },
      ).setOrigin(0, 0.5),
      soraText(
        this,
        CONTENT_W / 2 - 24,
        0,
        (primaryCol?.label === '★' ? 'ESTRELAS' : (primaryCol?.label ?? 'PONTOS')).toUpperCase(),
        13,
        { color: UI.mute, align: 'right' },
      ).setOrigin(1, 0.5),
    ]);

    this.scrollBox.add(row);
    return topY + h + 10;
  }

  private renderRankRow(
    topY: number,
    opts: {
      index: number;
      title: string;
      avatarName: string;
      subtitle: string;
      primaryValue: string;
      primaryLabel: string;
      highlight: boolean;
      badgeText?: string;
    },
  ): number {
    const rowH = 78;
    const cy = topY + rowH / 2;
    const rank = opts.index + 1;
    const isTop3 = rank <= 3;
    const row = this.add.container(GAME_WIDTH / 2, cy);

    const tint = opts.highlight
      ? UI.gold
      : isTop3
        ? PODIUM_COLORS[rank as 1 | 2 | 3].tint
        : undefined;
    row.add(
      this.add.image(
        0,
        0,
        glassArt(this, CONTENT_W, rowH, 24, {
          tint,
          fill: opts.highlight ? 0.14 : isTop3 ? 0.09 : 0.06,
        }),
      ),
    );

    if (opts.highlight) {
      const border = this.add.graphics();
      border
        .lineStyle(2.5, UI.gold, 0.9)
        .strokeRoundedRect(-CONTENT_W / 2 + 1, -rowH / 2 + 1, CONTENT_W - 2, rowH - 2, 24);
      row.add(border);
    }

    // Rank Badge or 3D Medal
    const posX = -CONTENT_W / 2 + 40;
    if (isTop3) {
      row.add(this.add.image(posX, 0, medalArt(this, rank as 1 | 2 | 3, 46)));
    } else {
      const badge = this.add.graphics();
      badge
        .fillStyle(opts.highlight ? 0x3b2f10 : 0x161936, 0.9)
        .fillRoundedRect(posX - 24, -21, 48, 42, 14);
      badge
        .lineStyle(1.5, opts.highlight ? UI.gold : 0xffffff, 0.2)
        .strokeRoundedRect(posX - 24, -21, 48, 42, 14);
      row.add([
        badge,
        soraText(this, posX, 0, `${rank}º`, 20, {
          color: opts.highlight ? '#ffd166' : UI.soft,
        }),
      ]);
    }

    // Player Avatar Orb
    const avatarX = -CONTENT_W / 2 + 100;
    const rim = isTop3 ? PODIUM_COLORS[rank as 1 | 2 | 3].rim : BRAND;
    row.add(buildAvatarOrb(this, avatarX, 0, 46, opts.avatarName, rim));

    // Player Name + Highlight Badge + Subtitle Details
    const textX = -CONTENT_W / 2 + 136;
    const maxNameW = opts.badgeText ? 210 : 280;
    const nameTxt = soraText(this, textX, -12, opts.title, 22, {
      color: opts.highlight ? '#ffe08a' : UI.white,
      align: 'left',
    }).setOrigin(0, 0.5);
    fitText(nameTxt, maxNameW, 16);
    row.add(nameTxt);

    if (opts.badgeText) {
      const bx = textX + nameTxt.width + 12;
      const bw = 68;
      const bh = 22;
      const tag = this.add.graphics();
      tag.fillStyle(UI.gold).fillRoundedRect(bx, -23, bw, bh, 11);
      row.add([
        tag,
        soraText(this, bx + bw / 2, -12, opts.badgeText, 12, {
          color: '#1f1300',
          strokeThickness: 0,
        }),
      ]);
    }

    const subTxt = soraText(this, textX, 16, opts.subtitle, 15, {
      color: opts.highlight ? '#e2e8f0' : UI.soft,
      weight: 'normal',
      align: 'left',
    }).setOrigin(0, 0.5);
    fitText(subTxt, 300, 12);
    row.add(subTxt);

    // Primary Metric on the right
    const rightX = CONTENT_W / 2 - 24;
    const valTxt = soraText(this, rightX, -8, opts.primaryValue, 26, {
      color: opts.highlight || rank === 1 ? '#ffd166' : UI.white,
      align: 'right',
    }).setOrigin(1, 0.5);
    fitText(valTxt, 160, 18);

    const lblTxt = soraText(this, rightX, 18, opts.primaryLabel, 11, {
      color: UI.mute,
      align: 'right',
    }).setOrigin(1, 0.5);
    row.add([valTxt, lblTxt]);

    if (!prefersReducedMotion() && opts.index < 12) {
      row.setAlpha(0).setX(GAME_WIDTH / 2 + 24);
      this.tweens.add({
        targets: row,
        alpha: 1,
        x: GAME_WIDTH / 2,
        duration: 260,
        delay: Math.min(360, opts.index * 32),
        ease: 'Cubic.easeOut',
      });
    }

    this.scrollBox.add(row);
    return topY + rowH + 10;
  }

  /**
   * Rich motivational call-to-action card rendered when the board has few entries,
   * ensuring zero empty space and strong engagement.
   */
  private renderArenaCallout(topY: number, headline: string, bodyText: string): number {
    const cardH = 228;
    const cy = topY + cardH / 2;
    const card = this.add.container(GAME_WIDTH / 2, cy);

    card.add(this.add.image(0, 0, posterArt(this, this.def, CONTENT_W, cardH, ALL(30))));
    card.add(addHalo(this, -CONTENT_W / 2 + 86, 0, this.def.color, 2.2, 0.45));

    const icon = this.add.image(-CONTENT_W / 2 + 86, -8, this.def.icon);
    icon.setScale(Math.min(104 / icon.width, 104 / icon.height));
    card.add(icon);

    const tx = -CONTENT_W / 2 + 162;
    const wrapW = CONTENT_W - 188;
    const hTxt = soraText(this, tx, -56, headline, 23, {
      color: '#ffffff',
      align: 'left',
      wrapWidth: wrapW,
    }).setOrigin(0, 0.5);

    const bTxt = soraText(this, tx, -2, bodyText, 16, {
      color: UI.soft,
      weight: 'normal',
      align: 'left',
      wrapWidth: wrapW,
    }).setOrigin(0, 0.5);

    const cta = buildTactile3DButton(
      this,
      tx + 150,
      64,
      300,
      64,
      'Jogar Agora',
      () => this.playGame(),
      {
        colors: [this.def.color, UI.violet, UI.pink],
        lipColor: this.def.shade,
        icon: 'play',
        fontSize: 24,
        shimmer: true,
      },
    );

    card.add([hTxt, bTxt, cta]);
    this.scrollBox.add(card);
    return topY + cardH + 12;
  }

  // ── Personal Standing Strip & Bottom Action Dock ──────────────────────────

  private refreshPersonalStrip(globalEntries: readonly LeaderboardEntry[] | null): void {
    const services = getServices(this);
    const best = this.def.personalBest(services);
    const localRuns = services.localTop.list(this.def.id);
    const name = services.profile.get().name || 'Jogador';

    let myGlobalRank: number | null = null;
    if (globalEntries) {
      const idx = globalEntries.findIndex((e) => services.leaderboard.isMine(e));
      if (idx >= 0) myGlobalRank = idx + 1;
    }

    this.personalStrip.removeAll(true);
    const cy = 1126;
    const stripH = 62;
    const box = this.add.container(GAME_WIDTH / 2, cy);
    box.add(
      this.add.image(0, 0, glassArt(this, CONTENT_W, stripH, 22, { tint: UI.gold, fill: 0.1 })),
    );

    const orb = buildAvatarOrb(this, -CONTENT_W / 2 + 36, 0, 42, name, [UI.gold, UI.violet]);
    const bestStr = best ? formatNumber(best.score) : 'Sem recorde';
    const leftTitle = soraText(this, -CONTENT_W / 2 + 68, -10, `${name} · Seu Recorde`, 14, {
      color: UI.soft,
      weight: 'normal',
      align: 'left',
    }).setOrigin(0, 0.5);
    const leftVal = soraText(this, -CONTENT_W / 2 + 68, 12, bestStr, 22, {
      color: best ? '#ffd166' : UI.white,
      align: 'left',
    }).setOrigin(0, 0.5);

    const rankBadgeText =
      myGlobalRank !== null
        ? `🏆 #${myGlobalRank} no Top ${GLOBAL_TOP}`
        : localRuns.length > 0
          ? `⭐ ${localRuns.length}/${LOCAL_TOP} Partidas`
          : '🚀 Busque o Top 20';

    const pillW = 224;
    const pillX = CONTENT_W / 2 - pillW / 2 - 12;
    const badgeBg = this.add.image(
      pillX,
      0,
      pillArt(
        this,
        pillW,
        42,
        myGlobalRank !== null ? [0xf59e0b, 0xd97706] : [0x2a2e55, 0x1d2040],
        false,
      ),
    );
    const badgeTxt = soraText(this, pillX, 0, rankBadgeText, 16, {
      color: '#ffffff',
    });
    fitText(badgeTxt, pillW - 24, 13);

    box.add([orb, leftTitle, leftVal, badgeBg, badgeTxt]);
    this.personalStrip.add(box);
  }

  private buildBottomDock(): void {
    const dockCy = 1216;
    const dock = dockArt(this, CONTENT_W + 8, 96);
    const bar = this.add.container(0, 0).setDepth(28);
    bar.add(this.add.image(GAME_WIDTH / 2, dockCy, dock.key));

    // ‹ Voltar button (preserves exact return navigation)
    const backBtn = buildGlassActionButton(
      this,
      MARGIN + 114,
      dockCy,
      212,
      74,
      'back',
      UI.cyan,
      'Voltar',
      () => this.scene.start(this.back),
      { fontSize: 26, tint: UI.cyan },
    );

    // ▶ Jogar CTA button
    const playBtn = buildTactile3DButton(
      this,
      GAME_WIDTH / 2 + 44,
      dockCy - 2,
      324,
      74,
      'Jogar Agora',
      () => this.playGame(),
      {
        colors: [this.def.color, UI.violet, UI.pink],
        lipColor: this.def.shade,
        icon: 'play',
        fontSize: 28,
        shimmer: true,
        pulse: true,
      },
    );

    // Share button
    const shareBtn = this.add.container(GAME_WIDTH - MARGIN - 42, dockCy);
    shareBtn.add([
      this.add.image(0, 0, glassArt(this, 74, 74, 26, { tint: UI.pink, fill: 0.1 })),
      drawIcon(this, 'share', 0, 0, 30, UI.pink),
    ]);
    attachSpringPress(
      this,
      shareBtn,
      74,
      74,
      () => {
        const best = this.def.personalBest(getServices(this));
        const msg = best
          ? `Meu recorde em ${this.def.title} no Fliperama é ${formatNumber(best.score)}! Consegue superar? 🏆`
          : `Vem disputar o ranking de ${this.def.title} comigo no Fliperama! 🏆`;
        void shareWithToast(this, this.def.id, this.def.title, msg);
      },
      { downScale: 0.9 },
    );

    bar.add([backBtn, playBtn, shareBtn]);
  }

  private playGame(): void {
    if (this.launching) return;
    this.launching = true;
    const services = getServices(this);
    services.recents.push(this.def.id);
    loadGame(this.game, this.def).then(
      () => {
        if (this.sys.isActive()) this.scene.start(this.def.entryScene);
      },
      () => {
        this.launching = false;
      },
    );
  }

  // ── Scroll Mechanics ──────────────────────────────────────────────────────

  private finishScrollLayout(contentHeight: number): void {
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
    g.fillStyle(UI.cyan, 0.55).fillRoundedRect(
      GAME_WIDTH - 9,
      VIEW_TOP + 8 + t * (VIEW_H - 16 - barH),
      4,
      barH,
      2,
    );
  }

  private buildScrollInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.y < VIEW_TOP || p.y > VIEW_BOTTOM) return;
      this.pointerDown = true;
      this.isDragging = false;
      this.velocity = 0;
      this.dragStartY = p.y;
      this.dragStartScroll = this.scroll;
      this.lastDragY = p.y;
      this.lastDragT = p.event.timeStamp || performance.now();
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.pointerDown || !p.isDown) return;
      const dy = this.dragStartY - p.y;
      if (!this.isDragging && Math.abs(dy) > DRAG_SLOP) {
        this.isDragging = true;
      }
      if (this.isDragging) {
        const now = p.event.timeStamp || performance.now();
        const dt = Math.max(1, now - this.lastDragT);
        const step = this.lastDragY - p.y;
        this.velocity = Phaser.Math.Clamp((step / dt) * 16.67, -48, 48);
        this.lastDragY = p.y;
        this.lastDragT = now;
        this.scroll = Phaser.Math.Clamp(this.dragStartScroll + dy, 0, this.maxScroll);
        this.applyScroll();
      }
    });

    const endDrag = () => {
      this.pointerDown = false;
    };
    this.input.on('pointerup', endDrag);
    this.input.on('pointerupoutside', endDrag);

    this.input.on('wheel', (_p: Phaser.Input.Pointer, _objs: unknown, _dx: number, dy: number) => {
      if (this.maxScroll <= 0) return;
      this.velocity = 0;
      this.scroll = Phaser.Math.Clamp(this.scroll + dy * 0.65, 0, this.maxScroll);
      this.applyScroll();
    });
  }
}
