import type Phaser from 'phaser';
import { bake } from '@/platform/art/textures';

/** A pencil from its tip at (x, y) pointing outwards along `angle`. */
export const drawPencil = (
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  angle: number,
  len = 120,
) => {
  // From the tip at (x,y) outwards along `angle`.
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const px = -uy * 9;
  const py = ux * 9;
  const at = (d: number, side: number) => ({
    x: x + ux * d + px * side,
    y: y + uy * d + py * side,
  });
  g.fillStyle(0x3d2c22).fillTriangle(x, y, at(18, 1).x, at(18, 1).y, at(18, -1).x, at(18, -1).y);
  g.fillStyle(0xffc300).fillPoints(
    [at(18, 1), at(len - 16, 1), at(len - 16, -1), at(18, -1)],
    true,
  );
  g.fillStyle(0xd9d9d9).fillPoints(
    [at(len - 16, 1), at(len - 8, 1), at(len - 8, -1), at(len - 16, -1)],
    true,
  );
  g.fillStyle(0xff8fa3).fillPoints(
    [at(len - 8, 1), at(len, 1), at(len, -1), at(len - 8, -1)],
    true,
  );
};

export function generateAlvoTextures(scene: Phaser.Scene): void {
  bake(scene, 'alvo-icon', 150, 150, (g) => {
    g.fillStyle(0x1d2b53).fillRoundedRect(0, 0, 150, 150, 22);
    g.fillStyle(0xc68642).fillCircle(75, 62, 46);
    g.fillStyle(0x3d2c22).fillCircle(60, 50, 6).fillCircle(88, 70, 6).fillCircle(72, 82, 5);
    drawPencil(g, 75, 108, Math.PI / 2, 40);
    drawPencil(g, 118, 50, -0.2, 30);
  });
}

/** The target changes every level. */
export interface TargetStyle {
  readonly name: string;
  /** Colors for the crumbs flying when it breaks. */
  readonly crumbs: readonly number[];
  draw(g: Phaser.GameObjects.Graphics, r: number): void;
}

const ring = (
  g: Phaser.GameObjects.Graphics,
  n: number,
  d: number,
  size: number,
  color: number,
) => {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + d * 0.01;
    g.fillStyle(color).fillCircle(Math.cos(a) * d, Math.sin(a) * d, size);
  }
};

export const TARGETS: readonly TargetStyle[] = [
  {
    name: 'Biscoito',
    crumbs: [0xd9a066, 0x8d5524, 0x3d2c22],
    draw: (g, r) => {
      g.fillStyle(0x8d5524).fillCircle(0, 0, r + 6);
      g.fillStyle(0xd9a066).fillCircle(0, 0, r);
      ring(g, 7, 70, 9, 0x3d2c22);
      ring(g, 9, 125, 8, 0x3d2c22);
    },
  },
  {
    name: 'Pizza',
    crumbs: [0xffd166, 0xe63946, 0xc68642],
    draw: (g, r) => {
      g.fillStyle(0xc68642).fillCircle(0, 0, r + 8);
      g.fillStyle(0xe63946).fillCircle(0, 0, r - 6);
      g.fillStyle(0xffd166).fillCircle(0, 0, r - 18);
      ring(g, 6, 80, 16, 0xc1121f);
      ring(g, 8, 125, 13, 0xc1121f);
      g.fillStyle(0x2ecc71);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.4;
        g.fillEllipse(Math.cos(a) * 105, Math.sin(a) * 105, 18, 9);
      }
    },
  },
  {
    name: 'Laranja',
    crumbs: [0xff9f1c, 0xffbf69, 0xffffff],
    draw: (g, r) => {
      g.fillStyle(0xf77f00).fillCircle(0, 0, r + 6);
      g.fillStyle(0xfff1d6).fillCircle(0, 0, r - 4);
      for (let i = 0; i < 10; i++) {
        const a0 = (i / 10) * Math.PI * 2 + 0.05;
        const a1 = ((i + 1) / 10) * Math.PI * 2 - 0.05;
        g.fillStyle(0xffa62b)
          .slice(0, 0, r - 12, a0, a1, false)
          .fillPath();
      }
    },
  },
  {
    name: 'Rosquinha',
    crumbs: [0xff8fab, 0xffd6e0, 0x8d5524],
    draw: (g, r) => {
      g.fillStyle(0xc68642).fillCircle(0, 0, r + 6);
      g.fillStyle(0xff8fab).fillCircle(0, 0, r - 8);
      const sprinkles = [0xffd23f, 0x4cc9f0, 0x5bd46f, 0xffffff, 0x8338ec];
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2;
        const d = 85 + (i % 3) * 22;
        g.fillStyle(sprinkles[i % sprinkles.length]!).fillRect(
          Math.cos(a) * d - 7,
          Math.sin(a) * d - 2,
          14,
          4,
        );
      }
    },
  },
  {
    name: 'Melancia',
    crumbs: [0xff4d6d, 0x2d6a4f, 0x1f1f2b],
    draw: (g, r) => {
      g.fillStyle(0x2d6a4f).fillCircle(0, 0, r + 8);
      g.fillStyle(0xb7e4c7).fillCircle(0, 0, r - 4);
      g.fillStyle(0xff4d6d).fillCircle(0, 0, r - 16);
      ring(g, 8, 90, 6, 0x1f1f2b);
      ring(g, 11, 122, 6, 0x1f1f2b);
    },
  },
  {
    name: 'Bolo',
    crumbs: [0xffffff, 0xff8fab, 0x8d5524],
    draw: (g, r) => {
      g.fillStyle(0x8d5524).fillCircle(0, 0, r + 6);
      g.fillStyle(0xfff1e6).fillCircle(0, 0, r - 4);
      ring(g, 12, r - 22, 15, 0xff8fab);
      ring(g, 6, 88, 12, 0xe63946);
    },
  },
  {
    name: 'Boia',
    crumbs: [0xe63946, 0xffffff, 0x4cc9f0],
    draw: (g, r) => {
      g.fillStyle(0x1f1f2b).fillCircle(0, 0, r + 6);
      for (let i = 0; i < 8; i++) {
        const a0 = (i / 8) * Math.PI * 2;
        g.fillStyle(i % 2 ? 0xffffff : 0xe63946)
          .slice(0, 0, r, a0, a0 + Math.PI / 4, false)
          .fillPath();
      }
      g.fillStyle(0x4cc9f0).fillCircle(0, 0, 74);
    },
  },
];

export const targetFor = (level: number): TargetStyle => TARGETS[(level - 1) % TARGETS.length]!;
