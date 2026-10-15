import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import { formatNumber } from '@/platform/ranking';
import type { GameOverData } from '@/platform/scenes/GameOverScene';
import { addText, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { BolhaSim, radiusOf, WORLD, type BolhaEvent } from './core';

/** Finger distance (px) for full speed. */
const STICK = 90;
const BOOST_BTN = { x: GAME_WIDTH - 110, y: GAME_HEIGHT - 150, r: 80 };

/** "Bolha Gulosa": eat, grow, and don't get eaten. */
export class BolhaScene extends Phaser.Scene {
  private sim!: BolhaSim;
  private world!: Phaser.GameObjects.Graphics;
  private names = new Map<number, Phaser.GameObjects.Text>();
  private hud!: {
    mass: Phaser.GameObjects.Text;
    top: Phaser.GameObjects.Text;
    stick: Phaser.GameObjects.Graphics;
    boost: Phaser.GameObjects.Graphics;
  };
  private ui!: Phaser.Cameras.Scene2D.Camera;
  private hudObjects: Phaser.GameObjects.GameObject[] = [];
  private stick: { id: number; ox: number; oy: number; x: number; y: number } | null = null;
  private ended = false;
  private started = false;

  constructor() {
    super(SceneKeys.Bolha);
  }

  init(): void {
    const name = getServices(this).profile.get().name || 'Você';
    this.sim = new BolhaSim(name);
    this.names = new Map();
    this.hudObjects = [];
    this.stick = null;
    this.ended = false;
    this.started = false;
  }

  /** HUD objects are drawn by the fixed UI camera only. */
  private hudAdd<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.hudObjects.push(o);
    this.cameras.main.ignore(o);
    return o;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x10132a).setBounds(-400, -400, WORLD + 800, WORLD + 800);
    this.world = this.add.graphics();
    this.ui = this.cameras.add(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.ui.ignore(this.world);
    this.input.addPointer(2);

    this.hud = {
      mass: this.hudAdd(
        addText(this, GAME_WIDTH / 2, 50, '', 34, {
          color: '#ffffff',
          stroke: '#10132a',
          strokeThickness: 6,
        }),
      ),
      top: this.hudAdd(
        this.add
          .text(GAME_WIDTH - 20, 100, '', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '22px',
            color: '#ffffff',
            align: 'right',
            lineSpacing: 6,
            resolution: 2,
          })
          .setOrigin(1, 0),
      ),
      stick: this.hudAdd(this.add.graphics()),
      boost: this.hudAdd(this.add.graphics()),
    };
    this.hudAdd(iconButton(this, 60, 60, '‹', () => this.scene.start(SceneKeys.Hub)));
    this.hudAdd(addText(this, BOOST_BTN.x, BOOST_BTN.y, '⚡', 54));
    const hint = this.hudAdd(
      addText(
        this,
        GAME_WIDTH / 2,
        900,
        'Arraste para mover\n⚡ turbo gasta um pouco de massa\nComa os menores, fuja dos maiores!',
        30,
        { color: '#ffffff', stroke: '#10132a', strokeThickness: 8 },
      ),
    );

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y < 110 && p.x < 120) return;
      if (Math.hypot(p.x - BOOST_BTN.x, p.y - BOOST_BTN.y) < BOOST_BTN.r + 10) {
        this.tryBoost();
        return;
      }
      if (!this.started) {
        this.started = true;
        hint.destroy();
      }
      if (!this.stick) this.stick = { id: p.id, ox: p.x, oy: p.y, x: p.x, y: p.y };
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.stick?.id !== p.id) return;
      this.stick.x = p.x;
      this.stick.y = p.y;
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (this.stick?.id === p.id) this.stick = null;
    };
    this.input.on(Phaser.Input.Events.POINTER_UP, release);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, release);
    this.input.keyboard?.on('keydown-SPACE', () => this.tryBoost());
    this.input.keyboard?.once('keydown', () => {
      if (!this.started) {
        this.started = true;
        hint.destroy();
      }
    });
    this.cameras.main.centerOn(this.sim.player.x, this.sim.player.y);
    if (import.meta.env.DEV) (window as unknown as { __bolha?: BolhaScene }).__bolha = this;
  }

  get state(): BolhaSim {
    return this.sim;
  }

  private tryBoost(): void {
    if (this.ended || !this.sim.boost()) return;
    getServices(this).sfx.play('pop');
    if (!this.started) this.started = true;
  }

  private steer(): [number, number] {
    const kb = this.input.keyboard;
    let x = 0;
    let y = 0;
    if (kb?.checkDown(kb.addKey('LEFT'))) x -= 1;
    if (kb?.checkDown(kb.addKey('RIGHT'))) x += 1;
    if (kb?.checkDown(kb.addKey('UP'))) y -= 1;
    if (kb?.checkDown(kb.addKey('DOWN'))) y += 1;
    if (x || y) return [x, y];
    const s = this.stick;
    if (!s) return [0, 0];
    const dx = (s.x - s.ox) / STICK;
    const dy = (s.y - s.oy) / STICK;
    const len = Math.hypot(dx, dy);
    return len > 1 ? [dx / len, dy / len] : [dx, dy];
  }

  private onEvent(e: BolhaEvent): void {
    const { sfx } = getServices(this);
    const me = this.sim.player;
    if (e.type === 'eat' && e.who === me) {
      sfx.play('star', 2);
      sfx.vibrate(30);
      this.cameras.main.shake(120, 0.004);
      const t = addText(this, e.prey.x, e.prey.y, `+${Math.round(e.prey.mass * 0.8)}`, 40, {
        color: '#ffd23f',
        stroke: '#10132a',
        strokeThickness: 6,
      });
      this.ui.ignore(t);
      this.tweens.add({
        targets: t,
        y: t.y - 80,
        alpha: 0,
        duration: 700,
        onComplete: () => t.destroy(),
      });
    } else if (e.type === 'over') this.gameOver(e.by.name);
  }

  private gameOver(by: string): void {
    this.ended = true;
    const { sfx } = getServices(this);
    sfx.play('hit');
    sfx.vibrate([80, 40, 80]);
    const s = this.sim;
    const data: GameOverData = {
      gameId: 'bolha',
      title: `${by} engoliu você!`,
      lines: [`Abates: ${s.kills} · Melhor posição: ${s.bestRank}º`],
      record: { score: s.score, details: { kills: s.kills, rank: s.bestRank } },
      parent: SceneKeys.Bolha,
      retry: { scene: SceneKeys.Bolha },
    };
    this.time.delayedCall(900, () => this.scene.launch(SceneKeys.GameOver, data));
  }

  override update(_t: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 1 / 30);
    const s = this.sim;
    const me = s.player;
    if (this.started && !this.ended) {
      const [x, y] = this.steer();
      for (const e of s.step(dt, x, y)) this.onEvent(e);
    }

    // Camera follows and zooms out as you grow.
    const cam = this.cameras.main;
    const r = radiusOf(me.mass);
    const zoom = Phaser.Math.Clamp(1.15 - (r - 35) / 260, 0.42, 1.15);
    cam.setZoom(Phaser.Math.Linear(cam.zoom, zoom, 1 - Math.exp(-dt * 2)));
    if (me.alive)
      cam.centerOn(
        Phaser.Math.Linear(cam.midPoint.x, me.x, 0.2),
        Phaser.Math.Linear(cam.midPoint.y, me.y, 0.2),
      );

    const view = cam.worldView;
    const g = this.world.clear();
    // Grid + arena edge.
    g.lineStyle(2, 0xffffff, 0.06);
    const step = 80;
    for (
      let x = Math.max(0, Math.floor(view.x / step) * step);
      x <= Math.min(WORLD, view.right);
      x += step
    )
      g.lineBetween(x, Math.max(0, view.y), x, Math.min(WORLD, view.bottom));
    for (
      let y = Math.max(0, Math.floor(view.y / step) * step);
      y <= Math.min(WORLD, view.bottom);
      y += step
    )
      g.lineBetween(Math.max(0, view.x), y, Math.min(WORLD, view.right), y);
    g.lineStyle(10, 0xff4f8b, 0.7).strokeRect(0, 0, WORLD, WORLD);

    for (const d of s.dots) {
      if (!view.contains(d.x, d.y)) continue;
      g.fillStyle(d.color).fillCircle(d.x, d.y, 7);
    }
    const seen = new Set<number>();
    const order = s.blobs.filter((b) => b.alive).sort((a, b) => a.mass - b.mass);
    for (const b of order) {
      const br = radiusOf(b.mass);
      if (b.x + br < view.x || b.x - br > view.right || b.y + br < view.y || b.y - br > view.bottom)
        continue;
      seen.add(b.id);
      const wob = b.boost > 0 ? 1.06 : 1;
      g.fillStyle(Phaser.Display.Color.ValueToColor(b.color).darken(25).color).fillCircle(
        b.x,
        b.y,
        br * wob,
      );
      g.fillStyle(b.color, b.shield > 0 ? 0.55 : 1).fillCircle(b.x, b.y, br * wob - 5);
      if (b === me) g.lineStyle(4, 0xffffff, 0.9).strokeCircle(b.x, b.y, br * wob);
      // Eyes looking where it goes.
      const look = b === me ? Math.atan2(this.steer()[1], this.steer()[0]) : b.dir;
      const ex = Math.cos(look) * br * 0.12;
      const ey = Math.sin(look) * br * 0.12;
      for (const side of [-1, 1]) {
        g.fillStyle(0xffffff).fillCircle(b.x + side * br * 0.3, b.y - br * 0.2, br * 0.16);
        g.fillStyle(0x10132a).fillCircle(
          b.x + side * br * 0.3 + ex,
          b.y - br * 0.2 + ey,
          br * 0.08,
        );
      }
      let label = this.names.get(b.id);
      if (!label) {
        label = this.add
          .text(0, 0, b.name, {
            fontFamily: 'system-ui, sans-serif',
            fontStyle: 'bold',
            fontSize: '28px',
            color: '#ffffff',
            stroke: '#10132a',
            strokeThickness: 6,
            resolution: 2,
          })
          .setOrigin(0.5);
        this.ui.ignore(label);
        this.names.set(b.id, label);
      }
      label
        .setPosition(b.x, b.y + br * 0.35)
        .setScale(Math.max(0.6, br / 60))
        .setVisible(true);
    }
    for (const [id, label] of this.names) {
      if (seen.has(id)) continue;
      if (!s.blobs.some((b) => b.id === id && b.alive)) {
        label.destroy();
        this.names.delete(id);
      } else label.setVisible(false);
    }

    // HUD.
    const rank = s.rankOf(me);
    this.hud.mass.setText(`Tamanho ${formatNumber(Math.floor(me.mass))}  ·  ${rank}º`);
    this.hud.top.setText(
      s
        .ranking()
        .slice(0, 5)
        .map((b, i) => `${i + 1}. ${b === me ? '▶ ' : ''}${b.name}  ${Math.floor(b.mass)}`)
        .join('\n') + (rank > 5 ? `\n…\n${rank}. ▶ ${me.name}  ${Math.floor(me.mass)}` : ''),
    );
    const st = this.hud.stick.clear();
    if (this.stick) {
      st.lineStyle(4, 0xffffff, 0.35).strokeCircle(this.stick.ox, this.stick.oy, STICK);
      const [x, y] = this.steer();
      st.fillStyle(0xffffff, 0.45).fillCircle(
        this.stick.ox + x * STICK,
        this.stick.oy + y * STICK,
        36,
      );
    }
    const bt = this.hud.boost.clear();
    const ready = me.cooldown <= 0 && me.mass >= 30;
    bt.fillStyle(ready ? 0xffd23f : 0x555a75, ready ? 0.9 : 0.6).fillCircle(
      BOOST_BTN.x,
      BOOST_BTN.y,
      BOOST_BTN.r,
    );
    bt.lineStyle(5, 0xffffff, 0.8).strokeCircle(BOOST_BTN.x, BOOST_BTN.y, BOOST_BTN.r);
  }
}
