import Phaser from 'phaser';

export type IconKind =
  | 'star'
  | 'starOutline'
  | 'trophy'
  | 'share'
  | 'speaker'
  | 'speakerOff'
  | 'expand'
  | 'user'
  | 'pencil'
  | 'play'
  | 'close'
  | 'crown';

type Pt = readonly [number, number];

function poly(g: Phaser.GameObjects.Graphics, s: number, pts: readonly Pt[]): void {
  g.fillPoints(
    pts.map(([x, y]) => new Phaser.Geom.Point(x * s, y * s)),
    true,
  );
}

function starPoints(outer: number, inner: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([Math.cos(a) * r, Math.sin(a) * r + 0.03]);
  }
  return pts;
}

/**
 * Flat vector icon centred on (x, y), `size` px wide. Drawn with Graphics so it scales crisply and
 * takes any colour (no emoji: those change shape from one phone to another).
 */
export function drawIcon(
  scene: Phaser.Scene,
  kind: IconKind,
  x: number,
  y: number,
  size: number,
  color: number,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics({ x, y });
  const s = size;
  const line = Math.max(2, s * 0.1);
  g.fillStyle(color).lineStyle(line, color);
  switch (kind) {
    case 'star':
      poly(g, s, starPoints(0.5, 0.22));
      break;
    case 'starOutline': {
      const pts = starPoints(0.44, 0.2);
      g.strokePoints(
        [...pts, pts[0]!].map(([px, py]) => new Phaser.Geom.Point(px * s, py * s)),
        false,
      );
      break;
    }
    case 'crown':
      poly(g, s, [
        [-0.45, 0.3],
        [-0.5, -0.25],
        [-0.22, 0],
        [0, -0.4],
        [0.22, 0],
        [0.5, -0.25],
        [0.45, 0.3],
      ]);
      break;
    case 'trophy':
      poly(g, s, [
        [-0.3, -0.4],
        [0.3, -0.4],
        [0.24, 0.05],
        [0.1, 0.16],
        [-0.1, 0.16],
        [-0.24, 0.05],
      ]);
      g.fillRect(-0.06 * s, 0.14 * s, 0.12 * s, 0.14 * s);
      g.fillRoundedRect(-0.22 * s, 0.26 * s, 0.44 * s, 0.12 * s, 0.04 * s);
      g.beginPath()
        .arc(-0.3 * s, -0.2 * s, 0.14 * s, Math.PI * 0.5, Math.PI * 1.5)
        .strokePath();
      g.beginPath()
        .arc(0.3 * s, -0.2 * s, 0.14 * s, -Math.PI * 0.5, Math.PI * 0.5)
        .strokePath();
      break;
    case 'share': {
      const a: Pt = [-0.3, 0];
      const b: Pt = [0.3, -0.32];
      const c: Pt = [0.3, 0.32];
      g.lineBetween(a[0] * s, a[1] * s, b[0] * s, b[1] * s);
      g.lineBetween(a[0] * s, a[1] * s, c[0] * s, c[1] * s);
      for (const [px, py] of [a, b, c]) g.fillCircle(px * s, py * s, 0.15 * s);
      break;
    }
    case 'speaker':
    case 'speakerOff':
      poly(g, s, [
        [-0.45, -0.14],
        [-0.25, -0.14],
        [0, -0.36],
        [0, 0.36],
        [-0.25, 0.14],
        [-0.45, 0.14],
      ]);
      if (kind === 'speaker') {
        g.beginPath()
          .arc(0.02 * s, 0, 0.22 * s, -0.9, 0.9)
          .strokePath();
        g.beginPath()
          .arc(0.02 * s, 0, 0.42 * s, -0.8, 0.8)
          .strokePath();
      } else {
        g.lineBetween(0.14 * s, -0.16 * s, 0.46 * s, 0.16 * s);
        g.lineBetween(0.46 * s, -0.16 * s, 0.14 * s, 0.16 * s);
      }
      break;
    case 'expand': {
      const k = 0.46;
      const arm = 0.22;
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const) {
        g.lineBetween(sx * k * s, sy * k * s, sx * (k - arm) * s, sy * k * s);
        g.lineBetween(sx * k * s, sy * k * s, sx * k * s, sy * (k - arm) * s);
      }
      break;
    }
    case 'user':
      g.fillCircle(0, -0.16 * s, 0.22 * s);
      g.beginPath()
        .arc(0, 0.5 * s, 0.4 * s, Math.PI, 0)
        .fillPath();
      break;
    case 'pencil':
      g.lineStyle(s * 0.2, color);
      g.lineBetween(-0.28 * s, 0.28 * s, 0.24 * s, -0.24 * s);
      poly(g, s, [
        [-0.44, 0.44],
        [-0.4, 0.2],
        [-0.2, 0.4],
      ]);
      break;
    case 'play':
      poly(g, s, [
        [-0.3, -0.42],
        [0.46, 0],
        [-0.3, 0.42],
      ]);
      break;
    case 'close':
      g.lineStyle(s * 0.14, color);
      g.lineBetween(-0.32 * s, -0.32 * s, 0.32 * s, 0.32 * s);
      g.lineBetween(0.32 * s, -0.32 * s, -0.32 * s, 0.32 * s);
      break;
  }
  return g;
}
