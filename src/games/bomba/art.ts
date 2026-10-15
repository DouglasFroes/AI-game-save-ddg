import Phaser from 'phaser';
import { bake } from '@/platform/art/textures';
import type { EnemyKind, ItemKind } from './core';

/**
 * Procedural art for "Bombinhas": original cartoon kids (big round heads, dot eyes, open smile,
 * bold outline, flat colors) with a distinctive hairdo each, plus cute monsters and the tiles.
 * Drawn at 2× and shown at half size so they stay crisp.
 */

export type HairStyle =
  'chiquinhas' | 'espetado' | 'liso' | 'black' | 'rabinho' | 'tigela' | 'moicano';

export interface Kid {
  readonly name: string;
  readonly hair: HairStyle;
  readonly hairColor: number;
  readonly skin: number;
  readonly shirt: number;
}

export const KIDS: readonly Kid[] = [
  { name: 'Lulu', hair: 'chiquinhas', hairColor: 0xffe14d, skin: 0xffe0c4, shirt: 0xff2bd6 },
  { name: 'Téo', hair: 'espetado', hairColor: 0xff7a1a, skin: 0xffdcbc, shirt: 0x2346ff },
  { name: 'Mel', hair: 'liso', hairColor: 0x161616, skin: 0xffe3c8, shirt: 0x9d22b8 },
  { name: 'Davi', hair: 'black', hairColor: 0x5a3416, skin: 0x8a5532, shirt: 0xff9a2e },
  { name: 'Bia', hair: 'rabinho', hairColor: 0xff2222, skin: 0xffdcc0, shirt: 0xffe81a },
  { name: 'Kauã', hair: 'tigela', hairColor: 0x161616, skin: 0xffdcc0, shirt: 0xff2a2a },
  { name: 'Zeca', hair: 'moicano', hairColor: 0x2ecc40, skin: 0xffe0c8, shirt: 0x3ae63a },
];

export const kidKey = (i: number, frame: 0 | 1) => `bomba-kid-${i}-${frame}`;
export const enemyKey = (k: EnemyKind) => `bomba-enemy-${k}`;
export const itemKey = (k: ItemKind) => `bomba-item-${k}`;
export const BTex = {
  floor: 'bomba-floor',
  floorAlt: 'bomba-floor-alt',
  wall: 'bomba-wall',
  brick: 'bomba-brick',
  bomb: 'bomba-bomb',
  door: 'bomba-door',
  doorOpen: 'bomba-door-open',
  icon: 'bomba-icon',
} as const;

export const OUTLINE = 0x1f1f2b;
export const PANTS = 0x2b2b3a;

