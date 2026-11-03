import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { BoardScene } from '@/platform/ui/boardGame';
import { burst, hint } from '@/platform/ui/juice';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  apply,
  canWall,
  cpuMove,
  N,
  newGame,
  pawnMoves,
  winner,
  type Move,
  type State,
  type Wall,
} from './core';

const CELL = 64;
const GROOVE = 10;
const STEP = CELL + GROOVE;
const X0 = (GAME_WIDTH - (N * CELL + (N - 1) * GROOVE)) / 2;
const Y0 = 290;
const CYAN = 0x38bdf8;
const PINK = 0xf472b6;

const cellPos = (r: number, c: number) => ({
  x: X0 + c * STEP + CELL / 2,
  y: Y0 + r * STEP + CELL / 2,
});

/** "Muralha": race your pawn to the top row; spend walls to make the robot's way longer. */
export class MuralhaScene extends BoardScene {
  private s: State = newGame();
  private g!: Phaser.GameObjects.Graphics;
  private info: Phaser.GameObjects.Text | undefined;
  private modeButton!: Button;
  private wallMode = false;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Muralha, 'muralha', [0x0f766e, 0x042f2e]);
  }

  create(): void {
    this.g = this.add.graphics().setDepth(5);
    this.begin('#99f6e4', '#042f2e');
    this.info = addText(this, GAME_WIDTH / 2, 236, '', 26, {
      color: '#ffffff',
      stroke: '#042f2e',
      strokeThickness: 6,
    }).setDepth(50);
    this.modeButton = new Button(
      this,
      GAME_WIDTH / 2,
      1085,
      'Modo: andar',
      () => this.toggleMode(),
      {
        width: 420,
        height: 92,
        fontSize: 34,
        color: 0x14b8a6,
        shade: 0x0f766e,
      },
    ).setDepth(50);
    this.hintBox = hint(
      this,
      ['Chegue à linha de cima antes do robô', 'Em "Muro", toque entre as casas para bloquear'],
      1190,
      5600,
    );
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => this.tap(p));
    // begin() painted before the info line existed.
    this.paint();
  }

  protected startMatch(): void {
    this.s = newGame();
    this.wallMode = false;
    this.modeButton?.label.setText('Modo: andar');
    this.say(`Nível ${this.level} · sua vez`);
    this.paint();
  }

  private toggleMode(): void {
    if (this.ended || this.busy) return;
    getServices(this).sfx.play('click');
    this.wallMode = !this.wallMode;
    this.modeButton.label.setText(this.wallMode ? `Modo: muro (${this.s.left[0]})` : 'Modo: andar');
    this.paint();
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.ended || this.busy || this.s.turn !== 0 || p.y > 1000) return;
    if (this.wallMode) return this.tapWall(p);
    const col = Math.floor((p.x - X0) / STEP);
    const row = Math.floor((p.y - Y0) / STEP);
    const to = pawnMoves(this.s, 0).find((m) => m.r === row && m.c === col);
    if (!to) {
      getServices(this).sfx.play('locked');
      return;
    }
    this.hintBox?.dismiss();
    this.play({ kind: 'step', to });
  }

  /** Turns a tap on a groove into the wall that covers it. */
  private wallAt(p: Phaser.Input.Pointer): Wall | null {
    const col = Math.floor((p.x - X0) / STEP);
    const row = Math.floor((p.y - Y0) / STEP);
    const fx = p.x - X0 - col * STEP;
    const fy = p.y - Y0 - row * STEP;
    // Closest groove: the gap below the cell row (horizontal wall) or to the right of the column.
    const dh = Math.abs(fy - (CELL + GROOVE / 2));
    const dv = Math.abs(fx - (CELL + GROOVE / 2));
    const clamp = (v: number) => Math.max(0, Math.min(N - 2, v));
    if (dh <= dv) return { o: 'h', r: clamp(row), c: clamp(fx > CELL / 2 ? col : col - 1) };
    return { o: 'v', r: clamp(fy > CELL / 2 ? row : row - 1), c: clamp(col) };
  }

  private tapWall(p: Phaser.Input.Pointer): void {
    const wall = this.wallAt(p);
    if (!wall || !canWall(this.s, wall)) {
      getServices(this).sfx.play('locked');
      this.say('Muro inválido aqui');
      return;
    }
    this.hintBox?.dismiss();
    this.wallMode = false;
    this.modeButton.label.setText('Modo: andar');
    this.play({ kind: 'wall', wall });
  }

  private play(m: Move): void {
    const who = this.s.turn;
    this.s = apply(this.s, m);
    const { sfx } = getServices(this);
    if (m.kind === 'wall') {
      sfx.play('hit');
      const x = X0 + m.wall.c * STEP + (m.wall.o === 'h' ? CELL + GROOVE / 2 : CELL + GROOVE / 2);
      const y = Y0 + m.wall.r * STEP + CELL + GROOVE / 2;
      burst(this, x, y, who === 0 ? CYAN : PINK, 8, { speed: 150 });
    } else {
      sfx.play(who === 0 ? 'pop' : 'tick');
      const c = cellPos(m.to.r, m.to.c);
      burst(this, c.x, c.y, who === 0 ? CYAN : PINK, 6, { speed: 120 });
    }
    this.paint();
    const w = winner(this.s);
    if (w === 0) return this.win('CHEGOU PRIMEIRO!', (this.s.left[0] ?? 0) * 15);
    if (w === 1)
      return this.lose('O robô chegou primeiro!', [`Muros sobrando: ${this.s.left[0]}`], {
        walls: this.s.left[0],
      });
    if (this.s.turn === 1) {
      this.say('Robô pensando…');
      this.later(620, () => this.play(cpuMove(this.s, this.level)));
    } else this.say(`Nível ${this.level} · sua vez`);
  }

  private paint(): void {
    const g = this.g.clear();
    this.info?.setText(`Seus muros: ${this.s.left[0]}  ·  Muros do robô: ${this.s.left[1]}`);
    g.fillStyle(0x042f2e, 0.7).fillRoundedRect(
      X0 - 14,
      Y0 - 14,
      N * CELL + (N - 1) * GROOVE + 28,
      N * CELL + (N - 1) * GROOVE + 28,
      22,
    );
    const moves = this.s.turn === 0 && !this.busy && !this.wallMode ? pawnMoves(this.s, 0) : [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const p = cellPos(r, c);
        g.fillStyle(r === 0 ? 0x0e7490 : r === N - 1 ? 0x9d174d : 0x115e59, 1).fillRoundedRect(
          p.x - CELL / 2,
          p.y - CELL / 2,
          CELL,
          CELL,
          10,
        );
        if (moves.some((m) => m.r === r && m.c === c))
          g.fillStyle(0xfde047, 0.7).fillCircle(p.x, p.y, 12);
      }
    }
    g.fillStyle(0xfbbf24, 1);
    for (const w of this.s.walls) {
      if (w.o === 'h') {
        g.fillRoundedRect(
          X0 + w.c * STEP,
          Y0 + w.r * STEP + CELL + 1,
          CELL * 2 + GROOVE,
          GROOVE - 2,
          4,
        );
      } else {
        g.fillRoundedRect(
          X0 + w.c * STEP + CELL + 1,
          Y0 + w.r * STEP,
          GROOVE - 2,
          CELL * 2 + GROOVE,
          4,
        );
      }
    }
    for (const [who, color] of [
      [0, CYAN],
      [1, PINK],
    ] as const) {
      const pawn = this.s.pawns[who];
      const p = cellPos(pawn.r, pawn.c);
      g.fillStyle(0x000000, 0.35).fillCircle(p.x, p.y + 4, 26);
      g.fillStyle(color, 1).fillCircle(p.x, p.y, 26);
      g.fillStyle(0xffffff, 0.5).fillCircle(p.x - 8, p.y - 8, 7);
    }
  }
}
