import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { BALL_R, BTN_R, ButtonMatch, FIELD, GOAL_W, TO_WIN, type ButtonEvent } from './core';

const PULL = 240;

/** "Futebol de Botão": pull back a button and flick — score into the robot's goal at the top. */
export class BotaoScene extends MiniScene {
  private match = new ButtonMatch();
  private g!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private aim: { id: number; x0: number; y0: number; x: number; y: number } | null = null;
  private busy = false;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Botao, 'botao', [0x14532d, 0x166534]);
  }

  create(): void {
    this.match = new ButtonMatch();
    this.aim = null;
    this.busy = false;
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.statusText = addText(this, GAME_WIDTH / 2, 168, '', 30, {
      color: '#ffffff',
      stroke: '#14532d',
      strokeThickness: 6,
    }).setDepth(50);
    this.hintBox = hint(
      this,
      ['Puxe um botão azul para trás e solte', 'Faça o gol lá em cima!'],
      720,
      5000,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.ended || this.busy || this.match.rolling || this.match.turn !== 'me') return;
      const d = this.match.pick(p.x, p.y);
      if (!d) return;
      this.hintBox?.dismiss();
      this.aim = { id: d.id, x0: p.x, y0: p.y, x: p.x, y: p.y };
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (!this.aim) return;
      this.aim.x = p.x;
      this.aim.y = p.y;
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => {
      const a = this.aim;
      this.aim = null;
      if (!a) return;
      const dx = a.x0 - a.x;
      const dy = a.y0 - a.y;
      if (this.match.flick(a.id, dx, dy, Math.hypot(dx, dy) / PULL))
        getServices(this).sfx.play('hit');
    });
    this.refresh();
  }

  private refresh(): void {
    const m = this.match;
    this.statusText.setText(
      `Jogo ${m.level} (até ${TO_WIN}) · Você ${m.goalsMe} × ${m.goalsCpu} Robô · ${m.turn === 'me' ? 'Sua vez' : 'Vez do robô'}`,
    );
    this.setScore(m.score);
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.handle(this.match.step(Math.min(deltaMs, 40) / 1000));
    this.draw();
  }

  private handle(events: ButtonEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e.type === 'clack') sfx.play('tick');
      else if (e.type === 'goal') {
        const mine = e.by === 'me';
        sfx.play(mine ? 'win' : 'hit');
        sfx.vibrate(mine ? [30, 30, 80] : [80, 40, 80]);
        banner(this, mine ? 'GOOOL!' : 'Gol do robô…', mine ? '#fde047' : '#fca5a5');
        shockwave(this, 360, mine ? FIELD.y0 : FIELD.y1, mine ? 0xfde047 : 0xef4444, 220);
        burst(this, 360, mine ? FIELD.y0 : FIELD.y1, mine ? 0xfde047 : 0xef4444, 30, {
          speed: 400,
        });
        if (!mine) flash(this, 0xef4444, 0.2, 240);
      } else if (e.type === 'match') {
        if (e.won) {
          sfx.play('level');
          this.busy = true;
          this.time.delayedCall(1400, () => {
            if (this.ended) return;
            this.match.nextMatch();
            banner(this, `JOGO ${this.match.level}`, '#ffffff', 520);
            this.busy = false;
            this.refresh();
          });
        } else {
          this.finish(
            'O robô venceu!',
            [`Vitórias: ${this.match.wins} · Gols: ${this.match.totalGoals}`],
            {
              score: this.match.score,
              details: { wins: this.match.wins, goals: this.match.totalGoals },
            },
            1200,
          );
        }
      } else if (e.who === 'cpu' && !this.match.over && !this.busy) {
        this.busy = true;
        this.time.delayedCall(700, () => {
          this.busy = false;
          if (this.ended || this.match.turn !== 'cpu') return;
          const s = this.match.cpuShot();
          if (this.match.flick(s.id, s.dx, s.dy, s.power)) sfx.play('hit');
        });
      }
      this.refresh();
    }
  }

  private draw(): void {
    const g = this.g.clear();
    const { x0, y0, x1, y1 } = FIELD;
    const gx = (x0 + x1 - GOAL_W) / 2;
    // Pitch with stripes and markings.
    for (let i = 0; i < 9; i++)
      g.fillStyle(i % 2 ? 0x15803d : 0x16a34a, 1).fillRect(x0, y0 + i * 100, x1 - x0, 100);
    g.lineStyle(4, 0xffffff, 0.8).strokeRect(x0, y0, x1 - x0, y1 - y0);
    g.lineBetween(x0, (y0 + y1) / 2, x1, (y0 + y1) / 2).strokeCircle(360, (y0 + y1) / 2, 90);
    g.strokeRect(gx - 60, y0, GOAL_W + 120, 120).strokeRect(gx - 60, y1 - 120, GOAL_W + 120, 120);
    g.fillStyle(0xffffff, 0.9)
      .fillRect(gx, y0 - 26, GOAL_W, 26)
      .fillRect(gx, y1, GOAL_W, 26);
    g.fillStyle(0x0f172a, 0.5)
      .fillRect(gx + 6, y0 - 20, GOAL_W - 12, 20)
      .fillRect(gx + 6, y1 + 6, GOAL_W - 12, 20);
    const m = this.match;
    for (const d of m.discs) {
      g.fillStyle(0x000000, 0.3).fillCircle(d.x + 4, d.y + 6, d.r);
      if (d.team === 'ball') {
        g.fillStyle(0xffffff, 1).fillCircle(d.x, d.y, BALL_R);
        g.fillStyle(0x111827, 1).fillCircle(d.x, d.y, BALL_R * 0.4);
        continue;
      }
      const color = d.team === 'me' ? 0x2563eb : 0xdc2626;
      g.fillStyle(color, 1).fillCircle(d.x, d.y, BTN_R);
      g.fillStyle(0xffffff, 0.85).fillCircle(d.x, d.y, BTN_R * 0.55);
      g.fillStyle(color, 1).fillCircle(d.x, d.y, BTN_R * 0.35);
      if (d.team === 'me' && m.turn === 'me' && !m.rolling && !this.busy)
        g.lineStyle(3, 0xfde047, 0.5 + Math.sin(this.time.now / 200) * 0.3).strokeCircle(
          d.x,
          d.y,
          BTN_R + 6,
        );
    }
    if (this.aim) {
      const d = m.discs.find((k) => k.id === this.aim!.id)!;
      const dx = this.aim.x0 - this.aim.x;
      const dy = this.aim.y0 - this.aim.y;
      const len = Math.hypot(dx, dy);
      if (len > 8) {
        const p = Math.min(1, len / PULL);
        g.lineStyle(5, p > 0.85 ? 0xef4444 : 0xfde047, 0.9).lineBetween(
          d.x,
          d.y,
          d.x + (dx / len) * (80 + p * 220),
          d.y + (dy / len) * (80 + p * 220),
        );
      }
    }
    this.statusText.setColor(m.turn === 'me' ? '#bfdbfe' : '#fecaca');
  }
}
