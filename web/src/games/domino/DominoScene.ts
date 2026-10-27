import type Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { canvasTexture } from '@/platform/art/textures';
import { burst, shockwave } from '@/platform/ui/juice';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { drawDomino } from './art';
import {
  choosePlay,
  cpuLevel,
  DominoRound,
  isDouble,
  MATCH_TARGET,
  matchPoints,
  type End,
  type Play,
  type Tile,
} from './core';

const TEX_W = 124;
const TEX_H = 68;
const LEN = 78; // on-screen length of a tile lying down
const SCALE = LEN / 116;
const CHAIN_X0 = 40;
const CHAIN_X1 = GAME_WIDTH - 40;
const CHAIN_Y = 500;
const ROW_H = 92;
const HAND_Y = 1010;
const PILE = { x: GAME_WIDTH / 2, y: 1180 };
const CPU_Y = 392;

const tileKey = (t: Tile) => `dom-${Math.min(...t)}${Math.max(...t)}`;

/** Lays the chain out in a snake of rows; returns where each tile goes and how it is turned. */
export function layoutChain(
  chain: readonly Tile[],
): Array<{ x: number; y: number; angle: number }> {
  const out: Array<{ x: number; y: number; angle: number }> = [];
  const span = CHAIN_X1 - CHAIN_X0;
  const widths = chain.map((t) => (isDouble(t) ? LEN * 0.5 : LEN));
  const total = widths.reduce((a, b) => a + b, 0);
  let dir = 1;
  let row = 0;
  let cursor = total < span ? CHAIN_X0 + (span - total) / 2 : CHAIN_X0;
  chain.forEach((t, i) => {
    const w = widths[i]!;
    const over = dir === 1 ? cursor + w > CHAIN_X1 : cursor - w < CHAIN_X0;
    if (over) {
      row++;
      dir = -dir;
      cursor = dir === 1 ? CHAIN_X0 : CHAIN_X1;
    }
    const cx = cursor + (dir * w) / 2;
    cursor += dir * w;
    const base = dir === 1 ? 0 : Math.PI;
    out.push({ x: cx, y: CHAIN_Y + row * ROW_H, angle: isDouble(t) ? Math.PI / 2 : base });
  });
  return out;
}

