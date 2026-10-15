import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { formatNumber } from '@/platform/ranking';
import type { GameOverData } from '@/platform/scenes/GameOverScene';
import { addText, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  GRAU_ALTO,
  GrauSim,
  LOOP,
  MAX_COMBO,
  WHEELIE_MIN,
  type CrashReason,
  type GrauEvent,
  type Segment,
} from './core';
import { GrauWorld } from './world3d';

/** Fixed simulation step: the wheelie balance is stiff, so it must not depend on the frame rate. */
const STEP = 1 / 120;
const MAX_DT = 1 / 20;
/** Right side of the screen below the HUD: hold to pop a wheelie. */
const THROTTLE_MIN_X = 330;
const HUD_BOTTOM = 175;

const GAUGE = { x: 54, top: 330, bottom: 790, w: 30 };
const CRASH_TITLES: Record<CrashReason, string> = {
  car: 'Bateu no carro!',
  loop: 'Empinou demais!',
  pothole: 'Caiu no buraco!',
};

/** "Grau 3D": hold to wheelie through an endless city, pick streets at the crossings. */
export class GrauScene extends Phaser.Scene {
  private sim = new GrauSim();
  private world!: GrauWorld;
  private running = false;
  private acc = 0;
  private segment!: Segment;
  private wasAlto = false;

  private hud!: {
    score: Phaser.GameObjects.Text;
    meters: Phaser.GameObjects.Text;
    speed: Phaser.GameObjects.Text;
    combo: Phaser.GameObjects.Text;
    gauge: Phaser.GameObjects.Graphics;
    grauLabel: Phaser.GameObjects.Text;
    throttle: Phaser.GameObjects.Graphics;
  };
  private keys?: {
    up: Phaser.Input.Keyboard.Key[];
    left: Phaser.Input.Keyboard.Key[];
    right: Phaser.Input.Keyboard.Key[];
  };

  constructor() {
    super(SceneKeys.Grau);
  }

  init(): void {
    this.sim = new GrauSim();
    this.segment = this.sim.segment;
    this.running = false;
    this.acc = 0;
    this.wasAlto = false;
  }

  create(): void {
    this.world = GrauWorld.get(this.game.canvas);
    this.world.start(this.sim);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.world.stop());

