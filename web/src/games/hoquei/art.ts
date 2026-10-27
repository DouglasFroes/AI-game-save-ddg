import type Phaser from 'phaser';
import { canvasTexture } from '@/platform/art/textures';
import { iconGloss, iconTile } from '@/platform/art/iconTile';

/** A mallet seen from above: rim, dished face and a knob. */
export function drawMallet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  light: string,
  dark: string,
): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = r * 0.4;
  ctx.shadowOffsetY = r * 0.18;
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const face = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r * 0.85);
  face.addColorStop(0, light);
  face.addColorStop(1, dark);
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.84, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.38, 0, Math.PI * 2);
  ctx.fill();
  const knob = ctx.createRadialGradient(x - r * 0.1, y - r * 0.12, 1, x, y, r * 0.3);
  knob.addColorStop(0, '#ffffff');
  knob.addColorStop(1, light);
  ctx.fillStyle = knob;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
}

export function generateHoqueiTextures(scene: Phaser.Scene): void {
  canvasTexture(scene, 'hoquei-icon', 150, 150, (ctx) => {
    iconTile(ctx, '#1e6fb8', '#071a33');
    ctx.strokeStyle = 'rgba(103,232,249,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 75);
    ctx.lineTo(150, 75);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(75, 75, 26, 0, Math.PI * 2);
    ctx.stroke();
    // The goal mouths glow at both ends.
    for (const y of [0, 150]) {
      const g = ctx.createRadialGradient(75, y, 4, 75, y, 52);
      g.addColorStop(0, 'rgba(244,114,182,0.85)');
      g.addColorStop(1, 'rgba(244,114,182,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, y === 0 ? 0 : 98, 150, 52);
    }
    // Motion streak behind the puck.
    const streak = ctx.createLinearGradient(40, 100, 80, 70);
    streak.addColorStop(0, 'rgba(255,255,255,0)');
    streak.addColorStop(1, 'rgba(255,255,255,0.5)');
    ctx.strokeStyle = streak;
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(38, 104);
    ctx.lineTo(78, 70);
    ctx.stroke();
    drawMallet(ctx, 42, 112, 30, '#fb7185', '#9f1239');
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#0b1220';
    ctx.beginPath();
    ctx.arc(96, 56, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#67e8f9';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(96, 56, 12, 0, Math.PI * 2);
    ctx.stroke();
    iconGloss(ctx);
  });
}
