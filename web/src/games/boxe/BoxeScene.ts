import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { banner, burst, flash, hint, shockwave } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  BoxSim,
  MY_HP,
  RIVALS,
  ROUNDS,
  type BoxEvent,
  type Dodge,
  type Guard,
  type Side,
} from './core';

const CX = GAME_WIDTH / 2;
const BODY_Y = 700;
const SKIN = [0xf1c27d, 0xc68642, 0x8d5524, 0xe0ac69, 0x5c3a21];
const TRUNKS = [0x16a34a, 0xdb2777, 0xf59e0b, 0x475569, 0x7c3aed];

/** Glove spots (relative to the body) for each guard. */
const GUARD_POS: Record<Guard, [number, number, number, number]> = {
  alta: [-58, -250, 58, -250],
  esquerda: [-70, -245, 120, -70],
  direita: [-120, -70, 70, -245],
  aberta: [-115, -60, 115, -60],
};

/** "Boxe": dodge his telegraphed punches (swipe), counter when he is open (tap left/right). */
export class BoxeScene extends MiniScene {
  private sim = new BoxSim();
  private world!: Phaser.GameObjects.Container;
  private rival!: Phaser.GameObjects.Container;
  private head!: Phaser.GameObjects.Container;
  private torso!: Phaser.GameObjects.Graphics;
  private gloveL!: Phaser.GameObjects.Container;
  private gloveR!: Phaser.GameObjects.Container;
  private brows!: Phaser.GameObjects.Graphics;
  private stars!: Phaser.GameObjects.Text;
  private myL!: Phaser.GameObjects.Container;
  private myR!: Phaser.GameObjects.Container;
  private hud!: Phaser.GameObjects.Graphics;
  private names!: Phaser.GameObjects.Text[];
  private clockText!: Phaser.GameObjects.Text;
  private press: { x: number; y: number } | null = null;
  private tutorial?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Boxe, 'boxe', [0x111827, 0x450a0a]);
  }

  create(): void {
    this.sim = new BoxSim();
    this.frame('0');
    this.world = this.add.container(0, 0);
    this.drawArena();
    this.rival = this.makeRival();
    this.world.add(this.rival);
    this.myL = this.makeGlove(0x2563eb, 1.3).setPosition(170, 1150).setDepth(8);
    this.myR = this.makeGlove(0x2563eb, 1.3).setPosition(550, 1150).setDepth(8).setScale(-1.3, 1.3);
    this.hud = this.add.graphics().setDepth(9);
    this.names = [
      addText(this, 40, 214, 'VOCÊ', 22, { color: '#93c5fd' }).setOrigin(0, 0.5).setDepth(9),
      addText(this, GAME_WIDTH - 40, 214, '', 22, { color: '#fca5a5' })
        .setOrigin(1, 0.5)
        .setDepth(9),
    ];
    this.clockText = addText(this, CX, 214, '', 24, { color: '#ffffff' }).setDepth(9);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.y < 130) return;
      this.tutorial?.dismiss();
      this.press = { x: p.x, y: p.y };
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      const s = this.press;
      this.press = null;
      if (!s || this.ended) return;
      const dx = p.x - s.x;
      const dy = p.y - s.y;
      if (Math.hypot(dx, dy) < 34) this.punch(p.x < CX ? 'L' : 'R');
      else if (Math.abs(dx) > Math.abs(dy)) this.slip(dx < 0 ? 'left' : 'right');
      else if (dy > 0) this.slip('down');
    });
    this.input.keyboard?.on('keydown-LEFT', () => this.slip('left'));
    this.input.keyboard?.on('keydown-RIGHT', () => this.slip('right'));
    this.input.keyboard?.on('keydown-DOWN', () => this.slip('down'));
    this.input.keyboard?.on('keydown-A', () => this.punch('L'));
    this.input.keyboard?.on('keydown-D', () => this.punch('R'));
    this.tutorial = hint(
      this,
      [
        'Soco vindo da ESQUERDA: deslize →',
        'Da DIREITA: deslize ← · Direto: deslize ↓',
        'Toque à esquerda/direita para socar',
      ],
      1000,
      6000,
    );
    this.intro();
  }

  // ---------------------------------------------------------------- drawing

  private drawArena(): void {
    const g = this.add.graphics();
    for (let i = 0; i < 200; i++)
      g.fillStyle(0xffffff, 0.05 + ((i * 7) % 10) / 100).fillCircle(
        (i * 47) % GAME_WIDTH,
        250 + ((i * 89) % 380),
        4,
      );
    g.fillStyle(0xfef3c7, 0.07).fillTriangle(CX - 60, 140, CX - 380, 1280, CX + 260, 1280);
    g.fillStyle(0x1e3a8a).fillRect(0, 980, GAME_WIDTH, 300);
    const ropes = [0xef4444, 0xffffff, 0x2563eb];
    ropes.forEach((c, i) =>
      g.lineStyle(10, c).lineBetween(0, 560 + i * 90, GAME_WIDTH, 590 + i * 90),
    );
    g.fillStyle(0x9ca3af)
      .fillRect(20, 520, 26, 330)
      .fillRect(GAME_WIDTH - 46, 520, 26, 330);
    this.world.add(g);
  }

  private makeGlove(color: number, scale = 1): Phaser.GameObjects.Container {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3).fillEllipse(6, 10, 120, 110);
    g.fillStyle(color).fillEllipse(0, 0, 120, 110);
    g.fillStyle(color).fillEllipse(-46, 10, 46, 60);
    g.fillStyle(0xffffff, 0.3).fillEllipse(-14, -22, 50, 24);
    g.fillStyle(0xf8fafc).fillRoundedRect(-36, 44, 72, 34, 10);
    return this.add.container(0, 0, [g]).setScale(scale);
  }

  private makeRival(): Phaser.GameObjects.Container {
    this.torso = this.add.graphics();
    const headG = this.add.graphics();
    this.brows = this.add.graphics();
    this.head = this.add.container(0, -250, [headG, this.brows]);
    this.gloveL = this.makeGlove(0xdc2626, 0.95);
    this.gloveR = this.makeGlove(0xdc2626, 0.95).setScale(-0.95, 0.95);
    this.stars = emojiText(this, 0, -380, '', 56);
    const c = this.add.container(CX, BODY_Y, [
      this.torso,
      this.head,
      this.gloveL,
      this.gloveR,
      this.stars,
    ]);
    this.dress();
    return c;
  }

  /** Paints the current boxer (skin, trunks, face). */
  private dress(): void {
    const i = this.sim.rival;
    const skin = SKIN[i % SKIN.length]!;
    const t = this.torso.clear();
    t.fillStyle(skin).fillRoundedRect(-150, -170, 300, 300, 60);
    t.fillStyle(0x000000, 0.12).fillRoundedRect(-150, -40, 300, 170, 50);
    t.fillStyle(TRUNKS[i % TRUNKS.length]!).fillRoundedRect(-160, 110, 320, 170, 30);
    t.fillStyle(0xffffff).fillRect(-160, 110, 320, 20);
    const h = this.head.list[0] as Phaser.GameObjects.Graphics;
    h.clear();
    h.fillStyle(skin).fillCircle(0, 0, 92);
    h.fillStyle(0x1f2937).fillEllipse(0, -64, 170, 70);
    h.fillStyle(0xffffff).fillEllipse(-32, -6, 34, 22).fillEllipse(32, -6, 34, 22);
    h.fillStyle(0x111827).fillCircle(-30, -4, 8).fillCircle(30, -4, 8);
    h.fillStyle(0x7f1d1d).fillRoundedRect(-28, 40, 56, 14, 7);
    h.fillStyle(0x000000, 0.15).fillEllipse(0, 18, 26, 32);
    this.drawBrows(false);
    this.names?.[1]?.setText(this.sim.info.name.toUpperCase());
  }

  private drawBrows(angry: boolean): void {
    const b = this.brows.clear();
    b.lineStyle(9, 0x111827);
    b.lineBetween(-52, angry ? -34 : -26, -14, angry ? -20 : -28);
    b.lineBetween(52, angry ? -34 : -26, 14, angry ? -20 : -28);
  }

  // ---------------------------------------------------------------- flow

  private intro(): void {
    const s = this.sim;
    this.dress();
    banner(this, `${s.info.name}`, '#fde047', 640);
    this.pop(CX, 720, `Luta ${s.rival + 1} de ${RIVALS.length}`, '#ffffff', 34);
  }

  private punch(side: Side): void {
    if (this.ended) return;
    const events = this.sim.punch(side);
    if (!events.length) return;
    const glove = side === 'L' ? this.myL : this.myR;
    this.tweens.killTweensOf(glove);
    const home = side === 'L' ? { x: 170, y: 1150 } : { x: 550, y: 1150 };
    glove.setPosition(home.x, home.y);
    this.tweens.add({
      targets: glove,
      x: side === 'L' ? CX - 70 : CX + 70,
      y: BODY_Y - 230,
      duration: 90,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
    this.handle(events);
  }

  private slip(dir: Dodge): void {
    if (this.ended || !this.sim.slip(dir)) return;
    getServices(this).sfx.play('zap');
    const dx = dir === 'left' ? 150 : dir === 'right' ? -150 : 0;
    const dy = dir === 'down' ? -130 : 0;
    this.tweens.killTweensOf(this.world);
    this.tweens.add({
      targets: this.world,
      x: dx,
      y: dy,
      duration: 120,
      yoyo: true,
      hold: 220,
      ease: 'Quad.easeOut',
    });
  }

  override update(_t: number, deltaMs: number): void {
    if (this.ended) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    this.handle(this.sim.step(dt));
    this.pose();
    this.drawHud();
  }

  /** Gloves and face follow the rival's state every frame. */
  private pose(): void {
    const s = this.sim;
    const [lx, ly, rx, ry] = GUARD_POS[s.exposed > 0 ? 'aberta' : s.guard];
    let l = { x: lx, y: ly, s: 0.95, glow: false };
    let r = { x: rx, y: ry, s: 0.95, glow: false };
    const a = s.attack;
    if (a) {
      const wind = Math.min(1, a.t / a.wind);
      const strike = Math.max(0, (a.t - a.wind) / 0.16);
      if (a.kind === 'hookL')
        l =
          strike > 0
            ? { x: -230 + 230 * strike, y: -200 + 100 * strike, s: 0.95 + 2 * strike, glow: true }
            : { x: lx - 170 * wind, y: ly - 20 * wind, s: 0.95, glow: true };
      else if (a.kind === 'hookR')
        r =
          strike > 0
            ? { x: 230 - 230 * strike, y: -200 + 100 * strike, s: 0.95 + 2 * strike, glow: true }
            : { x: rx + 170 * wind, y: ry - 20 * wind, s: 0.95, glow: true };
      else
        r =
          strike > 0
            ? { x: 30, y: -230 + 60 * strike, s: 0.95 + 2.2 * strike, glow: true }
            : { x: 40, y: -170 + 30 * wind, s: 0.95 - 0.2 * wind, glow: true };
    }
    const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 45);
    this.gloveL.setPosition(l.x, l.y).setScale(l.s, l.s).setAlpha(1);
    this.gloveR.setPosition(r.x, r.y).setScale(-r.s, r.s);
    (this.gloveL.list[0] as Phaser.GameObjects.Graphics).setAlpha(l.glow ? 0.75 + 0.25 * pulse : 1);
    (this.gloveR.list[0] as Phaser.GameObjects.Graphics).setAlpha(r.glow ? 0.75 + 0.25 * pulse : 1);
    this.gloveL.setDepth(l.s > 1.2 ? 2 : 0);
    this.drawBrows(!!a);
    this.stars.setText(s.exposed > 0 ? '💫' : '').setAngle(this.time.now / 4);
    // Breathing bob.
    this.rival.y = BODY_Y + Math.sin(this.time.now / 300) * 6;
    this.rival.x = CX + Math.sin(this.time.now / 700) * 14;
  }

  private drawHud(): void {
    const s = this.sim;
    const g = this.hud.clear();
    const bar = (x: number, w: number, frac: number, color: number, alignRight: boolean) => {
      g.fillStyle(0x000000, 0.5).fillRoundedRect(x, 160, w, 26, 10);
      const fw = Math.max(0, w * frac);
      g.fillStyle(color).fillRoundedRect(alignRight ? x + w - fw : x, 160, fw, 26, 10);
    };
    bar(30, 270, s.myHp / MY_HP, 0x3b82f6, false);
    bar(GAME_WIDTH - 300, 270, s.hp / s.info.hp, 0xef4444, true);
    g.fillStyle(0x000000, 0.5).fillRoundedRect(30, 236, 200, 12, 6);
    g.fillStyle(s.stamina >= 14 ? 0xfde047 : 0x9ca3af).fillRoundedRect(
      30,
      236,
      2 * s.stamina,
      12,
      6,
    );
    this.clockText.setText(`R${s.round}/${ROUNDS} · ${Math.max(0, Math.ceil(s.clock))}s`);
  }

  private handle(events: BoxEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e.type === 'windup') sfx.play('tick');
      else if (e.type === 'feint') this.pop(CX, 380, 'Finta!', '#fde68a', 36);
      else if (e.type === 'dodged') {
        sfx.play('star');
        this.pop(CX, 400, 'ESQUIVOU! Contra-ataque!', '#86efac', 38);
      } else if (e.type === 'hurt') {
        sfx.play('hit');
        sfx.vibrate([70]);
        flash(this, 0xdc2626, 0.35, 260);
        this.cameras.main.shake(220, 0.014);
      } else if (e.type === 'hit') {
        sfx.play(e.counter ? 'boom' : 'pop');
        const hx = this.rival.x + (e.side === 'L' ? -40 : 40);
        const hy = this.rival.y - 250;
        burst(this, hx, hy, e.counter ? 0xfde047 : 0xffffff, e.counter ? 18 : 8);
        if (e.counter) shockwave(this, hx, hy, 0xfde047, 70);
        this.pop(
          hx,
          hy - 90,
          `${e.counter ? 'CONTRA! ' : ''}-${e.damage}`,
          e.counter ? '#fde047' : '#ffffff',
          e.counter ? 40 : 32,
        );
        this.tweens.add({
          targets: this.head,
          x: e.side === 'L' ? 26 : -26,
          angle: e.side === 'L' ? 10 : -10,
          duration: 70,
          yoyo: true,
        });
        this.setScore(this.sim.score);
      } else if (e.type === 'blocked') {
        sfx.play('bounce');
        this.pop(
          this.rival.x + (e.side === 'L' ? -80 : 80),
          this.rival.y - 300,
          'Bloqueou',
          '#cbd5e1',
          26,
        );
      } else if (e.type === 'tired') this.pop(CX, 1000, 'Sem fôlego!', '#fde047', 30);
      else if (e.type === 'round') {
        banner(this, `ROUND ${e.round}`, '#ffffff', 640);
        sfx.play('level');
        this.time.delayedCall(1600, () => this.sim.nextRound());
      } else if (e.type === 'ko' || e.type === 'decision') {
        const mine = e.winner === 'me';
        banner(
          this,
          e.type === 'ko'
            ? mine
              ? 'NOCAUTE!'
              : 'VOCÊ CAIU!'
            : mine
              ? 'VENCEU NOS PONTOS'
              : 'PERDEU NOS PONTOS',
          mine ? '#fde047' : '#fca5a5',
          640,
        );
        sfx.play(mine ? 'win' : 'hit');
        if (mine && e.type === 'ko') {
          flash(this, 0xffffff, 0.4, 300);
          this.tweens.add({
            targets: this.rival,
            angle: 70,
            y: BODY_Y + 300,
            alpha: 0.3,
            duration: 700,
            ease: 'Quad.easeIn',
          });
        }
        this.setScore(this.sim.score);
        if (mine && !this.sim.over)
          this.time.delayedCall(2200, () => {
            this.sim.nextRival();
            this.rival.setAngle(0).setAlpha(1).setY(BODY_Y);
            this.intro();
          });
      } else if (e.type === 'over') {
        const s = this.sim;
        this.time.delayedCall(1400, () =>
          this.finish(
            s.champion ? 'CAMPEÃO DOS PESOS! 🥊' : `Derrotado por ${s.info.name}`,
            [`Nocautes: ${s.kos} · Esquivas: ${s.dodges} · Contra-ataques: ${s.counters}`],
            { score: s.score, details: { kos: s.kos, dodges: s.dodges } },
            200,
          ),
        );
      }
    }
  }
}
