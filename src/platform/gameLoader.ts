import type Phaser from 'phaser';
import { SceneKeys } from '@/config';
import type { GameDefinition, GameId } from '@/games/registry';

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
        for (const SceneClass of scenes) {
          const scene = new SceneClass();
          const key = scene.sys.settings.key;
          if (!game.scene.getScene(key)) game.scene.add(key, scene);
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
