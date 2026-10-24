import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
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
  type Slot,
  type Style,
} from './core';

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

const ROW_H = 64;
const LIST_TOP = 450;
const LIST_H = 512;

const ratingColor = (r: number) => (r >= 85 ? '#fde047' : r >= 75 ? '#86efac' : '#ffffff');

/** "Seleção dos Sonhos": draft eleven players from random World Cup squads, then win seven games. */
export class SelecaoScene extends MiniScene {
  private formation: FormationId = '4-3-3';
  private style: Style = 'equilibrado';
  private mode: Mode = 'classico';
  private run = new SelecaoGame();
  private view!: Phaser.GameObjects.Container;

  constructor() {
    super(SceneKeys.Selecao, 'selecao', [0x052e16, 0x14532d]);
  }

  create(): void {
    this.frame('SELEÇÃO DOS SONHOS');
    this.scoreText.setFontSize(38).setY(60).setStroke('#052e16', 8);
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
    v.add(addText(this, 50, y, text, 26, { color: '#bbf7d0', weight: 'bold' }).setOrigin(0, 0.5));
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
        height: 72,
        fontSize: 28,
        color: on ? GREEN : OFF,
        shade: on ? GREEN_DARK : OFF_DARK,
      }),
    );
  }

  // ---------------------------------------------------------------- configuration

  private showConfig(): void {
    const v = this.reset();
    v.add(
      addText(this, CX, 150, 'Escolha a formação, o estilo e o modo', 28, {
        color: '#ffffff',
        wrapWidth: 640,
      }),
    );
    this.label(v, 215, 'FORMAÇÃO');
    FORMATION_IDS.forEach((f, i) => {
      const x = 105 + (i % 4) * 170;
      const y = 285 + Math.floor(i / 4) * 86;
      this.choice(v, x, y, 150, f, f === this.formation, () => {
        this.formation = f;
        this.showConfig();
      });
    });
    this.label(v, 440, 'ESTILO');
    STYLES.forEach((s, i) =>
      this.choice(v, 125 + i * 235, 510, 215, STYLE_LABEL[s], s === this.style, () => {
        this.style = s;
        this.showConfig();
      }),
    );
    this.label(v, 595, 'MODO');
    (['classico', 'almanaque'] as const).forEach((m, i) =>
      this.choice(v, 190 + i * 340, 665, 310, MODE_LABEL[m], m === this.mode, () => {
        this.mode = m;
        this.showConfig();
      }),
    );
    v.add(
      addText(
        this,
        CX,
        750,
        this.mode === 'classico'
          ? 'Você vê a nota de cada jogador.'
          : 'Notas escondidas, só os nomes! Pontos x1,5.',
        24,
        { color: '#d1fae5', weight: 'normal', wrapWidth: 620 },
      ),
    );
    this.drawPitch(v, CX, 940, 620, 300, slotsFor(this.formation), []);
    v.add(
      new Button(this, CX, 1160, 'COMEÇAR', () => this.startDraft(), {
        width: 500,
        height: 100,
        color: RED,
        shade: RED_DARK,
      }),
    );
  }

  // ---------------------------------------------------------------- draft

  private startDraft(): void {
    this.run = new SelecaoGame(Math.random, this.formation, this.style, this.mode);
    this.showDraft();
  }

  private showDraft(): void {
    const v = this.reset();
    const g = this.run;
    const squad = g.current;
    v.add(
      addText(
        this,
        CX,
        140,
        `Jogador ${g.filled + 1} de ${g.slots.length} · ${g.formation} · ${STYLE_LABEL[g.style]}`,
        26,
        { color: '#d1fae5' },
      ),
    );
    // The team on the table.
    const card = this.add.graphics();
    card.fillStyle(0x000000, 0.35).fillRoundedRect(40, 180, 640, 130, 24);
    card.fillStyle(0xfef3c7).fillRoundedRect(40, 176, 640, 130, 24);
    v.add(card);
    if (squad) {
      v.add([
        emojiText(this, 110, 241, squad.flag, 64),
        addText(this, 170, 224, squad.nation, 46, { color: '#052e16' }).setOrigin(0, 0.5),
        addText(this, 170, 272, `Copa ${squad.year}`, 34, { color: '#c2410c' }).setOrigin(0, 0.5),
      ]);
    } else {
      v.add(
        addText(this, CX, 241, 'Role para sortear uma seleção\ne uma Copa do Mundo', 30, {
          color: '#78716c',
          weight: 'normal',
        }),
      );
    }

    if (!squad) {
      v.add(
        new Button(this, CX, 640, 'ROLAR 🎲', () => this.roll(), {
          width: 520,
          height: 120,
          color: RED,
          shade: RED_DARK,
        }),
      );
      v.add(
        addText(this, CX, 760, `Sorteios para trocar: ${g.rerollsLeft} de ${REROLLS}`, 24, {
          color: '#bbf7d0',
          weight: 'normal',
        }),
      );
    } else {
      v.add(
        addText(
          this,
          CX,
          350,
          `NÃO CURTIU? RE-SORTEIE · ${g.rerollsLeft} RESTANTE${g.rerollsLeft === 1 ? '' : 'S'}`,
          22,
          { color: '#bbf7d0' },
        ),
      );
      const can = g.rerollsLeft > 0;
      (
        [
          ['↺ OUTRA SELEÇÃO', 'nation'],
          ['↺ OUTRA COPA', 'cup'],
        ] as const
      ).forEach(([text, kind], i) =>
        v.add(
          new Button(
            this,
            190 + i * 340,
            402,
            text,
            () => {
              if (g.reroll(kind)) this.showDraft();
            },
            { width: 310, height: 64, fontSize: 24, color: OFF, shade: OFF_DARK },
          ).setEnabled(can),
        ),
      );
      this.buildList(v, g.eligible());
    }
    this.drawPitch(v, CX, 1115, 640, 270, g.slots, g.lineup);
  }

  private roll(): void {
    const g = this.run;
    g.draw();
    const { sfx } = getServices(this);
    sfx.play('click');
    flash(this, 0xfef3c7, 0.2, 160);
    this.showDraft();
  }

  /** Scrollable list of the players that fit an open position. */
  private buildList(v: Phaser.GameObjects.Container, players: readonly Player[]): void {
    const hidden = this.run.mode === 'almanaque';
    const list = this.add.container(0, LIST_TOP);
    players.forEach((p, i) => {
      const y = i * ROW_H + ROW_H / 2;
      const row = this.add.graphics();
      row.fillStyle(i % 2 ? 0x14532d : 0x166534, 0.95).fillRoundedRect(40, y - 29, 640, 58, 14);
      list.add([
        row,
        addText(this, 80, y, `#${p.num}`, 24, { color: '#bbf7d0' }).setOrigin(0.5),
        addText(this, 130, y, p.name, 30, { color: '#ffffff' }).setOrigin(0, 0.5),
        addText(this, 560, y, p.alt ? `${p.role}/${p.alt}` : p.role, 22, {
          color: '#bbf7d0',
          weight: 'normal',
        }).setOrigin(1, 0.5),
        addText(this, 640, y, hidden ? '??' : String(p.rating), 34, {
          color: hidden ? '#ffffff' : ratingColor(p.rating),
        }).setOrigin(1, 0.5),
      ]);
    });
    const maskShape = this.make.graphics({}, false);
    maskShape.fillRect(0, LIST_TOP, GAME_WIDTH, LIST_H);
    list.setMask(maskShape.createGeometryMask());
    const maxScroll = Math.max(0, players.length * ROW_H - LIST_H + 8);
    const scrollTo = (dy: number) => {
      list.y = Phaser.Math.Clamp(dy, LIST_TOP - maxScroll, LIST_TOP);
    };

    let startY = 0;
    let startList = 0;
    let moved = 0;
    const zone = this.add
      .zone(CX, LIST_TOP + LIST_H / 2, GAME_WIDTH, LIST_H)
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
      const i = Math.floor((p.y - list.y) / ROW_H);
      const chosen = players[i];
      if (chosen) this.choose(chosen, p.x, p.y);
    });
    zone.on('wheel', (_p: Phaser.Input.Pointer, _dx: number, dy: number) => scrollTo(list.y - dy));
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) =>
      scrollTo(list.y - dy),
    );
    v.add([list, zone]);
    v.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.input.off('wheel');
      list.clearMask(true);
    });
    if (players.length * ROW_H > LIST_H)
      v.add(
        addText(this, CX, LIST_TOP + LIST_H + 14, '↕ arraste para ver mais', 20, {
          color: '#86efac',
          weight: 'normal',
        }),
      );
  }

  private choose(p: Player, x: number, y: number): void {
    const g = this.run;
    const slot = g.pick(p.num);
    if (slot < 0) return;
    const { sfx } = getServices(this);
    sfx.play('win');
    burst(this, x, y, 0xfde047, 16);
    this.pop(
      CX,
      330,
      `${p.name}${this.run.mode === 'almanaque' ? '' : ` · ${p.rating}`}`,
      GOLD,
      40,
    );
    if (g.complete) {
      this.time.delayedCall(700, () => this.startTournament());
    } else {
      this.showDraft();
    }
  }

  // ---------------------------------------------------------------- tournament

  private startTournament(): void {
    const g = this.run;
    const result = g.tournament();
    const v = this.reset();
    const stats = g.stats;
    v.add(
      addText(
        this,
        CX,
        140,
        `Seleção ${stats.overall} · ${g.formation} · ${STYLE_LABEL[g.style]}`,
        28,
        {
          color: '#d1fae5',
        },
      ),
    );
    v.add(addText(this, CX, 195, 'Rumo à taça: 7 jogos, sem perdoar!', 26, { color: GOLD }));
    this.drawPitch(v, CX, 1090, 640, 300, g.slots, g.lineup, true);

    const rows: Array<{ left: Phaser.GameObjects.Text; right: Phaser.GameObjects.Text }> = [];
    for (let i = 0; i < MATCHES; i++) {
      const y = 270 + i * 100;
      const g2 = this.add.graphics();
      g2.fillStyle(0x000000, 0.25).fillRoundedRect(40, y - 40, 640, 84, 20);
      const left = addText(this, 64, y, '', 26, {
        color: '#ffffff',
        wrapWidth: 360,
        align: 'left',
      }).setOrigin(0, 0.5);
      const right = addText(this, 660, y, '', 32, { color: '#ffffff' }).setOrigin(1, 0.5);
      v.add([g2, left, right]);
      rows.push({ left, right });
    }
    const stageNames = result.matches.map((m) => m.stage);
    const play = (i: number) => {
      const m = result.matches[i];
      if (!m) {
        this.time.delayedCall(1300, () => this.end(result, stageNames));
        return;
      }
      const row = rows[i]!;
      row.left.setText(`${m.stage}\n${m.opponent.flag} ${m.opponent.nation} ${m.opponent.year}`);
      row.right.setText('…');
      const { sfx } = getServices(this);
      this.time.delayedCall(950, () => {
        row.right.setText(scoreLabel(m)).setColor(m.win ? '#86efac' : '#fca5a5');
        sfx.play(m.win ? 'win' : 'hit');
        if (m.win) burst(this, 560, row.right.y, 0x86efac, 12);
        else this.cameras.main.shake(180, 0.006);
        this.time.delayedCall(m.win ? 450 : 900, () => play(i + 1));
      });
    };
    play(0);
  }

  private end(result: ReturnType<SelecaoGame['tournament']>, stages: string[]): void {
    const g = this.run;
    const last = result.matches[result.matches.length - 1]!;
    const lines = [
      `Nota ${g.stats.overall} · ${g.formation}`,
      `Vitórias: ${result.wins}/${MATCHES} · Saldo de gols: ${result.goalDiff}`,
      `Sorteios usados: ${g.rerollsUsed}${g.mode === 'almanaque' ? ' · modo De almanaque' : ''}`,
    ];
    const title = result.champion
      ? 'CAMPEÃ DO MUNDO! 🏆'
      : `Eliminada em: ${stages[stages.length - 1]} (${last.opponent.nation})`;
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

  /** A small pitch with the formation (goalkeeper on the left); filled dots show the picks. */
  private drawPitch(
    v: Phaser.GameObjects.Container,
    cx: number,
    cy: number,
    w: number,
    h: number,
    slots: readonly Slot[],
    lineup: ReadonlyArray<Player | null>,
    showRatings = this.run.mode === 'classico',
  ): void {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(cx - w / 2 + 4, cy - h / 2 + 8, w, h, 22);
    g.fillStyle(0x2f8f4e).fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 22);
    for (let i = 0; i < 8; i += 2)
      g.fillStyle(0x000000, 0.06).fillRect(cx - w / 2 + (i * w) / 8, cy - h / 2, w / 8, h);
    g.lineStyle(3, 0xffffff, 0.45);
    g.strokeRoundedRect(cx - w / 2 + 8, cy - h / 2 + 8, w - 16, h - 16, 16);
    g.lineBetween(cx, cy - h / 2 + 8, cx, cy + h / 2 - 8);
    g.strokeCircle(cx, cy, h * 0.17);
    g.strokeRect(cx - w / 2 + 8, cy - h * 0.25, w * 0.1, h * 0.5);
    g.strokeRect(cx + w / 2 - 8 - w * 0.1, cy - h * 0.25, w * 0.1, h * 0.5);
    v.add(g);
    slots.forEach((s, i) => {
      const x = cx - w / 2 + 34 + s.depth * (w - 68);
      const y = cy - h / 2 + 30 + s.side * (h - 60);
      const p = lineup[i] ?? null;
      const dot = this.add.graphics();
      if (p) {
        dot.fillStyle(0xffffff).fillCircle(x, y, 19);
        dot.lineStyle(3, 0x052e16).strokeCircle(x, y, 19);
        v.add([
          dot,
          addText(this, x, y, showRatings ? String(p.rating) : String(p.num), 19, {
            color: '#052e16',
          }),
          // Names sit beside the dot (never below it): lines of five players are tight.
          addText(this, s.depth > 0.85 ? x - 24 : x + 24, y, p.name.slice(3, 11), 15, {
            color: '#ffffff',
            stroke: '#052e16',
            strokeThickness: 4,
          }).setOrigin(s.depth > 0.85 ? 1 : 0, 0.5),
        ]);
      } else {
        dot.lineStyle(2, 0xffffff, 0.55).strokeCircle(x, y, 19);
        v.add([dot, addText(this, x, y, s.role, 14, { color: '#ffffffaa', weight: 'normal' })]);
      }
    });
  }
}

function slotsFor(f: FormationId): Slot[] {
  return new SelecaoGame(Math.random, f).slots;
}

function scoreLabel(m: MatchResult): string {
  const base = `${m.goals} × ${m.against}`;
  return m.pens ? `${base}\n(${m.pens[0]}-${m.pens[1]} pên.)` : base;
}
