import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { KIDS, kidKey } from '@/games/bomba/art';
import { Tex } from '@/platform/art/textures';
import { formatNumber } from '@/platform/ranking';
import type { GameOverData } from '@/platform/scenes/GameOverScene';
import { bindSwipe } from '@/platform/ui/swipe';
import { addText, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { backKey, CTex, powerKey } from './art';
import { RunSim, type Obstacle, type RunEvent } from './core';

export interface CorreData {
  kid?: number;
}

// Camera: the road is drawn in perspective from a camera behind and above the kid.
const HORIZON = 440;
const FOCAL = 760;
const CAM_H = 4;
const Z0 = 5;
const FAR = 95;
const LANE_W = 1.4;
const ROAD_HALF = LANE_W * 1.6;
const WALK_W = 2.2;
const KID_H = 1.35;
const KID_STORE = 'corre-kid';

const scaleAt = (z: number) => FOCAL / (Math.max(z, -Z0 + 0.4) + Z0);

interface Building {
  side: -1 | 1;
  z: number;
  len: number;
  h: number;
  depth: number;
  color: number;
}

const BUILDING_COLORS = [
  0xff6b6b, 0xffd166, 0x06d6a0, 0x4cc9f0, 0xf78c6b, 0xc77dff, 0xfff1e6, 0x90be6d,
];

const loadKid = (): number | null => {
  try {
    const i = Number(localStorage.getItem(KID_STORE));
    return localStorage.getItem(KID_STORE) !== null && i >= 0 && i < KIDS.length ? i : null;
  } catch {
    return null;
  }
};

/** "Corre Turma": endless three-lane runner with the cartoon kids. */
export class CorreScene extends Phaser.Scene {
  private sim = new RunSim();
  private kid = 0;
  private running = false;
  private camX = 0;
  private buildings: Building[] = [];
  private world!: Phaser.GameObjects.Graphics;
  private things!: Phaser.GameObjects.Graphics;
  private kidImg!: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Ellipse;
  private pool: Phaser.GameObjects.Image[] = [];
  private hud!: {
    score: Phaser.GameObjects.Text;
    coins: Phaser.GameObjects.Text;
    meters: Phaser.GameObjects.Text;
    powers: Phaser.GameObjects.Graphics;
  };

  constructor() {
    super(SceneKeys.Corre);
  }

  init(data: CorreData): void {
    this.sim = new RunSim();
    this.kid = data.kid ?? loadKid() ?? -1;
    this.running = false;
    this.camX = 0;
    this.buildings = [];
    this.pool = [];
  }

  create(): void {
    this.drawSky();
    this.world = this.add.graphics().setDepth(1);
    this.things = this.add.graphics().setDepth(10);
    this.shadow = this.add.ellipse(0, 0, 10, 10, 0x000000, 0.28).setDepth(9);
    this.kidImg = this.add
      .image(0, 0, backKey(Math.max(0, this.kid), 0))
      .setOrigin(0.5, 0.95)
      .setDepth(20);
    this.buildHud();

    bindSwipe(
      this,
      (dir) => {
        if (!this.running) return;
        for (const e of this.sim.move(dir)) this.onEvent(e);
      },
      160,
    );

    if (this.kid < 0) this.chooseKid();
    else this.ready();
    if (import.meta.env.DEV) (window as unknown as { __corre?: CorreScene }).__corre = this;
  }

  // ── Scenery ─────────────────────────────────────────────────────────────

  private drawSky(): void {
    const g = this.add.graphics().setDepth(0);
    g.fillGradientStyle(0x4cc9f0, 0x4cc9f0, 0xbde9ff, 0xbde9ff, 1).fillRect(
      0,
      0,
      GAME_WIDTH,
      HORIZON + 4,
    );
    g.fillStyle(0xfff3b0).fillCircle(580, 170, 44);
    for (const [x, y, s] of [
      [90, 150, 1],
      [330, 110, 0.8],
      [520, 260, 0.7],
    ] as const) {
      g.fillStyle(0xffffff, 0.9)
        .fillCircle(x, y, 26 * s)
        .fillCircle(x + 30 * s, y - 10 * s, 32 * s)
        .fillCircle(x + 62 * s, y, 24 * s);
    }
    // Far skyline at the horizon.
    let x = -20;
    while (x < GAME_WIDTH) {
      const w = Phaser.Math.Between(40, 90);
      const h = Phaser.Math.Between(30, 110);
      g.fillStyle(0x9fb4c7).fillRect(x, HORIZON - h, w, h + 4);
      x += w + 4;
    }
    g.fillStyle(0x6cc551).fillRect(0, HORIZON, GAME_WIDTH, 1280 - HORIZON);
  }

  private project(x: number, h: number, z: number) {
    const s = scaleAt(z);
    return { x: GAME_WIDTH / 2 + (x - this.camX) * s, y: HORIZON + (CAM_H - h) * s };
  }

  private quad(
    g: Phaser.GameObjects.Graphics,
    pts: { x: number; y: number }[],
    color: number,
    alpha = 1,
  ): void {
    g.fillStyle(color, alpha).fillPoints(pts, true);
  }

  /** Road, sidewalks and moving stripes, then the buildings along both sides. */
  private drawWorld(): void {
    const g = this.world.clear();
    const m = this.sim.meters;
    const P = (x: number, h: number, z: number) => this.project(x, h, z);
    // Sidewalks and road.
    for (const side of [-1, 1]) {
      this.quad(
        g,
        [
          P(side * ROAD_HALF, 0, -3),
          P(side * (ROAD_HALF + WALK_W), 0, -3),
          P(side * (ROAD_HALF + WALK_W), 0, FAR),
          P(side * ROAD_HALF, 0, FAR),
        ],
        0xd9d2c5,
      );
    }
    this.quad(
      g,
      [P(-ROAD_HALF, 0, -3), P(ROAD_HALF, 0, -3), P(ROAD_HALF, 0, FAR), P(-ROAD_HALF, 0, FAR)],
      0x5c5f73,
    );
    // Alternating stripes moving towards the camera (speed feeling).
    const stripe = 6;
    for (let z = -(m % (stripe * 2)) - 3; z < FAR; z += stripe * 2) {
      this.quad(
        g,
        [
          P(-ROAD_HALF, 0, z),
          P(ROAD_HALF, 0, z),
          P(ROAD_HALF, 0, z + stripe),
          P(-ROAD_HALF, 0, z + stripe),
        ],
        0x666a80,
      );
      for (const side of [-1, 1])
        this.quad(
          g,
          [
            P(side * ROAD_HALF, 0, z),
            P(side * (ROAD_HALF + WALK_W), 0, z),
            P(side * (ROAD_HALF + WALK_W), 0, z + stripe),
            P(side * ROAD_HALF, 0, z + stripe),
          ],
          0xcfc6b6,
        );
    }
    // Lane dashes.
    for (let z = -(m % 8) - 3; z < FAR; z += 8)
      for (const lx of [-LANE_W / 2, LANE_W / 2])
        this.quad(
          g,
          [
            P(lx - 0.07, 0, z),
            P(lx + 0.07, 0, z),
            P(lx + 0.07, 0, z + 3.5),
            P(lx - 0.07, 0, z + 3.5),
          ],
          0xffffff,
          0.85,
        );
    // Curbs.
    for (const side of [-1, 1])
      this.quad(
        g,
        [
          P(side * ROAD_HALF, 0, -3),
          P(side * (ROAD_HALF + 0.18), 0, -3),
          P(side * (ROAD_HALF + 0.18), 0, FAR),
          P(side * ROAD_HALF, 0, FAR),
        ],
        0xffd166,
      );

    this.updateBuildings();
    // Far to near so closer buildings cover the ones behind.
    const sorted = [...this.buildings].sort((a, b) => b.z - a.z);
    for (const bld of sorted) {
      const z0 = bld.z - m;
      const z1 = z0 + bld.len;
      if (z1 < -3 || z0 > FAR) continue;
      const x0 = bld.side * (ROAD_HALF + WALK_W + 0.3);
      const x1 = x0 + bld.side * bld.depth;
      const near = Math.max(z0, -2.5);
      // Face along the street.
      this.quad(g, [P(x0, 0, near), P(x0, bld.h, near), P(x0, bld.h, z1), P(x0, 0, z1)], bld.color);
      // Windows on that face.
      const dark = Phaser.Display.Color.ValueToColor(bld.color).darken(30).color;
      for (let wz = Math.ceil(near) + 0.5; wz < z1 - 0.8; wz += 2.2)
        for (let wh = 1.2; wh < bld.h - 0.8; wh += 2.4)
          this.quad(
            g,
            [P(x0, wh, wz), P(x0, wh + 1.1, wz), P(x0, wh + 1.1, wz + 1.1), P(x0, wh, wz + 1.1)],
            dark,
          );
      // Front face (towards the camera) and roof edge.
      if (z0 > -2.5) {
        const front = Phaser.Display.Color.ValueToColor(bld.color).darken(12).color;
        this.quad(g, [P(x0, 0, z0), P(x1, 0, z0), P(x1, bld.h, z0), P(x0, bld.h, z0)], front);
      }
      this.quad(
        g,
        [P(x0, bld.h, near), P(x1, bld.h, near), P(x1, bld.h, z1), P(x0, bld.h, z1)],
        Phaser.Display.Color.ValueToColor(bld.color).lighten(15).color,
      );
    }
  }

  private updateBuildings(): void {
    const m = this.sim.meters;
    this.buildings = this.buildings.filter((b) => b.z + b.len - m > -5);
    for (const side of [-1, 1] as const) {
      const last = this.buildings
        .filter((b) => b.side === side)
        .reduce((max, b) => Math.max(max, b.z + b.len), m - 5);
      for (let z = last; z < m + FAR + 10;) {
        const len = Phaser.Math.FloatBetween(5, 11);
        this.buildings.push({
          side,
          z: z + 0.6,
          len,
          h: Phaser.Math.FloatBetween(3.5, 9),
          depth: Phaser.Math.FloatBetween(4, 7),
          color: Phaser.Utils.Array.GetRandom(BUILDING_COLORS),
        });
        z += len + 0.6;
      }
    }
  }

  // ── Obstacles, coins, power-ups ─────────────────────────────────────────

  private drawObstacle(g: Phaser.GameObjects.Graphics, o: Obstacle): void {
    const P = (x: number, h: number, z: number) => this.project(x, h, z);
    const cx = o.lane * LANE_W;
    const half = LANE_W * 0.43;
    const z0 = Math.max(o.z, -2.5);
    if (o.kind === 'onibus') {
      const z1 = o.z + o.len;
      const h = 2.7;
      const x0 = cx - half;
      const x1 = cx + half;
      // Visible side, roof, then the back of the bus facing us.
      if (x0 > this.camX)
        this.quad(g, [P(x0, 0, z0), P(x0, h, z0), P(x0, h, z1), P(x0, 0, z1)], 0xe0a800);
      if (x1 < this.camX)
        this.quad(g, [P(x1, 0, z0), P(x1, h, z0), P(x1, h, z1), P(x1, 0, z1)], 0xe0a800);
      this.quad(g, [P(x0, h, z0), P(x1, h, z0), P(x1, h, z1), P(x0, h, z1)], 0xffe066);
      if (o.z > -2.5) {
        this.quad(g, [P(x0, 0.15, z0), P(x1, 0.15, z0), P(x1, h, z0), P(x0, h, z0)], 0xffc300);
        this.quad(
          g,
          [
            P(x0 + 0.12, 1.4, z0),
            P(x1 - 0.12, 1.4, z0),
            P(x1 - 0.12, 2.4, z0),
            P(x0 + 0.12, 2.4, z0),
          ],
          0x23395b,
        );
        for (const lx of [x0 + 0.18, x1 - 0.38])
          this.quad(
            g,
            [P(lx, 0.5, z0), P(lx + 0.2, 0.5, z0), P(lx + 0.2, 0.75, z0), P(lx, 0.75, z0)],
            0xff2a2a,
          );
        this.quad(g, [P(x0, 0, z0), P(x1, 0, z0), P(x1, 0.25, z0), P(x0, 0.25, z0)], 0x1a1a1a);
      }
      return;
    }
    if (o.kind === 'cerca') {
      // Low red-and-white fence: jump it.
      const h = 0.8;
      const n = 5;
      for (let i = 0; i < n; i++) {
        const a = cx - half + (i * 2 * half) / n;
        const b = a + (2 * half) / n;
        this.quad(
          g,
          [P(a, 0.25, z0), P(b, 0.25, z0), P(b, h, z0), P(a, h, z0)],
          i % 2 ? 0xffffff : 0xe63946,
        );
      }
      for (const px of [cx - half, cx + half - 0.1])
        this.quad(
          g,
          [P(px, 0, z0), P(px + 0.1, 0, z0), P(px + 0.1, h, z0), P(px, h, z0)],
          0x3d405b,
        );
      return;
    }
    // Banner on two poles: slide under it.
    for (const px of [cx - half, cx + half - 0.1])
      this.quad(
        g,
        [P(px, 0, z0), P(px + 0.1, 0, z0), P(px + 0.1, 2.3, z0), P(px, 2.3, z0)],
        0x3d405b,
      );
    this.quad(
      g,
      [P(cx - half, 1.0, z0), P(cx + half, 1.0, z0), P(cx + half, 1.7, z0), P(cx - half, 1.7, z0)],
      0x3a86ff,
    );
    this.quad(
      g,
      [
        P(cx - half, 1.28, z0),
        P(cx + half, 1.28, z0),
        P(cx + half, 1.42, z0),
        P(cx - half, 1.42, z0),
      ],
      0xffd23f,
    );
  }

  private drawThings(): void {
    const g = this.things.clear();
    for (const o of [...this.sim.obstacles].sort((a, b) => b.z - a.z)) {
      if (o.z > FAR || o.z + o.len < -2.5) continue;
      this.drawObstacle(g, o);
    }
    // Coins and power-ups: pooled images.
    let used = 0;
    const img = (key: string) => {
      let im = this.pool[used];
      if (!im) {
        im = this.add.image(0, 0, key);
        this.pool.push(im);
      }
      used++;
      return im.setTexture(key).setVisible(true);
    };
    const t = this.time.now / 1000;
    for (const c of this.sim.coinList) {
      if (c.z > FAR || c.z < -2) continue;
      const p = this.project(c.lane * LANE_W, c.y + 0.3, c.z);
      const s = (scaleAt(c.z) * 0.55) / 64;
      img(CTex.coin)
        .setPosition(p.x, p.y)
        .setScale(s * Math.max(0.15, Math.abs(Math.cos(t * 5 + c.id))), s)
        .setDepth(11 + (FAR - c.z) * 0.01);
    }
    for (const pw of this.sim.powers) {
      if (pw.z > FAR || pw.z < -2) continue;
      const p = this.project(pw.lane * LANE_W, 0.8 + Math.sin(t * 4) * 0.15, pw.z);
      img(powerKey(pw.kind))
        .setPosition(p.x, p.y)
        .setScale((scaleAt(pw.z) * 0.8) / 80)
        .setDepth(11 + (FAR - pw.z) * 0.01);
    }
    for (let i = used; i < this.pool.length; i++) this.pool[i]!.setVisible(false);
  }

  private drawKid(): void {
    const sim = this.sim;
    const x = sim.x * LANE_W;
    const feet = this.project(x, sim.y, 0);
    const ground = this.project(x, 0, 0);
    const s = (scaleAt(0) * KID_H) / 128;
    const frame = sim.airborne ? 0 : Math.floor(this.time.now / 110) % 2 ? 1 : 0;
    const sliding = sim.slide > 0 && !sim.airborne;
    this.kidImg
      .setTexture(backKey(this.kid, frame as 0 | 1))
      .setPosition(feet.x, feet.y)
      .setScale(s * (sliding ? 1.15 : 1), s * (sliding ? 0.55 : 1))
      .setAngle((sim.lane - sim.x) * -12);
    this.shadow.setPosition(ground.x, ground.y).setSize(70 * (1 - sim.y * 0.15), 18);
    // Shield: a bubble around the kid.
    if (sim.shield) {
      this.things.lineStyle(6, 0x9bd0ff, 0.9).strokeCircle(feet.x, feet.y - 95, 110);
      this.things.fillStyle(0x9bd0ff, 0.15).fillCircle(feet.x, feet.y - 95, 110);
    }
  }

  // ── HUD ─────────────────────────────────────────────────────────────────

  private buildHud(): void {
    iconButton(this, 60, 60, '‹', () => this.scene.start(SceneKeys.Hub)).setDepth(40);
    const score = addText(this, GAME_WIDTH / 2, 64, '0', 58, {
      color: COLORS.textLight,
      stroke: '#1d2b53',
      strokeThickness: 10,
    }).setDepth(40);
    const meters = addText(this, GAME_WIDTH / 2, 118, '0 m', 26, {
      color: COLORS.textLight,
      stroke: '#1d2b53',
      strokeThickness: 6,
    }).setDepth(40);
    this.add
      .image(GAME_WIDTH - 130, 60, CTex.coin)
      .setScale(0.7)
      .setDepth(40);
    const coins = addText(this, GAME_WIDTH - 70, 62, '0', 36, {
      color: '#ffd23f',
      stroke: '#1d2b53',
      strokeThickness: 8,
    }).setDepth(40);
    this.hud = { score, coins, meters, powers: this.add.graphics().setDepth(40) };
  }

  private updateHud(): void {
    const sim = this.sim;
    this.hud.score.setText(formatNumber(sim.score));
    this.hud.meters.setText(`${formatNumber(Math.floor(sim.meters))} m`);
    this.hud.coins.setText(formatNumber(sim.coins));
    const g = this.hud.powers.clear();
    if (sim.magnet > 0) {
      g.fillStyle(0x0b1430, 0.5).fillRoundedRect(GAME_WIDTH - 230, 100, 200, 22, 11);
      g.fillStyle(0xe63946).fillRoundedRect(GAME_WIDTH - 230, 100, (200 * sim.magnet) / 9, 22, 11);
    }
  }

  // ── Flow ────────────────────────────────────────────────────────────────

  override update(_t: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 1 / 30);
    if (this.running) for (const e of this.sim.step(dt)) this.onEvent(e);
    this.camX += (this.sim.x * LANE_W * 0.55 - this.camX) * (1 - Math.exp(-dt * 6));
    this.drawWorld();
    this.drawThings();
    if (this.kid >= 0) this.drawKid();
    this.updateHud();
  }

  private onEvent(e: RunEvent): void {
    const { sfx } = getServices(this);
    switch (e.type) {
      case 'coin':
        sfx.play('star', Math.min(4, this.sim.coins % 5));
        break;
      case 'power':
        sfx.play('win');
        this.popup(e.kind === 'ima' ? 'ÍMÃ!' : 'ESCUDO!', e.kind === 'ima' ? '#e63946' : '#3a86ff');
        break;
      case 'shield':
        sfx.play('hit');
        this.cameras.main.shake(150, 0.008);
        this.popup('UFA! O ESCUDO SALVOU', '#3a86ff');
        break;
      case 'jump':
        sfx.play('pop');
        break;
      case 'slide':
        sfx.play('click');
        break;
      case 'crash':
        this.crash();
        break;
    }
  }

  private popup(text: string, color: string): void {
    const t = addText(this, GAME_WIDTH / 2, 330, text, 46, {
      color,
      stroke: '#ffffff',
      strokeThickness: 10,
    })
      .setDepth(45)
      .setScale(0.6);
    this.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: t,
      alpha: 0,
      y: 290,
      delay: 700,
      duration: 400,
      onComplete: () => t.destroy(),
    });
  }

  private ready(): void {
    const hint = addText(
      this,
      GAME_WIDTH / 2,
      600,
      'Deslize para correr!\n← → trocar de faixa\n↑ pular   ↓ escorregar',
      38,
      {
        color: COLORS.textLight,
        stroke: '#1d2b53',
        strokeThickness: 10,
      },
    ).setDepth(50);
    this.tweens.add({ targets: hint, scale: 1.05, duration: 600, yoyo: true, repeat: -1 });
    const go = () => {
      if (this.running) return;
      hint.destroy();
      getServices(this).sfx.play('start');
      this.running = true;
    };
    this.input.once(Phaser.Input.Events.POINTER_DOWN, go);
    this.input.keyboard?.once('keydown', go);
  }

  private chooseKid(): void {
    const layer: Phaser.GameObjects.GameObject[] = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => (layer.push(o), o);
    add(
      this.add
        .rectangle(0, 0, GAME_WIDTH, 1280, 0x1d2b53, 0.85)
        .setOrigin(0)
        .setDepth(60)
        .setInteractive(),
    );
    add(
      addText(this, GAME_WIDTH / 2, 200, 'Quem vai correr?', 50, {
        color: '#ffd23f',
        stroke: '#1d2b53',
        strokeThickness: 10,
      }).setDepth(61),
    );
    KIDS.forEach((kid, i) => {
      const row = Math.floor(i / 3);
      const perRow = row < 2 ? 3 : 1;
      const x = GAME_WIDTH / 2 + ((i % 3) - (perRow - 1) / 2) * 220;
      const y = 420 + row * 280;
      const card = add(this.add.graphics().setDepth(61));
      card.fillStyle(0xffffff).fillRoundedRect(x - 95, y - 115, 190, 240, 24);
      const img = add(
        this.add
          .image(x, y - 15, kidKey(i, 0))
          .setScale(1.2)
          .setDepth(62),
      );
      this.tweens.add({
        targets: img,
        y: y - 23,
        duration: 450 + i * 60,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      add(addText(this, x, y + 95, kid.name, 30, { color: COLORS.text }).setDepth(62));
      const zone = add(
        this.add.zone(x, y, 190, 240).setInteractive({ useHandCursor: true }).setDepth(63),
      );
      zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        getServices(this).sfx.play('pop');
        try {
          localStorage.setItem(KID_STORE, String(i));
        } catch {
          // Not remembered in private mode.
        }
        for (const o of layer) o.destroy();
        this.scene.restart({ kid: i } satisfies CorreData);
      });
    });
  }

  private crash(): void {
    const { sfx } = getServices(this);
    this.running = false;
    sfx.play('hit');
    sfx.vibrate([80, 40, 80]);
    this.cameras.main.shake(250, 0.012);
    this.tweens.add({
      targets: this.kidImg,
      angle: -90,
      y: this.kidImg.y + 30,
      duration: 450,
      ease: 'Bounce.easeOut',
    });
    for (let i = 0; i < 3; i++) {
      const star = this.add
        .image(this.kidImg.x, this.kidImg.y - 200, Tex.star)
        .setScale(0.5)
        .setDepth(30);
      this.tweens.add({
        targets: star,
        angle: 360,
        x: star.x + Math.cos(i * 2.1) * 70,
        y: star.y + Math.sin(i * 2.1) * 30,
        duration: 900,
        repeat: 1,
      });
    }
    const sim = this.sim;
    const meters = Math.floor(sim.meters);
    const what = {
      onibus: 'Bateu no ônibus!',
      cerca: 'Tropeçou na cerca!',
      faixa: 'Bateu a cabeça na faixa!',
    };
    const data: GameOverData = {
      gameId: 'corre',
      title: what[sim.crashed ?? 'onibus'],
      lines: [`Distância: ${formatNumber(meters)} m`, `Moedas: ${formatNumber(sim.coins)}`],
      record: { score: sim.score, details: { meters, coins: sim.coins } },
      parent: SceneKeys.Corre,
      retry: { scene: SceneKeys.Corre, data: { kid: this.kid } satisfies CorreData },
    };
    this.time.delayedCall(1300, () => this.scene.launch(SceneKeys.GameOver, data));
  }
}
