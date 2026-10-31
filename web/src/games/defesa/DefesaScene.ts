import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  along,
  CELL,
  COLS,
  MAX_LEVEL,
  ROAD,
  ROWS,
  statsOf,
  toWorld,
  TOWERS,
  TowerDefense,
  upgradeCost,
  X0,
  Y0,
  type DefenseEvent,
  type TowerKind,
} from './core';

const KINDS: TowerKind[] = ['arco', 'canhao', 'gelo'];
const LOOK: Record<TowerKind, { color: number; label: string }> = {
  arco: { color: 0x22c55e, label: 'Arqueiro' },
  canhao: { color: 0xf97316, label: 'Canhão' },
  gelo: { color: 0x38bdf8, label: 'Gelo' },
};
const BAR_Y = 1195;

interface Shot {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: number;
  at: number;
}

/** "Defesa da Torre": build and upgrade towers along the road — don't let them through. */
export class DefesaScene extends MiniScene {
  private td = new TowerDefense();
  private selected: TowerKind = 'arco';
  private g!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private costTexts: Phaser.GameObjects.Text[] = [];
  private levelTexts = new Map<number, Phaser.GameObjects.Text>();
  private shots: Shot[] = [];
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Defesa, 'defesa', [0x14532d, 0x052e16]);
  }

  create(): void {
    this.td = new TowerDefense();
    this.selected = 'arco';
    this.shots = [];
    this.levelTexts = new Map();
    this.frame('0');
    this.g = this.add.graphics().setDepth(4);
    this.statusText = addText(this, GAME_WIDTH / 2, 168, '', 28, {
      color: '#dcfce7',
      stroke: '#052e16',
      strokeThickness: 6,
    }).setDepth(50);
    this.costTexts = KINDS.map((k, i) =>
      addText(this, 130 + i * 230, BAR_Y, `${LOOK[k].label}\n💰${TOWERS[k].cost}`, 24, {
        color: '#ffffff',
      }).setDepth(51),
    );
    this.hintBox = hint(
      this,
      ['Escolha uma torre embaixo e toque na grama', 'Toque numa torre para melhorar'],
      640,
      5000,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) =>
      this.tap(p.x, p.y),
    );
  }

  private tap(x: number, y: number): void {
    if (this.ended) return;
    this.hintBox?.dismiss();
    const { sfx } = getServices(this);
    if (y > BAR_Y - 55) {
      const i = Math.floor(x / (GAME_WIDTH / 3));
      this.selected = KINDS[Math.max(0, Math.min(2, i))]!;
      sfx.play('click');
      return;
    }
    const c = Math.floor((x - X0) / CELL);
    const r = Math.floor((y - Y0) / CELL);
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return;
    const cell = r * COLS + c;
    if (this.td.towerAt(cell)) {
      if (this.td.upgrade(cell)) {
        sfx.play('level');
        const at = toWorld(c, r);
        burst(this, at.x, at.y, 0xfde047, 14, { speed: 200 });
      } else sfx.play('locked');
    } else if (this.td.build(this.selected, cell)) {
      sfx.play('coin');
    } else sfx.play('locked');
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.handle(this.td.step(Math.min(deltaMs, 40) / 1000));
    const td = this.td;
    this.setScore(td.score);
    this.statusText.setText(
      `Onda ${td.wave} · 💰 ${td.gold} · ❤️ ${td.lives} · Abates ${td.kills}`,
    );
    this.costTexts.forEach((t, i) => t.setAlpha(td.gold >= TOWERS[KINDS[i]!].cost ? 1 : 0.45));
    this.draw();
  }

  private handle(events: DefenseEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e.type === 'shot') {
        const c = e.tower.cell % COLS;
        const r = Math.floor(e.tower.cell / COLS);
        const a = toWorld(c, r);
        const b = along(e.target.dist);
        this.shots.push({
          x0: a.x,
          y0: a.y,
          x1: b.x,
          y1: b.y,
          color: LOOK[e.tower.kind].color,
          at: this.time.now,
        });
      } else if (e.type === 'kill') {
        const p = along(e.enemy.dist);
        burst(this, p.x, p.y, e.enemy.boss ? 0xfde047 : 0xef4444, e.enemy.boss ? 30 : 8, {
          speed: 200,
        });
        if (e.enemy.boss) {
          sfx.play('win');
          banner(this, `CHEFÃO DERROTADO! +${e.gold}💰`, '#fde047', 560);
        } else sfx.play('pop');
      } else if (e.type === 'leak') {
        sfx.play('hit');
        flash(this, 0xef4444, 0.2, 200);
      } else if (e.type === 'wave') {
        sfx.play('level');
        banner(
          this,
          e.boss ? `ONDA ${e.wave} · CHEFÃO!` : `ONDA ${e.wave}`,
          e.boss ? '#fca5a5' : '#dcfce7',
          560,
        );
      } else {
        this.finish(
          'O castelo caiu!',
          [`Ondas: ${this.td.wave} · Inimigos derrotados: ${this.td.kills}`],
          { score: this.td.score, details: { wave: this.td.wave, kills: this.td.kills } },
          900,
        );
      }
    }
  }

  private draw(): void {
    const g = this.g.clear();
    const td = this.td;
    for (let cell = 0; cell < COLS * ROWS; cell++) {
      const x = X0 + (cell % COLS) * CELL;
      const y = Y0 + Math.floor(cell / COLS) * CELL;
      const road = ROAD.has(cell);
      g.fillStyle(
        road ? 0xa16207 : (cell + Math.floor(cell / COLS)) % 2 ? 0x15803d : 0x166534,
        1,
      ).fillRect(x, y, CELL, CELL);
    }
    for (const t of td.towers) {
      const c = t.cell % COLS;
      const r = Math.floor(t.cell / COLS);
      const at = toWorld(c, r);
      const color = LOOK[t.kind].color;
      g.fillStyle(0x000000, 0.3).fillCircle(at.x + 4, at.y + 6, 30);
      g.fillStyle(0x334155, 1).fillCircle(at.x, at.y, 30);
      g.fillStyle(color, 1).fillCircle(at.x, at.y, 22);
      for (let k = 0; k < t.level; k++)
        g.fillStyle(0xfde047, 1).fillCircle(at.x - 14 + k * 14, at.y + 30, 5);
      let label = this.levelTexts.get(t.cell);
      if (!label) {
        label = addText(this, at.x, at.y - 1, '', 18, { color: '#0f172a' }).setDepth(6);
        this.levelTexts.set(t.cell, label);
      }
      label.setText(t.level < MAX_LEVEL ? `⬆${upgradeCost(t)}` : 'MAX');
      label.setAlpha(t.level < MAX_LEVEL && td.gold >= upgradeCost(t) ? 1 : 0.5);
      if (t.kind === 'gelo')
        g.lineStyle(2, color, 0.15).strokeCircle(at.x, at.y, statsOf(t).range * CELL);
    }
    for (const e of td.enemies) {
      const p = along(e.dist);
      const rad = e.boss ? 26 : 16;
      g.fillStyle(e.slowFor > 0 ? 0x93c5fd : e.boss ? 0x7f1d1d : 0xdc2626, 1).fillCircle(
        p.x,
        p.y,
        rad,
      );
      g.fillStyle(0x000000, 0.6).fillRect(p.x - rad, p.y - rad - 10, rad * 2, 5);
      g.fillStyle(0x22c55e, 1).fillRect(
        p.x - rad,
        p.y - rad - 10,
        rad * 2 * Math.max(0, e.hp / e.maxHp),
        5,
      );
    }
    const now = this.time.now;
    this.shots = this.shots.filter((s) => now - s.at < 90);
    for (const s of this.shots) g.lineStyle(3, s.color, 0.9).lineBetween(s.x0, s.y0, s.x1, s.y1);
    // Tower picker.
    KINDS.forEach((k, i) => {
      const x = 130 + i * 230;
      const on = this.selected === k;
      g.fillStyle(on ? LOOK[k].color : 0x1f2937, on ? 0.9 : 0.85).fillRoundedRect(
        x - 105,
        BAR_Y - 48,
        210,
        96,
        20,
      );
      if (on) g.lineStyle(4, 0xffffff, 1).strokeRoundedRect(x - 105, BAR_Y - 48, 210, 96, 20);
    });
  }
}
