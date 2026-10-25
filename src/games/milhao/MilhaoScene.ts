import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import type { GameOverData } from '@/platform/scenes/GameOverScene';
import { addText, Button, iconButton } from '@/platform/ui/widgets';
import { BrowserStore, readJson, writeJson } from '@/platform/storage';
import { getServices } from '@/services';
import { formatTime } from '@/platform/ranking';
import { formatPrize } from './art';
import {
  LADDER,
  LEVEL_ORDER,
  LEVELS,
  MilhaoGame,
  QUESTION_COUNT,
  type EndReason,
  type Level,
} from './core';

const CX = GAME_WIDTH / 2;
const RECENT_KEY = 'arcade.milhao.recent';
const RECENT_MAX = 400;
const LETTERS = ['A', 'B', 'C', 'D'];
const ANSWER_Y = 560;
const ANSWER_GAP = 112;
const GOLD = 0xffd23f;

export interface MilhaoData {
  level?: Level;
}

interface AnswerView {
  box: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
  extra: Phaser.GameObjects.Text;
  zone: Phaser.GameObjects.Zone;
}

/** "Jogo do Milhão": a TV-style quiz up to R$ 1 milhão. */
export class MilhaoScene extends Phaser.Scene {
  private game_ = new MilhaoGame();
  /** Null until the player picks a level. */
  private level: Level | null = null;
  private answers: AnswerView[] = [];
  private questionText!: Phaser.GameObjects.Text;
  private header!: Phaser.GameObjects.Text;
  private prizeTexts!: {
    wrong: Phaser.GameObjects.Text;
    stop: Phaser.GameObjects.Text;
    right: Phaser.GameObjects.Text;
  };
  private clock!: Phaser.GameObjects.Graphics;
  private clockText!: Phaser.GameObjects.Text;
  private helpButtons = new Map<string, Phaser.GameObjects.Container>();
  private message!: Phaser.GameObjects.Text;
  /** Waiting for a reveal: input is ignored. */
  private busy = false;

  constructor() {
    super(SceneKeys.Milhao);
  }

  init(data: MilhaoData = {}): void {
    this.level = data.level ?? null;
    this.game_ = new MilhaoGame(
      Math.random,
      undefined,
      this.level ?? 'normal',
      readJson<string[]>(new BrowserStore(), RECENT_KEY) ?? [],
    );
    this.answers = [];
    this.helpButtons = new Map();
    this.busy = false;
  }

  create(): void {
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0b1a4a, 0x0b1a4a, 0x02061a, 0x02061a, 1).fillRect(
      0,
      0,
      GAME_WIDTH,
      1280,
    );
    bg.fillStyle(0x2a52be, 0.18).fillTriangle(CX, -40, -120, 1280, GAME_WIDTH + 120, 1280);
    iconButton(this, 60, 60, '‹', () => this.scene.start(SceneKeys.Hub)).setDepth(10);
    this.header = addText(this, CX + 40, 60, '', 30, { color: '#ffd23f' });
    this.clock = this.add.graphics();
    this.clockText = addText(this, GAME_WIDTH - 70, 150, '', 30, { color: '#ffffff' });

    const qbox = this.add.graphics();
    qbox.fillStyle(0x000000, 0.35).fillRoundedRect(30, 196, GAME_WIDTH - 60, 270, 30);
    qbox.lineStyle(4, GOLD).strokeRoundedRect(30, 190, GAME_WIDTH - 60, 270, 30);
    qbox.fillStyle(0x10265e).fillRoundedRect(32, 192, GAME_WIDTH - 64, 266, 28);
    this.questionText = addText(this, CX, 325, '', 34, { color: '#ffffff', wrapWidth: 600 });

