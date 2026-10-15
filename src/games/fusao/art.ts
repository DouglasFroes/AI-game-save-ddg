import type Phaser from 'phaser';
import { bake, canvasTexture } from '@/platform/art/textures';
import {
  BOSSES,
  ENEMIES,
  FUSIONS,
  SKILLS,
  type BossKind,
  type CharacterId,
  type EnemyKind,
  type FusionId,
  type SkillId,
} from './core/defs';

/** Procedural neon art for FUSÃO INFINITA (no image files, no emoji). */
export const FT = {
  glow: 'fi-glow',
  dot: 'fi-dot',
  ring: 'fi-ring',
  stars: 'fi-stars',
  grid: 'fi-grid',
  spark: 'fi-spark',
  orb: 'fi-orb',
  plasma: 'fi-plasma',
  droneShot: 'fi-drone-shot',
  bullet: 'fi-bullet',
  gem: 'fi-gem',
  gemBig: 'fi-gem-big',
  heal: 'fi-heal',
  magnet: 'fi-magnet',
  chest: 'fi-chest',
  blade: 'fi-blade',
  drone: 'fi-drone',
  logo: 'fi-logo-core',
  icon: 'fusao-icon',
} as const;

export const playerKey = (c: CharacterId) => `fi-player-${c}`;
export const enemyKey = (k: EnemyKind | BossKind) => `fi-enemy-${k}`;
export const skillIcon = (id: SkillId | FusionId) => `fi-icon-${id}`;

const poly = (cx: number, cy: number, r: number, n: number, rot = 0) => {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
};
const star = (cx: number, cy: number, r1: number, r2: number, n: number, rot = -Math.PI / 2) => {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? r2 : r1;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
};

/** A neon shape: dark body, bright rim, soft halo. */
function neon(
  g: Phaser.GameObjects.Graphics,
  pts: { x: number; y: number }[],
  color: number,
  fillAlpha = 0.35,
): void {
  g.lineStyle(10, color, 0.18).strokePoints(pts, true);
  g.fillStyle(color, fillAlpha).fillPoints(pts, true);
  g.lineStyle(4, color, 1).strokePoints(pts, true);
}

function glyph(g: Phaser.GameObjects.Graphics, id: SkillId | FusionId, c: number, s: number): void {
  // Each skill gets its own simple, readable symbol inside a 64-px frame.
  g.lineStyle(5, c, 1);
  g.fillStyle(c, 1);
  const m = s / 2;
  switch (id) {
    case 'faisca':
      g.strokePoints(
        [
          { x: 38, y: 10 },
          { x: 24, y: 34 },
          { x: 36, y: 34 },
          { x: 26, y: 56 },
        ],
        false,
      );
      break;
    case 'orbe':
      g.fillCircle(m, m + 4, 14);
      g.fillTriangle(m - 10, m - 4, m, 8, m + 10, m - 4);
      break;
    case 'escudo':
      g.strokePoints(poly(m, m, 22, 6, Math.PI / 6), true);
      break;
    case 'laminas':
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        g.fillTriangle(
          m,
          m,
          m + Math.cos(a) * 24,
          m + Math.sin(a) * 24,
          m + Math.cos(a + 0.6) * 18,
          m + Math.sin(a + 0.6) * 18,
        );
      }
      break;
    case 'explosao':
      g.fillPoints(star(m, m, 24, 10, 8), true);
      break;
    case 'raio':
      g.strokePoints(
        [
          { x: 10, y: 20 },
          { x: 26, y: 30 },
          { x: 22, y: 40 },
          { x: 40, y: 34 },
          { x: 54, y: 46 },
        ],
        false,
      );
      g.fillCircle(10, 20, 4).fillCircle(54, 46, 4);
      break;
    case 'gravidade':
      for (const r of [8, 16, 24]) g.strokeCircle(m, m, r);
      break;
    case 'drones':
      g.fillTriangle(m - 16, m + 12, m, m - 16, m + 16, m + 12);
      g.fillCircle(m - 20, m - 14, 5).fillCircle(m + 20, m - 14, 5);
      break;
    case 'pulso':
      for (let i = 0; i < 3; i++)
        g.strokePoints(
          [
            { x: 14 + i * 12, y: 16 },
            { x: 26 + i * 12, y: m },
            { x: 14 + i * 12, y: 48 },
          ],
          false,
        );
      break;
    case 'nova':
      g.strokeCircle(m, m, 22);
      g.fillCircle(m, m, 7);
      break;
    case 'plasma':
      g.fillCircle(m, m, 12);
      g.strokePoints(
        [
          { x: 8, y: 14 },
          { x: 18, y: 24 },
          { x: 14, y: 30 },
        ],
        false,
      );
      g.strokePoints(
        [
          { x: 56, y: 50 },
          { x: 46, y: 40 },
          { x: 50, y: 34 },
        ],
        false,
      );
      break;
    case 'ruptura':
      g.strokePoints(poly(m, m, 16, 6, Math.PI / 6), true);
      g.strokeCircle(m, m, 26);
      break;
    case 'enxame':
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        g.fillCircle(m + Math.cos(a) * 20, m + Math.sin(a) * 20, 5);
      }
      g.strokePoints(poly(m, m, 20, 4, 0.4), true);
      break;
    case 'vortice':
      for (let i = 0; i < 3; i++)
        g.beginPath()
          .arc(m, m, 10 + i * 8, i, i + 3.5)
          .strokePath();
      break;
    case 'dimensional':
      g.strokeEllipse(m, m, 44, 18);
      g.strokeEllipse(m, m, 18, 44);
      break;
    case 'colapso':
      g.fillCircle(m, m, 9);
      g.fillPoints(star(m, m, 28, 6, 4, 0.4), true);
      break;
  }
}

