import type Phaser from 'phaser';
import { bake, canvasTexture } from '@/platform/art/textures';
import type { Color, UCard, Value } from './core';

export const UC_W = 100;
export const UC_H = 150;
export const COLOR_HEX = [0xe63946, 0xffc300, 0x2a9d48, 0x1e6fd9] as const;
const CSS = ['#e63946', '#ffc300', '#2a9d48', '#1e6fd9'];
export const COLOR_NAMES = ['vermelho', 'amarelo', 'verde', 'azul'];
export const UC_BACK = 'uc-back';

const label = (v: Value): string =>
  typeof v === 'number'
    ? String(v)
    : { skip: '⊘', reverse: '⇄', draw2: '+2', wild: '★', wild4: '+4' }[v];

export const ucKey = (c: { color: Color; value: Value }) => `uc-${c.color}-${c.value}`;

function round(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawFace(ctx: CanvasRenderingContext2D, color: Color, value: Value): void {
  round(ctx, 1, 1, UC_W - 2, UC_H - 2, 12);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  round(ctx, 7, 7, UC_W - 14, UC_H - 14, 9);
  if (color === -1) {
    // Wild: four colored quarters.
    ctx.save();
    ctx.clip();
    CSS.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(i % 2 ? UC_W / 2 : 0, i < 2 ? 0 : UC_H / 2, UC_W / 2, UC_H / 2);
    });
    ctx.restore();
  } else {
    ctx.fillStyle = CSS[color]!;
    ctx.fill();
  }
  // White tilted oval in the middle.
  ctx.save();
  ctx.translate(UC_W / 2, UC_H / 2);
  ctx.rotate(-0.5);
  ctx.beginPath();
  ctx.ellipse(0, 0, 34, 56, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
  const text = label(value);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${text.length > 1 ? 40 : 52}px system-ui, sans-serif`;
  ctx.fillStyle = color === -1 ? '#1d1d2b' : CSS[color]!;
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#1d1d2b';
  ctx.strokeText(text, UC_W / 2, UC_H / 2 + 2);
  ctx.fillText(text, UC_W / 2, UC_H / 2 + 2);
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 20, 22);
}

/** Every card face and the back (drawn once, on demand). */
export function ensureUltimaTextures(scene: Phaser.Scene): void {
  const S = 2;
  const values: Value[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 'skip', 'reverse', 'draw2'];
  const faces: Array<{ color: Color; value: Value }> = [];
  for (const color of [0, 1, 2, 3] as const)
    for (const value of values) faces.push({ color, value });
  faces.push({ color: -1, value: 'wild' }, { color: -1, value: 'wild4' });
  for (const f of faces)
    canvasTexture(scene, ucKey(f), UC_W * S, UC_H * S, (ctx) => {
      ctx.scale(S, S);
      drawFace(ctx, f.color, f.value);
    });
  canvasTexture(scene, UC_BACK, UC_W * S, UC_H * S, (ctx) => {
    ctx.scale(S, S);
    round(ctx, 1, 1, UC_W - 2, UC_H - 2, 12);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    round(ctx, 7, 7, UC_W - 14, UC_H - 14, 9);
    ctx.fillStyle = '#1d1d2b';
    ctx.fill();
    ctx.save();
    ctx.translate(UC_W / 2, UC_H / 2);
    ctx.rotate(-0.5);
    ctx.beginPath();
    ctx.ellipse(0, 0, 34, 56, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#e63946';
    ctx.fill();
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillStyle = '#ffd23f';
    ctx.fillText('ÚLTIMA', UC_W / 2, UC_H / 2);
  });
}

export const cardLabel = (c: UCard) => label(c.value);

export function generateUltimaTextures(scene: Phaser.Scene): void {
  bake(scene, 'ultima-icon', 150, 150, (g) => {
    g.fillStyle(0x3c096c).fillRoundedRect(0, 0, 150, 150, 22);
    const card = (x: number, y: number, a: number, c: number) => {
      g.save();
      g.translateCanvas(x, y);
      g.rotateCanvas(a);
      g.fillStyle(0xffffff).fillRoundedRect(-26, -38, 52, 76, 8);
      g.fillStyle(c).fillRoundedRect(-22, -34, 44, 68, 6);
      g.fillStyle(0xffffff).fillEllipse(0, 0, 26, 44);
      g.restore();
    };
    card(48, 80, -0.35, COLOR_HEX[0]);
    card(75, 72, 0, COLOR_HEX[1]);
    card(102, 80, 0.35, COLOR_HEX[3]);
  });
}
