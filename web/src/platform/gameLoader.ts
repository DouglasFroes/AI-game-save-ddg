import type Phaser from 'phaser';
import { SceneKeys } from '@/config';
import type { GameDefinition, GameId } from '@/games/registry';
import { attachSceneTelemetry } from './sessionTracker';
import type { Services } from '@/services';

const loading = new Map<GameId, Promise<void>>();

/**
 * Downloads a game's code (its own chunk) and registers its scenes, once.
 * Keeps the first screen light: only the hub and the shared platform ship in the main bundle.
 */
export function loadGame(game: Phaser.Game, def: GameDefinition): Promise<void> {
  let pending = loading.get(def.id);
  if (!pending) {
    pending = def
      .load()
      .then((scenes) => {
        const services = game.registry.get('services') as Services | undefined;
        for (const SceneClass of scenes) {
          const scene = new SceneClass();
          const key = scene.sys.settings.key;
          if (!game.scene.getScene(key)) {
            game.scene.add(key, scene);
            const added = game.scene.getScene(key);
            if (added && services?.sessionTracker) {
              attachSceneTelemetry(added, services.sessionTracker);
            }
          }
        }
        // New scenes are appended to the render list; keep the shared overlay above them.
        game.scene.bringToTop(SceneKeys.GameOver);
      })
      .catch((err: unknown) => {
        loading.delete(def.id); // allow a retry (e.g. the network came back)
        throw err;
      });
    loading.set(def.id, pending);
  }
  return pending;
}

/** Games the player is most likely to open first: recently played ones, then the catalogue order. */
export function orderForWarmup(
  games: readonly GameDefinition[],
  recents: readonly string[],
): GameDefinition[] {
  const rank = (g: GameDefinition) => {
    const at = recents.indexOf(g.id);
    return at < 0 ? recents.length : at;
  };
  return [...games].sort((a, b) => rank(a) - rank(b));
}

interface NetworkInfo {
  saveData?: boolean;
  effectiveType?: string;
}

/** Slow links and data-saver mode: downloading ~90 games nobody asked for would only hurt. */
function shouldSkipWarmup(): boolean {
  const c = (navigator as Navigator & { connection?: NetworkInfo }).connection;
  return !!c && (c.saveData === true || c.effectiveType === 'slow-2g' || c.effectiveType === '2g');
}

/**
 * Downloads game chunks in the background without getting in the way: two at a time, each one
 * only when the browser is idle. A game opened by the player loads on its own (and first).
 */
export function warmGames(game: Phaser.Game, defs: readonly GameDefinition[], parallel = 2): void {
  if (shouldSkipWarmup()) return;
  const queue = [...defs];
  const idle = (run: () => void) =>
    typeof requestIdleCallback === 'function'
      ? requestIdleCallback(run, { timeout: 4000 })
      : window.setTimeout(run, 300);
  const next = (): void => {
    const def = queue.shift();
    if (!def) return;
    idle(() => void loadGame(game, def).then(next, next));
  };
  for (let i = 0; i < parallel; i++) next();
}
