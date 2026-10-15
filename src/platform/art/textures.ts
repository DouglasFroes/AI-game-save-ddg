import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '@/config';

/** Shared procedural art (no image files). Each game generates its own sprites too. */
export const Tex = {
  bg: 'bg',
  dot: 'dot',
  star: 'star',
  starEmpty: 'star-empty',
  cloud: 'cloud',
  heart: 'heart',
} as const;

export function bake(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): void {
  if (scene.textures.exists(key)) return;
  const g = scene.add.graphics();
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

export function generatePlatformTextures(scene: Phaser.Scene): void {
  makeBackground(scene);
  bake(scene, Tex.dot, 16, 16, (g) => g.fillStyle(0xffffff).fillCircle(8, 8, 8));
  bake(scene, Tex.star, 64, 64, (g) => drawStar(g, 0xffd23f, 0xe09a00));
  bake(scene, Tex.starEmpty, 64, 64, (g) => drawStar(g, 0xdde3ee, 0xa6afc2));
  bake(scene, Tex.cloud, 200, 90, drawCloud);
  bake(scene, Tex.heart, 48, 44, drawHeart);
}

function makeBackground(scene: Phaser.Scene): void {
  if (scene.textures.exists(Tex.bg)) return;
  const tex = scene.textures.createCanvas(Tex.bg, GAME_WIDTH, GAME_HEIGHT);
  if (!tex) return;
  const ctx = tex.getContext();
  const sky = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
  sky.addColorStop(0, '#6cc0ff');
  sky.addColorStop(0.65, '#c9ecff');
  sky.addColorStop(1, '#eaf8ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  const hills = (base: number, amp: number, color: string, phase: number) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, GAME_HEIGHT);
    for (let x = 0; x <= GAME_WIDTH; x += 10) {
      ctx.lineTo(x, base + Math.sin(x / 110 + phase) * amp + Math.sin(x / 47 + phase) * amp * 0.3);
    }
    ctx.lineTo(GAME_WIDTH, GAME_HEIGHT);
    ctx.closePath();
    ctx.fill();
  };
  hills(860, 40, '#bfe6b4', 0.5);
  hills(930, 30, '#a6dc98', 2.1);
  tex.refresh();
}

function drawStar(g: Phaser.GameObjects.Graphics, fill: number, stroke: number): void {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 29 : 13;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(new Phaser.Math.Vector2(32 + Math.cos(a) * r, 33 + Math.sin(a) * r));
  }
  g.fillStyle(fill).fillPoints(pts, true);
  g.lineStyle(4, stroke).strokePoints(pts, true);
}

function drawCloud(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0xffffff, 0.9);
  g.fillEllipse(60, 58, 90, 50).fillEllipse(110, 44, 100, 70).fillEllipse(150, 60, 80, 44);
  g.fillRect(40, 60, 130, 24);
}

function drawHeart(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0xff4d6d);
  g.fillCircle(14, 14, 12).fillCircle(34, 14, 12);
  g.fillTriangle(3, 19, 45, 19, 24, 42);
  g.fillStyle(0xffffff, 0.5).fillCircle(11, 10, 4);
}

/** Texture drawn with the Canvas 2D API (handy for icons with text). */
export function canvasTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  draw(tex.getContext());
  tex.refresh();
}
