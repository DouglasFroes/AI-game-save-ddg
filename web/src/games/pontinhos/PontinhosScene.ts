import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { BoardScene } from '@/platform/ui/boardGame';
import { burst, hint } from '@/platform/ui/juice';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  BOXES,
  boxEdges,
  cpuMove,
  EDGES,
  isOver,
  newGame,
  play,
  scores,
  type State,
  type Who,
} from './core';

const GAP = 120;
const X0 = (GAME_WIDTH - BOXES * GAP) / 2;
const Y0 = 340;
const CYAN = 0x38bdf8;
const PINK = 0xf472b6;

const dot = (r: number, c: number) => ({ x: X0 + c * GAP, y: Y0 + r * GAP });

/** The two ends of edge `e`. */
function ends(e: number): [{ x: number; y: number }, { x: number; y: number }] {
  const hCount = BOXES * (BOXES + 1);
  if (e < hCount) {
    const r = Math.floor(e / BOXES);
    const c = e % BOXES;
    return [dot(r, c), dot(r, c + 1)];
  }
  const k = e - hCount;
  const r = Math.floor(k / (BOXES + 1));
  const c = k % (BOXES + 1);
  return [dot(r, c), dot(r + 1, c)];
}

/** "Pontinhos": draw lines between dots; close a box to own it and play again. */
export class PontinhosScene extends BoardScene {
  private s: State = newGame();
  private g!: Phaser.GameObjects.Graphics;
  private info: Phaser.GameObjects.Text | undefined;
  private drawnBy: (Who | 0)[] = [];
  private last = -1;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Pontinhos, 'pontinhos', [0x6d28d9, 0x2e1065]);
  }

  create(): void {
    this.g = this.add.graphics().setDepth(5);
    this.begin('#ddd6fe', '#2e1065');
    this.info = addText(this, GAME_WIDTH / 2, 236, '', 28, {
      color: '#ffffff',
      stroke: '#2e1065',
      strokeThickness: 6,
    }).setDepth(50);
    this.hintBox = hint(
      this,
      ['Toque entre dois pontos para traçar', 'Feche um quadrado e jogue de novo!'],
      1030,
      5200,
    );
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => this.tap(p));
    // begin() painted before the info line existed.
    this.paint();
  }

  protected startMatch(): void {
    this.s = newGame();
    this.drawnBy = Array.from({ length: EDGES }, () => 0);
    this.last = -1;
    this.say(`Nível ${this.level} · sua vez`);
    this.paint();
  }

  private edgeAt(p: Phaser.Input.Pointer): number {
    let best = -1;
    let bestD = 36;
    for (let e = 0; e < EDGES; e++) {
      const [a, b] = ends(e);
      const d = Math.hypot(p.x - (a.x + b.x) / 2, p.y - (a.y + b.y) / 2);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.ended || this.busy || this.s.turn !== 1) return;
    const e = this.edgeAt(p);
    if (e < 0 || this.s.edges[e]) {
      if (e >= 0) getServices(this).sfx.play('locked');
      return;
    }
    this.hintBox?.dismiss();
    this.draw(e);
  }

  private draw(e: number): void {
    const who = this.s.turn;
    const res = play(this.s, e)!;
    this.s = res.state;
    this.drawnBy[e] = who;
    this.last = e;
    const { sfx } = getServices(this);
    sfx.play(res.closed.length > 0 ? 'coin' : 'tick');
    for (const b of res.closed) {
      const c = dot(Math.floor(b / BOXES), b % BOXES);
      burst(this, c.x + GAP / 2, c.y + GAP / 2, who === 1 ? CYAN : PINK, 12, { speed: 200 });
    }
    this.paint();
    if (isOver(this.s)) return this.finishMatch();
    if (this.s.turn === 2) {
      this.say('Robô pensando…');
      this.later(res.closed.length > 0 ? 700 : 520, () => this.draw(cpuMove(this.s, this.level)));
    } else
      this.say(res.closed.length > 0 ? 'Fechou! Jogue de novo' : `Nível ${this.level} · sua vez`);
  }

  private finishMatch(): void {
    const [mine, theirs] = scores(this.s);
    if (mine > theirs) this.win(`VITÓRIA ${mine}×${theirs}`, (mine - theirs) * 25);
    else if (mine === theirs) this.tie(`EMPATE ${mine}×${theirs}`);
    else this.lose(`Derrota ${mine}×${theirs}`, [`Quadrados fechados: ${mine}`], { boxes: mine });
  }

  private paint(): void {
    const g = this.g.clear();
    const [mine, theirs] = scores(this.s);
    this.info?.setText(`Você ${mine}  ·  Robô ${theirs}`);
    g.fillStyle(0x000000, 0.25).fillRoundedRect(
      X0 - 50,
      Y0 - 50,
      BOXES * GAP + 100,
      BOXES * GAP + 100,
      30,
    );
    for (let b = 0; b < BOXES * BOXES; b++) {
      const o = this.s.owner[b]!;
      const sides = boxEdges(b).filter((e) => this.s.edges[e]).length;
      const c = dot(Math.floor(b / BOXES), b % BOXES);
      if (o !== 0)
        g.fillStyle(o === 1 ? CYAN : PINK, 0.45).fillRoundedRect(
          c.x + 8,
          c.y + 8,
          GAP - 16,
          GAP - 16,
          14,
        );
      else if (sides === 3)
        g.fillStyle(0xfde047, 0.18).fillRoundedRect(c.x + 8, c.y + 8, GAP - 16, GAP - 16, 14);
    }
    for (let e = 0; e < EDGES; e++) {
      const [a, b] = ends(e);
      if (this.s.edges[e]) {
        const who = this.drawnBy[e];
        g.lineStyle(e === this.last ? 14 : 10, who === 1 ? CYAN : PINK, 1).lineBetween(
          a.x,
          a.y,
          b.x,
          b.y,
        );
      } else if (this.s.turn === 1 && !this.busy) {
        g.lineStyle(4, 0xffffff, 0.12).lineBetween(a.x, a.y, b.x, b.y);
      }
    }
    for (let r = 0; r <= BOXES; r++)
      for (let c = 0; c <= BOXES; c++) {
        const d = dot(r, c);
        g.fillStyle(0xf5f3ff, 1).fillCircle(d.x, d.y, 11);
      }
  }
}
