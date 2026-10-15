import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { formatNumber } from '@/platform/ranking';
import type { GameOverData } from '@/platform/scenes/GameOverScene';
import { addText, Button, iconButton } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { COLOR_HEX, COLOR_NAMES, ensureUltimaTextures, UC_BACK, UC_H, UC_W, ucKey } from './art';
import { HUMAN, UltimaRound, type Color, type UCard, type UltimaEvent } from './core';

const BOT_NAMES = ['Bia', 'Caio', 'Duda'];
/** Where each seat sits: 0 you (bottom), 1 left, 2 top, 3 right (turn order is clockwise). */
const SEATS = [
  { x: GAME_WIDTH / 2, y: 1060 },
  { x: 80, y: 560 },
  { x: GAME_WIDTH / 2, y: 250 },
  { x: GAME_WIDTH - 80, y: 560 },
];
const PILE = { x: GAME_WIDTH / 2 - 80, y: 600 };
const DISCARD = { x: GAME_WIDTH / 2 + 80, y: 600 };
const BOT_DELAY = 850;

/** "Última Carta": an Uno-style card game against three bots. */
export class UltimaScene extends Phaser.Scene {
  private round!: UltimaRound;
  private total = 0;
  private wins = 0;
  private layer!: Phaser.GameObjects.Container;
  private hud!: { score: Phaser.GameObjects.Text; info: Phaser.GameObjects.Text };
  private passBtn!: Button;
  private picker: Phaser.GameObjects.Container | null = null;
  private waiting = false;
  private ended = false;

  constructor() {
    super(SceneKeys.Ultima);
  }

  init(): void {
    this.round = new UltimaRound();
    this.total = 0;
    this.wins = 0;
    this.picker = null;
    this.waiting = false;
    this.ended = false;
  }

