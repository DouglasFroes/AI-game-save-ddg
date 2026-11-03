import Phaser from 'phaser';
import { SceneKeys } from '@/config';
import { hint } from '@/platform/ui/juice';
import { PuzzleScene, type RuleCard } from '@/platform/ui/puzzleGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { generate, roll, START_DIE, step, type Die, type Puzzle } from './core';

const Y0 = 270;
const BOARD = 540;

/** "Dado Rolante": roll the die to the flag so that it ends with the target number on top. */
export class RolanteScene extends PuzzleScene {
  private pz!: Puzzle;
  private at = 0;
  private die: Die = START_DIE;
  private moves = 0;
  private cell = 90;
  private x0 = 0;
  private g!: Phaser.GameObjects.Graphics;
  private topText!: Phaser.GameObjects.Text;
  private goalText!: Phaser.GameObjects.Text;
  private down: { x: number; y: number } | null = null;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Rolante, 'rolante', [0x7c3aed, 0x1e1b4b]);
  }

  protected override rules(): RuleCard {
    return {
      goal: 'Levar o dado até a bandeira com o número pedido virado para cima.',
      steps: [
        'Use as setas (ou deslize o dedo) para rolar o dado uma casa.',
        'Cada rolada muda as faces: faces opostas somam 7.',
        'Chegue à bandeira com o número pedido em cima.',
      ],
    };
  }

  create(): void {
    this.g = this.add.graphics().setDepth(3);
    this.topText = addText(this, 0, 0, '', 44, {
      color: '#111827',
      stroke: '#ffffff',
      strokeThickness: 6,
    }).setDepth(9);
    this.goalText = addText(this, 0, 0, '', 40, {
      color: '#ffffff',
      stroke: '#1e1b4b',
      strokeThickness: 7,
    }).setDepth(9);
    this.begin('#ddd6fe', '#1e1b4b');
    const arrows: Array<[string, number, number, number]> = [
      ['▲', 190, 920, 0],
      ['▼', 190, 1070, 1],
      ['◀', 70, 995, 2],
      ['▶', 310, 995, 3],
    ];
    for (const [label, x, y, d] of arrows) {
      new Button(this, x, y, label, () => this.go(d), {
        width: 110,
        height: 110,
        fontSize: 48,
        color: 0x8b5cf6,
        shade: 0x5b21b6,
      }).setDepth(20);
    }
    new Button(this, 540, 995, 'Reiniciar', () => this.restart(), {
      width: 260,
      height: 90,
      fontSize: 32,
      color: 0x6b7280,
      shade: 0x374151,
    }).setDepth(20);
    this.hintBox = hint(
      this,
      ['Role o dado até a bandeira', 'O número de cima tem que ser o pedido!'],
      1190,
      6000,
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
    this.pz = generate(this.level);
    this.at = this.pz.start;
    this.die = START_DIE;
    this.moves = 0;
    this.cell = Math.floor(BOARD / this.pz.size);
    this.x0 = (720 - this.cell * this.pz.size) / 2;
  }

  protected override hud(): string {
    return `${this.moves}/${this.pz.par}`;
  }

  private restart(): void {
    if (this.locked || this.ended) return;
    this.at = this.pz.start;
    this.die = START_DIE;
    this.moves = 0;
  }

  private go(dir: number): void {
    if (this.locked || this.ended) return;
    this.hintBox?.dismiss();
    const to = step(this.pz.size, this.pz.walls, this.at, dir);
    const { sfx } = getServices(this);
    if (to < 0) {
      sfx.play('locked');
      return;
    }
    this.at = to;
    this.die = roll(this.die, dir);
    this.moves++;
    sfx.play('bounce');
    if (this.at === this.pz.goal && this.die.top === this.pz.target)
      this.solved('NO ALVO!', this.moves <= this.pz.par ? 150 : 0);
  }

  private center(i: number): { x: number; y: number } {
    const s = this.pz.size;
    return {
      x: this.x0 + (i % s) * this.cell + this.cell / 2,
      y: Y0 + Math.floor(i / s) * this.cell + this.cell / 2,
    };
  }

  override update(t: number, dt: number): void {
    super.update(t, dt);
    const g = this.g.clear();
    const s = this.pz.size;
    for (let i = 0; i < s * s; i++) {
      const c = this.center(i);
      g.fillStyle(
        this.pz.walls[i] ? 0x1e1b4b : ((i % s) + Math.floor(i / s)) % 2 ? 0x6d28d9 : 0x7c3aed,
        1,
      ).fillRect(c.x - this.cell / 2, c.y - this.cell / 2, this.cell, this.cell);
    }
    const goal = this.center(this.pz.goal);
    g.fillStyle(0xfacc15, 0.35).fillRect(
      goal.x - this.cell / 2,
      goal.y - this.cell / 2,
      this.cell,
      this.cell,
    );
    this.goalText.setPosition(goal.x, goal.y + this.cell * 0.12).setText(`⚑${this.pz.target}`);
    const d = this.center(this.at);
    const r = this.cell * 0.36;
    g.fillStyle(0xffffff, 1).fillRoundedRect(d.x - r, d.y - r, r * 2, r * 2, 12);
    g.lineStyle(4, 0x111827, 1).strokeRoundedRect(d.x - r, d.y - r, r * 2, r * 2, 12);
    this.topText
      .setPosition(d.x, d.y)
      .setText(String(this.die.top))
      .setFontSize(Math.floor(this.cell * 0.5));
  }
}
