import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import { Tex } from '@/platform/art/textures';
import { formatNumber } from '@/platform/ranking';
import type { GameOverData } from '@/platform/scenes/GameOverScene';
import { addText, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { RFTex } from './art';
import { MAX_FUEL, PLAYER_Y, ROAD_LEFT, ROAD_RIGHT, RoadSim, LANE_W, type RoadEvent } from './core';

const DASH = 80;
const MAX_DT = 1 / 30;

export class RoadFighterScene extends Phaser.Scene {
  private sim = new RoadSim();
  private running = false;
  private steerX: number | null = null;
  private drag: { startX: number; carX: number } | null = null;

  private road!: Phaser.GameObjects.Graphics;
  private player!: Phaser.GameObjects.Image;
  private carViews = new Map<number, Phaser.GameObjects.Image>();
  private fuelViews = new Map<number, Phaser.GameObjects.Image>();
  private scenery: Phaser.GameObjects.Image[] = [];
  private hud!: {
    meters: Phaser.GameObjects.Text;
    score: Phaser.GameObjects.Text;
    speed: Phaser.GameObjects.Text;
    fuel: Phaser.GameObjects.Graphics;
    hearts: Phaser.GameObjects.Image[];
  };
  private keys?: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor() {
    super(SceneKeys.RoadFighter);
  }

  init(): void {
    this.sim = new RoadSim();
    this.running = false;
    this.steerX = null;
    this.drag = null;
    this.carViews = new Map();
    this.fuelViews = new Map();
    this.scenery = [];
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x4caf50);
    this.road = this.add.graphics();

    for (let i = 0; i < 12; i++) {
      const left = i % 2 === 0;
      const img = this.add.image(
        left
          ? Phaser.Math.Between(20, ROAD_LEFT - 50)
          : Phaser.Math.Between(ROAD_RIGHT + 50, GAME_WIDTH - 20),
        Phaser.Math.Between(-100, GAME_HEIGHT),
        Math.random() < 0.6 ? RFTex.tree : RFTex.bush,
      );
      this.scenery.push(img.setDepth(3));
    }

    this.player = this.add.image(this.sim.playerX, PLAYER_Y, RFTex.player).setDepth(6);
    this.buildHud();
    this.bindInput();
    this.drawRoad();
    this.countdown();

    if (import.meta.env.DEV) (window as unknown as { __rf?: RoadFighterScene }).__rf = this;
  }

  private buildHud(): void {
    const bar = this.add.graphics().setDepth(20);
    bar.fillStyle(0x0b1430, 0.75).fillRoundedRect(16, 14, GAME_WIDTH - 32, 150, 28);
    iconButton(this, 72, 62, '‹', () => this.scene.start(SceneKeys.Hub)).setDepth(21);

    const style = { color: COLORS.textLight };
    const meters = addText(this, 260, 50, '0 m', 40, style).setDepth(21);
    const score = addText(this, 260, 96, '0 pts', 26, { color: '#ffd23f' }).setDepth(21);
    const speed = addText(this, 470, 50, '0 km/h', 30, style).setDepth(21);
    const hearts = [0, 1, 2].map((i) =>
      this.add
        .image(590 + i * 46, 50, Tex.heart)
        .setScale(0.8)
        .setDepth(21),
    );
    addText(this, 150, 135, '⛽', 26).setDepth(21);
    const fuel = this.add.graphics().setDepth(21);
    this.hud = { meters, score, speed, fuel, hearts };
  }

  private bindInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y < 170) return;
      this.drag = { startX: p.x, carX: this.sim.playerX };
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.drag) this.steerX = this.drag.carX + (p.x - this.drag.startX) * 1.3;
    });
    const end = () => {
      this.drag = null;
      this.steerX = null;
    };
    this.input.on(Phaser.Input.Events.POINTER_UP, end);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, end);
    this.keys = this.input.keyboard?.createCursorKeys();
  }

  private countdown(): void {
    const { sfx } = getServices(this);
    const hint = addText(this, GAME_WIDTH / 2, 760, 'Arraste para os lados\npara desviar!', 36, {
      color: COLORS.textLight,
      stroke: '#0b1430',
      strokeThickness: 8,
    }).setDepth(30);
    const label = addText(this, GAME_WIDTH / 2, 560, '3', 160, {
      color: '#ffd23f',
      stroke: '#0b1430',
      strokeThickness: 16,
    }).setDepth(30);
    ['3', '2', '1', 'JÁ!'].forEach((t, i) =>
      this.time.delayedCall(i * 700, () => {
        label.setText(t).setScale(1.4);
        this.tweens.add({ targets: label, scale: 1, duration: 300, ease: 'Back.easeOut' });
        sfx.play(i === 3 ? 'start' : 'click');
      }),
    );
    this.time.delayedCall(2800, () => {
      label.destroy();
      hint.destroy();
      this.running = true;
    });
  }

  override update(_time: number, deltaMs: number): void {
    if (!this.running) return;
    const dt = Math.min(deltaMs / 1000, MAX_DT);

    if (this.keys?.left.isDown) this.steerX = this.sim.playerX - 200;
    else if (this.keys?.right.isDown) this.steerX = this.sim.playerX + 200;
    else if (!this.drag) this.steerX = null;

    const events = this.sim.step(dt, this.steerX);
    events.forEach((e) => this.onEvent(e));
    this.render(dt);
  }

  private onEvent(e: RoadEvent): void {
    const { sfx } = getServices(this);
    switch (e.type) {
      case 'crash': {
        sfx.play('hit');
        sfx.vibrate([80, 40, 80]);
        this.cameras.main.shake(250, 0.012);
        const view = this.carViews.get(e.car.id);
        this.carViews.delete(e.car.id);
        if (view) {
          this.tweens.add({
            targets: view,
            angle: 540,
            alpha: 0,
            x: view.x + (view.x < GAME_WIDTH / 2 ? -160 : 160),
            duration: 700,
            onComplete: () => view.destroy(),
          });
        }
        this.tweens.add({ targets: this.player, alpha: 0.3, duration: 120, yoyo: true, repeat: 6 });
        break;
      }
      case 'fuel': {
        sfx.play('star', 2);
        this.fuelViews.get(e.pickup.id)?.destroy();
        this.fuelViews.delete(e.pickup.id);
        const t = addText(this, this.player.x, PLAYER_Y - 90, '+⛽', 40, {
          color: '#ffd23f',
          stroke: '#0b1430',
        }).setDepth(25);
        this.tweens.add({
          targets: t,
          y: t.y - 80,
          alpha: 0,
          duration: 700,
          onComplete: () => t.destroy(),
        });
        break;
      }
      case 'pass':
        this.carViews.get(e.car.id)?.destroy();
        this.carViews.delete(e.car.id);
        break;
      case 'over':
        this.gameOver(e.reason);
        break;
    }
  }

  private drawRoad(): void {
    const g = this.road.clear();
    const offset = this.sim.distance % DASH;
    g.fillStyle(0x43a047);
    for (let y = -DASH + offset; y < GAME_HEIGHT; y += DASH * 2) {
      g.fillRect(0, y, ROAD_LEFT - 18, DASH).fillRect(
        ROAD_RIGHT + 18,
        y,
        GAME_WIDTH - ROAD_RIGHT - 18,
        DASH,
      );
    }
    g.fillStyle(0x5a5f6b).fillRect(ROAD_LEFT, 0, ROAD_RIGHT - ROAD_LEFT, GAME_HEIGHT);
    for (let y = -DASH + offset, i = 0; y < GAME_HEIGHT; y += DASH / 2, i++) {
      g.fillStyle(i % 2 ? 0xffffff : 0xe63946)
        .fillRect(ROAD_LEFT - 18, y, 18, DASH / 2)
        .fillRect(ROAD_RIGHT, y, 18, DASH / 2);
    }
    g.fillStyle(0xffffff, 0.85);
    for (let lane = 1; lane < 4; lane++) {
      const x = ROAD_LEFT + lane * LANE_W - 3;
      for (let y = -DASH + offset; y < GAME_HEIGHT; y += DASH) g.fillRect(x, y, 6, DASH / 2);
    }
  }

  private render(dt: number): void {
    const sim = this.sim;
    this.drawRoad();
    const scroll = sim.speed * dt;
    for (const s of this.scenery) {
      s.y += scroll;
      if (s.y > GAME_HEIGHT + 60) s.y = Phaser.Math.Between(-200, -60);
    }

    this.player.setPosition(sim.playerX, PLAYER_Y);
    this.player.setAngle(
      this.steerX === null ? 0 : Phaser.Math.Clamp((this.steerX - sim.playerX) / 12, -8, 8),
    );

    for (const car of sim.cars) {
      let view = this.carViews.get(car.id);
      if (!view) {
        view = this.add.image(car.x, car.y, RFTex.car(car.kind)).setDepth(5);
        this.carViews.set(car.id, view);
      }
      view.setPosition(car.x, car.y).setAngle((car.targetX - car.x) / 10);
    }
    for (const p of sim.pickups) {
      let view = this.fuelViews.get(p.id);
      if (!view) {
        view = this.add.image(p.x, p.y, RFTex.fuel).setDepth(4);
        this.tweens.add({
          targets: view,
          scale: { from: 1, to: 1.15 },
          duration: 300,
          yoyo: true,
          repeat: -1,
        });
        this.fuelViews.set(p.id, view);
      }
      view.setPosition(p.x, p.y);
    }

    this.hud.meters.setText(`${formatNumber(sim.meters)} m`);
    this.hud.score.setText(`${formatNumber(sim.score)} pts`);
    this.hud.speed.setText(`${Math.round(sim.speed * 0.25)} km/h`);
    this.hud.hearts.forEach((h, i) => h.setAlpha(i < sim.lives ? 1 : 0.2));
    const ratio = sim.fuel / MAX_FUEL;
    this.hud.fuel
      .clear()
      .fillStyle(0x2c3e73)
      .fillRoundedRect(175, 124, 500, 22, 11)
      .fillStyle(ratio > 0.25 ? 0xffd23f : 0xff5d5d)
      .fillRoundedRect(175, 124, Math.max(22, 500 * ratio), 22, 11);
  }

  private gameOver(reason: 'crash' | 'fuel'): void {
    this.running = false;
    const sim = this.sim;
    const data: GameOverData = {
      gameId: 'roadfighter',
      title: reason === 'fuel' ? 'Acabou a gasolina!' : 'Fim da corrida!',
      lines: [
        `Distância: ${(sim.meters / 1000).toFixed(2)} km`,
        `Carros ultrapassados: ${sim.passed}`,
      ],
      record: { score: sim.score, details: { meters: sim.meters, passed: sim.passed } },
      parent: SceneKeys.RoadFighter,
      retry: { scene: SceneKeys.RoadFighter },
    };
    this.time.delayedCall(900, () => this.scene.launch(SceneKeys.GameOver, data));
  }
}
