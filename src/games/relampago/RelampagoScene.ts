import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { ReflexSim, type ReflexEvent } from './core';

const CX = GAME_WIDTH / 2;
const FAIL_TITLE = {
  early: 'Foi cedo demais!',
  late: 'Muito devagar!',
  decoy: 'Era o azul!',
} as const;

/** "Relâmpago": tap the instant the screen turns green. */
export class RelampagoScene extends MiniScene {
  private sim = new ReflexSim();
  private panel!: Phaser.GameObjects.Rectangle;
  private big!: Phaser.GameObjects.Text;
  private small!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Relampago, 'relampago', [0x222831, 0x393e46]);
  }

  create(): void {
    this.sim = new ReflexSim();
    this.frame();
    this.panel = this.add
      .rectangle(CX, GAME_HEIGHT / 2 + 40, 640, 760, 0xd62828)
      .setStrokeStyle(8, 0xffffff, 0.4);
    this.big = addText(this, CX, 600, 'ESPERE…', 96, { color: '#ffffff', stroke: '#000000' });
    this.small = addText(this, CX, 760, 'Toque só quando ficar verde', 36, {
      color: '#ffffff',
      stroke: '#000000',
    });
    this.paint('wait');
    const tap = () => {
      if (this.ended) return;
      const e = this.sim.tap();
      if (e) this.handle(e);
    };
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y > 130) tap();
    });
    this.input.keyboard?.on('keydown-SPACE', tap);
  }

  private paint(phase: 'wait' | 'go' | 'decoy'): void {
    const map = {
      wait: [0xd62828, 'ESPERE…'],
      go: [0x2ecc71, 'JÁ!'],
      decoy: [0x2979ff, 'AZUL!\nnão toque'],
    } as const;
    this.panel.setFillStyle(map[phase][0]);
    this.big.setText(map[phase][1]);
  }

  private handle(e: ReflexEvent): void {
    const { sfx } = getServices(this);
    switch (e.type) {
      case 'go':
        this.paint('go');
        sfx.play('start');
        break;
      case 'decoy':
        this.paint('decoy');
        break;
      case 'dodged':
        this.paint('wait');
        this.small.setText('Boa, não caiu!');
        sfx.play('pop');
        this.setScore(this.sim.score);
        break;
      case 'hit':
        this.paint('wait');
        this.small.setText(`${e.ms} ms  ${e.points > 1 ? '⚡ +' + e.points : '+1'}`);
        sfx.play('star');
        this.setScore(this.sim.score);
        break;
      case 'fail': {
        this.panel.setFillStyle(0x6d0f0f);
        const { score, bestMs, round } = this.sim;
        this.big.setText('✖');
        this.finish(
          FAIL_TITLE[e.reason],
          [bestMs ? `Melhor reação: ${bestMs} ms` : 'Sem reações'],
          {
            score,
            details: { best: bestMs, rounds: round - 1 },
          },
        );
        break;
      }
    }
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const e = this.sim.step(Math.min(deltaMs, 100) / 1000);
    if (e) this.handle(e);
  }
}
