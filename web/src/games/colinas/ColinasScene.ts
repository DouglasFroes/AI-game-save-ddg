import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, hint } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { BirdSim, groundY, START_TIME, type BirdEvent } from './core';

const BIRD_X = 220;
const DAY = Phaser.Display.Color.ValueToColor(0x7dd3fc);
const DUSK = Phaser.Display.Color.ValueToColor(0x7c2d12);

/** "Pássaro das Colinas": hold to dive down the hills, let go to fly — beat the sunset. */
export class ColinasScene extends MiniScene {
  private sim = new BirdSim();
  private sky!: Phaser.GameObjects.Rectangle;
  private g!: Phaser.GameObjects.Graphics;
  private bird!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Colinas, 'colinas', [0x7dd3fc, 0x38bdf8]);
  }

  create(): void {
    this.sim = new BirdSim();
    this.sky = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x7dd3fc)
      .setOrigin(0)
      .setDepth(-9);
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.bird = emojiText(this, BIRD_X, 600, '🐦', 64).setDepth(6);
    this.statusText = addText(this, GAME_WIDTH / 2, 168, '', 28, {
      color: '#ffffff',
      stroke: '#0c4a6e',
      strokeThickness: 6,
    }).setDepth(50);
    this.hintBox = hint(
      this,
      ['Segure para mergulhar na descida', 'solte no fundo para voar longe!'],
      420,
      5000,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => {
      this.hintBox?.dismiss();
      this.sim.holding = true;
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => (this.sim.holding = false));
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.handle(this.sim.step(Math.min(deltaMs, 33) / 1000));
    const s = this.sim;
    const t = 1 - Math.min(1, s.timeLeft / START_TIME);
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(DAY, DUSK, 100, t * 100);
    this.sky.setFillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
    this.setScore(s.score);
    this.statusText.setText(
      `☀️ ${Math.ceil(s.timeLeft)}s · ${Math.round(Math.hypot(s.vx, s.vy) / 3)} km/h · Perfeitos ${s.perfects}`,
    );
    this.draw();
  }

  private handle(events: BirdEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e.type === 'perfect') {
        sfx.play('star', Math.min(8, this.sim.perfects));
        burst(this, BIRD_X, this.screenY(), 0xfde047, 14, { speed: 220 });
        this.pop(BIRD_X, this.screenY() - 70, `PERFEITO +${e.bonus}s`, '#fde047', 32);
      } else if (e.type === 'bump') sfx.play('bounce');
      else {
        banner(this, 'ANOITECEU!', '#fdba74');
        sfx.play('level');
        this.finish(
          'O sol se pôs!',
          [`Distância: ${Math.floor(this.sim.x / 10)} m · Perfeitos: ${this.sim.perfects}`],
          {
            score: this.sim.score,
            details: { meters: Math.floor(this.sim.x / 10), perfect: this.sim.perfects },
          },
          900,
        );
      }
    }
  }

  /** The camera rises when the bird flies high, so it never leaves the screen. */
  private camOffset(): number {
    return Math.max(0, 420 - this.sim.y);
  }

  private screenY(): number {
    return this.sim.y + this.camOffset();
  }

  private draw(): void {
    const g = this.g.clear();
    const s = this.sim;
    const off = this.camOffset();
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    for (let sx = -10; sx <= GAME_WIDTH + 10; sx += 12)
      pts.push({ x: sx, y: groundY(s.x - BIRD_X + sx) + off });
    pts.push({ x: GAME_WIDTH + 10, y: GAME_HEIGHT }, { x: -10, y: GAME_HEIGHT });
    g.fillStyle(0x16a34a, 1).fillPoints(pts, true);
    g.lineStyle(10, 0x4ade80, 1).strokePoints(pts.slice(0, -2), false);
    const by = this.screenY();
    this.bird.setPosition(BIRD_X, by - 26).setScale(s.holding ? 0.85 : 1, s.holding ? 1.12 : 1);
    this.bird.setAngle(Phaser.Math.RadToDeg(Math.atan2(s.vy, s.vx)) * 0.6);
    if (off > 0)
      g.fillStyle(0xffffff, 0.7).fillTriangle(BIRD_X - 12, 250, BIRD_X + 12, 250, BIRD_X, 232);
  }
}
