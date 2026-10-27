import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { KIDS, kidKey } from '@/games/bomba/art';
import { makeFighter as makeViewFighter, type Fighter as ViewFighter } from '@/games/luta/core';
import { KidFighterView } from '@/games/luta/kidView';
import { Tex } from '@/platform/art/textures';
import { formatNumber } from '@/platform/ranking';
import type { GameOverData } from '@/platform/scenes/GameOverScene';
import { addText, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { Brain } from './ai';
import {
  FightSim,
  guardMax,
  NO_INPUT,
  PARRY_WINDOW,
  powerCooldown,
  PROJECTILE_Y,
  type AttackKind,
  type FightEvent,
  type FightInput,
  type Fighter,
  type FighterState,
} from './core';
import {
  BASE_MODS,
  FIGHT_BONUS,
  hitPoints,
  kidSetup,
  offerUpgrades,
  POWERS,
  roundBonus,
  turmaRival,
  type Mods,
  type Upgrade,
} from './ladder';

/** Carried between rounds and fights (the scene restarts for each round). */
export interface TurmaData {
  kid?: number;
  level?: number;
  score?: number;
  mods?: Mods;
  pRounds?: number;
  rRounds?: number;
  maxCombo?: number;
  perfects?: number;
}

const GROUND_Y = 860;
const STEP = 1 / 120;
const MAX_DT = 1 / 20;

type Hold = 'left' | 'right' | 'guard';
type Tap = 'jump' | 'attack' | 'power';
interface PadButton {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly g: Phaser.GameObjects.Graphics;
  readonly color: number;
  readonly label?: Phaser.GameObjects.Text;
}

const VIEW_ATTACK: Record<AttackKind, ViewFighter['attack']> = {
  jab: 'punch',
  hook: 'punch',
  kick: 'kick',
  airKick: 'airKick',
  dash: 'dash',
  dive: 'dive',
  special: 'special',
};
const VIEW_STATE: Record<FighterState, ViewFighter['state']> = {
  idle: 'idle',
  walk: 'walk',
  jump: 'jump',
  attack: 'attack',
  power: 'attack',
  guard: 'block',
  hit: 'hit',
  down: 'ko',
  ko: 'ko',
};

/** "Turma da Luta": the kids fight in best-of-3 rounds with fast powers, guard and parry. */
export class TurmaScene extends Phaser.Scene {
  private data0: Required<Omit<TurmaData, 'kid'>> & { kid: number | null } = {
    kid: null,
    level: 1,
    score: 0,
    mods: BASE_MODS,
    pRounds: 0,
    rRounds: 0,
    maxCombo: 0,
    perfects: 0,
  };
  private sim!: FightSim;
  private brain!: Brain;
  private rivalKid = 0;
  private views!: [KidFighterView, KidFighterView];
  private viewState!: [ViewFighter, ViewFighter];
  private running = false;
  private finished = false;
  private acc = 0;
  private hitstop = 0;
  private flash: [number, number] = [0, 0];
  private trail: [number, number] = [1, 1];
  private pressed: Record<Tap, boolean> = { jump: false, attack: false, power: false };
  private projectiles = new Map<number, Phaser.GameObjects.Container>();
  private fx!: Phaser.GameObjects.Graphics;
  private hud!: {
    bars: Phaser.GameObjects.Graphics;
    timer: Phaser.GameObjects.Text;
    score: Phaser.GameObjects.Text;
    combo: Phaser.GameObjects.Text;
  };
  private pad!: Record<Hold | Tap, PadButton>;
  private keys?: Record<Hold | Tap, Phaser.Input.Keyboard.Key[]>;

  constructor() {
    super(SceneKeys.Turma);
  }

  init(data: TurmaData): void {
    this.data0 = {
      kid: data.kid ?? null,
      level: data.level ?? 1,
      score: data.score ?? 0,
      mods: data.mods ?? BASE_MODS,
      pRounds: data.pRounds ?? 0,
      rRounds: data.rRounds ?? 0,
      maxCombo: data.maxCombo ?? 0,
      perfects: data.perfects ?? 0,
    };
    this.running = false;
    this.finished = false;
    this.acc = 0;
    this.hitstop = 0;
    this.flash = [0, 0];
    this.trail = [1, 1];
    this.pressed = { jump: false, attack: false, power: false };
    this.projectiles = new Map();
  }

  private get me(): number {
    return this.data0.kid ?? 0;
  }

  create(): void {
    this.drawStage();
    if (this.data0.kid === null) {
      this.chooseKid();
      return;
    }
    const rival = turmaRival(this.data0.level, this.me);
    this.rivalKid = rival.kid;
    this.sim = new FightSim(kidSetup(this.me, this.data0.mods), rival.setup);
    this.brain = new Brain(rival.skill);
    this.views = [
      new KidFighterView(this, KIDS[this.me]!, GROUND_Y),
      new KidFighterView(this, KIDS[rival.kid]!, GROUND_Y),
    ];
    this.viewState = [
      makeViewFighter({ maxHp: 100, power: 1, speed: 1 }, 0, 1),
      makeViewFighter({ maxHp: 100, power: 1, speed: 1 }, 0, -1),
    ];
    this.fx = this.add.graphics().setDepth(7);
    this.buildHud();
    this.buildPad();
    this.intro();
    if (import.meta.env.DEV) (window as unknown as { __turma?: TurmaScene }).__turma = this;
  }

  // ── Stage ───────────────────────────────────────────────────────────────

  private drawStage(): void {
    const g = this.add.graphics().setDepth(0);
    g.fillGradientStyle(0x5ec8ff, 0x5ec8ff, 0xc9f0ff, 0xc9f0ff, 1).fillRect(
      0,
      0,
      GAME_WIDTH,
      GROUND_Y,
    );
    g.fillStyle(0xfff3b0).fillCircle(600, 300, 50);
    for (const [x, y, s] of [
      [150, 320, 1],
      [420, 270, 0.8],
      [640, 420, 0.7],
    ] as const) {
      g.fillStyle(0xffffff, 0.95)
        .fillCircle(x, y, 30 * s)
        .fillCircle(x + 35 * s, y - 12 * s, 38 * s)
        .fillCircle(x + 75 * s, y, 28 * s)
        .fillRect(x, y, 75 * s, 28 * s);
    }
    g.fillStyle(0xffd6a5).fillRect(0, GROUND_Y - 260, GAME_WIDTH, 260);
    [0xff6b6b, 0xffd166, 0x06d6a0, 0x4cc9f0, 0xc77dff].forEach((c, i) =>
      g.fillStyle(c).fillRect(0, GROUND_Y - 260 + i * 10, GAME_WIDTH, 10),
    );
    for (let x = 40; x < GAME_WIDTH; x += 170) {
      g.fillStyle(0x2b4a6f).fillRoundedRect(x, GROUND_Y - 190, 100, 80, 10);
      g.fillStyle(0x9bd0ff).fillRoundedRect(x + 6, GROUND_Y - 184, 88, 68, 8);
      g.fillStyle(0x2b4a6f).fillRect(x + 48, GROUND_Y - 184, 4, 68);
    }
    g.fillStyle(0x7f5539).fillRect(620, GROUND_Y - 220, 26, 220);
    g.fillStyle(0x2ecc71)
      .fillCircle(633, GROUND_Y - 250, 70)
      .fillCircle(590, GROUND_Y - 220, 46)
      .fillCircle(675, GROUND_Y - 215, 46);
    g.fillStyle(0x6cc551).fillRect(0, GROUND_Y, GAME_WIDTH, 1280 - GROUND_Y);
    g.fillStyle(0x4e9f3a).fillRect(0, GROUND_Y + 70, GAME_WIDTH, 1280 - GROUND_Y);
    g.fillStyle(0xf2d492).fillEllipse(GAME_WIDTH / 2, GROUND_Y + 14, 640, 44);
  }

  // ── HUD ─────────────────────────────────────────────────────────────────

  private buildHud(): void {
    iconButton(this, 60, 60, '‹', () => this.scene.start(SceneKeys.Hub)).setDepth(31);
    const light = { color: COLORS.textLight, stroke: '#0b1430', strokeThickness: 6 };
    addText(this, 118, 150, KIDS[this.me]!.name, 24, light).setOrigin(0, 0.5).setDepth(30);
    addText(this, GAME_WIDTH - 24, 150, KIDS[this.rivalKid]!.name, 24, light)
      .setOrigin(1, 0.5)
      .setDepth(30);
    const timer = addText(this, GAME_WIDTH / 2, 72, '45', 46, {
      ...light,
      color: '#ffd23f',
    }).setDepth(31);
    const score = addText(
      this,
      GAME_WIDTH / 2,
      200,
      formatNumber(this.data0.score),
      30,
      light,
    ).setDepth(30);
    const combo = addText(this, GAME_WIDTH / 2, 330, '', 48, {
      color: '#ffd23f',
      stroke: '#0b1430',
      strokeThickness: 10,
    })
      .setDepth(32)
      .setAlpha(0);
    const { pRounds, rRounds, level } = this.data0;
    addText(this, GAME_WIDTH / 2, 240, `LUTA ${level}  ·  RODADA ${pRounds + rRounds + 1}`, 22, {
      color: '#ffffffcc',
    }).setDepth(30);
    const pips = (x: number, wins: number, flip: boolean) =>
      [0, 1].forEach((n) =>
        addText(this, x + (flip ? -n : n) * 34, 190, n < wins ? '⭐' : '○', 28, light).setDepth(30),
      );
    pips(130, pRounds, false);
    pips(GAME_WIDTH - 130, rRounds, true);
    this.hud = { bars: this.add.graphics().setDepth(30), timer, score, combo };
  }

  private updateHud(dt: number): void {
    const [p, c] = this.sim.fighters;
    const g = this.hud.bars.clear();
    const bar = (x: number, w: number, f: Fighter, trail: number, flip: boolean) => {
      const ratio = f.hp / f.setup.maxHp;
      g.fillStyle(0x0b1430, 0.85).fillRoundedRect(x - 4, 94, w + 8, 40, 10);
      const fill = (r: number, color: number) => {
        const fw = Math.max(0, w * r);
        g.fillStyle(color).fillRect(flip ? x + w - fw : x, 98, fw, 32);
      };
      fill(trail, 0xffffff);
      fill(ratio, ratio > 0.3 ? 0x5bd46f : 0xff5d5d);
      // Guard energy.
      const gr = f.guard / guardMax(f);
      g.fillStyle(0x0b1430, 0.85).fillRect(x, 140, w, 10);
      g.fillStyle(gr < 0.25 ? 0xff9f1c : 0x3a86ff).fillRect(
        flip ? x + w - w * gr : x,
        140,
        w * gr,
        10,
      );
    };
    const pr = p.hp / p.setup.maxHp;
    const cr = c.hp / c.setup.maxHp;
    this.trail = [Math.max(pr, this.trail[0] - dt * 0.6), Math.max(cr, this.trail[1] - dt * 0.6)];
    bar(110, 230, p, this.trail[0], false);
    bar(GAME_WIDTH - 340, 230, c, this.trail[1], true);
    this.hud.timer.setText(String(Math.ceil(this.sim.time)));
    this.hud.score.setText(formatNumber(this.data0.score));
  }

  // ── Touch pad ───────────────────────────────────────────────────────────

  private buildPad(): void {
    this.input.addPointer(3);
    const make = (
      x: number,
      y: number,
      r: number,
      text: string,
      color: number,
      size = 34,
    ): PadButton => {
      const g = this.add.graphics().setDepth(40).setPosition(x, y);
      const label = addText(this, x, y, text, size, {
        color: COLORS.textLight,
        stroke: '#0b1430',
        strokeThickness: 5,
      }).setDepth(41);
      return { x, y, r, g, color, label };
    };
    this.pad = {
      left: make(80, 1160, 68, '◀', 0x0b1430, 48),
      right: make(232, 1160, 68, '▶', 0x0b1430, 48),
      jump: make(156, 1020, 62, '▲', 0x0b1430, 44),
      guard: make(430, 1190, 62, 'DEFESA', 0x3a86ff, 20),
      power: make(470, 1030, 72, POWERS[this.me]!.name.toUpperCase(), 0x7209b7, 18),
      attack: make(615, 1140, 88, 'ATAQUE', 0xe63946, 30),
    };
    const inside = (b: PadButton, p: Phaser.Input.Pointer) =>
      Phaser.Math.Distance.Between(p.x, p.y, b.x, b.y) <= b.r + 14;
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      for (const k of ['jump', 'attack', 'power'] as const)
        if (inside(this.pad[k], p)) this.pressed[k] = true;
    });
    const kb = this.input.keyboard;
    if (kb) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      const keys = (...codes: number[]) => codes.map((c) => kb.addKey(c));
      this.keys = {
        left: keys(K.LEFT, K.A),
        right: keys(K.RIGHT, K.D),
        guard: keys(K.K, K.X),
        jump: keys(K.UP, K.W),
        attack: keys(K.J, K.Z),
        power: keys(K.L, K.C),
      };
    }
  }

  private readInput(): FightInput {
    const held = (k: Hold) =>
      this.input.manager.pointers.some(
        (p) =>
          p.isDown &&
          Phaser.Math.Distance.Between(p.x, p.y, this.pad[k].x, this.pad[k].y) <=
            this.pad[k].r + 20,
      ) || !!this.keys?.[k].some((key) => key.isDown);
    const tapped = (k: Tap) =>
      this.pressed[k] || !!this.keys?.[k].some((key) => Phaser.Input.Keyboard.JustDown(key));
    const input: FightInput = {
      left: held('left'),
      right: held('right'),
      guard: held('guard'),
      jump: tapped('jump'),
      attack: tapped('attack'),
      power: tapped('power'),
    };
    this.pressed = { jump: false, attack: false, power: false };
    return input;
  }

  private drawPad(input: FightInput): void {
    const me = this.sim.fighters[0];
    const ready = me.powerCd <= 0;
    const frac = 1 - me.powerCd / powerCooldown(me);
    for (const [k, b] of Object.entries(this.pad) as [keyof typeof this.pad, PadButton][]) {
      b.g.clear();
      if (k === 'power') {
        b.g.fillStyle(ready ? 0x7df9ff : b.color, ready ? 0.95 : 0.35).fillCircle(0, 0, b.r);
        b.g.lineStyle(7, 0xffffff, 0.25).strokeCircle(0, 0, b.r);
        b.g
          .lineStyle(8, ready ? 0xffffff : 0xffd23f, 1)
          .beginPath()
          .arc(0, 0, b.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, frac))
          .strokePath();
        b.g.setScale(ready ? 1 + 0.06 * Math.sin(this.time.now / 90) : 1);
        b.label
          ?.setText(ready ? POWERS[this.me]!.name.toUpperCase() : me.powerCd.toFixed(1))
          .setColor(ready ? '#0b1430' : '#ffffff');
        continue;
      }
      const on = (k === 'left' || k === 'right' || k === 'guard') && input[k];
      b.g.fillStyle(b.color, on ? 0.95 : 0.6).fillCircle(0, 0, b.r);
      b.g.lineStyle(5, 0xffffff, 0.7).strokeCircle(0, 0, b.r);
    }
  }

  // ── Loop ────────────────────────────────────────────────────────────────

  override update(_time: number, deltaMs: number): void {
    if (!this.sim) return;
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
          const p0 = first ? input : { ...input, jump: false, attack: false, power: false };
          const p1 = this.running ? this.brain.think(this.sim, STEP) : NO_INPUT;
          first = false;
          for (const e of this.sim.step(STEP, [p0, p1])) this.onEvent(e);
        }
      }
    }
    this.flash = [Math.max(0, this.flash[0] - dt), Math.max(0, this.flash[1] - dt)];
    const now = this.time.now / 1000;
    ([0, 1] as const).forEach((i) => {
      this.views[i].draw(this.toView(i), now, this.flash[i] > 0);
    });
    this.syncProjectiles();
    this.drawFx();
    this.updateHud(dt);
    this.drawPad(input);
  }

  /** Maps the new fighter onto the shape the shared kid renderer draws. */
  private toView(i: 0 | 1): ViewFighter {
    const f = this.sim.fighters[i];
    const o = this.viewState[i];
    o.x = f.x;
    o.y = f.y;
    o.vx = f.vx;
    o.vy = f.vy;
    o.facing = f.facing;
    o.hp = f.hp;
    o.state = VIEW_STATE[f.state];
    o.attack = f.attack ? VIEW_ATTACK[f.attack] : null;
    o.t = f.t;
    o.stun = f.stun;
    o.frozen = f.frozen;
    return o;
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
        const light = e.kind === 'jab' || e.kind === 'hook';
        this.hitstop = light ? 0.04 : 0.09;
        sfx.play(light ? 'pop' : 'hit');
        if (!light) this.cameras.main.shake(e.knockdown ? 220 : 120, 0.008);
        sfx.vibrate(target === 0 ? [40, 20, 40] : 20);
        this.damageNumber(e.x, y - 40, e.damage, target === 1);
        if (e.attacker === 0) {
          this.data0.score += hitPoints(e.damage, e.combo);
          this.data0.maxCombo = Math.max(this.data0.maxCombo, e.combo);
          if (e.combo >= 2) this.showCombo(e.combo);
        }
        break;
      }
      case 'parry': {
        sfx.play('star', 5);
        sfx.vibrate([30, 20, 60]);
        this.hitstop = 0.14;
        this.spark(e.x, GROUND_Y - 120, 0x7df9ff, 26);
        this.cameras.main.flash(90, 160, 240, 255);
        const t = this.sim.fighters[e.defender];
        this.callout(t.x, 'DEFESA PERFEITA!', '#7df9ff');
        if (e.defender === 0) this.data0.score += 400;
        break;
      }
      case 'guardBreak':
        sfx.play('hit');
        this.callout(this.sim.fighters[e.who].x, 'GUARDA QUEBRADA!', '#ff9f1c');
        break;
      case 'power': {
        sfx.play('start');
        const kid = this.sim.fighters[e.owner].setup.kid;
        this.callout(this.sim.fighters[e.owner].x, POWERS[kid]!.name, '#ffd23f');
        break;
      }
      case 'heal': {
        sfx.play('star', 4);
        const f = this.sim.fighters[e.owner];
        this.spark(f.x, GROUND_Y - 160, 0x5bd46f, 18);
        this.damageNumberText(f.x, GROUND_Y - 260, `+${e.amount} ❤`, '#5bd46f');
        break;
      }
      case 'strike':
        sfx.play('hit');
        this.lightningBolt(e.x);
        break;
      case 'quake':
        sfx.play('hit');
        this.cameras.main.shake(260, 0.012);
        this.quakeRing(e.x);
        break;
      case 'clash':
        sfx.play('star', 3);
        this.spark(e.x, GROUND_Y - PROJECTILE_Y, 0x7df9ff, 24);
        break;
      case 'ko':
      case 'timeup':
        this.endRound(e.winner, e.type === 'ko');
        break;
    }
  }

  // ── Effects ─────────────────────────────────────────────────────────────

  private syncProjectiles(): void {
    const alive = new Set<number>();
    for (const p of this.sim.projectiles) {
      alive.add(p.id);
      let view = this.projectiles.get(p.id);
      const y = GROUND_Y - PROJECTILE_Y;
      if (!view) {
        const ice = p.kind === 'ice';
        const glow = this.add.circle(0, 0, 38, ice ? 0x9be7ff : 0xff7b00, 0.4);
        const core = this.add.circle(0, 0, 22, ice ? 0xe0f7ff : 0xffffff, 0.95);
        const parts: Phaser.GameObjects.GameObject[] = [glow, core];
        if (ice)
          for (let i = 0; i < 3; i++)
            parts.push(this.add.rectangle(0, 0, 44, 5, 0xffffff).setAngle(i * 60));
        view = this.add.container(p.x, y, parts).setDepth(6);
        this.tweens.add({ targets: glow, scale: 1.25, duration: 120, yoyo: true, repeat: -1 });
        if (ice) this.tweens.add({ targets: view, angle: 360, duration: 900, repeat: -1 });
        this.projectiles.set(p.id, view);
      }
      view.setPosition(p.x, y);
    }
    for (const [id, view] of this.projectiles)
      if (!alive.has(id)) {
        view.destroy();
        this.projectiles.delete(id);
      }
  }

  /** Lightning warnings and the guard bubbles (brighter during the parry window). */
  private drawFx(): void {
    const g = this.fx.clear();
    for (const s of this.sim.strikes) {
      const blink = Math.floor(this.time.now / 90) % 2 ? 0.9 : 0.4;
      g.fillStyle(0xffd23f, blink * 0.5).fillEllipse(s.x, GROUND_Y + 4, 130, 30);
      g.lineStyle(4, 0xffd23f, blink).strokeEllipse(s.x, GROUND_Y + 4, 130, 30);
      g.fillStyle(0x5c5f73, 0.85)
        .fillEllipse(s.x, 300, 170, 60)
        .fillEllipse(s.x - 40, 285, 90, 50);
    }
    for (const f of this.sim.fighters) {
      if (f.state !== 'guard') continue;
      const parry = f.guardT <= PARRY_WINDOW;
      g.fillStyle(0x7df9ff, parry ? 0.55 : 0.22).fillEllipse(
        f.x + f.facing * 14,
        GROUND_Y - 110,
        150,
        230,
      );
      g.lineStyle(parry ? 8 : 4, 0xffffff, parry ? 1 : 0.6).strokeEllipse(
        f.x + f.facing * 14,
        GROUND_Y - 110,
        150,
        230,
      );
    }
    // Buff aura (Coração).
    for (const f of this.sim.fighters)
      if (f.buff > 0)
        g.lineStyle(5, 0xff6b9d, 0.5 + 0.3 * Math.sin(this.time.now / 120)).strokeEllipse(
          f.x,
          GROUND_Y - 100,
          130,
          220,
        );
  }

  private lightningBolt(x: number): void {
    const g = this.add.graphics().setDepth(19);
    const pts: Phaser.Types.Math.Vector2Like[] = [{ x, y: 300 }];
    for (let y = 300; y < GROUND_Y; y += 70)
      pts.push({ x: x + Phaser.Math.Between(-30, 30), y: y + 70 });
    pts[pts.length - 1] = { x, y: GROUND_Y };
    g.lineStyle(18, 0xfff3b0, 0.5).strokePoints(pts);
    g.lineStyle(7, 0xffffff).strokePoints(pts);
    this.cameras.main.flash(120, 255, 255, 220);
    this.cameras.main.shake(200, 0.01);
    this.spark(x, GROUND_Y - 10, 0xffd23f, 20);
    this.tweens.add({ targets: g, alpha: 0, duration: 380, onComplete: () => g.destroy() });
  }

  private quakeRing(x: number): void {
    const ring = this.add
      .ellipse(x, GROUND_Y + 6, 60, 20)
      .setStrokeStyle(10, 0x8d6e63)
      .setDepth(6);
    this.tweens.add({
      targets: ring,
      scaleX: 7,
      scaleY: 3,
      alpha: 0,
      duration: 420,
      onComplete: () => ring.destroy(),
    });
    this.spark(x, GROUND_Y - 6, 0x8d6e63, 22);
  }

  private callout(x: number, text: string, color: string): void {
    const t = addText(this, Phaser.Math.Clamp(x, 160, GAME_WIDTH - 160), GROUND_Y - 330, text, 38, {
      color,
      stroke: '#0b1430',
      strokeThickness: 10,
    })
      .setDepth(26)
      .setScale(0.5);
    this.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: t,
      alpha: 0,
      y: t.y - 50,
      delay: 600,
      duration: 400,
      onComplete: () => t.destroy(),
    });
  }

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
    this.damageNumberText(x, y, `-${dmg}`, good ? '#ffd23f' : '#ff5d5d');
  }

  private damageNumberText(x: number, y: number, text: string, color: string): void {
    const t = addText(this, x, y, text, 34, {
      color,
      stroke: '#0b1430',
      strokeThickness: 6,
    }).setDepth(25);
    this.tweens.add({
      targets: t,
      y: y - 70,
      alpha: 0,
      duration: 750,
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
    const { level, pRounds, rRounds } = this.data0;
    const round = pRounds + rRounds + 1;
    const vs = this.bigText(`RODADA ${round}`, '#ffffff', 76);
    const name = addText(this, GAME_WIDTH / 2, 620, `vs ${KIDS[this.rivalKid]!.name}`, 40, {
      color: '#ffd23f',
      stroke: '#0b1430',
      strokeThickness: 8,
    }).setDepth(50);
    sfx.play('click');
    if (level === 1 && round === 1) {
      const p = POWERS[this.me]!;
      const help = addText(
        this,
        GAME_WIDTH / 2,
        390,
        `Toque ATAQUE 3x para o combo\nAperte DEFESA bem na hora do golpe = DEFESA PERFEITA\n${p.name}: ${p.hint}\nSeu poder volta rápido!`,
        24,
        { color: COLORS.textLight, stroke: '#0b1430', strokeThickness: 6 },
      ).setDepth(50);
      this.time.delayedCall(3600, () => help.destroy());
    }
    this.time.delayedCall(level === 1 && round === 1 ? 1500 : 1000, () => {
      vs.destroy();
      name.destroy();
      const go = this.bigText('LUTE!', '#ff5d5d');
      sfx.play('start');
      this.running = true;
      this.time.delayedCall(600, () => go.destroy());
    });
  }

  private endRound(winner: 0 | 1 | null, ko: boolean): void {
    if (this.finished) return;
    this.finished = true;
    this.running = false;
    const { sfx } = getServices(this);
    const d = this.data0;
    const player = this.sim.fighters[0];
    const next: TurmaData = { ...d, kid: this.me };

    if (winner === 0) {
      const perfect = player.taken === 0;
      if (perfect) d.perfects++;
      const bonus = roundBonus({
        level: d.level,
        hpLeft: player.hp,
        maxHp: player.setup.maxHp,
        timeLeft: this.sim.time,
        perfect,
      });
      d.score += bonus;
      next.score = d.score;
      next.perfects = d.perfects;
      next.maxCombo = d.maxCombo;
      next.pRounds = d.pRounds + 1;
      sfx.play('win');
      this.bigText(ko ? 'K.O.!' : 'TEMPO!');
      this.time.delayedCall(900, () => {
        this.bigText(perfect ? 'PERFEITO!' : 'RODADA SUA!', perfect ? '#7df9ff' : '#5bd46f', 72);
        const b = addText(this, GAME_WIDTH / 2, 640, `+${formatNumber(bonus)}`, 44, {
          color: '#ffd23f',
          stroke: '#0b1430',
          strokeThickness: 8,
        }).setDepth(50);
        this.tweens.add({ targets: b, y: 610, duration: 400 });
      });
      if (next.pRounds! >= 2) {
        d.score += FIGHT_BONUS(d.level);
        next.score = d.score;
        this.time.delayedCall(2300, () => this.pickUpgrade(next));
      } else this.time.delayedCall(2300, () => this.scene.restart(next));
      return;
    }

    sfx.play('hit');
    next.maxCombo = d.maxCombo;
    next.score = d.score;
    if (winner === 1) next.rRounds = d.rRounds + 1;
    this.bigText(winner === null ? 'EMPATE' : ko ? 'K.O.' : 'TEMPO!', '#ff5d5d');
    if ((next.rRounds ?? 0) >= 2) {
      const wins = d.level - 1;
      const data: GameOverData = {
        gameId: 'turma',
        title: wins === 0 ? 'Você apanhou!' : `${wins} ${wins === 1 ? 'vitória' : 'vitórias'}!`,
        lines: [
          `Derrotado por ${KIDS[this.rivalKid]!.name}`,
          `Maior combo: ${d.maxCombo} ${d.maxCombo === 1 ? 'hit' : 'hits'}`,
        ],
        record: { score: d.score, details: { wins, maxCombo: d.maxCombo, perfects: d.perfects } },
        parent: SceneKeys.Turma,
        retry: { scene: SceneKeys.Turma, data: { kid: this.me } },
      };
      this.time.delayedCall(1600, () => this.scene.launch(SceneKeys.GameOver, data));
      return;
    }
    this.time.delayedCall(1800, () => this.scene.restart(next));
  }

  /** After a won fight: pick one of three permanent boosts. */
  private pickUpgrade(next: TurmaData): void {
    const layer: Phaser.GameObjects.GameObject[] = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      layer.push(o);
      return o;
    };
    add(
      this.add
        .rectangle(0, 0, GAME_WIDTH, 1280, 0x1d2b53, 0.9)
        .setOrigin(0)
        .setDepth(60)
        .setInteractive(),
    );
    add(
      addText(this, GAME_WIDTH / 2, 170, 'Luta vencida!', 54, {
        color: '#5bd46f',
        stroke: '#1d2b53',
        strokeThickness: 10,
      }).setDepth(61),
    );
    add(
      addText(this, GAME_WIDTH / 2, 250, 'Escolha um reforço', 34, { color: '#ffd23f' }).setDepth(
        61,
      ),
    );
    offerUpgrades(Math.random).forEach((u: Upgrade, i) => {
      const y = 430 + i * 240;
      const card = add(this.add.graphics().setDepth(61));
      card.fillStyle(0xffffff).fillRoundedRect(60, y - 100, 600, 200, 28);
      add(addText(this, 160, y, u.emoji, 72).setDepth(62));
      add(addText(this, 390, y - 36, u.name, 36, { color: COLORS.text }).setDepth(62));
      add(
        addText(this, 390, y + 24, u.desc, 24, { color: '#5b6b8c', wrapWidth: 400 }).setDepth(62),
      );
      add(
        this.add
          .zone(360, y, 600, 200)
          .setInteractive({ useHandCursor: true })
          .setDepth(63)
          .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
            getServices(this).sfx.play('pop');
            for (const o of layer) o.destroy();
            this.scene.restart({
              ...next,
              mods: u.apply(this.data0.mods),
              level: this.data0.level + 1,
              pRounds: 0,
              rRounds: 0,
            } satisfies TurmaData);
          }),
      );
    });
  }

  private chooseKid(): void {
    const layer: Phaser.GameObjects.GameObject[] = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      layer.push(o);
      return o;
    };
    add(
      this.add
        .rectangle(0, 0, GAME_WIDTH, 1280, 0x1d2b53, 0.88)
        .setOrigin(0)
        .setDepth(60)
        .setInteractive(),
    );
    add(
      addText(this, GAME_WIDTH / 2, 150, 'Escolha seu lutador', 46, {
        color: '#ffd23f',
        stroke: '#1d2b53',
        strokeThickness: 10,
      }).setDepth(61),
    );
    KIDS.forEach((kid, i) => {
      const row = Math.floor(i / 3);
      const perRow = row < 2 ? 3 : 1;
      const col = i % 3;
      const x = GAME_WIDTH / 2 + (col - (perRow - 1) / 2) * 220;
      const y = 360 + row * 300;
      const card = add(this.add.graphics().setDepth(61));
      card.fillStyle(0xffffff).fillRoundedRect(x - 100, y - 125, 200, 270, 24);
      const img = add(
        this.add
          .image(x, y - 30, kidKey(i, 0))
          .setScale(1.25)
          .setDepth(62),
      );
      this.tweens.add({
        targets: img,
        y: y - 38,
        duration: 500 + i * 70,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      add(addText(this, x, y + 70, kid.name, 30, { color: COLORS.text }).setDepth(62));
      add(
        addText(this, x, y + 108, `⚡ ${POWERS[i]!.name}`, 22, { color: '#7209b7' }).setDepth(62),
      );
      add(
        this.add
          .zone(x, y, 200, 270)
          .setInteractive({ useHandCursor: true })
          .setDepth(63)
          .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
            getServices(this).sfx.play('pop');
            for (const o of layer) o.destroy();
            this.scene.restart({ kid: i } satisfies TurmaData);
          }),
      );
    });
  }
}
