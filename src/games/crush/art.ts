import type Phaser from 'phaser';
import { drawKidHead, KIDS, OUTLINE } from '@/games/bomba/art';
import { bake } from '@/platform/art/textures';

export const headKey = (kind: number) => `crush-head-${kind}`;
export const XTex = { rainbow: 'crush-rainbow', icon: 'crush-icon' } as const;

/** Background bubble behind each head, one color per kid. */
export const KIND_COLORS = [0xffc8f0, 0xc9d6ff, 0xe7c6f2, 0xffdcb8, 0xfff3a6, 0xffc9c9];

const head = (g: Phaser.GameObjects.Graphics, kind: number, x: number, y: number, s: number) => {
  g.save();
  g.translateCanvas(x, y);
  g.scaleCanvas(s, s);
  drawKidHead(g, KIDS[kind]!, 0, 0);
  g.restore();
};

export function generateCrushTextures(scene: Phaser.Scene): void {
  KIDS.slice(0, 6).forEach((_, i) =>
    bake(scene, headKey(i), 110, 110, (g) => head(g, i, 55, 60, 1.18)),
  );
  bake(scene, XTex.rainbow, 110, 110, (g) => {
    const colors = [0xff5d5d, 0xff9a2e, 0xffd23f, 0x5bd46f, 0x4cc9f0, 0x8338ec];
    g.fillStyle(OUTLINE).fillCircle(55, 55, 44);
    colors.forEach((c, i) => {
      g.fillStyle(c)
        .slice(55, 55, 40, (i * Math.PI) / 3, ((i + 1) * Math.PI) / 3, false)
        .fillPath();
    });
    g.fillStyle(0xffffff).fillCircle(55, 55, 16);
    g.fillStyle(0xffffff, 0.6).fillEllipse(40, 36, 18, 10);
  });
  bake(scene, XTex.icon, 150, 150, (g) => {
    g.fillStyle(0xff8fd0).fillRoundedRect(0, 0, 150, 150, 22);
    g.fillStyle(0xffffff, 0.35).fillRoundedRect(8, 8, 134, 40, 16);
    [0, 4, 1].forEach((k, i) => {
      g.fillStyle(KIND_COLORS[k]!).fillCircle(30 + i * 45, 92, 22);
      head(g, k, 30 + i * 45, 94, 0.58);
    });
    g.fillStyle(0xffffff)
      .fillTriangle(118, 26, 112, 42, 124, 42)
      .fillTriangle(118, 52, 112, 36, 124, 36);
  });
}
