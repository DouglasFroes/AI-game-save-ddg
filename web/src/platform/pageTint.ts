import Phaser from 'phaser';
import { GAME_HEIGHT } from '@/config';

/**
 * Phones taller than 9:16 leave a band above (and a sliver below) the 720×1280 game. Instead of
 * black, the page takes the colour of the scene's own top and bottom edge, so the band reads as
 * part of the game. The hub fills the whole screen and sets its own background.
 */

const HUB_COLOR = '#06070f';
const POLL_MS = 400;
/** Let a scene finish its fade-in before its edges are sampled. */
const SETTLE_MS = 450;
const LATE_MS = 2000;

const css = (c: Phaser.Display.Color): string => `rgb(${c.red}, ${c.green}, ${c.blue})`;

/** Reads one pixel of the rendered frame; null when it is see-through (e.g. Grau 3D). */
function readPixel(game: Phaser.Game, x: number, y: number): Promise<string | null> {
  return new Promise((resolve) => {
    game.renderer.snapshotPixel(x, y, (snapshot) => {
      const ok = snapshot instanceof Phaser.Display.Color && snapshot.alpha >= 250;
      resolve(ok ? css(snapshot) : null);
    });
  });
}

function paint(top: string | null, bottom: string | null): void {
  // The bottom colour is a plain background-colour, which paints the whole screen (a gradient
  // only covers the html box, and iOS shows white past it). A thin strip of the top colour sits
  // behind the status bar.
  const background = top
    ? `linear-gradient(${top}, ${top}) top left / 100% max(env(safe-area-inset-top), 1px) no-repeat, ${bottom ?? top}`
    : '';
  document.documentElement.style.background = background;
  // index.html paints the body navy; it must not cover the colour set on html.
  document.body.style.background = top ? 'transparent' : '';
  // The browser's own bars (Android Chrome) follow the top colour.
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta && top) meta.content = top;
}

/** Keeps the page background in step with whichever scene is showing. */
export function bindPageTint(game: Phaser.Game): void {
  let shown = '';
  let token = 0;
  window.setInterval(() => {
    // The hub paints its own background (it fills the screen, so no band shows).
    if (document.documentElement.classList.contains('hub')) {
      shown = '';
      document
        .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
        ?.setAttribute('content', HUB_COLOR);
      return;
    }
    const key = game.scene
      .getScenes(true)
      .map((s) => s.scene.key)
      .join('+');
    if (!key || key === shown) return;
    shown = key;
    const mine = ++token;
    const sample = () => {
      if (mine !== token) return;
      // The renderer keeps one pending snapshot at a time, so the two edges are read in turn.
      void (async () => {
        const top = await readPixel(game, 2, 2);
        const bottom = await readPixel(game, 2, GAME_HEIGHT - 3);
        if (mine === token && !document.documentElement.classList.contains('hub')) {
          paint(top, bottom);
        }
      })();
    };
    // Read again later: a scene that fades or counts down in may not have drawn its edges yet.
    window.setTimeout(sample, SETTLE_MS);
    window.setTimeout(sample, LATE_MS);
  }, POLL_MS);
}
