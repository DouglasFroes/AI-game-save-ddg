import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { Tex } from '@/platform/art/textures';
import { formatNumber } from '@/platform/ranking';
import type { GameOverData } from '@/platform/scenes/GameOverScene';
import { addText, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { CpuBrain } from './ai';
import {
  FIREBALL_Y,
  FightSim,
  MAX_METER,
  NO_INPUT,
  type FightEvent,
  type FightInput,
} from './core';
import { FighterView } from './fighterView';
import {
  healBetweenFights,
  hitPoints,
  PLAYER_LOOK,
  PLAYER_STATS,
  rivalFor,
  winBonus,
  type FighterLook,
} from './ladder';

/** Carried from one fight to the next (scene restarts between fights). */
export interface LutaData {
  level?: number;
  score?: number;
  hp?: number;
  maxCombo?: number;
  perfects?: number;
}

const GROUND_Y = 860;
const STEP = 1 / 120;
const MAX_DT = 1 / 20;

interface PadButton {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly g: Phaser.GameObjects.Graphics;
  readonly color: number;
}

/** "Luta de Rua": survive a ladder of CPU rivals, one fight after another. */
export class LutaScene extends Phaser.Scene {
  private sim!: FightSim;
  private cpu!: CpuBrain;
  private rivalLook!: FighterLook;
  private views!: [FighterView, FighterView];
  private level = 1;
  private score = 0;
  private maxCombo = 0;
  private perfects = 0;
  private running = false;
  private finished = false;
  private acc = 0;
  private hitstop = 0;
  private flash: [number, number] = [0, 0];
  private trail: [number, number] = [1, 1];
  private pressed: FightInput = { ...NO_INPUT };
  private fireballs = new Map<number, Phaser.GameObjects.Container>();

  private hud!: {
    bars: Phaser.GameObjects.Graphics;
    timer: Phaser.GameObjects.Text;
    score: Phaser.GameObjects.Text;
    combo: Phaser.GameObjects.Text;
  };
  private pad!: Record<'left' | 'right' | 'jump' | 'punch' | 'kick' | 'special', PadButton>;
  private keys?: Record<
    'left' | 'right' | 'jump' | 'punch' | 'kick' | 'special',
    Phaser.Input.Keyboard.Key[]
  >;

  constructor() {
    super(SceneKeys.Luta);
  }

  init(data: LutaData): void {
    this.level = data.level ?? 1;
    this.score = data.score ?? 0;
    this.maxCombo = data.maxCombo ?? 0;
    this.perfects = data.perfects ?? 0;
    const rival = rivalFor(this.level);
    this.rivalLook = rival.look;
    this.sim = new FightSim(PLAYER_STATS, rival.stats);
    if (data.hp !== undefined) this.sim.fighters[0].hp = data.hp;
    this.cpu = new CpuBrain(this.level);
    this.running = false;
    this.finished = false;
    this.acc = 0;
    this.hitstop = 0;
    this.flash = [0, 0];
    this.trail = [this.sim.fighters[0].hp / PLAYER_STATS.maxHp, 1];
    this.pressed = { ...NO_INPUT };
    this.fireballs = new Map();
  }

  create(): void {
    this.drawStage();
    this.views = [
      new FighterView(this, PLAYER_LOOK, GROUND_Y),
      new FighterView(this, this.rivalLook, GROUND_Y),
    ];
    this.buildHud();
    this.buildPad();
    this.intro();
    if (import.meta.env.DEV) (window as unknown as { __luta?: LutaScene }).__luta = this;
  }

  // ── Stage ───────────────────────────────────────────────────────────────

  private drawStage(): void {
    const g = this.add.graphics().setDepth(0);
    g.fillGradientStyle(0x1b1238, 0x1b1238, 0x7b2d5b, 0x7b2d5b, 1).fillRect(
      0,
      0,
      GAME_WIDTH,
      GROUND_Y,
    );
    g.fillStyle(0xffe8a3, 0.9).fillCircle(560, 300, 46);
    // Skyline.
    let x = -10;
    while (x < GAME_WIDTH) {
      const w = Phaser.Math.Between(60, 120);
      const h = Phaser.Math.Between(180, 420);
      g.fillStyle(0x24183f).fillRect(x, GROUND_Y - 120 - h, w, h + 120);
      g.fillStyle(0xffd166, 0.7);
      for (let wy = GROUND_Y - 100 - h; wy < GROUND_Y - 140; wy += 34)
        for (let wx = x + 10; wx < x + w - 14; wx += 24)
          if (Math.random() < 0.35) g.fillRect(wx, wy, 10, 14);
      x += w + 6;
    }
    // Graffiti wall and street.
    g.fillStyle(0x5c4b6b).fillRect(0, GROUND_Y - 150, GAME_WIDTH, 150);
    g.fillStyle(0x4a3b58);
    for (let bx = 0; bx < GAME_WIDTH; bx += 60) g.fillRect(bx, GROUND_Y - 150, 2, 150);
    g.fillStyle(0x3b2f4a).fillRect(0, GROUND_Y, GAME_WIDTH, 1280 - GROUND_Y);
    g.fillStyle(0x2c2338).fillRect(0, GROUND_Y + 60, GAME_WIDTH, 1280 - GROUND_Y);
    for (let bx = 20; bx < GAME_WIDTH; bx += 120)
      g.fillStyle(0xffd166, 0.6).fillRect(bx, GROUND_Y + 28, 60, 6);
    const tag = addText(this, 230, GROUND_Y - 80, 'GRAU', 54, {
      color: '#ff5d8f',
      stroke: '#06d6a0',
      strokeThickness: 8,
    });
    tag.setAngle(-8).setAlpha(0.75).setDepth(1);
    addText(this, 520, GROUND_Y - 70, 'LUTA!', 46, {
      color: '#ffd166',
      stroke: '#8338ec',
      strokeThickness: 8,
    })
      .setAngle(6)
      .setAlpha(0.7)
      .setDepth(1);
    // Street lamp.
    g.fillStyle(0x1a1a2e)
      .fillRect(78, GROUND_Y - 330, 10, 330)
      .fillRect(78, GROUND_Y - 330, 60, 8);
    g.fillStyle(0xfff3b0, 0.25).fillTriangle(134, GROUND_Y - 322, 60, GROUND_Y, 210, GROUND_Y);
    g.fillStyle(0xfff3b0).fillCircle(134, GROUND_Y - 318, 10);
  }

  // ── HUD ─────────────────────────────────────────────────────────────────

  private buildHud(): void {
    iconButton(this, 60, 60, '‹', () => this.scene.start(SceneKeys.Hub)).setDepth(31);
    const light = { color: COLORS.textLight, stroke: '#0b1430', strokeThickness: 6 };
    addText(this, 118, 150, PLAYER_LOOK.name, 24, light).setOrigin(0, 0.5).setDepth(30);
    addText(this, GAME_WIDTH - 24, 150, this.rivalLook.name, 24, light)
      .setOrigin(1, 0.5)
      .setDepth(30);
    const timer = addText(this, GAME_WIDTH / 2, 72, '60', 46, {
      ...light,
      color: '#ffd23f',
    }).setDepth(31);
    const score = addText(this, GAME_WIDTH / 2, 200, formatNumber(this.score), 30, light).setDepth(
      30,
    );
    const combo = addText(this, GAME_WIDTH / 2, 330, '', 48, {
      color: '#ffd23f',
      stroke: '#0b1430',
      strokeThickness: 10,
    })
      .setDepth(32)
      .setAlpha(0);
    addText(this, GAME_WIDTH / 2, 240, `LUTA ${this.level}`, 22, { color: '#ffffffaa' }).setDepth(
      30,
    );
    this.hud = { bars: this.add.graphics().setDepth(30), timer, score, combo };
  }

  private updateHud(dt: number): void {
    const [p, c] = this.sim.fighters;
    const g = this.hud.bars.clear();
    const bar = (
      x: number,
      w: number,
      ratio: number,
      trail: number,
      flip: boolean,
      meter: number,
    ) => {
      g.fillStyle(0x0b1430, 0.85).fillRoundedRect(x - 4, 94, w + 8, 40, 10);
      const fill = (r: number, color: number) => {
        const fw = Math.max(0, w * r);
        g.fillStyle(color).fillRect(flip ? x + w - fw : x, 98, fw, 32);
      };
      fill(trail, 0xffffff);
      fill(ratio, ratio > 0.3 ? 0x5bd46f : 0xff5d5d);
      // Special meter.
      const m = meter / MAX_METER;
      g.fillStyle(0x0b1430, 0.85).fillRect(x, 168, w, 12);
      g.fillStyle(m >= 1 ? 0x7df9ff : 0x3a86ff).fillRect(flip ? x + w - w * m : x, 168, w * m, 12);
    };
    const pr = p.hp / p.stats.maxHp;
    const cr = c.hp / c.stats.maxHp;
    // The white "recent damage" part catches up after a moment.
    this.trail = [Math.max(pr, this.trail[0] - dt * 0.6), Math.max(cr, this.trail[1] - dt * 0.6)];
    bar(110, 230, pr, this.trail[0], false, p.meter);
    bar(GAME_WIDTH - 340, 230, cr, this.trail[1], true, c.meter);
    this.hud.timer.setText(String(Math.ceil(this.sim.time)));
    this.hud.score.setText(formatNumber(this.score));
  }

  // ── Touch pad ───────────────────────────────────────────────────────────

  private buildPad(): void {
    this.input.addPointer(3);
    const make = (
      x: number,
      y: number,
      r: number,
      label: string,
      color: number,
      size = 34,
    ): PadButton => {
      const g = this.add.graphics().setDepth(40).setPosition(x, y);
      addText(this, x, y, label, size, {
        color: COLORS.textLight,
        stroke: '#0b1430',
        strokeThickness: 5,
      }).setDepth(41);
      return { x, y, r, g, color };
    };
    this.pad = {
      left: make(80, 1150, 68, '◀', 0x0b1430, 48),
      right: make(232, 1150, 68, '▶', 0x0b1430, 48),
      jump: make(156, 1010, 62, '▲', 0x0b1430, 44),
      punch: make(470, 1170, 70, 'SOCO', 0xe63946, 26),
      kick: make(632, 1110, 70, 'CHUTE', 0x3a86ff, 26),
      special: make(560, 975, 60, 'PODER', 0x7209b7, 24),
    };
    const inside = (b: PadButton, p: Phaser.Input.Pointer) =>
      Phaser.Math.Distance.Between(p.x, p.y, b.x, b.y) <= b.r + 12;
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      for (const k of ['jump', 'punch', 'kick', 'special'] as const)
        if (inside(this.pad[k], p)) this.pressed[k] = true;
    });

    const kb = this.input.keyboard;
    if (kb) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      const keys = (...codes: number[]) => codes.map((c) => kb.addKey(c));
      this.keys = {
        left: keys(K.LEFT, K.A),
        right: keys(K.RIGHT, K.D),
        jump: keys(K.UP, K.W),
        punch: keys(K.J, K.Z),
        kick: keys(K.K, K.X),
        special: keys(K.L, K.C),
      };
    }
  }

  private readInput(): FightInput {
    const held = (k: 'left' | 'right') =>
      this.input.manager.pointers.some(
        (p) =>
          p.isDown &&
          Phaser.Math.Distance.Between(p.x, p.y, this.pad[k].x, this.pad[k].y) <=
            this.pad[k].r + 20,
      ) || !!this.keys?.[k].some((key) => key.isDown);
    const tapped = (k: 'jump' | 'punch' | 'kick' | 'special') =>
      this.pressed[k] || !!this.keys?.[k].some((key) => Phaser.Input.Keyboard.JustDown(key));
    const input = {
      left: held('left'),
      right: held('right'),
      jump: tapped('jump'),
      punch: tapped('punch'),
      kick: tapped('kick'),
      special: tapped('special'),
    };
    this.pressed = { ...NO_INPUT };
    return input;
  }

  private drawPad(input: FightInput): void {
    const ready = this.sim.fighters[0].meter >= MAX_METER;
    for (const [k, b] of Object.entries(this.pad) as [keyof typeof this.pad, PadButton][]) {
      const on = (k === 'left' || k === 'right') && input[k];
      const glow = k === 'special' && ready;
      b.g.clear();
      b.g
        .fillStyle(glow ? 0x7df9ff : b.color, k === 'special' && !ready ? 0.3 : on ? 0.9 : 0.6)
        .fillCircle(0, 0, b.r);
      b.g.lineStyle(5, 0xffffff, glow ? 1 : 0.7).strokeCircle(0, 0, b.r);
      b.g.setScale(glow ? 1 + 0.05 * Math.sin(this.time.now / 100) : 1);
    }
  }

  // ── Loop ────────────────────────────────────────────────────────────────

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, MAX_DT);
    const input = this.running ? this.readInput() : NO_INPUT;
    if (this.running || this.sim.over) {
      if (this.hitstop > 0) this.hitstop -= dt;
      else {
        this.acc += dt;
        let first = true;
        while (this.acc >= STEP) {
          this.acc -= STEP;
          // Buttons fire on the first sub-step only.
          const p0 = first
            ? input
            : { ...input, jump: false, punch: false, kick: false, special: false };
          const p1 = this.running ? this.cpu.think(this.sim, 1, STEP) : NO_INPUT;
          first = false;
          for (const e of this.sim.step(STEP, [p0, p1])) this.onEvent(e);
        }
      }
    }
    this.flash = [Math.max(0, this.flash[0] - dt), Math.max(0, this.flash[1] - dt)];
    this.views[0].draw(this.sim.fighters[0], this.time.now / 1000, this.flash[0] > 0);
    this.views[1].draw(this.sim.fighters[1], this.time.now / 1000, this.flash[1] > 0);
    this.syncFireballs();
    this.updateHud(dt);
    this.drawPad(input);
  }

  private onEvent(e: FightEvent): void {
    const { sfx } = getServices(this);
    switch (e.type) {
      case 'hit': {
        const target = e.attacker === 0 ? 1 : 0;
        const y = GROUND_Y - e.y;
        this.spark(e.x, y, e.blocked ? 0x7df9ff : 0xffd23f, e.blocked ? 8 : 16);
        if (e.blocked) {
          sfx.play('click');
          break;
        }
        this.flash[target] = 0.08;
        this.hitstop = e.kind === 'punch' ? 0.045 : 0.08;
        sfx.play(e.kind === 'punch' ? 'pop' : 'hit');
        if (e.kind !== 'punch') this.cameras.main.shake(e.kind === 'special' ? 220 : 120, 0.008);
        if (target === 1) sfx.vibrate(20);
        else sfx.vibrate([40, 20, 40]);
        this.damageNumber(e.x, y - 40, e.damage, target === 1);
        if (e.attacker === 0) {
          this.score += hitPoints(e.damage, e.combo);
          this.maxCombo = Math.max(this.maxCombo, e.combo);
          if (e.combo >= 2) this.showCombo(e.combo);
        }
        break;
      }
      case 'special':
        sfx.play('start');
        break;
      case 'clash':
        sfx.play('star', 3);
        this.spark(e.x, GROUND_Y - FIREBALL_Y, 0x7df9ff, 24);
        break;
      case 'ko':
      case 'timeup':
        this.endFight(e.winner, e.type === 'ko');
        break;
      case 'whiff':
        break;
    }
  }

  private syncFireballs(): void {
    const alive = new Set<number>();
    for (const p of this.sim.projectiles) {
      alive.add(p.id);
      let view = this.fireballs.get(p.id);
      if (!view) {
        const color = p.owner === 0 ? 0x7df9ff : 0xff7b00;
        const glow = this.add.circle(0, 0, 38, color, 0.35);
        const core = this.add.circle(0, 0, 22, 0xffffff, 0.95);
        view = this.add.container(p.x, GROUND_Y - FIREBALL_Y, [glow, core]).setDepth(6);
        this.tweens.add({ targets: glow, scale: 1.25, duration: 120, yoyo: true, repeat: -1 });
        this.fireballs.set(p.id, view);
      }
      view.setPosition(p.x, GROUND_Y - FIREBALL_Y);
    }
    for (const [id, view] of this.fireballs) {
      if (alive.has(id)) continue;
      view.destroy();
      this.fireballs.delete(id);
    }
  }

  // ── Effects ─────────────────────────────────────────────────────────────

  private spark(x: number, y: number, tint: number, count: number): void {
    const p = this.add.particles(x, y, Tex.dot, {
      speed: { min: 140, max: 420 },
      lifespan: 320,
      scale: { start: 1, end: 0 },
      tint,
      emitting: false,
    });
    p.setDepth(20).explode(count);
    this.time.delayedCall(500, () => p.destroy());
  }

  private damageNumber(x: number, y: number, dmg: number, good: boolean): void {
    const t = addText(this, x, y, `-${dmg}`, 34, {
      color: good ? '#ffd23f' : '#ff5d5d',
      stroke: '#0b1430',
      strokeThickness: 6,
    }).setDepth(25);
    this.tweens.add({
      targets: t,
      y: y - 70,
      alpha: 0,
      duration: 650,
      onComplete: () => t.destroy(),
    });
  }

  private showCombo(combo: number): void {
    const t = this.hud.combo.setText(`${combo} HITS!`).setAlpha(1).setScale(1.3);
    this.tweens.killTweensOf(t);
    this.tweens.add({ targets: t, scale: 1, duration: 150, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, delay: 700, duration: 300 });
  }

  private bigText(text: string, color = '#ffd23f', size = 110): Phaser.GameObjects.Text {
    const t = addText(this, GAME_WIDTH / 2, 520, text, size, {
      color,
      stroke: '#0b1430',
      strokeThickness: 16,
      wrapWidth: 680,
    })
      .setDepth(50)
      .setScale(1.6)
      .setAlpha(0);
    this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    return t;
  }

  // ── Flow ────────────────────────────────────────────────────────────────

  private intro(): void {
    const { sfx } = getServices(this);
    const vs = this.bigText(`LUTA ${this.level}`, '#ffffff', 80);
    const name = addText(this, GAME_WIDTH / 2, 620, `vs ${this.rivalLook.name}`, 40, {
      color: '#ffd23f',
      stroke: '#0b1430',
      strokeThickness: 8,
    }).setDepth(50);
    sfx.play('click');
    if (this.level === 1) {
      const help = addText(
        this,
        GAME_WIDTH / 2,
        720,
        'Segure para trás para defender\nEncha a barra azul e solte o PODER',
        26,
        {
          color: COLORS.textLight,
          stroke: '#0b1430',
          strokeThickness: 6,
        },
      ).setDepth(50);
      this.time.delayedCall(3200, () => help.destroy());
    }
    this.time.delayedCall(1300, () => {
      vs.destroy();
      name.destroy();
      const go = this.bigText('LUTE!', '#ff5d5d');
      sfx.play('start');
      this.running = true;
      this.time.delayedCall(700, () => go.destroy());
    });
  }

  private endFight(winner: 0 | 1 | null, ko: boolean): void {
    if (this.finished) return;
    this.finished = true;
    this.running = false;
    const { sfx } = getServices(this);
    const player = this.sim.fighters[0];

    if (winner === 0) {
      const perfect = player.hp === player.stats.maxHp;
      if (perfect) this.perfects++;
      const bonus = winBonus({
        level: this.level,
        hpLeft: player.hp,
        maxHp: player.stats.maxHp,
        timeLeft: this.sim.time,
        perfect,
      });
      this.score += bonus;
      sfx.play('win');
      this.bigText(ko ? 'K.O.!' : 'TEMPO!');
      this.time.delayedCall(1000, () => {
        this.bigText(perfect ? 'PERFEITO!' : 'VOCÊ VENCEU!', perfect ? '#7df9ff' : '#5bd46f', 76);
        const b = addText(this, GAME_WIDTH / 2, 640, `+${formatNumber(bonus)}`, 44, {
          color: '#ffd23f',
          stroke: '#0b1430',
          strokeThickness: 8,
        }).setDepth(50);
        this.tweens.add({ targets: b, y: 610, duration: 400 });
      });
      this.time.delayedCall(2600, () =>
        this.scene.restart({
          level: this.level + 1,
          score: this.score,
          hp: healBetweenFights(player.hp, player.stats.maxHp),
          maxCombo: this.maxCombo,
          perfects: this.perfects,
        } satisfies LutaData),
      );
      return;
    }

    sfx.play('hit');
    this.bigText(ko ? 'K.O.' : 'TEMPO!', '#ff5d5d');
    const wins = this.level - 1;
    const data: GameOverData = {
      gameId: 'luta',
      title: wins === 0 ? 'Você apanhou!' : `${wins} ${wins === 1 ? 'vitória' : 'vitórias'}!`,
      lines: [
        `Derrotado por ${this.rivalLook.name}`,
        `Maior combo: ${this.maxCombo} ${this.maxCombo === 1 ? 'hit' : 'hits'}`,
      ],
      record: {
        score: this.score,
        details: { wins, maxCombo: this.maxCombo, perfects: this.perfects },
      },
      parent: SceneKeys.Luta,
      retry: { scene: SceneKeys.Luta, data: {} },
    };
    this.time.delayedCall(1600, () => this.scene.launch(SceneKeys.GameOver, data));
  }
}
