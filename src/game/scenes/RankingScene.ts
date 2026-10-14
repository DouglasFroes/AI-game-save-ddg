import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { MAX_NAME_LENGTH, sanitizeName, type LeaderboardEntry } from '@/core/leaderboard';
import { setPlayerName, summarize } from '@/core/progress';
import { addBackground, addText, Button, panel } from '@/game/ui/widgets';
import { getServices } from '@/services';

const ROWS = 10;
const LIST_TOP = 300;
const ROW_H = 58;

export class RankingScene extends Phaser.Scene {
  private rows: Phaser.GameObjects.GameObject[] = [];
  private status!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Ranking);
  }

  create(): void {
    const { progress } = getServices(this);
    const cx = GAME_WIDTH / 2;
    addBackground(this);

    panel(this, cx, 560, 660, 860);
    addText(this, cx, 175, '🏆 Ranking', 56);
    this.status = addText(this, cx, 230, 'Carregando…', 26, { color: '#5b6b8c' });

    const summary = summarize(progress.get());
    addText(
      this,
      cx,
      1035,
      `Você: ★ ${summary.stars}   💀 ${summary.deaths}   tinta poupada ${summary.inkSaved}%`,
      28,
      { color: COLORS.textLight, stroke: '#1d2b53', strokeThickness: 6 },
    );

    if (summary.completed > 0) this.buildSubmitForm();
    else {
      addText(this, cx, 1105, 'Vença uma fase para entrar no ranking!', 28, {
        color: COLORS.textLight,
        stroke: '#1d2b53',
        strokeThickness: 6,
      });
    }

    new Button(this, cx, 1210, '‹ Voltar', () => this.scene.start(SceneKeys.Menu), {
      width: 300,
      height: 90,
      fontSize: 36,
      color: COLORS.secondary,
      shade: COLORS.secondaryDark,
    });

    void this.refresh();
  }

  private buildSubmitForm(): void {
    const { progress, leaderboard } = getServices(this);
    const input = document.createElement('input');
    input.className = 'name-input';
    input.maxLength = MAX_NAME_LENGTH;
    input.placeholder = 'Seu nome';
    input.value = progress.get().playerName;
    input.enterKeyHint = 'done';
    input.style.width = '300px';
    this.add.dom(230, 1110, input);

    const save = new Button(
      this,
      535,
      1110,
      'Salvar',
      async () => {
        const name = sanitizeName(input.value);
        input.value = name;
        input.blur();
        const p = progress.update((prev) => setPlayerName(prev, name));
        const s = summarize(p);
        const entry: LeaderboardEntry = {
          id: p.playerId,
          name,
          stars: s.stars,
          deaths: s.deaths,
          inkSaved: s.inkSaved,
          score: s.score,
          date: new Date().toISOString(),
        };
        save.setEnabled(false);
        try {
          await leaderboard.submit(entry);
          this.status.setText('Pontuação salva!');
        } catch {
          this.status.setText('Salvo só neste aparelho (ranking global indisponível).');
        }
        save.setEnabled(true);
        await this.refresh(p.playerId);
      },
      { width: 220, height: 84, fontSize: 36, color: COLORS.success, shade: COLORS.successDark },
    );
  }

  private async refresh(highlightId = getServices(this).progress.get().playerId): Promise<void> {
    const { leaderboard } = getServices(this);
    const entries = await leaderboard.list();
    if (!this.scene.isActive()) return;

    this.status.setText(leaderboard.online ? 'Ranking global' : 'Ranking deste aparelho');
    this.rows.forEach((r) => r.destroy());
    this.rows = [];

    const cx = GAME_WIDTH / 2;
    const header = addText(
      this,
      cx,
      LIST_TOP - 16,
      '#      Jogador                ★      💀     Tinta',
      24,
      {
        color: '#8a97b1',
      },
    );
    this.rows.push(header);

    entries.slice(0, ROWS).forEach((e, i) => {
      const y = LIST_TOP + 40 + i * ROW_H;
      const mine = e.id === highlightId;
      if (mine) this.rows.push(this.add.rectangle(cx, y, 620, ROW_H - 6, 0xffe9a8).setOrigin(0.5));
      const medal = ['🥇', '🥈', '🥉'][i] ?? `${i + 1}`;
      const cells: Array<[number, string, 'left' | 'center']> = [
        [80, medal, 'center'],
        [130, e.name, 'left'],
        [450, String(e.stars), 'center'],
        [540, String(e.deaths), 'center'],
        [630, `${e.inkSaved}%`, 'center'],
      ];
      for (const [x, text, align] of cells) {
        const t = addText(this, x, y, text, 30, { weight: mine ? 'bold' : 'normal' });
        if (align === 'left') t.setOrigin(0, 0.5);
        this.rows.push(t);
      }
    });
  }
}
