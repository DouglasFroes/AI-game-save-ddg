import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  BACK_Y,
  BUTTON,
  CurlingSim,
  ENDS,
  HACK,
  HOG_Y,
  RINGS,
  SHEET_L,
  SHEET_R,
  STONE_R,
  STONES_EACH,
  stopY,
  throwFromPull,
  type CurlEvent,
  type Team,
} from './core';

const CX = GAME_WIDTH / 2;
const COLOR: Record<Team, number> = { me: 0xfacc15, them: 0xef4444 };

/** "Curling": pull back to throw, choose the turn, rub the screen to sweep. Four ends. */
export class CurlingScene extends MiniScene {
  private sim = new CurlingSim();
  private stonesG!: Phaser.GameObjects.Graphics;
  private aim!: Phaser.GameObjects.Graphics;
  private board!: Phaser.GameObjects.Graphics;
  private boardTexts: Phaser.GameObjects.Text[] = [];
  private message!: Phaser.GameObjects.Text;
  private broom!: Phaser.GameObjects.Text;
  private sweepBar!: Phaser.GameObjects.Graphics;
  private curl: -1 | 1 = 1;
  private curlButtons: Button[] = [];
  private drag: { x: number; y: number } | null = null;
  private pull = { x: 0, y: 0 };
  private lastRub: { x: number; y: number } | null = null;
  private spin = 0;
  private waiting = false;
  private tutorial?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Curling, 'curling', [0x0c4a6e, 0x082f49]);
  }

  create(): void {
    this.sim = new CurlingSim();
    this.drag = null;
    this.waiting = false;
    this.boardTexts = [];
    this.frame('0');
    this.drawSheet();
    this.stonesG = this.add.graphics().setDepth(2);
    this.aim = this.add.graphics().setDepth(3);
    this.broom = emojiText(this, -100, -100, '🧹', 64).setDepth(4);
    this.sweepBar = this.add.graphics().setDepth(5);
    this.board = this.add.graphics().setDepth(5);
    this.message = addText(this, CX, 1236, '', 26, {
      color: '#ffffff',
      stroke: '#082f49',
    }).setDepth(5);
    for (const [i, dir] of ([-1, 1] as const).entries()) {
      const b = new Button(this, 90 + i * 540, 1150, dir < 0 ? '↺' : '↻', () => this.setCurl(dir), {
        width: 110,
        height: 90,
        fontSize: 50,
      }).setDepth(5);
      this.curlButtons.push(b);
    }
    this.setCurl(1);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.down(p));
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => this.move(p));
    this.input.on(Phaser.Input.Events.POINTER_UP, () => this.up());
    this.tutorial = hint(
      this,
      ['Puxe para trás para lançar', 'Escolha o giro (↺ ↻) antes', 'Esfregue a tela para varrer!'],
      820,
      5500,
    );
    this.drawBoard();
    this.nextTurn();
  }

  private setCurl(dir: -1 | 1): void {
    this.curl = dir;
    this.curlButtons.forEach((b, i) => b.setAlpha((i === 0 ? -1 : 1) === dir ? 1 : 0.45));
  }

  private drawSheet(): void {
    const g = this.add.graphics().setDepth(-5);
    g.fillStyle(0xe0f2fe).fillRect(SHEET_L, 140, SHEET_R - SHEET_L, 1140);
    g.fillStyle(0xbae6fd, 0.6);
    for (let i = 0; i < 500; i++)
      g.fillCircle(SHEET_L + ((i * 53) % (SHEET_R - SHEET_L)), 150 + ((i * 97) % 1120), 1.5);
    g.fillStyle(0x7dd3fc)
      .fillRect(SHEET_L - 14, 140, 14, 1140)
      .fillRect(SHEET_R, 140, 14, 1140);
    const ringColors = [0x2563eb, 0xffffff, 0xdc2626, 0xffffff];
    RINGS.forEach((r, i) => g.fillStyle(ringColors[i]!).fillCircle(BUTTON.x, BUTTON.y, r));
    g.lineStyle(3, 0x0c4a6e, 0.6);
    g.lineBetween(CX, 150, CX, HACK.y + 30);
    g.lineBetween(SHEET_L, BUTTON.y, SHEET_R, BUTTON.y);
    g.lineStyle(5, 0x0c4a6e).lineBetween(SHEET_L, BACK_Y, SHEET_R, BACK_Y);
    g.lineStyle(7, 0xdc2626).lineBetween(SHEET_L, HOG_Y, SHEET_R, HOG_Y);
    g.fillStyle(0x0f172a).fillRoundedRect(CX - 30, HACK.y + 30, 60, 18, 6);
  }

  private drawStone(
    g: Phaser.GameObjects.Graphics,
    s: { x: number; y: number; team: Team },
    spin: number,
    alpha = 1,
  ): void {
    g.fillStyle(0x000000, 0.25 * alpha).fillCircle(s.x + 3, s.y + 5, STONE_R);
    g.fillStyle(0x64748b, alpha).fillCircle(s.x, s.y, STONE_R);
    g.fillStyle(0x94a3b8, alpha).fillCircle(s.x, s.y, STONE_R - 5);
    g.fillStyle(COLOR[s.team], alpha).fillCircle(s.x, s.y, STONE_R - 9);
    const c = Math.cos(spin);
    const sn = Math.sin(spin);
    g.lineStyle(6, 0x1e293b, alpha).lineBetween(
      s.x - c * 9,
      s.y - sn * 9,
      s.x + c * 9,
      s.y + sn * 9,
    );
  }

  private drawBoard(): void {
    const g = this.board.clear();
    for (const t of this.boardTexts) t.destroy();
    this.boardTexts = [];
    g.fillStyle(0x082f49, 0.85).fillRoundedRect(150, 140, 420, 92, 14);
    const rows: Array<[string, Team, number]> = [
      ['VOCÊ', 'me', 168],
      ['RIVAL', 'them', 206],
    ];
    for (const [label, team, y] of rows) {
      this.boardTexts.push(
        addText(this, 210, y, label, 20, { color: team === 'me' ? '#fde047' : '#fca5a5' }).setDepth(
          6,
        ),
      );
      for (let e = 0; e < ENDS; e++) {
        const v = this.sim.scores[team][e];
        this.boardTexts.push(
          addText(this, 290 + e * 50, y, v === undefined ? '·' : String(v), 22, {
            color: '#ffffff',
          }).setDepth(6),
        );
      }
      this.boardTexts.push(
        addText(this, 520, y, String(this.sim.total[team]), 26, { color: '#ffffff' }).setDepth(6),
      );
      // Stones left this end.
      const left = STONES_EACH - (team === 'me' ? this.sim.thrownMe : this.sim.thrownThem);
      for (let i = 0; i < left; i++) g.fillStyle(COLOR[team]).fillCircle(170 + i * 12, y + 22, 4);
    }
  }

  // ---------------------------------------------------------------- turns

  private nextTurn(): void {
    if (this.ended || this.sim.over) return;
    this.drawBoard();
    if (this.sim.turn === 'me') {
      this.message.setText(`End ${this.sim.end + 1}/${ENDS} · Sua pedra: puxe e solte`);
    } else {
      this.message.setText('Vez do rival…');
      this.waiting = true;
      this.time.delayedCall(900, () => {
        this.waiting = false;
        if (this.sim.throwStone(this.sim.plan())) getServices(this).sfx.play('click');
      });
    }
  }

  private down(p: Phaser.Input.Pointer): void {
    if (p.y < 240 || this.ended) return;
    this.tutorial?.dismiss();
    if (this.sim.inMotion) {
      this.lastRub = { x: p.x, y: p.y };
      return;
    }
    if (this.waiting || this.sim.turn !== 'me' || p.y > 1100) return;
    this.drag = { x: p.x, y: p.y };
    this.pull = { x: 0, y: 0 };
  }

  private move(p: Phaser.Input.Pointer): void {
    if (this.sim.inMotion && p.isDown && this.lastRub) {
      // Rubbing sweeps: the faster the finger, the harder the sweep.
      const d = Math.hypot(p.x - this.lastRub.x, p.y - this.lastRub.y);
      this.lastRub = { x: p.x, y: p.y };
      this.sim.brush(d / 420);
      return;
    }
    if (!this.drag) return;
    this.pull = { x: p.x - this.drag.x, y: p.y - this.drag.y };
    this.drawAim();
  }

  private up(): void {
    this.lastRub = null;
    if (!this.drag) return;
    this.drag = null;
    this.aim.clear();
    const t = throwFromPull(this.pull.x, this.pull.y, this.curl);
    if (t && this.sim.throwStone(t)) {
      getServices(this).sfx.play('click');
      this.message.setText('Esfregue a tela para varrer!');
    }
  }

  private drawAim(): void {
    const g = this.aim.clear();
    const t = throwFromPull(this.pull.x, this.pull.y, this.curl);
    if (!t) return;
    const dx = Math.sin(t.angle);
    const dy = -Math.cos(t.angle);
    const reach = Math.max(80, HACK.y - Math.max(BACK_Y - 40, stopY(t.speed)));
    for (let d = 40; d < Math.min(reach, 520); d += 26)
      g.fillStyle(0x0c4a6e, 0.55 - d / 1400).fillCircle(HACK.x + dx * d, HACK.y + dy * d, 5);
    // Where it would stop going straight (the curl will bend it).
    const sy = stopY(t.speed);
    const label =
      sy > HOG_Y
        ? 'Curta demais'
        : sy < BACK_Y
          ? 'Forte (tirar pedras)'
          : sy < BUTTON.y - 60
            ? 'Fundo'
            : 'Na casa';
    const mx = HACK.x + dx * (HACK.y - Math.max(sy, BACK_Y - 30));
    const my = Math.max(sy, BACK_Y - 30);
    g.lineStyle(4, 0x0f172a, 0.6).strokeCircle(mx, my, STONE_R);
    this.message.setText(`Peso: ${label} · giro ${this.curl < 0 ? '↺' : '↻'}`);
    this.drawStone(g, { x: HACK.x, y: HACK.y, team: 'me' }, 0, 0.9);
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    this.handle(this.sim.step(dt));
    this.spin += dt * 3;
    const g = this.stonesG.clear();
    for (const s of this.sim.stones) this.drawStone(g, s, s.vx || s.vy ? this.spin * s.curl : 0);
    // Waiting stone in the hack.
    if (!this.sim.inMotion && this.sim.turn === 'me' && !this.drag && !this.sim.over)
      this.drawStone(g, { x: HACK.x, y: HACK.y, team: 'me' }, 0, 0.8);
    // Broom and sweep meter.
    const last = this.sim.lastStone;
    const sb = this.sweepBar.clear();
    if (this.sim.inMotion && last?.team === 'me') {
      this.broom
        .setPosition(last.x + 10, last.y - 46 + Math.sin(this.time.now / 40) * 6 * this.sim.sweep)
        .setAlpha(0.3 + 0.7 * this.sim.sweep);
      sb.fillStyle(0x082f49, 0.7).fillRoundedRect(CX - 120, 1100, 240, 18, 9);
      sb.fillStyle(0x22d3ee).fillRoundedRect(CX - 120, 1100, 240 * this.sim.sweep, 18, 9);
    } else this.broom.setPosition(-100, -100);
  }

  private handle(events: CurlEvent[]): void {
    const { sfx } = getServices(this);
    const endOfEnd = events.some((e) => e.type === 'end');
    for (const e of events) {
      if (e.type === 'hit') {
        sfx.play('bounce');
        const l = this.sim.lastStone;
        if (l) burst(this, l.x, l.y, 0xffffff, 8);
      } else if (e.type === 'out') sfx.play('tick');
      else if (e.type === 'hog') {
        sfx.play('hit');
        this.pop(CX, HOG_Y - 40, 'Não passou a linha!', '#fca5a5', 34);
      } else if (e.type === 'rest') {
        const l = this.sim.lastStone;
        if (l && Math.hypot(l.x - BUTTON.x, l.y - BUTTON.y) < 30) {
          shockwave(this, BUTTON.x, BUTTON.y, COLOR[l.team], 70);
          if (l.team === 'me') this.pop(BUTTON.x, BUTTON.y - 50, 'No botão!', '#fde047', 36);
        }
      }
      if (e.type === 'end') {
        this.setScore(this.sim.score);
        this.drawBoard();
        const msg =
          e.team === null
            ? 'End em branco'
            : e.team === 'me'
              ? `Você marcou ${e.points}!`
              : `Rival marcou ${e.points}`;
        banner(
          this,
          msg,
          e.team === 'me' ? '#fde047' : e.team === 'them' ? '#fca5a5' : '#ffffff',
          700,
        );
        sfx.play(e.team === 'me' ? 'win' : 'hit');
        if (e.team === 'me') flash(this, 0xfde047, 0.2, 260);
        this.time.delayedCall(1800, () => {
          const done = this.sim.nextEnd();
          if (done.some((x) => x.type === 'over')) this.gameOver();
          else this.nextTurn();
        });
        return;
      }
      if ((e.type === 'rest' || e.type === 'hog') && !endOfEnd) {
        this.drawBoard();
        this.time.delayedCall(500, () => this.nextTurn());
      }
    }
  }

  private gameOver(): void {
    const t = this.sim.total;
    this.setScore(this.sim.score);
    this.finish(
      t.me > t.them ? 'Vitória no gelo! 🥌' : t.me === t.them ? 'Empate!' : 'Derrota…',
      [`Placar: você ${t.me} × ${t.them} rival`],
      { score: this.sim.score, details: { mine: t.me, theirs: t.them } },
    );
  }
}
