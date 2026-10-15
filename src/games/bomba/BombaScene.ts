import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { Tex } from '@/platform/art/textures';
import { formatNumber } from '@/platform/ranking';
import type { GameOverData } from '@/platform/scenes/GameOverScene';
import { addText, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { BTex, enemyKey, itemKey, KIDS, kidKey } from './art';
import {
  BombGame,
  COLS,
  ROWS,
  posOf,
  type BombEvent,
  type Carry,
  type Dir,
  type Enemy,
} from './core';

/** Carried between levels (the scene restarts for each one). */
export interface BombaData {
  level?: number;
  carry?: Carry;
}

const CELL = 50;
const BOARD_X = (GAME_WIDTH - COLS * CELL) / 2;
const BOARD_Y = 200;
/** Arrow pad: four buttons around a center point. */
const PAD = { x: 180, y: 1110, gap: 92, r: 54 };
const ARROWS: Record<Dir, { dx: number; dy: number; label: string }> = {
  up: { dx: 0, dy: -1, label: '▲' },
  down: { dx: 0, dy: 1, label: '▼' },
  left: { dx: -1, dy: 0, label: '◀' },
  right: { dx: 1, dy: 0, label: '▶' },
};
const arrowAt = (d: Dir) => ({
  x: PAD.x + ARROWS[d].dx * PAD.gap,
  y: PAD.y + ARROWS[d].dy * PAD.gap,
});
const BOMB_BTN = { x: 572, y: 1105, r: 100 };
const KID_STORE = 'bombinhas-kid';

const loadKid = () => {
  try {
    const i = Number(localStorage.getItem(KID_STORE));
    return Number.isInteger(i) && i >= 0 && i < KIDS.length ? i : null;
  } catch {
    return null;
  }
};
const saveKid = (i: number) => {
  try {
    localStorage.setItem(KID_STORE, String(i));
  } catch {
    // Private mode: the choice just isn't remembered.
  }
};

const cx = (x: number) => BOARD_X + x * CELL + CELL / 2;
const cy = (y: number) => BOARD_Y + y * CELL + CELL / 2;

/** "Bombinhas": drop bombs, blow up bricks and monsters, find the exit. */
export class BombaScene extends Phaser.Scene {
  private game_!: BombGame;
  private kid = 0;
  private running = false;
  /** Arrows held on screen, in the order they were pressed (last one wins). */
  private held: Dir[] = [];
  private bombPressed = false;
  private keys?: Record<Dir | 'bomb', Phaser.Input.Keyboard.Key[]>;

  private tiles: Phaser.GameObjects.Image[][] = [];
  private playerView!: Phaser.GameObjects.Image;
  private enemyViews = new Map<number, Phaser.GameObjects.Image>();
  private bombViews = new Map<number, Phaser.GameObjects.Image>();
  private itemViews = new Map<string, Phaser.GameObjects.Image>();
  private doorView!: Phaser.GameObjects.Image;
  private flameGfx!: Phaser.GameObjects.Graphics;
  private padGfx!: Phaser.GameObjects.Graphics;
  private bombBtn!: Phaser.GameObjects.Graphics;
  private hud!: {
    score: Phaser.GameObjects.Text;
    time: Phaser.GameObjects.Text;
    stats: Phaser.GameObjects.Text;
    lives: Phaser.GameObjects.Image[];
  };

  constructor() {
    super(SceneKeys.Bomba);
  }

  init(data: BombaData): void {
    this.game_ = new BombGame(data.level ?? 1, Math.random, data.carry);
    this.running = false;
    this.held = [];
    this.bombPressed = false;
    this.tiles = [];
    this.enemyViews = new Map();
    this.bombViews = new Map();
    this.itemViews = new Map();
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0xdfe7ef);
    this.kid = loadKid() ?? 0;
    this.buildBoard();
    this.buildHud();
    this.buildControls();

    const first = this.game_.level === 1 && !this.game_.carry.score;
    if (first) this.chooseKid();
    else this.intro();
    if (import.meta.env.DEV) (window as unknown as { __bomba?: BombaScene }).__bomba = this;
  }

  // ── Board ───────────────────────────────────────────────────────────────

  private buildBoard(): void {
    const g = this.game_;
    const frame = this.add.graphics();
    frame
      .fillStyle(0x2b2b3a, 0.25)
      .fillRoundedRect(BOARD_X - 6, BOARD_Y - 2, COLS * CELL + 12, ROWS * CELL + 12, 14);
    for (let y = 0; y < ROWS; y++) {
      const row: Phaser.GameObjects.Image[] = [];
      for (let x = 0; x < COLS; x++) {
        this.add
          .image(cx(x), cy(y), (x + y) % 2 ? BTex.floorAlt : BTex.floor)
          .setScale(0.5)
          .setDepth(0);
        row.push(this.add.image(cx(x), cy(y), BTex.wall).setScale(0.5).setDepth(1));
      }
      this.tiles.push(row);
    }
    this.doorView = this.add
      .image(cx(g.door.x), cy(g.door.y), BTex.door)
      .setScale(0.5)
      .setDepth(0.5);
    this.flameGfx = this.add.graphics().setDepth(4);
    this.playerView = this.add.image(0, 0, kidKey(this.kid, 0)).setScale(0.5).setOrigin(0.5, 0.86);
    this.syncTiles();
  }

  private syncTiles(): void {
    const g = this.game_;
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        const t = g.tile(x, y);
        const img = this.tiles[y]![x]!;
        const burning = g.burning.get(`${x},${y}`);
        if (t === 'floor' && burning === undefined) img.setVisible(false);
        else {
          img.setVisible(true).setTexture(t === 'wall' ? BTex.wall : BTex.brick);
          // A breaking brick flashes and shrinks away.
          if (burning !== undefined)
            img
              .setTint(0xffd166)
              .setScale(0.5 * (burning / 0.45))
              .setAlpha(burning / 0.45);
        }
      }
    this.doorView.setTexture(g.door.open ? BTex.doorOpen : BTex.door);
  }

  // ── HUD and controls ────────────────────────────────────────────────────

  private buildHud(): void {
    iconButton(this, 60, 60, '‹', () => this.scene.start(SceneKeys.Hub)).setDepth(30);
    const dark = { color: COLORS.text };
    addText(this, 190, 44, `FASE ${this.game_.level}`, 30, dark).setDepth(30);
    const score = addText(this, 190, 90, '0', 34, { color: '#e63946' }).setDepth(30);
    const time = addText(this, 360, 66, '3:00', 34, dark).setDepth(30);
    const stats = addText(this, 560, 150, '', 24, dark).setDepth(30);
    const lives = [0, 1, 2, 3, 4].map((i) =>
      this.add
        .image(500 + i * 44, 64, kidKey(this.kid, 0))
        .setScale(0.32)
        .setDepth(30),
    );
    this.hud = { score, time, stats, lives };
  }

  private updateHud(): void {
    const g = this.game_;
    const p = g.player;
    this.hud.score.setText(formatNumber(g.score));
    const t = Math.ceil(g.time);
    this.hud.time.setText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
    this.hud.stats.setText(
      `💣 ${p.bombs}   🔥 ${p.fire}   ⚡ ${Math.round((p.speed - 3.3) / 0.45) + 1}`,
    );
    this.hud.lives.forEach((img, i) => img.setVisible(i < p.lives).setTexture(kidKey(this.kid, 0)));
  }

  private buildControls(): void {
    this.input.addPointer(2);
    this.padGfx = this.add.graphics().setDepth(40);
    for (const d of Object.keys(ARROWS) as Dir[]) {
      const at = arrowAt(d);
      addText(this, at.x, at.y, ARROWS[d].label, 44, { color: COLORS.textLight }).setDepth(41);
    }
    this.bombBtn = this.add.graphics().setDepth(40).setPosition(BOMB_BTN.x, BOMB_BTN.y);
    this.add
      .image(BOMB_BTN.x, BOMB_BTN.y + 4, BTex.bomb)
      .setScale(1.1)
      .setDepth(41);

    // Below the board, the right half is the bomb button.
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (!this.running || p.y < BOARD_Y + ROWS * CELL + 10) return;
      if (p.x >= GAME_WIDTH / 2 + 20) this.bombPressed = true;
    });

    const kb = this.input.keyboard;
    if (kb) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      const keys = (...codes: number[]) => codes.map((c) => kb.addKey(c));
      this.keys = {
        up: keys(K.UP, K.W),
        down: keys(K.DOWN, K.S),
        left: keys(K.LEFT, K.A),
        right: keys(K.RIGHT, K.D),
        bomb: keys(K.SPACE, K.X),
      };
    }
  }

  /** Which arrow a finger is on (generous hit area around each button). */
  private arrowUnder(p: Phaser.Input.Pointer): Dir | null {
    let best: Dir | null = null;
    let bestD = PAD.r + 30;
    for (const d of Object.keys(ARROWS) as Dir[]) {
      const at = arrowAt(d);
      const dist = Phaser.Math.Distance.Between(p.x, p.y, at.x, at.y);
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  }

  /** Held arrows: the newest one leads, an older one still held is the fallback. */
  private readInput(): { dir: Dir | null; alt: Dir | null } {
    const now = new Set<Dir>();
    for (const p of this.input.manager.pointers) {
      if (!p.isDown) continue;
      const d = this.arrowUnder(p);
      if (d) now.add(d);
    }
    for (const d of ['up', 'down', 'left', 'right'] as const)
      if (this.keys?.[d].some((k) => k.isDown)) now.add(d);
    this.held = this.held.filter((d) => now.has(d));
    for (const d of now) if (!this.held.includes(d)) this.held.push(d);
    const n = this.held.length;
    return { dir: this.held[n - 1] ?? null, alt: this.held[n - 2] ?? null };
  }

  private drawControls(): void {
    const g = this.padGfx.clear();
    g.fillStyle(0x2b2b3a, 0.12).fillCircle(PAD.x, PAD.y, PAD.gap + PAD.r + 6);
    for (const d of Object.keys(ARROWS) as Dir[]) {
      const at = arrowAt(d);
      const on = this.held.includes(d);
      g.fillStyle(on ? 0x3a86ff : 0x2b2b3a, on ? 0.95 : 0.55).fillCircle(
        at.x,
        at.y,
        on ? PAD.r - 3 : PAD.r,
      );
      g.lineStyle(5, 0xffffff, 0.85).strokeCircle(at.x, at.y, on ? PAD.r - 3 : PAD.r);
    }
    const canBomb = this.game_.bombs.length < this.game_.player.bombs;
    this.bombBtn.clear();
    this.bombBtn.fillStyle(canBomb ? 0xff5d5d : 0x9aa5b8, 0.9).fillCircle(0, 0, BOMB_BTN.r);
    this.bombBtn.lineStyle(7, 0xffffff).strokeCircle(0, 0, BOMB_BTN.r);
  }

  // ── Flow ────────────────────────────────────────────────────────────────

  private chooseKid(): void {
    const layer: Phaser.GameObjects.GameObject[] = [];
    layer.push(
      this.add
        .rectangle(0, 0, GAME_WIDTH, 1280, 0x1d2b53, 0.82)
        .setOrigin(0)
        .setDepth(60)
        .setInteractive(),
    );
    layer.push(
      addText(this, GAME_WIDTH / 2, 230, 'Escolha seu personagem', 44, {
        color: '#ffd23f',
        stroke: '#1d2b53',
        strokeThickness: 10,
      }).setDepth(61),
    );
    KIDS.forEach((kid, i) => {
      const row = i < 4 ? 0 : 1;
      const col = row === 0 ? i : i - 4;
      const perRow = row === 0 ? 4 : 3;
      const x = GAME_WIDTH / 2 + (col - (perRow - 1) / 2) * 165;
      const y = 470 + row * 300;
      const card = this.add.graphics().setDepth(61);
      card
        .fillStyle(0xffffff, i === this.kid ? 1 : 0.85)
        .fillRoundedRect(x - 72, y - 110, 144, 220, 24);
      if (i === this.kid)
        card.lineStyle(8, 0xffd23f).strokeRoundedRect(x - 72, y - 110, 144, 220, 24);
      const img = this.add
        .image(x, y - 10, kidKey(i, 0))
        .setScale(1.15)
        .setDepth(62);
      this.tweens.add({
        targets: img,
        y: y - 18,
        duration: 500 + i * 60,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      const label = addText(this, x, y + 88, kid.name, 28, { color: COLORS.text }).setDepth(62);
      const zone = this.add
        .zone(x, y, 144, 220)
        .setInteractive({ useHandCursor: true })
        .setDepth(63);
      zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        getServices(this).sfx.play('pop');
        this.kid = i;
        saveKid(i);
        this.playerView.setTexture(kidKey(i, 0));
        for (const o of layer) o.destroy();
        this.intro();
      });
      layer.push(card, img, label, zone);
    });
    layer.push(
      addText(this, GAME_WIDTH / 2, 1060, 'Setas para andar\n💣 para soltar a bomba', 30, {
        color: COLORS.textLight,
        stroke: '#1d2b53',
        strokeThickness: 8,
      }).setDepth(61),
    );
  }

  private intro(): void {
    const { sfx } = getServices(this);
    const t = this.bigText(`FASE ${this.game_.level}`, '#ffd23f');
    const sub = addText(this, GAME_WIDTH / 2, 640, 'Exploda os monstros e ache a porta!', 30, {
      color: COLORS.textLight,
      stroke: '#1d2b53',
      strokeThickness: 8,
    }).setDepth(50);
    sfx.play('start');
    this.time.delayedCall(1500, () => {
      t.destroy();
      sub.destroy();
      this.running = true;
    });
  }

  override update(_t: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 1 / 20);
    if (this.running) {
      const bombInput =
        this.bombPressed || !!this.keys?.bomb.some((k) => Phaser.Input.Keyboard.JustDown(k));
      this.bombPressed = false;
      for (const e of this.game_.step(dt, { ...this.readInput(), bomb: bombInput }))
        this.onEvent(e);
    }
    this.render();
    this.updateHud();
    this.drawControls();
  }

  private onEvent(e: BombEvent): void {
    const { sfx } = getServices(this);
    switch (e.type) {
      case 'bomb':
        sfx.play('click');
        break;
      case 'explode':
        sfx.play('hit');
        sfx.vibrate(30);
        this.cameras.main.shake(140, 0.006);
        break;
      case 'brick':
        this.puff(cx(e.x), cy(e.y), 0xe07b39);
        break;
      case 'item':
        sfx.play('star', 2);
        this.floatText(
          cx(e.item.x),
          cy(e.item.y),
          { bomb: '+1 💣', fire: '+1 🔥', speed: '+⚡' }[e.item.kind],
          '#2b9348',
        );
        break;
      case 'enemy':
        sfx.play('pop');
        this.killEnemy(e.enemy);
        this.floatText(cx(posOf(e.enemy).x), cy(posOf(e.enemy).y), `+${e.points}`, '#e63946');
        break;
      case 'die':
        sfx.play('hit');
        sfx.vibrate([80, 40, 80]);
        this.tweens.add({
          targets: this.playerView,
          angle: 720,
          scale: 0,
          duration: 700,
          onComplete: () => this.playerView.setAngle(0).setScale(0.5),
        });
        break;
      case 'door':
        sfx.play('star', 4);
        this.floatText(cx(this.game_.door.x), cy(this.game_.door.y), 'PORTA ABERTA!', '#1d2b53');
        break;
      case 'clear':
        this.levelClear(e.bonus);
        break;
      case 'over':
        this.gameOver();
        break;
    }
  }

  // ── Rendering ───────────────────────────────────────────────────────────

  private render(): void {
    const g = this.game_;
    this.syncTiles();

    // Player: bobbing walk frames, blinking while shielded.
    const p = g.player;
    const pp = posOf(p);
    const moving = p.p > 0;
    const frame = moving && Math.floor(this.time.now / 140) % 2 ? 1 : 0;
    this.playerView
      .setTexture(kidKey(this.kid, frame))
      .setPosition(
        cx(pp.x),
        cy(pp.y) + CELL * 0.36 - (moving ? Math.abs(Math.sin(this.time.now / 70)) * 3 : 0),
      )
      .setFlipX(p.dir === 'left')
      .setDepth(5 + pp.y * 0.01)
      .setAlpha(p.shield > 0 && Math.floor(this.time.now / 90) % 2 ? 0.35 : 1);
    if (p.alive && this.playerView.scale === 0) this.playerView.setScale(0.5);

    for (const e of g.enemies) {
      if (!e.alive) continue;
      let view = this.enemyViews.get(e.id);
      if (!view) {
        view = this.add.image(0, 0, enemyKey(e.kind)).setScale(0.46);
        if (e.kind === 'fantasma') view.setAlpha(0.85);
        this.enemyViews.set(e.id, view);
      }
      const ep = posOf(e);
      const wobble = Math.sin(this.time.now / 120 + e.id) * 0.04;
      view
        .setPosition(cx(ep.x), cy(ep.y) + Math.sin(this.time.now / 160 + e.id) * 2)
        .setScale(0.46 + wobble, 0.46 - wobble)
        .setFlipX(e.dir === 'left')
        .setDepth(5 + ep.y * 0.01);
    }

    const bombsAlive = new Set<number>();
    for (const b of g.bombs) {
      bombsAlive.add(b.id);
      let view = this.bombViews.get(b.id);
      if (!view) {
        view = this.add.image(cx(b.x), cy(b.y), BTex.bomb).setDepth(3);
        this.bombViews.set(b.id, view);
      }
      // Pulses faster as the fuse burns down.
      const pulse = 1 + 0.08 * Math.sin(this.time.now / (40 + b.fuse * 60));
      view
        .setScale(0.5 * pulse)
        .setTint(b.fuse < 0.7 && Math.floor(this.time.now / 80) % 2 ? 0xff8888 : 0xffffff);
    }
    for (const [id, view] of this.bombViews) {
      if (bombsAlive.has(id)) continue;
      view.destroy();
      this.bombViews.delete(id);
    }

    const itemsAlive = new Set<string>();
    for (const it of g.items) {
      const key = `${it.x},${it.y}`;
      itemsAlive.add(key);
      if (!this.itemViews.has(key)) {
        const img = this.add.image(cx(it.x), cy(it.y), itemKey(it.kind)).setScale(0.42).setDepth(2);
        this.tweens.add({ targets: img, scale: 0.48, duration: 400, yoyo: true, repeat: -1 });
        this.itemViews.set(key, img);
      }
    }
    for (const [key, view] of this.itemViews) {
      if (itemsAlive.has(key)) continue;
      view.destroy();
      this.itemViews.delete(key);
    }

    // Flames: an outer orange cross and a yellow core.
    const f = this.flameGfx.clear();
    for (const [color, w] of [
      [0xff7b00, 0.86],
      [0xffd23f, 0.55],
      [0xffffff, 0.22],
    ] as const) {
      for (const fl of g.flames) {
        const k = Math.min(1, fl.t / 0.15);
        const size = CELL * w * k;
        const x = cx(fl.x);
        const y = cy(fl.y);
        f.fillStyle(color, 0.95);
        if (fl.part === 'center') f.fillCircle(x, y, size / 1.6);
        else if (fl.part === 'left' || fl.part === 'right')
          f.fillRect(x - CELL / 2, y - size / 2, CELL, size);
        else f.fillRect(x - size / 2, y - CELL / 2, size, CELL);
      }
    }
  }

  // ── Effects ─────────────────────────────────────────────────────────────

  private killEnemy(e: Enemy): void {
    const view = this.enemyViews.get(e.id);
    if (!view) return;
    this.enemyViews.delete(e.id);
    this.tweens.add({
      targets: view,
      scaleY: 0.05,
      scaleX: 0.7,
      alpha: 0,
      angle: 20,
      duration: 450,
      onComplete: () => view.destroy(),
    });
    this.puff(view.x, view.y, 0xffffff);
  }

  private puff(x: number, y: number, tint: number): void {
    const p = this.add.particles(x, y, Tex.dot, {
      speed: { min: 60, max: 200 },
      lifespan: 380,
      scale: { start: 1.1, end: 0 },
      tint,
      emitting: false,
    });
    p.setDepth(6).explode(10);
    this.time.delayedCall(500, () => p.destroy());
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    const t = addText(this, x, y - 20, text, 26, {
      color,
      stroke: '#ffffff',
      strokeThickness: 6,
    }).setDepth(20);
    this.tweens.add({
      targets: t,
      y: y - 80,
      alpha: 0,
      duration: 900,
      onComplete: () => t.destroy(),
    });
  }

  private bigText(text: string, color: string): Phaser.GameObjects.Text {
    const t = addText(this, GAME_WIDTH / 2, 560, text, 90, {
      color,
      stroke: '#1d2b53',
      strokeThickness: 14,
    })
      .setDepth(50)
      .setScale(1.5)
      .setAlpha(0);
    this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    return t;
  }

  private levelClear(bonus: number): void {
    this.running = false;
    getServices(this).sfx.play('win');
    this.bigText('FASE CONCLUÍDA!', '#5bd46f');
    this.floatText(GAME_WIDTH / 2, 680, `+${formatNumber(bonus)}`, '#e63946');
    this.time.delayedCall(2200, () =>
      this.scene.restart({
        level: this.game_.level + 1,
        carry: this.game_.carry,
      } satisfies BombaData),
    );
  }

  private gameOver(): void {
    this.running = false;
    const g = this.game_;
    const data: GameOverData = {
      gameId: 'bomba',
      title: g.level > 1 ? `Chegou na fase ${g.level}!` : 'Explodiu!',
      lines: [`Monstros explodidos: ${g.enemiesKilled}`],
      record: { score: g.score, details: { level: g.level, monsters: g.enemiesKilled } },
      parent: SceneKeys.Bomba,
      retry: { scene: SceneKeys.Bomba, data: {} },
    };
    this.time.delayedCall(1300, () => this.scene.launch(SceneKeys.GameOver, data));
  }
}
