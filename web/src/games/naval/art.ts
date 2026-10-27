import type Phaser from 'phaser';
import { canvasTexture } from '@/platform/art/textures';
import { iconGloss, iconTile } from '@/platform/art/iconTile';

export function generateNavalTextures(scene: Phaser.Scene): void {
  canvasTexture(scene, 'naval-icon', 150, 150, (ctx) => {
    iconTile(ctx, '#38bdf8', '#0b3a66');
    // Chart grid.
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1.5;
    for (let i = 1; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 25, 0);
      ctx.lineTo(i * 25, 150);
      ctx.moveTo(0, i * 25);
      ctx.lineTo(150, i * 25);
      ctx.stroke();
    }
    // The ship, seen from the side, riding a wave.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
    const hull = ctx.createLinearGradient(0, 66, 0, 102);
    hull.addColorStop(0, '#cbd5e1');
    hull.addColorStop(1, '#475569');
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.moveTo(14, 78);
    ctx.lineTo(136, 78);
    ctx.lineTo(118, 104);
    ctx.lineTo(34, 104);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(52, 58, 44, 20);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(62, 46, 24, 14);
    ctx.fillStyle = '#334155';
    ctx.fillRect(72, 30, 4, 18);
    ctx.fillRect(28, 66, 26, 5);
    ctx.fillRect(102, 66, 24, 5);
    ctx.fillStyle = '#0f172a';
    for (const x of [60, 72, 84]) {
      ctx.beginPath();
      ctx.arc(x, 90, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Water over the hull.
    ctx.fillStyle = 'rgba(14,116,184,0.85)';
    ctx.beginPath();
    ctx.moveTo(0, 104);
    for (let x = 0; x <= 150; x += 10) ctx.lineTo(x, 100 + Math.sin(x / 9) * 4);
    ctx.lineTo(150, 150);
    ctx.lineTo(0, 150);
    ctx.closePath();
    ctx.fill();
    // A hit marker: a burst with a crosshair.
    const fire = ctx.createRadialGradient(112, 40, 2, 112, 40, 24);
    fire.addColorStop(0, '#fff7ae');
    fire.addColorStop(0.45, '#fb923c');
    fire.addColorStop(1, 'rgba(220,38,38,0)');
    ctx.fillStyle = fire;
    ctx.beginPath();
    ctx.arc(112, 40, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(112, 40, 17, 0, Math.PI * 2);
    ctx.moveTo(112, 14);
    ctx.lineTo(112, 28);
    ctx.moveTo(112, 52);
    ctx.lineTo(112, 66);
    ctx.moveTo(86, 40);
    ctx.lineTo(100, 40);
    ctx.moveTo(124, 40);
    ctx.lineTo(138, 40);
    ctx.stroke();
    iconGloss(ctx);
  });
}
