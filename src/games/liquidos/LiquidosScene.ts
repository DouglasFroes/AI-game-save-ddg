import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, SceneKeys } from '@/config';
import { MiniScene } from '@/platform/ui/miniGame';
import { addText, Button } from '@/platform/ui/widgets';
import { getServices } from '@/services';
import { isTubeComplete, LiquidosSim, TUBE_CAPACITY, type LiquidosEvent } from './core';

const LIQUID_COLORS = [
  0xff4d6d, // pink-red
  0x4da3ff, // blue
  0xffd23f, // yellow
  0x5bd46f, // green
  0x9d4edd, // purple
  0xff7b25, // orange
  0x2ec4b6, // teal
  0xf15bb5, // magenta
  0x90e0ef, // ice cyan
];

const TUBE_W = 86;
const TUBE_H = 248;
const LAYER_H = 52;

/** "Líquidos Mágicos": tap a tube to pick it up, tap another to pour matching colors. */
export class LiquidosScene extends MiniScene {
  private sim = new LiquidosSim();
  private g!: Phaser.GameObjects.Graphics;
  private levelLabel!: Phaser.GameObjects.Text;
  private movesLabel!: Phaser.GameObjects.Text;
  private extraBtn!: Button;
  private undoBtn!: Button;
  private tubePositions: Array<{ x: number; y: number }> = [];
  private transitioning = false;

  constructor() {
    super(SceneKeys.Liquidos, 'liquidos', [0x141e30, 0x243b55]);
  }

