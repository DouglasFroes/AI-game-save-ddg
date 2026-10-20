import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { kidKey } from '@/games/bomba/art';
import { headKey } from '@/games/crush/art';
import { CARD_BACK } from '@/games/memoria/art';
import { autoSubmit } from '@/platform/ranking';
import { addBackground, addText, Button, panel, starRow } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { memoBest } from './best';
import {
  BOMB,
  BOMB_PENALTY,
  isUnlocked,
  LEVELS,
  MemoLevelSim,
  recordWin,
  summary,
  type Card,
  type MemoEvent,
} from './core';

/** Faces 0–5 are the kids' heads, 6–12 the whole kids. */
const faceKey = (face: number) => (face < 6 ? headKey(face) : kidKey(face - 6, 0));

const COLS = 5;
const TILE = 118;
const GAP = 16;

export class MemoLevelsScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.MemoLevels);
  }

  create(): void {
    const { memoProgress, sfx } = getServices(this);
    const p = memoProgress.get();
    const sum = summary(p);
    addBackground(this);
    panel(this, GAME_WIDTH / 2, 120, 660, 160);
    addText(this, GAME_WIDTH / 2, 92, 'Memória: Aventura', 48);
    addText(this, GAME_WIDTH / 2, 152, `★ ${sum.stars}/${LEVELS.length * 3}`, 34, {
      color: '#5b6b8c',
    });

    const gridW = COLS * TILE + (COLS - 1) * GAP;
    const x0 = (GAME_WIDTH - gridW) / 2 + TILE / 2;
    LEVELS.forEach((level, i) => {
      const x = x0 + (i % COLS) * (TILE + GAP);
      const y = 290 + Math.floor(i / COLS) * (TILE + GAP + 6);
      const open = isUnlocked(p, level.id);
      const result = p[level.id];
      const color = !open ? COLORS.locked : result ? COLORS.success : 0xb5179e;
      const shade = !open ? 0x8e97a5 : result ? COLORS.successDark : 0x7a0f6b;
      const tile = new Button(
        this,
        x,
        y,
        open ? String(level.id) : '🔒',
        () => {
          if (!open) {
            sfx.play('locked');
            this.tweens.add({ targets: tile, x: x + 8, duration: 50, yoyo: true, repeat: 2 });
            return;
          }
          this.scene.start(SceneKeys.MemoGame, { levelId: level.id });
        },
        { width: TILE, height: TILE - 8, color, shade, fontSize: 44 },
      );
      tile.label.setY(-12);
      if (open) starRow(this, 0, 32, result?.stars ?? 0, 28, 2).forEach((s) => tile.add(s));
      // Icons for the twist of the level.
      if (open && (level.bomb || level.shuffle))
        tile.add(addText(this, 40, -40, level.bomb ? '💣' : '🔀', 20));
    });

    new Button(this, 200, 1180, '‹ Menu', () => this.scene.start(SceneKeys.Hub), {
      width: 280,
      height: 100,
      color: COLORS.secondary,
      shade: COLORS.secondaryDark,
    });
    new Button(
      this,
      520,
      1180,
      '🏆 Ranking',
      () =>
        this.scene.start(SceneKeys.Leaderboard, {
          gameId: 'memofases',
          back: SceneKeys.MemoLevels,
        }),
      {
        width: 280,
        height: 100,
        fontSize: 38,
        color: COLORS.secondary,
        shade: COLORS.secondaryDark,
      },
    );
  }
}

const AREA = { top: 250, bottom: 1230 };

export class MemoGameScene extends Phaser.Scene {
  private sim!: MemoLevelSim;
  private views = new Map<number, Phaser.GameObjects.Container>();
  private slots: Array<{ x: number; y: number }> = [];
  private bar!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private ended = false;

  constructor() {
    super(SceneKeys.MemoGame);
  }

  init(data: { levelId?: number }): void {
    const level = LEVELS.find((l) => l.id === data.levelId) ?? LEVELS[0]!;
    this.sim = new MemoLevelSim(level);
    this.views = new Map();
    this.slots = [];
    this.ended = false;
  }

