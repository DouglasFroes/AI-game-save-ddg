/**
 * Full screen on phones. The Fullscreen API needs a user gesture, so the game asks for it on the
 * first tap (and the hub has a button to toggle it). iPhones have no Fullscreen API for pages:
 * there the way is "Adicionar à Tela de Início" (the web manifest opens it full screen).
 */

type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

const doc = () => document as FsDocument;

export const isPhone = (): boolean => window.matchMedia?.('(pointer: coarse)').matches ?? false;

/** Opened from the home screen (already without browser bars). */
export const isStandalone = (): boolean =>
  window.matchMedia?.('(display-mode: standalone), (display-mode: fullscreen)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const canFullscreen = (): boolean =>
  !!(doc().fullscreenEnabled || doc().webkitFullscreenEnabled);

export const isFullscreen = (): boolean =>
  !!(doc().fullscreenElement || doc().webkitFullscreenElement);

export async function enterFullscreen(): Promise<boolean> {
  if (isFullscreen()) return true;
  const el = document.documentElement as FsElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else await el.webkitRequestFullscreen?.();
    // Keep the phone upright where the browser allows it.
    await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })
      .lock?.('portrait')
      .catch(() => undefined);
    return isFullscreen();
  } catch {
    return false;
  }
}

export async function exitFullscreen(): Promise<void> {
  if (!isFullscreen()) return;
  try {
    if (document.exitFullscreen) await document.exitFullscreen();
    else await doc().webkitExitFullscreen?.();
  } catch {
    // Already out.
  }
}

export function toggleFullscreen(): Promise<boolean> {
  if (isFullscreen()) return exitFullscreen().then(() => false);
  return enterFullscreen();
}

/** On phones: go full screen on the first tap of the session (needs a gesture). */
export function fullscreenOnFirstTap(): void {
  if (!isPhone() || isStandalone() || !canFullscreen()) return;
  const go = () => {
    window.removeEventListener('pointerup', go);
    void enterFullscreen();
  };
  window.addEventListener('pointerup', go);
}
