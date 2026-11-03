import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { BoardScene } from '@/platform/ui/boardGame';
import { burst, hint } from '@/platform/ui/juice';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  cpuMove,
  isOver,
  moves,
  newGame,
  play,
  score,
  STORE,
  type Played,
  type State,
} from './core';

const PIT_R = 38;
const STEP = 80;
const PX0 = 160;
const CPU_Y = 520;
const PLAYER_Y = 790;
const STORE_Y = 655;
const SOW_MS = 150;

/** Where pit `i` is drawn: the player's row along the bottom, the CPU's along the top. */
function pitPos(i: number): { x: number; y: number } {
  if (i === STORE[0]) return { x: 645, y: STORE_Y };
  if (i === STORE[1]) return { x: 75, y: STORE_Y };
  if (i < 6) return { x: PX0 + i * STEP, y: PLAYER_Y };
  return { x: PX0 + (12 - i) * STEP, y: CPU_Y };
}

/** "Mancala" (Kalah): sow seeds round the board, win extra turns and capture, against the CPU. */
export class MancalaScene extends BoardScene {
  private state: State = newGame();
  /** Pits as drawn: differs from `state` while a sowing animates. */
  private view: number[] = [];
  private g!: Phaser.GameObjects.Graphics;
  private counts: Phaser.GameObjects.Text[] = [];
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Mancala, 'mancala', [0x92400e, 0x451a03]);
  }

  create(): void {
    this.g = this.add.graphics().setDepth(5);
    this.counts = Array.from({ length: 14 }, (_, i) =>
      addText(this, 0, 0, '', i === 6 || i === 13 ? 56 : 26, {
        color: '#fff7ed',
        stroke: '#451a03',
        strokeThickness: 6,
      }).setDepth(7),
    );
    this.begin('#fde68a', '#451a03');
    addText(this, GAME_WIDTH / 2, 440, 'ROBÔ', 26, {
      color: '#fda4af',
      stroke: '#451a03',
      strokeThickness: 5,
    }).setDepth(7);
    addText(this, GAME_WIDTH / 2, 870, 'VOCÊ', 26, {
      color: '#7dd3fc',
      stroke: '#451a03',
      strokeThickness: 5,
    }).setDepth(7);
    this.hintBox = hint(
      this,
      ['Toque numa cova sua para semear', 'Termine no depósito e jogue de novo!'],
      1090,
      5000,
    );
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => this.tap(p));
  }

  protected startMatch(): void {
    this.state = newGame();
    this.view = [...this.state.pits];
    this.say(`Nível ${this.level} · sua vez`);
    this.paint();
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.ended || this.busy || this.state.turn !== 0) return;
    for (let i = 0; i < 6; i++) {
      const pos = pitPos(i);
      if (Math.hypot(p.x - pos.x, p.y - pos.y) > PIT_R + 10) continue;
      if (!moves(this.state).includes(i)) {
        getServices(this).sfx.play('locked');
        return;
      }
      this.hintBox?.dismiss();
      this.sow(i);
      return;
    }
  }

  private sow(pit: number): void {
    const before = this.state;
    const res = play(before, pit)!;
    this.busy = true;
    const view = [...before.pits];
    view[pit] = 0;
    this.view = view;
    this.paint();
    res.path.forEach((idx, k) =>
      this.time.delayedCall((k + 1) * SOW_MS, () => {
        this.view[idx]!++;
        getServices(this).sfx.play('tick');
        const pos = pitPos(idx);
        burst(this, pos.x, pos.y, 0xfde68a, 4, { speed: 120, size: 4 });
        this.paint();
      }),
    );
    this.time.delayedCall((res.path.length + 1) * SOW_MS + 120, () =>
      this.landed(before.turn, res),
    );
  }

  private landed(who: 0 | 1, res: Played): void {
    if (this.ended) return;
    this.state = res.state;
    this.view = [...res.state.pits];
    this.busy = false;
    const store = pitPos(STORE[who]);
    if (res.captured > 0) {
      getServices(this).sfx.play('coin');
      this.pop(store.x, store.y - 60, `+${res.captured}`, '#fde047', 44);
    }
    this.paint();
    if (isOver(this.state)) return this.finishMatch();
    if (res.extra)
      this.pop(GAME_WIDTH / 2, 655, 'JOGA DE NOVO!', who === 0 ? '#7dd3fc' : '#fda4af', 40);
    this.next();
  }

  private next(): void {
    if (this.state.turn === 0) {
      this.say(`Nível ${this.level} · sua vez`);
      return;
    }
    this.say('Robô pensando…');
    this.later(650, () => this.sow(cpuMove(this.state, this.level)));
  }

  private finishMatch(): void {
    const [mine, theirs] = score(this.state);
    if (mine > theirs) this.win(`VITÓRIA ${mine}×${theirs}`, (mine - theirs) * 15);
    else if (mine === theirs) this.tie(`EMPATE ${mine}×${theirs}`);
    else this.lose(`Derrota ${mine}×${theirs}`, [`Sementes no depósito: ${mine}`], { seeds: mine });
  }

  private paint(): void {
    const g = this.g.clear();
    g.fillStyle(0x000000, 0.35).fillRoundedRect(22, 402, 676, 506, 40);
    g.fillStyle(0xb45309, 1).fillRoundedRect(16, 394, 676, 506, 40);
    g.lineStyle(6, 0x78350f, 1).strokeRoundedRect(16, 394, 676, 506, 40);
    for (const i of [STORE[0], STORE[1]]) {
      const pos = pitPos(i);
      g.fillStyle(0x78350f, 1).fillRoundedRect(pos.x - 50, pos.y - 170, 100, 340, 46);
      g.lineStyle(4, i === STORE[0] ? 0x7dd3fc : 0xfda4af, 0.9).strokeRoundedRect(
        pos.x - 50,
        pos.y - 170,
        100,
        340,
        46,
      );
    }
    const playable = this.state.turn === 0 && !this.busy ? moves(this.state) : [];
    for (let i = 0; i < 14; i++) {
      const pos = pitPos(i);
      const n = this.view[i] ?? 0;
      const store = i === 6 || i === 13;
      if (!store) {
        g.fillStyle(0x78350f, 1).fillCircle(pos.x, pos.y, PIT_R);
        g.fillStyle(0x451a03, 1).fillCircle(pos.x, pos.y + 2, PIT_R - 6);
        if (playable.includes(i)) g.lineStyle(5, 0xfde047, 1).strokeCircle(pos.x, pos.y, PIT_R + 4);
        // Seeds as little beads (a few shown; the number is exact).
        for (let k = 0; k < Math.min(n, 12); k++) {
          const a = k * 2.4 + i;
          const rad = k === 0 ? 0 : 9 + (k % 3) * 8;
          const colors = [0x38bdf8, 0xf472b6, 0xfde047, 0x4ade80];
          g.fillStyle(colors[(k + i) % 4]!, 1).fillCircle(
            pos.x + Math.cos(a) * rad,
            pos.y + Math.sin(a) * rad,
            7,
          );
        }
      }
      const label = this.counts[i]!;
      label.setText(store ? String(n) : n === 0 ? '' : String(n));
      if (store) label.setPosition(pos.x, pos.y);
      else label.setPosition(pos.x, pos.y + (i < 6 ? PIT_R + 24 : -PIT_R - 24));
    }
  }
}