function drawHair(
  g: Phaser.GameObjects.Graphics,
  kid: Kid,
  layer: 'back' | 'front',
  cx: number,
  cy: number,
): void {
  const c = kid.hairColor;
  const ol = (fn: () => void, width = 3) => {
    g.lineStyle(width, OUTLINE);
    fn();
  };
  if (layer === 'back') {
    switch (kid.hair) {
      case 'black':
        for (const [dx, dy, r] of [
          [-26, -8, 18],
          [26, -8, 18],
          [-18, -26, 20],
          [18, -26, 20],
          [0, -32, 22],
          [-30, 10, 13],
          [30, 10, 13],
        ] as const) {
          g.fillStyle(OUTLINE).fillCircle(cx + dx, cy + dy, r + 3);
        }
        for (const [dx, dy, r] of [
          [-26, -8, 18],
          [26, -8, 18],
          [-18, -26, 20],
          [18, -26, 20],
          [0, -32, 22],
          [-30, 10, 13],
          [30, 10, 13],
        ] as const) {
          g.fillStyle(c).fillCircle(cx + dx, cy + dy, r);
        }
        break;
      case 'liso':
        g.fillStyle(OUTLINE).fillRoundedRect(cx - 35, cy - 18, 70, 58, 14);
        g.fillStyle(c).fillRoundedRect(cx - 32, cy - 16, 64, 54, 12);
        break;
      case 'chiquinhas':
        for (const s of [-1, 1]) {
          g.fillStyle(OUTLINE).fillCircle(cx + s * 36, cy - 10, 15);
          g.fillStyle(c).fillCircle(cx + s * 36, cy - 10, 12);
          g.fillStyle(0xff4fa3).fillCircle(cx + s * 27, cy - 14, 5);
        }
        break;
      case 'rabinho':
        g.fillStyle(OUTLINE).fillEllipse(cx + 2, cy - 44, 26, 30);
        g.fillStyle(c).fillEllipse(cx + 2, cy - 44, 20, 24);
        g.fillStyle(OUTLINE).fillEllipse(cx - 8, cy - 52, 18, 22);
        g.fillStyle(c).fillEllipse(cx - 8, cy - 52, 13, 17);
        break;
    }
    return;
  }
  // Front layer: the cap of hair over the forehead.
  switch (kid.hair) {
    case 'chiquinhas':
    case 'rabinho':
    case 'liso':
    case 'black': {
      g.fillStyle(c)
        .slice(cx, cy + 2, 31, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(360), false)
        .fillPath();
      // Fringe bumps.
      for (let i = -2; i <= 2; i++) g.fillStyle(c).fillCircle(cx + i * 11, cy - 4, 8);
      ol(() =>
        g
          .beginPath()
          .arc(cx, cy + 2, 31, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(360))
          .strokePath(),
      );
      if (kid.hair === 'rabinho') g.fillStyle(0x3ad1ff).fillRect(cx - 7, cy - 34, 16, 6);
      break;
    }
    case 'espetado': {
      g.fillStyle(c)
        .slice(cx, cy + 2, 31, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(360), false)
        .fillPath();
      for (let i = -3; i <= 3; i++) {
        const x = cx + i * 9;
        const pts = [
          { x: x - 8, y: cy - 18 },
          { x: x + i * 2, y: cy - 44 + Math.abs(i) * 4 },
          { x: x + 8, y: cy - 18 },
        ];
        g.fillStyle(OUTLINE).fillTriangle(
          pts[0]!.x - 2,
          pts[0]!.y + 2,
          pts[1]!.x,
          pts[1]!.y - 3,
          pts[2]!.x + 2,
          pts[2]!.y + 2,
        );
        g.fillStyle(c).fillTriangle(
          pts[0]!.x,
          pts[0]!.y,
          pts[1]!.x,
          pts[1]!.y,
          pts[2]!.x,
          pts[2]!.y,
        );
      }
      for (let i = -2; i <= 2; i++) g.fillStyle(c).fillCircle(cx + i * 11, cy - 6, 8);
      break;
    }
    case 'tigela': {
      g.fillStyle(OUTLINE).fillRoundedRect(cx - 34, cy - 34, 68, 36, {
        tl: 32,
        tr: 32,
        bl: 6,
        br: 6,
      });
      g.fillStyle(c).fillRoundedRect(cx - 31, cy - 31, 62, 31, { tl: 29, tr: 29, bl: 5, br: 5 });
      break;
    }
    case 'moicano': {
      for (let i = -2; i <= 2; i++) {
        const x = cx + i * 7;
        g.fillStyle(OUTLINE).fillTriangle(
          x - 8,
          cy - 22,
          x,
          cy - 50 + Math.abs(i) * 5,
          x + 8,
          cy - 22,
        );
        g.fillStyle(c).fillTriangle(x - 5, cy - 22, x, cy - 46 + Math.abs(i) * 5, x + 5, cy - 22);
      }
      g.fillStyle(c).fillEllipse(cx, cy - 24, 22, 14);
      break;
    }
  }
}