  create(): void {
    ensureUltimaTextures(this);
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x3c096c, 0x3c096c, 0x10002b, 0x10002b, 1).fillRect(
      0,
      0,
      GAME_WIDTH,
      1280,
    );
    bg.fillStyle(0x5a189a, 0.5).fillEllipse(GAME_WIDTH / 2, 600, 560, 420);
    iconButton(this, 60, 60, '‹', () => this.scene.start(SceneKeys.Hub)).setDepth(10);
    this.hud = {
      score: addText(this, GAME_WIDTH / 2 + 40, 50, '', 34, { color: '#ffd23f' }),
      info: addText(this, GAME_WIDTH / 2, 840, '', 28, { color: '#ffffff' }),
    };
    this.layer = this.add.container(0, 0);
    this.passBtn = new Button(this, GAME_WIDTH / 2, 920, 'Passar a vez', () => this.humanPass(), {
      width: 300,
      height: 74,
      fontSize: 30,
      color: COLORS.secondary,
      shade: COLORS.secondaryDark,
    }).setDepth(20);
    this.render();
    this.schedule();
    if (import.meta.env.DEV) (window as unknown as { __ultima?: UltimaScene }).__ultima = this;
  }

  get state(): UltimaRound {
    return this.round;
  }

  private card(x: number, y: number, key: string, scale = 1, angle = 0): Phaser.GameObjects.Image {
    const im = this.add
      .image(x, y, key)
      .setDisplaySize(UC_W * scale, UC_H * scale)
      .setAngle(angle);
    this.layer.add(im);
    return im;
  }

  private render(): void {
    this.layer.removeAll(true);
    const r = this.round;
    this.hud.score.setText(`${formatNumber(this.total)} pts · Rodada ${this.wins + 1}`);

    // Bots: a small fan of backs, name and count; the one playing glows.
    for (let p = 1; p < 4; p++) {
      const seat = SEATS[p]!;
      const n = r.hands[p]!.length;
      const shown = Math.min(n, 7);
      const vertical = p !== 2;
      if (r.turn === p && !r.over) {
        const glow = this.add.circle(seat.x, seat.y, 92, 0xffd23f, 0.25);
        this.layer.add(glow);
      }
      for (let i = 0; i < shown; i++) {
        const off = (i - (shown - 1) / 2) * 14;
        this.card(
          vertical ? seat.x : seat.x + off,
          vertical ? seat.y + off : seat.y,
          UC_BACK,
          0.62,
          vertical ? 90 : 0,
        );
      }
      this.layer.add(
        addText(this, seat.x, seat.y + (vertical ? 108 : 86), `${BOT_NAMES[p - 1]} · ${n}`, 24, {
          color: r.turn === p ? '#ffd23f' : '#ffffff',
          stroke: '#10002b',
          strokeThickness: 5,
        }),
      );
      if (n === 1)
        this.layer.add(
          addText(this, seat.x, seat.y - 90, 'ÚLTIMA!', 26, {
            color: '#ff4f8b',
            stroke: '#ffffff',
            strokeThickness: 5,
          }),
        );
    }

    // Draw pile and discard with the color in force.
    const pile = this.card(PILE.x, PILE.y, UC_BACK);
    pile.setInteractive({ useHandCursor: true }).on('pointerup', () => this.humanDraw());
    if (r.turn === HUMAN && !r.drawn && !r.playable(HUMAN).length && !r.over)
      this.tweens.add({
        targets: pile,
        scale: pile.scale * 1.08,
        duration: 400,
        yoyo: true,
        repeat: -1,
      });
    this.layer.add(
      this.add.circle(DISCARD.x, DISCARD.y, 92, COLOR_HEX[r.color === -1 ? 0 : r.color]!, 0.45),
    );
    this.card(DISCARD.x, DISCARD.y, ucKey(r.top), 1.05, -6);
    this.layer.add(
      addText(this, GAME_WIDTH / 2, 720, r.direction === 1 ? '↻' : '↺', 44, { color: '#ffffff88' }),
    );

    // Your hand: fanned at the bottom; playable cards stand up.
    const hand = r.hands[HUMAN]!;
    const myTurn = r.turn === HUMAN && !r.over && !this.waiting;
    const playable = new Set(myTurn ? r.playable(HUMAN) : []);
    const step = Math.min(UC_W * 0.95, (GAME_WIDTH - 40 - UC_W) / Math.max(1, hand.length - 1));
    const x0 = GAME_WIDTH / 2 - (step * (hand.length - 1)) / 2;
    hand.forEach((c, i) => {
      const can = playable.has(c);
      const im = this.card(x0 + i * step, SEATS[0]!.y + (can ? -30 : 20), ucKey(c), 1.1);
      if (myTurn && !can) im.setTint(0x9a9aaa);
      if (can) im.setInteractive({ useHandCursor: true }).on('pointerup', () => this.humanPlay(c));
    });

    this.passBtn.setVisible(myTurn && r.drawn !== null);
    this.hud.info.setText(
      r.over
        ? ''
        : r.turn === HUMAN
          ? r.drawn
            ? 'Jogue a carta que comprou ou passe'
            : playable.size
              ? 'Sua vez! Jogue uma carta'
              : 'Sem carta: compre do monte'
          : `Vez de ${BOT_NAMES[r.turn - 1]}…`,
    );
  }

  /** Runs bot turns one by one, with a pause so the player can follow. */
  private schedule(): void {
    if (this.ended || this.round.over || this.round.turn === HUMAN) return;
    this.waiting = true;
    this.time.delayedCall(BOT_DELAY, () => {
      this.waiting = false;
      if (this.ended) return;
      this.onEvents(this.round.botTurn());
      this.render();
      this.schedule();
    });
  }

  private humanPlay(c: UCard): void {
    if (this.waiting || this.picker || this.round.turn !== HUMAN) return;
    if (c.color === -1) {
      this.pickColor((color) => this.afterHuman(this.round.play(c, color)));
      return;
    }
    this.afterHuman(this.round.play(c));
  }

  private humanDraw(): void {
    const r = this.round;
    if (this.waiting || this.picker || r.turn !== HUMAN || r.drawn) return;
    this.afterHuman(r.draw());
  }

  private humanPass(): void {
    if (this.round.pass()) this.afterHuman([]);
  }

  private afterHuman(events: UltimaEvent[]): void {
    this.onEvents(events);
    this.render();
    this.schedule();
  }

  private pickColor(done: (c: Color) => void): void {
    const c = this.add.container(GAME_WIDTH / 2, 600).setDepth(50);
    const shade = this.add.rectangle(0, 0, GAME_WIDTH, 1280, 0x000000, 0.55).setInteractive();
    c.add([shade, addText(this, 0, -170, 'Escolha a cor', 44, { color: '#ffffff' })]);
    COLOR_HEX.forEach((hex, i) => {
      const x = (i % 2 ? 1 : -1) * 90;
      const y = (i < 2 ? -1 : 1) * 80;
      const dot = this.add
        .circle(x, y, 70, hex)
        .setStrokeStyle(6, 0xffffff)
        .setInteractive({ useHandCursor: true });
      dot.on('pointerup', () => {
        c.destroy();
        this.picker = null;
        done(i as Color);
      });
      c.add(dot);
    });
    this.picker = c;
  }

  private onEvents(events: UltimaEvent[]): void {
    const { sfx } = getServices(this);
    for (const e of events) {
      if (e.type === 'play') {
        sfx.play(typeof e.card.value === 'number' ? 'click' : 'pop');
        if (e.card.color === -1)
          this.flash(`Cor: ${COLOR_NAMES[e.color as number]}`, COLOR_HEX[e.color as number]!);
      } else if (e.type === 'draw' && e.count > 1) {
        this.flash(
          `${e.player === HUMAN ? 'Você compra' : `${BOT_NAMES[e.player - 1]} compra`} +${e.count}`,
          0xff4f8b,
        );
        if (e.player === HUMAN) sfx.play('hit');
      } else if (e.type === 'last' && e.player === HUMAN) {
        sfx.play('star', 3);
        this.flash('ÚLTIMA CARTA!', 0xffd23f);
      } else if (e.type === 'round') this.roundOver(e.winner, e.points);
    }
  }

  private flash(text: string, color: number): void {
    const t = addText(this, GAME_WIDTH / 2, 470, text, 40, {
      color: `#${color.toString(16).padStart(6, '0')}`,
      stroke: '#ffffff',
      strokeThickness: 8,
    }).setDepth(30);
    this.tweens.add({
      targets: t,
      y: 430,
      alpha: 0,
      delay: 700,
      duration: 400,
      onComplete: () => t.destroy(),
    });
  }

  private roundOver(winner: number, points: number): void {
    const { sfx } = getServices(this);
    if (winner === HUMAN) {
      this.total += points;
      this.wins++;
      sfx.play('win');
      this.flash(`Rodada sua! +${points}`, 0x5bd46f);
      this.time.delayedCall(1600, () => {
        this.round = new UltimaRound();
        this.render();
        this.schedule();
      });
      return;
    }
    this.ended = true;
    sfx.play('hit');
    const data: GameOverData = {
      gameId: 'ultima',
      title: `${BOT_NAMES[winner - 1]} venceu a rodada!`,
      lines: [`Rodadas vencidas: ${this.wins}`],
      record: { score: this.total, details: { wins: this.wins } },
      parent: SceneKeys.Ultima,
      retry: { scene: SceneKeys.Ultima },
    };
    this.time.delayedCall(1300, () => this.scene.launch(SceneKeys.GameOver, data));
  }
}
