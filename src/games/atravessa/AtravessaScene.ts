import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { kidKey } from '@/games/bomba/art';
import { favoriteKid } from '@/games/favoriteKid';
import { Tex } from '@/platform/art/textures';
import { formatNumber } from '@/platform/ranking';
import type { GameOverData } from '@/platform/scenes/GameOverScene';
import { addText, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { COLS, CrossSim, type CrossEvent, type Hop } from './core';

const CELL = GAME_WIDTH / COLS;
const KID_Y = 820;
/** On-screen arrows below the play field. */
const PAD_TOP = 1010;
const PAD: Record<Hop, { x: number; y: number; r: number; label: string }> = {
  up: { x: GAME_WIDTH / 2, y: 1085, r: 70, label: '▲' },
  down: { x: GAME_WIDTH / 2, y: 1215, r: 50, label: '▼' },
  left: { x: 150, y: 1150, r: 70, label: '◀' },
  right: { x: GAME_WIDTH - 150, y: 1150, r: 70, label: '▶' },
};
const CAR_COLORS = [0xe63946, 0x3a86ff, 0xffd23f, 0x8338ec, 0x06d6a0, 0xff9a2e];

/** "Atravessa": hop across roads and rivers without stopping for too long. */
export class AtravessaScene extends Phaser.Scene {
  private sim = new CrossSim();
  private kid = 0;
  private camRow = 0;
  private world!: Phaser.GameObjects.Graphics;
  private kidImg!: Phaser.GameObjects.Image;
  private scoreText!: Phaser.GameObjects.Text;
  private ended = false;
  private hopT = 1;
  private down: { x: number; y: number } | null = null;
  private padGfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super(SceneKeys.Atravessa);
  }

  init(): void {
    this.sim = new CrossSim();
    this.kid = favoriteKid();
    this.camRow = 0;
    this.ended = false;
    this.hopT = 1;
  }

  private rowY(row: number): number {
    return KID_Y - (row - this.camRow) * CELL;
  }

  create(): void {
    this.world = this.add.graphics();
    this.kidImg = this.add
      .image(0, 0, kidKey(this.kid, 0))
      .setOrigin(0.5, 0.85)
      .setScale(0.62)
      .setDepth(5);
    iconButton(this, 60, 60, '‹', () => this.scene.start(SceneKeys.Hub)).setDepth(10);
    this.scoreText = addText(this, GAME_WIDTH / 2, 66, '0', 64, {
      color: COLORS.textLight,
      stroke: '#1d2b53',
      strokeThickness: 10,
    }).setDepth(10);
    const hint = addText(this, GAME_WIDTH / 2, 560, 'Use as setas (ou toque e deslize)', 36, {
      color: COLORS.textLight,
      stroke: '#1d2b53',
      strokeThickness: 8,
    }).setDepth(10);

    const panel = this.add.graphics().setDepth(8);
    panel.fillStyle(0x1d2b53, 0.92).fillRect(0, PAD_TOP, GAME_WIDTH, 1280 - PAD_TOP);
    this.padGfx = this.add.graphics().setDepth(9);
    for (const d of Object.keys(PAD) as Hop[])
      addText(this, PAD[d].x, PAD[d].y, PAD[d].label, PAD[d].r > 60 ? 54 : 40, {
        color: COLORS.textLight,
      }).setDepth(10);
    this.drawPad(null);

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y >= PAD_TOP) {
        // Arrow buttons: the nearest one to the finger.
        const dir = (Object.keys(PAD) as Hop[]).reduce((best, d) =>
          Phaser.Math.Distance.Between(p.x, p.y, PAD[d].x, PAD[d].y) <
          Phaser.Math.Distance.Between(p.x, p.y, PAD[best].x, PAD[best].y)
            ? d
            : best,
        );
        hint.destroy();
        this.drawPad(dir);
        this.time.delayedCall(110, () => this.drawPad(null));
        this.hop(dir);
        return;
      }
      if (p.y > 130) this.down = { x: p.x, y: p.y };
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      const d = this.down;
      this.down = null;
      if (!d) return;
      hint.destroy();
      const dx = p.x - d.x;
      const dy = p.y - d.y;
      if (Math.hypot(dx, dy) < 30) this.hop('up');
      else if (Math.abs(dx) > Math.abs(dy)) this.hop(dx > 0 ? 'right' : 'left');
      else this.hop(dy > 0 ? 'down' : 'up');
    });
    const kb = this.input.keyboard;
    kb?.on('keydown-UP', () => this.hop('up'));
    kb?.on('keydown-DOWN', () => this.hop('down'));
    kb?.on('keydown-LEFT', () => this.hop('left'));
    kb?.on('keydown-RIGHT', () => this.hop('right'));
    if (import.meta.env.DEV)
      (window as unknown as { __atravessa?: AtravessaScene }).__atravessa = this;
  }

  private drawPad(on: Hop | null): void {
    const g = this.padGfx.clear();
    for (const d of Object.keys(PAD) as Hop[]) {
      const b = PAD[d];
      g.fillStyle(d === on ? 0x06d6a0 : 0x3a4a7a).fillCircle(b.x, b.y, d === on ? b.r - 4 : b.r);
      g.lineStyle(5, 0xffffff, 0.85).strokeCircle(b.x, b.y, d === on ? b.r - 4 : b.r);
    }
  }

  private hop(dir: Hop): void {
    if (this.ended) return;
    const events = this.sim.hop(dir);
    if (events.length) {
      this.hopT = 0;
      if (dir === 'left') this.kidImg.setFlipX(true);
      if (dir === 'right') this.kidImg.setFlipX(false);
    }
    for (const e of events) this.onEvent(e);
  }

  private onEvent(e: CrossEvent): void {
    const { sfx } = getServices(this);
    if (e.type === 'hop') {
      sfx.play('pop', e.best ? 2 : 0);
      return;
    }
    this.ended = true;
    sfx.play('hit');
    sfx.vibrate([60, 30, 60]);
    if (e.reason === 'carro')
      this.tweens.add({ targets: this.kidImg, scaleY: 0.12, duration: 120 });
    if (e.reason === 'agua') {
      const splash = this.add.particles(this.kidImg.x, this.kidImg.y, Tex.dot, {
        speed: { min: 100, max: 300 },
        lifespan: 500,
        scale: { start: 1.2, end: 0 },
        tint: 0xffffff,
        emitting: false,
      });
      splash.setDepth(6).explode(18);
      this.tweens.add({ targets: this.kidImg, alpha: 0, scale: 0.3, duration: 300 });
    }
    if (e.reason === 'aguia') this.eagle();
    const titles = { carro: 'Atropelado!', agua: 'Caiu no rio!', aguia: 'A águia te pegou!' };
    const data: GameOverData = {
      gameId: 'atravessa',
      title: titles[e.reason],
      lines: [`Pulos para frente: ${formatNumber(this.sim.score)}`],
      record: { score: this.sim.score, details: {} },
      parent: SceneKeys.Atravessa,
      retry: { scene: SceneKeys.Atravessa },
    };
    this.time.delayedCall(1200, () => this.scene.launch(SceneKeys.GameOver, data));
  }

  /** Standing still too long: an eagle swoops in and carries the kid away. */
  private eagle(): void {
    const bird = this.add.container(-120, this.kidImg.y - 300).setDepth(8);
    const g = this.add.graphics();
    g.fillStyle(0x6d4c41).fillEllipse(0, 0, 120, 44);
    g.fillStyle(0x5d4037)
      .fillTriangle(-20, -10, -90, -60, 20, -10)
      .fillTriangle(-20, 10, -90, 60, 20, 10);
    g.fillStyle(0xffffff).fillCircle(56, -6, 16);
    g.fillStyle(0xffd23f).fillTriangle(68, -4, 92, 2, 68, 8);
    bird.add(g);
    this.tweens.add({
      targets: bird,
      x: this.kidImg.x,
      y: this.kidImg.y - 40,
      duration: 500,
      onComplete: () => {
        this.tweens.add({
          targets: [bird, this.kidImg],
          x: GAME_WIDTH + 200,
          y: '-=400',
          duration: 700,
        });
      },
    });
  }

  override update(_t: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 1 / 30);
    if (!this.ended) for (const e of this.sim.step(dt)) this.onEvent(e);
    this.camRow += (this.sim.row - this.camRow) * (1 - Math.exp(-dt * 6));
    this.hopT = Math.min(1, this.hopT + dt * 7);

    const g = this.world.clear();
    const first = Math.floor(this.camRow) - 4;
    for (let row = first + 18; row >= first; row--) {
      const lane = this.sim.lane(row);
      const y = this.rowY(row) - CELL / 2;
      if (y > 1300 || y < -CELL) continue;
      if (lane.kind === 'grass') {
        g.fillStyle(row % 2 ? 0x8bd88f : 0x7bd389).fillRect(0, y, GAME_WIDTH, CELL);
        for (const c of lane.trees) {
          g.fillStyle(0x6d4c41).fillRect(c * CELL + CELL / 2 - 8, y + CELL * 0.45, 16, CELL * 0.45);
          g.fillStyle(0x2e7d32).fillCircle(c * CELL + CELL / 2, y + CELL * 0.38, 30);
          g.fillStyle(0x43a047).fillCircle(c * CELL + CELL / 2 - 8, y + CELL * 0.3, 16);
        }
      } else if (lane.kind === 'road') {
        g.fillStyle(0x5c5f73).fillRect(0, y, GAME_WIDTH, CELL);
        g.fillStyle(0xffffff, 0.6);
        for (let x = 10; x < GAME_WIDTH; x += 90) g.fillRect(x, y + CELL - 4, 46, 4);
        for (const m of lane.movers) {
          const x = m.x * CELL;
          const w = m.len * CELL - 10;
          const color = CAR_COLORS[Math.abs(Math.floor(m.x * 7 + row)) % CAR_COLORS.length]!;
          g.fillStyle(0x1f1f2b).fillRoundedRect(x + 3, y + 12, w + 4, CELL - 20, 14);
          g.fillStyle(color).fillRoundedRect(x + 5, y + 10, w, CELL - 24, 12);
          const front = lane.speed > 0 ? x + w - 22 : x + 10;
          g.fillStyle(0xbde0fe).fillRoundedRect(front, y + 18, 16, CELL - 40, 4);
          g.fillStyle(0xfff3b0).fillCircle(lane.speed > 0 ? x + w + 2 : x + 6, y + 22, 5);
        }
      } else {
        g.fillStyle(0x4cc9f0).fillRect(0, y, GAME_WIDTH, CELL);
        g.lineStyle(3, 0xffffff, 0.35);
        for (let x = ((this.time.now / 40) % 60) - 60; x < GAME_WIDTH; x += 60)
          g.lineBetween(x, y + 30, x + 24, y + 30);
        for (const m of lane.movers) {
          g.fillStyle(0x6d3f1a).fillRoundedRect(
            m.x * CELL + 4,
            y + 14,
            m.len * CELL - 8,
            CELL - 28,
            16,
          );
          g.fillStyle(0x8d5524).fillRoundedRect(
            m.x * CELL + 8,
            y + 18,
            m.len * CELL - 16,
            CELL - 40,
            12,
          );
        }
      }
    }
    if (!this.ended) {
      const hop = Math.sin(this.hopT * Math.PI) * 26;
      this.kidImg.setPosition(
        this.sim.x * CELL + CELL / 2,
        this.rowY(this.sim.row) + CELL * 0.3 - hop,
      );
      // Warning wobble when the eagle is near.
      this.kidImg.setAngle(this.sim.idle > 5 ? Math.sin(this.time.now / 40) * 8 : 0);
    }
    this.scoreText.setText(formatNumber(this.sim.score));
  }
}
