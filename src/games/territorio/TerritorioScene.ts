import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys } from '@/config';
import type { GameOverData } from '@/platform/scenes/GameOverScene';
import { addText, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { formatShare } from './art';
import { SIZE, TerritorySim, type Dir, type TerritoryEvent } from './core';

const CELL = 44;
const WORLD = SIZE * CELL;
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
/** Finger travel (px) that counts as a swipe. */
const SWIPE = 26;

const lighten = (c: number, k: number) => {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  return (
    (Math.round(r + (255 - r) * k) << 16) |
    (Math.round(g + (255 - g) * k) << 8) |
    Math.round(b + (255 - b) * k)
  );
};

/** "Território": leave your land, draw a loop, come back and take it all. */
export class TerritorioScene extends Phaser.Scene {
  private sim!: TerritorySim;
  private g!: Phaser.GameObjects.Graphics;
  private ui!: Phaser.Cameras.Scene2D.Camera;
  private hud!: { share: Phaser.GameObjects.Text; top: Phaser.GameObjects.Text };
  private swipe: { x: number; y: number } | null = null;
  private started = false;
  private ended = false;

  constructor() {
    super(SceneKeys.Territorio);
  }

  init(): void {
    this.sim = new TerritorySim(getServices(this).profile.get().name || 'Você');
    this.swipe = null;
    this.started = false;
    this.ended = false;
  }

  private hudOnly<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.cameras.main.ignore(o);
    return o;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0xdfe4ee).setZoom(0.82);
    this.g = this.add.graphics();
    this.ui = this.cameras.add(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.ui.ignore(this.g);
    this.hud = {
      share: this.hudOnly(
        addText(this, GAME_WIDTH / 2, 50, '', 38, {
          color: '#1d2b53',
          stroke: '#ffffff',
          strokeThickness: 8,
        }),
      ),
      top: this.hudOnly(
        this.add
          .text(GAME_WIDTH - 20, 100, '', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '22px',
            fontStyle: 'bold',
            color: '#1d2b53',
            stroke: '#ffffff',
            strokeThickness: 5,
            align: 'right',
            lineSpacing: 6,
            resolution: 2,
          })
          .setOrigin(1, 0),
      ),
    };
    this.hudOnly(iconButton(this, 60, 60, '‹', () => this.scene.start(SceneKeys.Hub)));
    const hint = this.hudOnly(
      addText(
        this,
        GAME_WIDTH / 2,
        960,
        'Deslize para começar e virar\nSaia da sua área, faça uma volta\ne retorne para conquistar!\nCuidado com o seu rastro.',
        30,
        { color: '#1d2b53', stroke: '#ffffff', strokeThickness: 8 },
      ),
    );
    // The run starts with the first swipe (or arrow key), heading that way.
    const start = (d: Dir) => {
      if (this.started) return;
      this.started = true;
      hint.destroy();
      this.sim.player.dir = this.sim.player.wish = d;
    };

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y < 110 && p.x < 120) return;
      this.swipe = { x: p.x, y: p.y };
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      const s = this.swipe;
      if (!s || !p.isDown) return;
      const dx = p.x - s.x;
      const dy = p.y - s.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE) return;
      const d = (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0) as Dir;
      start(d);
      this.steer(d);
      // Keep sliding the same finger to turn again.
      this.swipe = { x: p.x, y: p.y };
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => (this.swipe = null));
    const keys: Record<string, Dir> = {
      ArrowUp: 0,
      ArrowRight: 1,
      ArrowDown: 2,
      ArrowLeft: 3,
      w: 0,
      d: 1,
      s: 2,
      a: 3,
    };
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      const d = keys[e.key];
      if (d === undefined) return;
      start(d);
      this.steer(d);
    });
    const me = this.sim.player;
    this.cameras.main.centerOn((me.x + 0.5) * CELL, (me.y + 0.5) * CELL);
    if (import.meta.env.DEV)
      (window as unknown as { __territorio?: TerritorioScene }).__territorio = this;
  }

  get state(): TerritorySim {
    return this.sim;
  }

  private steer(d: Dir): void {
    if (!this.ended) this.sim.turn(d);
  }

  private onEvent(e: TerritoryEvent): void {
    const { sfx } = getServices(this);
    const me = this.sim.player;
    if (e.type === 'claim' && e.who === me) {
      sfx.play('star', Math.min(4, Math.floor(e.cells / 20)));
      const t = addText(this, (me.x + 0.5) * CELL, me.y * CELL - 30, `+${e.cells}`, 44, {
        color: '#1d2b53',
        stroke: '#ffffff',
        strokeThickness: 8,
      });
      this.ui.ignore(t);
      this.tweens.add({
        targets: t,
        y: t.y - 90,
        alpha: 0,
        duration: 800,
        onComplete: () => t.destroy(),
      });
    } else if (e.type === 'kill' && e.who === me && e.victim !== me) {
      sfx.play('win');
      sfx.vibrate(40);
      this.cameras.main.shake(150, 0.006);
    } else if (e.type === 'over') this.gameOver(e.by?.name ?? null);
  }

  private gameOver(by: string | null): void {
    this.ended = true;
    const { sfx } = getServices(this);
    sfx.play('hit');
    sfx.vibrate([80, 40, 80]);
    const s = this.sim;
    const data: GameOverData = {
      gameId: 'territorio',
      title: by ? `${by} cortou seu rastro!` : 'Você bateu!',
      lines: [`Maior área: ${formatShare(s.score)} · Cortes: ${s.player.kills}`],
      record: { score: s.score, details: { kills: s.player.kills } },
      parent: SceneKeys.Territorio,
      retry: { scene: SceneKeys.Territorio },
    };
    this.time.delayedCall(900, () => this.scene.launch(SceneKeys.GameOver, data));
  }

  override update(_t: number, deltaMs: number): void {
    const s = this.sim;
    if (this.started && !this.ended)
      for (const e of s.step(Math.min(deltaMs / 1000, 1 / 20))) this.onEvent(e);

    const me = s.player;
    const cam = this.cameras.main;
    const px = (me.x + 0.5 + DX[me.dir]! * me.progress) * CELL;
    const py = (me.y + 0.5 + DY[me.dir]! * me.progress) * CELL;
    if (me.alive)
      cam.centerOn(
        Phaser.Math.Linear(cam.midPoint.x, px, 0.25),
        Phaser.Math.Linear(cam.midPoint.y, py, 0.25),
      );

    const v = cam.worldView;
    const g = this.g.clear();
    g.fillStyle(0xffffff).fillRect(0, 0, WORLD, WORLD);
    const x0 = Math.max(0, Math.floor(v.x / CELL));
    const y0 = Math.max(0, Math.floor(v.y / CELL));
    const x1 = Math.min(SIZE - 1, Math.ceil(v.right / CELL));
    const y1 = Math.min(SIZE - 1, Math.ceil(v.bottom / CELL));
    g.lineStyle(1, 0xe3e7f0);
    for (let x = x0; x <= x1 + 1; x++)
      g.lineBetween(x * CELL, y0 * CELL, x * CELL, (y1 + 1) * CELL);
    for (let y = y0; y <= y1 + 1; y++)
      g.lineBetween(x0 * CELL, y * CELL, (x1 + 1) * CELL, y * CELL);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = TerritorySim.idx(x, y);
        const o = s.owner[i]!;
        const t = s.trail[i]!;
        if (o) g.fillStyle(s.runners[o - 1]!.color, 0.85).fillRect(x * CELL, y * CELL, CELL, CELL);
        if (t)
          g.fillStyle(lighten(s.runners[t - 1]!.color, 0.45), 0.9).fillRect(
            x * CELL + 6,
            y * CELL + 6,
            CELL - 12,
            CELL - 12,
          );
      }
    g.lineStyle(8, 0x1d2b53, 0.8).strokeRect(0, 0, WORLD, WORLD);

    for (const r of s.runners) {
      if (!r.alive) continue;
      const hx = (r.x + 0.5 + DX[r.dir]! * r.progress) * CELL;
      const hy = (r.y + 0.5 + DY[r.dir]! * r.progress) * CELL;
      if (hx < v.x - CELL || hx > v.right + CELL || hy < v.y - CELL || hy > v.bottom + CELL)
        continue;
      const dark = Phaser.Display.Color.ValueToColor(r.color).darken(30).color;
      g.fillStyle(dark).fillRoundedRect(hx - 22, hy - 22, 44, 44, 10);
      g.fillStyle(r.color).fillRoundedRect(hx - 18, hy - 18, 36, 36, 8);
      if (r === me) g.lineStyle(4, 0xffffff).strokeRoundedRect(hx - 22, hy - 22, 44, 44, 10);
      const ex = DX[r.dir]! * 4;
      const ey = DY[r.dir]! * 4;
      for (const side of [-1, 1]) {
        const sx = hx + (DY[r.dir]! ? side * 8 : 0) + ex;
        const sy = hy + (DX[r.dir]! ? side * 8 : 0) + ey;
        g.fillStyle(0xffffff).fillCircle(sx, sy, 6);
        g.fillStyle(0x1d2b53).fillCircle(sx + DX[r.dir]! * 2, sy + DY[r.dir]! * 2, 3);
      }
    }

    // HUD: your share and the live top 5.
    const shares = s.runners
      .filter((r) => r.alive)
      .map((r) => ({ r, v: s.share(r) }))
      .sort((a, b) => b.v - a.v);
    this.hud.share.setText(`${formatShare(Math.round(s.share(me) * 10000))} da arena`);
    this.hud.top.setText(
      shares
        .slice(0, 5)
        .map(
          ({ r, v }, i) =>
            `${i + 1}. ${r === me ? '▶ ' : ''}${r.name}  ${formatShare(Math.round(v * 10000))}`,
        )
        .join('\n'),
    );
  }
}
