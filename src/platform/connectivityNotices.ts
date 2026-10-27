import { publishNotice, retractNotice } from '@/platform/notices';

interface Env {
  addEventListener(type: 'offline' | 'online', listener: () => void): void;
  navigator?: { onLine: boolean };
}

const KEY = 'connection';

/**
 * Tells the player when the connection drops (their scores keep being saved on the device) and
 * withdraws that notice if the connection is back before it was ever shown.
 */
export function bindConnectivityNotices(env: Env = window): void {
  const offline = () =>
    publishNotice({
      key: KEY,
      kind: 'warn',
      glyph: 'globe',
      title: 'Você está offline',
      body: 'Pode continuar jogando: seus recordes ficam salvos e sobem quando a internet voltar.',
    });
  env.addEventListener('offline', offline);
  env.addEventListener('online', () => retractNotice(KEY));
  if (env.navigator && !env.navigator.onLine) offline();
}
