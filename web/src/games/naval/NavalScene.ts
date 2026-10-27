import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { burst, flash, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  col,
  FLEET,
  Fleet,
  Hunter,
  hunterSkill,
  row,
  SHIP_NAMES,
  SIZE,
  winPoints,
  type Ship,
} from './core';

const BIG = 60;
const BX = (GAME_WIDTH - SIZE * BIG) / 2;
const BY = 310;
const MINI = 30;
const MX = 60;
const MY = 960;
const LETTERS = 'ABCDEFGHIJ';

type Phase = 'place' | 'battle' | 'over';

/** "Batalha Naval": sink the robot's fleet before it sinks yours. A hit keeps the turn. */
export class NavalScene extends MiniScene {
  private mine = new Fleet();
  private foe = new Fleet();
  private hunter = new Hunter(0.5);
  private phase: Phase = 'place';
  private yourTurn = true;
  private busy = false;
  private wins = 0;
  private points = 0;
  private shots = 0;
  private round = 0;
  private status!: Phaser.GameObjects.Text;
  private big!: Phaser.GameObjects.Container;
  private mini!: Phaser.GameObjects.Container;
  private panel!: Phaser.GameObjects.Container;
  private extras: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super(SceneKeys.Naval, 'naval', [0x06284d, 0x0a5a8f]);
  }

  create(): void {
    this.wins = 0;
    this.points = 0;
    this.round = 0;
    this.busy = false;
    this.extras = [];
    this.frame();
    this.status = addText(this, GAME_WIDTH / 2, 248, '', 38, {
      color: '#ffffff',
      stroke: '#06284d',
      strokeThickness: 8,
    });
    this.big = this.add.container(0, 0);
    this.mini = this.add.container(0, 0);
    this.panel = this.add.container(0, 0);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.tap(p));
    this.startRound();
  }

  // ---------------------------------------------------------------- drawing

  private sea(
    layer: Phaser.GameObjects.Container,
    ox: number,
    oy: number,
    cell: number,
    labels: boolean,
  ): void {
    const g = this.add.graphics();
    const w = SIZE * cell;
    g.fillStyle(0x000000, 0.3).fillRoundedRect(ox - 4, oy + 4, w + 12, w + 12, 14);
    g.fillStyle(0x0b3d6b).fillRoundedRect(ox - 8, oy - 8, w + 16, w + 16, 14);
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const shade = (r + c) % 2 === 0 ? 0x1769a8 : 0x1a73b8;
        g.fillStyle(shade).fillRect(ox + c * cell, oy + r * cell, cell, cell);
      }
    }
    g.lineStyle(1, 0xffffff, 0.14);
    for (let i = 0; i <= SIZE; i++) {
      g.lineBetween(ox + i * cell, oy, ox + i * cell, oy + w);
      g.lineBetween(ox, oy + i * cell, ox + w, oy + i * cell);
    }
    layer.add(g);
    if (!labels) return;
    const style = { color: '#9fd3ff', weight: 'normal' as const };
    for (let i = 0; i < SIZE; i++) {
      layer.add(addText(this, ox + i * cell + cell / 2, oy - 22, LETTERS[i]!, 20, style));
      layer.add(addText(this, ox - 22, oy + i * cell + cell / 2, String(i + 1), 20, style));
    }
  }

  private ship(
    layer: Phaser.GameObjects.Container,
    s: Ship,
    ox: number,
    oy: number,
    cell: number,
    sunk = false,
  ): void {
    const g = this.add.graphics();
    const x = ox + col(s.cells[0]!) * cell + 3;
    const y = oy + row(s.cells[0]!) * cell + 3;
    const w = (s.horizontal ? s.size * cell : cell) - 6;
    const h = (s.horizontal ? cell : s.size * cell) - 6;
    g.fillStyle(0x000000, 0.35).fillRoundedRect(x + 2, y + 4, w, h, cell * 0.28);
    g.fillStyle(sunk ? 0x7f1d1d : 0x94a3b8).fillRoundedRect(x, y, w, h, cell * 0.28);
    const inset = 4;
    g.fillStyle(sunk ? 0xb91c1c : 0xcbd5e1).fillRoundedRect(
      x + inset,
      y + inset,
      w - inset * 2,
      h - inset * 2,
      cell * 0.2,
    );
    g.fillStyle(0x475569, 0.9);
    for (let k = 0; k < s.size; k++) {
      const cx = s.horizontal ? x + cell * (k + 0.5) - 3 : x + w / 2;
      const cy = s.horizontal ? y + h / 2 : y + cell * (k + 0.5) - 3;
      g.fillCircle(cx, cy, cell * 0.11);
    }
    layer.add(g);
  }

  private marker(
    layer: Phaser.GameObjects.Container,
    i: number,
    hit: boolean,
    ox: number,
    oy: number,
    cell: number,
    animate: boolean,
  ): void {
    const x = ox + col(i) * cell + cell / 2;
    const y = oy + row(i) * cell + cell / 2;
    if (hit) {
      const fire = this.add.circle(x, y, cell * 0.3, 0xf97316).setStrokeStyle(2, 0xfde047);
      const core = this.add.circle(x, y, cell * 0.15, 0xfef08a);
      layer.add([fire, core]);
      this.tweens.add({
        targets: fire,
        scale: { from: 0.9, to: 1.15 },
        duration: 380 + (i % 5) * 40,
        yoyo: true,
        repeat: -1,
      });
      if (animate) {
        burst(this, x, y, 0xfb923c, 16, { speed: 280 });
        shockwave(this, x, y, 0xfde047, cell * 1.1);
      }
      return;
    }
    layer.add(this.add.circle(x, y, cell * 0.11, 0xffffff, 0.9));
    if (!animate) return;
    const ring = this.add.circle(x, y, cell * 0.12).setStrokeStyle(3, 0xffffff, 0.9);
    layer.add(ring);
    this.tweens.add({
      targets: ring,
      scale: 3.2,
      alpha: 0,
      duration: 520,
      onComplete: () => ring.destroy(),
    });
  }

  /** The player's own fleet, small, with the robot's shots on it. */
  private drawMini(): void {
    this.mini.removeAll(true);
    this.sea(this.mini, MX, MY, MINI, false);
    for (const s of this.mine.ships) this.ship(this.mini, s, MX, MY, MINI, this.mine.isSunk(s));
    this.mine.shots.forEach((v, i) => {
      if (v !== 0) this.marker(this.mini, i, v === 2, MX, MY, MINI, false);
    });
    this.mini.add(
      addText(this, MX + (SIZE * MINI) / 2, MY - 22, 'SUA FROTA', 20, { color: '#9fd3ff' }),
    );
  }

  /** Status of both fleets: one bar per ship, red once sunk. */
  private drawPanel(): void {
    this.panel.removeAll(true);
    const x0 = 430;
    const rows: ReadonlyArray<readonly [string, Fleet, number]> = [
      ['FROTA INIMIGA', this.foe, 960],
      ['SUA FROTA', this.mine, 1110],
    ];
    for (const [label, fleet, y] of rows) {
      this.panel.add(addText(this, x0, y - 6, label, 22, { color: '#9fd3ff' }).setOrigin(0, 0.5));
      const g = this.add.graphics();
      fleet.ships.forEach((s, k) => {
        const sunk = fleet.isSunk(s);
        g.fillStyle(sunk ? 0x7f1d1d : 0x94a3b8, sunk ? 0.8 : 1).fillRoundedRect(
          x0 + k * 56,
          y + 24,
          48,
          16,
          6,
        );
      });
      this.panel.add(g);
      const left = fleet.ships.length - fleet.sunkCount;
      this.panel.add(
        addText(this, x0, y + 74, `${left} navio${left === 1 ? '' : 's'} à tona`, 22, {
          color: '#ffffff',
          weight: 'normal',
        }).setOrigin(0, 0.5),
      );
    }
  }

  // ---------------------------------------------------------------- flow

  private clearExtras(): void {
    for (const o of this.extras) o.destroy();
    this.extras = [];
  }

  private startRound(): void {
    this.round++;
    this.phase = 'place';
    this.busy = false;
    this.yourTurn = true;
    this.shots = 0;
    this.mine = Fleet.random(Math.random);
    this.foe = Fleet.random(Math.random);
    this.hunter = new Hunter(hunterSkill(this.wins));
    this.mini.removeAll(true);
    this.panel.removeAll(true);
    this.showPlacement();
  }

  private showPlacement(): void {
    this.clearExtras();
    this.big.removeAll(true);
    this.sea(this.big, BX, BY, BIG, true);
    for (const s of this.mine.ships) this.ship(this.big, s, BX, BY, BIG);
    this.status.setText('Sua frota está pronta?');
    const shuffle = new Button(
      this,
      GAME_WIDTH / 2 - 170,
      1010,
      'EMBARALHAR',
      () => {
        this.mine = Fleet.random(Math.random);
        this.showPlacement();
      },
      { width: 310, height: 96, fontSize: 32, color: 0x0ea5e9, shade: 0x075985 },
    );
    const go = new Button(this, GAME_WIDTH / 2 + 170, 1010, 'COMEÇAR', () => this.startBattle(), {
      width: 310,
      height: 96,
      fontSize: 34,
      color: 0xef4444,
      shade: 0xa11a1a,
    });
    const note = addText(
      this,
      GAME_WIDTH / 2,
      1120,
      `Rodada ${this.round} · ${this.wins > 0 ? 'o robô está mais esperto' : 'acertou, joga de novo'}`,
      24,
      { color: '#9fd3ff', weight: 'normal' },
    );
    this.extras.push(shuffle, go, note);
  }

  private startBattle(): void {
    this.clearExtras();
    this.phase = 'battle';
    this.big.removeAll(true);
    this.sea(this.big, BX, BY, BIG, true);
    this.drawMini();
    this.drawPanel();
    this.beginTurn(true);
    getServices(this).sfx.play('start');
  }

  private beginTurn(you: boolean): void {
    this.yourTurn = you;
    this.status.setText(you ? 'Sua vez · toque na água inimiga' : 'O robô está atirando…');
    if (!you) {
      this.busy = true;
      this.time.delayedCall(700, () => this.robotShot());
    } else this.busy = false;
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.ended || this.phase !== 'battle' || !this.yourTurn || this.busy) return;
    const c = Math.floor((p.x - BX) / BIG);
    const r = Math.floor((p.y - BY) / BIG);
    if (c < 0 || c >= SIZE || r < 0 || r >= SIZE) return;
    const i = r * SIZE + c;
    const res = this.foe.shoot(i);
    if (res.repeat) return;
    this.shots++;
    this.marker(this.big, i, res.hit, BX, BY, BIG, true);
    getServices(this).sfx.play(res.hit ? 'boom' : 'pop');
    if (res.sunk) this.sunk(res.sunk, true);
    this.drawPanel();
    if (this.foe.allSunk) {
      this.win();
      return;
    }
    if (res.hit) {
      this.status.setText(
        res.sunk
          ? `Afundou o ${SHIP_NAMES[res.sunk.size]}! Atire de novo`
          : 'Acertou! Atire de novo',
      );
      return;
    }
    this.busy = true;
    this.time.delayedCall(450, () => this.beginTurn(false));
  }

  private sunk(s: Ship, enemy: boolean): void {
    flash(this, 0xf97316, 0.2, 260);
    this.cameras.main.shake(180, 0.006);
    if (enemy) {
      this.ship(this.big, s, BX, BY, BIG, true);
      // Keep the pegs above the revealed hull.
      for (const i of s.cells) this.marker(this.big, i, true, BX, BY, BIG, false);
    }
    const name = SHIP_NAMES[s.size];
    this.pop(
      GAME_WIDTH / 2,
      290,
      enemy ? `${name} afundado!` : `Perdeu o ${name}!`,
      enemy ? '#ffe066' : '#fca5a5',
      40,
    );
  }

  private robotShot(): void {
    if (this.ended) return;
    const i = this.hunter.nextShot(Math.random);
    const res = this.mine.shoot(i);
    this.hunter.observe(i, res);
    this.marker(this.mini, i, res.hit, MX, MY, MINI, true);
    getServices(this).sfx.play(res.hit ? 'boom' : 'pop');
    if (res.sunk) this.sunk(res.sunk, false);
    this.drawPanel();
    if (this.mine.allSunk) {
      this.lose();
      return;
    }
    if (res.hit) {
      this.status.setText('O robô acertou e atira de novo…');
      this.time.delayedCall(800, () => this.robotShot());
    } else this.beginTurn(true);
  }

  private win(): void {
    this.phase = 'over';
    this.wins++;
    const left = FLEET.length - this.mine.sunkCount;
    const gained = winPoints(this.wins - 1, this.shots, left);
    this.points += gained;
    this.setScore(this.points);
    this.status.setText('Frota inimiga destruída!');
    this.pop(GAME_WIDTH / 2, 330, `+${gained}`, '#ffe066', 64);
    getServices(this).sfx.play('win');
    burst(this, GAME_WIDTH / 2, BY + 300, 0xfde047, 36, { speed: 560 });
    this.time.delayedCall(2000, () => this.startRound());
  }

  private lose(): void {
    this.phase = 'over';
    // Show where the rest of the robot's fleet was hiding.
    for (const s of this.foe.ships) if (!this.foe.isSunk(s)) this.ship(this.big, s, BX, BY, BIG);
    this.finish(
      'Sua frota afundou!',
      [`Vitórias: ${this.wins}`],
      { score: this.points, details: { wins: this.wins } },
      1600,
    );
  }
}