/** A kid, 100×128: big head, small body; `frame` 1 swaps the legs for walking. */
function drawKid(g: Phaser.GameObjects.Graphics, kid: Kid, frame: 0 | 1): void {
  const cx = 50;
  const cy = 54; // head center
  // Legs and shoes.
  const legs = frame === 0 ? [0, 0] : [-5, 4];
  for (const [i, s] of [-1, 1].entries()) {
    const lift = legs[i]!;
    g.fillStyle(OUTLINE).fillRoundedRect(cx + s * 9 - 8, 98 + lift, 16, 20 - lift, 4);
    g.fillStyle(PANTS).fillRoundedRect(cx + s * 9 - 6, 98 + lift, 12, 18 - lift, 3);
    g.fillStyle(OUTLINE).fillEllipse(cx + s * 11, 120 + lift / 2, 22, 11);
  }
  // Arms (behind the shirt), hands out like in a cheerful pose.
  for (const s of [-1, 1]) {
    const hx = cx + s * 30;
    const hy = frame === 0 ? 92 : 88 + s * 3;
    g.lineStyle(13, OUTLINE).lineBetween(cx + s * 12, 86, hx, hy);
    g.lineStyle(8, kid.shirt).lineBetween(cx + s * 12, 86, hx, hy);
    g.fillStyle(OUTLINE).fillCircle(hx, hy, 8);
    g.fillStyle(kid.skin).fillCircle(hx, hy, 5.5);
  }
  // Shirt.
  g.fillStyle(OUTLINE).fillRoundedRect(cx - 19, 78, 38, 26, 8);
  g.fillStyle(kid.shirt).fillRoundedRect(cx - 16, 80, 32, 22, 6);

  drawKidHead(g, kid, cx, cy);
}

export type Mood = 'happy' | 'hurt' | 'ko';

/** The kid's head (hair, ears, face) centered on (cx, cy); radius 31 plus hair. */
export function drawKidHead(
  g: Phaser.GameObjects.Graphics,
  kid: Kid,
  cx: number,
  cy: number,
  mood: Mood = 'happy',
): void {
  drawHair(g, kid, 'back', cx, cy);
  for (const s of [-1, 1]) {
    g.fillStyle(OUTLINE).fillCircle(cx + s * 31, cy + 4, 8);
    g.fillStyle(kid.skin).fillCircle(cx + s * 31, cy + 4, 5.5);
  }
  g.fillStyle(OUTLINE).fillCircle(cx, cy, 34);
  g.fillStyle(kid.skin).fillCircle(cx, cy, 31);
  drawHair(g, kid, 'front', cx, cy);

  // Face: dot eyes with a shine, open smile with tongue, rosy cheeks.
  for (const s of [-1, 1]) {
    if (mood === 'ko') {
      g.lineStyle(3.5, OUTLINE)
        .lineBetween(cx + s * 10 - 5, cy + 1, cx + s * 10 + 5, cy + 11)
        .lineBetween(cx + s * 10 + 5, cy + 1, cx + s * 10 - 5, cy + 11);
    } else if (mood === 'hurt') {
      g.lineStyle(3.5, OUTLINE)
        .lineBetween(cx + s * 10 - 5, cy + 3 - s * 3, cx + s * 10 + 5, cy + 6)
        .lineBetween(cx + s * 10 - 5, cy + 9 + s * 3, cx + s * 10 + 5, cy + 6);
    } else {
      g.fillStyle(OUTLINE).fillEllipse(cx + s * 10, cy + 6, 9, 13);
      g.fillStyle(0xffffff).fillCircle(cx + s * 10 + 1.5, cy + 2.5, 2);
    }
    g.fillStyle(0xff8fa3, 0.55).fillEllipse(cx + s * 20, cy + 16, 10, 6);
  }
  if (mood === 'happy') {
    g.fillStyle(OUTLINE)
      .slice(cx, cy + 15, 10, 0, Math.PI, false)
      .fillPath();
    g.fillStyle(0xb3122e)
      .slice(cx, cy + 15, 7.5, 0, Math.PI, false)
      .fillPath();
    g.fillStyle(0xff6b8b).fillEllipse(cx, cy + 20, 9, 5);
  } else {
    g.fillStyle(OUTLINE).fillEllipse(cx, cy + 21, 12, 13);
    g.fillStyle(0xb3122e).fillEllipse(cx, cy + 21, 7, 8);
  }
}

