import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { BoardScene } from '@/platform/ui/boardGame';
import { burst, hint } from '@/platform/ui/juice';
import { emojiText } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { isHole, SIZE } from '../restaum/core';
import {
  apply,
  cpuMove,
  foxMoves,
  GEESE_START,
  gooseCount,
  MAX_PLIES,
  newGame,
  winner,
  type Move,
  type State,
} from './core';

const CELL = 88;
const X0 = (GAME_WIDTH - SIZE * CELL) / 2;
const Y0 = 330;

const center = (i: number) => ({
  x: X0 + (i % SIZE) * CELL + CELL / 2,
  y: Y0 + Math.floor(i / SIZE) * CELL + CELL / 2,
});

/** "Raposa e Gansos": you are the fox — jump the geese before they pin you in. */
export class RaposaScene extends BoardScene {
  private s: State = newGame();
  private g!: Phaser.GameObjects.Graphics;
  private info: Phaser.GameObjects.Text | undefined;
  private fox!: Phaser.GameObjects.Text;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Raposa, 'raposa', [0xc2410c, 0x431407]);
  }

  create(): void {
    this.g = this.add.graphics().setDepth(5);
    this.fox = emojiText(this, 0, 0, '🦊', 64).setDepth(8);
    this.begin('#fed7aa', '#431407');
    this.info = addText(this, GAME_WIDTH / 2, 228, '', 26, {
      color: '#ffffff',
      stroke: '#431407',
      strokeThickness: 6,
    }).setDepth(50);
    this.hintBox = hint(
      this,
      ['Toque numa casa para mover a raposa', 'Pule sobre um ganso para capturá-lo'],
      1130,
      5200,
    );
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => this.tap(p));
    // begin() painted before the info line existed.
    this.paint();
  }

  protected startMatch(): void {
    this.s = newGame();
    this.say(`Nível ${this.level} · sua vez`);
    this.paint();
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.ended || this.busy || this.s.turn !== 'fox') return;
    const col = Math.floor((p.x - X0) / CELL);
    const row = Math.floor((p.y - Y0) / CELL);
    if (col < 0 || col >= SIZE || row < 0 || row >= SIZE || !isHole(row, col)) return;
    const to = row * SIZE + col;
    const move = foxMoves(this.s).find((m) => m.to === to);
    if (!move) {
      getServices(this).sfx.play('locked');
      return;
    }
    this.hintBox?.dismiss();
    this.go(move);
  }

  private go(m: Move): void {
    const fox = this.s.turn === 'fox';
    this.s = apply(this.s, m);
    const { sfx } = getServices(this);
    if (m.capture !== null) {
      sfx.play('coin');
      const c = center(m.capture);
      burst(this, c.x, c.y, 0xffffff, 14, { speed: 220 });
      this.pop(c.x, c.y, 'NHAC!', '#fde047', 40);
    } else sfx.play(fox ? 'pop' : 'tick');
    this.paint();
    const w = winner(this.s);
    if (w === 'fox') return this.win('A RAPOSA VENCEU!', (GEESE_START - gooseCount(this.s)) * 20);
    if (w === 'geese') {
      return this.lose(
        'A raposa foi encurralada!',
        [`Gansos capturados: ${GEESE_START - gooseCount(this.s)}`],
        {
          caught: GEESE_START - gooseCount(this.s),
        },
      );
    }
    if (this.s.turn === 'geese') {
      this.say('Gansos se mexendo…');
      this.later(520, () => {
        const reply = cpuMove(this.s, this.level);
        if (reply) this.go(reply);
      });
    } else this.say(`Nível ${this.level} · sua vez`);
  }

  private paint(): void {
    const g = this.g.clear();
    const caught = GEESE_START - gooseCount(this.s);
    this.info?.setText(
      `Gansos: ${gooseCount(this.s)}  ·  Capturados: ${caught}  ·  Jogada ${Math.min(MAX_PLIES / 2, Math.floor(this.s.plies / 2) + 1)}/${MAX_PLIES / 2}`,
    );
    g.fillStyle(0x000000, 0.3).fillRoundedRect(
      X0 - 14,
      Y0 - 14,
      SIZE * CELL + 28,
      SIZE * CELL + 28,
      36,
    );
    const targets = this.s.turn === 'fox' && !this.busy ? foxMoves(this.s) : [];
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (!isHole(Math.floor(i / SIZE), i % SIZE)) continue;
      const c = center(i);
      g.fillStyle(0x7c2d12, 1).fillCircle(c.x, c.y, 38);
      if (this.s.geese[i]) {
        // A goose: white body, head and an orange beak.
        g.fillStyle(0x000000, 0.3).fillEllipse(c.x, c.y + 8, 56, 26);
        g.fillStyle(0xf8fafc, 1).fillEllipse(c.x, c.y + 4, 54, 38);
        g.fillCircle(c.x + 14, c.y - 16, 13);
        g.fillStyle(0xfb923c, 1).fillTriangle(
          c.x + 24,
          c.y - 20,
          c.x + 38,
          c.y - 14,
          c.x + 24,
          c.y - 10,
        );
        g.fillStyle(0x111827, 1).fillCircle(c.x + 17, c.y - 19, 2.5);
      }
      const t = targets.find((m) => m.to === i);
      if (t) {
        g.fillStyle(t.capture !== null ? 0xef4444 : 0xfde047, 0.85).fillCircle(
          c.x,
          c.y,
          t.capture !== null ? 20 : 14,
        );
      }
    }
    const f = center(this.s.fox);
    this.fox.setPosition(f.x, f.y + 2);
  }
}
