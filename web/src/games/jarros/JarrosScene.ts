import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { hint } from '@/platform/ui/juice';
import { PuzzleScene, type RuleCard } from '@/platform/ui/puzzleGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { apply, generate, type Puzzle } from './core';

const BASE = 800;
const UNIT = 30;
const WATER = [0x38bdf8, 0x22d3ee, 0x60a5fa];

/** "Jarros": measure the target amount using jugs with no markings. Select a jug, then act. */
export class JarrosScene extends PuzzleScene {
  private pz!: Puzzle;
  private amounts: number[] = [];
  private sel = -1;
  private moves = 0;
  private g!: Phaser.GameObjects.Graphics;
  private goal!: Phaser.GameObjects.Text;
  private labels: Phaser.GameObjects.Text[] = [];
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Jarros, 'jarros', [0x0e7490, 0x082f49]);
  }

  private x(i: number): number {
    const n = this.pz.caps.length;
    return n === 2 ? 220 + i * 280 : 120 + i * 240;
  }

  protected override rules(): RuleCard {
    return {
      goal: 'Deixar exatamente a quantidade pedida num jarro.',
      steps: [
        'Os jarros não têm marcas: só dá para saber quando estão cheios ou vazios.',
        'Toque num jarro e depois em Encher ou Esvaziar.',
        'Ou toque num jarro e depois em outro para despejar: a água passa até encher o outro ou esvaziar o primeiro.',
        'Misture os jarros até sobrar a quantidade pedida em cima da tela.',
      ],
    };
  }

  create(): void {
    this.g = this.add.graphics().setDepth(3);
    this.goal = addText(this, GAME_WIDTH / 2, 230, '', 44, {
      color: '#fde047',
      stroke: '#082f49',
      strokeThickness: 8,
    }).setDepth(30);
    this.begin('#a5f3fc', '#082f49');
    const mk = (label: string, x: number, fn: () => void, color: number, shade: number) =>
      new Button(this, x, 1000, label, fn, {
        width: 210,
        height: 90,
        fontSize: 30,
        color,
        shade,
      }).setDepth(20);
    mk('Encher', 120, () => this.act('fill'), 0x0891b2, 0x155e75);
    mk('Esvaziar', 360, () => this.act('empty'), 0x0891b2, 0x155e75);
    mk('Recomeçar', 600, () => this.restart(), 0x6b7280, 0x374151);
    this.hintBox = hint(
      this,
      ['Toque num jarro e depois em Encher ou Esvaziar', 'Toque em outro jarro para despejar nele'],
      1110,
      6500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.tap(p));
  }

  protected startLevel(): void {
    this.pz = generate(this.level);
    this.restart(true);
    for (const l of this.labels) l.destroy();
    this.labels = this.pz.caps.map((_c, i) =>
      addText(this, this.x(i), BASE + 40, '', 34, {
        color: '#ffffff',
        stroke: '#082f49',
        strokeThickness: 6,
      }).setDepth(9),
    );
    this.goal.setText(`Meça ${this.pz.target} litros`);
  }

  protected override hud(): string {
    return `${this.moves}/${this.pz.par}`;
  }

  private restart(force = false): void {
    if (!force && (this.locked || this.ended)) return;
    this.amounts = this.pz.caps.map(() => 0);
    this.sel = -1;
    this.moves = 0;
  }

  private act(kind: 'fill' | 'empty'): void {
    if (this.locked || this.ended || this.sel < 0) return;
    const next = apply(this.pz.caps, this.amounts, { kind, i: this.sel });
    const { sfx } = getServices(this);
    if (!next) {
      sfx.play('locked');
      return;
    }
    this.commit(next);
  }

  private commit(next: number[]): void {
    this.amounts = next;
    this.moves++;
    getServices(this).sfx.play('pop');
    if (next.includes(this.pz.target)) this.solved('MEDIU!', this.moves <= this.pz.par ? 150 : 0);
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.locked || this.ended || p.y < 380 || p.y > BASE + 80) return;
    let hit = -1;
    this.pz.caps.forEach((_c, i) => {
      if (Math.abs(p.x - this.x(i)) < 100) hit = i;
    });
    if (hit < 0) return;
    this.hintBox?.dismiss();
    if (this.sel < 0 || this.sel === hit) {
      this.sel = this.sel === hit ? -1 : hit;
      getServices(this).sfx.play('click');
      return;
    }
    const next = apply(this.pz.caps, this.amounts, { kind: 'pour', i: this.sel, j: hit });
    this.sel = -1;
    if (!next) {
      getServices(this).sfx.play('locked');
      return;
    }
    this.commit(next);
  }

  override update(t: number, dt: number): void {
    super.update(t, dt);
    const g = this.g.clear();
    this.pz.caps.forEach((cap, i) => {
      const x = this.x(i);
      const h = cap * UNIT;
      const a = this.amounts[i]!;
      g.fillStyle(WATER[i % WATER.length]!, 0.95).fillRect(x - 60, BASE - a * UNIT, 120, a * UNIT);
      g.lineStyle(
        this.sel === i ? 8 : 5,
        this.sel === i ? 0xfde047 : 0xe0f2fe,
        1,
      ).strokeRoundedRect(x - 64, BASE - h - 4, 128, h + 8, 14);
      this.labels[i]!.setPosition(x, BASE + 40).setText(`${a}/${cap}`);
    });
  }
}