function drawEnemy(g: Phaser.GameObjects.Graphics, kind: EnemyKind): void {
  const eyes = (y: number, angry = false) => {
    for (const s of [-1, 1]) {
      g.fillStyle(0xffffff).fillEllipse(50 + s * 13, y, 18, 22);
      g.fillStyle(OUTLINE).fillEllipse(50 + s * 12, y + 3, 9, 12);
      g.fillStyle(0xffffff).fillCircle(50 + s * 12 + 2, y, 2);
      if (angry) g.lineStyle(4, OUTLINE).lineBetween(50 + s * 22, y - 16, 50 + s * 5, y - 9);
    }
  };
  switch (kind) {
    case 'bolha': {
      g.fillStyle(OUTLINE).fillEllipse(50, 58, 82, 74);
      g.fillStyle(0xff7eb6).fillEllipse(50, 58, 75, 67);
      g.fillStyle(0xffffff, 0.35).fillEllipse(34, 38, 20, 12);
      eyes(52);
      g.fillStyle(OUTLINE).slice(50, 70, 8, 0, Math.PI, false).fillPath();
      break;
    }
    case 'rapido': {
      for (const s of [-1, 1]) g.fillStyle(OUTLINE).fillEllipse(50 + s * 16, 90, 20, 12);
      g.fillStyle(OUTLINE).fillCircle(50, 52, 38);
      g.fillStyle(0x3a86ff).fillCircle(50, 52, 34);
      for (let i = -1; i <= 1; i++)
        g.fillStyle(0x3a86ff).fillTriangle(
          50 + i * 14 - 7,
          22,
          50 + i * 14,
          6,
          50 + i * 14 + 7,
          22,
        );
      eyes(48, true);
      g.lineStyle(4, OUTLINE)
        .beginPath()
        .arc(50, 68, 9, 0.2, Math.PI - 0.2)
        .strokePath();
      break;
    }
    case 'fantasma': {
      g.fillStyle(OUTLINE).fillRoundedRect(14, 12, 72, 82, { tl: 36, tr: 36, bl: 4, br: 4 });
      g.fillStyle(0xf1f3ff).fillRoundedRect(18, 16, 64, 76, { tl: 32, tr: 32, bl: 2, br: 2 });
      for (let i = 0; i < 4; i++) g.fillStyle(0xf1f3ff).fillCircle(26 + i * 16, 92, 8);
      eyes(46);
      g.fillStyle(OUTLINE).fillEllipse(50, 70, 12, 14);
      break;
    }
  }
}

function drawItem(g: Phaser.GameObjects.Graphics, kind: ItemKind): void {
  const bg = { bomb: 0x3a86ff, fire: 0xff5d5d, speed: 0x2ecc71 }[kind];
  g.fillStyle(OUTLINE).fillRoundedRect(4, 4, 92, 92, 20);
  g.fillStyle(bg).fillRoundedRect(9, 9, 82, 82, 16);
  g.fillStyle(0xffffff, 0.3).fillRoundedRect(14, 13, 72, 22, 10);
  if (kind === 'bomb') {
    g.fillStyle(OUTLINE).fillCircle(48, 56, 24);
    g.fillStyle(0xffffff, 0.5).fillCircle(40, 48, 6);
    g.lineStyle(5, 0x8d6e63).lineBetween(60, 38, 70, 26);
    g.fillStyle(0xffd23f).fillCircle(72, 24, 6);
  } else if (kind === 'fire') {
    g.fillStyle(0xffd23f).fillTriangle(50, 16, 26, 64, 74, 64).fillCircle(50, 64, 24);
    g.fillStyle(0xffffff).fillCircle(50, 66, 11).fillTriangle(50, 40, 40, 64, 60, 64);
  } else {
    // Lightning bolt.
    g.fillStyle(0xffd23f).fillPoints(
      [
        { x: 58, y: 14 },
        { x: 28, y: 56 },
        { x: 48, y: 56 },
        { x: 40, y: 88 },
        { x: 72, y: 42 },
        { x: 52, y: 42 },
      ],
      true,
    );
  }
}

