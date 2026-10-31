import { forgetNotice, publishNotice } from '@/platform/notices';

/** How often an open app asks the server whether a new version exists. */
const UPDATE_CHECK_MS = 30 * 60_000;
/** If the browser has not switched to the new version by then, reload anyway. */
const RELOAD_FALLBACK_MS = 3000;
export const UPDATE_NOTICE_KEY = 'update';

let registration: ServiceWorkerRegistration | null = null;

/**
 * Switches to the downloaded version now. Works from the live banner and from the notification
 * center (which only keeps text, so it cannot hold on to the worker itself). Android sometimes
 * never fires `controllerchange` after `skipWaiting`, so the page also reloads after a moment.
 */
export function applyUpdate(): void {
  const waiting = registration?.waiting;
  forgetNotice(UPDATE_NOTICE_KEY);
  if (waiting) {
    waiting.postMessage('SKIP_WAITING');
    window.setTimeout(() => window.location.reload(), RELOAD_FALLBACK_MS);
  } else {
    // Already active (or nothing waiting): a reload picks up the new files.
    window.location.reload();
  }
}

/**
 * Registers the service worker (production builds only) and applies updates safely.
 *
 * A new version is downloaded in the background and waits. It is switched on when the player
 * taps "Atualizar" or leaves the app (tab hidden / app sent to background), and the page then
 * reloads so it never mixes old and new files — a game is never interrupted halfway.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  // On the very first visit the new worker also takes control (clients.claim); that is not an
  // update, so the page must not reload itself.
  const hadController = navigator.serviceWorker.controller !== null;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => {
        registration = reg;
        const activateWhenHidden = (worker: ServiceWorker) => {
          const apply = () => {
            if (document.visibilityState === 'hidden') worker.postMessage('SKIP_WAITING');
          };
          document.addEventListener('visibilitychange', apply);
          apply();
        };

        // The hub offers the update as a notification; it also applies itself once the app is left.
        const offerUpdate = (worker: ServiceWorker) => {
          activateWhenHidden(worker);
          publishNotice({
            key: UPDATE_NOTICE_KEY,
            kind: 'info',
            glyph: 'retry',
            sticky: true,
            title: 'Nova versão disponível',
            body: 'Atualize para ver as novidades. Seus recordes continuam salvos.',
            actions: [{ label: 'Atualizar', run: applyUpdate }],
          });
        };

        // A previous visit may have left a downloaded update waiting; otherwise this is the
        // latest version, and an old "Nova versão" entry in the notification center is stale.
        if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
        else forgetNotice(UPDATE_NOTICE_KEY);

        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state !== 'installed') return;
            if (navigator.serviceWorker.controller) offerUpdate(worker);
            else
              publishNotice({
                key: 'offline-ready',
                kind: 'success',
                glyph: 'check',
                title: 'Pronto para jogar offline',
                body: 'O Fliper agora abre mesmo sem internet.',
              });
          });
        });

        const check = () => void reg.update().catch(() => undefined);
        window.setInterval(check, UPDATE_CHECK_MS);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check();
        });
      })
      .catch((error: unknown) => console.warn('Service worker registration failed', error));
  });
}
