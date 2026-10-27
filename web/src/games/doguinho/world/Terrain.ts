import Phaser from 'phaser';
import { COLORS } from '@/config';
import { BodyLabel } from '../config';
import type { BlockDef, SpikesDef, TerrainDef } from '@/games/doguinho/data/types';

const SPIKE_HEIGHT = 34;
const SPIKE_WIDTH = 34;

/** Builds static bodies + visuals for a level. Returns every solid body (used for draw checks). */
export function buildTerrain(
  scene: Phaser.Scene,
  defs: readonly TerrainDef[],
): MatterJS.BodyType[] {
  return defs.map((d) => (d.type === 'block' ? buildBlock(scene, d) : buildSpikes(scene, d)));
}

function buildBlock(scene: Phaser.Scene, d: BlockDef): MatterJS.BodyType {
  const angle = Phaser.Math.DegToRad(d.angle ?? 0);
  const body = scene.matter.add.rectangle(d.x, d.y, d.w, d.h, {
    isStatic: true,
    angle,
    label: BodyLabel.terrain,
    friction: 0.9,
  });

  const g = scene.add.graphics({ x: d.x, y: d.y }).setRotation(angle);
  const left = -d.w / 2;
  const top = -d.h / 2;
  g.fillStyle(COLORS.dirtDark).fillRoundedRect(left, top, d.w, d.h, 16);
  g.fillStyle(COLORS.dirt).fillRoundedRect(left + 6, top + 6, d.w - 12, d.h - 12, 12);

  // Deterministic pebbles so the dirt has texture.
  g.fillStyle(COLORS.dirtDark, 0.55);
  const rng = new Phaser.Math.RandomDataGenerator([`${d.x},${d.y},${d.w}`]);
  const pebbles = Math.floor((d.w * d.h) / 9000);
  for (let i = 0; i < pebbles; i++) {
    g.fillEllipse(
      rng.between(left + 18, left + d.w - 18),
      rng.between(top + 40, top + d.h - 14),
      rng.between(10, 22),
      rng.between(6, 12),
    );
  }

  // Grass cap.
  const grassH = Math.min(26, d.h / 3);
  g.fillStyle(COLORS.grassDark).fillRoundedRect(left, top, d.w, grassH + 6, {
    tl: 16,
    tr: 16,
    bl: 8,
    br: 8,
  });
  g.fillStyle(COLORS.grass).fillRoundedRect(left, top, d.w, grassH, {
    tl: 16,
    tr: 16,
    bl: 8,
    br: 8,
  });
  return body;
}

function buildSpikes(scene: Phaser.Scene, d: SpikesDef): MatterJS.BodyType {
  const horizontal = d.dir === 'up' || d.dir === 'down';
  const sign = d.dir === 'up' || d.dir === 'left' ? -1 : 1;
  // Body slightly thinner than the art so "looks touching" == "is touching".
  const thick = SPIKE_HEIGHT - 8;
  const cx = horizontal ? d.x : d.x + (sign * thick) / 2;
  const cy = horizontal ? d.y + (sign * thick) / 2 : d.y;
  const body = scene.matter.add.rectangle(
    cx,
    cy,
    horizontal ? d.length : thick,
    horizontal ? thick : d.length,
    { isStatic: true, label: BodyLabel.spike, friction: 0.5 },
  );

  const g = scene.add.graphics();
  const count = Math.max(1, Math.round(d.length / SPIKE_WIDTH));
  const step = d.length / count;
  const start = -d.length / 2;
  for (let i = 0; i < count; i++) {
    const a = start + i * step;
    const b = a + step;
    const mid = (a + b) / 2;
    const tip = sign * SPIKE_HEIGHT;
    const tri = horizontal
      ? [d.x + a, d.y, d.x + b, d.y, d.x + mid, d.y + tip]
      : [d.x, d.y + a, d.x, d.y + b, d.x + tip, d.y + mid];
    g.fillStyle(COLORS.spike).fillTriangle(tri[0]!, tri[1]!, tri[2]!, tri[3]!, tri[4]!, tri[5]!);
    g.lineStyle(3, COLORS.spikeDark).strokeTriangle(
      tri[0]!,
      tri[1]!,
      tri[2]!,
      tri[3]!,
      tri[4]!,
      tri[5]!,
    );
  }
  return body;
}