    for (let i = 0; i < 4; i++) {
      const y = ANSWER_Y + i * ANSWER_GAP;
      const box = this.add.graphics();
      const text = addText(this, CX + 30, y, '', 28, { color: '#ffffff', wrapWidth: 470 });
      const extra = addText(this, GAME_WIDTH - 80, y, '', 24, { color: '#ffd23f' });
      const zone = this.add
        .zone(CX, y, GAME_WIDTH - 60, ANSWER_GAP - 14)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerup', () => this.choose(i));
      this.answers.push({ box, text, extra, zone });
    }
    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
      const i = 'abcd'.indexOf(ev.key.toLowerCase());
      if (i >= 0) this.choose(i);
    });

    // What's at stake.
    const stakes = (x: number, label: string, color: number) => {
      const g = this.add.graphics();
      g.fillStyle(color, 0.9).fillRoundedRect(x - 105, 1000, 210, 96, 18);
      addText(this, x, 1024, label, 22, { color: '#ffffffcc', weight: 'normal' });
      return addText(this, x, 1064, '', 26, { color: '#ffffff' });
    };
    this.prizeTexts = {
      wrong: stakes(CX - 225, 'Errar', 0xc1121f),
      stop: stakes(CX, 'Parar', 0xe0a800),
      right: stakes(CX + 225, 'Acertar', 0x2b9348),
    };

    const helps: Array<[string, string, () => void]> = [
      ['cartas', '🃏\nCartas', () => this.useCartas()],
      ['universitarios', '🎓\nUniversit.', () => this.useUniversitarios()],
      ['placas', '📊\nPlacas', () => this.usePlacas()],
      ['pular', '', () => this.useSkip()],
      ['parar', '✋\nParar', () => this.stopHere()],
    ];
    helps.forEach(([id, label, fn], i) => {
      const x = 80 + i * 140;
      const c = this.add.container(x, 1180);
      const g = this.add.graphics();
      g.fillStyle(id === 'parar' ? 0xe0a800 : 0x2a52be).fillRoundedRect(-62, -50, 124, 100, 20);
      g.lineStyle(3, 0xffffff, 0.6).strokeRoundedRect(-62, -50, 124, 100, 20);
      c.add([g, addText(this, 0, 0, label, 22, { color: '#ffffff' })]);
      c.setSize(124, 100).setInteractive({ useHandCursor: true });
      c.on('pointerup', () => {
        if (this.busy || this.game_.over) return;
        getServices(this).sfx.play('click');
        fn();
      });
      this.helpButtons.set(id, c);
    });
    this.message = addText(this, CX, 960, '', 26, { color: '#ffd23f', wrapWidth: 640 });

    this.showQuestion();
    if (!this.level) this.showLevelPicker();
    if (import.meta.env.DEV) (window as unknown as { __milhao?: MilhaoScene }).__milhao = this;
  }

  /** Saves what was asked, so the next runs start with questions the player has not seen lately. */
  private rememberQuestions(): void {
    if (!this.level) return; // still on the level picker: this game is thrown away
    const store = new BrowserStore();
    const before = (readJson<string[]>(store, RECENT_KEY) ?? []).filter(
      (t) => !this.game_.asked.includes(t),
    );
    writeJson(store, RECENT_KEY, [...before, ...this.game_.asked].slice(-RECENT_MAX));
  }

  private showLevelPicker(): void {
    this.busy = true;
    const shade = this.add
      .rectangle(CX, 640, GAME_WIDTH, 1280, 0x02061a, 0.94)
      .setDepth(40)
      .setInteractive();
    const title = addText(this, CX, 330, 'Escolha o nível', 52, { color: '#ffd23f' }).setDepth(41);
    const hint = addText(
      this,
      CX,
      410,
      'Muda a dificuldade das perguntas e o tempo.\nEmpate no ranking: menos ajudas, depois menos tempo.',
      24,
      { color: '#ffffffcc', weight: 'normal', wrapWidth: 620 },
    ).setDepth(41);
    const colors = [
      [0x2b9348, 0x1b6b30],
      [0x2a52be, 0x1a3a8c],
      [0xc1121f, 0x8c0d17],
    ] as const;
    const buttons = LEVEL_ORDER.map((level, i) => {
      const def = LEVELS[level];
      const [color, shade2] = colors[i]!;
      return new Button(
        this,
        CX,
        560 + i * 130,
        `${def.label} · ${def.time}s`,
        () => this.scene.restart({ level } satisfies MilhaoData),
        { width: 480, height: 104, color, shade: shade2, fontSize: 40 },
      ).setDepth(41);
    });
    this.events.once('shutdown', () =>
      [shade, title, hint, ...buttons].forEach((o) => o.destroy()),
    );
  }

  /** The rules object (for tests in the browser). */
  get state(): MilhaoGame {
    return this.game_;
  }

  private drawAnswer(i: number, fill: number, line = GOLD): void {
    const y = ANSWER_Y + i * ANSWER_GAP;
    const g = this.answers[i]!.box.clear();
    g.fillStyle(fill).fillRoundedRect(30, y - 46, GAME_WIDTH - 60, 92, 46);
    g.lineStyle(3, line).strokeRoundedRect(30, y - 46, GAME_WIDTH - 60, 92, 46);
    g.fillStyle(GOLD).fillCircle(84, y, 30);
  }

  private showQuestion(): void {
    const g = this.game_;
    this.rememberQuestions();
    const q = g.question;
    this.header.setText(
      `Pergunta ${g.step + 1} de ${QUESTION_COUNT} · ${formatPrize(LADDER[g.step]!)}`,
    );
    this.questionText.setText(q.text).setFontSize(q.text.length > 80 ? 30 : 34);
    g.order.forEach((opt, i) => {
      this.drawAnswer(i, 0x10265e);
      const a = this.answers[i]!;
      a.text.setText(q.options[opt]!).setAlpha(1);
      a.extra.setText('');
      a.box.setAlpha(1);
      // The letter sits in the gold circle.
      a.text.setData('letter', LETTERS[i]);
    });
    this.letters();
    const p = g.prizes;
    this.prizeTexts.wrong.setText(formatPrize(p.wrong));
    this.prizeTexts.stop.setText(formatPrize(p.stop));
    this.prizeTexts.right.setText(formatPrize(p.right));
    this.message.setText(
      g.step === QUESTION_COUNT - 1 ? 'Pergunta do MILHÃO! Se errar, perde tudo.' : '',
    );
    const skip = this.helpButtons.get('pular');
    (skip?.list[1] as Phaser.GameObjects.Text | undefined)?.setText(`⏭\nPular (${g.skipsLeft})`);
    for (const [id, c] of this.helpButtons) {
      const spent = id === 'pular' ? g.skipsLeft === 0 : g.used.has(id as never);
      c.setAlpha(spent ? 0.35 : 1);
    }
    this.cameras.main.flash(150, 40, 80, 200);
  }

  private letterTexts: Phaser.GameObjects.Text[] = [];
  private letters(): void {
    if (this.letterTexts.length) return;
    for (let i = 0; i < 4; i++)
      this.letterTexts.push(
        addText(this, 84, ANSWER_Y + i * ANSWER_GAP, LETTERS[i]!, 30, { color: '#0b1a4a' }),
      );
  }

  private choose(i: number): void {
    const g = this.game_;
    if (this.busy || g.over || g.removed.has(i)) return;
    this.busy = true;
    const { sfx } = getServices(this);
    sfx.play('click');
    this.drawAnswer(i, 0xe07a00, 0xffffff);
    this.message.setText('Está certo disso?…');
    const rightPos = g.rightPosition;
    this.time.delayedCall(1300, () => {
      const right = g.answer(i);
      this.drawAnswer(rightPos, 0x2b9348, 0xffffff);
      if (right) {
        sfx.play('win');
        this.message.setText(g.over ? 'VOCÊ GANHOU 1 MILHÃO!' : 'Certa resposta!');
        this.tweens.add({
          targets: this.answers[i]!.text,
          scale: 1.12,
          duration: 140,
          yoyo: true,
          repeat: 2,
        });
        this.time.delayedCall(g.over ? 1800 : 1200, () => {
          this.busy = false;
          if (g.over) this.finish();
          else this.showQuestion();
        });
      } else {
        sfx.play('hit');
        sfx.vibrate([60, 40, 60]);
        this.drawAnswer(i, 0xc1121f, 0xffffff);
        this.message.setText('Que pena, resposta errada!');
        this.cameras.main.shake(250, 0.01);
        this.time.delayedCall(1800, () => this.finish());
      }
    });
  }

  private stopHere(): void {
    this.game_.stop();
    this.finish();
  }

  private useSkip(): void {
    if (!this.game_.skip()) return;
    this.showQuestion();
    this.message.setText('Pergunta pulada!');
  }

  private useCartas(): void {
    const n = this.game_.cartas();
    if (n < 0) return;
    const card = ['um Rei', 'um Ás', 'um 2', 'um 3'][n]!;
    this.message.setText(
      n === 0
        ? `Você tirou ${card}: nenhuma resposta eliminada.`
        : `Você tirou ${card}: ${n} errada${n > 1 ? 's' : ''} eliminada${n > 1 ? 's' : ''}!`,
    );
    for (const pos of this.game_.removed) {
      this.answers[pos]!.text.setAlpha(0.15);
      this.answers[pos]!.box.setAlpha(0.3);
    }
    this.helpButtons.get('cartas')?.setAlpha(0.35);
  }

  private useUniversitarios(): void {
    const votes = this.game_.universitarios();
    if (!votes.length) return;
    this.message.setText(`Os universitários acham: ${votes.map((v) => LETTERS[v]).join(', ')}`);
    this.helpButtons.get('universitarios')?.setAlpha(0.35);
  }

  private usePlacas(): void {
    const pct = this.game_.placas();
    if (!pct.length) return;
    pct.forEach((p, i) => {
      if (!this.game_.removed.has(i)) this.answers[i]!.extra.setText(`${p}%`);
    });
    this.message.setText('A plateia votou!');
    this.helpButtons.get('placas')?.setAlpha(0.35);
  }

  private finish(): void {
    const g = this.game_;
    const hits = g.end === 'won' ? QUESTION_COUNT : g.step;
    const time = Math.round(g.elapsed);
    const titles: Record<EndReason, string> = {
      won: 'VOCÊ É MILIONÁRIO!',
      stopped: 'Parou na hora certa!',
      wrong: 'Resposta errada!',
      timeout: 'Acabou o tempo!',
    };
    const data: GameOverData = {
      gameId: 'milhao',
      title: titles[g.end ?? 'stopped'],
      lines: [
        `${LEVELS[g.level].label} · Prêmio: ${formatPrize(g.prize)} · Acertos: ${hits}`,
        `Ajudas: ${g.helps} · Tempo: ${formatTime(time)}`,
      ],
      record: {
        score: g.prize,
        details: { hits, helps: g.helps, time, level: LEVEL_ORDER.indexOf(g.level) },
      },
      parent: SceneKeys.Milhao,
      retry: { scene: SceneKeys.Milhao, data: { level: g.level } satisfies MilhaoData },
    };
    this.scene.launch(SceneKeys.GameOver, data);
  }

  override update(_t: number, deltaMs: number): void {
    const g = this.game_;
    if (!this.busy && !g.over && g.tick(deltaMs / 1000)) {
      getServices(this).sfx.play('hit');
      this.drawAnswer(g.rightPosition, 0x2b9348, 0xffffff);
      this.busy = true;
      this.time.delayedCall(1500, () => this.finish());
    }
    const k = g.time / LEVELS[g.level].time;
    const c = this.clock.clear();
    c.fillStyle(0xffffff, 0.15).fillRoundedRect(110, 140, GAME_WIDTH - 250, 20, 10);
    c.fillStyle(k > 0.25 ? GOLD : 0xff3b3b).fillRoundedRect(
      110,
      140,
      Math.max(20, (GAME_WIDTH - 250) * k),
      20,
      10,
    );
    this.clockText.setText(`${Math.ceil(g.time)}s`);
  }
}
