import type Phaser from 'phaser';
import type { GameDefinition } from '@/games/registry';
import { HUB_FONT } from '@/platform/fonts';

/**
 * "Aurora Neon": a deep ink night, drifting colour glows, glass surfaces with hairline rims,
 * and one brand gradient (cyan → violet → pink) for everything that matters.
 */
export const UI = {
  bg: 0x06070f,
  bgCss: '#06070f',
  glass: 0x12142b,
  line: 0x2a2e55,
  cyan: 0x38e1ff,
  violet: 0x8b5cf6,
  pink: 0xff5fb8,
  gold: 0xffd166,
  white: '#f5f7ff',
  soft: '#b6bcdc',
  mute: '#7a80a8',
  faint: 0x4a4f7a,
} as const;

/** The brand gradient, left to right. */
export const BRAND: readonly number[] = [UI.cyan, UI.violet, UI.pink];
/** Warmer pair used for the primary call to action. */
export const CTA: readonly number[] = [0x7c5cff, 0xc04bff, 0xff5fb8];
/** Soft glass-on-glass button. */
export const GLASS_PILL: readonly number[] = [0x2a2e55, 0x1d2040];

export type Radii = readonly [number, number, number, number];
export const ALL = (r: number): Radii => [r, r, r, r];

const rgb = (n: number) => ({ r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 });
export const css = (n: number, a = 1): string => {
  const c = rgb(n);
  return `rgba(${c.r},${c.g},${c.b},${a})`;
};
export const mix = (a: number, b: number, t: number): number => {
  const x = rgb(a);
  const y = rgb(b);
  const ch = (p: number, q: number) => Math.round(p + (q - p) * t);
  return (ch(x.r, y.r) << 16) | (ch(x.g, y.g) << 8) | ch(x.b, y.b);
};

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  [tl, tr, br, bl]: Radii,
): void {
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

/** Creates a canvas texture once (`draw` only runs the first time a key is asked for). */
export function canvasTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): string {
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.createCanvas(key, w, h);
    if (tex) {
      draw(tex.getContext());
      tex.refresh();
    }
  }
  return key;
}

/** Linear gradient across a box, with evenly spaced stops. */
function ramp(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  colors: readonly number[],
  alpha = 1,
): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  colors.forEach((c, i) =>
    g.addColorStop(colors.length === 1 ? 0 : i / (colors.length - 1), css(c, alpha)),
  );
  return g;
}

/** Small deterministic generator, so the starfield is the same on every launch. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The page backdrop: ink, large colour glows, a faint dot grid and a few stars. */
export function auroraBackground(scene: Phaser.Scene, w: number, h: number): string {
  return canvasTexture(scene, `hub-aurora-${w}x${h}`, w, h, (ctx) => {
    ctx.fillStyle = css(UI.bg);
    ctx.fillRect(0, 0, w, h);
    const blob = (x: number, y: number, r: number, color: number, a: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, css(color, a));
      g.addColorStop(1, css(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    };
    blob(w * 0.05, h * 0.06, 620, UI.violet, 0.34);
    blob(w * 1.0, h * 0.4, 520, UI.cyan, 0.15);
    blob(w * 0.1, h * 0.86, 640, UI.pink, 0.16);
    blob(w * 0.9, h * 1.02, 480, UI.violet, 0.2);
    ctx.fillStyle = 'rgba(160,170,255,0.05)';
    for (let y = 24; y < h; y += 48) {
      for (let x = 24; x < w; x += 48) ctx.fillRect(x, y, 2, 2);
    }
    const rnd = lcg(7);
    for (let i = 0; i < 70; i++) {
      const r = 0.6 + rnd() * 1.4;
      ctx.fillStyle = `rgba(255,255,255,${0.12 + rnd() * 0.4})`;
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * h, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const vignette = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.85);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  });
}

/** A white radial falloff: tint it, add-blend it, and you have a coloured glow. */
export function glowBlob(scene: Phaser.Scene): string {
  return canvasTexture(scene, 'hub-blob', 256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });
}

