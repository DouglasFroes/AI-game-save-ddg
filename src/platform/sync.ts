import type { Services } from '@/services';

/** How often to retry while the page stays open (the browser's "online" event isn't always reliable). */
const RETRY_MS = 60_000;

interface Env {
  addEventListener(type: 'online', listener: () => void): void;
  setInterval(handler: () => void, ms: number): unknown;
  navigator?: { onLine: boolean };
}

interface Doc {
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  readonly visibilityState: string;
}

/**
 * Sends what was played offline (scores and play sessions) as soon as the device can reach the
 * server: at startup, when the browser reports it is back online, when the tab becomes visible
 * again, and on a slow timer as a safety net. Everything is saved on the device first, so nothing
 * is lost while offline. Returns a function that runs one sync on demand.
 */
export function bindConnectivitySync(
  services: Pick<Services, 'leaderboard' | 'telemetry'>,
  env: Env = window,
  doc: Doc = document,
): () => Promise<number> {
  const sync = async (): Promise<number> => {
    if (env.navigator && !env.navigator.onLine) return 0;
    const [scores, sessions] = await Promise.all([
      services.leaderboard.flush(),
      services.telemetry.flush(),
    ]);
    return scores + sessions;
  };
  const run = () => void sync();
  env.addEventListener('online', run);
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'visible') run();
  });
  env.setInterval(run, RETRY_MS);
  run();
  return sync;
}
