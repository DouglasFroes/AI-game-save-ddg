import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { BoardScene } from '@/platform/ui/boardGame';
import { burst, hint } from '@/platform/ui/juice';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  apply,
  cpuMove,
  legal,
  menOf,
  newGame,
  POINTS,
  result,
  type Action,
  type State,
} from './core';

const CX = GAME_WIDTH / 2;
const CY = 700;
const RING = [300, 200, 100];
const CYAN = 0x38bdf8;
const PINK = 0xf472b6;

/** Point `i` of the board: ring 0 is the outer square, k runs clockwise from the top-left corner. */
function pos(i: number): { x: number; y: number } {
  const d = RING[Math.floor(i / 8)]!;
  const k = i % 8;
  const dx = [-1, 0, 1, 1, 1, 0, -1, -1][k]!;
  const dy = [-1, -1, -1, 0, 1, 1, 1, 0][k]!;
  return { x: CX + dx * d, y: CY + dy * d };
}

/** "Trilha" (Nine Men's Morris): place nine men, slide them, close mills and remove enemy men. */
export class TrilhaScene extends BoardScene {
  private s: State = newGame();
  private g!: Phaser.GameObjects.Graphics;
  private info: Phaser.GameObjects.Text | undefined;
  private selected = -1;
  private last = -1;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Trilha, 'trilha', [0x57534e, 0x1c1917]);
  }

  create(): void {
    this.g = this.add.graphics().setDepth(5);
    this.begin('#e7e5e4', '#1c1917');
    this.info = addText(this, GAME_WIDTH / 2, 226, '', 26, {
      color: '#ffffff',
      stroke: '#1c1917',
      strokeThickness: 6,
    }).setDepth(50);
    this.hintBox = hint(
      this,
      ['Forme três em linha (moinho)', 'para remover uma peça do robô'],
      1180,
      5200,
    );
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => this.tap(p));
    // begin() painted before the info line existed.
    this.paint();
  }

  protected startMatch(): void {
    this.s = newGame();
    this.selected = -1;
    this.last = -1;
    this.say(`Nível ${this.level} · sua vez`);
    this.paint();
  }

  private pointAt(p: Phaser.Input.Pointer): number {
    let best = -1;
    let bestD = 44;
    for (let i = 0; i < POINTS; i++) {
      const q = pos(i);
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.ended || this.busy || this.s.turn !== 1) return;
    const i = this.pointAt(p);
    if (i < 0) return;
    const actions = legal(this.s);
    let chosen: Action | undefined;
    for (const a of actions) {
      if (a.kind === 'remove' && a.at === i) chosen = a;
      else if (a.kind === 'place' && a.to === i) chosen = a;
      else if (a.kind === 'move' && a.from === this.selected && a.to === i) chosen = a;
    }
    if (!chosen) {
      // Pick up one of my men that can move.
      if (this.s.board[i] === 1 && actions.some((a) => a.kind === 'move' && a.from === i)) {
        this.selected = i;
        getServices(this).sfx.play('click');
        this.paint();
      } else getServices(this).sfx.play('locked');
      return;
    }
    this.hintBox?.dismiss();
    this.selected = -1;
    this.commit(chosen);
  }

  private commit(a: Action): void {
    const mover = this.s.turn;
    this.s = apply(this.s, a);
    const at = a.kind === 'remove' ? a.at : a.to;
    this.last = at;
    const q = pos(at);
    const { sfx } = getServices(this);
    if (a.kind === 'remove') {
      sfx.play('hit');
      burst(this, q.x, q.y, mover === 1 ? PINK : CYAN, 14, { speed: 240 });
    } else {
      sfx.play('pop');
      burst(this, q.x, q.y, mover === 1 ? CYAN : PINK, 6, { speed: 130 });
      if (this.s.removing)
        this.pop(CX, 250, mover === 1 ? 'MOINHO!' : 'MOINHO DO ROBÔ', '#fde047', 44);
    }
    this.paint();
    const res = result(this.s);
    if (res !== 0) return this.settle(res);
    if (this.s.turn === 2) {
      this.say('Robô pensando…');
      this.later(620, () => this.cpuStep());
    } else
      this.say(
        this.s.removing ? 'Moinho! Toque numa peça do robô' : `Nível ${this.level} · sua vez`,
      );
  }

  private cpuStep(): void {
    this.commit(cpuMove(this.s, this.level));
  }

  private settle(res: 1 | 2 | 3): void {
    if (res === 1) this.win('VITÓRIA!', menOf(this.s, 1) * 20);
    else if (res === 3) this.tie('EMPATE!');
    else
      this.lose('O robô venceu!', [`Peças que sobraram: ${menOf(this.s, 1)}`], {
        men: menOf(this.s, 1),
      });
  }

  private paint(): void {
    const g = this.g.clear();
    g.fillStyle(0x292524, 0.9).fillRoundedRect(CX - 340, CY - 340, 680, 680, 30);
    g.lineStyle(6, 0xa8a29e, 1);
    for (let ring = 0; ring < 3; ring++) {
      const d = RING[ring]!;
      g.strokeRect(CX - d, CY - d, d * 2, d * 2);
    }
    for (const k of [1, 3, 5, 7]) {
      const a = pos(k);
      const b = pos(16 + k);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    const actions = this.s.turn === 1 && !this.busy ? legal(this.s) : [];
    for (let i = 0; i < POINTS; i++) {
      const q = pos(i);
      const v = this.s.board[i]!;
      if (v === 0) {
        g.fillStyle(0xa8a29e, 1).fillCircle(q.x, q.y, 10);
      } else {
        g.fillStyle(0x000000, 0.35).fillCircle(q.x, q.y + 4, 30);
        g.fillStyle(v === 1 ? CYAN : PINK, 1).fillCircle(q.x, q.y, 30);
        g.fillStyle(0xffffff, 0.45).fillCircle(q.x - 9, q.y - 9, 8);
        if (i === this.last) g.lineStyle(4, 0xffffff, 1).strokeCircle(q.x, q.y, 34);
      }
      if (i === this.selected) g.lineStyle(5, 0xfde047, 1).strokeCircle(q.x, q.y, 36);
    }
    for (const a of actions) {
      if (a.kind === 'remove') {
        const q = pos(a.at);
        g.lineStyle(5, 0xef4444, 1).strokeCircle(q.x, q.y, 38);
      } else if (a.kind === 'place' || (a.kind === 'move' && a.from === this.selected)) {
        const q = pos(a.to);
        g.fillStyle(0xfde047, 0.8).fillCircle(q.x, q.y, 14);
      } else if (a.kind === 'move' && this.selected < 0) {
        const q = pos(a.from);
        g.lineStyle(3, 0xfde047, 0.55).strokeCircle(q.x, q.y, 36);
      }
    }
    const mine = menOf(this.s, 1);
    const theirs = menOf(this.s, 2);
    this.info?.setText(
      `Você ${mine} (${this.s.hand[0]} na mão)  ·  Robô ${theirs} (${this.s.hand[1]} na mão)`,
    );
  }
}