/** Frosted-glass surface: a faint white wash, a lit top edge and a rim that fades diagonally. */
export function glassArt(
  scene: Phaser.Scene,
  w: number,
  h: number,
  r: number | Radii,
  opts: { tint?: number; fill?: number } = {},
): string {
  const radii = typeof r === 'number' ? ALL(Math.min(r, w / 2, h / 2)) : r;
  const { tint, fill = 0.07 } = opts;
  const key = `hub-glass-${w}x${h}-${radii.join('.')}-${tint ?? 'n'}-${fill}`;
  return canvasTexture(scene, key, w, h, (ctx) => {
    roundRect(ctx, 1, 1, w - 2, h - 2, radii);
    ctx.save();
    ctx.clip();
    const wash = ctx.createLinearGradient(0, 0, w, h);
    wash.addColorStop(0, `rgba(255,255,255,${fill * 1.6})`);
    wash.addColorStop(1, `rgba(255,255,255,${fill * 0.5})`);
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);
    if (tint !== undefined) {
      const t = ctx.createLinearGradient(0, 0, w, h);
      t.addColorStop(0, css(tint, 0.28));
      t.addColorStop(1, css(tint, 0.04));
      ctx.fillStyle = t;
      ctx.fillRect(0, 0, w, h);
    }
    const lit = ctx.createLinearGradient(0, 0, 0, Math.min(h, 60));
    lit.addColorStop(0, 'rgba(255,255,255,0.10)');
    lit.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lit;
    ctx.fillRect(0, 0, w, Math.min(h, 60));
    ctx.restore();
    roundRect(ctx, 1, 1, w - 2, h - 2, radii);
    const rim = ctx.createLinearGradient(0, 0, w, h);
    rim.addColorStop(0, 'rgba(255,255,255,0.34)');
    rim.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    rim.addColorStop(1, 'rgba(255,255,255,0.18)');
    ctx.strokeStyle = rim;
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

/** Padding around pills that carry a glow, so the blur isn't clipped. */
export const GLOW_PAD = 44;

/** A glossy gradient pill; with `glow` it sits on a soft coloured halo (texture is bigger by GLOW_PAD). */
export function pillArt(
  scene: Phaser.Scene,
  w: number,
  h: number,
  colors: readonly number[],
  glow: boolean,
): string {
  const pad = glow ? GLOW_PAD : 0;
  const key = `hub-pill-${w}x${h}-${colors.join('.')}-${glow ? 'g' : 'f'}`;
  return canvasTexture(scene, key, w + pad * 2, h + pad * 2, (ctx) => {
    const r = h / 2;
    const mid = colors[Math.floor(colors.length / 2)] ?? UI.violet;
    if (glow) {
      ctx.shadowColor = css(mid, 0.75);
      ctx.shadowBlur = 36;
      ctx.shadowOffsetY = 8;
      roundRect(ctx, pad, pad, w, h, ALL(r));
      ctx.fillStyle = css(mid);
      ctx.fill();
      ctx.shadowColor = 'transparent';
    }
    roundRect(ctx, pad, pad, w, h, ALL(r));
    ctx.fillStyle = ramp(ctx, pad, 0, pad + w, 0, colors);
    ctx.fill();
    ctx.save();
    roundRect(ctx, pad, pad, w, h, ALL(r));
    ctx.clip();
    const gloss = ctx.createLinearGradient(0, pad, 0, pad + h);
    gloss.addColorStop(0, 'rgba(255,255,255,0.34)');
    gloss.addColorStop(0.5, 'rgba(255,255,255,0.04)');
    gloss.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = gloss;
    ctx.fillRect(pad, pad, w, h);
    ctx.restore();
    roundRect(ctx, pad + 1, pad + 1, w - 2, h - 2, ALL(r - 1));
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

/** A game's poster: deep colour wash, a lit rim in the game's own hue, and a shade for the text. */
export function posterArt(
  scene: Phaser.Scene,
  game: GameDefinition,
  w: number,
  h: number,
  r: Radii,
): string {
  return canvasTexture(scene, `hub-poster-${game.id}-${w}x${h}-${r.join('.')}`, w, h, (ctx) => {
    roundRect(ctx, 0, 0, w, h, r);
    ctx.save();
    ctx.clip();
    const base = ctx.createLinearGradient(0, 0, w * 0.7, h);
    base.addColorStop(0, css(mix(game.color, UI.glass, 0.45)));
    base.addColorStop(0.5, css(mix(game.shade, UI.bg, 0.45)));
    base.addColorStop(1, css(mix(game.shade, UI.bg, 0.85)));
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const cy = h * 0.38;
    const glow = ctx.createRadialGradient(w / 2, cy, 0, w / 2, cy, Math.max(w, h) * 0.5);
    glow.addColorStop(0, css(mix(game.color, 0xffffff, 0.2), 0.62));
    glow.addColorStop(1, css(game.color, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    // A diagonal sheen, like light across glass.
    const sheen = ctx.createLinearGradient(0, 0, w, h * 0.6);
    sheen.addColorStop(0, 'rgba(255,255,255,0.13)');
    sheen.addColorStop(0.35, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);
    const shade = ctx.createLinearGradient(0, h * 0.42, 0, h);
    shade.addColorStop(0, 'rgba(6,7,15,0)');
    shade.addColorStop(1, 'rgba(6,7,15,0.92)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    roundRect(ctx, 1.5, 1.5, w - 3, h - 3, r);
    const rim = ctx.createLinearGradient(0, 0, w * 0.6, h);
    rim.addColorStop(0, css(mix(game.color, 0xffffff, 0.55), 0.85));
    rim.addColorStop(0.5, css(game.color, 0.18));
    rim.addColorStop(1, css(game.color, 0.06));
    ctx.strokeStyle = rim;
    ctx.lineWidth = 3;
    ctx.stroke();
  });
}

/** The featured-game card: same language as a poster, plus orbit lines around the icon stage. */
export function heroArt(
  scene: Phaser.Scene,
  game: GameDefinition,
  w: number,
  h: number,
  stage: { x: number; y: number },
): string {
  return canvasTexture(scene, `hub-hero-${game.id}-${w}x${h}`, w, h, (ctx) => {
    const r = ALL(40);
    roundRect(ctx, 0, 0, w, h, r);
    ctx.save();
    ctx.clip();
    const base = ctx.createLinearGradient(0, 0, w, h);
    base.addColorStop(0, css(mix(game.color, UI.glass, 0.35)));
    base.addColorStop(0.55, css(mix(game.shade, UI.bg, 0.5)));
    base.addColorStop(1, css(mix(game.shade, UI.bg, 0.9)));
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const halo = ctx.createRadialGradient(stage.x, stage.y, 0, stage.x, stage.y, 330);
    halo.addColorStop(0, css(mix(game.color, 0xffffff, 0.25), 0.7));
    halo.addColorStop(0.5, css(game.color, 0.16));
    halo.addColorStop(1, css(game.color, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 1.5;
    for (const [i, rad] of [140, 205, 270, 335].entries()) {
      ctx.strokeStyle = `rgba(255,255,255,${0.13 - i * 0.025})`;
      ctx.beginPath();
      ctx.arc(stage.x, stage.y, rad, 0, Math.PI * 2);
      ctx.stroke();
    }
    const sheen = ctx.createLinearGradient(0, 0, w * 0.8, h * 0.5);
    sheen.addColorStop(0, 'rgba(255,255,255,0.12)');
    sheen.addColorStop(0.4, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);
    const shade = ctx.createLinearGradient(0, h * 0.34, 0, h);
    shade.addColorStop(0, 'rgba(6,7,15,0)');
    shade.addColorStop(0.55, 'rgba(6,7,15,0.55)');
    shade.addColorStop(1, 'rgba(6,7,15,0.9)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    roundRect(ctx, 1.5, 1.5, w - 3, h - 3, r);
    const rim = ctx.createLinearGradient(0, 0, w, h);
    rim.addColorStop(0, css(mix(game.color, 0xffffff, 0.6), 0.9));
    rim.addColorStop(0.45, css(game.color, 0.2));
    rim.addColorStop(1, css(UI.violet, 0.3));
    ctx.strokeStyle = rim;
    ctx.lineWidth = 3;
    ctx.stroke();
  });
}

/** Wordmark, one letter at a time so it can be tracked out; drawn at 2× and shown at half size. */
export function logoArt(scene: Phaser.Scene, text: string): { key: string; w: number; h: number } {
  const size = 34;
  const track = 5;
  const key = `hub-logo-${text}`;
  const font = `800 ${size}px ${HUB_FONT}`;
  const probe = document.createElement('canvas').getContext('2d');
  let width = 0;
  if (probe) {
    probe.font = font;
    width = [...text].reduce((sum, ch) => sum + probe.measureText(ch).width + track, -track);
  }
  const w = Math.ceil(width) + 8;
  const h = size + 16;
  canvasTexture(scene, key, w * 2, h * 2, (ctx) => {
    ctx.scale(2, 2);
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ramp(ctx, 0, 0, w, 0, [0xffffff, 0xb9c4ff, UI.cyan]);
    ctx.shadowColor = css(UI.violet, 0.7);
    ctx.shadowBlur = 14;
    let x = 4;
    for (const ch of text) {
      ctx.fillText(ch, x, h / 2 + 1);
      x += ctx.measureText(ch).width + track;
    }
  });
  return { key, w, h };
}

/** Floating tab dock: dark glass with a lit rim and a deep soft shadow underneath. */
export function dockArt(scene: Phaser.Scene, w: number, h: number): { key: string; pad: number } {
  const pad = 40;
  const key = `hub-dock-${w}x${h}`;
  canvasTexture(scene, key, w + pad * 2, h + pad * 2, (ctx) => {
    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur = 34;
    ctx.shadowOffsetY = 12;
    roundRect(ctx, pad, pad, w, h, ALL(h / 2));
    ctx.fillStyle = 'rgba(14,16,36,0.9)';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.save();
    roundRect(ctx, pad, pad, w, h, ALL(h / 2));
    ctx.clip();
    const lit = ctx.createLinearGradient(0, pad, 0, pad + h);
    lit.addColorStop(0, 'rgba(255,255,255,0.10)');
    lit.addColorStop(0.5, 'rgba(255,255,255,0.01)');
    ctx.fillStyle = lit;
    ctx.fillRect(pad, pad, w, h);
    ctx.restore();
    roundRect(ctx, pad + 1, pad + 1, w - 2, h - 2, ALL(h / 2 - 1));
    const rim = ctx.createLinearGradient(pad, pad, pad + w, pad + h);
    rim.addColorStop(0, 'rgba(255,255,255,0.32)');
    rim.addColorStop(0.5, 'rgba(255,255,255,0.07)');
    rim.addColorStop(1, 'rgba(255,255,255,0.2)');
    ctx.strokeStyle = rim;
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  return { key, pad };
}

/** A vertical fade from the page colour to clear (or back), to melt content into the edges. */
export function fadeArt(scene: Phaser.Scene, w: number, h: number, fromTop: boolean): string {
  return canvasTexture(scene, `hub-fade-${w}x${h}-${fromTop ? 't' : 'b'}`, w, h, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, css(UI.bg, fromTop ? 0.96 : 0));
    g.addColorStop(fromTop ? 0.55 : 0.45, css(UI.bg, fromTop ? 0.7 : 0.72));
    g.addColorStop(1, css(UI.bg, fromTop ? 0 : 0.97));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}
