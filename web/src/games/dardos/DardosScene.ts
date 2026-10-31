import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, hint, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { BOARD, DartsGame, ORDER, ROUNDS } from './core';

/** Fractions of the board radius used to draw the rings. */
const RINGS = { bull: 0.037, outerBull: 0.094, tripleIn: 0.582, tripleOut: 0.629, doubleIn: 0.953 };

/** "Dardos": hold to steady your breath, release to throw — ten rounds of three darts. */
export class DardosScene extends MiniScene {
  private game_ = new DartsGame();
  private g!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private holding = false;
  private breath = 1;
  private darts: Array<{ x: number; y: number }> = [];
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Dardos, 'dardos', [0x1c1917, 0x292524]);
  }

  create(): void {
    this.game_ = new DartsGame();
    this.holding = false;
    this.breath = 1;
    this.darts = [];
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.statusText = addText(this, GAME_WIDTH / 2, 168, '', 28, {
      color: '#fde68a',
      stroke: '#1c1917',
      strokeThickness: 6,
    }).setDepth(50);
    ORDER.forEach((n, i) => {
      const a = ((i * 18 - 90) * Math.PI) / 180;
      addText(
        this,
        BOARD.x + Math.cos(a) * (BOARD.r + 26),
        BOARD.y + Math.sin(a) * (BOARD.r + 26),
        String(n),
        24,
        {
          color: '#fef3c7',
        },
      ).setDepth(5);
    });
    this.hintBox = hint(
      this,
      ['Segure para prender a respiração (a mira acalma)', 'e solte para lançar o dardo'],
      1100,
      5000,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (this.ended) return;
      this.hintBox?.dismiss();
      this.holding = true;
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => {
      if (!this.holding || this.ended) return;
      this.holding = false;
      this.throwDart();
    });
  }

  private throwDart(): void {
    const { sfx } = getServices(this);
    const res = this.game_.throw();
    this.darts.push({ x: res.x, y: res.y });
    sfx.play(res.hit.points >= 40 ? 'star' : res.hit.points ? 'pop' : 'hit');
    burst(this, res.x, res.y, res.hit.mult === 3 || res.hit.bull ? 0xfde047 : 0xffffff, 8, {
      speed: 160,
    });
    this.pop(
      res.x,
      res.y - 40,
      res.hit.label,
      res.hit.mult >= 2 ? '#fde047' : '#ffffff',
      res.hit.mult >= 2 ? 40 : 32,
    );
    if (res.hit.bull && res.hit.points === 50) shockwave(this, res.x, res.y, 0xef4444, 120);
    if (res.bonus === 100) banner(this, 'RODADA PERFEITA! +100', '#fde047');
    this.setScore(this.game_.score);
    if (this.game_.dart === 0) {
      this.time.delayedCall(700, () => (this.darts = []));
      if (this.game_.over) {
        sfx.play('win');
        this.finish(
          'Fim do jogo!',
          [
            `Pontos: ${this.game_.score} · Triplos: ${this.game_.triples} · Moscas: ${this.game_.bulls}`,
          ],
          {
            score: this.game_.score,
            details: { triples: this.game_.triples, bulls: this.game_.bulls },
          },
          900,
        );
      }
    }
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const dt = deltaMs / 1000;
    // Holding the breath slows the aim to a crawl, but the breath runs out.
    const steady = this.holding && this.breath > 0;
    this.breath = steady ? Math.max(0, this.breath - dt / 2.2) : Math.min(1, this.breath + dt / 3);
    this.game_.tick(dt * (steady ? 0.22 : 1));
    const gm = this.game_;
    this.statusText.setText(
      `Rodada ${Math.min(gm.round, ROUNDS)}/${ROUNDS} · Dardo ${gm.dart + 1}/3`,
    );
    this.draw();
  }

  private draw(): void {
    const g = this.g.clear();
    const { x, y, r } = BOARD;
    g.fillStyle(0x0c0a09, 1).fillCircle(x, y, r + 50);
    for (let i = 0; i < 20; i++) {
      const a0 = ((i * 18 - 99) * Math.PI) / 180;
      const a1 = a0 + (18 * Math.PI) / 180;
      const dark = i % 2 === 0;
      const wedge = (r0: number, r1: number, color: number) => {
        g.fillStyle(color, 1);
        g.beginPath();
        g.arc(x, y, r1 * r, a0, a1, false);
        g.arc(x, y, r0 * r, a1, a0, true);
        g.closePath();
        g.fillPath();
      };
      wedge(RINGS.outerBull, 1, dark ? 0x1c1917 : 0xfef3c7);
      wedge(RINGS.tripleIn, RINGS.tripleOut, dark ? 0xdc2626 : 0x16a34a);
      wedge(RINGS.doubleIn, 1, dark ? 0xdc2626 : 0x16a34a);
    }
    g.fillStyle(0x16a34a, 1).fillCircle(x, y, RINGS.outerBull * r);
    g.fillStyle(0xdc2626, 1).fillCircle(x, y, RINGS.bull * r);
    for (const d of this.darts) {
      g.lineStyle(4, 0x94a3b8, 1).lineBetween(d.x, d.y, d.x + 22, d.y + 30);
      g.fillStyle(0xfde047, 1).fillCircle(d.x, d.y, 5);
    }
    if (!this.game_.over) {
      const a = this.game_.aim();
      const steady = this.holding && this.breath > 0;
      g.lineStyle(3, steady ? 0x22d3ee : 0xffffff, 1).strokeCircle(a.x, a.y, 18);
      g.lineBetween(a.x - 28, a.y, a.x + 28, a.y).lineBetween(a.x, a.y - 28, a.x, a.y + 28);
    }
    g.fillStyle(0x1c1917, 1).fillRoundedRect(160, 1000, 400, 20, 10);
    g.fillStyle(this.breath < 0.25 ? 0xef4444 : 0x22d3ee, 1).fillRoundedRect(
      160,
      1000,
      400 * this.breath,
      20,
      10,
    );
  }
}
