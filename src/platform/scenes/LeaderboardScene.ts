import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys, type SceneKey } from '@/config';
import { getGame, type GameDefinition, type RankColumn } from '@/games/registry';
import { GLOBAL_TOP, type LeaderboardEntry } from '@/platform/leaderboard';
import { LOCAL_TOP } from '@/platform/localTop';
import { formatNumber } from '@/platform/ranking';
import { addBackground, addText, Button, panel } from '@/platform/ui/widgets';
import { getServices } from '@/services';

export interface LeaderboardData {
  gameId: string;
  /** Scene to return to (defaults to the hub). */
  back?: SceneKey;
}

type Tab = 'global' | 'mine';

const LIST_TOP = 330;

/** Two boards per game: the top 20 players, and the player's own 10 best runs. */
export class LeaderboardScene extends Phaser.Scene {
  private def!: GameDefinition;
  private back: SceneKey = SceneKeys.Hub;
  private rows: Phaser.GameObjects.GameObject[] = [];
  private status!: Phaser.GameObjects.Text;
  private tab: Tab = 'global';
  private tabs: Record<Tab, Button> | null = null;

  constructor() {
    super(SceneKeys.Leaderboard);
  }

  init(data: LeaderboardData): void {
    this.def = getGame(data.gameId);
    this.back = data.back ?? SceneKeys.Hub;
    this.rows = [];
    this.tab = 'global';
    this.tabs = null;
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    addBackground(this);
    panel(this, cx, 640, 680, 1000);
    addText(this, cx, 175, `🏆 ${this.def.title}`, 46);
    this.tabs = null;
    this.status = addText(this, cx, 1098, '', 24, { color: COLORS.textMuted, wrapWidth: 640 });
    new Button(this, cx, 1210, '‹ Voltar', () => this.scene.start(this.back), {
      width: 300,
      height: 84,
      fontSize: 34,
      color: COLORS.secondary,
      shade: COLORS.secondaryDark,
    });
    this.show('global');
  }

  private show(tab: Tab): void {
    this.tab = tab;
    // (Re)create the two tab buttons so the selected one is highlighted.
    this.tabs?.global.destroy();
    this.tabs?.mine.destroy();
    const cx = GAME_WIDTH / 2;
    const style = (on: boolean) => ({
      width: 300,
      height: 66,
      fontSize: 26,
      color: on ? COLORS.primary : 0xe9eef6,
      shade: on ? COLORS.primaryDark : 0xc7cfdc,
      textColor: on ? COLORS.textLight : COLORS.text,
    });
    this.tabs = {
      global: new Button(
        this,
        cx - 160,
        245,
        `🌎 Top ${GLOBAL_TOP}`,
        () => this.show('global'),
        style(tab === 'global'),
      ),
      mine: new Button(
        this,
        cx + 160,
        245,
        `⭐ Meus ${LOCAL_TOP}`,
        () => this.show('mine'),
        style(tab === 'mine'),
      ),
    };
    if (tab === 'global') void this.showGlobal();
    else this.showMine();
  }

  private cell(c: RankColumn, score: number, details: Readonly<Record<string, number>>): string {
    const v = c.key === 'score' ? score : details[c.key];
    if (v === undefined) return '-';
    return c.format ? c.format(v) : formatNumber(v);
  }

  private clear(): void {
    this.rows.forEach((r) => r.destroy());
    this.rows = [];
  }

  private header(first: string): void {
    const y = LIST_TOP - 26;
    this.rows.push(addText(this, 70, y, '#', 20, { color: '#8a97b1' }));
    this.rows.push(addText(this, 115, y, first, 20, { color: '#8a97b1' }).setOrigin(0, 0.5));
    for (const c of this.def.columns)
      this.rows.push(addText(this, c.x, y, c.label, 20, { color: '#8a97b1' }));
  }

  private empty(text: string): void {
    this.rows.push(
      addText(this, GAME_WIDTH / 2, LIST_TOP + 220, text, 32, { color: COLORS.textMuted }),
    );
  }

  private async showGlobal(): Promise<void> {
    const { leaderboard } = getServices(this);
    this.clear();
    this.status.setText('Carregando…');
    const entries = await leaderboard.list(this.def.id, GLOBAL_TOP);
    if (!this.scene.isActive() || this.tab !== 'global') return;
    this.clear();
    this.status.setText(
      `${leaderboard.online ? '🌎 Ranking global' : '📱 Ranking deste aparelho'} · resultados no top ${GLOBAL_TOP} entram sozinhos`,
    );
    this.header('Jogador');
    if (!entries.length) return this.empty('Ninguém aqui ainda.\nSeja o primeiro!');
    const rowH = 37;
    entries.forEach((e: LeaderboardEntry, i) => {
      const y = LIST_TOP + 18 + i * rowH;
      const mine = leaderboard.isMine(e);
      if (mine) this.rows.push(this.add.rectangle(GAME_WIDTH / 2, y, 640, rowH - 3, 0xffe9a8));
      const weight = mine ? 'bold' : 'normal';
      this.rows.push(addText(this, 70, y, ['🥇', '🥈', '🥉'][i] ?? `${i + 1}`, 22));
      this.rows.push(addText(this, 115, y, e.name, 22, { weight }).setOrigin(0, 0.5));
      for (const c of this.def.columns)
        this.rows.push(addText(this, c.x, y, this.cell(c, e.score, e.details), 22, { weight }));
    });
  }

  private showMine(): void {
    const { localTop } = getServices(this);
    this.clear();
    const runs = localTop.list(this.def.id);
    this.status.setText('Suas melhores partidas neste aparelho');
    this.header('Data');
    if (!runs.length) return this.empty('Jogue uma partida\npara começar sua lista!');
    const rowH = 66;
    runs.forEach((r, i) => {
      const y = LIST_TOP + 30 + i * rowH;
      const d = new Date(r.date);
      const date = Number.isNaN(d.getTime())
        ? '-'
        : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (i === 0) this.rows.push(this.add.rectangle(GAME_WIDTH / 2, y, 640, rowH - 6, 0xffe9a8));
      this.rows.push(addText(this, 70, y, ['🥇', '🥈', '🥉'][i] ?? `${i + 1}`, 28));
      this.rows.push(
        addText(this, 115, y, date, 26, { weight: i === 0 ? 'bold' : 'normal' }).setOrigin(0, 0.5),
      );
      for (const c of this.def.columns)
        this.rows.push(
          addText(this, c.x, y, this.cell(c, r.score, r.details), 26, {
            weight: i === 0 ? 'bold' : 'normal',
          }),
        );
    });
  }
}
