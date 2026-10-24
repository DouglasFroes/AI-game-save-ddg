import Phaser from 'phaser';
import { GAME_WIDTH, type SceneKey } from '@/config';
import { burst, flash } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  FORMATION_IDS,
  MATCHES,
  REROLLS,
  SelecaoGame,
  STYLES,
  type FormationId,
  type MatchResult,
  type Mode,
  type Player,
  type Role,
  type Slot,
  type Style,
  type Team,
  type Tournament,
} from './core';

/** What differs between "Seleção dos Sonhos" and its siblings (clubs, …). */
export interface DreamConfig {
  readonly key: SceneKey;
  readonly gameId: string;
  readonly colors: readonly [number, number];
  readonly teams: readonly Team[];
  /** Word before the year on a drawn team: "Copa 1994", "Temporada 1981". */
  readonly edition: string;
  readonly title: string;
  readonly champion: string;
  readonly tagline: string;
}

const CX = GAME_WIDTH / 2;
const STYLE_LABEL: Record<Style, string> = {
  defensivo: 'Defensivo',
  equilibrado: 'Equilibrado',
  ofensivo: 'Ofensivo',
};
const MODE_LABEL: Record<Mode, string> = { classico: 'Clássico', almanaque: 'De almanaque' };
const GREEN = 0x16a34a;
const GREEN_DARK = 0x0f6b30;
const OFF = 0x1e3a2b;
const OFF_DARK = 0x12261b;
const RED = 0xe8442a;
const RED_DARK = 0xa82e18;
const GOLD = '#fde68a';

const ROW_H = 68;
const LIST_TOP = 770;
const LIST_H = 470;
const PITCH_Y = 330;

/** Colour of a position group: keepers, defenders, midfielders, forwards. */
const ROLE_COLOR: Record<Role, number> = {
  GOL: 0xfacc15,
  LD: 0x38bdf8,
  LE: 0x38bdf8,
  ZAG: 0x38bdf8,
  VOL: 0x4ade80,
  MC: 0x4ade80,
  MEI: 0x4ade80,
  ME: 0x4ade80,
  MD: 0x4ade80,
  PE: 0xf87171,
  PD: 0xf87171,
  CA: 0xf87171,
};

const ratingColor = (r: number) => (r >= 85 ? '#fde047' : r >= 75 ? '#86efac' : '#ffffff');

/** Draft eleven players from random squads, then win seven knockout games. */
export abstract class DreamScene extends MiniScene {
  private formation: FormationId = '4-3-3';
  private style: Style = 'equilibrado';
  private mode: Mode = 'classico';
  private run: SelecaoGame;
  private view!: Phaser.GameObjects.Container;

  constructor(private readonly cfg: DreamConfig) {
    super(cfg.key, cfg.gameId, cfg.colors);
    this.run = new SelecaoGame(Math.random, '4-3-3', 'equilibrado', 'classico', cfg.teams);
  }

  create(): void {
    this.frame(this.cfg.title.toUpperCase());
    this.scoreText.setFontSize(36).setY(60).setStroke('#052e16', 8);
    this.view = this.add.container(0, 0);
    this.showConfig();
  }

  /** Throws away the current screen and starts an empty one. */
  private reset(): Phaser.GameObjects.Container {
    this.view.destroy();
    this.view = this.add.container(0, 0);
    return this.view;
  }

  private label(v: Phaser.GameObjects.Container, y: number, text: string): void {
    v.add(addText(this, 50, y, text, 24, { color: '#bbf7d0' }).setOrigin(0, 0.5));
  }

  private choice(
    v: Phaser.GameObjects.Container,
    x: number,
    y: number,
    w: number,
    text: string,
    on: boolean,
    click: () => void,
  ): void {
    v.add(
      new Button(this, x, y, text, click, {
        width: w,
        height: 70,
        fontSize: 28,
        color: on ? GREEN : OFF,
        shade: on ? GREEN_DARK : OFF_DARK,
      }),
    );
  }

