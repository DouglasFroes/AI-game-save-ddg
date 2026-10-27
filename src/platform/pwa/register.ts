import { publishNotice } from '@/platform/notices';

/** How often an open app asks the server whether a new version exists. */
const UPDATE_CHECK_MS = 30 * 60_000;

/**
 * Registers the service worker (production builds only) and applies updates safely.
 *
 * A new version is downloaded in the background and waits. It is switched on when the player
 * leaves the app (tab hidden / app sent to background), and the page then reloads so it never
 * mixes old and new files — a game is never interrupted halfway.
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
      .then((registration) => {
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
            key: 'update',
            kind: 'info',
            glyph: 'retry',
            sticky: true,
            title: 'Nova versão disponível',
            body: 'Atualize para ver as novidades. Seus recordes continuam salvos.',
            actions: [{ label: 'Atualizar', run: () => worker.postMessage('SKIP_WAITING') }],
          });
        };

        // A previous visit may have left a downloaded update waiting.
        if (registration.waiting && navigator.serviceWorker.controller) {
          offerUpdate(registration.waiting);
        }
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
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

        const check = () => void registration.update().catch(() => undefined);
        window.setInterval(check, UPDATE_CHECK_MS);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check();
        });
      })
      .catch((error: unknown) => console.warn('Service worker registration failed', error));
  });
}
