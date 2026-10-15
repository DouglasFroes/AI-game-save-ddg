/** The save shared by the game's scenes: loaded once, written after every change. */
import { loadSave, writeSave, type KeyValue, type Save } from './core/meta';
import { audio } from './audio';

const store = (): KeyValue | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

let current: Save | null = null;
/** True when stored data was unreadable and got reset (shown once in the menu). */
export let recoveredFromCorruption = false;

export function getSave(): Save {
  if (!current) {
    const loaded = loadSave(store());
    current = loaded.save;
    recoveredFromCorruption = loaded.recovered;
    audio.setVolume(current.settings.volume);
  }
  return current;
}

export function setSave(next: Save): void {
  current = next;
  audio.setVolume(next.settings.volume);
  writeSave(store(), next);
}

export function clearRecoveredFlag(): void {
  recoveredFromCorruption = false;
}

export const QUALITY = {
  alta: { enemies: 260, particles: 1 },
  media: { enemies: 190, particles: 0.6 },
  baixa: { enemies: 130, particles: 0.3 },
} as const;
