import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { FACES, MahjongGame, type Tile } from './core';

const HX = 52;
const HY = 58;
const X0 = (GAME_WIDTH - HX * 12) / 2 + 10;
const Y0 = 262;
/** Each layer is drawn a little up and to the left, so the stack reads as 3D. */
const DZX = -6;
const DZY = -8;

interface View {
  box: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
}

/** "Mahjong": match free pairs, chain quick matches for combos, and clear the board in time. */
export class MahjongScene extends MiniScene {
  private mj = new MahjongGame();
  private views = new Map<number, View>();
  private statusText!: Phaser.GameObjects.Text;
  private bar!: Phaser.GameObjects.Graphics;
  private hinted: number[] = [];
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Mahjong, 'mahjong', [0x3f0d0d, 0x1c1917]);
  }

  create(): void {
    this.mj = new MahjongGame();
    this.hinted = [];
    this.frame('0');
    this.statusText = addText(this, GAME_WIDTH / 2, 170, '', 28, {
      color: '#fecaca',
      stroke: '#3f0d0d',
      strokeThickness: 6,
    }).setDepth(50);
    this.bar = this.add.graphics().setDepth(50);
    new Button(this, 200, 1225, '💡 Dica (-10s)', () => this.showHint(), {
      width: 300,
      height: 74,
      fontSize: 26,
      color: 0x0891b2,
      shade: 0x164e63,
    }).setDepth(60);
    new Button(this, 520, 1225, '🔀 Embaralhar', () => this.reshuffle(), {
      width: 300,
      height: 74,
      fontSize: 26,
      color: 0x9333ea,
      shade: 0x581c87,
    }).setDepth(60);
    this.build();
    this.hintBox = hint(
      this,
      ['Junte pares iguais que estejam livres', '(sem peça em cima e com um lado aberto)'],
      700,
      4500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.ended || p.y > 1185 || p.y < 140) return;
      this.hintBox?.dismiss();
      const t = this.tileAt(p.x, p.y);
      if (t) this.pick(t);
    });
  }

  private pos(t: Tile): [number, number] {
    return [X0 + t.x * HX + t.z * DZX, Y0 + t.y * HY + t.z * DZY];
  }

  private build(): void {
    for (const v of this.views.values()) v.box.destroy();
    this.views.clear();
    const order = [...this.mj.tiles].sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
    order.forEach((t, i) => {
      const [x, y] = this.pos(t);
      const bg = this.add.graphics();
      const face = emojiText(this, HX, HY - 4, FACES[t.face]!, 62);
      const box = this.add.container(x, y, [bg, face]).setDepth(5 + i * 0.01);
      this.views.set(t.id, { box, bg });
    });
    this.paint();
  }

  /** Redraws every tile (free tiles bright, blocked ones dimmed, selection and hints outlined). */
  private paint(): void {
    for (const t of this.mj.tiles) {
      const v = this.views.get(t.id);
      if (!v || t.gone) continue;
      const free = this.mj.free(t);
      const sel = this.mj.selected === t;
      const hinted = this.hinted.includes(t.id);
      const w = HX * 2 - 4;
      const h = HY * 2 - 4;
      v.bg.clear();
      v.bg.fillStyle(0x78350f, 1).fillRoundedRect(4, 8, w, h, 12);
      v.bg
        .fillStyle(sel ? 0xfef08a : free ? 0xfffbeb : 0xd6d3d1, 1)
        .fillRoundedRect(0, 0, w, h, 12);
      v.bg
        .lineStyle(sel || hinted ? 5 : 2, sel ? 0xf59e0b : hinted ? 0x22d3ee : 0xa8a29e, 1)
        .strokeRoundedRect(0, 0, w, h, 12);
      v.box.setAlpha(free ? 1 : 0.82);
    }
  }

  private tileAt(x: number, y: number): Tile | null {
    const live = this.mj.live().sort((a, b) => b.z - a.z || b.y - a.y || b.x - a.x);
    for (const t of live) {
      const [tx, ty] = this.pos(t);
      if (x >= tx && x <= tx + HX * 2 && y >= ty && y <= ty + HY * 2) return t;
    }
    return null;
  }

  private pick(t: Tile): void {
    const { sfx } = getServices(this);
    const res = this.mj.pick(t);
    if (res.kind === 'blocked') {
      sfx.play('locked');
      const v = this.views.get(t.id);
      if (v)
        this.tweens.add({ targets: v.box, x: v.box.x + 8, duration: 50, yoyo: true, repeat: 1 });
    } else if (res.kind === 'select' || res.kind === 'deselect' || res.kind === 'mismatch') {
      sfx.play('click');
    } else {
      this.hinted = [];
      sfx.play('pop', Math.min(8, this.mj.combo));
      for (const m of [res.a, res.b]) {
        const v = this.views.get(m.id);
        if (!v) continue;
        burst(this, v.box.x + HX, v.box.y + HY, 0xfde047, 10, { speed: 220 });
        this.tweens.add({
          targets: v.box,
          scale: 0,
          alpha: 0,
          duration: 200,
          onComplete: () => v.box.destroy(),
        });
        this.views.delete(m.id);
      }
      const v = this.views.get(res.b.id);
      const [bx, by] = this.pos(res.b);
      this.pop(
        v ? v.box.x + HX : bx + HX,
        by,
        this.mj.combo > 1 ? `COMBO x${this.mj.combo} +${res.points}` : `+${res.points}`,
        '#fde047',
        32,
      );
      this.setScore(this.mj.score);
      if (res.cleared) {
        sfx.play('win');
        sfx.vibrate([30, 30, 60]);
        banner(this, 'TABULEIRO LIMPO!', '#fde047');
        shockwave(this, GAME_WIDTH / 2, 700, 0xfde047, 320);
        this.time.delayedCall(700, () => this.build());
        return;
      }
      if (!this.mj.moves().length) {
        banner(this, 'SEM JOGADAS — EMBARALHANDO', '#e9d5ff', 520);
        this.mj.shuffle();
        this.time.delayedCall(500, () => this.build());
        return;
      }
    }
    this.paint();
  }

  private showHint(): void {
    if (this.ended) return;
    const m = this.mj.moves()[0];
    if (!m) return;
    this.mj.timeLeft = Math.max(0, this.mj.timeLeft - 10);
    this.hinted = [m[0].id, m[1].id];
    getServices(this).sfx.play('star');
    this.paint();
  }

  private reshuffle(): void {
    if (this.ended) return;
    getServices(this).sfx.play('draw');
    this.mj.shuffle();
    this.hinted = [];
    this.build();
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    this.mj.tick(deltaMs / 1000);
    const gm = this.mj;
    if (gm.timeLeft <= 0) {
      getServices(this).sfx.play('hit');
      flash(this, 0xef4444, 0.3, 300);
      this.finish(
        'O tempo acabou!',
        [`Pares: ${gm.pairs} · Tabuleiros: ${gm.board - 1}`],
        { score: gm.score, details: { pairs: gm.pairs, boards: gm.board - 1 } },
        700,
      );
      return;
    }
    const left = gm.live().length;
    const m = Math.floor(gm.timeLeft / 60);
    const s = Math.floor(gm.timeLeft % 60);
    this.statusText.setText(
      `Tabuleiro ${gm.board} · Peças ${left} · ⏱ ${m}:${String(s).padStart(2, '0')}${gm.combo > 1 ? ` · 🔥x${gm.combo}` : ''}`,
    );
    const total = Math.max(120, 240 - (gm.board - 1) * 20);
    const frac = gm.timeLeft / total;
    this.bar.clear().fillStyle(0x1c1917, 1).fillRoundedRect(110, 210, 500, 16, 8);
    this.bar
      .fillStyle(frac < 0.2 ? 0xef4444 : 0xf59e0b, 1)
      .fillRoundedRect(110, 210, 500 * Math.min(1, frac), 16, 8);
  }
}
