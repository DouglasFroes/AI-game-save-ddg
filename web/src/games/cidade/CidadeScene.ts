import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys } from '@/config';
import { burst, hint } from '@/platform/ui/juice';
import { emojiText, MiniScene } from '@/platform/ui/miniGame';
import { addText } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import {
  EMOJI,
  isOver,
  NAMES,
  newGame,
  place,
  RULES,
  score,
  SIZE,
  TURNS,
  worth,
  type CityState,
} from './core';

const CELL = 108;
const X0 = (GAME_WIDTH - SIZE * CELL) / 2;
const Y0 = 300;
const OFFER_Y = 1060;

const cellCenter = (i: number) => ({
  x: X0 + (i % SIZE) * CELL + CELL / 2,
  y: Y0 + Math.floor(i / SIZE) * CELL + CELL / 2,
});

/** "Cidade": place one of three buildings each turn — neighbours decide how much it is worth. */
export class CidadeScene extends MiniScene {
  private s: CityState = newGame();
  private g!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private rule!: Phaser.GameObjects.Text;
  private tiles: Phaser.GameObjects.Text[] = [];
  private nums: Phaser.GameObjects.Text[] = [];
  private offerIcons: Phaser.GameObjects.Text[] = [];
  private pick = 0;
  private hintBox?: { dismiss: () => void };

  constructor() {
    super(SceneKeys.Cidade, 'cidade', [0x0369a1, 0x14532d]);
  }

  create(): void {
    this.s = newGame();
    this.pick = 0;
    this.frame('0');
    this.g = this.add.graphics().setDepth(3);
    this.info = addText(this, GAME_WIDTH / 2, 178, '', 30, {
      color: '#bae6fd',
      stroke: '#082f49',
      strokeThickness: 6,
    }).setDepth(50);
    this.tiles = Array.from({ length: SIZE * SIZE }, (_, i) => {
      const c = cellCenter(i);
      return emojiText(this, c.x, c.y - 4, '', 60).setDepth(6);
    });
    this.nums = Array.from({ length: SIZE * SIZE }, (_, i) => {
      const c = cellCenter(i);
      return addText(this, c.x + 30, c.y + 30, '', 24, {
        color: '#ffffff',
        stroke: '#082f49',
        strokeThickness: 5,
      }).setDepth(7);
    });
    this.offerIcons = [0, 1, 2].map((k) =>
      emojiText(this, 150 + k * 210, OFFER_Y - 10, '', 84).setDepth(6),
    );
    this.rule = addText(this, GAME_WIDTH / 2, 1190, '', 26, {
      color: '#ffffff',
      stroke: '#082f49',
      strokeThickness: 6,
      wrapWidth: 660,
    }).setDepth(30);
    this.hintBox = hint(
      this,
      ['Escolha um prédio e toque numa casa vazia', 'Vizinhos mudam os pontos!'],
      1130,
      5500,
    );
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.tap(p));
  }

  private tap(p: Phaser.Input.Pointer): void {
    if (this.ended || isOver(this.s)) return;
    const { sfx } = getServices(this);
    for (let k = 0; k < 3; k++) {
      const x = 150 + k * 210;
      if (Math.abs(p.x - x) < 95 && Math.abs(p.y - OFFER_Y) < 80) {
        this.pick = k;
        this.hintBox?.dismiss();
        sfx.play('click');
        return;
      }
    }
    const col = Math.floor((p.x - X0) / CELL);
    const row = Math.floor((p.y - Y0) / CELL);
    if (col < 0 || col >= SIZE || row < 0 || row >= SIZE) return;
    const next = place(this.s, row * SIZE + col, this.pick);
    if (!next) {
      sfx.play('locked');
      return;
    }
    this.hintBox?.dismiss();
    const before = score(this.s.cells);
    this.s = next;
    const gain = score(next.cells) - before;
    const c = cellCenter(row * SIZE + col);
    sfx.play(gain >= 6 ? 'coin' : 'pop');
    burst(this, c.x, c.y, 0xfde047, 8, { speed: 180 });
    this.pop(
      c.x,
      c.y - 30,
      `${gain >= 0 ? '+' : ''}${gain}`,
      gain >= 0 ? '#86efac' : '#fca5a5',
      40,
    );
    this.setScore(score(next.cells));
    if (isOver(next)) {
      this.finish(
        'Cidade pronta!',
        [`Pontos: ${score(next.cells)}`],
        { score: score(next.cells), details: { buildings: next.turn } },
        700,
      );
    }
  }

  override update(): void {
    const s = this.s;
    this.info.setText(`Turno ${Math.min(s.turn + 1, TURNS)}/${TURNS}`);
    const g = this.g.clear();
    g.fillStyle(0x15803d, 1).fillRoundedRect(
      X0 - 14,
      Y0 - 14,
      SIZE * CELL + 28,
      SIZE * CELL + 28,
      28,
    );
    for (let i = 0; i < SIZE * SIZE; i++) {
      const c = cellCenter(i);
      g.fillStyle(s.cells[i] ? 0x166534 : 0x4ade80, s.cells[i] ? 1 : 0.5).fillRoundedRect(
        c.x - CELL / 2 + 4,
        c.y - CELL / 2 + 4,
        CELL - 8,
        CELL - 8,
        14,
      );
      this.tiles[i]!.setText(s.cells[i] ? EMOJI[s.cells[i]!] : '');
      const w = worth(s.cells, i);
      this.nums[i]!.setText(s.cells[i] ? String(w) : '').setColor(w < 0 ? '#fca5a5' : '#ffffff');
    }
    for (let k = 0; k < 3; k++) {
      const x = 150 + k * 210;
      g.fillStyle(0x000000, 0.3).fillRoundedRect(x - 95, OFFER_Y - 85, 190, 170, 24);
      g.fillStyle(k === this.pick ? 0xfde047 : 0x0c4a6e, 1).fillRoundedRect(
        x - 100,
        OFFER_Y - 90,
        190,
        170,
        24,
      );
      this.offerIcons[k]!.setText(s.offers[k] ? EMOJI[s.offers[k]!] : '');
    }
    const b = s.offers[this.pick];
    this.rule.setText(b ? `${NAMES[b]}: ${RULES[b]}` : '');
  }
}
