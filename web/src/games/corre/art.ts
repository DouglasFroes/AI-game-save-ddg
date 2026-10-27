import type Phaser from 'phaser';
import { drawHair, KIDS, OUTLINE, PANTS, type Kid } from '@/games/bomba/art';
import { bake } from '@/platform/art/textures';
import type { PowerKind } from './core';

/** The kid seen from behind (the runner's camera), two running frames, 100×128. */
export const backKey = (kid: number, frame: 0 | 1) => `corre-back-${kid}-${frame}`;
export const CTex = { coin: 'corre-coin', icon: 'corre-icon' } as const;
export const powerKey = (k: PowerKind) => `corre-power-${k}`;

function drawBack(g: Phaser.GameObjects.Graphics, kid: Kid, frame: 0 | 1): void {
  const cx = 50;
  const cy = 52;
  // Legs: one up, one down while running.
  for (const [i, s] of [-1, 1].entries()) {
    const up = (frame === 0) === (i === 0) ? -10 : 2;
    g.fillStyle(OUTLINE).fillRoundedRect(cx + s * 9 - 8, 96 + up, 16, 22, 4);
    g.fillStyle(PANTS).fillRoundedRect(cx + s * 9 - 6, 96 + up, 12, 20, 3);
    g.fillStyle(OUTLINE).fillEllipse(cx + s * 9, 118 + up, 18, 10);
    g.fillStyle(0xffffff).fillEllipse(cx + s * 9, 116 + up, 10, 3);
  }
  // Arms swinging opposite to the legs.
  for (const [i, s] of [-1, 1].entries()) {
    const swing = (frame === 0) === (i === 0) ? 8 : -8;
    g.lineStyle(13, OUTLINE).lineBetween(cx + s * 13, 84, cx + s * 26, 96 + swing);
    g.lineStyle(8, kid.shirt).lineBetween(cx + s * 13, 84, cx + s * 26, 96 + swing);
    g.fillStyle(OUTLINE).fillCircle(cx + s * 26, 96 + swing, 7.5);
    g.fillStyle(kid.skin).fillCircle(cx + s * 26, 96 + swing, 5);
  }
  g.fillStyle(OUTLINE).fillRoundedRect(cx - 19, 76, 38, 28, 8);
  g.fillStyle(kid.shirt).fillRoundedRect(cx - 16, 78, 32, 24, 6);
  // A small backpack.
  g.fillStyle(OUTLINE).fillRoundedRect(cx - 12, 80, 24, 20, 6);
  g.fillStyle(0xffd23f).fillRoundedRect(cx - 10, 82, 20, 16, 5);

  drawHair(g, kid, 'back', cx, cy);
  for (const s of [-1, 1]) {
    g.fillStyle(OUTLINE).fillCircle(cx + s * 31, cy + 4, 8);
    g.fillStyle(kid.skin).fillCircle(cx + s * 31, cy + 4, 5.5);
  }
  g.fillStyle(OUTLINE).fillCircle(cx, cy, 34);
  g.fillStyle(kid.skin).fillCircle(cx, cy, 31);
  // Back of the head: hair covers most of it, the nape shows below.
  const bald = kid.hair === 'moicano';
  if (bald) {
    g.fillStyle(kid.hairColor).fillRoundedRect(cx - 7, cy - 32, 14, 56, 7);
  } else {
    const low = kid.hair === 'tigela' || kid.hair === 'espetado' ? 14 : 22;
    g.fillStyle(kid.hairColor).fillCircle(cx, cy, 31);
    g.fillStyle(kid.skin).fillRect(cx - 14, cy + low, 28, 31 - low);
    g.fillStyle(kid.hairColor).fillEllipse(cx, cy + low, 28, 10);
  }
  if (kid.hair === 'espetado' || kid.hair === 'moicano') drawHair(g, kid, 'front', cx, cy);
}

export function generateCorreTextures(scene: Phaser.Scene): void {
  KIDS.forEach((kid, i) => {
    bake(scene, backKey(i, 0), 100, 128, (g) => drawBack(g, kid, 0));
    bake(scene, backKey(i, 1), 100, 128, (g) => drawBack(g, kid, 1));
  });
  bake(scene, CTex.coin, 64, 64, (g) => {
    g.fillStyle(0xb8860b).fillCircle(32, 33, 28);
    g.fillStyle(0xffd23f).fillCircle(32, 31, 26);
    g.fillStyle(0xffe680).fillCircle(32, 31, 18);
    g.fillStyle(0xd4a017).fillRect(29, 18, 6, 26);
    g.fillStyle(0xffffff, 0.7).fillEllipse(23, 22, 10, 6);
  });
  bake(scene, powerKey('ima'), 80, 80, (g) => {
    g.fillStyle(0xffffff).fillCircle(40, 40, 38);
    g.lineStyle(16, 0xe63946).beginPath().arc(40, 40, 20, Math.PI, 0, false).strokePath();
    g.fillStyle(0xe63946).fillRect(12, 38, 16, 18).fillRect(52, 38, 16, 18);
    g.fillStyle(0xd9d9d9).fillRect(12, 52, 16, 10).fillRect(52, 52, 16, 10);
  });
  bake(scene, powerKey('escudo'), 80, 80, (g) => {
    g.fillStyle(0xffffff).fillCircle(40, 40, 38);
    g.fillStyle(0x3a86ff).fillPoints(
      [
        { x: 40, y: 12 },
        { x: 64, y: 22 },
        { x: 60, y: 50 },
        { x: 40, y: 68 },
        { x: 20, y: 50 },
        { x: 16, y: 22 },
      ],
      true,
    );
    g.fillStyle(0x9bd0ff).fillTriangle(40, 18, 58, 25, 40, 58);
  });
  bake(scene, CTex.icon, 150, 150, (g) => {
    g.fillStyle(0x5ec8ff).fillRoundedRect(0, 0, 150, 150, 22);
    g.fillStyle(0x8d99ae).fillTriangle(75, 40, 0, 150, 150, 150);
    g.fillStyle(0x5c5f73).fillTriangle(75, 40, 14, 150, 136, 150);
    g.fillStyle(0xffffff).fillRect(72, 60, 6, 14).fillRect(71, 90, 8, 20).fillRect(70, 124, 10, 26);
    g.fillStyle(0xffd23f).fillCircle(112, 50, 13).fillCircle(124, 76, 10);
    g.save();
    g.translateCanvas(26, 40);
    g.scaleCanvas(0.82, 0.82);
    drawBack(g, KIDS[1]!, 0);
    g.restore();
  });
}
