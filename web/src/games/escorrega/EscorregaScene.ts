import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { ambient, banner, burst, hint, shockwave } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { DIRS, EscorregaSim, type Dir, type EscorregaEvent } from './core';

const BOARD_TOP = 235;
const BOARD_H = 880;
const SWIPE_MIN = 36;

/** "Escorrega": swipe to slide on the ice until something stops you; reach the portal. */
export class EscorregaScene extends MiniScene {
  private sim = new EscorregaSim();
  private board!: Phaser.GameObjects.Graphics;
  private fx!: Phaser.GameObjects.Graphics;
  private bar!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private penguin!: Phaser.GameObjects.Text;
  private cell = 90;
  private x0 = 0;
  private y0 = 0;
  private busy = false;
  private down: { x: number; y: number } | null = null;
  private hintDir: Dir | null = null;
  private hintUntil = 0;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Escorrega, 'escorrega', [0x061a2b, 0x0c4a6e]);
  }

  create(): void {
    this.sim = new EscorregaSim();
    this.busy = false;
    this.down = null;
    this.hintDir = null;
    this.frame();
    ambient(this, 0xbae6fd, 20);
    this.board = this.add.graphics().setDepth(2);
    this.fx = this.add.graphics().setDepth(6);
    this.bar = this.add.graphics().setDepth(40);
    this.info = addText(this, GAME_WIDTH / 2, 168, '', 30, {
      color: '#e0f2fe',
      stroke: '#061a2b',
      strokeThickness: 6,
    }).setDepth(50);
    this.timeText = addText(this, GAME_WIDTH / 2, 218, '', 24, {
      color: '#ffffff',
      stroke: '#061a2b',
      strokeThickness: 5,
    }).setDepth(51);
    this.penguin = emojiText(this, 0, 0, '🐧', 70).setDepth(8);

    new Button(this, 195, 1195, '↺ Reiniciar', () => this.restart(), {
      width: 300,
      height: 92,
      fontSize: 30,
      color: 0x38bdf8,
      shade: 0x0369a1,
    }).setDepth(50);
    new Button(this, 525, 1195, '💡 Dica -6s', () => this.askHint(), {
      width: 300,
      height: 92,
      fontSize: 30,
      color: 0xfbbf24,
      shade: 0xb45309,
    }).setDepth(50);

    this.buildLevel();
    this.hintBox = hint(
      this,
      ['Deslize para qualquer lado', 'Você só para em pedras ou na borda'],
      1140,
      5000,
    );

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      this.down = p.y > BOARD_TOP && p.y < 1130 ? { x: p.x, y: p.y } : null;
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      const d = this.down;
      this.down = null;
      if (!d) return;
      const dx = p.x - d.x;
      const dy = p.y - d.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
      this.go(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    });
    const keys: Array<[string, Dir]> = [
      ['LEFT', 'left'],
      ['RIGHT', 'right'],
      ['UP', 'up'],
      ['DOWN', 'down'],
    ];
    for (const [k, dir] of keys) this.input.keyboard?.on(`keydown-${k}`, () => this.go(dir));
  }

  override update(time: number, deltaMs: number): void {
    if (this.ended) return;
    for (const ev of this.sim.step(Math.min(deltaMs, 50) / 1000)) this.handle(ev);
    this.setScore(this.sim.score);
    this.info.setText(
      `Fase ${this.sim.level} · Jogadas ${this.sim.moves} · Mínimo ${this.sim.data.par}`,
    );
    this.drawBar();
    this.drawFx(time);
  }

  private go(dir: Dir): void {
    if (this.ended || this.busy) return;
    this.hintBox?.dismiss();
    this.hintDir = null;
    for (const ev of this.sim.move(dir)) this.handle(ev);
  }

  private restart(): void {
    if (this.ended || this.busy) return;
    this.sim.restart();
    this.hintDir = null;
    const p = this.px(this.sim.pos.x, this.sim.pos.y);
    this.penguin.setPosition(p.x, p.y);
    getServices(this).sfx.play('click');
  }

  private askHint(): void {
    if (this.ended || this.busy) return;
    const dir = this.sim.hint();
    if (!dir) {
      getServices(this).sfx.play('locked');
      return;
    }
    getServices(this).sfx.play('star');
    this.hintDir = dir;
    this.hintUntil = this.time.now + 2500;
  }

  private handle(ev: EscorregaEvent): void {
    const { sfx } = getServices(this);
    switch (ev.type) {
      case 'blocked':
        sfx.play('locked');
        this.tweens.add({
          targets: this.penguin,
          x: this.penguin.x + 8,
          duration: 50,
          yoyo: true,
          repeat: 2,
        });
        break;
      case 'slide': {
        sfx.play('zap');
        this.busy = true;
        const end = ev.result.end;
        const to = this.px(end.x, end.y);
        const n = ev.result.path.length;
        this.tweens.add({
          targets: this.penguin,
          x: to.x,
          y: to.y,
          duration: 110 + n * 62,
          ease: 'Cubic.easeOut',
          onUpdate: () => {
            if (Math.random() < 0.5)
              burst(this, this.penguin.x, this.penguin.y + 26, 0xe0f2fe, 1, {
                speed: 60,
                size: 5,
                life: 400,
              });
          },
          onComplete: () => {
            this.busy = false;
            sfx.play('tick');
            this.tweens.add({
              targets: this.penguin,
              scaleX: 1.18,
              scaleY: 0.84,
              duration: 70,
              yoyo: true,
            });
          },
        });
        break;
      }
      case 'solved':
        this.time.delayedCall(260, () => {
          sfx.play(ev.perfect ? 'level' : 'win');
          sfx.vibrate([20, 30, 20]);
          const e = this.px(this.sim.data.exit.x, this.sim.data.exit.y);
          shockwave(this, e.x, e.y, 0x7dd3fc, 90);
          burst(this, e.x, e.y, 0x7dd3fc, 26, { speed: 420 });
          banner(
            this,
            ev.perfect ? 'PERFEITO!' : 'FASE COMPLETA!',
            ev.perfect ? '#fde047' : '#86efac',
          );
          this.pop(GAME_WIDTH / 2, 560, `+${ev.points}  ⏱+${ev.bonusTime}s`, '#e0f2fe', 44);
        });
        this.time.delayedCall(1250, () => {
          if (this.ended) return;
          this.sim.nextLevel();
          this.buildLevel();
          this.busy = false;
        });
        this.busy = true;
        break;
      case 'timeUp':
        this.finish(
          'Acabou o tempo!',
          [`Fases: ${this.sim.levelsDone}`, `Dicas usadas: ${this.sim.hintsUsed}`],
          { score: this.sim.score, details: { levels: this.sim.levelsDone } },
        );
        break;
    }
  }

  private px(x: number, y: number): { x: number; y: number } {
    return {
      x: this.x0 + x * this.cell + this.cell / 2,
      y: this.y0 + y * this.cell + this.cell / 2,
    };
  }

  private buildLevel(): void {
    const { data } = this.sim;
    this.cell = Math.floor(Math.min(640 / data.w, BOARD_H / data.h));
    this.x0 = (GAME_WIDTH - data.w * this.cell) / 2;
    this.y0 = BOARD_TOP + (BOARD_H - data.h * this.cell) / 2;
    const c = this.cell;
    const g = this.board.clear();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(
      this.x0 - 12,
      this.y0 - 12,
      data.w * c + 24,
      data.h * c + 24,
      26,
    );
    for (let y = 0; y < data.h; y++) {
      for (let x = 0; x < data.w; x++) {
        const px = this.x0 + x * c;
        const py = this.y0 + y * c;
        if (data.rocks[y]![x]) {
          g.fillStyle(0x1e293b).fillRoundedRect(px + 3, py + 3, c - 6, c - 6, 16);
          g.fillStyle(0x475569).fillRoundedRect(px + 8, py + 6, c - 18, c - 22, 14);
          g.fillStyle(0xffffff, 0.18).fillRoundedRect(px + 14, py + 12, c * 0.4, c * 0.16, 8);
        } else {
          g.fillStyle((x + y) % 2 ? 0xbae6fd : 0xa5d8f5).fillRoundedRect(
            px + 2,
            py + 2,
            c - 4,
            c - 4,
            10,
          );
          g.fillStyle(0xffffff, 0.35).fillRoundedRect(px + 8, py + 7, c * 0.32, 6, 3);
        }
      }
    }
    const s = this.px(data.start.x, data.start.y);
    this.penguin
      .setPosition(s.x, s.y)
      .setFontSize(Math.floor(c * 0.8))
      .setScale(1);
    this.hintDir = null;
  }

  private drawBar(): void {
    const g = this.bar.clear();
    const w = 560;
    const x = (GAME_WIDTH - w) / 2;
    const k = Phaser.Math.Clamp(this.sim.time / 90, 0, 1);
    const low = this.sim.time < 10;
    g.fillStyle(0x000000, 0.4).fillRoundedRect(x, 198, w, 40, 20);
    g.fillStyle(low ? 0xef4444 : 0x38bdf8).fillRoundedRect(
      x + 4,
      202,
      Math.max(14, (w - 8) * k),
      32,
      16,
    );
    this.timeText.setText(`${Math.ceil(this.sim.time)}s`).setColor(low ? '#fecaca' : '#ffffff');
  }

  private drawFx(time: number): void {
    const g = this.fx.clear();
    const { exit } = this.sim.data;
    const e = this.px(exit.x, exit.y);
    const r = this.cell * 0.42;
    for (let i = 0; i < 3; i++) {
      const a = time / 600 + (i * Math.PI * 2) / 3;
      g.lineStyle(5, 0x7c3aed, 0.9 - i * 0.2).strokeCircle(
        e.x + Math.cos(a) * 3,
        e.y + Math.sin(a) * 3,
        r - i * 8,
      );
    }
    g.fillStyle(0xc4b5fd, 0.5 + Math.sin(time / 200) * 0.15).fillCircle(e.x, e.y, r * 0.5);

    if (this.hintDir && this.time.now < this.hintUntil) {
      const p = this.px(this.sim.pos.x, this.sim.pos.y);
      const { dx, dy } = DIRS[this.hintDir];
      const bob = 8 + Math.sin(time / 120) * 6;
      const ax = p.x + dx * (this.cell * 0.75 + bob);
      const ay = p.y + dy * (this.cell * 0.75 + bob);
      g.fillStyle(0xfbbf24).fillPoints(
        [
          new Phaser.Geom.Point(ax + dx * 22, ay + dy * 22),
          new Phaser.Geom.Point(ax - dy * 18 - dx * 10, ay + dx * 18 - dy * 10),
          new Phaser.Geom.Point(ax + dy * 18 - dx * 10, ay - dx * 18 - dy * 10),
        ],
        true,
      );
    }
  }
}