  create(): void {
    this.sim = new LiquidosSim();
    this.transitioning = false;
    this.frame('0');
    this.g = this.add.graphics().setDepth(5);

    this.levelLabel = addText(this, GAME_WIDTH / 2, 162, 'Fase 1', 38, {
      color: '#ffd23f',
      stroke: '#0b1430',
      strokeThickness: 8,
    }).setDepth(20);

    this.movesLabel = addText(this, GAME_WIDTH / 2, 206, 'Separe as cores nos tubos!', 24, {
      color: '#cbd5e1',
      weight: 'normal',
    }).setDepth(20);

    const btnStyle = {
      width: 200,
      height: 76,
      fontSize: 26,
      color: COLORS.secondary,
      shade: COLORS.secondaryDark,
    };

    this.undoBtn = new Button(
      this,
      140,
      1180,
      '↶ Desfazer',
      () => {
        if (this.transitioning || this.ended) return;
        if (this.sim.undo()) {
          getServices(this).sfx.play('click');
          this.draw();
        }
      },
      btnStyle,
    );

    this.extraBtn = new Button(
      this,
      360,
      1180,
      '+1 Tubo',
      () => {
        if (this.transitioning || this.ended) return;
        if (this.sim.addExtraTube()) {
          getServices(this).sfx.play('star');
          this.layoutTubes();
          this.draw();
        }
      },
      { ...btnStyle, color: COLORS.primary, shade: COLORS.primaryDark },
    );

    new Button(
      this,
      580,
      1180,
      '🏁 Encerrar',
      () => {
        if (this.ended) return;
        this.finish(
          `Fase ${this.sim.level} alcançada!`,
          [`Fases completas: ${this.sim.level - 1}`, `Movimentos: ${this.sim.moves}`],
          this.sim.score > 0
            ? { score: this.sim.score, details: { level: this.sim.level, moves: this.sim.moves } }
            : null,
          200,
        );
      },
      { ...btnStyle, color: COLORS.danger, shade: COLORS.dangerDark },
    );

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.ended || this.transitioning || p.y < 230 || p.y > 1100) return;
      const idx = this.hitTube(p.x, p.y);
      if (idx < 0) return;
      const events = this.sim.tapTube(idx);
      for (const ev of events) this.handle(ev);
      this.setScore(this.sim.score);
      this.draw();
    });

    this.layoutTubes();
    this.draw();
  }

  private layoutTubes(): void {
    const count = this.sim.tubes.length;
    const rows = count <= 6 ? 1 : 2;
    this.tubePositions = [];
    if (rows === 1) {
      const gap = Math.min(126, (GAME_WIDTH - 80) / count);
      const startX = GAME_WIDTH / 2 - ((count - 1) * gap) / 2;
      for (let i = 0; i < count; i++) {
        this.tubePositions.push({ x: startX + i * gap, y: 650 });
      }
    } else {
      const topCount = Math.ceil(count / 2);
      const botCount = count - topCount;
      const topGap = Math.min(120, (GAME_WIDTH - 60) / topCount);
      const botGap = Math.min(120, (GAME_WIDTH - 60) / botCount);
      const topStartX = GAME_WIDTH / 2 - ((topCount - 1) * topGap) / 2;
      const botStartX = GAME_WIDTH / 2 - ((botCount - 1) * botGap) / 2;
      for (let i = 0; i < topCount; i++) {
        this.tubePositions.push({ x: topStartX + i * topGap, y: 470 });
      }
      for (let i = 0; i < botCount; i++) {
        this.tubePositions.push({ x: botStartX + i * botGap, y: 840 });
      }
    }
  }

  private hitTube(px: number, py: number): number {
    for (let i = 0; i < this.tubePositions.length; i++) {
      const pos = this.tubePositions[i]!;
      if (Math.abs(px - pos.x) <= TUBE_W / 2 + 16 && Math.abs(py - pos.y) <= TUBE_H / 2 + 28) {
        return i;
      }
    }
    return -1;
  }

  private handle(ev: LiquidosEvent): void {
    const { sfx } = getServices(this);
    switch (ev.type) {
      case 'select':
      case 'deselect':
        sfx.play('click');
        break;
      case 'invalid':
        sfx.play('locked');
        break;
      case 'pour': {
        sfx.play('pop', ev.count);
        const dstPos = this.tubePositions[ev.to]!;
        if (ev.tubeCompleted) {
          sfx.play('star', 2);
          this.pop(dstPos.x, dstPos.y - TUBE_H / 2 - 20, '✨ COMPLETO! +50', '#ffd23f', 30);
        }
        break;
      }
      case 'levelClear': {
        this.transitioning = true;
        sfx.play('win');
        sfx.vibrate(50);
        this.pop(GAME_WIDTH / 2, 640, `🎉 FASE ${ev.level} COMPLETA! +${ev.bonus}`, '#5bd46f', 42);
        this.time.delayedCall(1000, () => {
          this.sim.startLevel(this.sim.level + 1);
          this.transitioning = false;
          this.levelLabel.setText(`Fase ${this.sim.level}`);
          this.layoutTubes();
          this.draw();
        });
        break;
      }
    }
  }

  private draw(): void {
    const g = this.g.clear();
    this.movesLabel.setText(`Movimentos: ${this.sim.moves} · Toque nos tubos para despejar`);
    this.undoBtn.setEnabled(this.sim.canUndo());
    this.extraBtn.setEnabled(!this.sim.extraUsed);

    this.sim.tubes.forEach((tube, idx) => {
      const pos = this.tubePositions[idx];
      if (!pos) return;
      const isSelected = this.sim.selected === idx;
      const lift = isSelected ? -36 : 0;
      const x = pos.x;
      const y = pos.y + lift;
      const left = x - TUBE_W / 2;
      const top = y - TUBE_H / 2;
      const bottom = y + TUBE_H / 2;
      const completed = isTubeComplete(tube);

      // Shadow
      g.fillStyle(0x000000, 0.28).fillRoundedRect(left + 6, top + 10 - lift * 0.4, TUBE_W, TUBE_H, {
        tl: 8,
        tr: 8,
        bl: 38,
        br: 38,
      });

      // Tube glass backdrop
      g.fillStyle(0xffffff, isSelected ? 0.18 : 0.09).fillRoundedRect(left, top, TUBE_W, TUBE_H, {
        tl: 8,
        tr: 8,
        bl: 38,
        br: 38,
      });

      // Liquid layers from bottom (0) to top (3)
      for (let i = 0; i < tube.length; i++) {
        const colorIdx = tube[i]!;
        const color = LIQUID_COLORS[colorIdx % LIQUID_COLORS.length]!;
        const layerBottom = bottom - 10 - i * LAYER_H;
        const layerTop = layerBottom - LAYER_H + 2;
        const radii = i === 0 ? { tl: 4, tr: 4, bl: 30, br: 30 } : { tl: 4, tr: 4, bl: 4, br: 4 };
        g.fillStyle(color, 0.95).fillRoundedRect(
          left + 8,
          layerTop,
          TUBE_W - 16,
          LAYER_H - 2,
          radii,
        );
        // Subtle liquid surface highlight
        g.fillStyle(0xffffff, 0.25).fillRect(left + 12, layerTop + 2, TUBE_W - 24, 5);
      }

      // Glass rim & outline
      const rimColor = completed ? 0xffd23f : isSelected ? 0x38bdf8 : 0xe2e8f0;
      g.lineStyle(isSelected || completed ? 6 : 4, rimColor, 0.92).strokeRoundedRect(
        left,
        top,
        TUBE_W,
        TUBE_H,
        { tl: 8, tr: 8, bl: 38, br: 38 },
      );
      g.fillStyle(rimColor, 0.9).fillRoundedRect(left - 6, top - 6, TUBE_W + 12, 12, 6);

      // Vertical glass reflection
      g.fillStyle(0xffffff, 0.22).fillRoundedRect(left + 10, top + 18, 8, TUBE_H - 54, 4);
    });

    // capacities reference unused lint guard
    void TUBE_CAPACITY;
  }
}
