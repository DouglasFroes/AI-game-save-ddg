import type Phaser from 'phaser';
import { canvasTexture } from '@/platform/art/textures';

const S = 150;

/** Glossy rounded tile every icon sits on. */
function tile(ctx: CanvasRenderingContext2D, top: string, bottom: string): void {
  const grad = ctx.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(0, 0, S, S, 22);
  ctx.fill();
  ctx.save();
  ctx.clip();
  const gloss = ctx.createLinearGradient(0, 0, 0, S / 2);
  gloss.addColorStop(0, 'rgba(255,255,255,0.3)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, S, S / 2);
  ctx.restore();
}

function ball(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;
  const body = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
  body.addColorStop(0, '#ffffff');
  body.addColorStop(1, '#cbd5e1');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.6;
  const pent = (px: number, py: number, pr: number, rot: number) => {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = rot + (i * Math.PI * 2) / 5;
      const x = px + Math.cos(a) * pr;
      const y = py + Math.sin(a) * pr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  };
  pent(cx, cy, r * 0.36, -Math.PI / 2);
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.36, cy + Math.sin(a) * r * 0.36);
    ctx.lineTo(cx + Math.cos(a) * r * 0.68, cy + Math.sin(a) * r * 0.68);
    ctx.stroke();
    // A patch peeking in from the rim between two spokes.
    const b = a + Math.PI / 5;
    pent(cx + Math.cos(b) * r * 0.95, cy + Math.sin(b) * r * 0.95, r * 0.26, b + Math.PI);
  }
  ctx.strokeStyle = 'rgba(15,23,42,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}

/** Hub icons of the three football games. */
export function generateFutebolTextures(scene: Phaser.Scene): void {
  // Seleção dos Sonhos: a gold cup over the grass.
  canvasTexture(scene, 'selecao-icon', S, S, (ctx) => {
    tile(ctx, '#22c55e', '#064e1f');
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, S, S, 22);
    ctx.clip();
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
      ctx.fillRect(i * 25, 0, 25, S);
    }
    const glow = ctx.createRadialGradient(75, 62, 6, 75, 62, 70);
    glow.addColorStop(0, 'rgba(253,224,71,0.55)');
    glow.addColorStop(1, 'rgba(253,224,71,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, S, S);
    ctx.restore();

    const gold = ctx.createLinearGradient(40, 0, 110, 0);
    gold.addColorStop(0, '#ca8a04');
    gold.addColorStop(0.35, '#fde047');
    gold.addColorStop(0.55, '#fef9c3');
    gold.addColorStop(1, '#b45309');
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;
    ctx.strokeStyle = '#d99a06';
    ctx.lineWidth = 7;
    // Handles: a half ring on each side of the bowl.
    ctx.beginPath();
    ctx.arc(44, 44, 15, Math.PI * 0.5, Math.PI * 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(106, 44, 15, Math.PI * 1.5, Math.PI * 0.5);
    ctx.stroke();
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.moveTo(44, 22);
    ctx.lineTo(106, 22);
    ctx.bezierCurveTo(106, 62, 94, 82, 75, 86);
    ctx.bezierCurveTo(56, 82, 44, 62, 44, 22);
    ctx.fill();
    ctx.fillRect(68, 84, 14, 18);
    ctx.fillStyle = '#92400e';
    ctx.beginPath();
    ctx.roundRect(48, 100, 54, 14, 5);
    ctx.fill();
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.roundRect(40, 112, 70, 14, 5);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(55, 30);
    ctx.bezierCurveTo(56, 52, 62, 68, 70, 76);
    ctx.stroke();
    ctx.fillStyle = '#92400e';
    ctx.beginPath();
    ctx.arc(75, 44, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(75, 44, 6, 0, Math.PI * 2);
    ctx.fill();
  });

  // Time dos Sonhos BR: the flag's lozenge and a ball.
  canvasTexture(scene, 'timesbr-icon', S, S, (ctx) => {
    tile(ctx, '#16a34a', '#064e1f');
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, S, S, 22);
    ctx.clip();
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(75, 14);
    ctx.lineTo(140, 68);
    ctx.lineTo(75, 124);
    ctx.lineTo(10, 68);
    ctx.closePath();
    ctx.fill();
    const blue = ctx.createRadialGradient(68, 58, 4, 75, 68, 40);
    blue.addColorStop(0, '#3b82f6');
    blue.addColorStop(1, '#1e3a8a');
    ctx.fillStyle = blue;
    ctx.beginPath();
    ctx.arc(75, 68, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(75, 100, 62, Math.PI * 1.22, Math.PI * 1.78);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    for (const [x, y] of [
      [62, 56],
      [88, 52],
      [78, 80],
      [58, 78],
      [95, 74],
    ] as const) {
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ball(ctx, 106, 106, 27);
  });

  // Brasileirão dos Sonhos: a stadium seen from above, with a star for the champion.
  canvasTexture(scene, 'brasileirao-icon', S, S, (ctx) => {
    tile(ctx, '#3b6ff0', '#0b1b57');
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, S, S, 22);
    ctx.clip();
    const stands = ctx.createLinearGradient(0, 22, 0, 128);
    stands.addColorStop(0, '#e2e8f0');
    stands.addColorStop(1, '#64748b');
    ctx.fillStyle = stands;
    ctx.beginPath();
    ctx.ellipse(75, 77, 64, 52, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.ellipse(75, 77, 54, 42, 0, 0, Math.PI * 2);
    ctx.fill();
    // Crowd dots on the ring.
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2;
      ctx.fillStyle = ['#fde047', '#f87171', '#ffffff', '#38bdf8'][i % 4]!;
      ctx.beginPath();
      ctx.arc(75 + Math.cos(a) * 58.5, 77 + Math.sin(a) * 47, 1.9, 0, Math.PI * 2);
      ctx.fill();
    }
    const grass = ctx.createLinearGradient(0, 40, 0, 114);
    grass.addColorStop(0, '#4ade80');
    grass.addColorStop(1, '#15803d');
    ctx.fillStyle = grass;
    ctx.beginPath();
    ctx.roundRect(31, 49, 88, 56, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.strokeRect(36, 54, 78, 46);
    ctx.beginPath();
    ctx.moveTo(75, 54);
    ctx.lineTo(75, 100);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(75, 77, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeRect(36, 66, 11, 22);
    ctx.strokeRect(103, 66, 11, 22);
    ctx.restore();
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 === 0 ? 17 : 7.5;
      const x = 122 + Math.cos(a) * rad;
      const y = 28 + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
}
