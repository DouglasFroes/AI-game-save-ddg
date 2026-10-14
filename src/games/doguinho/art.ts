import type Phaser from 'phaser';
import { bake, Tex as PlatformTex } from '@/platform/art/textures';

/** All art is generated at boot with Graphics/Canvas — no image files. */

export type Mood = 'idle' | 'scared' | 'happy' | 'hurt';

export const Tex = {
  ...PlatformTex,
  dog: (mood: Mood) => `dog-${mood}`,
  bee: 'bee',
  hive: 'hive',
} as const;

const DARK = 0x2b2d42;
const ORANGE = 0xf4a548;
const ORANGE_DARK = 0xd9822b;
const CREAM = 0xfff4e6;
const PINK = 0xff9eaa;
const MOUTH = 0x8b1e2d;

export function generateDoguinhoTextures(scene: Phaser.Scene): void {
  const moods: Mood[] = ['idle', 'scared', 'happy', 'hurt'];
  moods.forEach((m) => bake(scene, Tex.dog(m), 100, 96, (g) => drawDog(g, m)));
  bake(scene, Tex.bee, 44, 36, drawBee);
  bake(scene, Tex.hive, 120, 140, drawHive);
}

function drawDog(g: Phaser.GameObjects.Graphics, mood: Mood): void {
  // Ears
  g.fillStyle(ORANGE_DARK).fillTriangle(10, 44, 22, 4, 46, 26).fillTriangle(54, 26, 78, 4, 90, 44);
  g.fillStyle(PINK).fillTriangle(20, 34, 24, 14, 38, 28).fillTriangle(62, 28, 76, 14, 80, 34);
  // Head and cream face
  g.fillStyle(ORANGE).fillEllipse(50, 56, 90, 78);
  g.fillStyle(CREAM).fillEllipse(50, 70, 62, 44);
  g.fillEllipse(34, 36, 11, 7).fillEllipse(66, 36, 11, 7);

  // Eyes
  g.lineStyle(4, DARK);
  switch (mood) {
    case 'idle':
      g.fillStyle(DARK).fillCircle(35, 50, 6).fillCircle(65, 50, 6);
      g.fillStyle(0xffffff).fillCircle(37, 48, 2).fillCircle(67, 48, 2);
      break;
    case 'scared':
      g.fillStyle(0xffffff).fillCircle(34, 49, 10).fillCircle(66, 49, 10);
      g.fillStyle(DARK).fillCircle(34, 51, 4).fillCircle(66, 51, 4);
      g.lineBetween(24, 36, 42, 31).lineBetween(58, 31, 76, 36);
      break;
    case 'happy':
      g.beginPath()
        .arc(35, 53, 7, Math.PI, Math.PI * 2)
        .strokePath();
      g.beginPath()
        .arc(65, 53, 7, Math.PI, Math.PI * 2)
        .strokePath();
      g.fillStyle(PINK, 0.7).fillEllipse(24, 66, 14, 8).fillEllipse(76, 66, 14, 8);
      break;
    case 'hurt':
      g.lineBetween(29, 44, 41, 56).lineBetween(41, 44, 29, 56);
      g.lineBetween(59, 44, 71, 56).lineBetween(71, 44, 59, 56);
      break;
  }

  // Nose
  g.fillStyle(DARK).fillEllipse(50, 63, 16, 11);

  // Mouth
  g.lineStyle(3, DARK);
  switch (mood) {
    case 'idle':
      g.beginPath().arc(44, 69, 6, 0, Math.PI).strokePath();
      g.beginPath().arc(56, 69, 6, 0, Math.PI).strokePath();
      break;
    case 'scared':
      g.fillStyle(MOUTH).fillEllipse(50, 80, 14, 16);
      break;
    case 'happy':
      g.fillStyle(MOUTH).beginPath().slice(50, 70, 15, 0, Math.PI, false).fillPath();
      g.fillStyle(PINK).fillEllipse(50, 80, 12, 8);
      break;
    case 'hurt':
      g.beginPath()
        .moveTo(38, 80)
        .lineTo(44, 75)
        .lineTo(50, 80)
        .lineTo(56, 75)
        .lineTo(62, 80)
        .strokePath();
      break;
  }
}

function drawBee(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0xffffff, 0.85).fillEllipse(17, 10, 16, 12).fillEllipse(28, 9, 14, 11);
  g.lineStyle(2, 0x9ad0ff).strokeEllipse(17, 10, 16, 12).strokeEllipse(28, 9, 14, 11);
  g.fillStyle(DARK).fillTriangle(7, 19, 7, 25, 0, 22);
  g.fillStyle(0xffd23f).fillEllipse(22, 22, 34, 24);
  g.fillStyle(DARK).fillRect(14, 12, 5, 20).fillRect(23, 11, 5, 22);
  g.lineStyle(3, DARK).strokeEllipse(22, 22, 34, 24);
  g.fillStyle(DARK).fillCircle(33, 19, 3);
}

function drawHive(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x7a5230).fillRoundedRect(0, 2, 120, 12, 6);
  g.fillStyle(0x5e3d22).fillRect(56, 10, 8, 16);
  const tiers: Array<[number, number, number]> = [
    [128, 56, 20],
    [108, 88, 30],
    [82, 104, 34],
    [56, 88, 30],
    [34, 60, 26],
  ];
  tiers.forEach(([y, w, h], i) => {
    g.fillStyle(i % 2 ? 0xf6b93b : 0xe8a52c).fillEllipse(60, y, w, h);
    g.lineStyle(3, 0xb57a14).strokeEllipse(60, y, w, h);
  });
  g.fillStyle(0x3a2a14).fillEllipse(60, 92, 24, 16);
}