  create(): void {
    const level = this.sim.level;
    this.cameras.main.setBackgroundColor(0xffe3f3);
    new Button(this, 60, 60, '‹', () => this.scene.start(SceneKeys.MemoLevels), {
      width: 88,
      height: 80,
      color: COLORS.panel,
      shade: 0xc7cfdc,
      textColor: COLORS.text,
      fontSize: 42,
    }).setDepth(10);
    addText(this, GAME_WIDTH / 2, 56, `Fase ${level.id}`, 46, { color: '#7209b7' });
    this.info = addText(this, GAME_WIDTH / 2, 112, '', 24, {
      color: COLORS.textMuted,
      weight: 'normal',
    });
    this.bar = this.add.graphics();
    const twist = [
      level.preview ? '👀 Memorize!' : '',
      level.bomb ? `💣 Bomba: −${BOMB_PENALTY}s` : '',
      level.shuffle ? '🔀 Errou? Duas cartas trocam de lugar' : '',
    ].filter(Boolean);
    if (twist.length) {
      const t = addText(this, GAME_WIDTH / 2, 205, twist.join('   '), 24, { color: '#b5179e' });
      this.tweens.add({ targets: t, alpha: 0.4, duration: 600, yoyo: true, repeat: 3 });
      // The hint goes away once the level is under way.
      this.tweens.add({ targets: t, alpha: 0, delay: 5200, duration: 500 });
    }
    this.layout();
    if (import.meta.env.DEV) (window as unknown as { __memo?: MemoGameScene }).__memo = this;
  }

  get state(): MemoLevelSim {
    return this.sim;
  }

  private layout(): void {
    const { cols, rows } = this.sim.level;
    const w = Math.min(150, (GAME_WIDTH - 60) / cols - 14);
    const h = Math.min(w * 1.2, (AREA.bottom - AREA.top) / rows - 14);
    const s = Math.min(w / 140, h / 170);
    const gx = (GAME_WIDTH - cols * (140 * s + 14)) / 2 + (140 * s) / 2 + 7;
    this.sim.cards.forEach((card, i) => {
      const x = gx + (i % cols) * (140 * s + 14);
      const y = AREA.top + (170 * s) / 2 + Math.floor(i / cols) * (170 * s + 14);
      this.slots.push({ x, y });
      const face = this.add.graphics();
      face
        .fillStyle(card.face === BOMB ? 0x2b2d42 : 0xffffff)
        .fillRoundedRect(-70, -85, 140, 170, 18);
      face
        .lineStyle(5, card.face === BOMB ? 0xff3b3b : 0xffd23f)
        .strokeRoundedRect(-70, -85, 140, 170, 18);
      const pic =
        card.face === BOMB
          ? addText(this, 0, 0, '💣', 80)
          : this.add.image(0, 0, faceKey(card.face));
      if (pic instanceof Phaser.GameObjects.Image)
        pic.setScale(Math.min(110 / pic.width, 140 / pic.height));
      const back = this.add.image(0, 0, CARD_BACK).setVisible(!card.up);
      const c = this.add.container(x, y, [face, pic, back]).setScale(0);
      c.setSize(140, 170).setInteractive({ useHandCursor: true });
      c.on('pointerup', () => this.flip(card));
      c.setData('s', s);
      this.views.set(card.id, c);
      this.tweens.add({ targets: c, scale: s, duration: 220, delay: i * 25, ease: 'Back.easeOut' });
    });
  }

  private flip(card: Card): void {
    if (this.ended) return;
    const i = this.sim.cards.indexOf(card);
    for (const e of this.sim.flip(i)) this.onEvent(e);
  }

  private turn(card: Card, up: boolean): void {
    const v = this.views.get(card.id);
    if (!v) return;
    const s = v.getData('s') as number;
    this.tweens.add({
      targets: v,
      scaleX: 0,
      duration: 90,
      onComplete: () => {
        (v.list[2] as Phaser.GameObjects.Image).setVisible(!up);
        this.tweens.add({ targets: v, scaleX: s, duration: 90 });
      },
    });
  }

