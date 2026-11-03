import Phaser from 'phaser';
import { SceneKeys } from '@/config';
import { hint } from '@/platform/ui/juice';
import { PuzzleScene } from '@/platform/ui/puzzleGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { cross, isSolved, levelFor, solve, start, type Level, type State } from './core';

const Y0 = 360;

/** "Travessia do Rio": ferry the explorers (blue) and the cannibals (red) without any meal. */
export class RioScene extends PuzzleScene {
  private lv!: Level;
  private st!: State;
  private bm = 0;
  private bc = 0;
  private trips = 0;
  private best = 0;
  private g!: Phaser.GameObjects.Graphics;
  private msg!: Phaser.GameObjects.Text;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Rio, 'rio', [0x0369a1, 0x082f49]);
  }

  create(): void {
    this.g = this.add.graphics().setDepth(3);
    this.msg = addText(this, 360, 235, '', 28, {
      color: '#fde047',
      stroke: '#082f49',
      strokeThickness: 6,
      wrapWidth: 660,
    }).setDepth(30);
    this.begin('#bae6fd', '#082f49');
    new Button(this, 360, 1100, 'Atravessar', () => this.go(), {
      width: 400,
      height: 100,
      fontSize: 38,
      color: 0x22c55e,
      shade: 0x15803d,
    }).setDepth(20);
    new Button(this, 360, 1210, 'Reiniciar', () => this.restart(), {
      width: 260,
      height: 70,
      fontSize: 28,
      color: 0x6b7280,
      shade: 0x374151,
    }).setDepth(20);
    this.hintBox = hint(
      this,
      ['Toque nas pessoas para embarcar', 'Canibais nunca podem ser mais que exploradores'],
      1000,
      5500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.tap(p));
  }

  protected startLevel(): void {
    this.lv = levelFor(this.level);
    this.st = start(this.lv);
    this.bm = 0;
    this.bc = 0;
    this.trips = 0;
    this.best = solve(this.lv) ?? 0;
    this.msg.setText(`Barco leva até ${this.lv.cap}`);
  }

  protected override hud(): string {
    return `${this.trips} viagens`;
  }

  private restart(): void {
    if (this.locked || this.ended) return;
    this.startLevel();
  }

  /** Who is waiting on the bank the boat is at. */
  private waiting(): { m: number; c: number } {
    const here =
      this.st.boat === 0
        ? { m: this.st.m, c: this.st.c }
        : { m: this.lv.n - this.st.m, c: this.lv.n - this.st.c };
    return { m: here.m - this.bm, c: here.c - this.bc };
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.locked || this.ended) return;
    this.hintBox?.dismiss();
    const { sfx } = getServices(this);
    const w = this.waiting();
    const onBoatBank = this.st.boat === 0 ? p.x < 300 : p.x > 420;
    const bx = this.st.boat === 0 ? 260 : 460;
    if (p.y >= 780 && p.y <= 940 && Math.abs(p.x - bx) < 120) {
      // The boat: tap its left half for an explorer, right half for a cannibal.
      if (p.x < bx && this.bm > 0) this.bm--;
      else if (p.x >= bx && this.bc > 0) this.bc--;
      sfx.play('tick');
      return;
    }
    if (!onBoatBank || p.y < Y0 || p.y > 760) return;
    const full = this.bm + this.bc >= this.lv.cap;
    if (full) {
      sfx.play('locked');
      return;
    }
    if (p.y < 560) {
      if (w.m > 0) this.bm++;
    } else if (w.c > 0) this.bc++;
    sfx.play('pop');
  }

  private go(): void {
    if (this.locked || this.ended) return;
    const { sfx } = getServices(this);
    // `cross` takes the group from the bank the boat is at, so give it the full bank counts.
    const next = cross(this.lv, this.st, this.bm, this.bc);
    if (!next) {
      sfx.play('hit');
      this.cameras.main.shake(140, 0.006);
      this.msg.setText(
        this.bm + this.bc === 0 ? 'O barco precisa de alguém!' : 'Perigo! Alguém seria comido!',
      );
      return;
    }
    this.st = next;
    this.bm = 0;
    this.bc = 0;
    this.trips++;
    this.msg.setText(`Barco leva até ${this.lv.cap}`);
    sfx.play('bounce');
    if (isSolved(next)) this.solved('TODOS A SALVO!', this.trips <= this.best ? 200 : 0);
  }

  override update(t: number, dt: number): void {
    super.update(t, dt);
    const g = this.g.clear();
    g.fillStyle(0x65a30d, 1)
      .fillRect(0, Y0 - 40, 220, 440)
      .fillRect(500, Y0 - 40, 220, 440);
    g.fillStyle(0x38bdf8, 1)
      .fillRect(220, Y0 - 40, 280, 440)
      .fillRect(0, Y0 + 400, 720, 180);
    const left = {
      m: this.st.m - (this.st.boat === 0 ? this.bm : 0),
      c: this.st.c - (this.st.boat === 0 ? this.bc : 0),
    };
    const right = {
      m: this.lv.n - this.st.m - (this.st.boat === 1 ? this.bm : 0),
      c: this.lv.n - this.st.c - (this.st.boat === 1 ? this.bc : 0),
    };
    const draw = (bank: { m: number; c: number }, x: number): void => {
      const per = Math.min(4, Math.max(1, Math.ceil(Math.max(bank.m, bank.c) / 2)));
      for (let i = 0; i < bank.m; i++)
        g.fillStyle(0x2563eb, 1).fillCircle(
          x + (i % per) * 46,
          Y0 + 60 + Math.floor(i / per) * 46,
          20,
        );
      for (let i = 0; i < bank.c; i++)
        g.fillStyle(0xdc2626, 1).fillCircle(
          x + (i % per) * 46,
          Y0 + 260 + Math.floor(i / per) * 46,
          20,
        );
    };
    draw(left, 40);
    draw(right, 520);
    const bx = this.st.boat === 0 ? 260 : 460;
    g.fillStyle(0x92400e, 1).fillRoundedRect(bx - 110, 840, 220, 70, 20);
    for (let i = 0; i < this.bm; i++)
      g.fillStyle(0x2563eb, 1).fillCircle(bx - 70 + i * 40, 815, 18);
    for (let i = 0; i < this.bc; i++)
      g.fillStyle(0xdc2626, 1).fillCircle(bx + 10 + i * 40, 815, 18);
  }
}
