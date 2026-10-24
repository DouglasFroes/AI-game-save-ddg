import Phaser from 'phaser';
import { GAME_WIDTH, type SceneKey } from '@/config';
import { burst, flash, shockwave } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { formatNumber } from '@/platform/ranking';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  draftYears,
  FORMATION_IDS,
  LEAGUE_ROUNDS,
  MATCHES,
  REROLLS,
  SelecaoGame,
  STYLES,
  type FormationId,
  type MatchResult,
  type Mode,
  type Player,
  type Role,
  type LeagueRound,
  type Season,
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
  /** `cup`: seven knockout games; `league`: 38 rounds, everyone plays everyone twice. */
  readonly format?: 'cup' | 'league';
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
const PITCH = { cx: CX, cy: 330, w: 680, h: 330 };
/** Each cup won makes the next round's opponents this much stronger. */
const ROUND_BOOST = 3;

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

/** Short label for the pitch: the whole name when it fits, else the last word. */
const shortName = (name: string) =>
  name.length <= 9 ? name : (name.split(' ').pop() ?? name).slice(0, 9);

/** Where a slot sits on a pitch (goalkeeper on the left). */
function slotXY(s: Slot, p: { cx: number; cy: number; w: number; h: number }) {
  return {
    x: p.cx - p.w / 2 + 40 + s.depth * (p.w - 80),
    y: p.cy - p.h / 2 + 32 + s.side * (p.h - 64),
  };
}

/** Totals of the cups already won in this series. */
interface Series {
  round: number;
  score: number;
  wins: number;
  rerolls: number;
  titles: number;
  bestOvr: number;
}

/**
 * Draft eleven players from random squads, then win seven knockout games. Win the cup and a new
 * round starts (against stronger opponents) with the points adding up; the first loss ends it.
 */
export abstract class DreamScene extends MiniScene {
  private formation: FormationId = '4-3-3';
  private style: Style = 'equilibrado';
  private mode: Mode = 'classico';
  private run: SelecaoGame;
  private series: Series = { round: 1, score: 0, wins: 0, rerolls: 0, titles: 0, bestOvr: 0 };
  private view!: Phaser.GameObjects.Container;
  /** Looping tweens of the current screen, stopped when it is replaced. */
  private loops: object[] = [];
  /** Input is ignored while something is animating. */
  private busy = false;

  constructor(private readonly cfg: DreamConfig) {
    super(cfg.key, cfg.gameId, cfg.colors);
    this.run = new SelecaoGame(Math.random, '4-3-3', 'equilibrado', 'classico', cfg.teams);
  }

  create(): void {
    this.busy = false;
    this.frame(this.cfg.title.toUpperCase());
    this.scoreText.setFontSize(36).setY(60).setStroke('#052e16', 8);
    this.view = this.add.container(0, 0);
    this.showConfig();
  }

  /** Throws away the current screen and starts an empty one. */
  private reset(): Phaser.GameObjects.Container {
    this.tweens.killTweensOf(this.loops);
    this.loops = [];
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

  /** A rounded card centred on (0,0) of its own container. */
  private card(
    x: number,
    y: number,
    w: number,
    h: number,
    fill = 0xfef3c7,
  ): Phaser.GameObjects.Container {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2, -h / 2 + 5, w, h, 24);
    g.fillStyle(fill).fillRoundedRect(-w / 2, -h / 2, w, h, 24);
    return this.add.container(x, y, [g]);
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
    this.drawPitch(
      v,
      { cx: CX, cy: 915, w: 660, h: 330 },
      this.slotsFor(this.formation),
      [],
      false,
    );
    v.add(
      new Button(
        this,
        CX,
        1160,
        'COMEÇAR',
        () => {
          this.series = { round: 1, score: 0, wins: 0, rerolls: 0, titles: 0, bestOvr: 0 };
          this.startDraft();
        },
        { width: 500, height: 100, color: RED, shade: RED_DARK },
      ),
    );
  }