export function generateFusaoTextures(scene: Phaser.Scene): void {
  canvasTexture(scene, FT.glow, 128, 128, (ctx) => {
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  });
  canvasTexture(scene, FT.stars, 512, 512, (ctx) => {
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 140; i++) {
      const a = Math.random();
      ctx.fillStyle = `rgba(${180 + Math.random() * 75},${190 + Math.random() * 65},255,${0.25 + a * 0.6})`;
      const r = a > 0.94 ? 2 : 1;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, r, r);
    }
  });
  canvasTexture(scene, FT.grid, 128, 128, (ctx) => {
    ctx.clearRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(80,110,200,0.14)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 128, 128);
    ctx.fillStyle = 'rgba(120,160,255,0.25)';
    ctx.fillRect(0, 0, 3, 3);
  });
  bake(scene, FT.dot, 16, 16, (g) => g.fillStyle(0xffffff).fillCircle(8, 8, 8));
  bake(scene, FT.spark, 24, 8, (g) => g.fillStyle(0xffffff).fillRoundedRect(0, 0, 24, 8, 4));
  bake(scene, FT.ring, 256, 256, (g) => {
    g.lineStyle(10, 0xffffff, 0.25).strokeCircle(128, 128, 120);
    g.lineStyle(4, 0xffffff, 1).strokeCircle(128, 128, 120);
  });
  bake(scene, FT.orb, 40, 40, (g) => {
    g.fillStyle(0xffd166, 0.5).fillCircle(20, 20, 19);
    g.fillStyle(0xff7b00).fillCircle(20, 20, 13);
    g.fillStyle(0xffffff).fillCircle(17, 17, 6);
  });
  bake(scene, FT.plasma, 48, 48, (g) => {
    g.fillStyle(0xff3df2, 0.45).fillCircle(24, 24, 23);
    g.fillStyle(0xff3df2).fillCircle(24, 24, 15);
    g.fillStyle(0xffffff).fillCircle(24, 24, 7);
  });
  bake(scene, FT.droneShot, 18, 18, (g) => {
    g.fillStyle(0x06d6a0, 0.5).fillCircle(9, 9, 9);
    g.fillStyle(0xffffff).fillCircle(9, 9, 4);
  });
  bake(scene, FT.bullet, 26, 26, (g) => {
    g.fillStyle(0xff4d6d, 0.45).fillCircle(13, 13, 13);
    g.fillStyle(0xff4d6d).fillCircle(13, 13, 8);
    g.fillStyle(0xffffff).fillCircle(13, 13, 3.5);
  });
  bake(scene, FT.gem, 18, 22, (g) => {
    g.fillStyle(0x4cc9f0).fillPoints(
      [
        { x: 9, y: 0 },
        { x: 18, y: 11 },
        { x: 9, y: 22 },
        { x: 0, y: 11 },
      ],
      true,
    );
    g.fillStyle(0xffffff, 0.8).fillPoints(
      [
        { x: 9, y: 3 },
        { x: 13, y: 9 },
        { x: 9, y: 12 },
      ],
      true,
    );
  });
  bake(scene, FT.gemBig, 26, 32, (g) => {
    g.fillStyle(0xc77dff).fillPoints(
      [
        { x: 13, y: 0 },
        { x: 26, y: 16 },
        { x: 13, y: 32 },
        { x: 0, y: 16 },
      ],
      true,
    );
    g.fillStyle(0xffffff, 0.8).fillPoints(
      [
        { x: 13, y: 4 },
        { x: 19, y: 13 },
        { x: 13, y: 17 },
      ],
      true,
    );
  });
  bake(scene, FT.heal, 30, 30, (g) => {
    g.fillStyle(0x5bd46f, 0.4).fillCircle(15, 15, 15);
    g.fillStyle(0x5bd46f).fillRect(11, 4, 8, 22).fillRect(4, 11, 22, 8);
  });
  bake(scene, FT.magnet, 32, 32, (g) => {
    g.lineStyle(7, 0xff4d6d).beginPath().arc(16, 14, 10, Math.PI, 0, false).strokePath();
    g.fillStyle(0xff4d6d).fillRect(3, 14, 7, 10).fillRect(22, 14, 7, 10);
    g.fillStyle(0xe0e7ff).fillRect(3, 22, 7, 6).fillRect(22, 22, 7, 6);
  });
  bake(scene, FT.chest, 52, 44, (g) => {
    g.fillStyle(0xffb703, 0.35).fillRoundedRect(0, 0, 52, 44, 10);
    g.lineStyle(4, 0xffd23f).strokeRoundedRect(4, 6, 44, 34, 8);
    g.fillStyle(0xffd23f).fillRect(4, 18, 44, 5).fillRect(22, 14, 8, 12);
  });
  bake(scene, FT.blade, 44, 44, (g) => {
    g.fillStyle(0xe0e7ff).fillPoints(star(22, 22, 21, 6, 3), true);
    g.fillStyle(0x7b8cde).fillCircle(22, 22, 5);
  });
  bake(scene, FT.drone, 40, 40, (g) => {
    neon(
      g,
      [
        { x: 20, y: 4 },
        { x: 36, y: 32 },
        { x: 20, y: 24 },
        { x: 4, y: 32 },
      ],
      0x06d6a0,
      0.6,
    );
  });

  // Players: a glowing core with each character's emblem.
  const players: Record<CharacterId, number> = {
    condutor: 0x4cc9f0,
    incendiario: 0xff7b00,
    guardiao: 0x5bd46f,
  };
  for (const [id, c] of Object.entries(players) as [CharacterId, number][]) {
    bake(scene, playerKey(id), 72, 72, (g) => {
      g.fillStyle(c, 0.25).fillCircle(36, 36, 34);
      g.lineStyle(4, c, 1).strokeCircle(36, 36, 26);
      g.fillStyle(0xffffff).fillCircle(36, 36, 14);
      g.fillStyle(c, 1);
      if (id === 'condutor')
        g.fillPoints(
          [
            { x: 40, y: 22 },
            { x: 30, y: 38 },
            { x: 37, y: 38 },
            { x: 32, y: 50 },
            { x: 44, y: 33 },
            { x: 37, y: 33 },
          ],
          true,
        );
      else if (id === 'incendiario') g.fillTriangle(36, 22, 27, 46, 45, 46);
      else g.fillPoints(poly(36, 36, 11, 6, Math.PI / 6), true);
    });
  }

  // Enemies: one silhouette each, readable in a crowd.
  const shapes: Record<EnemyKind, (s: number) => { x: number; y: number }[]> = {
    perseguidor: (s) => poly(s / 2, s / 2, s * 0.42, 3, -Math.PI / 2),
    corredor: (s) => [
      { x: s / 2, y: 2 },
      { x: s - 4, y: s / 2 },
      { x: s / 2, y: s - 2 },
      { x: 4, y: s / 2 },
    ],
    tanque: (s) => poly(s / 2, s / 2, s * 0.44, 8, Math.PI / 8),
    atirador: (s) => poly(s / 2, s / 2, s * 0.42, 5, -Math.PI / 2),
    explosivo: (s) => star(s / 2, s / 2, s * 0.46, s * 0.26, 8),
  };
  for (const kind of Object.keys(ENEMIES) as EnemyKind[]) {
    const def = ENEMIES[kind];
    const s = def.radius * 2 + 16;
    bake(scene, enemyKey(kind), s, s, (g) => {
      neon(g, shapes[kind](s), def.color);
      g.fillStyle(0xffffff, 0.9).fillCircle(s / 2, s / 2, Math.max(3, def.radius * 0.22));
    });
  }
  // Bosses.
  const bossShapes: Record<
    BossKind,
    (g: Phaser.GameObjects.Graphics, s: number, c: number) => void
  > = {
    colosso: (g, s, c) => {
      neon(g, poly(s / 2, s / 2, s * 0.44, 6), c);
      neon(g, poly(s / 2, s / 2, s * 0.26, 6, Math.PI / 6), c, 0.5);
      g.fillStyle(0xffffff).fillCircle(s / 2, s / 2, s * 0.08);
    },
    tecela: (g, s, c) => {
      neon(g, star(s / 2, s / 2, s * 0.46, s * 0.2, 8), c);
      g.lineStyle(4, c).strokeCircle(s / 2, s / 2, s * 0.3);
      g.fillStyle(0xffffff).fillCircle(s / 2, s / 2, s * 0.09);
    },
    eclipse: (g, s, c) => {
      neon(g, star(s / 2, s / 2, s * 0.47, s * 0.38, 16), c, 0.3);
      g.fillStyle(0x05060f).fillCircle(s / 2, s / 2, s * 0.3);
      g.lineStyle(5, c).strokeCircle(s / 2, s / 2, s * 0.3);
      g.fillStyle(c).fillCircle(s / 2, s / 2, s * 0.1);
    },
  };
  for (const kind of Object.keys(BOSSES) as BossKind[]) {
    const s = BOSSES[kind].radius * 2 + 30;
    bake(scene, enemyKey(kind), s, s, (g) => bossShapes[kind](g, s, BOSSES[kind].color));
  }

  // Skill and fusion icons.
  for (const id of [...Object.keys(SKILLS), ...Object.keys(FUSIONS)] as (SkillId | FusionId)[]) {
    const color = id in SKILLS ? SKILLS[id as SkillId].color : FUSIONS[id as FusionId].color;
    bake(scene, skillIcon(id), 64, 64, (g) => {
      g.fillStyle(0x0b0e24).fillRoundedRect(0, 0, 64, 64, 14);
      g.lineStyle(3, color, 0.9).strokeRoundedRect(2, 2, 60, 60, 12);
      glyph(g, id, color, 64);
    });
  }

  // Logo core and the Fliperama hub icon.
  bake(scene, FT.logo, 160, 160, (g) => {
    g.fillStyle(0xff3df2, 0.25).fillCircle(80, 80, 76);
    g.lineStyle(6, 0x4cc9f0).strokeCircle(80, 80, 58);
    g.lineStyle(6, 0xff7b00).strokeEllipse(80, 80, 150, 50);
    g.lineStyle(6, 0x5bd46f).strokeEllipse(80, 80, 50, 150);
    g.fillStyle(0xffffff).fillCircle(80, 80, 18);
  });
  bake(scene, FT.icon, 150, 150, (g) => {
    g.fillStyle(0x05060f).fillRoundedRect(0, 0, 150, 150, 22);
    g.fillStyle(0xff3df2, 0.2).fillCircle(75, 75, 60);
    g.lineStyle(5, 0x4cc9f0).strokeCircle(75, 75, 44);
    g.lineStyle(5, 0xff7b00).strokeEllipse(75, 75, 130, 44);
    g.lineStyle(5, 0x5bd46f).strokeEllipse(75, 75, 44, 130);
    g.fillStyle(0xffffff).fillCircle(75, 75, 14);
  });
}