/** All textures of the game; called from the Boot scene (the icon is needed by the hub). */
export function generateBombaTextures(scene: Phaser.Scene): void {
  KIDS.forEach((kid, i) => {
    bake(scene, kidKey(i, 0), 100, 128, (g) => drawKid(g, kid, 0));
    bake(scene, kidKey(i, 1), 100, 128, (g) => drawKid(g, kid, 1));
  });
  for (const k of ['bolha', 'rapido', 'fantasma'] as const)
    bake(scene, enemyKey(k), 100, 100, (g) => drawEnemy(g, k));
  for (const k of ['bomb', 'fire', 'speed'] as const)
    bake(scene, itemKey(k), 100, 100, (g) => drawItem(g, k));

  bake(scene, BTex.floor, 100, 100, (g) => g.fillStyle(0xb5e48c).fillRect(0, 0, 100, 100));
  bake(scene, BTex.floorAlt, 100, 100, (g) => g.fillStyle(0xa7dc7c).fillRect(0, 0, 100, 100));
  bake(scene, BTex.wall, 100, 100, (g) => {
    g.fillStyle(0x4a5d8a).fillRect(0, 0, 100, 100);
    g.fillStyle(0x6b80b3).fillRoundedRect(5, 5, 90, 90, 14);
    g.fillStyle(0x8fa3d6).fillRoundedRect(12, 10, 76, 30, 10);
    g.fillStyle(0x3c4c75).fillRect(5, 82, 90, 13);
  });
  bake(scene, BTex.brick, 100, 100, (g) => {
    g.fillStyle(0x9c4a1a).fillRect(0, 0, 100, 100);
    g.fillStyle(0xe07b39);
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? -25 : 0;
      for (let col = 0; col < 3; col++) g.fillRect(off + col * 50 + 3, row * 25 + 3, 44, 19);
    }
    g.fillStyle(0xffffff, 0.18).fillRect(0, 0, 100, 8);
  });
  bake(scene, BTex.bomb, 100, 100, (g) => {
    g.fillStyle(OUTLINE).fillCircle(48, 58, 34);
    g.fillStyle(0x3d3d52).fillCircle(48, 58, 30);
    g.fillStyle(0xffffff, 0.55).fillEllipse(36, 46, 16, 10);
    g.fillStyle(OUTLINE).fillRect(58, 20, 14, 14);
    g.lineStyle(5, 0x8d6e63).lineBetween(66, 22, 78, 10);
  });
  const door = (open: boolean) => (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(0x6d4c41).fillRoundedRect(10, 6, 80, 90, { tl: 40, tr: 40, bl: 4, br: 4 });
    g.fillStyle(open ? 0xfff3b0 : 0x8d6e63).fillRoundedRect(20, 16, 60, 80, {
      tl: 30,
      tr: 30,
      bl: 2,
      br: 2,
    });
    if (open) g.fillStyle(0xffffff, 0.8).fillCircle(50, 50, 14);
    else g.fillStyle(0xffd23f).fillCircle(66, 58, 6);
  };
  bake(scene, BTex.door, 100, 100, door(false));
  bake(scene, BTex.doorOpen, 100, 100, door(true));

  bake(scene, 'turma-icon', 150, 150, (g) => {
    g.fillStyle(0xffd166).fillRoundedRect(0, 0, 150, 150, 22);
    g.fillStyle(0xff4f8b)
      .fillTriangle(75, 20, 60, 75, 90, 75)
      .fillTriangle(75, 130, 60, 75, 90, 75);
    for (const [i, x, flip] of [
      [3, -2, 1],
      [1, 72, -1],
    ] as const) {
      g.save();
      g.translateCanvas(flip > 0 ? x : x + 80, 22);
      g.scaleCanvas(0.8 * flip, 0.8);
      drawKid(g, KIDS[i]!, 0);
      g.restore();
    }
  });
  bake(scene, BTex.icon, 150, 150, (g) => {
    g.fillStyle(0xb5e48c).fillRoundedRect(0, 0, 150, 150, 22);
    g.fillStyle(0x6b80b3).fillRect(0, 118, 150, 32);
    g.save();
    g.translateCanvas(10, 6);
    g.scaleCanvas(0.95, 0.95);
    drawKid(g, KIDS[0]!, 0);
    g.restore();
    g.fillStyle(OUTLINE).fillCircle(112, 104, 24);
    g.fillStyle(0x3d3d52).fillCircle(112, 104, 21);
    g.fillStyle(0xffffff, 0.5).fillEllipse(104, 96, 10, 6);
    g.lineStyle(4, 0x8d6e63).lineBetween(124, 86, 132, 74);
    g.fillStyle(0xffd23f).fillCircle(134, 72, 6);
    g.fillStyle(0xff7b00).fillCircle(134, 72, 3);
  });
}
