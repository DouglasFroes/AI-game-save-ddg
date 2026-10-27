import type Phaser from 'phaser';
import { bake } from '@/platform/art/textures';

export const LUTA_ICON = 'luta-icon';

/** Hub icon: a red glove punching a "POW" burst. */
export function generateLutaTextures(scene: Phaser.Scene): void {
  bake(scene, LUTA_ICON, 150, 150, (g) => {
    g.fillStyle(0x3a0ca3).fillRoundedRect(0, 0, 150, 150, 22);
    const burst: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i < 16; i++) {
      const r = i % 2 ? 34 : 62;
      const a = (i / 16) * Math.PI * 2;
      burst.push({ x: 92 + Math.cos(a) * r, y: 62 + Math.sin(a) * r });
    }
    g.fillStyle(0xffd23f).fillPoints(burst, true);
    g.fillStyle(0xff5d5d).fillPoints(
      burst.map((p) => ({ x: 92 + (p.x - 92) * 0.7, y: 62 + (p.y - 62) * 0.7 })),
      true,
    );
    // Glove + cuff.
    g.fillStyle(0x14142b).fillCircle(58, 90, 36).fillRoundedRect(8, 74, 40, 40, 10);
    g.fillStyle(0xe63946).fillCircle(58, 90, 31);
    g.fillStyle(0xffffff).fillRoundedRect(12, 79, 32, 30, 8);
    g.fillStyle(0xff8fa3).fillEllipse(66, 78, 22, 12);
  });
}
