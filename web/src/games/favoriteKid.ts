import { KIDS } from '@/games/bomba/art';

const KEY = 'corre-kid';

/** The kid the player picked last (in any turma game), or a random one. */
export function favoriteKid(): number {
  try {
    const raw = localStorage.getItem(KEY);
    const i = Number(raw);
    if (raw !== null && Number.isInteger(i) && i >= 0 && i < KIDS.length) return i;
  } catch {
    // Storage unavailable: fall through.
  }
  return Math.floor(Math.random() * KIDS.length);
}

export function saveFavoriteKid(i: number): void {
  try {
    localStorage.setItem(KEY, String(i));
  } catch {
    // Not remembered in private mode.
  }
}