  private onEvent(e: MemoEvent): void {
    const { sfx } = getServices(this);
    switch (e.type) {
      case 'flip':
        sfx.play('click');
        this.turn(e.card, true);
        break;
      case 'match':
        sfx.play('star', 2);
        for (const c of [e.a, e.b]) {
          const v = this.views.get(c.id);
          if (v)
            this.tweens.add({
              targets: v,
              scale: (v.getData('s') as number) * 1.12,
              duration: 120,
              yoyo: true,
              delay: 180,
            });
        }
        break;
      case 'miss':
        sfx.play('locked');
        break;
      case 'bomb': {
        sfx.play('hit');
        this.cameras.main.shake(200, 0.01);
        const t = addText(this, GAME_WIDTH / 2, 700, `−${BOMB_PENALTY}s`, 80, {
          color: '#ff3b3b',
          stroke: '#ffffff',
          strokeThickness: 10,
        }).setDepth(20);
        this.tweens.add({
          targets: t,
          y: 620,
          alpha: 0,
          duration: 800,
          onComplete: () => t.destroy(),
        });
        break;
      }
      case 'hide':
      case 'previewEnd':
        for (const c of this.sim.cards) {
          const back = this.views.get(c.id)?.list[2] as Phaser.GameObjects.Image | undefined;
          if (!c.up && back && !back.visible) this.turn(c, false);
        }
        break;
      case 'swap': {
        // Cards i and j traded places in the deck: slide their views to the new slots.
        const a = this.views.get(this.sim.cards[e.i]!.id)!;
        const b = this.views.get(this.sim.cards[e.j]!.id)!;
        this.tweens.add({
          targets: a,
          x: this.slots[e.i]!.x,
          y: this.slots[e.i]!.y,
          duration: 350,
          ease: 'Sine.easeInOut',
        });
        this.tweens.add({
          targets: b,
          x: this.slots[e.j]!.x,
          y: this.slots[e.j]!.y,
          duration: 350,
          ease: 'Sine.easeInOut',
        });
        break;
      }
      case 'won':
        this.ended = true;
        this.time.delayedCall(500, () => this.result(true, e.stars, e.points));
        break;
      case 'lost':
        this.ended = true;
        sfx.play('hit');
        this.time.delayedCall(400, () => this.result(false, 0, 0));
        break;
    }
  }

  private result(won: boolean, stars: 1 | 2 | 3 | 0, points: number): void {
    const services = getServices(this);
    const level = this.sim.level;
    services.sessionTracker.completeRun('memofases', won ? points : 0);
    if (won && stars) {
      services.sfx.play('win');
      services.memoProgress.update((p) => recordWin(p, level.id, stars, points));
      const best = memoBest(services);
      if (best) void autoSubmit(services, 'memofases', best).catch(() => null);
    }
    const shade = this.add
      .rectangle(0, 0, GAME_WIDTH, 1280, 0x000000, 0.5)
      .setOrigin(0)
      .setDepth(40)
      .setInteractive();
    const c = this.add.container(GAME_WIDTH / 2, 640).setDepth(41);
    const bg = this.add.graphics();
    bg.fillStyle(0xffffff).fillRoundedRect(-300, -280, 600, 560, 40);
    c.add(bg);
    c.add(
      addText(this, 0, -210, won ? 'Fase completa!' : 'Acabou o tempo!', 48, {
        color: won ? '#7209b7' : '#c1121f',
      }),
    );
    if (won) {
      starRow(this, 0, -110, stars, 84, 14).forEach((s, i) => {
        c.add(s);
        s.setScale(0);
        this.tweens.add({
          targets: s,
          scale: 84 / s.width,
          delay: 200 + i * 200,
          duration: 300,
          ease: 'Back.easeOut',
        });
      });
      c.add(
        addText(this, 0, -10, `Erros: ${this.sim.misses} · ${points} pontos`, 28, {
          color: COLORS.textMuted,
        }),
      );
    }
    const next = LEVELS.find((l) => l.id === level.id + 1);
    const btn = (
      y: number,
      label: string,
      fn: () => void,
      color: number = COLORS.secondary,
      shadeC: number = COLORS.secondaryDark,
    ) =>
      c.add(
        new Button(this, 0, y, label, fn, {
          width: 420,
          height: 86,
          fontSize: 34,
          color,
          shade: shadeC,
        }),
      );
    if (won && next)
      btn(
        80,
        'Próxima fase ›',
        () => this.scene.start(SceneKeys.MemoGame, { levelId: next.id }),
        COLORS.success,
        COLORS.successDark,
      );
    btn(won && next ? 180 : 100, '↻ Jogar de novo', () =>
      this.scene.restart({ levelId: level.id }),
    );
    if (!(won && next)) btn(200, '☰ Fases', () => this.scene.start(SceneKeys.MemoLevels));
    void shade;
    c.setScale(0.7).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });
  }

  override update(_t: number, deltaMs: number): void {
    if (!this.ended) for (const e of this.sim.step(deltaMs / 1000)) this.onEvent(e);
    const k = this.sim.time / this.sim.level.time;
    const g = this.bar.clear();
    g.fillStyle(0xffffff).fillRoundedRect(60, 150, GAME_WIDTH - 120, 26, 13);
    g.fillStyle(k > 0.25 ? 0x7209b7 : 0xff3b3b).fillRoundedRect(
      64,
      154,
      Math.max(18, (GAME_WIDTH - 128) * k),
      18,
      9,
    );
    this.info.setText(
      this.sim.preview > 0
        ? `Memorize! ${Math.ceil(this.sim.preview)}…`
        : `⏱ ${Math.ceil(this.sim.time)}s · Erros: ${this.sim.misses}`,
    );
  }
}

export const scenes = [MemoLevelsScene, MemoGameScene];
