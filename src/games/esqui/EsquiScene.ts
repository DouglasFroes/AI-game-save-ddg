import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { GATE_W, GATES, PENALTY, PISTE_L, PISTE_R, SkiSim, type SkiEvent } from './core';

const CX = GAME_WIDTH / 2;
const SKIER_Y = 400;

/** "Slalom": point your finger where the skier should go; pass every gate, avoid the trees. */
export class EsquiScene extends MiniScene {
  private sim = new SkiSim();
  private world!: Phaser.GameObjects.Graphics;
  private tracks!: Phaser.GameObjects.Graphics;
  private skier!: Phaser.GameObjects.Container;
  private skis!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private trail: Array<{ x: number; y: number; h: number }> = [];
  private started = false;
  private tutorial?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Esqui, 'esqui', [0xe0f2fe, 0xf8fafc]);
  }

  create(): void {
    this.sim = new SkiSim();
    this.trail = [];
    this.started = false;
    this.frame('0,00 s');
    this.scoreText.setFontSize(56).setColor('#0c4a6e').setStroke('#ffffff', 8);
    this.tracks = this.add.graphics().setDepth(0);
    this.world = this.add.graphics().setDepth(1);
    this.skis = this.add.graphics();
    const body = this.add.graphics();
    body.fillStyle(0x000000, 0.12).fillEllipse(4, 10, 40, 22);
    body.fillStyle(0xdc2626).fillRoundedRect(-14, -16, 28, 30, 10);
    body.fillStyle(0x1e3a8a).fillCircle(0, -24, 11);
    body.fillStyle(0xfde047).fillRect(-11, -28, 22, 6);
    body.lineStyle(3, 0x334155).lineBetween(-16, -4, -24, 26).lineBetween(16, -4, 24, 26);
    this.skier = this.add.container(CX, SKIER_Y, [this.skis, body]).setDepth(3);
    this.info = addText(this, CX, 170, '', 26, { color: '#0c4a6e' }).setDepth(5);
    const steer = (p: Phaser.Input.Pointer) => {
      if (p.y < 130 || !p.isDown) return;
      this.tutorial?.dismiss();
      this.started = true;
      this.sim.steer(Phaser.Math.Clamp((p.x - this.skier.x) / 190, -1, 1) * 1.4);
    };
    this.input.on(Phaser.Input.Events.POINTER_DOWN, steer);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, steer);
    this.input.on(Phaser.Input.Events.POINTER_UP, () => this.sim.steer(0));
    this.tutorial = hint(
      this,
      [
        'Segure o dedo para onde quer ir',
        'Passe ENTRE as bandeiras de cada portão',
        'Reto = rápido · curva = freia',
      ],
      900,
      6000,
    );
  }

  private sy(y: number): number {
    return SKIER_Y + (y - this.sim.y);
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    if (this.started) this.handle(this.sim.step(dt));
    const s = this.sim;
    this.skier.setPosition(s.x, SKIER_Y);
    // The skis point where he is going (the whole skier turns with them).
    this.skier.setRotation(s.down > 0 ? 1.5 : -s.heading);
    const k = this.skis.clear();
    k.lineStyle(6, 0x0f172a);
    for (const off of [-8, 8]) k.lineBetween(off, -30, off, 34);
    if (s.down === 0 && this.started) {
      this.trail.push({ x: s.x, y: s.y, h: s.heading });
      if (this.trail.length > 240) this.trail.shift();
    }
    this.drawTracks();
    this.drawWorld();
    this.setScore(`${s.total.toFixed(2).replace('.', ',')} s`);
    this.info.setText(
      `Portões ${s.passed + s.missed}/${GATES}${s.missed ? ` · perdidos ${s.missed}` : ''} · ${Math.round(s.v * 0.12)} km/h`,
    );
  }

  private drawTracks(): void {
    const g = this.tracks.clear();
    g.lineStyle(3, 0xbfdbfe, 0.9);
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1]!;
      const b = this.trail[i]!;
      for (const off of [-7, 7])
        g.lineBetween(
          a.x + off * Math.cos(a.h),
          this.sy(a.y),
          b.x + off * Math.cos(b.h),
          this.sy(b.y),
        );
    }
  }

  private drawWorld(): void {
    const s = this.sim;
    const g = this.world.clear();
    const top = s.y - SKIER_Y - 60;
    const bottom = s.y + 1280 - SKIER_Y + 60;
    // Piste edges (orange markers).
    for (let y = Math.ceil(top / 120) * 120; y < bottom; y += 120) {
      g.fillStyle(0xf97316)
        .fillRect(PISTE_L - 6, this.sy(y), 6, 40)
        .fillRect(PISTE_R, this.sy(y), 6, 40);
      g.fillStyle(0xcbd5e1, 0.5).fillCircle(120 + ((y * 7) % 480), this.sy(y + 60), 3);
    }
    const next = s.nextGate;
    for (const gate of s.course.gates) {
      if (gate.y < top || gate.y > bottom) continue;
      const y = this.sy(gate.y);
      const color = gate.color === 'red' ? 0xef4444 : 0x2563eb;
      const alpha = gate.state === 'ahead' ? 1 : 0.35;
      if (gate === next)
        g.fillStyle(color, 0.12 + 0.08 * Math.sin(this.time.now / 120)).fillRect(
          gate.x - GATE_W / 2,
          y - 14,
          GATE_W,
          28,
        );
      for (const side of [-1, 1]) {
        const px = gate.x + (side * GATE_W) / 2;
        g.fillStyle(0x000000, 0.12 * alpha).fillEllipse(px + 8, y + 4, 20, 8);
        g.lineStyle(5, 0x334155, alpha).lineBetween(px, y, px, y - 56);
        g.fillStyle(color, alpha).fillTriangle(px, y - 56, px + side * -34, y - 44, px, y - 30);
      }
      if (gate.state === 'missed')
        g.lineStyle(4, 0xef4444, 0.6)
          .lineBetween(gate.x - 20, y - 20, gate.x + 20, y + 20)
          .lineBetween(gate.x + 20, y - 20, gate.x - 20, y + 20);
    }
    for (const t of s.course.trees) {
      if (t.y < top || t.y > bottom) continue;
      const y = this.sy(t.y);
      g.fillStyle(0x000000, 0.12).fillEllipse(t.x + 10, y + 8, 50, 18);
      g.fillStyle(0x78350f).fillRect(t.x - 5, y - 8, 10, 16);
      g.fillStyle(0x166534).fillTriangle(t.x - 30, y, t.x + 30, y, t.x, y - 70);
      g.fillStyle(0x15803d).fillTriangle(t.x - 24, y - 26, t.x + 24, y - 26, t.x, y - 86);
      g.fillStyle(0xffffff).fillTriangle(t.x - 9, y - 70, t.x + 9, y - 70, t.x, y - 86);
    }
    const fy = this.sy(s.course.finishY);
    if (fy < 1300) {
      for (let i = 0; i < 16; i++)
        for (let j = 0; j < 2; j++)
          g.fillStyle((i + j) % 2 ? 0x111827 : 0xffffff).fillRect(
            PISTE_L + i * 40,
            fy + j * 20,
            40,
            20,
          );
      g.fillStyle(0xef4444)
        .fillRect(PISTE_L, fy - 90, 10, 90)
        .fillRect(PISTE_R - 10, fy - 90, 10, 90);
    }
  }

  private handle(events: SkiEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e.type === 'gate') {
        sfx.play('coin', Math.min(7, this.sim.passed % 8));
        const gate = this.sim.course.gates[e.index]!;
        shockwave(this, gate.x, this.sy(gate.y), e.color === 'red' ? 0xef4444 : 0x2563eb, 60);
      } else if (e.type === 'missed') {
        sfx.play('hit');
        this.pop(this.sim.x, SKIER_Y - 70, `+${PENALTY}s`, '#ef4444', 44);
      } else if (e.type === 'pole') this.cameras.main.shake(100, 0.004);
      else if (e.type === 'crash') {
        sfx.play('boom');
        sfx.vibrate([90, 40, 60]);
        burst(this, this.sim.x, SKIER_Y, 0xffffff, 26);
        flash(this, 0xffffff, 0.4, 260);
        banner(this, 'CAIU!', '#0c4a6e', 640);
      } else if (e.type === 'edge') sfx.play('bounce');
      else if (e.type === 'finish') {
        const s = this.sim;
        sfx.play('win');
        burst(this, s.x, SKIER_Y, 0xfde047, 30);
        this.finish(
          s.missed === 0 ? 'Descida perfeita! ⛷️' : 'Chegou!',
          [
            `Tempo: ${e.time.toFixed(2).replace('.', ',')} s (${s.missed} portão${s.missed === 1 ? '' : 'ões'} perdido${s.missed === 1 ? '' : 's'})`,
          ],
          { score: s.score, details: { time: Math.round(e.time * 100), missed: s.missed } },
        );
      }
    }
  }
}
