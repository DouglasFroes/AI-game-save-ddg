import Phaser from 'phaser';
import { SceneKeys } from '@/config';
import { hint } from '@/platform/ui/juice';
import { PuzzleScene, type RuleCard } from '@/platform/ui/puzzleGame';
import { Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { generate, isSolved, move, start, type Level, type State } from './core';

const BOARD = 640;
const Y0 = 250;

/** "Empurra Caixas": push every box onto a goal. Swipe on the board or use the arrows. */
export class CaixasScene extends PuzzleScene {
  private lv!: Level;
  private st!: State;
  private hist: State[] = [];
  private steps = 0;
  private cell = 80;
  private x0 = 0;
  private g!: Phaser.GameObjects.Graphics;
  private down: { x: number; y: number } | null = null;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Caixas, 'caixas', [0x92400e, 0x1c1917]);
  }

  protected override rules(): RuleCard {
    return {
      goal: 'Colocar todas as caixas em cima dos alvos.',
      steps: [
        'Deslize o dedo no tabuleiro (ou use as setas) para mover o personagem; ao andar contra uma caixa, você a empurra.',
        'Você só empurra, nunca puxa: cuidado para não encostar uma caixa num canto.',
        'Errou? Use Desfazer ou Reiniciar.',
        'Termina quando todas as caixas estiverem nos alvos.',
      ],
    };
  }

  create(): void {
    this.g = this.add.graphics().setDepth(3);
    this.begin('#fde68a', '#1c1917');
    const arrows: Array<[string, number, number, number]> = [
      ['▲', 190, 1010, 0],
      ['▼', 190, 1160, 1],
      ['◀', 70, 1085, 2],
      ['▶', 310, 1085, 3],
    ];
    for (const [label, x, y, d] of arrows) {
      new Button(this, x, y, label, () => this.go(d), {
        width: 110,
        height: 110,
        fontSize: 48,
        color: 0xd97706,
        shade: 0x92400e,
      }).setDepth(20);
    }
    new Button(this, 540, 1030, 'Desfazer', () => this.undo(), {
      width: 260,
      height: 90,
      fontSize: 32,
      color: 0x6b7280,
      shade: 0x374151,
    }).setDepth(20);
    new Button(this, 540, 1150, 'Reiniciar', () => this.restart(), {
      width: 260,
      height: 90,
      fontSize: 32,
      color: 0x6b7280,
      shade: 0x374151,
    }).setDepth(20);
    this.hintBox = hint(
      this,
      ['Empurre as caixas até os alvos', 'Você só empurra, nunca puxa!'],
      880,
      5000,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y > Y0 - 20 && p.y < Y0 + BOARD + 20) this.down = { x: p.x, y: p.y };
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      if (!this.down) return;
      const dx = p.x - this.down.x;
      const dy = p.y - this.down.y;
      this.down = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 40) return;
      this.go(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 2 : 3) : dy < 0 ? 0 : 1);
    });
  }

  protected startLevel(): void {
    this.lv = generate(this.level);
    this.st = start(this.lv);
    this.hist = [];
    this.steps = 0;
    this.cell = Math.floor(BOARD / Math.max(this.lv.w, this.lv.h));
    this.x0 = (720 - this.cell * this.lv.w) / 2;
  }

  protected override hud(): string {
    return `${this.steps} passos`;
  }

  private restart(): void {
    if (this.locked || this.ended) return;
    this.st = start(this.lv);
    this.hist = [];
    this.steps = 0;
  }

  private undo(): void {
    if (this.locked || this.ended) return;
    const prev = this.hist.pop();
    if (prev) {
      this.st = prev;
      this.steps = Math.max(0, this.steps - 1);
    }
  }

  private go(d: number): void {
    if (this.locked || this.ended) return;
    this.hintBox?.dismiss();
    const m = move(this.lv, this.st, d);
    const { sfx } = getServices(this);
    if (!m) {
      sfx.play('locked');
      return;
    }
    this.hist.push(this.st);
    this.st = m.state;
    this.steps++;
    sfx.play(m.pushed ? 'tick' : 'pop');
    if (isSolved(this.lv, this.st)) this.solved();
  }

  override update(t: number, dt: number): void {
    super.update(t, dt);
    const g = this.g.clear();
    const { w, h, walls, goals } = this.lv;
    const c = this.cell;
    for (let i = 0; i < w * h; i++) {
      const x = this.x0 + (i % w) * c;
      const y = Y0 + Math.floor(i / w) * c;
      if (walls[i]) {
        g.fillStyle(0x44403c, 1).fillRect(x, y, c, c);
        g.lineStyle(2, 0x78716c, 1).strokeRect(x + 2, y + 2, c - 4, c - 4);
      } else {
        g.fillStyle(0xd6b98a, 1).fillRect(x, y, c, c);
        if (goals[i]) g.fillStyle(0xfacc15, 1).fillCircle(x + c / 2, y + c / 2, c * 0.2);
      }
    }
    for (const b of this.st.boxes) {
      const x = this.x0 + (b % w) * c;
      const y = Y0 + Math.floor(b / w) * c;
      g.fillStyle(goals[b] ? 0x22c55e : 0xb45309, 1).fillRoundedRect(
        x + 6,
        y + 6,
        c - 12,
        c - 12,
        10,
      );
      g.lineStyle(4, 0x451a03, 1).strokeRoundedRect(x + 6, y + 6, c - 12, c - 12, 10);
    }
    const px = this.x0 + (this.st.player % w) * c + c / 2;
    const py = Y0 + Math.floor(this.st.player / w) * c + c / 2;
    g.fillStyle(0x2563eb, 1).fillCircle(px, py, c * 0.34);
    g.fillStyle(0xffffff, 1)
      .fillCircle(px - c * 0.1, py - c * 0.06, c * 0.07)
      .fillCircle(px + c * 0.1, py - c * 0.06, c * 0.07);
  }
}
