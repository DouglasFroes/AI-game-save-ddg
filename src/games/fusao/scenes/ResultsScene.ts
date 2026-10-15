import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { autoSubmit, formatNumber } from '@/platform/ranking';
import { getServices } from '@/services';
import { FT } from '../art';
import { audio } from '../audio';
import { ACHIEVEMENTS, BOSSES, CHARACTERS, FUSIONS, SKILLS } from '../core/defs';
import { applyRun, dateKey, runScore, type RunSummary } from '../core/meta';
import { getSave, setSave } from '../state';
import { clock, css, neonButton, neonPanel, txt, UI } from '../ui';
import type { RunData } from './RunScene';

export interface ResultsData {
  summary: RunSummary;
  run: RunData;
}

/** End of a run: what happened, what it earned and what was discovered. */
export class FusaoResultsScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.FusaoResults);
  }

  create(data: ResultsData): void {
    const s = data.summary;
    const before = getSave();
    const result = applyRun(before, s, dateKey(new Date()));
    setSave(result.save);
    this.toRanking(s);

    this.cameras.main.setBackgroundColor(UI.bg);
    this.add.tileSprite(0, 0, GAME_WIDTH, 1280, FT.stars).setOrigin(0);
    const cx = GAME_WIDTH / 2;
    const color = s.victory ? 0xffd23f : 0xff4d6d;
    txt(this, cx, 90, s.victory ? 'VITÓRIA' : 'FIM DA PARTIDA', 56, css(color));
    txt(
      this,
      cx,
      145,
      `${CHARACTERS[s.character].name}${s.daily ? ' · Desafio diário' : ''}`,
      26,
      UI.muted,
      'normal',
    );
    if (result.newBest) txt(this, cx, 190, '★ NOVO RECORDE PESSOAL ★', 28, UI.gold);

    neonPanel(this, cx, 410, 640, 340, UI.accent);
    const newSkills = s.skills.filter((k) => !before.skillsSeen.includes(k));
    const bestBoss = s.bosses.length ? BOSSES[s.bosses[s.bosses.length - 1]!].name : 'Nenhum';
    const rows: [string, string][] = [
      ['Tempo sobrevivido', clock(s.seconds)],
      ['Inimigos derrotados', formatNumber(s.kills)],
      ['Nível máximo', String(s.level)],
      ['Dano causado', formatNumber(s.damage)],
      ['Chefe mais avançado', bestBoss],
      [
        'Novas habilidades',
        newSkills.length ? newSkills.map((k) => SKILLS[k].name).join(', ') : '—',
      ],
    ];
    rows.forEach(([k, v], i) => {
      txt(this, 60, 275 + i * 50, k, 24, UI.muted, 'normal').setOrigin(0, 0.5);
      txt(this, GAME_WIDTH - 60, 275 + i * 50, v, 24, '#ffffff')
        .setOrigin(1, 0.5)
        .setWordWrapWidth(300);
    });

    // Rewards, counted up.
    neonPanel(this, cx, 760, 640, 300, 0xc77dff);
    txt(this, cx, 640, 'RECOMPENSAS', 28, '#c77dff');
    result.reward.lines.slice(0, 6).forEach((l, i) => {
      txt(this, 70, 685 + i * 32, l.label, 22, UI.muted, 'normal').setOrigin(0, 0.5);
      txt(this, GAME_WIDTH - 70, 685 + i * 32, `+${l.amount}`, 22, '#ffffff').setOrigin(1, 0.5);
    });
    const total = txt(this, cx, 890, '+0 Essência', 38, UI.gold);
    this.tweens.addCounter({
      from: 0,
      to: result.reward.essence,
      duration: 900,
      onUpdate: (t) =>
        total.setText(
          `+${Math.round(t.getValue() ?? 0)} Essência  (total ${formatNumber(result.save.essence)})`,
        ),
    });

    // Discoveries.
    const news = [
      ...result.newCharacters.map((c) => `Personagem desbloqueado: ${CHARACTERS[c].name}`),
      ...result.newFusions.map((f) => `Fusão registrada: ${FUSIONS[f].name}`),
      ...result.newAchievements.map((a) => `Conquista: ${ACHIEVEMENTS[a].name}`),
    ];
    news.slice(0, 4).forEach((n, i) => {
      const t = txt(this, cx, 960 + i * 36, n, 24, UI.gold).setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, delay: 900 + i * 250, duration: 300 });
    });
    if (news.length) this.time.delayedCall(900, () => audio.play('levelup'));

    const again: RunData = {
      character: s.character,
      modifiers: data.run.modifiers,
      daily: data.run.daily,
      seed: data.run.daily ? data.run.seed : undefined,
    };
    neonButton(
      this,
      cx,
      1130,
      520,
      96,
      'Jogar novamente',
      () => this.scene.start(SceneKeys.FusaoRun, again),
      0x5bd46f,
      38,
    );
    neonButton(
      this,
      cx,
      1230,
      520,
      72,
      'Menu',
      () => this.scene.start(SceneKeys.FusaoMenu),
      UI.accent,
      30,
    );
  }

  /** The Fliperama ranking is real (Firebase or local): keep the personal best there too. */
  private toRanking(s: RunSummary): void {
    try {
      const services = getServices(this);
      const record = {
        score: runScore(s),
        details: { seconds: Math.floor(s.seconds), kills: s.kills, level: s.level },
      };
      services.best.offer('fusao', record);
      services.localTop.add('fusao', record);
      void autoSubmit(services, 'fusao', record).catch(() => null);
    } catch {
      // Ranking is optional: the run is already saved locally.
    }
  }
}