    this.buildHud();
    this.bindInput();
    this.countdown();
    if (import.meta.env.DEV) (window as unknown as { __grau?: GrauScene }).__grau = this;
  }

  // ── Input ───────────────────────────────────────────────────────────────

  private bindInput(): void {
    this.input.addPointer(2);
    const kb = this.input.keyboard;
    if (kb) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      const keys = (...codes: number[]) => codes.map((c) => kb.addKey(c));
      this.keys = {
        up: keys(K.SPACE, K.UP, K.W),
        left: keys(K.LEFT, K.A),
        right: keys(K.RIGHT, K.D),
      };
    }
    const laneButton = (x: number, label: string, dir: -1 | 1) => {
      const g = this.add.graphics().setDepth(20);
      g.fillStyle(0x0b1430, 0.45).fillCircle(0, 0, 74);
      g.lineStyle(5, 0xffffff, 0.8).strokeCircle(0, 0, 74);
      g.setPosition(x, 1150);
      addText(this, x, 1150, label, 60, { color: COLORS.textLight }).setDepth(21);
      const zone = this.add.zone(x, 1150, 170, 170).setInteractive().setDepth(22);
      zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
        if (!this.running) return;
        this.sim.steer(dir);
        g.setScale(0.9);
        this.time.delayedCall(90, () => g.setScale(1));
      });
    };
    laneButton(100, '◀', -1);
    laneButton(262, '▶', 1);
  }

  private throttleHeld(): boolean {
    if (this.keys?.up.some((k) => k.isDown)) return true;
    return this.input.manager.pointers.some(
      (p) => p.isDown && p.x >= THROTTLE_MIN_X && p.y >= HUD_BOTTOM,
    );
  }

  private steerKeys(): void {
    if (!this.keys) return;
    if (this.keys.left.some((k) => Phaser.Input.Keyboard.JustDown(k))) this.sim.steer(-1);
    if (this.keys.right.some((k) => Phaser.Input.Keyboard.JustDown(k))) this.sim.steer(1);
  }

  // ── Loop ────────────────────────────────────────────────────────────────

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, MAX_DT);
    const throttle = this.running && this.throttleHeld();
    if (this.running) {
      this.steerKeys();
      this.acc += dt;
      while (this.acc >= STEP && this.running) {
        this.acc -= STEP;
        for (const e of this.sim.step(STEP, throttle)) this.onEvent(e);
      }
    }
    this.world.update(this.sim, dt, throttle);
    this.updateHud(throttle);
  }

  private onEvent(e: GrauEvent): void {
    const { sfx } = getServices(this);
    switch (e.type) {
      case 'block':
        this.world.onBlock(this.sim, this.segment);
        this.segment = e.segment;
        break;
      case 'overtake':
        break;
      case 'pass':
        if (e.bonus > 5) this.popup(`+${e.bonus} ULTRAPASSOU`, '#9bf6ff');
        break;
      case 'pothole':
        sfx.play('star', 1);
        this.popup(`+${e.bonus} VOOU NO BURACO!`, '#caffbf');
        break;
      case 'bump':
        sfx.vibrate(25);
        this.world.bump(0.35);
        break;
      case 'combo':
        sfx.play('star', Math.min(4, e.combo - 1));
        this.popup(
          e.combo === MAX_COMBO ? `COMBO MÁXIMO x${e.combo}!` : `COMBO x${e.combo}`,
          '#ffd23f',
        );
        break;
      case 'crash':
        this.running = false;
        sfx.play('hit');
        sfx.vibrate([90, 40, 90]);
        this.world.bump(0.9);
        this.gameOver(e.reason);
        break;
    }
  }

  // ── HUD ─────────────────────────────────────────────────────────────────

  private buildHud(): void {
    const bar = this.add.graphics().setDepth(20);
    bar.fillStyle(0x0b1430, 0.7).fillRoundedRect(16, 14, GAME_WIDTH - 32, 150, 28);
    iconButton(this, 72, 62, '‹', () => this.scene.start(SceneKeys.Hub)).setDepth(21);
    const light = { color: COLORS.textLight };
    const score = addText(this, 300, 58, '0', 54, light).setDepth(21);
    const meters = addText(this, 300, 118, '0 m', 26, { color: '#ffd23f' }).setDepth(21);
    const speed = addText(this, 505, 118, '0 km/h', 26, light).setDepth(21);
    const combo = addText(this, 590, 58, 'x1', 44, { color: '#ffd23f' }).setDepth(21);

    const gauge = this.add.graphics().setDepth(20);
    const grauLabel = addText(this, GAUGE.x + 4, GAUGE.top - 40, '', 26, {
      color: '#ffd23f',
      stroke: '#0b1430',
      strokeThickness: 6,
    })
      .setOrigin(0, 0.5)
      .setDepth(21);

    const throttle = this.add.graphics().setDepth(20).setPosition(585, 1110);
    addText(this, 585, 1110, 'GRAU', 40, { color: COLORS.textLight, stroke: '#0b1430' }).setDepth(
      21,
    );
    this.hud = {
      score,
      meters,
      speed,
      combo,
      gauge,
      grauLabel,
      throttle,
    };
  }

  private updateHud(throttle: boolean): void {
    const sim = this.sim;
    this.hud.score.setText(formatNumber(sim.score));
    this.hud.meters.setText(`${formatNumber(Math.floor(sim.meters))} m`);
    this.hud.speed.setText(`${Math.round(sim.speed * 3.6)} km/h`);
    this.hud.combo
      .setText(`x${sim.combo}`)
      .setScale(1 + (sim.combo > 1 ? 0.06 * Math.sin(this.time.now / 90) : 0));

    // Vertical pitch gauge: grey (ground), green (grau), gold (grau alto), red (about to flip).
    const { x, top, bottom, w } = GAUGE;
    const yAt = (pitch: number) => bottom - (pitch / LOOP) * (bottom - top);
    const g = this.hud.gauge.clear();
    g.fillStyle(0x0b1430, 0.55).fillRoundedRect(
      x - w / 2 - 8,
      top - 10,
      w + 16,
      bottom - top + 20,
      14,
    );
    g.fillStyle(0x8d99ae).fillRect(x - w / 2, yAt(WHEELIE_MIN), w, bottom - yAt(WHEELIE_MIN));
    g.fillStyle(0x5bd46f).fillRect(x - w / 2, yAt(GRAU_ALTO), w, yAt(WHEELIE_MIN) - yAt(GRAU_ALTO));
    const danger = (85 * Math.PI) / 180;
    g.fillStyle(0xffd23f).fillRect(x - w / 2, yAt(danger), w, yAt(GRAU_ALTO) - yAt(danger));
    g.fillStyle(0xff5d5d).fillRect(x - w / 2, top, w, yAt(danger) - top);
    const needle = yAt(Math.min(sim.pitch, LOOP));
    g.fillStyle(0xffffff).fillTriangle(
      x + w / 2 + 4,
      needle,
      x + w / 2 + 22,
      needle - 12,
      x + w / 2 + 22,
      needle + 12,
    );
    g.fillRect(x - w / 2 - 4, needle - 3, w + 8, 6);

    const alto = sim.grauAlto && !sim.crashed;
    if (alto && !this.wasAlto) this.popup('GRAU ALTO!', '#ffd23f');
    this.wasAlto = alto;
    this.hud.grauLabel.setText(
      sim.crashed ? '' : alto ? 'GRAU ALTO x5' : sim.wheelie ? 'GRAU x2' : '',
    );

    const t = this.hud.throttle.clear();
    t.fillStyle(throttle ? 0xff5d5d : 0x0b1430, throttle ? 0.75 : 0.45).fillCircle(0, 0, 108);
    t.lineStyle(6, 0xffffff, 0.85).strokeCircle(0, 0, 108);
    t.setScale(throttle ? 0.94 : 1);
  }

  private popup(text: string, color: string): void {
    const t = addText(this, GAME_WIDTH / 2, 520, text, 40, {
      color,
      stroke: '#0b1430',
      strokeThickness: 8,
    }).setDepth(25);
    t.setScale(0.6);
    this.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: t,
      y: t.y - 90,
      alpha: 0,
      delay: 450,
      duration: 650,
      onComplete: () => t.destroy(),
    });
  }

  private countdown(): void {
    const { sfx } = getServices(this);
    const hint = addText(
      this,
      GAME_WIDTH / 2,
      760,
      'Segure o lado direito para dar grau\n◀ ▶ trocam de faixa\nCuidado com quem ultrapassa!',
      30,
      { color: COLORS.textLight, stroke: '#0b1430', strokeThickness: 8 },
    ).setDepth(30);
    const label = addText(this, GAME_WIDTH / 2, 560, '3', 160, {
      color: '#ffd23f',
      stroke: '#0b1430',
      strokeThickness: 16,
    }).setDepth(30);
    ['3', '2', '1', 'GRAU!'].forEach((text, i) =>
      this.time.delayedCall(i * 700, () => {
        label.setText(text).setScale(1.4);
        this.tweens.add({ targets: label, scale: 1, duration: 300, ease: 'Back.easeOut' });
        sfx.play(i === 3 ? 'start' : 'click');
      }),
    );
    this.time.delayedCall(2800, () => {
      label.destroy();
      this.tweens.add({
        targets: hint,
        alpha: 0,
        delay: 1200,
        duration: 500,
        onComplete: () => hint.destroy(),
      });
      this.running = true;
    });
  }

  private gameOver(reason: CrashReason): void {
    const sim = this.sim;
    const meters = Math.floor(sim.meters);
    const bestWheelie = Math.floor(sim.bestWheelie);
    const data: GameOverData = {
      gameId: 'grau',
      title: CRASH_TITLES[reason],
      lines: [
        `Distância: ${(meters / 1000).toFixed(2)} km · Ultrapassagens: ${sim.passed}`,
        `Maior grau: ${formatNumber(bestWheelie)} m`,
      ],
      record: { score: sim.score, details: { meters, bestWheelie, passed: sim.passed } },
      parent: SceneKeys.Grau,
      retry: { scene: SceneKeys.Grau },
    };
    this.time.delayedCall(2600, () => this.scene.launch(SceneKeys.GameOver, data));
  }
}
