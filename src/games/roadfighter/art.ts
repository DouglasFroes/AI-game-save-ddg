import type Phaser from 'phaser';
import { bake } from '@/platform/art/textures';
import { CAR_H, CAR_W, FUEL_H, FUEL_W, TRUCK_H, TRUCK_W, type CarKind } from './core';

export const RFTex = {
  player: 'rf-player',
  car: (kind: CarKind) => `rf-${kind}`,
  fuel: 'rf-fuel',
  tree: 'rf-tree',
  bush: 'rf-bush',
} as const;

function drawCar(
  g: Phaser.GameObjects.Graphics,
  body: number,
  dark: number,
  stripe?: number,
): void {
  const w = CAR_W;
  const h = CAR_H;
  g.fillStyle(0x111111);
  for (const [x, y] of [
    [0, 14],
    [w - 10, 14],
    [0, h - 36],
    [w - 10, h - 36],
  ] as const) {
    g.fillRoundedRect(x, y, 10, 24, 3);
  }
  g.fillStyle(dark).fillRoundedRect(5, 2, w - 10, h - 4, 16);
  g.fillStyle(body).fillRoundedRect(7, 4, w - 14, h - 10, 14);
  if (stripe !== undefined)
    g.fillStyle(stripe)
      .fillRect(w / 2 - 6, 4, 4, h - 10)
      .fillRect(w / 2 + 2, 4, 4, h - 10);
  g.fillStyle(0x23324f).fillRoundedRect(12, 26, w - 24, 22, 6);
  g.fillStyle(0x23324f, 0.85).fillRoundedRect(13, h - 32, w - 26, 14, 5);
  g.fillStyle(0xfff3b0)
    .fillCircle(15, 8, 4)
    .fillCircle(w - 15, 8, 4);
  g.fillStyle(0xff4d4d)
    .fillRect(11, h - 9, 9, 4)
    .fillRect(w - 20, h - 9, 9, 4);
}

function drawTruck(g: Phaser.GameObjects.Graphics): void {
  const w = TRUCK_W;
  const h = TRUCK_H;
  g.fillStyle(0x111111);
  for (const y of [20, 110, 150]) g.fillRect(0, y, 10, 26).fillRect(w - 10, y, 10, 26);
  g.fillStyle(0x2f7d4f).fillRoundedRect(6, 0, w - 12, 50, 12);
  g.fillStyle(0x23324f).fillRoundedRect(13, 10, w - 26, 16, 5);
  g.fillStyle(0xdfe5ee).fillRoundedRect(5, 54, w - 10, h - 56, 8);
  g.lineStyle(3, 0xa6afc2).strokeRoundedRect(5, 54, w - 10, h - 56, 8);
  g.fillStyle(0xa6afc2)
    .fillRect(10, 90, w - 20, 4)
    .fillRect(10, 130, w - 20, 4);
}

export function generateRoadFighterTextures(scene: Phaser.Scene): void {
  bake(scene, RFTex.player, CAR_W, CAR_H, (g) => drawCar(g, 0xe63946, 0x9d1d2a, 0xffffff));
  bake(scene, RFTex.car('blue'), CAR_W, CAR_H, (g) => drawCar(g, 0x4da3ff, 0x2a6fbd));
  bake(scene, RFTex.car('yellow'), CAR_W, CAR_H, (g) => drawCar(g, 0xffd23f, 0xc79a00));
  bake(scene, RFTex.car('red'), CAR_W, CAR_H, (g) => drawCar(g, 0x9b5de5, 0x6a35ad, 0xffd23f));
  bake(scene, RFTex.car('truck'), TRUCK_W, TRUCK_H, drawTruck);
  bake(scene, RFTex.fuel, FUEL_W, FUEL_H, (g) => {
    g.fillStyle(0x9d1d2a).fillRoundedRect(2, 10, FUEL_W - 4, FUEL_H - 12, 8);
    g.fillStyle(0xe63946).fillRoundedRect(4, 12, FUEL_W - 8, FUEL_H - 18, 6);
    g.fillStyle(0x333333).fillRect(24, 2, 12, 10);
    g.lineStyle(4, 0x333333).strokeRoundedRect(8, 0, 14, 12, 4);
    g.fillStyle(0xffd23f)
      .fillCircle(FUEL_W / 2, 36, 8)
      .fillTriangle(FUEL_W / 2 - 7, 33, FUEL_W / 2 + 7, 33, FUEL_W / 2, 20);
  });
  bake(scene, RFTex.tree, 96, 96, (g) => {
    g.fillStyle(0x000000, 0.18).fillCircle(54, 54, 40);
    g.fillStyle(0x2f7d32).fillCircle(48, 48, 40);
    g.fillStyle(0x43a047).fillCircle(40, 40, 26).fillCircle(60, 52, 20);
    g.fillStyle(0x66bb6a).fillCircle(34, 32, 10);
  });
  bake(scene, RFTex.bush, 60, 40, (g) => {
    g.fillStyle(0x388e3c).fillEllipse(20, 24, 36, 28).fillEllipse(40, 22, 36, 30);
    g.fillStyle(0x66bb6a).fillCircle(22, 16, 7);
  });
}