  private slotsFor(f: FormationId): Slot[] {
    return new SelecaoGame(Math.random, f).slots;
  }

  // ---------------------------------------------------------------- draft

  private startDraft(): void {
    this.run = new SelecaoGame(Math.random, this.formation, this.style, this.mode, this.cfg.teams);
    this.busy = false;
    this.showDraft();
  }

  private showDraft(pop = false): void {
    const v = this.reset();
    const g = this.run;
    const squad = g.current;
    const eligible = squad ? g.eligible() : [];
    const s = this.series;
    v.add(
      addText(
        this,
        CX,
        128,
        (s.round > 1 ? `Rodada ${s.round} · ${formatNumber(s.score)} pts · ` : '') +
          `Jogador ${g.filled + 1} de ${g.slots.length} · ${g.formation}`,
        24,
        { color: '#d1fae5' },
      ),
    );
    this.drawPitch(
      v,
      PITCH,
      g.slots,
      g.lineup,
      g.mode === 'classico',
      new Set(eligible.map((p) => g.fillsAs(p)).filter((r): r is Role => !!r)),
    );

    // The team on the table.
    const card = this.card(CX, 576, 640, 112);
    if (squad) {
      card.add([
        emojiText(this, -248, 0, squad.flag, 62),
        addText(this, -188, -20, squad.nation, 44, { color: '#052e16' }).setOrigin(0, 0.5),
        addText(this, -188, 26, `${this.cfg.edition} ${squad.year}`, 32, {
          color: '#c2410c',
        }).setOrigin(0, 0.5),
      ]);
    } else {
      card.add(
        addText(this, 0, 0, 'Role para sortear um time\ne uma temporada', 30, {
          color: '#78716c',
          weight: 'normal',
        }),
      );
    }
    v.add(card);
    if (pop) {
      card.setScale(0.8).setAlpha(0.4);
      this.tweens.add({ targets: card, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' });
      shockwave(this, CX, 576, 0xfde68a, 90);
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
            if (this.busy || !g.reroll(kind)) return;
            this.spin(() => this.showDraft(true));
          },
          { width: 310, height: 58, fontSize: 24, color: OFF, shade: OFF_DARK },
        ).setEnabled(can),
      ),
    );
    this.buildList(v, eligible);
  }

  private roll(): void {
    if (this.busy) return;
    this.run.draw();
    this.spin(() => this.showDraft(true));
  }

  /** Slot-machine flicker over the team card, then `done`. */
  private spin(done: () => void): void {
    this.busy = true;
    const pool = this.cfg.teams.filter((t) => draftYears(t).length > 0);
    const veil = this.card(CX, 576, 640, 112).setDepth(30);
    const flag = emojiText(this, -248, 0, '', 62);
    const name = addText(this, -188, -20, '', 44, { color: '#052e16' }).setOrigin(0, 0.5);
    const year = addText(this, -188, 26, '', 32, { color: '#c2410c' }).setOrigin(0, 0.5);
    veil.add([flag, name, year]);
    const { sfx } = getServices(this);
    let n = 0;
    const tick = () => {
      const t = pool[Math.floor(Math.random() * pool.length)]!;
      const ys = draftYears(t);
      flag.setText(t.flag);
      name.setText(t.name);
      year.setText(`${this.cfg.edition} ${ys[Math.floor(Math.random() * ys.length)]}`);
      sfx.play('click');
      this.tweens.add({ targets: veil, y: { from: 570, to: 576 }, duration: 60 });
    };
    tick();
    this.time.addEvent({
      delay: 70,
      repeat: 9,
      callback: () => {
        n++;
        tick();
        if (n === 10) {
          this.time.delayedCall(90, () => {
            veil.destroy();
            this.busy = false;
            flash(this, 0xfef3c7, 0.22, 200);
            sfx.play('win');
            done();
          });
        }
      },
    });
  }

  /** Scrollable list of the players that fit an open position. */
  private buildList(v: Phaser.GameObjects.Container, players: readonly Player[]): void {
    const g = this.run;
    const hidden = g.mode === 'almanaque';
    const list = this.add.container(0, LIST_TOP);
    players.forEach((p, i) => {
      const y = i * ROW_H + ROW_H / 2;
      const star = !hidden && p.rating >= 85;
      const fills = g.fillsAs(p);
      const row = this.add.graphics();
      row.fillStyle(0x000000, 0.3).fillRoundedRect(40, -28, 640, 60, 16);
      row.fillStyle(i % 2 ? 0x14532d : 0x166534).fillRoundedRect(40, -31, 640, 60, 16);
      if (star) row.lineStyle(3, 0xfde047).strokeRoundedRect(40, -31, 640, 60, 16);
      row.fillStyle(ROLE_COLOR[p.role]).fillRoundedRect(52, -20, 84, 40, 12);
      row
        .fillStyle(star ? 0xfde047 : 0x052e16, star ? 1 : 0.55)
        .fillRoundedRect(572, -20, 96, 40, 12);
      const item = this.add.container(0, y, [
        row,
        addText(this, 94, 0, p.role, 24, { color: '#052e16' }),
        addText(this, 152, fills && fills !== p.role ? -9 : 0, p.name, 30, {
          color: '#ffffff',
        }).setOrigin(0, 0.5),
        addText(this, 620, 0, hidden ? '?' : String(p.rating), 32, {
          color: star ? '#052e16' : hidden ? '#ffffff' : ratingColor(p.rating),
        }),
      ]);
      if (fills && fills !== p.role)
        item.add(
          addText(this, 152, 17, `joga de ${fills}`, 17, {
            color: '#fde68a',
            weight: 'normal',
          }).setOrigin(0, 0.5),
        );
      list.add(item);
      // Rows slide in one after the other.
      if (i < 9) {
        item.setAlpha(0).setX(50);
        this.tweens.add({
          targets: item,
          alpha: 1,
          x: 0,
          duration: 240,
          delay: 60 + i * 35,
          ease: 'Cubic.easeOut',
        });
      }
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
      if (moved > 12 || this.busy) return;
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

  /** The player flies from the list to his place on the pitch, then the draft moves on. */
  private choose(p: Player, fromX: number, fromY: number): void {
    const g = this.run;
    const slot = g.pick(p.num);
    if (slot < 0) return;
    this.busy = true;
    const { sfx } = getServices(this);
    sfx.play('click');
    const to = slotXY(g.slots[slot]!, PITCH);
    const color = ROLE_COLOR[g.slots[slot]!.role];
    const chip = this.add.container(fromX, fromY, [
      this.add.circle(0, 0, 24, color).setStrokeStyle(4, 0xffffff),
      addText(this, 0, 0, g.mode === 'almanaque' ? p.name.charAt(0) : String(p.rating), 20, {
        color: '#052e16',
      }),
    ]);
    chip.setDepth(40).setScale(0.6);
    this.tweens.add({
      targets: chip,
      x: to.x,
      y: to.y,
      scale: 1.25,
      duration: 380,
      ease: 'Cubic.easeInOut',
      onComplete: () => {
        chip.destroy();
        sfx.play('win');
        shockwave(this, to.x, to.y, color, 70);
        burst(this, to.x, to.y, 0xfde047, 14);
        this.pop(
          CX,
          PITCH.cy + 130,
          g.mode === 'almanaque' ? p.name : `${p.name} · ${p.rating}`,
          GOLD,
          38,
        );
        this.busy = false;
        if (g.complete) {
          this.busy = true;
          this.showDraft();
          this.time.delayedCall(800, () => this.startTournament());
        } else this.showDraft();
      },
    });
  }

  // ---------------------------------------------------------------- tournament

  private startTournament(): void {
    if (this.cfg.format === 'league') {
      this.startLeague();
      return;
    }
    const g = this.run;
    const result = g.tournament((this.series.round - 1) * ROUND_BOOST);
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
      addText(
        this,
        160,
        196,
        this.series.round > 1
          ? `Rodada ${this.series.round} · ${formatNumber(this.series.score)} pts`
          : 'Sete jogos até a taça. Perdeu, caiu!',
        23,
        { color: GOLD, weight: 'normal' },
      ).setOrigin(0, 0.5),
    ]);
    const cup = emojiText(this, 640, 172, '🏆', 84).setAlpha(0.35);
    v.add(cup);
    this.loops.push(cup);
    this.tweens.add({
      targets: cup,
      y: 164,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const rows: Array<{
      group: Phaser.GameObjects.Container;
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
      bg.fillStyle(0x000000, 0.28).fillRoundedRect(40, -40, 640, 84, 20);
      if (last) bg.lineStyle(3, 0xfde047, 0.7).strokeRoundedRect(40, -40, 640, 84, 20);
      const dot = this.add.graphics();
      dot.fillStyle(0x052e16, 0.8).fillCircle(86, 0, 26);
      const mark = addText(this, 86, 0, String(i + 1), 28, { color: '#bbf7d0' });
      const left = addText(this, 134, 0, '', 25, {
        color: '#ffffff',
        wrapWidth: 330,
        align: 'left',
      }).setOrigin(0, 0.5);
      const right = addText(this, 660, 0, '', 32, { color: '#ffffff' }).setOrigin(1, 0.5);
      const group = this.add.container(0, y, [bg, dot, mark, left, right]);
      v.add(group);
      rows.push({ group, dot, mark, left, right, y });
    }
    this.drawPitch(v, { cx: CX, cy: 1115, w: 680, h: 270 }, g.slots, g.lineup, true);

    const play = (i: number) => {
      const m = result.matches[i];
      if (!m) {
        this.time.delayedCall(result.champion ? 300 : 1200, () => this.afterCup(result));
        return;
      }
      const row = rows[i]!;
      row.left.setText(`${m.stage}\n${m.opponent.flag} ${m.opponent.nation} ${m.opponent.year}`);
      row.group.setX(60).setAlpha(0);
      this.tweens.add({ targets: row.group, x: 0, alpha: 1, duration: 260, ease: 'Cubic.easeOut' });
      this.time.delayedCall(450, () =>
        this.revealScore(row, m, () => {
          this.time.delayedCall(m.win ? 350 : 800, () => play(i + 1));
        }),
      );
    };
    play(0);
  }

  // ---------------------------------------------------------------- league

  /** 38 rounds played one after the other (tap "Pular" to jump to the final table). */
  private startLeague(): void {
    const g = this.run;
    const season = g.season();
    const v = this.reset();
    const stats = g.stats;
    const ROWS_Y = 392;
    const ROW = 33;

    const badge = this.add.graphics();
    badge.fillStyle(0x000000, 0.35).fillCircle(80, 178, 48);
    badge.fillStyle(0xfef3c7).fillCircle(80, 172, 48);
    const roundText = addText(this, 150, 150, 'Rodada 0 de 38', 30, { color: '#ffffff' }).setOrigin(
      0,
      0.5,
    );
    const posText = addText(this, 150, 196, 'Prepare-se…', 24, {
      color: GOLD,
      weight: 'normal',
    }).setOrigin(0, 0.5);
    const place = addText(this, 640, 172, '–', 70, { color: '#fde047', stroke: '#052e16' });
    v.add([
      badge,
      addText(this, 80, 166, String(stats.overall), 42, { color: '#052e16' }),
      addText(this, 80, 196, 'NOTA', 13, { color: '#c2410c' }),
      roundText,
      posText,
      place,
    ]);
    const bar = this.add.graphics();
    v.add(bar);

    // The last game of yours.
    const last = this.card(CX, 292, 640, 84, 0x14532d);
    const lastText = addText(this, -300, 0, '', 24, {
      color: '#ffffff',
      wrapWidth: 440,
      align: 'left',
    }).setOrigin(0, 0.5);
    const lastScore = addText(this, 300, 0, '', 38, { color: '#ffffff' }).setOrigin(1, 0.5);
    last.add([lastText, lastScore]);
    v.add(last);

    // The table: one container per team, moved to its place after each round.
    const ui = season.teams.map((t, i) => {
      const bg = this.add.graphics();
      const mine = t.me;
      bg.fillStyle(mine ? 0xfde047 : 0x000000, mine ? 0.9 : 0.22).fillRoundedRect(
        40,
        -15,
        640,
        30,
        8,
      );
      const color = mine ? '#052e16' : '#ffffff';
      const pos = addText(this, 74, 0, '', 17, { color }).setOrigin(0.5);
      const name = addText(this, 104, 0, `${t.flag} ${t.me ? t.name : `${t.name} ${t.year}`}`, 18, {
        color,
        align: 'left',
      }).setOrigin(0, 0.5);
      const played = addText(this, 520, 0, '0', 17, { color, weight: 'normal' }).setOrigin(0.5);
      const gd = addText(this, 585, 0, '0', 17, { color, weight: 'normal' }).setOrigin(0.5);
      const pts = addText(this, 650, 0, '0', 19, { color }).setOrigin(0.5);
      const c = this.add.container(0, ROWS_Y + i * ROW, [bg, pos, name, played, gd, pts]);
      v.add(c);
      return { c, pos, played, gd, pts, idx: i };
    });
    const heads = ['J', 'SG', 'PTS'].map((t, i) =>
      addText(this, [520, 585, 650][i]!, ROWS_Y - 30, t, 16, { color: '#bbf7d0' }),
    );
    v.add(heads);
    // Zones: Libertadores (top 4), Sul-Americana (5–6), relegation (bottom 4).
    const zones = this.add.graphics();
    const zoneColor = (p: number) => (p < 4 ? 0x4ade80 : p < 6 ? 0x38bdf8 : p >= 16 ? 0xf87171 : 0);
    v.add(zones);

    const showRound = (r: LeagueRound, animate: boolean) => {
      roundText.setText(`Rodada ${r.number} de ${LEAGUE_ROUNDS}`);
      bar.clear();
      bar.fillStyle(0x000000, 0.3).fillRoundedRect(40, 232, 640, 12, 6);
      bar
        .fillStyle(0xfde047)
        .fillRoundedRect(40, 232, Math.max(12, (640 * r.number) / LEAGUE_ROUNDS), 12, 6);
      zones.clear();
      r.table.forEach((row, pos) => {
        const u = ui[row.team]!;
        u.pos.setText(String(pos + 1));
        u.played.setText(String(row.played));
        u.gd.setText(String(row.gf - row.ga > 0 ? `+${row.gf - row.ga}` : row.gf - row.ga));
        u.pts.setText(String(row.points));
        const y = ROWS_Y + pos * ROW;
        if (animate) this.tweens.add({ targets: u.c, y, duration: 200, ease: 'Cubic.easeOut' });
        else u.c.setY(y);
        const zc = zoneColor(pos);
        if (zc) zones.fillStyle(zc).fillRect(40, y - 15, 5, 30);
        if (row.team === 0) {
          const where = pos === 0 ? 'Líder!' : `${pos + 1}º lugar`;
          place.setText(`${pos + 1}º`);
          posText.setText(`${where} · ${row.points} pts · ${row.won}V ${row.drawn}E ${row.lost}D`);
        }
      });
      const m = r.matches.find((x) => x.home === 0 || x.away === 0)!;
      const home = m.home === 0;
      const mine = home ? m.homeGoals : m.awayGoals;
      const theirs = home ? m.awayGoals : m.homeGoals;
      const rival = season.teams[home ? m.away : m.home]!;
      lastText.setText(
        `Rodada ${r.number} · ${home ? 'em casa' : 'fora'}\n${rival.flag} ${rival.name} ${rival.year}`,
      );
      lastScore
        .setText(`${mine} × ${theirs}`)
        .setColor(mine > theirs ? '#86efac' : mine < theirs ? '#fca5a5' : '#fde68a');
      if (animate) {
        this.tweens.add({
          targets: lastScore,
          scale: { from: 1.4, to: 1 },
          duration: 220,
          ease: 'Back.easeOut',
        });
        const { sfx } = getServices(this);
        if (mine > theirs) {
          sfx.play('click');
          burst(this, 600, 292, 0x86efac, 8);
        } else if (mine < theirs) this.cameras.main.shake(90, 0.003);
      }
    };

    let next = 0;
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      timer.remove();
      skip.destroy();
      this.time.delayedCall(season.champion ? 300 : 900, () => {
        if (season.champion) {
          flash(this, 0xfde047, 0.35, 400);
          for (let i = 0; i < 4; i++)
            this.time.delayedCall(i * 220, () =>
              burst(this, 120 + Math.random() * 480, 300, 0xfde047, 22, {
                gravity: 300,
                speed: 420,
              }),
            );
        }
        this.time.delayedCall(season.champion ? 1500 : 600, () => this.endLeague(season));
      });
    };
    const timer = this.time.addEvent({
      delay: 330,
      loop: true,
      callback: () => {
        showRound(season.rounds[next]!, true);
        next++;
        if (next >= season.rounds.length) done();
      },
    });
    const skip = new Button(
      this,
      CX,
      1180,
      'PULAR ⏭ ver resultado',
      () => {
        if (finished) return;
        showRound(season.rounds[season.rounds.length - 1]!, false);
        done();
      },
      { width: 520, height: 84, fontSize: 28, color: OFF, shade: OFF_DARK },
    );
    v.add(skip);
  }

  private endLeague(season: Season): void {
    const g = this.run;
    const pos = season.position;
    const title = season.champion
      ? this.cfg.champion
      : `${pos}º lugar${pos <= 4 ? ' · Libertadores' : pos <= 6 ? ' · Sul-Americana' : pos >= 17 ? ' · Rebaixado' : ''}`;
    this.finish(
      title,
      [
        `${season.points} pts · ${season.wins}V ${season.draws}E ${season.losses}D`,
        `Saldo de gols: ${season.goalDiff} · Nota ${g.stats.overall} · ${g.formation}`,
        `Sorteios usados: ${g.rerollsUsed}${g.mode === 'almanaque' ? ' · modo De almanaque' : ''}`,
      ],
      {
        score: season.score,
        details: {
          points: season.points,
          pos,
          rerolls: g.rerollsUsed,
          ovr: g.stats.overall,
          mode: g.mode === 'almanaque' ? 1 : 0,
          gd: season.goalDiff,
        },
      },
      300,
    );
  }

  /** Goals appear one by one (ours and theirs mixed), then the penalties if the game was level. */
  private revealScore(
    row: {
      dot: Phaser.GameObjects.Graphics;
      mark: Phaser.GameObjects.Text;
      right: Phaser.GameObjects.Text;
      y: number;
    },
    m: MatchResult,
    done: () => void,
  ): void {
    const { sfx } = getServices(this);
    const events: boolean[] = [
      ...new Array<boolean>(m.goals).fill(true),
      ...new Array<boolean>(m.against).fill(false),
    ].sort(() => Math.random() - 0.5);
    let mine = 0;
    let theirs = 0;
    row.right.setText('0 × 0');
    const bump = (color: string) => {
      row.right.setColor(color);
      this.tweens.add({
        targets: row.right,
        scale: { from: 1.35, to: 1 },
        duration: 220,
        ease: 'Back.easeOut',
      });
    };
    const finish = () => {
      const label = m.pens
        ? `${m.goals} × ${m.against}\n(${m.pens[0]}-${m.pens[1]} pên.)`
        : `${m.goals} × ${m.against}`;
      row.right.setText(label).setColor(m.win ? '#86efac' : '#fca5a5');
      row.dot
        .clear()
        .fillStyle(m.win ? 0x16a34a : 0xdc2626)
        .fillCircle(86, 0, 26);
      row.mark.setText(m.win ? '✓' : '✗').setColor('#ffffff');
      this.tweens.add({
        targets: row.mark,
        scale: { from: 1.8, to: 1 },
        duration: 260,
        ease: 'Back.easeOut',
      });
      sfx.play(m.win ? 'win' : 'hit');
      if (m.win) {
        burst(this, 580, row.y, 0x86efac, 14);
        shockwave(this, 86, row.y, 0x86efac, 50);
      } else {
        this.cameras.main.shake(200, 0.007);
        flash(this, 0xdc2626, 0.18, 260);
      }
      done();
    };
    const step = (k: number) => {
      if (k >= events.length) {
        if (m.pens) {
          row.right.setText(`${m.goals} × ${m.against}\n(pênaltis…)`);
          this.time.delayedCall(900, finish);
        } else this.time.delayedCall(250, finish);
        return;
      }
      this.time.delayedCall(k === 0 ? 150 : 420, () => {
        if (events[k]) {
          mine++;
          sfx.play('click');
          burst(this, 600, row.y, 0x86efac, 8);
        } else theirs++;
        row.right.setText(`${mine} × ${theirs}`);
        bump(events[k] ? '#86efac' : '#fca5a5');
        step(k + 1);
      });
    };
    step(0);
  }

  /** After seven games: a lost cup ends the series; a won one starts the next round. */
  private afterCup(result: Tournament): void {
    const g = this.run;
    const s = this.series;
    s.score += result.score;
    s.wins += result.wins;
    s.rerolls += g.rerollsUsed;
    s.bestOvr = Math.max(s.bestOvr, g.stats.overall);
    if (result.champion) {
      s.titles++;
      this.celebrate(result);
    } else this.end(result);
  }

  /** The cup is won: confetti, the points so far, and a button for the next (harder) round. */
  private celebrate(result: Tournament): void {
    const s = this.series;
    const { sfx } = getServices(this);
    sfx.play('win');
    sfx.vibrate([40, 30, 40, 30, 80]);
    flash(this, 0xfde047, 0.4, 500);
    const veil = this.add
      .rectangle(0, 0, GAME_WIDTH, 1280, 0x021a0c, 0.9)
      .setOrigin(0)
      .setDepth(70)
      .setInteractive();
    const trophy = emojiText(this, CX, 360, '🏆', 220).setDepth(71).setScale(0.2).setAngle(-25);
    this.tweens.add({ targets: trophy, scale: 1, angle: 0, duration: 650, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: trophy,
      y: 345,
      duration: 1100,
      yoyo: true,
      repeat: -1,
      delay: 650,
      ease: 'Sine.easeInOut',
    });
    const texts = [
      addText(this, CX, 570, this.cfg.champion, 44, {
        color: GOLD,
        stroke: '#052e16',
        wrapWidth: 640,
      }),
      addText(this, CX, 660, `+${formatNumber(result.score)} pontos`, 56, {
        color: '#ffffff',
        stroke: '#052e16',
      }),
      addText(
        this,
        CX,
        740,
        `Total: ${formatNumber(s.score)} · ${s.titles} título${s.titles > 1 ? 's' : ''}`,
        30,
        {
          color: '#bbf7d0',
        },
      ),
      addText(
        this,
        CX,
        810,
        'A próxima rodada vem com adversários mais fortes.\nPerdeu, o jogo acaba e os pontos entram no ranking!',
        24,
        { color: '#d1fae5', weight: 'normal', wrapWidth: 620 },
      ),
    ].map((t, i) => {
      t.setDepth(71).setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, y: t.y - 14, duration: 350, delay: 500 + i * 200 });
      return t;
    });
    const next = new Button(
      this,
      CX,
      1000,
      `RODADA ${s.round + 1} ▶`,
      () => {
        this.tweens.killTweensOf(trophy);
        [veil, trophy, ...texts, next].forEach((o) => o.destroy());
        s.round++;
        this.startDraft();
      },
      { width: 520, height: 110, color: RED, shade: RED_DARK },
    );
    next.setDepth(71).setAlpha(0);
    this.tweens.add({ targets: next, alpha: 1, duration: 300, delay: 1300 });
    for (let i = 0; i < 5; i++)
      this.time.delayedCall(i * 260, () =>
        burst(
          this,
          120 + Math.random() * 480,
          250 + Math.random() * 200,
          [0xfde047, 0x86efac, 0xf87171, 0x38bdf8][i % 4]!,
          22,
          {
            depth: 72,
            gravity: 300,
            speed: 420,
          },
        ),
      );
  }

  private end(result: Tournament): void {
    const g = this.run;
    const s = this.series;
    const last = result.matches[result.matches.length - 1]!;
    const lines = [
      `Nota ${s.bestOvr} · ${g.formation}`,
      `Vitórias: ${s.wins} · Títulos: ${s.titles}`,
      `Sorteios usados: ${s.rerolls}${g.mode === 'almanaque' ? ' · modo De almanaque' : ''}`,
    ];
    const title =
      s.titles > 0
        ? `${s.titles}x campeão! Caiu em: ${last.stage}`
        : `Eliminado em: ${last.stage} (${last.opponent.nation})`;
    this.finish(
      title,
      lines,
      {
        score: s.score,
        details: {
          wins: s.wins,
          rerolls: s.rerolls,
          ovr: s.bestOvr,
          mode: g.mode === 'almanaque' ? 1 : 0,
          rounds: s.round,
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
    box: { cx: number; cy: number; w: number; h: number },
    slots: readonly Slot[],
    lineup: ReadonlyArray<Player | null>,
    showRatings: boolean,
    hot: ReadonlySet<Role> = new Set(),
  ): void {
    const { cx, cy, w, h } = box;
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
      const { x, y } = slotXY(s, box);
      const p = lineup[i] ?? null;
      const dot = this.add.graphics();
      if (p) {
        dot.fillStyle(0x000000, 0.3).fillCircle(x, y + 3, 20);
        dot.fillStyle(ROLE_COLOR[s.role]).fillCircle(x, y, 20);
        dot.lineStyle(3, 0xffffff).strokeCircle(x, y, 20);
        // Names sit beside the dot, or under it for the last line when it is thin: lines of
        // five players are tight and the forwards' names would run into the midfield's.
        const last = s.depth > 0.85;
        const under = last && slots.filter((o) => o.depth === s.depth).length <= 2;
        const left = last && !under;
        v.add([
          dot,
          addText(this, x, y, showRatings ? String(p.rating) : p.name.charAt(0), 19, {
            color: '#052e16',
          }),
          addText(
            this,
            under ? x : left ? x - 26 : x + 26,
            under ? y + 30 : y,
            shortName(p.name),
            14,
            {
              color: '#ffffff',
              stroke: '#052e16',
              strokeThickness: 4,
            },
          ).setOrigin(under ? 0.5 : left ? 1 : 0, 0.5),
        ]);
      } else {
        const glow = hot.has(s.role);
        if (glow) {
          dot.fillStyle(0xfde047, 0.25).fillCircle(x, y, 24);
          const pulse = this.add.circle(x, y, 22).setStrokeStyle(2, 0xfde047, 0.9);
          v.add(pulse);
          this.loops.push(pulse);
          this.tweens.add({ targets: pulse, scale: 1.5, alpha: 0, duration: 900, repeat: -1 });
        }
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
