import type Phaser from 'phaser';
import { FONT_FAMILY } from '@/config';
import { audio } from './audio';

/** Neon UI helpers shared by the game's screens. */
export const UI = {
  bg: 0x05060f,
  panel: 0x0d1030,
  line: 0x2a3070,
  text: '#e6ecff',
  muted: '#8a93c2',
  accent: 0x4cc9f0,
  hot: 0xff3df2,
  gold: '#ffd23f',
} as const;

export function txt(
  scene: Phaser.Scene,
  x: number,
  y: number,
  value: string,
  size: number,
  color: string = UI.text,
  weight: 'bold' | 'normal' = 'bold',
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, value, {
      fontFamily: FONT_FAMILY,
      fontSize: `${size}px`,
      fontStyle: weight,
      color,
      align: 'center',
    })
    .setOrigin(0.5);
}

/** A glowing rounded panel. */
export function neonPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number = UI.line,
  fill = 0.92,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(UI.panel, fill).fillRoundedRect(x - w / 2, y - h / 2, w, h, 22);
  g.lineStyle(6, color, 0.18).strokeRoundedRect(x - w / 2, y - h / 2, w, h, 22);
  g.lineStyle(2, color, 0.9).strokeRoundedRect(x - w / 2, y - h / 2, w, h, 22);
  return g;
}

export interface NeonButton extends Phaser.GameObjects.Container {
  setLabel(text: string): void;
  setEnabled(on: boolean): void;
}

/** A neon button that reacts to touch, mouse and is triggered once per tap. */
export function neonButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  onClick: () => void,
  color: number = UI.accent,
  size = 34,
): NeonButton {
  const c = scene.add.container(x, y) as NeonButton;
  const g = scene.add.graphics();
  const t = txt(scene, 0, 0, label, size);
  let enabled = true;
  const draw = (hover: boolean) => {
    g.clear();
    g.fillStyle(color, enabled ? (hover ? 0.32 : 0.16) : 0.05).fillRoundedRect(
      -w / 2,
      -h / 2,
      w,
      h,
      18,
    );
    g.lineStyle(8, color, enabled ? 0.2 : 0.05).strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
    g.lineStyle(3, color, enabled ? 1 : 0.35).strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
    t.setAlpha(enabled ? 1 : 0.45);
  };
  draw(false);
  c.add([g, t]);
  c.setSize(w, h).setInteractive({ useHandCursor: true });
  c.on('pointerover', () => draw(true));
  c.on('pointerout', () => {
    draw(false);
    c.setScale(1);
  });
  c.on('pointerdown', () => enabled && c.setScale(0.96));
  c.on('pointerup', () => {
    c.setScale(1);
    if (!enabled) return;
    audio.unlock();
    audio.play('click');
    onClick();
  });
  c.setLabel = (s: string) => t.setText(s);
  c.setEnabled = (on: boolean) => {
    enabled = on;
    draw(false);
  };
  return c;
}

/** "m:ss" */
export const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Hex color number → CSS string. */
export const css = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
