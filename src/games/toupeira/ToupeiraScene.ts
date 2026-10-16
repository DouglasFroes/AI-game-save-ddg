import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { emojiText, heartsLabel, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { MoleSim, type MoleEvent } from './core';

const GLYPH = { mole: '🐹', gold: '🤩', bomb: '💣' } as const;
const HX = (i: number) => 150 + (i % 3) * 210 + (GAME_WIDTH - 720) / 2;
const HY = (i: number) => 470 + Math.floor(i / 3) * 255;

/** "Toupeira": whack-a-mole with bombs and a combo bonus. */
export class ToupeiraScene extends MiniScene {
  private sim = new MoleSim();
  private sprites: Phaser.GameObjects.Text[] = [];
  private shown: Array<string | null> = [];
  private hearts!: Phaser.GameObjects.Text;
  private combo!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Toupeira, 'toupeira', [0x5a3e2b, 0x2d6a4f]);
  }

  create(): void {
    this.sim = new MoleSim();
    this.shown = new Array<string | null>(9).fill(null);
    this.frame();
    this.hearts = addText(this, GAME_WIDTH / 2, 190, heartsLabel(3), 46);
    this.combo = addText(this, GAME_WIDTH / 2, 290, '', 38, {
      color: '#ffe066',
      stroke: '#0b1430',
    });
    this.sprites = [];
    for (let i = 0; i < 9; i++) {
      const x = HX(i);
      const y = HY(i);
      this.add.ellipse(x, y + 62, 180, 64, 0x1b0f08);
      const mole = emojiText(this, x, y + 30, '🐹', 120).setVisible(false);
      this.sprites.push(mole);
      this.add.ellipse(x, y + 78, 190, 56, 0x3b2314).setDepth(2);
      this.add
        .rectangle(x, y + 20, 200, 200, 0xffffff, 0.001)
        .setDepth(3)
        .setInteractive()
        .on(Phaser.Input.Events.POINTER_DOWN, () => this.whack(i));
    }
  }

  private whack(i: number): void {
    if (this.ended) return;
    const e = this.sim.hit(i);
    if (e) this.handle(e);
  }

  private handle(e: MoleEvent): void {
    const { sfx } = getServices(this);
    const x = HX(e.hole);
    const y = HY(e.hole);
    if (e.type === 'hit') {
      sfx.play(e.kind === 'gold' ? 'win' : 'pop', Math.min(this.sim.combo, 8));
      this.pop(x, y - 60, `+${e.points}`, e.kind === 'gold' ? '#ffe066' : '#ffffff');
      this.setScore(this.sim.score);
    } else {
      sfx.play('hit');
      sfx.vibrate(60);
      this.cameras.main.shake(150, 0.008);
      this.pop(x, y - 60, e.type === 'bombed' ? 'BUM!' : 'Fugiu!', '#ff8080');
    }
    this.hearts.setText(heartsLabel(this.sim.lives));
    this.combo.setText(this.sim.combo >= 3 ? `Combo x${this.sim.combo}` : '');
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    for (const e of this.sim.step(Math.min(deltaMs, 50) / 1000)) this.handle(e);
    this.sim.holes.forEach((h, i) => {
      const t = this.sprites[i]!;
      if (h.kind !== this.shown[i]) {
        this.shown[i] = h.kind;
        if (h.kind) {
          t.setText(GLYPH[h.kind])
            .setVisible(true)
            .setY(HY(i) + 70);
          this.tweens.add({ targets: t, y: HY(i) + 10, duration: 110, ease: 'Back.easeOut' });
        } else t.setVisible(false);
      }
    });
    if (this.sim.dead) {
      const { score, maxCombo } = this.sim;
      this.finish('Acabaram as vidas!', [`Maior combo: ${maxCombo}`], {
        score,
        details: { combo: maxCombo },
      });
    }
  }
}
