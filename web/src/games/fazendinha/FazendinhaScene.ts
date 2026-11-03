import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { burst, hint } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { CROPS, DURATION, FarmSim, PLOTS, ROT_AFTER } from './core';

const CELL = 200;
const GAP = 20;
const X0 = (GAME_WIDTH - (3 * CELL + 2 * GAP)) / 2 + CELL / 2;
const Y0 = 400;

const center = (i: number) => ({
  x: X0 + (i % 3) * (CELL + GAP),
  y: Y0 + Math.floor(i / 3) * (CELL + GAP),
});

/** "Fazendinha": plant, harvest and sell — more coins than anyone in two minutes. */
export class FazendinhaScene extends MiniScene {
  private sim = new FarmSim();
  private g!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private crops: Phaser.GameObjects.Text[] = [];
  private rainText!: Phaser.GameObjects.Text;
  private picks: Button[] = [];
  private pick = 0;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Fazendinha, 'fazendinha', [0x4d7c0f, 0x1a2e05]);
  }

  create(): void {
    this.sim = new FarmSim();
    this.pick = 0;
    this.picks = [];
    this.frame('25');
    this.g = this.add.graphics().setDepth(3);
    this.crops = Array.from({ length: PLOTS }, (_, i) => {
      const c = center(i);
      return emojiText(this, c.x, c.y, '', 110).setDepth(6);
    });
    this.rainText = addText(this, GAME_WIDTH / 2, 300, '', 40, {
      color: '#bae6fd',
      stroke: '#082f49',
      strokeThickness: 8,
    }).setDepth(40);
    this.info = addText(this, GAME_WIDTH / 2, 178, '', 30, {
      color: '#d9f99d',
      stroke: '#1a2e05',
      strokeThickness: 6,
    }).setDepth(50);
    CROPS.forEach((c, k) => {
      const b = new Button(
        this,
        130 + k * 230,
        1130,
        `${c.emoji} ${c.seed}`,
        () => {
          this.pick = k;
          getServices(this).sfx.play('click');
        },
        { width: 210, height: 96, fontSize: 38, color: 0x65a30d, shade: 0x3f6212 },
      ).setDepth(20);
      this.picks.push(b);
    });
    this.hintBox = hint(
      this,
      [
        'Escolha a semente, toque numa terra vazia',
        'Colha quando estiver maduro — antes que estrague!',
      ],
      1000,
      5500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.tap(p));
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.ended) return;
    const { sfx } = getServices(this);
    for (let i = 0; i < PLOTS; i++) {
      const c = center(i);
      if (Math.abs(p.x - c.x) > CELL / 2 || Math.abs(p.y - c.y) > CELL / 2) continue;
      this.hintBox?.dismiss();
      if (this.sim.isRipe(i)) {
        const got = this.sim.harvest(i);
        sfx.play('coin');
        burst(this, c.x, c.y, 0xfde047, 10, { speed: 240 });
        this.pop(c.x, c.y - 40, `+${got}`, '#fde047', 44);
      } else if (!this.sim.plots[i]) {
        if (this.sim.plant(i, this.pick)) sfx.play('pop');
        else sfx.play('locked');
      }
      return;
    }
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.sim.step(Math.min(deltaMs, 50) / 1000);
    const s = this.sim;
    this.setScore(s.score);
    this.info.setText(`🪙 ${s.score} · ⏱ ${Math.max(0, Math.ceil(DURATION - s.t))}s`);
    this.rainText.setText(s.rain > 0 ? '🌧️ Chuva! Cresce em dobro' : '');
    const g = this.g.clear();
    for (let i = 0; i < PLOTS; i++) {
      const c = center(i);
      const p = s.plots[i];
      const ripe = s.isRipe(i);
      g.fillStyle(0x000000, 0.3).fillRoundedRect(
        c.x - CELL / 2 + 4,
        c.y - CELL / 2 + 8,
        CELL,
        CELL,
        28,
      );
      g.fillStyle(ripe ? 0x92400e : 0x78350f, 1).fillRoundedRect(
        c.x - CELL / 2,
        c.y - CELL / 2,
        CELL,
        CELL,
        28,
      );
      if (ripe)
        g.lineStyle(6, 0xfde047, 1).strokeRoundedRect(
          c.x - CELL / 2,
          c.y - CELL / 2,
          CELL,
          CELL,
          28,
        );
      const t = this.crops[i]!;
      if (!p) {
        t.setText('');
        continue;
      }
      const crop = CROPS[p.crop]!;
      const grown = Math.min(1, p.age / crop.grow);
      t.setText(grown < 0.35 ? '🌱' : crop.emoji);
      t.setScale(0.5 + 0.5 * grown + (ripe ? Math.sin(s.t * 8 + i) * 0.06 : 0));
      if (ripe) {
        // How long until it rots.
        const left = Math.max(0, 1 - (p.age - crop.grow) / ROT_AFTER);
        g.fillStyle(0x000000, 0.4).fillRect(c.x - 70, c.y + 70, 140, 12);
        g.fillStyle(left > 0.4 ? 0x4ade80 : 0xef4444, 1).fillRect(
          c.x - 70,
          c.y + 70,
          140 * left,
          12,
        );
      } else {
        g.fillStyle(0x000000, 0.4).fillRect(c.x - 70, c.y + 70, 140, 12);
        g.fillStyle(0x38bdf8, 1).fillRect(c.x - 70, c.y + 70, 140 * grown, 12);
      }
    }
    this.picks.forEach((b, k) =>
      b.setScale(k === this.pick ? 1.06 : 0.94).setEnabled(s.coins >= CROPS[k]!.seed),
    );
    if (s.done) {
      this.finish(
        'Fim da temporada!',
        [`Moedas: ${s.score}`, `Colheitas: ${s.harvested} · Perdidas: ${s.rotted}`],
        { score: s.score, details: { harvested: s.harvested } },
        500,
      );
    }
  }
}
