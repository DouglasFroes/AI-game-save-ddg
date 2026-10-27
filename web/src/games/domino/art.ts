import type Phaser from 'phaser';
import { canvasTexture } from '@/platform/art/textures';
import { iconGloss, iconTile } from '@/platform/art/iconTile';

/** Pip positions on a 3×3 grid (0..2) for each face. */
export const PIP_GRID: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [],
  [[1, 1]],
  [
    [0, 0],
    [2, 2],
  ],
  [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ],
  [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2],
  ],
  [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [2, 2],
  ],
];

/** One domino lying on its side: ivory face, centre divider and the two sets of pips. */
export function drawDomino(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  a: number,
  b: number,
  angle = 0,
): void {
  const h = w / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = h * 0.3;
  ctx.shadowOffsetY = h * 0.16;
  const face = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  face.addColorStop(0, '#ffffff');
  face.addColorStop(1, '#e7dcc4');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, h * 0.2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = Math.max(1.2, h * 0.04);
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.4);
  ctx.lineTo(0, h * 0.4);
  ctx.stroke();
  const pip = h * 0.09;
  for (const [side, n] of [
    [-1, a],
    [1, b],
  ] as const) {
    ctx.fillStyle = '#111827';
    for (const [gx, gy] of PIP_GRID[n]!) {
      ctx.beginPath();
      ctx.arc(side * (w / 4) + (gx - 1) * h * 0.27, (gy - 1) * h * 0.27, pip, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function generateDominoTextures(scene: Phaser.Scene): void {
  canvasTexture(scene, 'domino-icon', 150, 150, (ctx) => {
    iconTile(ctx, '#22a65a', '#064e1f');
    const felt = ctx.createRadialGradient(75, 70, 10, 75, 75, 100);
    felt.addColorStop(0, 'rgba(255,255,255,0.18)');
    felt.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = felt;
    ctx.fillRect(0, 0, 150, 150);
    drawDomino(ctx, 62, 52, 96, 6, 4, -0.22);
    drawDomino(ctx, 90, 104, 96, 4, 5, 0.2);
    iconGloss(ctx);
  });
}