/** "Dominó": double-six against the robot, matches to 50 points. */
export class DominoScene extends MiniScene {
  private round = new DominoRound(Math.random);
  private wins = 0;
  private points = 0;
  private you = 0;
  private cpu = 0;
  private busy = false;
  private selected: number | null = null;
  private chainSprites = new Map<string, Phaser.GameObjects.Image>();
  private handLayer!: Phaser.GameObjects.Container;
  private cpuLayer!: Phaser.GameObjects.Container;
  private uiLayer!: Phaser.GameObjects.Container;
  private status!: Phaser.GameObjects.Text;
  private board!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Domino, 'domino', [0x053d1f, 0x0f7a3f]);
  }

  create(): void {
    this.wins = 0;
    this.points = 0;
    this.you = 0;
    this.cpu = 0;
    this.busy = false;
    this.selected = null;
    this.chainSprites = new Map();
    this.makeTextures();
    this.frame();
    this.drawTable();
    this.status = addText(this, GAME_WIDTH / 2, 246, '', 38, {
      color: '#ffffff',
      stroke: '#053d1f',
      strokeThickness: 8,
    });
    this.board = addText(this, GAME_WIDTH / 2, 292, '', 28, {
      color: '#bbf7d0',
      weight: 'normal',
    });
    this.cpuLayer = this.add.container(0, 0).setDepth(2);
    this.handLayer = this.add.container(0, 0).setDepth(6);
    this.uiLayer = this.add.container(0, 0).setDepth(8);
    this.newRound();
  }

  private makeTextures(): void {
    for (let a = 0; a <= 6; a++) {
      for (let b = a; b <= 6; b++) {
        canvasTexture(this, tileKey([a, b]), TEX_W, TEX_H, (ctx) =>
          drawDomino(ctx, 62, 32, 116, a, b),
        );
      }
    }
    canvasTexture(this, 'dom-back', TEX_W, TEX_H, (ctx) => {
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = '#0f3d2b';
      ctx.beginPath();
      ctx.roundRect(4, 4, 116, 58, 12);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = 'rgba(74,222,128,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(12, 12, 100, 42);
      ctx.beginPath();
      ctx.moveTo(62, 14);
      ctx.lineTo(90, 33);
      ctx.lineTo(62, 52);
      ctx.lineTo(34, 33);
      ctx.closePath();
      ctx.stroke();
    });
  }

  private drawTable(): void {
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(0x000000, 0.28).fillRoundedRect(16, 450, GAME_WIDTH - 32, 400, 36);
    g.lineStyle(4, 0xffffff, 0.08).strokeRoundedRect(16, 450, GAME_WIDTH - 32, 400, 36);
  }

  // ---------------------------------------------------------------- flow

  private newRound(): void {
    for (const s of this.chainSprites.values()) s.destroy();
    this.chainSprites.clear();
    this.round = new DominoRound(Math.random);
    this.busy = false;
    this.selected = null;
    const r = this.round;
    this.render();
    const opener = this.chainSprites.get(tileKey(r.opener.tile));
    if (opener) {
      opener.setScale(SCALE * 1.5).setAlpha(0);
      this.tweens.add({
        targets: opener,
        scale: SCALE,
        alpha: 1,
        duration: 360,
        ease: 'Back.easeOut',
      });
    }
    this.status.setText(r.opener.seat === 0 ? 'Você abriu o jogo' : 'O robô abriu o jogo');
    this.time.delayedCall(800, () => this.turn());
  }

  private turn(): void {
    const r = this.round;
    if (r.result || this.ended) return;
    this.selected = null;
    if (r.turn === 0) {
      if (r.legal(0).length > 0) {
        this.status.setText('Sua vez · toque numa peça brilhante');
        this.busy = false;
      } else if (r.pile.length > 0) {
        this.status.setText('Sem jogada · compre no mercado');
        this.busy = false;
      } else {
        this.status.setText('Sem jogada e mercado vazio');
        this.busy = true;
        this.time.delayedCall(900, () => this.passTurn(0));
      }
      this.render();
      return;
    }
    this.busy = true;
    this.status.setText('O robô está pensando…');
    this.render();
    this.time.delayedCall(850, () => this.robotAct());
  }

  private robotAct(): void {
    if (this.ended) return;
    const r = this.round;
    if (r.legal(1).length === 0) {
      if (r.pile.length > 0) {
        r.draw(1);
        getServices(this).sfx.play('click');
        this.status.setText('O robô comprou uma peça');
        this.render();
        this.time.delayedCall(650, () => this.robotAct());
      } else this.passTurn(1);
      return;
    }
    this.playTile(1, choosePlay(r, 1, cpuLevel(this.wins), Math.random), CPU_Y);
  }

  private passTurn(seat: 0 | 1): void {
    this.round.pass(seat);
    this.pop(GAME_WIDTH / 2, 800, seat === 0 ? 'Você passou' : 'O robô passou', '#bbf7d0', 36);
    this.render();
    if (this.round.result) this.endRound();
    else this.time.delayedCall(500, () => this.turn());
  }

  private playTile(seat: 0 | 1, play: Play, fromY: number): void {
    const r = this.round;
    const fromX = seat === 0 ? this.handX(play.index, r.hands[0].length) : GAME_WIDTH / 2;
    this.busy = true;
    this.selected = null;
    const placed = r.play(seat, play);
    getServices(this).sfx.play('pop');
    this.render();
    const sprite = this.chainSprites.get(tileKey(placed));
    if (sprite) {
      const tx = sprite.x;
      const ty = sprite.y;
      this.tweens.killTweensOf(sprite);
      sprite
        .setPosition(fromX, fromY)
        .setScale(SCALE * 1.25)
        .setDepth(20);
      this.tweens.add({
        targets: sprite,
        x: tx,
        y: ty,
        scale: SCALE,
        duration: 340,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          sprite.setDepth(4);
          shockwave(this, tx, ty, 0xbbf7d0, 46);
        },
      });
    }
    if (r.result) this.time.delayedCall(450, () => this.endRound());
    else this.time.delayedCall(520, () => this.turn());
  }

  private endRound(): void {
    const res = this.round.result!;
    this.busy = true;
    this.render(true);
    let text: string;
    if (res.winner === 0) {
      this.you += res.points;
      text = res.blocked
        ? `Jogo trancado! Você leva ${res.points}`
        : `Bateu! Você leva ${res.points}`;
      getServices(this).sfx.play('win');
      burst(this, GAME_WIDTH / 2, 700, 0xfde047, 26, { speed: 480 });
    } else if (res.winner === 1) {
      this.cpu += res.points;
      text = res.blocked
        ? `Jogo trancado! O robô leva ${res.points}`
        : `O robô bateu! Leva ${res.points}`;
      getServices(this).sfx.play('hit');
    } else text = 'Jogo trancado: empate';
    this.status.setText(text);
    this.updateBoard();
    this.time.delayedCall(2600, () => this.afterRound());
  }

  private afterRound(): void {
    if (this.you >= MATCH_TARGET) {
      const gained = matchPoints(this.wins, this.you, this.cpu);
      this.wins++;
      this.points += gained;
      this.setScore(this.points);
      this.pop(GAME_WIDTH / 2, 320, `Partida ganha! +${gained}`, '#ffe066', 46);
      burst(this, GAME_WIDTH / 2, 600, 0xfde047, 40, { speed: 600 });
      this.you = 0;
      this.cpu = 0;
      this.time.delayedCall(1700, () => this.newRound());
    } else if (this.cpu >= MATCH_TARGET) {
      this.finish('O robô levou a partida!', [`Partidas ganhas: ${this.wins}`], {
        score: this.points,
        details: { wins: this.wins },
      });
    } else this.newRound();
  }

  private updateBoard(): void {
    this.board.setText(
      `Você ${this.you}  ·  ${this.cpu} Robô   (vence quem fizer ${MATCH_TARGET})`,
    );
  }

  // ---------------------------------------------------------------- input

  private handX(i: number, n: number): number {
    const step = Math.min(86, 620 / Math.max(1, n));
    return GAME_WIDTH / 2 + (i - (n - 1) / 2) * step;
  }

  private tapTile(index: number): void {
    if (this.busy || this.round.turn !== 0 || this.round.result) return;
    const options = this.round.legal(0).filter((p) => p.index === index);
    if (options.length === 0) return;
    if (options.length === 1) {
      this.playTile(0, options[0]!, HAND_Y);
      return;
    }
    this.selected = this.selected === index ? null : index;
    this.render();
  }

  private tapEnd(end: End): void {
    if (this.selected === null) return;
    this.playTile(0, { index: this.selected, end }, HAND_Y);
  }

  private drawPile(): void {
    const r = this.round;
    const mustDraw = r.turn === 0 && r.legal(0).length === 0 && r.pile.length > 0 && !r.result;
    const stack = this.add.container(PILE.x, PILE.y);
    const n = Math.min(4, r.pile.length);
    for (let k = 0; k < n; k++) {
      stack.add(this.add.image(-8 + k * 5, -k * 4, 'dom-back').setScale(0.7));
    }
    stack.add(
      addText(this, 0, 54, `MERCADO · ${r.pile.length}`, 24, {
        color: mustDraw ? '#fde047' : '#bbf7d0',
      }),
    );
    if (mustDraw && !this.busy) {
      this.tweens.add({
        targets: stack,
        scale: { from: 1, to: 1.1 },
        duration: 480,
        yoyo: true,
        repeat: -1,
      });
      stack.setSize(260, 130).setInteractive({ useHandCursor: true });
      stack.on('pointerdown', () => {
        if (this.busy) return;
        r.draw(0);
        getServices(this).sfx.play('click');
        this.turn();
      });
    }
    this.uiLayer.add(stack);
  }

  // ---------------------------------------------------------------- drawing

  private render(reveal = false): void {
    const r = this.round;
    this.handLayer.removeAll(true);
    this.cpuLayer.removeAll(true);
    this.uiLayer.removeAll(true);
    this.updateBoard();

    // Chain: keep the sprites and slide them to their new spots.
    const layout = layoutChain(r.chain);
    const alive = new Set<string>();
    r.chain.forEach((t, i) => {
      const key = tileKey(t);
      alive.add(key);
      const spot = layout[i]!;
      const existing = this.chainSprites.get(key);
      if (!existing) {
        const s = this.add.image(spot.x, spot.y, key).setScale(SCALE).setDepth(4);
        s.setRotation(spot.angle);
        this.chainSprites.set(key, s);
        return;
      }
      this.tweens.add({
        targets: existing,
        x: spot.x,
        y: spot.y,
        rotation: spot.angle,
        duration: 260,
        ease: 'Sine.easeOut',
      });
    });
    for (const [k, s] of this.chainSprites) {
      if (alive.has(k)) continue;
      s.destroy();
      this.chainSprites.delete(k);
    }

    // The robot's hand: backs, or faces once the round is over.
    const cpuHand = r.hands[1];
    cpuHand.forEach((t, i) => {
      const x = this.handX(i, cpuHand.length);
      this.cpuLayer.add(
        this.add
          .image(x, CPU_Y, reveal ? tileKey(t) : 'dom-back')
          .setScale(0.5)
          .setRotation(Math.PI / 2),
      );
    });
    this.cpuLayer.add(
      addText(this, 70, CPU_Y - 56, `ROBÔ · ${cpuHand.length}`, 22, { color: '#bbf7d0' }).setOrigin(
        0,
        0.5,
      ),
    );

    // Your hand: playable tiles glow and lift.
    const plays = r.turn === 0 && !this.busy && !r.result ? r.legal(0) : [];
    const playable = new Set(plays.map((p) => p.index));
    const hand = r.hands[0];
    hand.forEach((t, i) => {
      const can = playable.has(i);
      const lift = this.selected === i ? -36 : can ? -16 : 0;
      const c = this.add.container(this.handX(i, hand.length), HAND_Y + lift);
      if (can) {
        const ring = this.add.graphics();
        ring
          .lineStyle(5, this.selected === i ? 0xffffff : 0xfde047, 1)
          .strokeRoundedRect(-38, -66, 76, 132, 12);
        ring.fillStyle(0xfde047, 0.14).fillRoundedRect(-38, -66, 76, 132, 12);
        c.add(ring);
      }
      c.add(
        this.add
          .image(0, 0, tileKey(t))
          .setScale(1.02)
          .setRotation(Math.PI / 2)
          .setAlpha(can || plays.length === 0 ? 1 : 0.6),
      );
      c.setSize(80, 140).setInteractive({ useHandCursor: can });
      c.on('pointerdown', () => this.tapTile(i));
      this.handLayer.add(c);
    });

    // A tile that fits both ends asks which one.
    if (this.selected !== null) {
      const [l, rt] = r.ends;
      const make = (end: End, x: number, text: string) =>
        this.uiLayer.add(
          new Button(this, x, 850, text, () => this.tapEnd(end), {
            width: 300,
            height: 84,
            fontSize: 30,
            color: 0xf59e0b,
            shade: 0x92400e,
          }),
        );
      make('L', GAME_WIDTH / 2 - 170, `◀ PONTA ${l}`);
      make('R', GAME_WIDTH / 2 + 170, `PONTA ${rt} ▶`);
    }
    this.drawPile();
  }
}
