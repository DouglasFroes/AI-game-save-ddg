import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { ambient, banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { heartsLabel, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { BLAST_R, CadeiaSim, FIELD, type Atom, type CadeiaEvent } from './core';

/** Atom colour from a 0..1 hue: bright and a little soft, so additive glows stack nicely. */
const hex = (hue: number): number => {
  const c = Phaser.Display.Color.HSVToRGB(hue, 0.65, 1) as Phaser.Types.Display.ColorObject;
  return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
};

/** "Reação em Cadeia": a single tap, a screen full of explosions. */
export class CadeiaScene extends MiniScene {
  private sim = new CadeiaSim();
  private g!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private aim: { x: number; y: number } | null = null;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Cadeia, 'cadeia', [0x1a0510, 0x4c0519]);
  }

  create(): void {
    this.sim = new CadeiaSim();
    this.aim = null;
    this.frame();
    ambient(this, 0xfda4af, 16);
    this.g = this.add.graphics().setDepth(5);
    this.hud = addText(this, GAME_WIDTH / 2, 160, '', 30, {
      color: '#ffe4e6',
      stroke: '#1a0510',
      strokeThickness: 6,
    }).setDepth(50);
    this.hintBox = hint(
      this,
      ['Toque UMA vez para soltar a explosão', 'Os átomos tocados explodem também!'],
      1130,
      6000,
    );

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      this.aim = { x: p.x, y: p.y };
    });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      this.aim = { x: p.x, y: p.y };
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      if (this.ended || this.sim.state !== 'aim') return;
      this.hintBox?.dismiss();
      this.handle(this.sim.tap(p.x, p.y));
    });
  }

  override update(time: number, deltaMs: number): void {
    if (this.ended) return;
    this.handle(this.sim.step(Math.min(deltaMs, 40) / 1000));
    this.setScore(this.sim.score);
    const { sim } = this;
    this.hud.setText(`Fase ${sim.level} · ${heartsLabel(sim.lives)} · ${sim.popped}/${sim.target}`);
    this.draw(time);
  }

  private handle(events: CadeiaEvent[]): void {
    const { sfx } = getServices(this);
    for (const ev of events) {
      switch (ev.type) {
        case 'seed':
          sfx.play('boom');
          sfx.vibrate(20);
          shockwave(this, ev.x, ev.y, 0xffffff, BLAST_R);
          break;
        case 'pop':
          sfx.play('coin', ev.chain);
          if (ev.chain % 4 === 0) sfx.vibrate(10);
          burst(this, ev.x, ev.y, hex(ev.hue), 12, { speed: 240, size: 6 });
          this.pop(
            ev.x,
            ev.y - 20,
            ev.chain >= 5 ? `x${ev.chain}` : `+${ev.points}`,
            '#ffffff',
            ev.chain >= 8 ? 54 : 38,
          );
          if (ev.chain === 10 || ev.chain === 20 || ev.chain === 30) {
            banner(this, `CADEIA ${ev.chain}!`, '#ffd166');
            flash(this, 0xffffff, 0.2);
          }
          break;
        case 'levelEnd':
          if (ev.cleared) {
            sfx.play('level');
            banner(this, 'FASE COMPLETA!', '#86efac');
            if (ev.bonus > 0) this.pop(GAME_WIDTH / 2, 560, `+${ev.bonus}`, '#ffd166', 56);
          } else {
            sfx.play('hit');
            this.cameras.main.shake(180, 0.006);
            banner(this, `Faltaram ${ev.target - ev.popped}`, '#fda4af');
          }
          this.time.delayedCall(1700, () => {
            if (this.sim.over) {
              this.finish(
                'Fim da reação!',
                [`Fase: ${this.sim.level}`, `Maior cadeia: ${this.sim.bestChain}`],
                {
                  score: this.sim.score,
                  details: { level: this.sim.level, chain: this.sim.bestChain },
                },
                200,
              );
            } else {
              this.sim.advance();
              this.hintBox = undefined;
            }
          });
          break;
      }
    }
  }

  private draw(time: number): void {
    const { sim } = this;
    const g = this.g.clear();
    g.fillStyle(0x000000, 0.35).fillRoundedRect(
      FIELD.x - 8,
      FIELD.y - 8,
      FIELD.w + 16,
      FIELD.h + 16,
      28,
    );
    g.lineStyle(3, 0xfb7185, 0.35).strokeRoundedRect(
      FIELD.x - 8,
      FIELD.y - 8,
      FIELD.w + 16,
      FIELD.h + 16,
      28,
    );

    for (const a of sim.atoms) {
      if (a.phase === 'gone') continue;
      this.drawAtom(g, a, time);
    }

    if (sim.state === 'aim' && this.aim && this.aim.y > FIELD.y) {
      g.lineStyle(3, 0xffffff, 0.35).strokeCircle(this.aim.x, this.aim.y, BLAST_R);
      g.fillStyle(0xffffff, 0.06).fillCircle(this.aim.x, this.aim.y, BLAST_R);
    }
  }

  private drawAtom(g: Phaser.GameObjects.Graphics, a: Atom, time: number): void {
    const c = hex(a.hue);
    if (a.phase === 'idle') {
      const pulse = 1 + Math.sin(time / 200 + a.id) * 0.1;
      g.fillStyle(c, 0.22).fillCircle(a.x, a.y, a.r * 1.9 * pulse);
      g.fillStyle(c).fillCircle(a.x, a.y, a.r);
      g.fillStyle(0xffffff, 0.7).fillCircle(a.x - 4, a.y - 4, 4);
      return;
    }
    const k = a.phase === 'fade' ? Math.max(0, 1 - a.t / 0.3) : 1;
    g.fillStyle(c, 0.16 * k).fillCircle(a.x, a.y, a.r * 1.25);
    g.fillStyle(c, 0.34 * k).fillCircle(a.x, a.y, a.r);
    g.lineStyle(5, 0xffffff, 0.75 * k).strokeCircle(a.x, a.y, a.r);
    g.fillStyle(0xffffff, 0.5 * k).fillCircle(a.x, a.y, a.r * 0.28);
  }
}
