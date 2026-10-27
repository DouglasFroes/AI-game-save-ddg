import type Phaser from 'phaser';
import { canvasTexture } from '@/platform/art/textures';
import { iconGloss, iconTile } from '@/platform/art/iconTile';

/** A round checker with a rim and a shine (optionally crowned). */
export function drawChecker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  light: string,
  dark: string,
  crown = false,
): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = r * 0.35;
  ctx.shadowOffsetY = r * 0.22;
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const body = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  body.addColorStop(0, light);
  body.addColorStop(1, dark);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.88, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = Math.max(1.5, r * 0.07);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  if (crown) {
    ctx.fillStyle = '#fde047';
    ctx.strokeStyle = '#a16207';
    ctx.lineWidth = Math.max(1, r * 0.05);
    const w = r * 0.62;
    const h = r * 0.42;
    ctx.beginPath();
    ctx.moveTo(x - w, y + h);
    ctx.lineTo(x - w, y - h * 0.5);
    ctx.lineTo(x - w * 0.5, y + h * 0.05);
    ctx.lineTo(x, y - h);
    ctx.lineTo(x + w * 0.5, y + h * 0.05);
    ctx.lineTo(x + w, y - h * 0.5);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

export function generateDamasTextures(scene: Phaser.Scene): void {
  canvasTexture(scene, 'damas-icon', 150, 150, (ctx) => {
    iconTile(ctx, '#c98a4b', '#5b3416');
    const sq = 150 / 4;
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#f3dfb9' : '#6b3b17';
        ctx.fillRect(c * sq, r * sq, sq + 1, sq + 1);
      }
    drawChecker(ctx, sq * 1.5, sq * 0.5 + 6, 22, '#555b6b', '#0f1220');
    drawChecker(ctx, sq * 0.5, sq * 1.5 + 6, 22, '#555b6b', '#0f1220');
    drawChecker(ctx, sq * 2.5, sq * 2.5 + 4, 27, '#ff8a7a', '#b3131f', true);
    drawChecker(ctx, sq * 1.5, sq * 3.5 + 2, 22, '#ff8a7a', '#b3131f');
    iconGloss(ctx);
  });
}
