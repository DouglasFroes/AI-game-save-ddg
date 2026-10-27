import type Phaser from 'phaser';
import { bake, canvasTexture } from '@/platform/art/textures';
import type { Suit } from './core';

export const CARD_W = 92;
export const CARD_H = 130;
export const SUITS = ['♠', '♥', '♦', '♣'] as const;
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RED = '#d62839';
const BLACK = '#1d1d2b';

export const cardKey = (suit: Suit, rank: number) => `pc-${suit}-${rank}`;
export const CARD_BACK = 'pc-back';
export const CARD_SLOT = 'pc-slot';

function roundRect(
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

/** The 52 faces, the back and an empty slot (drawn once, on demand). */
export function ensureCardTextures(scene: Phaser.Scene): void {
  const S = 2; // drawn at 2× for crisp text
  for (const suit of [0, 1, 2, 3] as Suit[])
    for (let rank = 1; rank <= 13; rank++)
      canvasTexture(scene, cardKey(suit, rank), CARD_W * S, CARD_H * S, (ctx) => {
        ctx.scale(S, S);
        roundRect(ctx, 1, 1, CARD_W - 2, CARD_H - 2, 10);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#b8c0d0';
        ctx.lineWidth = 2;
        ctx.stroke();
        const color = suit === 1 || suit === 2 ? RED : BLACK;
        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = 'bold 30px system-ui, sans-serif';
        ctx.fillText(RANKS[rank]!, 7, 6);
        ctx.font = '26px system-ui, sans-serif';
        ctx.fillText(SUITS[suit], 8, 38);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (rank > 10) {
          // Court cards: a framed big letter.
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          roundRect(ctx, 30, 44, 52, 74, 8);
          ctx.stroke();
          ctx.font = 'bold 40px Georgia, serif';
          ctx.fillText(RANKS[rank]!, 56, 72);
          ctx.font = '22px system-ui, sans-serif';
          ctx.fillText(SUITS[suit], 56, 104);
        } else {
          ctx.font = '54px system-ui, sans-serif';
          ctx.fillText(SUITS[suit], 56, 84);
        }
      });
  canvasTexture(scene, CARD_BACK, CARD_W * S, CARD_H * S, (ctx) => {
    ctx.scale(S, S);
    roundRect(ctx, 1, 1, CARD_W - 2, CARD_H - 2, 10);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    roundRect(ctx, 6, 6, CARD_W - 12, CARD_H - 12, 7);
    ctx.fillStyle = '#3a5bd9';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (let i = -CARD_H; i < CARD_W + CARD_H; i += 12) {
      ctx.beginPath();
      ctx.moveTo(i, 6);
      ctx.lineTo(i + CARD_H, CARD_H);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(CARD_W / 2, CARD_H / 2, 14, 0, Math.PI * 2);
    ctx.fill();
  });
  canvasTexture(scene, CARD_SLOT, CARD_W * S, CARD_H * S, (ctx) => {
    ctx.scale(S, S);
    roundRect(ctx, 2, 2, CARD_W - 4, CARD_H - 4, 10);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.stroke();
  });
}

export function generatePacienciaTextures(scene: Phaser.Scene): void {
  bake(scene, 'paciencia-icon', 150, 150, (g) => {
    g.fillStyle(0x1b7a43).fillRoundedRect(0, 0, 150, 150, 22);
    const card = (x: number, y: number, a: number, red: boolean) => {
      g.save();
      g.translateCanvas(x, y);
      g.rotateCanvas(a);
      g.fillStyle(0x000000, 0.2).fillRoundedRect(-27, -35, 56, 76, 8);
      g.fillStyle(0xffffff).fillRoundedRect(-28, -38, 56, 76, 8);
      g.fillStyle(red ? 0xd62839 : 0x1d1d2b);
      g.fillCircle(-6, -2, 9).fillCircle(6, -2, 9).fillTriangle(-15, 2, 15, 2, 0, 20);
      g.restore();
    };
    card(52, 78, -0.3, false);
    card(98, 74, 0.25, true);
  });
}