  /** A rounded card on the dark background. */
  private card(
    v: Phaser.GameObjects.Container,
    x: number,
    y: number,
    w: number,
    h: number,
    fill = 0xfef3c7,
  ): void {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35).fillRoundedRect(x, y + 5, w, h, 24);
    g.fillStyle(fill).fillRoundedRect(x, y, w, h, 24);
    v.add(g);
  }

  // ---------------------------------------------------------------- configuration

  private showConfig(): void {
    const v = this.reset();
    v.add(addText(this, CX, 140, this.cfg.tagline, 27, { color: '#ffffff', wrapWidth: 640 }));
    this.label(v, 205, 'FORMAÇÃO');
    FORMATION_IDS.forEach((f, i) => {
      const x = 105 + (i % 4) * 170;
      const y = 270 + Math.floor(i / 4) * 84;
      this.choice(v, x, y, 150, f, f === this.formation, () => {
        this.formation = f;
        this.showConfig();
      });
    });
    this.label(v, 410, 'ESTILO');
    STYLES.forEach((s, i) =>
      this.choice(v, 125 + i * 235, 475, 215, STYLE_LABEL[s], s === this.style, () => {
        this.style = s;
        this.showConfig();
      }),
    );
    this.label(v, 560, 'MODO');
    (['classico', 'almanaque'] as const).forEach((m, i) =>
      this.choice(v, 190 + i * 340, 625, 310, MODE_LABEL[m], m === this.mode, () => {
        this.mode = m;
        this.showConfig();
      }),
    );
    v.add(
      addText(
        this,
        CX,
        700,
        this.mode === 'classico'
          ? 'Você vê a nota de cada jogador.'
          : 'Notas escondidas, só os nomes! Pontos x1,5.',
        23,
        { color: '#d1fae5', weight: 'normal', wrapWidth: 620 },
      ),
    );
    this.drawPitch(v, CX, 915, 660, 330, this.slotsFor(this.formation), [], false);
    v.add(
      new Button(this, CX, 1160, 'COMEÇAR', () => this.startDraft(), {
        width: 500,
        height: 100,
        color: RED,
        shade: RED_DARK,
      }),
    );
  }

  private slotsFor(f: FormationId): Slot[] {
    return new SelecaoGame(Math.random, f).slots;
  }

  // ---------------------------------------------------------------- draft

  private startDraft(): void {
    this.run = new SelecaoGame(Math.random, this.formation, this.style, this.mode, this.cfg.teams);
    this.showDraft();
  }

  private showDraft(): void {
    const v = this.reset();
    const g = this.run;
    const squad = g.current;
    const eligible = squad ? g.eligible() : [];
    v.add(
      addText(
        this,
        CX,
        128,
        `Jogador ${g.filled + 1} de ${g.slots.length} · ${g.formation} · ${STYLE_LABEL[g.style]}`,
        24,
        { color: '#d1fae5' },
      ),
    );
    this.drawPitch(
      v,
      CX,
      PITCH_Y,
      680,
      330,
      g.slots,
      g.lineup,
      g.mode === 'classico',
      new Set(eligible.flatMap((p) => (p.alt ? [p.role, p.alt] : [p.role]))),
    );

    // The team on the table.
    this.card(v, 40, 520, 640, 112);
    if (squad) {
      v.add([
        emojiText(this, 112, 576, squad.flag, 62),
        addText(this, 172, 556, squad.nation, 44, { color: '#052e16' }).setOrigin(0, 0.5),
        addText(this, 172, 602, `${this.cfg.edition} ${squad.year}`, 32, {
          color: '#c2410c',
        }).setOrigin(0, 0.5),
      ]);
    } else {
      v.add(
        addText(this, CX, 576, 'Role para sortear um time\ne uma temporada', 30, {
          color: '#78716c',
          weight: 'normal',
        }),
      );
    }

    if (!squad) {
      v.add(
        new Button(this, CX, 880, 'ROLAR 🎲', () => this.roll(), {
          width: 520,
          height: 120,
          color: RED,
          shade: RED_DARK,
        }),
      );
      v.add(
        addText(this, CX, 990, `Sorteios para trocar: ${g.rerollsLeft} de ${REROLLS}`, 24, {
          color: '#bbf7d0',
          weight: 'normal',
        }),
      );
      return;
    }
    v.add(
      addText(
        this,
        CX,
        664,
        `NÃO CURTIU? RE-SORTEIE · ${g.rerollsLeft} RESTANTE${g.rerollsLeft === 1 ? '' : 'S'}`,
        20,
        { color: '#bbf7d0' },
      ),
    );
    const can = g.rerollsLeft > 0;
    (
      [
        ['↺ OUTRO TIME', 'nation'],
        ['↺ OUTRA ÉPOCA', 'cup'],
      ] as const
    ).forEach(([text, kind], i) =>
      v.add(
        new Button(
          this,
          190 + i * 340,
          716,
          text,
          () => {
            if (g.reroll(kind)) this.showDraft();
          },
          { width: 310, height: 58, fontSize: 24, color: OFF, shade: OFF_DARK },
        ).setEnabled(can),
      ),
    );
    this.buildList(v, eligible);
  }

  private roll(): void {
    this.run.draw();
    getServices(this).sfx.play('click');
    flash(this, 0xfef3c7, 0.2, 160);
    this.showDraft();
  }

  /** Scrollable list of the players that fit an open position. */
  private buildList(v: Phaser.GameObjects.Container, players: readonly Player[]): void {
    const hidden = this.run.mode === 'almanaque';
    const list = this.add.container(0, LIST_TOP);
    players.forEach((p, i) => {
      const y = i * ROW_H + ROW_H / 2;
      const star = !hidden && p.rating >= 85;
      const row = this.add.graphics();
      row.fillStyle(0x000000, 0.3).fillRoundedRect(40, y - 28, 640, 60, 16);
      row.fillStyle(i % 2 ? 0x14532d : 0x166534).fillRoundedRect(40, y - 31, 640, 60, 16);
      if (star) row.lineStyle(3, 0xfde047).strokeRoundedRect(40, y - 31, 640, 60, 16);
      row.fillStyle(ROLE_COLOR[p.role]).fillRoundedRect(52, y - 20, 84, 40, 12);
      row
        .fillStyle(star ? 0xfde047 : 0x052e16, star ? 1 : 0.55)
        .fillRoundedRect(572, y - 20, 96, 40, 12);
      list.add([
        row,
        addText(this, 94, y, p.role, 24, { color: '#052e16' }),
        addText(this, 152, y, p.name, 30, { color: '#ffffff' }).setOrigin(0, 0.5),
        addText(this, 556, y, `#${p.num}${p.alt ? ` · +${p.alt}` : ''}`, 19, {
          color: '#bbf7d0',
          weight: 'normal',
        }).setOrigin(1, 0.5),
        addText(this, 620, y, hidden ? '?' : String(p.rating), 32, {
          color: star ? '#052e16' : hidden ? '#ffffff' : ratingColor(p.rating),
        }),
      ]);
    });
    const maskShape = this.make.graphics({}, false);
    maskShape.fillRect(0, LIST_TOP - 36, GAME_WIDTH, LIST_H + 36);
    list.setMask(maskShape.createGeometryMask());
    const maxScroll = Math.max(0, players.length * ROW_H - LIST_H + 8);
    const scrollTo = (y: number) => {
      list.y = Phaser.Math.Clamp(y, LIST_TOP - maxScroll, LIST_TOP);
    };

    let startY = 0;
    let startList = 0;
    let moved = 0;
    const zone = this.add
      .zone(CX, LIST_TOP - 36 + (LIST_H + 36) / 2, GAME_WIDTH, LIST_H + 36)
      .setInteractive({ useHandCursor: true });
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      startY = p.y;
      startList = list.y;
      moved = 0;
    });
    zone.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      moved = Math.max(moved, Math.abs(p.y - startY));
      scrollTo(startList + (p.y - startY));
    });
    zone.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (moved > 12) return;
      const chosen = players[Math.floor((p.y - list.y) / ROW_H)];
      if (chosen) this.choose(chosen, p.x, p.y);
    });
    const wheel = (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) =>
      scrollTo(list.y - dy);
    this.input.on('wheel', wheel);
    v.add([list, zone]);
    v.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.input.off('wheel', wheel);
      list.clearMask(true);
    });
    if (players.length * ROW_H > LIST_H)
      v.add(
        addText(this, CX, LIST_TOP + LIST_H + 26, '↕ arraste para ver mais jogadores', 20, {
          color: '#86efac',
          weight: 'normal',
        }),
      );
  }

  private choose(p: Player, x: number, y: number): void {
    const g = this.run;
    if (g.pick(p.num) < 0) return;
    getServices(this).sfx.play('win');
    burst(this, x, y, 0xfde047, 16);
    this.pop(
      CX,
      PITCH_Y + 120,
      g.mode === 'almanaque' ? p.name : `${p.name} · ${p.rating}`,
      GOLD,
      40,
    );
    if (g.complete) this.time.delayedCall(700, () => this.startTournament());
    else this.showDraft();
  }

  // ---------------------------------------------------------------- tournament

  private startTournament(): void {
    const g = this.run;
    const result = g.tournament();
    const v = this.reset();
    const stats = g.stats;

    // Header: team overall in a badge, the cup waiting on the right.
    const badge = this.add.graphics();
    badge.fillStyle(0x000000, 0.35).fillCircle(86, 178, 52);
    badge.fillStyle(0xfef3c7).fillCircle(86, 172, 52);
    v.add([
      badge,
      addText(this, 86, 166, String(stats.overall), 46, { color: '#052e16' }),
      addText(this, 86, 198, 'NOTA', 14, { color: '#c2410c' }),
      addText(this, 160, 150, `${g.formation} · ${STYLE_LABEL[g.style]}`, 30, {
        color: '#ffffff',
      }).setOrigin(0, 0.5),
      addText(this, 160, 196, 'Sete jogos até a taça. Perdeu, caiu!', 23, {
        color: GOLD,
        weight: 'normal',
      }).setOrigin(0, 0.5),
    ]);
    const cup = emojiText(this, 640, 172, '🏆', 84).setAlpha(0.35);
    v.add(cup);

    const rows: Array<{
      dot: Phaser.GameObjects.Graphics;
      mark: Phaser.GameObjects.Text;
      left: Phaser.GameObjects.Text;
      right: Phaser.GameObjects.Text;
      y: number;
    }> = [];
    for (let i = 0; i < MATCHES; i++) {
      const y = 290 + i * 94;
      const last = i === MATCHES - 1;
      const bg = this.add.graphics();
      bg.fillStyle(0x000000, 0.28).fillRoundedRect(40, y - 40, 640, 84, 20);
      if (last) bg.lineStyle(3, 0xfde047, 0.7).strokeRoundedRect(40, y - 40, 640, 84, 20);
      const dot = this.add.graphics();
      const mark = addText(this, 86, y, String(i + 1), 28, { color: '#bbf7d0' });
      const left = addText(this, 134, y, '', 25, {
        color: '#ffffff',
        wrapWidth: 330,
        align: 'left',
      }).setOrigin(0, 0.5);
      const right = addText(this, 660, y, '', 30, { color: '#ffffff' }).setOrigin(1, 0.5);
      dot.fillStyle(0x052e16, 0.8).fillCircle(86, y, 26);
      v.add([bg, dot, mark, left, right]);
      rows.push({ dot, mark, left, right, y });
    }
    this.drawPitch(v, CX, 1115, 680, 270, g.slots, g.lineup, true);

    const stageNames = result.matches.map((m) => m.stage);
    const play = (i: number) => {
      const m = result.matches[i];
      if (!m) {
        if (result.champion) {
          this.tweens.add({ targets: cup, alpha: 1, scale: 1.4, duration: 400, yoyo: true });
          flash(this, 0xfde047, 0.35, 300);
        }
        this.time.delayedCall(1400, () => this.end(g, result, stageNames));
        return;
      }
      const row = rows[i]!;
      row.left.setText(`${m.stage}\n${m.opponent.flag} ${m.opponent.nation} ${m.opponent.year}`);
      row.right.setText('…');
      this.time.delayedCall(950, () => {
        row.right.setText(scoreLabel(m)).setColor(m.win ? '#86efac' : '#fca5a5');
        row.dot
          .clear()
          .fillStyle(m.win ? 0x16a34a : 0xdc2626)
          .fillCircle(86, row.y, 26);
        row.mark.setText(m.win ? '✓' : '✗').setColor('#ffffff');
        getServices(this).sfx.play(m.win ? 'win' : 'hit');
        if (m.win) burst(this, 580, row.y, 0x86efac, 12);
        else this.cameras.main.shake(180, 0.006);
        this.time.delayedCall(m.win ? 450 : 900, () => play(i + 1));
      });
    };
    play(0);
  }

  private end(g: SelecaoGame, result: Tournament, stages: string[]): void {
    const last = result.matches[result.matches.length - 1]!;
    const lines = [
      `Nota ${g.stats.overall} · ${g.formation}`,
      `Vitórias: ${result.wins}/${MATCHES} · Saldo de gols: ${result.goalDiff}`,
      `Sorteios usados: ${g.rerollsUsed}${g.mode === 'almanaque' ? ' · modo De almanaque' : ''}`,
    ];
    const title = result.champion
      ? this.cfg.champion
      : `Eliminado em: ${stages[stages.length - 1]} (${last.opponent.nation})`;
    this.finish(
      title,
      lines,
      {
        score: result.score,
        details: {
          wins: result.wins,
          rerolls: g.rerollsUsed,
          ovr: g.stats.overall,
          mode: g.mode === 'almanaque' ? 1 : 0,
        },
      },
      300,
    );
  }

  // ---------------------------------------------------------------- pitch

  /**
   * A pitch with the formation (goalkeeper on the left). Filled dots show the picks, coloured by
   * position; empty ones glow gold when the team on the table has someone for them.
   */
  private drawPitch(
    v: Phaser.GameObjects.Container,
    cx: number,
    cy: number,
    w: number,
    h: number,
    slots: readonly Slot[],
    lineup: ReadonlyArray<Player | null>,
    showRatings: boolean,
    hot: ReadonlySet<Role> = new Set(),
  ): void {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(cx - w / 2 + 4, cy - h / 2 + 8, w, h, 22);
    g.fillStyle(0x2f8f4e).fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 22);
    for (let i = 0; i < 8; i += 2)
      g.fillStyle(0x000000, 0.07).fillRect(cx - w / 2 + (i * w) / 8, cy - h / 2, w / 8, h);
    g.lineStyle(3, 0xffffff, 0.45);
    g.strokeRoundedRect(cx - w / 2 + 8, cy - h / 2 + 8, w - 16, h - 16, 16);
    g.lineBetween(cx, cy - h / 2 + 8, cx, cy + h / 2 - 8);
    g.strokeCircle(cx, cy, h * 0.17);
    g.strokeRect(cx - w / 2 + 8, cy - h * 0.25, w * 0.1, h * 0.5);
    g.strokeRect(cx + w / 2 - 8 - w * 0.1, cy - h * 0.25, w * 0.1, h * 0.5);
    v.add(g);
    slots.forEach((s, i) => {
      const x = cx - w / 2 + 40 + s.depth * (w - 80);
      const y = cy - h / 2 + 32 + s.side * (h - 64);
      const p = lineup[i] ?? null;
      const dot = this.add.graphics();
      if (p) {
        dot.fillStyle(0x000000, 0.3).fillCircle(x, y + 3, 20);
        dot.fillStyle(ROLE_COLOR[s.role]).fillCircle(x, y, 20);
        dot.lineStyle(3, 0xffffff).strokeCircle(x, y, 20);
        // Names sit beside the dot (never below it): lines of five players are tight.
        const left = s.depth > 0.85;
        v.add([
          dot,
          addText(this, x, y, showRatings ? String(p.rating) : String(p.num), 19, {
            color: '#052e16',
          }),
          addText(this, left ? x - 26 : x + 26, y, p.name.slice(3, 11), 15, {
            color: '#ffffff',
            stroke: '#052e16',
            strokeThickness: 4,
          }).setOrigin(left ? 1 : 0, 0.5),
        ]);
      } else {
        const glow = hot.has(s.role);
        if (glow) dot.fillStyle(0xfde047, 0.25).fillCircle(x, y, 24);
        dot
          .lineStyle(glow ? 3 : 2, glow ? 0xfde047 : 0xffffff, glow ? 1 : 0.55)
          .strokeCircle(x, y, 20);
        v.add([
          dot,
          addText(this, x, y, s.role, 14, {
            color: glow ? '#fef08a' : '#ffffffaa',
            weight: glow ? 'bold' : 'normal',
          }),
        ]);
      }
    });
  }
}

function scoreLabel(m: MatchResult): string {
  const base = `${m.goals} × ${m.against}`;
  return m.pens ? `${base}\n(${m.pens[0]}-${m.pens[1]} pên.)` : base;
}
