import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys, type SceneKey } from '@/config';
import { getGame, type GameDefinition, type RankColumn } from '@/games/registry';
import type { LeaderboardEntry } from '@/platform/leaderboard';
import { formatNumber, submitMessage, submitScore } from '@/platform/ranking';
import { askName } from '@/platform/ui/nameDialog';
import { addBackground, addText, Button, panel } from '@/platform/ui/widgets';
import { getServices } from '@/services';

export interface LeaderboardData {
  gameId: string;
  /** Scene to return to (defaults to the hub). */
  back?: SceneKey;
}

const ROWS = 10;
const LIST_TOP = 300;
const ROW_H = 58;

/** Top players of one game, plus a button to send your personal best. */
export class LeaderboardScene extends Phaser.Scene {
  private def!: GameDefinition;
  private back: SceneKey = SceneKeys.Hub;
  private rows: Phaser.GameObjects.GameObject[] = [];
  private status!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Leaderboard);
  }

  init(data: LeaderboardData): void {
    this.def = getGame(data.gameId);
    this.back = data.back ?? SceneKeys.Hub;
    this.rows = [];
  }

  create(): void {
    const services = getServices(this);
    const cx = GAME_WIDTH / 2;
    addBackground(this);

    panel(this, cx, 560, 680, 880);
    addText(this, cx, 165, `🏆 ${this.def.title}`, 48);
    this.status = addText(this, cx, 220, 'Carregando…', 26, { color: COLORS.textMuted });

    const best = this.def.personalBest(services);
    addText(
      this,
      cx,
      1048,
      best
        ? `Seu recorde: ${this.describe(best.score, best.details)}`
        : 'Você ainda não tem recorde',
      28,
      { color: COLORS.textLight, stroke: '#1d2b53', strokeThickness: 6, wrapWidth: 660 },
    );

    if (best) {
      new Button(
        this,
        cx,
        1125,
        '📤 Enviar meu recorde',
        async () => {
          if (!services.profile.get().name) {
            const name = await askName(this, '');
            if (!name) return;
            services.profile.update({ name });
          }
          this.status.setText('Enviando…');
          const result = await submitScore(services, this.def.id, best);
          await this.refresh();
          this.status.setText(submitMessage(result));
        },
        { width: 460, height: 84, fontSize: 34, color: COLORS.success, shade: COLORS.successDark },
      );
    }

    new Button(this, cx, 1218, '‹ Voltar', () => this.scene.start(this.back), {
      width: 300,
      height: 84,
      fontSize: 34,
      color: COLORS.secondary,
      shade: COLORS.secondaryDark,
    });

    void this.refresh();
  }

  private describe(score: number, details: Readonly<Record<string, number>>): string {
    return this.def.columns.map((c) => `${c.label} ${this.cell(c, score, details)}`).join('  ·  ');
  }

  private cell(c: RankColumn, score: number, details: Readonly<Record<string, number>>): string {
    const v = c.key === 'score' ? score : details[c.key];
    if (v === undefined) return '-';
    return c.format ? c.format(v) : formatNumber(v);
  }

  private async refresh(): Promise<void> {
    const { leaderboard } = getServices(this);
    const entries = await leaderboard.list(this.def.id, ROWS);
    if (!this.scene.isActive()) return;

    this.status.setText(leaderboard.online ? '🌎 Ranking global' : '📱 Ranking deste aparelho');
    this.rows.forEach((r) => r.destroy());
    this.rows = [];

    const cx = GAME_WIDTH / 2;
    const headerY = LIST_TOP - 22;
    this.rows.push(addText(this, 80, headerY, '#', 22, { color: '#8a97b1' }));
    this.rows.push(
      addText(this, 130, headerY, 'Jogador', 22, { color: '#8a97b1' }).setOrigin(0, 0.5),
    );
    for (const c of this.def.columns) {
      this.rows.push(addText(this, c.x, headerY, c.label, 22, { color: '#8a97b1' }));
    }

    if (entries.length === 0) {
      this.rows.push(
        addText(this, cx, LIST_TOP + 200, 'Ninguém aqui ainda.\nSeja o primeiro!', 34, {
          color: COLORS.textMuted,
        }),
      );
      return;
    }

    entries.forEach((e: LeaderboardEntry, i) => {
      const y = LIST_TOP + 34 + i * ROW_H;
      const mine = leaderboard.isMine(e);
      if (mine) this.rows.push(this.add.rectangle(cx, y, 640, ROW_H - 6, 0xffe9a8));
      const weight = mine ? 'bold' : 'normal';
      const medal = ['🥇', '🥈', '🥉'][i] ?? `${i + 1}`;
      this.rows.push(addText(this, 80, y, medal, 28));
      this.rows.push(addText(this, 130, y, e.name, 28, { weight }).setOrigin(0, 0.5));
      for (const c of this.def.columns) {
        this.rows.push(addText(this, c.x, y, this.cell(c, e.score, e.details), 28, { weight }));
      }
    });
  }
}
