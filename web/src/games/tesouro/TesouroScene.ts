import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { Island, N } from './core';

const CELL = 78;
const X0 = (GAME_WIDTH - CELL * N) / 2;
const Y0 = 300;
/** Hot (close) to cold (far) clue colours. */
const HEAT = [0xef4444, 0xf97316, 0xfacc15, 0xa3e635, 0x22d3ee, 0x60a5fa, 0x818cf8];

/** "Caça ao Tesouro": each dig tells how far the nearest treasure is — find them all. */
export class TesouroScene extends MiniScene {
  private island = new Island(1);
  private score = 0;
  private islands = 0;
  private treasuresFound = 0;
  private g!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private chests: Phaser.GameObjects.Text[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private shovelText!: Phaser.GameObjects.Text;
  private busy = false;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Tesouro, 'tesouro', [0x0369a1, 0x0c4a6e]);
  }

  create(): void {
    this.island = new Island(1);
    this.score = 0;
    this.islands = 0;
    this.treasuresFound = 0;
    this.busy = false;
    this.labels = [];
    this.chests = [];
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.statusText = addText(this, GAME_WIDTH / 2, 170, '', 30, {
      color: '#fef3c7',
      stroke: '#0c4a6e',
      strokeThickness: 6,
    }).setDepth(50);
    this.shovelText = addText(this, GAME_WIDTH / 2, 990, '', 40, {
      color: '#ffffff',
      stroke: '#0c4a6e',
      strokeThickness: 7,
    }).setDepth(50);
    for (let i = 0; i < N * N; i++)
      this.labels.push(
        addText(
          this,
          X0 + (i % N) * CELL + CELL / 2,
          Y0 + Math.floor(i / N) * CELL + CELL / 2,
          '',
          38,
          {
            color: '#ffffff',
            stroke: '#00000088',
            strokeThickness: 5,
          },
        ).setDepth(6),
      );
    this.hintBox = hint(
      this,
      ['Cave a areia: o número diz quantos passos', 'faltam até o tesouro mais perto'],
      1120,
      5500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) =>
      this.tap(p.x, p.y),
    );
  }

  private tap(x: number, y: number): void {
    if (this.ended || this.busy) return;
    const c = Math.floor((x - X0) / CELL);
    const r = Math.floor((y - Y0) / CELL);
    if (r < 0 || c < 0 || r >= N || c >= N) return;
    this.hintBox?.dismiss();
    const cell = r * N + c;
    const cx = X0 + c * CELL + CELL / 2;
    const cy = Y0 + r * CELL + CELL / 2;
    const { sfx } = getServices(this);
    const res = this.island.dig(cell);
    if (res.kind === 'already') return;
    burst(this, cx, cy, 0xfde68a, 8, { speed: 160, gravity: 400 });
    if (res.kind === 'clue') {
      sfx.play(res.distance <= 2 ? 'star' : 'tick', Math.max(0, 6 - res.distance));
    } else {
      this.treasuresFound++;
      sfx.play('coin');
      sfx.vibrate([30, 30, 50]);
      this.chests.push(emojiText(this, cx, cy, '💰', 56).setDepth(7));
      shockwave(this, cx, cy, 0xfde047, 120);
      if (res.kind === 'treasure')
        this.pop(cx, cy - 40, `Tesouro! Faltam ${res.left}`, '#fde047', 32);
      else {
        this.score += res.points;
        this.islands++;
        this.setScore(this.score);
        sfx.play('win');
        banner(this, `ILHA LIMPA! +${res.points}`, '#fde047');
        this.busy = true;
        this.time.delayedCall(1200, () => {
          if (this.ended) return;
          for (const t of this.chests) t.destroy();
          this.chests = [];
          this.island = new Island(this.islands + 1);
          this.busy = false;
        });
        return;
      }
    }
    if (this.island.outOfShovels) {
      sfx.play('hit');
      flash(this, 0xef4444, 0.3, 300);
      // Show where the treasures were.
      for (const t of this.island.treasures)
        if (!this.island.found.has(t))
          this.chests.push(
            emojiText(
              this,
              X0 + (t % N) * CELL + CELL / 2,
              Y0 + Math.floor(t / N) * CELL + CELL / 2,
              '💰',
              56,
            )
              .setDepth(7)
              .setAlpha(0.5),
          );
      this.finish(
        'Acabaram as pás!',
        [`Ilhas: ${this.islands} · Tesouros: ${this.treasuresFound}`],
        { score: this.score, details: { islands: this.islands, treasures: this.treasuresFound } },
        1400,
      );
    }
  }

  override update(): void {
    if (this.ended) return;
    const is = this.island;
    this.statusText.setText(
      `Ilha ${this.islands + 1} · Tesouros ${is.found.size}/${is.treasures.size}`,
    );
    this.shovelText
      .setText(`⛏️ ${is.shovels} pás`)
      .setColor(is.shovels <= 2 ? '#fca5a5' : '#ffffff');
    const g = this.g.clear();
    g.fillStyle(0x0ea5e9, 0.4).fillRoundedRect(X0 - 24, Y0 - 24, CELL * N + 48, CELL * N + 48, 40);
    for (let i = 0; i < N * N; i++) {
      const x = X0 + (i % N) * CELL;
      const y = Y0 + Math.floor(i / N) * CELL;
      const clue = is.dug.get(i);
      if (clue === undefined) {
        g.fillStyle((i + Math.floor(i / N)) % 2 ? 0xfcd34d : 0xfde68a, 1).fillRoundedRect(
          x + 2,
          y + 2,
          CELL - 4,
          CELL - 4,
          10,
        );
        this.labels[i]!.setText('');
      } else {
        g.fillStyle(0x92400e, 1).fillRoundedRect(x + 2, y + 2, CELL - 4, CELL - 4, 10);
        if (clue >= 0)
          g.fillStyle(HEAT[Math.min(HEAT.length - 1, clue - 1)] ?? 0xffffff, 0.75).fillCircle(
            x + CELL / 2,
            y + CELL / 2,
            CELL * 0.36,
          );
        this.labels[i]!.setText(clue >= 0 ? String(clue) : '');
      }
    }
  }
}
