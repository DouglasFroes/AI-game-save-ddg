import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import { enemyKey, FT, playerKey, skillIcon } from '../art';
import { audio } from '../audio';
import {
  ARENA,
  BOSSES,
  CHARACTERS,
  FUSIONS,
  MAX_SKILLS,
  PASSIVES,
  RARITY_INFO,
  SKILLS,
  type BossKind,
  type CharacterId,
  type FusionId,
  type ModifierId,
  type SkillId,
} from '../core/defs';
import { metaBonuses } from '../core/meta';
import { eligibleFusions, type Offer } from '../core/progression';
import { RunSim } from '../core/run';
import type { SimEvent } from '../core/types';
import { getSave, QUALITY, setSave } from '../state';
import { clock, css, neonButton, neonPanel, txt, UI } from '../ui';

export interface RunData {
  character?: CharacterId;
  seed?: number;
  daily?: boolean;
  modifiers?: ModifierId[];
}

interface Chain {
  pts: number[];
  color: number;
  ttl: number;
}

/**
 * Pins an overlay to the screen, children included. A container with scrollFactor 0 still lets
 * its children hit-test in world space, so with the camera following the ship their touch areas
 * drifted away from where the cards and buttons are drawn.
 */
function pin(o: Phaser.GameObjects.GameObject): void {
  (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor?.(0);
  if (o instanceof Phaser.GameObjects.Container) o.list.forEach(pin);
}

const HUD_DEPTH = 100;
const OVERLAY_DEPTH = 200;
const STICK_R = 90;
const PAUSE_BTN = { x: GAME_WIDTH - 56, y: 62, r: 36 };

/** The game itself: draws the simulation, reads input, shows the HUD and the overlays. */
export class FusaoRunScene extends Phaser.Scene {
  private sim!: RunSim;
  private data_!: Required<Pick<RunData, 'character' | 'seed'>> & RunData;
  private particleScale = 1;
  private paused = false;
  private ending = false;
  private slowmo = 0;
  private hudTimer = 0;
  private lastX = 0;
  private lastY = 0;

  private stars!: Phaser.GameObjects.TileSprite;
  private playerImg!: Phaser.GameObjects.Image;
  private playerGlow!: Phaser.GameObjects.Image;
  private pools = new Map<string, Phaser.GameObjects.Image[]>();
  private aura!: Phaser.GameObjects.Graphics;
  private hazardG!: Phaser.GameObjects.Graphics;
  private chainG!: Phaser.GameObjects.Graphics;
  private chains: Chain[] = [];
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private numbers: Phaser.GameObjects.Text[] = [];

  private stick: { id: number; ox: number; oy: number; x: number; y: number } | null = null;
  private stickG!: Phaser.GameObjects.Graphics;
  private keys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key[]>;

  private hud!: {
    bars: Phaser.GameObjects.Graphics;
    level: Phaser.GameObjects.Text;
    time: Phaser.GameObjects.Text;
    kills: Phaser.GameObjects.Text;
    hp: Phaser.GameObjects.Text;
    missions: Phaser.GameObjects.Text[];
    boss: Phaser.GameObjects.Text;
    icons: Phaser.GameObjects.Image[];
    pips: Phaser.GameObjects.Graphics;
    fusion: Phaser.GameObjects.Text;
    vignette: Phaser.GameObjects.Rectangle;
  };
  private overlay: Phaser.GameObjects.Container | null = null;

  constructor() {
    super(SceneKeys.FusaoRun);
  }

  init(data: RunData): void {
    const save = getSave();
    this.data_ = {
      ...data,
      character: data.character ?? save.selected,
      seed: data.seed ?? Math.floor(Math.random() * 2 ** 31),
    };
    const q = QUALITY[save.settings.quality];
    this.particleScale = q.particles * (save.settings.intenseFx ? 1 : 0.5);
    this.sim = new RunSim({
      character: this.data_.character,
      seed: this.data_.seed,
      meta: metaBonuses(save),
      modifiers: data.modifiers ?? [],
      maxEnemies: q.enemies,
      daily: data.daily,
    });
    this.paused = false;
    this.ending = false;
    this.slowmo = 0;
    this.hudTimer = 0;
    this.pools = new Map();
    this.chains = [];
    this.numbers = [];
    this.stick = null;
    this.overlay = null;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(UI.bg).setBounds(0, 0, ARENA.w, ARENA.h);
    this.stars = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, FT.stars)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-10);
    this.add.tileSprite(0, 0, ARENA.w, ARENA.h, FT.grid).setOrigin(0).setDepth(-9);
    const border = this.add.graphics().setDepth(-8);
    border.lineStyle(14, 0xff3df2, 0.15).strokeRect(0, 0, ARENA.w, ARENA.h);
    border.lineStyle(4, 0xff3df2, 0.8).strokeRect(0, 0, ARENA.w, ARENA.h);

    this.aura = this.add.graphics().setDepth(1);
    this.hazardG = this.add.graphics().setDepth(2);
    const c = CHARACTERS[this.data_.character];
    this.playerGlow = this.add
      .image(0, 0, FT.glow)
      .setTint(c.color)
      .setScale(1.3)
      .setAlpha(0.55)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(9);
    this.playerImg = this.add.image(0, 0, playerKey(this.data_.character)).setDepth(10);
    this.chainG = this.add.graphics().setDepth(12).setBlendMode(Phaser.BlendModes.ADD);
    this.sparks = this.add.particles(0, 0, FT.dot, {
      speed: { min: 60, max: 320 },
      lifespan: { min: 180, max: 480 },
      scale: { start: 0.7, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    this.sparks.setDepth(13);

    this.buildHud();
    this.bindInput();
    this.cameras.main.centerOn(this.sim.player.x, this.sim.player.y);

    // Losing focus (tab hidden, app switched) pauses the run. Listeners are removed on shutdown
    // so restarts never stack them.
    const autoPause = () => {
      if (!this.ending && !this.sim.choosing) this.openPause();
    };
    this.game.events.on(Phaser.Core.Events.BLUR, autoPause);
    this.game.events.on(Phaser.Core.Events.HIDDEN, autoPause);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, autoPause);
      this.game.events.off(Phaser.Core.Events.HIDDEN, autoPause);
    });

    this.banner(
      CHARACTERS[this.data_.character].name.toUpperCase(),
      'Sobreviva. Evolua. Funda.',
      c.color,
    );
    if (import.meta.env.DEV) (window as unknown as { __fusao?: FusaoRunScene }).__fusao = this;
  }

  // ── Input ──────────────────────────────────────────────────────────────

  private bindInput(): void {
    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    const keys = (...codes: number[]) => codes.map((k) => kb.addKey(k));
    this.keys = {
      up: keys(K.W, K.UP),
      down: keys(K.S, K.DOWN),
      left: keys(K.A, K.LEFT),
      right: keys(K.D, K.RIGHT),
    };
    kb.on('keydown-ESC', () =>
      this.overlay && this.paused ? this.closePause() : this.openPause(),
    );
    kb.on('keydown', () => audio.unlock());

    this.stickG = this.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 5);
    this.input.addPointer(2);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      audio.unlock();
      if (this.overlay) return;
      if (Phaser.Math.Distance.Between(p.x, p.y, PAUSE_BTN.x, PAUSE_BTN.y) < PAUSE_BTN.r + 14) {
        this.openPause();
        return;
      }
      // Floating joystick: wherever the finger lands.
      if (!this.stick) this.stick = { id: p.id, ox: p.x, oy: p.y, x: p.x, y: p.y };
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.stick?.id === p.id) {
        this.stick.x = p.x;
        this.stick.y = p.y;
      }
    });
    const up = (p: Phaser.Input.Pointer) => {
      if (this.stick?.id === p.id) this.stick = null;
    };
    this.input.on(Phaser.Input.Events.POINTER_UP, up);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, up);
  }

  private readMove(): { x: number; y: number } {
    const held = (k: Phaser.Input.Keyboard.Key[]) => k.some((key) => key.isDown);
    const kx = (held(this.keys.right) ? 1 : 0) - (held(this.keys.left) ? 1 : 0);
    const ky = (held(this.keys.down) ? 1 : 0) - (held(this.keys.up) ? 1 : 0);
    if (kx || ky) return { x: kx, y: ky };
    const s = this.stick;
    if (!s) return { x: 0, y: 0 };
    const dx = s.x - s.ox;
    const dy = s.y - s.oy;
    const d = Math.hypot(dx, dy);
    if (d < 10) return { x: 0, y: 0 };
    const k = Math.min(1, d / STICK_R) / d;
    return { x: dx * k, y: dy * k };
  }

  private drawStick(): void {
    const g = this.stickG.clear();
    const s = this.stick;
    if (!s || this.overlay) return;
    g.lineStyle(3, UI.accent, 0.5).strokeCircle(s.ox, s.oy, STICK_R);
    g.fillStyle(UI.accent, 0.08).fillCircle(s.ox, s.oy, STICK_R);
    const dx = s.x - s.ox;
    const dy = s.y - s.oy;
    const d = Math.hypot(dx, dy);
    const k = d > STICK_R ? STICK_R / d : 1;
    g.fillStyle(0xffffff, 0.75).fillCircle(s.ox + dx * k, s.oy + dy * k, 34);
  }

  // ── Loop ───────────────────────────────────────────────────────────────

  override update(_t: number, deltaMs: number): void {
    let dt = Math.min(deltaMs / 1000, 1 / 20);
    if (this.slowmo > 0) {
      this.slowmo -= dt;
      dt *= 0.3;
    }
    if (!this.paused && !this.sim.choosing && !this.sim.over) {
      // Fixed sub-steps keep the simulation stable on slow frames.
      const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
      const move = this.readMove();
      for (let i = 0; i < steps && !this.sim.choosing && !this.sim.over; i++)
        for (const e of this.sim.step(dt / steps, move)) this.onEvent(e);
    }
    if (this.sim.choosing && !this.overlay) this.showOffers();
    this.render(dt);
    this.drawStick();
    this.hudTimer -= deltaMs;
    if (this.hudTimer <= 0) {
      this.hudTimer = 100;
      this.updateHud();
    }
    this.drawBars();
  }

  // ── Rendering ──────────────────────────────────────────────────────────

  private pool(key: string, i: number, texture: string, depth: number): Phaser.GameObjects.Image {
    let list = this.pools.get(key);
    if (!list) this.pools.set(key, (list = []));
    let img = list[i];
    if (!img) {
      img = this.add.image(0, 0, texture).setDepth(depth);
      list.push(img);
    }
    if (img.texture.key !== texture) img.setTexture(texture);
    return img.setVisible(true);
  }

  private hideFrom(key: string, used: number): void {
    const list = this.pools.get(key);
    if (list) for (let i = used; i < list.length; i++) list[i]!.setVisible(false);
  }

  private render(dt: number): void {
    const sim = this.sim;
    const p = sim.player;
    const cam = this.cameras.main;
    cam.centerOn(p.x, p.y);
    this.stars.setTilePosition(cam.scrollX * 0.25, cam.scrollY * 0.25);
    const view = cam.worldView;
    const inView = (x: number, y: number, m = 80) =>
      x > view.x - m && x < view.right + m && y > view.y - m && y < view.bottom + m;
    const t = this.time.now / 1000;

    // Player.
    const blink = p.iframes > 0 && Math.floor(t * 20) % 2 === 0;
    const heading = Math.atan2(p.facingY, p.facingX) + Math.PI / 2;
    const turn = Phaser.Math.Angle.Wrap(heading - this.playerImg.rotation);
    this.playerImg
      .setPosition(p.x, p.y)
      .setAlpha(blink ? 0.45 : 1)
      .setRotation(this.playerImg.rotation + turn * Math.min(1, dt * 14))
      .setScale(1 + Math.sin(t * 6) * 0.03);
    const moved = Math.hypot(p.x - this.lastX, p.y - this.lastY) > 0.5;
    this.lastX = p.x;
    this.lastY = p.y;
    if (moved && Math.random() < 0.8 * this.particleScale) {
      // Engine flame out of the tail.
      const back = this.playerImg.rotation + Math.PI / 2;
      this.sparks.setParticleTint(CHARACTERS[this.data_.character].color);
      this.sparks.emitParticleAt(p.x + Math.cos(back) * 26, p.y + Math.sin(back) * 26, 1);
    }
    this.playerGlow.setPosition(p.x, p.y).setScale(p.pulse > 0 ? 1.9 : 1.3);
    if (p.pulse > 0 && Math.random() < 0.6 * this.particleScale) {
      this.sparks.setParticleTint(0xffd23f);
      this.sparks.emitParticleAt(p.x, p.y, 1);
    }

    // Enemies.
    let n = 0;
    for (const e of sim.enemies) {
      if (!inView(e.x, e.y, e.radius + 40)) continue;
      const img = this.pool('enemy', n++, enemyKey(e.kind), e.boss ? 8 : 6);
      img.setPosition(e.x, e.y);
      if (e.boss) {
        img
          .setScale(e.entering > 0 ? 1.6 - e.entering * 0.5 : 1)
          .setAlpha(e.entering > 0 ? 1 - e.entering / 1.8 : 1);
        img.setRotation(e.kind === 'tecela' ? t * 0.6 : e.kind === 'eclipse' ? -t * 0.3 : 0);
      } else {
        img
          .setAlpha(1)
          .setScale(e.kind === 'explosivo' && e.state === 'fuse' ? 1 + Math.sin(t * 40) * 0.15 : 1);
        img.setRotation(
          e.kind === 'perseguidor' || e.kind === 'corredor'
            ? Math.atan2(p.y - e.y, p.x - e.x) + Math.PI / 2
            : t,
        );
      }
      if (e.flash > 0) img.setTintFill(0xffffff);
      else if (e.burn > 0) img.setTint(0xffb36b);
      else if (e.slow > 0) img.setTint(0x9ba8ff);
      else img.clearTint();
    }
    this.hideFrom('enemy', n);

    // Player projectiles.
    n = 0;
    for (const pr of sim.projectiles) {
      if (!inView(pr.x, pr.y)) continue;
      const tex =
        pr.kind === 'faisca'
          ? FT.spark
          : pr.kind === 'orbe'
            ? FT.orb
            : pr.kind === 'plasma'
              ? FT.plasma
              : FT.droneShot;
      const img = this.pool('proj', n++, tex, 7)
        .setPosition(pr.x, pr.y)
        .setBlendMode(Phaser.BlendModes.ADD);
      img.setRotation(Math.atan2(pr.vy, pr.vx));
      img.setTint(pr.kind === 'faisca' ? 0x9be7ff : 0xffffff);
      img.setScale(pr.kind === 'plasma' ? 1 + Math.sin(t * 18) * 0.15 : 1);
    }
    this.hideFrom('proj', n);

    // Enemy bullets.
    n = 0;
    for (const b of sim.bullets)
      if (inView(b.x, b.y)) this.pool('bullet', n++, FT.bullet, 11).setPosition(b.x, b.y);
    this.hideFrom('bullet', n);

    // Pickups.
    n = 0;
    for (const g of sim.gems) {
      if (!inView(g.x, g.y)) continue;
      const tex =
        g.kind === 'xp'
          ? g.value >= 5
            ? FT.gemBig
            : FT.gem
          : g.kind === 'heal'
            ? FT.heal
            : g.kind === 'magnet'
              ? FT.magnet
              : FT.chest;
      this.pool('gem', n++, tex, 4)
        .setPosition(g.x, g.y + (g.kind === 'chest' ? Math.sin(t * 4) * 6 : 0))
        .setRotation(g.kind === 'xp' ? t * 2 : 0);
    }
    this.hideFrom('gem', n);

    // Orbiting blades and drones.
    let blades = 0;
    let drones = 0;
    const a = this.aura.clear();
    for (const s of sim.skills) {
      if (s.id === 'laminas' || s.id === 'vortice')
        for (let i = 0; i < s.points.length; i += 2)
          this.pool('blade', blades++, FT.blade, 9)
            .setPosition(s.points[i]!, s.points[i + 1]!)
            .setRotation(t * 12)
            .setTint(s.id === 'vortice' ? 0xa0c4ff : 0xffffff);
      if (s.id === 'drones' || s.id === 'enxame') {
        for (let i = 0; i < s.points.length; i += 2)
          this.pool('drone', drones++, FT.drone, 9)
            .setPosition(s.points[i]!, s.points[i + 1]!)
            .setRotation(t * 3 + i);
        if (s.id === 'enxame') {
          // Electric tethers between drones.
          a.lineStyle(3, FUSIONS.enxame.color, 0.7);
          const k = s.points.length / 2;
          for (let i = 0; i < k; i++)
            a.lineBetween(
              s.points[i * 2]!,
              s.points[i * 2 + 1]!,
              s.points[((i + 1) % k) * 2]!,
              s.points[((i + 1) % k) * 2 + 1]!,
            );
        }
      }
      if (s.id === 'gravidade') {
        const r = SKILLS.gravidade.levels[s.level - 1]!.area * p.areaMult;
        a.fillStyle(0x7b6cff, 0.07).fillCircle(p.x, p.y, r);
        a.lineStyle(2, 0x7b6cff, 0.5).strokeCircle(p.x, p.y, r);
      }
      if (s.id === 'vortice') {
        const r = FUSIONS.vortice.stats.duration * p.areaMult;
        a.lineStyle(3, 0xa0c4ff, 0.35);
        for (let i = 0; i < 4; i++)
          a.beginPath()
            .arc(p.x, p.y, r * (0.4 + i * 0.18), t * 2 + i, t * 2 + i + 2.2)
            .strokePath();
      }
    }
    this.hideFrom('blade', blades);
    this.hideFrom('drone', drones);
    if (p.shield > 0 && p.shieldMax > 0) {
      const k = p.shield / p.shieldMax;
      a.lineStyle(4, 0x5bd46f, 0.35 + 0.5 * k).strokeCircle(p.x, p.y, 34);
      a.fillStyle(0x5bd46f, 0.08 * k).fillCircle(p.x, p.y, 34);
    }
    // Zones: rifts and the collapsing star.
    for (const z of sim.zones) {
      const k = z.t / z.ttl;
      if (z.kind === 'rift') {
        a.lineStyle(3, FUSIONS.dimensional.color, 0.8).strokeEllipse(
          z.x,
          z.y,
          30 + k * 20,
          70 + k * 30,
        );
      } else {
        a.fillStyle(FUSIONS.colapso.color, 0.25 + k * 0.5).fillCircle(z.x, z.y, 20 + k * 20);
        a.lineStyle(2, FUSIONS.colapso.color, 0.6);
        for (let i = 0; i < 10; i++) {
          const ang = (i / 10) * Math.PI * 2 + t * 4;
          const r0 = z.r * (1 - k);
          a.lineBetween(
            z.x + Math.cos(ang) * r0,
            z.y + Math.sin(ang) * r0,
            z.x + Math.cos(ang) * (r0 - 30),
            z.y + Math.sin(ang) * (r0 - 30),
          );
        }
      }
    }

    // Boss telegraphs: dim while warning, bright when they hurt.
    const h = this.hazardG.clear();
    for (const hz of sim.hazards) {
      const warn = hz.warn > 0;
      const flash = warn ? 0.25 + 0.25 * Math.abs(Math.sin(t * 14)) : 0.85;
      if (hz.kind === 'line' || hz.kind === 'beam') {
        const ex = hz.x + Math.cos(hz.angle) * hz.length;
        const ey = hz.y + Math.sin(hz.angle) * hz.length;
        h.lineStyle(
          warn ? hz.width : hz.width,
          hz.kind === 'beam' ? 0xffb703 : 0xff4d6d,
          warn ? flash * 0.5 : 0.35,
        ).lineBetween(hz.x, hz.y, ex, ey);
        if (!warn) h.lineStyle(hz.width * 0.35, 0xffffff, flash).lineBetween(hz.x, hz.y, ex, ey);
        else h.lineStyle(2, 0xffffff, flash).lineBetween(hz.x, hz.y, ex, ey);
      } else if (hz.radius > 0) {
        h.lineStyle(hz.width, 0xffb703, warn ? flash : 0.75).strokeCircle(hz.x, hz.y, hz.radius);
      }
    }

    // Chain lightning: short-lived jagged lines.
    const cg = this.chainG.clear();
    for (let i = this.chains.length - 1; i >= 0; i--) {
      const ch = this.chains[i]!;
      ch.ttl -= dt;
      if (ch.ttl <= 0) {
        this.chains.splice(i, 1);
        continue;
      }
      cg.lineStyle(3, ch.color, Math.min(1, ch.ttl * 8));
      for (let j = 0; j + 3 < ch.pts.length; j += 2) {
        const x0 = ch.pts[j]!;
        const y0 = ch.pts[j + 1]!;
        const x1 = ch.pts[j + 2]!;
        const y1 = ch.pts[j + 3]!;
        const mx = (x0 + x1) / 2 + (Math.random() - 0.5) * 22;
        const my = (y0 + y1) / 2 + (Math.random() - 0.5) * 22;
        cg.lineBetween(x0, y0, mx, my).lineBetween(mx, my, x1, y1);
      }
    }
  }

  // ── Events → feedback ──────────────────────────────────────────────────

  private burst(x: number, y: number, color: number, count: number): void {
    const n = Math.round(count * this.particleScale);
    if (n <= 0) return;
    this.sparks.setParticleTint(color);
    this.sparks.explode(n, x, y);
  }

  private ringFx(x: number, y: number, r: number, color: number): void {
    const img = this.add
      .image(x, y, FT.ring)
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(11)
      .setScale(0.1);
    this.tweens.add({
      targets: img,
      scale: r / 120,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.easeOut',
      onComplete: () => img.destroy(),
    });
  }

  private shake(ms: number, power: number): void {
    if (getSave().settings.shake) this.cameras.main.shake(ms, power);
  }

  private number(x: number, y: number, amount: number, big: boolean): void {
    if (!getSave().settings.intenseFx || this.numbers.length > 14) return;
    const t = txt(
      this,
      x,
      y - 10,
      String(Math.round(amount)),
      big ? 30 : 22,
      big ? UI.gold : '#ffffff',
    ).setDepth(14);
    this.numbers.push(t);
    this.tweens.add({
      targets: t,
      y: y - 60,
      alpha: 0,
      duration: 520,
      onComplete: () => {
        t.destroy();
        this.numbers.splice(this.numbers.indexOf(t), 1);
      },
    });
  }

  private onEvent(e: SimEvent): void {
    switch (e.type) {
      case 'shot':
        audio.play('shot');
        break;
      case 'hit':
        if (Math.random() < 0.35) this.burst(e.x, e.y, 0xffffff, 2);
        if (e.big || Math.random() < 0.25) this.number(e.x, e.y, e.amount, e.big);
        audio.play('hit');
        break;
      case 'kill':
        this.burst(e.x, e.y, e.color, 9);
        audio.play('kill');
        break;
      case 'explosion':
        this.ringFx(e.x, e.y, e.r, e.color);
        this.burst(e.x, e.y, e.color, 18);
        this.shake(90, 0.004);
        audio.play('explosion');
        break;
      case 'ring':
        this.ringFx(e.x, e.y, e.r, e.color);
        break;
      case 'chain':
        this.chains.push({ pts: e.points, color: e.color, ttl: 0.14 });
        break;
      case 'pickup':
        audio.play('pickup');
        break;
      case 'levelup':
        audio.play('levelup');
        this.burst(this.sim.player.x, this.sim.player.y, 0x4cc9f0, 30);
        break;
      case 'fusion':
        this.fusionShow(e.fusion);
        break;
      case 'hurt':
        audio.play('hurt');
        this.shake(140, 0.008);
        this.hud.vignette.setAlpha(0.45);
        this.tweens.add({ targets: this.hud.vignette, alpha: 0, duration: 300 });
        break;
      case 'shield':
        if (e.broke) this.ringFx(this.sim.player.x, this.sim.player.y, 60, 0x5bd46f);
        break;
      case 'boss':
        audio.play('boss');
        this.banner(
          `ALERTA: ${BOSSES[e.kind].name.toUpperCase()}`,
          BOSSES[e.kind].title,
          BOSSES[e.kind].color,
        );
        this.shake(600, 0.006);
        break;
      case 'bossPhase':
        this.banner('FÚRIA!', `${BOSSES[e.kind].name} mudou de tática`, 0xff4d6d);
        this.cameras.main.flash(200, 255, 80, 80);
        break;
      case 'bossDown':
        this.slowmo = 1.1;
        this.burst(e.x, e.y, BOSSES[e.kind].color, 80);
        this.ringFx(e.x, e.y, 320, BOSSES[e.kind].color);
        this.shake(500, 0.012);
        audio.play('victory');
        this.banner('CHEFE DERROTADO!', 'Pegue o baú de recompensa', BOSSES[e.kind].color);
        break;
      case 'wave':
        this.toast('Uma onda se aproxima!');
        break;
      case 'mission':
        this.toast(`Missão completa: ${e.text}  +${e.reward} Essência`);
        audio.play('choose');
        break;
      case 'death':
        this.finish(false);
        break;
      case 'victory':
        this.finish(true);
        break;
      case 'pulse':
        break;
    }
  }

  // ── HUD ────────────────────────────────────────────────────────────────

  private buildHud(): void {
    const fixed = <
      T extends Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth,
    >(
      o: T,
    ) => o.setScrollFactor(0).setDepth(HUD_DEPTH);
    const bars = fixed(this.add.graphics());
    const level = fixed(txt(this, 70, 98, 'NV 1', 30, UI.text));
    const time = fixed(txt(this, GAME_WIDTH / 2 + 90, 58, '0:00', 44, '#ffffff'));
    const kills = fixed(txt(this, GAME_WIDTH / 2 + 90, 100, '0 abates', 22, UI.muted, 'normal'));
    const hp = fixed(txt(this, 170, 52, '', 18, '#ffffff'));
    const missions = [0, 1, 2].map((i) =>
      fixed(txt(this, 26, 140 + i * 28, '', 19, UI.muted, 'normal').setOrigin(0, 0.5)),
    );
    const boss = fixed(txt(this, GAME_WIDTH / 2, 248, '', 24, '#ffffff'));
    const icons = Array.from({ length: MAX_SKILLS }, (_, i) =>
      fixed(
        this.add
          .image(62 + i * 82, GAME_HEIGHT - 70, skillIcon('faisca'))
          .setScale(0.95)
          .setVisible(false),
      ),
    );
    const pips = fixed(this.add.graphics());
    const fusion = fixed(
      txt(
        this,
        GAME_WIDTH / 2,
        GAME_HEIGHT - 135,
        'FUSÃO DISPONÍVEL NO PRÓXIMO NÍVEL',
        22,
        UI.gold,
      ).setVisible(false),
    );
    const vignette = fixed(
      this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xff0033, 1).setOrigin(0).setAlpha(0),
    );
    // Pause button.
    const pause = fixed(this.add.graphics());
    pause.fillStyle(UI.panel, 0.85).fillCircle(PAUSE_BTN.x, PAUSE_BTN.y, PAUSE_BTN.r);
    pause.lineStyle(3, UI.accent).strokeCircle(PAUSE_BTN.x, PAUSE_BTN.y, PAUSE_BTN.r);
    pause
      .fillStyle(0xffffff)
      .fillRect(PAUSE_BTN.x - 11, PAUSE_BTN.y - 13, 7, 26)
      .fillRect(PAUSE_BTN.x + 4, PAUSE_BTN.y - 13, 7, 26);
    this.hud = { bars, level, time, kills, hp, missions, boss, icons, pips, fusion, vignette };
    this.updateHud();
  }

  /** Bars change every frame (cheap graphics); texts update ~10×/s. */
  private drawBars(): void {
    const sim = this.sim;
    const p = sim.player;
    const g = this.hud.bars.clear();
    // Experience across the top.
    g.fillStyle(0x10143a).fillRect(0, 0, GAME_WIDTH, 14);
    g.fillStyle(UI.accent).fillRect(0, 0, GAME_WIDTH * Math.min(1, p.xp / sim.xpNeeded), 14);
    // Health.
    const k = p.hp / p.maxHp;
    g.fillStyle(0x10143a, 0.9).fillRoundedRect(24, 38, 292, 28, 14);
    g.fillStyle(k > 0.35 ? 0x5bd46f : 0xff4d6d).fillRoundedRect(
      28,
      42,
      Math.max(10, 284 * k),
      20,
      10,
    );
    if (p.shield > 0 && p.shieldMax > 0)
      g.fillStyle(0x9bf6ff, 0.8).fillRoundedRect(28, 64, 284 * (p.shield / p.shieldMax), 5, 2);
    // Boss health.
    const b = sim.boss;
    if (b && b.entering <= 0) {
      g.fillStyle(0x10143a, 0.9).fillRoundedRect(50, 268, GAME_WIDTH - 100, 22, 11);
      g.fillStyle(BOSSES[b.kind as BossKind].color).fillRoundedRect(
        54,
        272,
        (GAME_WIDTH - 108) * Math.max(0, b.hp / b.maxHp),
        14,
        7,
      );
    }
  }

  private updateHud(): void {
    const sim = this.sim;
    const p = sim.player;
    this.hud.level.setText(`NV ${p.level}`);
    this.hud.time.setText(clock(sim.time));
    this.hud.kills.setText(`${sim.kills} abates`);
    this.hud.hp.setText(`${Math.ceil(p.hp)} / ${Math.round(p.maxHp)}`);
    sim.missions.forEach((m, i) => {
      const unit =
        m.kind === 'survive'
          ? `${clock(m.progress)}/${clock(m.target)}`
          : `${Math.floor(m.progress)}/${m.target}`;
      this.hud.missions[i]!.setText(
        `${m.done ? '✓' : '•'} ${m.text}  ${m.done ? '' : unit}`,
      ).setColor(m.done ? '#5bd46f' : UI.muted);
    });
    const b = sim.boss;
    this.hud.boss.setText(b && b.entering <= 0 ? BOSSES[b.kind as BossKind].name : '');
    const ready = eligibleFusions(sim.build);
    const parts = new Set(ready.flatMap((f) => FUSIONS[f].requires));
    const pg = this.hud.pips.clear();
    this.hud.icons.forEach((icon, i) => {
      const s = sim.skills[i];
      icon.setVisible(!!s);
      if (!s) return;
      icon.setTexture(skillIcon(s.id));
      icon.setScale(
        parts.has(s.id as SkillId) ? 0.95 + Math.sin(this.time.now / 120) * 0.06 : 0.95,
      );
      const x = 62 + i * 82;
      const y = GAME_HEIGHT - 26;
      if (s.fusion) pg.fillStyle(0xffd23f).fillRect(x - 26, y - 2, 52, 5);
      else
        for (let l = 0; l < 5; l++)
          pg.fillStyle(l < s.level ? 0xffffff : 0x2a3070).fillRect(x - 26 + l * 11, y - 2, 8, 5);
    });
    this.hud.fusion.setVisible(ready.length > 0);
  }

  private toast(text: string): void {
    const t = txt(this, GAME_WIDTH / 2, 360, text, 24, '#ffffff')
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 2)
      .setAlpha(0);
    this.tweens.add({
      targets: t,
      alpha: 1,
      y: 340,
      duration: 200,
      yoyo: true,
      hold: 1800,
      onComplete: () => t.destroy(),
    });
  }

  private banner(title: string, sub: string, color: number): void {
    const c = this.add
      .container(GAME_WIDTH / 2, 500)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 3);
    const g = this.add.graphics();
    g.fillStyle(0x05060f, 0.75).fillRect(-GAME_WIDTH / 2, -70, GAME_WIDTH, 140);
    g.lineStyle(3, color, 0.9)
      .lineBetween(-GAME_WIDTH / 2, -70, GAME_WIDTH / 2, -70)
      .lineBetween(-GAME_WIDTH / 2, 70, GAME_WIDTH / 2, 70);
    c.add([
      g,
      txt(this, 0, -18, title, title.length > 22 ? 34 : 46, css(color)),
      txt(this, 0, 34, sub, 24, UI.muted, 'normal'),
    ]);
    c.setAlpha(0).setScale(1, 0.2);
    this.tweens.add({ targets: c, alpha: 1, scaleY: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: c,
      alpha: 0,
      delay: 1900,
      duration: 400,
      onComplete: () => c.destroy(),
    });
  }

  // ── Level-up choice ────────────────────────────────────────────────────

  private offerText(o: Offer): {
    icon: string;
    name: string;
    tag: string;
    desc: string;
    color: number;
  } {
    const rarity = RARITY_INFO[o.rarity];
    switch (o.kind) {
      case 'new':
        return {
          icon: skillIcon(o.skill),
          name: SKILLS[o.skill].name,
          tag: `NOVA · ${rarity.name}`,
          desc: SKILLS[o.skill].desc,
          color: rarity.color,
        };
      case 'upgrade':
        return {
          icon: skillIcon(o.skill),
          name: SKILLS[o.skill].name,
          tag: `NÍVEL ${o.level - 1} → ${o.level} · ${rarity.name}`,
          desc: SKILLS[o.skill].upgrades[o.level] ?? '',
          color: rarity.color,
        };
      case 'passive':
        return {
          icon: FT.gemBig,
          name: PASSIVES[o.passive].name,
          tag: `MELHORIA ${o.level}/${PASSIVES[o.passive].maxLevel} · ${rarity.name}`,
          desc: PASSIVES[o.passive].desc,
          color: rarity.color,
        };
      case 'fusion': {
        const f = FUSIONS[o.fusion];
        const [a, b] = f.requires;
        return {
          icon: skillIcon(o.fusion),
          name: f.name,
          tag: `FUSÃO: ${SKILLS[a].name} + ${SKILLS[b].name}`,
          desc: f.desc,
          color: 0xffd23f,
        };
      }
      case 'heal':
        return {
          icon: FT.heal,
          name: 'Recarga Vital',
          tag: 'CURA',
          desc: 'Recupera 40% da vida máxima agora.',
          color: 0x5bd46f,
        };
      case 'essence':
        return {
          icon: FT.gemBig,
          name: 'Cristal de Essência',
          tag: 'RECURSO',
          desc: `+${o.amount} de Essência ao fim da partida.`,
          color: 0xc77dff,
        };
    }
  }

  private showOffers(): void {
    const offers = this.sim.offers!;
    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(OVERLAY_DEPTH);
    this.overlay = c;
    this.stick = null;
    c.add(
      this.add
        .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05060f, 0.82)
        .setOrigin(0)
        .setInteractive(),
    );
    const chest = this.sim.pendingChests > 0;
    c.add(
      txt(
        this,
        GAME_WIDTH / 2,
        200,
        chest ? 'RECOMPENSA DO CHEFE' : 'SUBIU DE NÍVEL!',
        52,
        chest ? UI.gold : '#ffffff',
      ),
    );
    c.add(
      txt(
        this,
        GAME_WIDTH / 2,
        260,
        'Escolha uma melhoria  (1, 2, 3 ou toque)',
        24,
        UI.muted,
        'normal',
      ),
    );
    let selected = 0;
    let armed = false;
    this.time.delayedCall(260, () => (armed = true));
    const frames: Phaser.GameObjects.Graphics[] = [];
    const pickIt = (i: number) => {
      if (!armed || this.overlay !== c) return;
      audio.play(offers[i]!.kind === 'fusion' ? 'fusion' : 'choose');
      c.destroy();
      this.overlay = null;
      for (const e of this.sim.choose(i)) this.onEvent(e);
      this.updateHud();
    };
    const draw = () =>
      offers.forEach((o, i) => {
        const info = this.offerText(o);
        const g = frames[i]!.clear();
        const on = i === selected;
        g.fillStyle(UI.panel, 0.98).fillRoundedRect(-310, -110, 620, 220, 24);
        g.lineStyle(on ? 10 : 6, info.color, on ? 0.35 : 0.15).strokeRoundedRect(
          -310,
          -110,
          620,
          220,
          24,
        );
        g.lineStyle(on ? 4 : 2, info.color, 1).strokeRoundedRect(-310, -110, 620, 220, 24);
      });
    offers.forEach((o, i) => {
      const info = this.offerText(o);
      const card = this.add.container(GAME_WIDTH / 2 + 700, 470 + i * 250);
      const frame = this.add.graphics();
      frames.push(frame);
      card.add([
        frame,
        this.add.image(-230, -6, info.icon).setScale(1.4),
        txt(this, 60, -62, info.name, info.name.length > 18 ? 32 : 38, '#ffffff').setOrigin(0.5),
        txt(this, 60, -18, info.tag, 20, css(info.color)),
        txt(this, 60, 40, info.desc, 24, UI.text, 'normal').setWordWrapWidth(400).setOrigin(0.5),
        txt(this, -280, -84, String(i + 1), 22, UI.muted),
      ]);
      if (o.kind === 'fusion')
        this.tweens.add({ targets: card, scale: 1.03, duration: 400, yoyo: true, repeat: -1 });
      card.setSize(620, 220).setInteractive({ useHandCursor: true });
      card.on('pointerover', () => {
        selected = i;
        draw();
      });
      card.on('pointerup', () => pickIt(i));
      c.add(card);
      this.tweens.add({
        targets: card,
        x: GAME_WIDTH / 2,
        duration: 320,
        delay: i * 90,
        ease: 'Back.easeOut',
      });
    });
    draw();
    const kb = this.input.keyboard!;
    const onKey = (ev: KeyboardEvent) => {
      if (this.overlay !== c) return kb.off('keydown', onKey);
      if (ev.key >= '1' && ev.key <= '3') pickIt(Number(ev.key) - 1);
      else if (ev.key === 'ArrowUp' || ev.key === 'w')
        selected = (selected + offers.length - 1) % offers.length;
      else if (ev.key === 'ArrowDown' || ev.key === 's') selected = (selected + 1) % offers.length;
      else if (ev.key === 'Enter' || ev.key === ' ') pickIt(selected);
      draw();
    };
    kb.on('keydown', onKey);
    c.once(Phaser.GameObjects.Events.DESTROY, () => kb.off('keydown', onKey));
    pin(c);
  }

  /** A fusion happened: a big reveal the first time it is ever discovered. */
  private fusionShow(id: FusionId): void {
    const save = getSave();
    const first = !save.fusions.includes(id);
    if (first) setSave({ ...save, fusions: [...save.fusions, id] });
    const f = FUSIONS[id];
    this.cameras.main.flash(300, 255, 230, 120);
    this.burst(this.sim.player.x, this.sim.player.y, f.color, 70);
    this.ringFx(this.sim.player.x, this.sim.player.y, 260, f.color);
    if (!first) {
      this.banner(f.name.toUpperCase(), 'Fusão ativada', f.color);
      return;
    }
    this.paused = true;
    const c = this.add
      .container(GAME_WIDTH / 2, GAME_HEIGHT / 2)
      .setScrollFactor(0)
      .setDepth(OVERLAY_DEPTH + 10);
    const g = this.add.graphics();
    g.fillStyle(0x05060f, 0.92).fillRect(
      -GAME_WIDTH / 2,
      -GAME_HEIGHT / 2,
      GAME_WIDTH,
      GAME_HEIGHT,
    );
    const icon = this.add.image(0, -200, skillIcon(id)).setScale(3);
    const rays = this.add
      .image(0, -200, FT.glow)
      .setTint(f.color)
      .setScale(5)
      .setBlendMode(Phaser.BlendModes.ADD);
    c.add([
      g,
      rays,
      icon,
      txt(
        this,
        0,
        -20,
        f.secret ? 'FUSÃO SECRETA DESCOBERTA!' : 'NOVA FUSÃO DESCOBERTA!',
        34,
        UI.gold,
      ),
      txt(this, 0, 40, f.name, 50, css(f.color)),
      txt(this, 0, 130, f.desc, 26, UI.text, 'normal').setWordWrapWidth(580),
      txt(this, 0, 240, 'Toque para continuar', 24, UI.muted, 'normal'),
    ]);
    pin(c);
    c.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 350, ease: 'Back.easeOut' });
    this.tweens.add({ targets: rays, angle: 360, duration: 6000, repeat: -1 });
    g.setInteractive(
      new Phaser.Geom.Rectangle(-GAME_WIDTH / 2, -GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT),
      Phaser.Geom.Rectangle.Contains,
    );
    this.time.delayedCall(700, () =>
      g.once('pointerup', () => {
        c.destroy();
        this.paused = false;
      }),
    );
  }

  // ── Pause ──────────────────────────────────────────────────────────────

  private openPause(): void {
    if (this.overlay || this.ending) return;
    this.paused = true;
    this.stick = null;
    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(OVERLAY_DEPTH);
    this.overlay = c;
    c.add(
      this.add
        .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05060f, 0.86)
        .setOrigin(0)
        .setInteractive(),
    );
    c.add(neonPanel(this, GAME_WIDTH / 2, 640, 560, 860, UI.accent));
    c.add(txt(this, GAME_WIDTH / 2, 280, 'PAUSA', 60, '#ffffff'));
    const save = () => getSave();
    const settingsText = () => `Volume ${Math.round(save().settings.volume * 100)}%`;
    let confirmRestart = false;
    const restart = neonButton(
      this,
      GAME_WIDTH / 2,
      500,
      440,
      90,
      'Reiniciar partida',
      () => {
        if (!confirmRestart) {
          confirmRestart = true;
          restart.setLabel('Toque de novo para confirmar');
          return;
        }
        this.scene.restart({
          ...this.data_,
          seed: this.data_.daily ? this.data_.seed : undefined,
        } satisfies RunData);
      },
      0xffb703,
      28,
    );
    const vol = txt(this, GAME_WIDTH / 2, 610, settingsText(), 28);
    const setVol = (d: number) => {
      const s = save();
      setSave({
        ...s,
        settings: {
          ...s.settings,
          volume: Math.round(Math.max(0, Math.min(1, s.settings.volume + d)) * 10) / 10,
        },
      });
      vol.setText(settingsText());
      audio.play('click');
    };
    const fx = neonButton(
      this,
      GAME_WIDTH / 2,
      720,
      440,
      80,
      `Efeitos intensos: ${save().settings.intenseFx ? 'sim' : 'não'}`,
      () => {
        const s = save();
        setSave({ ...s, settings: { ...s.settings, intenseFx: !s.settings.intenseFx } });
        fx.setLabel(`Efeitos intensos: ${save().settings.intenseFx ? 'sim' : 'não'}`);
      },
      UI.accent,
      26,
    );
    const shake = neonButton(
      this,
      GAME_WIDTH / 2,
      820,
      440,
      80,
      `Tremor de tela: ${save().settings.shake ? 'sim' : 'não'}`,
      () => {
        const s = save();
        setSave({ ...s, settings: { ...s.settings, shake: !s.settings.shake } });
        shake.setLabel(`Tremor de tela: ${save().settings.shake ? 'sim' : 'não'}`);
      },
      UI.accent,
      26,
    );
    c.add([
      neonButton(
        this,
        GAME_WIDTH / 2,
        390,
        440,
        96,
        'Continuar',
        () => this.closePause(),
        0x5bd46f,
        36,
      ),
      restart,
      neonButton(this, GAME_WIDTH / 2 - 170, 610, 90, 70, '−', () => setVol(-0.1), UI.accent, 40),
      vol,
      neonButton(this, GAME_WIDTH / 2 + 170, 610, 90, 70, '+', () => setVol(0.1), UI.accent, 40),
      fx,
      shake,
      neonButton(
        this,
        GAME_WIDTH / 2,
        960,
        440,
        90,
        'Encerrar partida',
        () => {
          this.closePause();
          this.finish(false, true);
        },
        0xff4d6d,
        30,
      ),
    ]);
    pin(c);
  }

  private closePause(): void {
    if (!this.paused || !this.overlay) return;
    this.overlay.destroy();
    this.overlay = null;
    this.paused = false;
  }

  // ── End ────────────────────────────────────────────────────────────────

  private finish(victory: boolean, quit = false): void {
    if (this.ending) return;
    this.ending = true;
    audio.play(victory ? 'victory' : 'defeat');
    if (!quit) {
      this.slowmo = 1.2;
      this.burst(this.sim.player.x, this.sim.player.y, victory ? 0xffd23f : 0xff4d6d, 60);
      if (victory) this.banner('VITÓRIA!', 'Você sobreviveu ao infinito', 0xffd23f);
    }
    this.time.delayedCall(quit ? 50 : 1600, () =>
      this.scene.start(SceneKeys.FusaoResults, {
        summary: this.sim.summary(),
        run: { ...this.data_ },
      }),
    );
  }
}
